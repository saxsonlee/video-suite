/**
 * dsh-video-project — 单镜头草图（故事板线稿）生成
 *
 * 用途：分镜定稿后，用户对某个镜头的「相机位置 / 景别」拿不准时，只画这一个镜头：
 * 用中转站的图像生成模型输出一张黑白铅笔线稿，给用户确认构图；确认后（或看完说哪里改）
 * 再进入视频生成，避免直接生成视频才发现机位不对、白花钱。
 *
 * 能力与配置（优先级从高到低）：
 * 1. 环境变量 VIDEO_IMAGE_BASE_URL / VIDEO_IMAGE_API_KEY / VIDEO_IMAGE_MODEL；
 * 2. ~/.dsh/video-project/config.json 的 imageGen: { baseUrl, apiKey, model }；
 * 3. 共享能力文件 ~/.dsh/video-capabilities.json 的 imageGeneration（生成插件探测，含 baseUrl 与模型清单，不含 key）；
 * 4. 若安装了 dsh-seedance-studio，回退读它的设置文件（~/.dsh/storages/seedance-studio/settings.json
 *    的 RELAY_BASE_URL / RELAY_API_KEY，可选协作；没装或没配则跳过）。
 *
 * 没有可用配置时 sketchShot 会抛出 IMAGE_GEN_UNAVAILABLE / IMAGE_GEN_UNCONFIGURED，
 * 工具据此提示「当前没有图像生成能力，草图分镜功能已关闭」。
 * @module dsh-video-project/server/imagegen
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readSharedCapabilities, readProjectConfig } from './capabilities.js'

/** 草图落盘目录名（项目目录下）。 */
export const SKETCH_DIR_NAME = 'Storyboards'

/** 默认图像生成超时（毫秒）。 */
export const DEFAULT_IMAGE_TIMEOUT_MS = 120000

/** 首选图像模型（按质量/可用性排序）。 */
export const PREFERRED_IMAGE_MODELS = [
  'MiniMax-H3-Image',
  'gpt-image-2.5',
  'gpt-image-2',
  'gpt-image-1.5',
  'gpt-image-2.5-flare',
  'gpt-image-2.5-sunburst',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-3.1-flash-image-preview',
  'gemini-nano-banana-2.1',
  'seedream-4',
  'seedream-3.5',
  'flux-pro'
]

/** 角色外观栏位中文标签（与 projects.js 的 CHARACTER_FIELDS 保持一致，避免循环依赖）。 */
const CHARACTER_LABELS = {
  age: '年龄',
  face: '长相',
  hair: '发型/发色',
  costume: '服装',
  body: '体型',
  signature: '标志性特征'
}

function homeDir(env) {
  const home = env && (env.USERPROFILE || env.HOME)
  if (home) return home
  try { return os.homedir() } catch (error) { return process.cwd() }
}

function readJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    const value = JSON.parse(text)
    return value && typeof value === 'object' ? value : null
  } catch (error) {
    return null
  }
}

