/**
 * dsh-video-project — 草图分镜设置（用户指定，不自动决策）
 *
 * 设置落盘在 ~/.dsh/video-project/config.json 的 imageGen：
 *   { "enabled": true, "model": "gpt-image-2.5", "baseUrl": "https://...", "apiKey": "..." }
 *
 * - enabled 默认 false：草图分镜默认关闭，必须用户在设置面板里勾选启用；
 * - model 必须由用户从候选清单中选择，本模块不自动挑选；
 * - 候选清单来自共享能力文件（生成插件探测）或中转站 /v1/models（界面「刷新候选」时拉取）；
 * - 返回给界面的设置视图永远不带明文 apiKey（只带 hasApiKey 与掩码）。
 * @module dsh-video-project/server/image-settings
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveConfigFile, readSharedCapabilities } from './capabilities.js'
import { readSeedanceSettings } from './imagegen.js'

/** 图像生成模型命名（与生成插件探测规则保持一致）。 */
export const IMAGE_MODEL_PATTERN = /(^|[-_/])(gpt-image|gemini[-a-z0-9.]*image|gemini-nano-banana|nano-banana|seedream|flux|dall-e|imagen|qwen-image|kolors)/i

/** 判断模型 id 是否是图像生成模型。 */
export function isImageModel(id) {
  return typeof id === 'string' && IMAGE_MODEL_PATTERN.test(id.trim())
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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temp = filePath + '.tmp-' + process.pid + '-' + Date.now()
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  fs.renameSync(temp, filePath)
}

function asText(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

/** 掩码 API Key：只保留首尾少量字符。 */
export function maskApiKey(apiKey) {
  const text = asText(apiKey)
  if (!text) return ''
  if (text.length <= 8) return '••••'
  return text.slice(0, 4) + '••••' + text.slice(-4)
}

/**
 * 是否把分镜草图作为生成参考图（用户开关，默认关闭）。
 * config.json 顶层 sketchAsReference 优先；旧配置没有该字段时用环境变量 VIDEO_SKETCH_AS_REFERENCE=1 兜底。
 */
export function readSketchAsReference(env = process.env, configFile) {
  const payload = readJson(configFile || resolveConfigFile(env)) || {}
  if (payload.sketchAsReference === true) return true
  if (payload.sketchAsReference === false) return false
  return String((env && env.VIDEO_SKETCH_AS_REFERENCE) || '') === '1'
}

/**
 * 读设置视图（不含明文 apiKey）。
 * @returns {{enabled:boolean, model:string, baseUrl:string, hasApiKey:boolean, apiKeyMasked:string, candidates:string[], candidateSource:string, configFile:string}}
 */
/** 是否「人物三视图自动出图」（勾选后保存人物卡默认生成三视图；按次计费，用户勾选即授权）。 */
export function readCharacterSheetEnabled(env = process.env, configFile) {
  const payload = readJson(configFile || resolveConfigFile(env)) || {}
  const section = payload.characterSheet && typeof payload.characterSheet === 'object' ? payload.characterSheet : {}
  return section.enabled === true
}

/** 是否「区域/场地自动出图」（勾选后保存区域设定默认生成场地设定图；按次计费，用户勾选即授权）。 */
export function readAreaSheetEnabled(env = process.env, configFile) {
  const payload = readJson(configFile || resolveConfigFile(env)) || {}
  const section = payload.areaSheet && typeof payload.areaSheet === 'object' ? payload.areaSheet : {}
  return section.enabled === true
}

/** 人物三视图出图模型（未设置时回退草图模型）。 */
export function readCharacterSheetModel(env = process.env, configFile) {
  const payload = readJson(configFile || resolveConfigFile(env)) || {}
  const section = payload.characterSheet && typeof payload.characterSheet === 'object' ? payload.characterSheet : {}
  return asText(section.model)
}

/** 区域/场地出图模型（未设置时回退草图模型）。 */
export function readAreaSheetModel(env = process.env, configFile) {
  const payload = readJson(configFile || resolveConfigFile(env)) || {}
  const section = payload.areaSheet && typeof payload.areaSheet === 'object' ? payload.areaSheet : {}
  return asText(section.model)
}

export function readImageGenSettings(options = {}) {
  const env = options.env || process.env
  const configFile = options.configFile || resolveConfigFile(env)
  const payload = options.config !== undefined ? options.config : (readJson(configFile) || {})
  const imageGen = payload && payload.imageGen && typeof payload.imageGen === 'object' ? payload.imageGen : {}
  const shared = options.shared !== undefined ? options.shared : readSharedCapabilities({ env })
  const sharedImage = shared && shared.payload && shared.payload.imageGeneration && typeof shared.payload.imageGeneration === 'object' ? shared.payload.imageGeneration : {}
  const candidates = Array.isArray(sharedImage.models)
    ? sharedImage.models.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : []
  const seedance = readSeedanceSettings(env)
  const apiKey = asText(imageGen.apiKey) || seedance.relayApiKey
  return {
    characterSheet: { enabled: readCharacterSheetEnabled(env, configFile), model: readCharacterSheetModel(env, configFile) },
    areaSheet: { enabled: readAreaSheetEnabled(env, configFile), model: readAreaSheetModel(env, configFile) },
    enabled: imageGen.enabled === true || imageGen.capable === true,
    model: asText(imageGen.model),
    baseUrl: asText(imageGen.baseUrl) || asText(sharedImage.baseUrl) || seedance.relayBaseUrl,
    hasApiKey: Boolean(apiKey),
    apiKeyMasked: maskApiKey(apiKey),
    candidates,
    candidateSource: candidates.length ? '共享能力文件（生成插件探测）' : '',
    sketchAsReference: payload.sketchAsReference === true,
    configFile
  }
}

/**
 * 保存设置（只改 imageGen，保留 config.json 其他字段）。
 * @param {{enabled?:boolean, model?:string, baseUrl?:string, apiKey?:string, clearApiKey?:boolean}} patch
 * @returns {{ok:boolean, settings:object}}
 */
export function saveImageGenSettings(patch, options = {}) {
  const env = options.env || process.env
  const configFile = options.configFile || resolveConfigFile(env)
  const payload = options.config !== undefined ? { ...options.config } : (readJson(configFile) || {})
  const current = payload.imageGen && typeof payload.imageGen === 'object' ? payload.imageGen : {}
  const next = { ...current }
  const input = patch && typeof patch === 'object' ? patch : {}
  if (input.enabled !== undefined) next.enabled = input.enabled === true
  if (input.model !== undefined) next.model = asText(input.model)
  if (input.baseUrl !== undefined) next.baseUrl = asText(input.baseUrl)
  if (input.clearApiKey === true) next.apiKey = ''
  else if (input.apiKey !== undefined && asText(input.apiKey)) next.apiKey = asText(input.apiKey)
  // 兼容旧字段
  delete next.capable
  payload.imageGen = next
  if (input.sketchAsReference !== undefined) payload.sketchAsReference = input.sketchAsReference === true
  if (input.characterSheet && typeof input.characterSheet === 'object') {
    const prev = payload.characterSheet && typeof payload.characterSheet === 'object' ? payload.characterSheet : {}
    payload.characterSheet = { ...prev }
    if (input.characterSheet.enabled !== undefined) payload.characterSheet.enabled = input.characterSheet.enabled === true
    if (input.characterSheet.model !== undefined) payload.characterSheet.model = asText(input.characterSheet.model)
  }
  if (input.areaSheet && typeof input.areaSheet === 'object') {
    const prev = payload.areaSheet && typeof payload.areaSheet === 'object' ? payload.areaSheet : {}
    payload.areaSheet = { ...prev }
    if (input.areaSheet.enabled !== undefined) payload.areaSheet.enabled = input.areaSheet.enabled === true
    if (input.areaSheet.model !== undefined) payload.areaSheet.model = asText(input.areaSheet.model)
  }
  writeJson(configFile, payload)
  return { ok: true, settings: readImageGenSettings({ env, configFile }) }
}

/** 从 /v1/models 响应提取模型 id 列表。 */
export function extractModelIds(payload) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const lists = []
  if (Array.isArray(source.data)) lists.push(source.data)
  if (Array.isArray(source.models)) lists.push(source.models)
  const ids = []
  for (const list of lists) {
    for (const item of list) {
      const id = typeof item === 'string' ? item : (item && typeof item.id === 'string' ? item.id : '')
      const text = asText(id)
      if (text && ids.indexOf(text) === -1) ids.push(text)
    }
  }
  return ids
}