function asText(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function firstNonEmpty() {
  for (let index = 0; index < arguments.length; index += 1) {
    const text = asText(arguments[index])
    if (text) return text
  }
  return ''
}

function imageGenError(message, code) {
  const error = new Error(message)
  error.name = 'ImageGenError'
  error.code = code || 'IMAGE_GEN'
  return error
}

/**
 * 读 dsh-seedance-studio 的设置文件（可选协作；没装/没配返回空串）。
 * @returns {{filePath:string, relayBaseUrl:string, relayApiKey:string}}
 */
export function readSeedanceSettings(env = process.env) {
  const filePath = path.join(homeDir(env), '.dsh', 'storages', 'seedance-studio', 'settings.json')
  const payload = readJson(filePath) || {}
  const relay = payload.relay && typeof payload.relay === 'object' ? payload.relay : {}
  return {
    filePath,
    relayBaseUrl: firstNonEmpty(payload.RELAY_BASE_URL, relay.baseUrl),
    relayApiKey: firstNonEmpty(payload.RELAY_API_KEY, relay.apiKey)
  }
}

/** 从可用模型清单里挑首选图像模型（没有则返回清单第一项或空串）。 */
export function pickDefaultImageModel(models = []) {
  const list = Array.isArray(models) ? models.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : []
  for (const preferred of PREFERRED_IMAGE_MODELS) {
    if (list.indexOf(preferred) !== -1) return preferred
  }
  return list.length ? list[0] : ''
}

/**
 * 解析图像生成配置（含 key；不要原样返回给模型/渲染）。
 *
 * 重要：模型必须由用户指定（界面/配置文件/环境变量），不自动挑选、不自动启用；
 * 共享能力文件里的 models 只作为「候选清单」用于界面下拉。
 * @returns {{capable:boolean, enabled:boolean, baseUrl:string, apiKey:string, model:string, candidates:string[], source:string, reason:string}}
 */
export function resolveImageGenConfig(options = {}) {
  const env = options.env || process.env
  const shared = options.shared !== undefined ? options.shared : readSharedCapabilities({ env })
  const projectConfig = options.config !== undefined ? options.config : (readProjectConfig({ env }).payload || {})
  const configImage = projectConfig && projectConfig.imageGen && typeof projectConfig.imageGen === 'object' ? projectConfig.imageGen : {}
  const sharedImage = shared && shared.payload && shared.payload.imageGeneration && typeof shared.payload.imageGeneration === 'object'
    ? shared.payload.imageGeneration
    : {}
  const seedance = readSeedanceSettings(env)
  const envCapable = asText(env.VIDEO_IMAGE_CAPABLE).toLowerCase()
  const envEnabled = envCapable === '1' || envCapable === 'true'
  const enabled = envEnabled || configImage.enabled === true || configImage.capable === true
  const candidates = Array.isArray(sharedImage.models)
    ? sharedImage.models.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : []
  const baseUrl = firstNonEmpty(env.VIDEO_IMAGE_BASE_URL, configImage.baseUrl, sharedImage.baseUrl, seedance.relayBaseUrl)
  const apiKey = firstNonEmpty(env.VIDEO_IMAGE_API_KEY, configImage.apiKey, seedance.relayApiKey)
  // 只取用户指定的模型（环境变量或设置里选的），绝不自动挑
  const model = firstNonEmpty(env.VIDEO_IMAGE_MODEL, configImage.model)
  let source = '未配置'
  if (asText(env.VIDEO_IMAGE_BASE_URL) || asText(env.VIDEO_IMAGE_API_KEY) || asText(env.VIDEO_IMAGE_MODEL)) source = '环境变量 VIDEO_IMAGE_*'
  else if (asText(configImage.baseUrl) || asText(configImage.apiKey) || asText(configImage.model)) source = 'video-project config.json imageGen'
  else if (asText(sharedImage.baseUrl)) source = '共享能力文件 imageGeneration（生成插件探测，仅候选）'
  else if (seedance.relayBaseUrl) source = 'dsh-seedance-studio 设置（可选协作）'
  const capable = Boolean(enabled && baseUrl && apiKey && model)
  const missing = []
  if (!enabled) missing.push('未启用草图分镜（在视频项目设置里勾选启用）')
  if (!model) missing.push('未选择图像模型（在设置里从候选清单选择，不会自动替你选）')
  if (!baseUrl) missing.push('中转站地址 baseUrl')
  if (!apiKey) missing.push('API Key（可在设置里填，或由生成插件提供）')
  return {
    capable,
    enabled,
    baseUrl,
    apiKey,
    model,
    candidates,
    source,
    reason: capable ? '' : '缺少' + missing.join('、')
  }
}

/** 解析画面比例（支持 9:16、16:9、1:1、4:3、3:4、21:9；缺省按 9:16 竖屏）。 */
function parseRatio(ratio) {
  const text = asText(ratio).toLowerCase().replace(/：/g, ':')
  const match = text.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/)
  if (!match) return [9, 16]
  const width = Number(match[1])
  const height = Number(match[2])
  if (!(width > 0) || !(height > 0)) return [9, 16]
  return [width, height]
}

/** 解析分辨率短边像素（720p→720、1080p→1080、480p→480；也接受 1280x720 / 720 等写法；缺省 720）。 */
function parseResolution(resolution) {
  const text = asText(resolution).toLowerCase()
  const match = text.match(/(\d{3,4})\s*[pP]?/)
  if (match) {
    const value = Number(match[1])
    if (value >= 320 && value <= 4320) return value
  }
  return 720
}

/**
 * 草图输出尺寸：跟随项目 baseline 声明的视频分辨率 + 画面比例（不是写死的固定尺寸）。
 * - 视频目标尺寸 = 按比例换算、短边取分辨率（如 9:16 + 720p → 720x1280；16:9 + 1080p → 1920x1080）；
 * - gpt-image / dall-e 系列只支持固定尺寸，按比例就近映射（竖 1024x1536 / 横 1536x1024 / 方 1024x1024）；
 * - 其他模型直接按视频尺寸请求。
 */
export function resolveSketchSize(baseline, model) {
  const value = typeof baseline === 'string' ? { ratio: baseline } : (baseline && typeof baseline === 'object' ? baseline : {})
  const [ratioWidth, ratioHeight] = parseRatio(value.ratio)
  const shortSide = parseResolution(value.resolution)
  let width
  let height
  if (ratioWidth >= ratioHeight) {
    height = shortSide
    width = Math.round((shortSide * ratioWidth) / ratioHeight)
  } else {
    width = shortSide
    height = Math.round((shortSide * ratioHeight) / ratioWidth)
  }
  const videoSize = width + 'x' + height
  const modelName = asText(model).toLowerCase()
  // MiniMax 只接受它自己的尺寸集合：方形 1024x1024、竖 1152x2048（横用 2048x1152）
  if (/minimax/.test(modelName)) {
    if (height > width) return '1152x2048'
    if (width > height) return '2048x1152'
    return '1024x1024'
  }
  if (/gpt-image|dall-e|dalle/.test(modelName)) {
    if (height > width) return '1024x1536'
    if (width > height) return '1536x1024'
    return '1024x1024'
  }
  return videoSize
}

/**
 * 构建草图提示词：只用「已保存的分镜脚本字段 + 人物卡」，不接受调用方附加的自由文本
 * （防止智能体临时加内容/改画面）；输出单镜头单张黑白线稿。
 */
/** 三视图落盘目录名（项目目录下）。 */
export const LOOK_DIR_NAME = 'Look'

/**
 * 人物三视图提示词：正/侧/背三个视角并排同一张图，纯色背景、全身、无文字。
 * @param {object} character - 人物卡（含 identity/looks）
 * @param {object} look - 指定形象（缺省用第一套）
 * @param {object} project - 项目（style/styleCard 可选）
 */
/** 区域设定图落盘目录名（项目目录下）。 */
export const AREA_DIR_NAME = 'Area'

/**
 * 区域/场地设定图提示词：场景概念图（透视），体现布局/标志物/光线/贯穿道具。
 * @param {object} area - 区域设定
 * @param {object} project - 项目（style/baseline/styleCard/sceneMap）
 */
export function buildAreaSheetPrompt(area, project = {}) {
  const zone = area && typeof area === 'object' ? area : {}
  const lines = []
  lines.push('场景/场地设定图（场景概念图，用于统一多镜头空间关系）：一张透视场景概念图，展示该场地的整体空间、主要标志物与光线氛围；不要人物特写、不要文字、不要水印、不要分格拼贴。')
  if (project && (project.style || (project.baseline && project.baseline.styleCard) || (project.sceneMap && project.sceneMap.environment))) {
    const style = [project.style, project.baseline && project.baseline.styleCard, project.sceneMap && project.sceneMap.environment].filter(Boolean).join('；')
    if (style) lines.push('【整体风格】' + style)
  }
  lines.push('【场地名】' + (zone.name || zone.id || '场地'))
  if (zone.description) lines.push('【场地描述】' + zone.description)
  if (zone.layout) lines.push('【空间布局（必须与后续镜头一致）】' + zone.layout)
  if (Array.isArray(zone.landmarks) && zone.landmarks.length) lines.push('【标志物（画面里要能认出来）】' + zone.landmarks.join('、'))
  if (zone.lighting) lines.push('【光线/色调】' + zone.lighting)
  if (Array.isArray(zone.props) && zone.props.length) lines.push('【贯穿道具】' + zone.props.join('、'))
  lines.push('【构图要求】能看清入口/中心/标志物的位置关系；同一区域后续所有镜头必须沿用这张图的空间与光源。')
  return lines.join('\n')
}