/**
 * 拉取中转站模型列表里的图像生成候选（只读，不产生费用）。
 * @returns {Promise<{models:string[], source:string, error:string}>}
 */
export async function fetchImageCandidates(options = {}) {
  const env = options.env || process.env
  const fetchImpl = typeof options.fetchImpl === 'function' ? options.fetchImpl : fetch
  const settings = options.settings || readImageGenSettings({ env, configFile: options.configFile })
  const seedance = readSeedanceSettings(env)
  const baseUrl = asText(options.baseUrl) || settings.baseUrl || seedance.relayBaseUrl
  const apiKey = asText(options.apiKey) || (options.useSavedApiKey === false ? '' : (readImageGenSettingsRaw(env, options.configFile) || seedance.relayApiKey))
  if (!baseUrl) return { models: [], source: '', error: '还没有中转站地址：请先在设置里填写，或安装 dsh-seedance-studio 让它提供' }
  if (!apiKey) return { models: [], source: '', error: '还没有 API Key：请在设置里填写，或由 dsh-seedance-studio 提供' }
  const url = baseUrl.replace(/\/+$/, '') + '/v1/models'
  try {
    const response = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + apiKey } })
    const text = await response.text()
    let payload = null
    try { payload = JSON.parse(text) } catch (error) { payload = null }
    if (!response.ok) return { models: [], source: baseUrl, error: '模型列表接口返回 ' + response.status + '：' + text.slice(0, 200) }
    const ids = extractModelIds(payload)
    const models = ids.filter((id) => isImageModel(id))
    return { models, source: baseUrl, error: models.length ? '' : '中转站模型列表里没有识别到图像生成模型（共 ' + ids.length + ' 个模型）' }
  } catch (error) {
    return { models: [], source: baseUrl, error: '拉取模型列表失败：' + (error && error.message ? error.message : String(error)) }
  }
}

/** 读原始设置（内部用，含明文 apiKey；不对外返回）。 */
function readImageGenSettingsRaw(env, configFileOption) {
  const configFile = configFileOption || resolveConfigFile(env)
  const payload = readJson(configFile) || {}
  const imageGen = payload && payload.imageGen && typeof payload.imageGen === 'object' ? payload.imageGen : {}
  return asText(imageGen.apiKey)
}