export function buildCharacterSheetPrompt(character, look, project = {}) {
  const char = character && typeof character === 'object' ? character : {}
  const identity = char.identity && typeof char.identity === 'object' ? char.identity : {}
  const looks = Array.isArray(char.looks) ? char.looks : []
  const target = look || looks[0] || {}
  const views = target.views && typeof target.views === 'object' ? target.views : {}
  const lines = []
  lines.push('人物三视图设定图（角色设定稿）：同一角色的正面（facing viewer）、侧面（profile）、背面（back view）三个视角从左到右并排，全身站姿，纯浅灰纯色背景，均匀柔和棚拍光，无文字、无水印、无其他人物、无场景、无分格边框。')
  if (project && (project.style || project.baseline && project.baseline.styleCard)) {
    lines.push('【整体风格】' + [project.style, project.baseline && project.baseline.styleCard].filter(Boolean).join('；'))
  }
  lines.push('【角色名】' + (char.name || '角色'))
  const identityParts = []
  if (identity.age) identityParts.push('年龄：' + identity.age)
  if (identity.face) identityParts.push('长相：' + identity.face)
  if (identity.hairBase) identityParts.push('发型根基：' + identity.hairBase)
  if (identity.body) identityParts.push('体型：' + identity.body)
  if (identity.signature) identityParts.push('标志性特征：' + identity.signature)
  if (identityParts.length) lines.push('【基础身份（三个视角必须完全一致）】' + identityParts.join('；'))
  const lookParts = []
  if (target.name) lookParts.push('形象：' + target.name)
  if (target.costume) lookParts.push('服装：' + target.costume)
  if (target.hair) lookParts.push('发型/发色：' + target.hair)
  if (target.description) lookParts.push('描述：' + target.description)
  if (lookParts.length) lines.push('【本套形象】' + lookParts.join('；'))
  lines.push('【视角细节】正面：完整正脸与服装正面；侧面：90 度侧身轮廓与服装侧面；背面：后脑/背部发型与服装背面。三视图比例一致、头部大小一致、同一角色。')
  if (views.front) lines.push('【正面补充】' + views.front)
  if (views.side) lines.push('【侧面补充】' + views.side)
  if (views.back) lines.push('【背面补充】' + views.back)
  return lines.join('\n')
}

export function buildSketchPrompt(shot, project = {}) {
  const lines = []
  lines.push('黑白铅笔线稿故事板分镜草图（用来确认相机位置与景别），电影感构图，线条干净、轮廓清晰，不上色，不要文字、不要水印、不要分格拼贴。')
  const frame = []
  if (shot.shotType) frame.push('景别/机位：' + shot.shotType)
  if (shot.camera) frame.push('机位：' + shot.camera)
  if (shot.movement) frame.push('镜头运动：' + shot.movement + '（静态草图，只体现构图与方向）')
  if (frame.length) lines.push('【镜头设计】' + frame.join('；'))
  if (shot.scene) lines.push('【场景】' + shot.scene)
  if (shot.action) lines.push('【画面内容】' + shot.action)
  if (shot.lighting) lines.push('【光线/明暗】' + shot.lighting + '（只画明暗关系，不要彩色）')
  const sceneMap = project && project.sceneMap && typeof project.sceneMap === 'object' ? project.sceneMap : {}
  if (sceneMap.environment) lines.push('【全片环境设定（所有镜头必须一致）】' + sceneMap.environment)
  const environment = asText(shot.environment) || [shot.scene, shot.lighting].filter(Boolean).join('；')
  if (environment) lines.push('【环境（本镜，全片一致）】' + environment)
  const characters = Array.isArray(project.characters) ? project.characters : []
  const shotCharacters = Array.isArray(shot.characters) ? shot.characters : []
  if (shotCharacters.length) {
    lines.push('【出场角色（只要外观轮廓，不画表情细节）】')
    for (const name of shotCharacters) {
      const char = characters.find((item) => item && (item.name === name || (typeof item.name === 'string' && item.name.indexOf(name) !== -1)))
      if (!char) {
        lines.push('- ' + name)
        continue
      }
      const fields = []
      for (const key of Object.keys(CHARACTER_LABELS)) {
        if (char[key]) fields.push(CHARACTER_LABELS[key] + '：' + char[key])
      }
      if (!fields.length && char.appearance) fields.push(char.appearance)
      lines.push('- ' + (char.name || name) + (fields.length ? '：' + fields.join('；') : ''))
    }
  }
  if (project.style) lines.push('【整体风格参考（保持线稿，不上色）】' + project.style)
  lines.push('【输出要求】只画这一个镜头（' + asText(shot.id || '当前镜头') + '）的单张画面：单格、单镜头，不要分格拼贴、不要分镜表、不要拼多个镜头；时间/天气/光线/色彩基调必须与全片环境一致（不得黄昏变夜晚）；重点画清相机位置、景别、人物在画面中的位置与朝向；黑白线稿，不上色、不要文字、不要水印。')
  return lines.join('\n')
}

function mediaTypeToExt(mediaType) {
  const text = asText(mediaType).toLowerCase()
  if (text.indexOf('jpeg') !== -1 || text.indexOf('jpg') !== -1) return 'jpg'
  if (text.indexOf('webp') !== -1) return 'webp'
  return 'png'
}

/**
 * 调用 OpenAI 兼容的 /v1/images/generations 生成草图。
 * @returns {Promise<{buffer:Buffer, mediaType:string, revisedPrompt:string, generationId:string, usage:object|null}>}
 */
export async function generateSketchImage(options = {}) {
  const baseUrl = asText(options.baseUrl)
  const apiKey = asText(options.apiKey)
  const model = asText(options.model)
  const prompt = asText(options.prompt)
  const size = asText(options.size) || '1536x1024'
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch
  const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_IMAGE_TIMEOUT_MS
  if (!baseUrl || !apiKey || !model) throw imageGenError('图像生成配置不完整（baseUrl / apiKey / model）', 'IMAGE_GEN_UNCONFIGURED')
  if (!prompt) throw imageGenError('草图提示词为空', 'IMAGE_GEN_PROMPT')
  const url = baseUrl.replace(/\/+$/, '') + '/v1/images/generations'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      // MiniMax 走 url 返回（文档示例）；其它模型保持原有默认行为
      body: JSON.stringify({ model, prompt, n: 1, size, ...(/minimax/i.test(model) ? { response_format: 'url', output_format: 'png' } : {}) }),
      signal: controller.signal
    })
  } catch (error) {
    if (error && error.name === 'AbortError') throw imageGenError('图像生成超时（' + Math.round(timeoutMs / 1000) + ' 秒）', 'IMAGE_GEN_TIMEOUT')
    throw imageGenError('图像生成请求失败：' + (error && error.message ? error.message : String(error)), 'IMAGE_GEN_NETWORK')
  } finally {
    clearTimeout(timer)
  }
  const text = await response.text()
  let payload = null
  try { payload = JSON.parse(text) } catch (error) { payload = null }
  if (!response.ok) {
    throw imageGenError('图像生成接口返回 ' + response.status + '：' + text.slice(0, 300), 'IMAGE_GEN_API')
  }
  const item = payload && Array.isArray(payload.data) ? payload.data[0] : null
  if (!item) throw imageGenError('图像生成接口没有返回图片数据：' + text.slice(0, 300), 'IMAGE_GEN_EMPTY')
  let buffer = null
  let mediaType = 'image/png'
  if (typeof item.b64_json === 'string' && item.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64')
  } else if (typeof item.url === 'string' && item.url) {
    const fileResponse = await fetchImpl(item.url)
    if (!fileResponse || fileResponse.ok === false) throw imageGenError('下载生成图片失败：' + item.url, 'IMAGE_GEN_DOWNLOAD')
    buffer = Buffer.from(await fileResponse.arrayBuffer())
    mediaType = (fileResponse.headers && typeof fileResponse.headers.get === 'function' && fileResponse.headers.get('content-type')) || mediaType
  } else {
    throw imageGenError('返回数据里没有 b64_json / url', 'IMAGE_GEN_EMPTY')
  }
  return {
    buffer,
    mediaType,
    revisedPrompt: asText(item.revised_prompt),
    generationId: asText(item.generation_id),
    usage: payload.usage || null
  }
}

/**
 * 保存草图文件到 <项目>/Storyboards/<ShotN>-<镜头名/景别>.png（人类可读，重名自动加 -2、-3）。
 * @returns {{path:string, fileName:string, bytes:number}}
 */
export function saveSketchImage(options = {}) {
  const dir = asText(options.dir)
  const buffer = options.buffer
  if (!dir) throw imageGenError('保存草图缺少目录', 'IMAGE_GEN_SAVE')
  if (!buffer || !buffer.length) throw imageGenError('保存草图缺少图片数据', 'IMAGE_GEN_SAVE')
  fs.mkdirSync(dir, { recursive: true })
  const shotId = asText(options.shotId).replace(/[^A-Za-z0-9_-]/g, '') || 'Shot'
  // 人类可读标签：镜头名 / 景别 / 画面内容摘要（去非法字符、限长）
  const label = asText(options.label)
    .replace(/[\\/:*?"<>|（）()\[\]【】\r\n\t]+/g, '')
    .replace(/→/g, '-')
    .replace(/[\s、,，]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 14)
  const base = label ? shotId + '-' + label : shotId
  const ext = mediaTypeToExt(options.mediaType)
  let fileName = base + '.' + ext
  let filePath = path.join(dir, fileName)
  let index = 2
  while (fs.existsSync(filePath)) {
    fileName = base + '-' + index + '.' + ext
    filePath = path.join(dir, fileName)
    index += 1
  }
  fs.writeFileSync(filePath, buffer)
  return { path: filePath, fileName, bytes: buffer.length }
}
