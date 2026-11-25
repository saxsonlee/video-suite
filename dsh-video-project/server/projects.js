/**
 * dsh-video-project — 视频项目仓储（落盘，供工具使用）。
 *
 * 目录结构（<storageRoot>/projects/<VideoName>/）：
 *   Charactor/<角色名>.json              角色外观设计（人物卡）
 *   Shots/mainShots.json                 分镜脚本（镜头列表 + 整体风格 + 出场角色）
 *   Shots/changeInfo.jsonl               分镜更改记录（追加）
 *   Video/<ShotId>/V0.<n>/video.mp4      每个镜头的生成版本（重复生成递增 V0.1→V0.2…）
 *   Video/<ShotId>/V0.<n>/meta.json      该版本的生成信息（提示词/模型/参数/记录 id）
 *   Video/<ShotId>/ChangeInfo.jsonl      该镜头的视频更改记录（追加）
 *   Video/FullVideo/video.mp4            全分镜合成视频
 *   Video/FullVideo/meta.json
 *
 * 写入一律「临时文件 + rename」原子替换；读取损坏文件时容忍（返回空/默认值）。
 * 本模块只依赖 node 内置模块，可被 node --test 直接加载。
 * @module dsh-video-project/server/projects
 */
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildGuide as buildGuideData } from './guide.js'
import { buildChecklist, compareWithObserved, extractFrames, resolveFfmpeg, probeDuration, probeVideoSize } from './analyze.js'
import { resolveVideoEditCapability, resolveImageGenerationCapability } from './capabilities.js'
import { readSketchAsReference, readCharacterSheetEnabled, readAreaSheetEnabled, readCharacterSheetModel, readAreaSheetModel } from './image-settings.js'
import { generateSketchImage, buildSketchPrompt, resolveImageGenConfig, resolveSketchSize, saveSketchImage, SKETCH_DIR_NAME, LOOK_DIR_NAME, buildCharacterSheetPrompt, AREA_DIR_NAME, buildAreaSheetPrompt } from './imagegen.js'
import { buildStrategy, normalizeStrategy } from './strategy.js'

/** 短视频分镜规范：景别（相邻镜头要错开）与运镜（用大白话）。 */
export const SHOT_TYPES = ['远景', '全景', '中景', '近景', '特写']
export const MOVEMENTS = ['固定', '推', '拉', '摇', '移', '跟拍', '环绕']

/** 验收 6 栏（与分镜 6 栏对应，逐栏打勾）。 */
export const REVIEW_CHECKS = [
  { key: 'shotType', label: '景别/机位', hint: '景别与分镜一致；机位角度对' },
  { key: 'action', label: '画面内容', hint: '动作/表情/关键道具/环境与分镜一致' },
  { key: 'dialogue', label: '台词/字幕', hint: '台词出现且与画面同步；字幕正确（没有就选不适用）' },
  { key: 'movement', label: '运镜', hint: '镜头运动与分镜一致（固定/推/拉/摇/移/跟拍）' },
  { key: 'duration', label: '时长', hint: '时长与分镜接近（±1 秒）' },
  { key: 'characters', label: '人物卡一致性', hint: '角色外观/发型/服装与人物卡一致' },
  { key: 'environment', label: '环境/时间', hint: '时间/天气/光线/色彩基调与前序镜头一致，不得从黄昏变夜晚、不得改变光源' },
  { key: 'continuity', label: '衔接', hint: '与上一镜动作/视线/风格连贯' }
]

/** 验收项期望值：从分镜字段生成，供验收表对照。 */
export function reviewExpected(key, shot = {}, project = null) {
  const value = shot && typeof shot === 'object' ? shot : {}
  const ctx = project && typeof project === 'object' ? project : {}
  if (key === 'shotType') return [value.shotType, value.camera].filter(Boolean).join('；')
  if (key === 'action') return value.action || ''
  if (key === 'dialogue') return [value.dialogue, value.subtitle].filter(Boolean).join('；')
  if (key === 'movement') return value.movement || ''
  if (key === 'duration') return value.duration ? value.duration + ' 秒' : ''
  if (key === 'characters') {
    // 本幕出场人物（cast）+ 当前形象（look）：验收时对照「基础设定 + 本幕形象/三视图」
    const acts = Array.isArray(ctx.acts) ? ctx.acts : []
    const act = value.actId ? acts.find((item) => item.id === value.actId) || null : (acts[0] || null)
    const cast = (Array.isArray(value.cast) && value.cast.length) ? value.cast : (act && Array.isArray(act.cast) ? act.cast : [])
    const chars = Array.isArray(ctx.characters) ? ctx.characters : []
    if (cast.length) {
      const parts = cast.map((member) => {
        const char = chars.find((item) => item.name === member.name)
        const looks = char && Array.isArray(char.looks) ? char.looks : []
        const look = (member.lookId && looks.find((item) => item.id === member.lookId)) || looks[0] || null
        if (!look) return member.name + '（人物卡缺少形象变体）'
        const hasViews = look.views && (look.views.front || look.views.side || look.views.back)
        return member.name + '·' + look.name + (hasViews ? '（脸/体型不变；本幕服装三视图一致）' : '（脸/体型不变；本幕服装一致）')
      })
      return '本幕出场：' + parts.join('、')
    }
    return '与人物卡一致（全片统一）'
  }
  if (key === 'environment') {
    const envText = value.environment || [value.scene, value.lighting].filter(Boolean).join('；')
    const areas = Array.isArray(ctx.areas) ? ctx.areas : []
    const acts = Array.isArray(ctx.acts) ? ctx.acts : []
    const act = value.actId ? acts.find((item) => item.id === value.actId) || null : (acts[0] || null)
    const areaId = value.areaId || (act && act.areaId) || ''
    const area = areaId ? areas.find((item) => item.id === areaId) || null : null
    const parts = []
    if (envText) parts.push(envText)
    if (area) parts.push('区域：' + (area.name || area.id) + (area.lighting ? '（' + area.lighting + '）' : '') + (area.layout ? '；布局：' + area.layout : ''))
    return parts.join('；')
  }
  if (key === 'continuity') return '与上一镜连贯'
  const def = REVIEW_CHECKS.find((item) => item.key === key)
  return def ? def.hint : ''
}

/** 归一化验收项：只保留结构合法项，pass 一律布尔。 */
export function normalizeReviewChecks(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const checks = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const key = asText(item.key) || asText(item.label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    const def = REVIEW_CHECKS.find((entry) => entry.key === key)
    checks.push({
      key,
      label: asText(item.label) || (def && def.label) || key,
      pass: item.pass === true,
      note: asText(item.note)
    })
  }
  return checks
}

/** 默认项目根（$DSH_HOME/storages/video-project/projects）。 */
export function defaultProjectsRoot(env) {
  const home = env && env.DSH_HOME ? env.DSH_HOME : path.join(os.homedir(), '.dsh')
  return path.join(home, 'storages', 'video-project', 'projects')
}

/**
 * 解析项目资料实际存储根目录（优先级：插件 config.storageRoot > 共享设置文件 > 默认）。
 *
 * 共享设置文件由本插件 action=location 写入：
 *   <默认存储目录>/settings.json → { "storageRoot": "D:\\\\我的视频项目" }
 * 读取顺序：插件 config.storageRoot > 设置文件 > 默认目录。
 */
export function resolveProjectStorageRoot(options = {}) {
  const env = options.env || {}
  const pluginConfig = options.pluginConfig && typeof options.pluginConfig === 'object' ? options.pluginConfig : {}
  const fallback = path.dirname(defaultProjectsRoot(env))
  const fromConfig = typeof pluginConfig.storageRoot === 'string' ? pluginConfig.storageRoot.trim() : ''
  if (fromConfig) {
    const resolved = path.resolve(fromConfig)
    return { storageRoot: resolved, projectsRoot: path.join(resolved, 'projects'), source: 'pluginConfig' }
  }
  try {
    const raw = fsSync.readFileSync(path.join(fallback, 'settings.json'), 'utf8')
    const data = JSON.parse(raw)
    const value = data && typeof data.storageRoot === 'string' ? data.storageRoot.trim() : ''
    if (value) {
      const resolved = path.resolve(value)
      return { storageRoot: resolved, projectsRoot: path.join(resolved, 'projects'), source: 'settings' }
    }
  } catch (error) {
    // 共享设置不存在/损坏：用默认目录
  }
  return { storageRoot: fallback, projectsRoot: path.join(fallback, 'projects'), source: 'default' }
}

/** 校验保存位置：必须是绝对路径，且不能是磁盘根目录。 */
function validateProjectStorageRoot(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) throw projectError('保存位置不能为空', 'INVALID_STORAGE_ROOT')
  const normalized = process.platform === 'win32' ? text.replace(/\//g, '\\') : text
  if (process.platform === 'win32') {
    if (!/^[a-zA-Z]:[\\/]/.test(normalized) && !normalized.startsWith('\\\\')) {
      throw projectError('保存位置必须是绝对路径，例如 D:\\视频项目', 'INVALID_STORAGE_ROOT')
    }
  } else if (!normalized.startsWith('/')) {
    throw projectError('保存位置必须是绝对路径，例如 /home/me/videos', 'INVALID_STORAGE_ROOT')
  }
  const resolved = path.resolve(normalized)
  if (path.parse(resolved).root === resolved) {
    throw projectError('不能选择磁盘根目录，请选择具体文件夹，例如 D:\\视频项目', 'INVALID_STORAGE_ROOT')
  }
  return resolved
}

/** 读取当前保存位置（含默认值与来源）。 */
export function readProjectLocation(options = {}) {
  const env = options.env || {}
  const pluginConfig = options.pluginConfig && typeof options.pluginConfig === 'object' ? options.pluginConfig : {}
  const resolved = resolveProjectStorageRoot({ env, pluginConfig })
  return { ...resolved, defaultStorageRoot: path.dirname(defaultProjectsRoot(env)) }
}

/** 更新保存位置（写 <默认存储目录>/settings.json；插件重启后生效）。 */
export function updateProjectLocation(options = {}) {
  const env = options.env || {}
  const target = validateProjectStorageRoot(options.storageRoot)
  const fallback = path.dirname(defaultProjectsRoot(env))
  const file = path.join(fallback, 'settings.json')
  fsSync.mkdirSync(fallback, { recursive: true })
  fsSync.mkdirSync(target, { recursive: true })
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now()
  fsSync.writeFileSync(tmp, JSON.stringify({ storageRoot: target }, null, 2) + '\n', 'utf8')
  fsSync.renameSync(tmp, file)
  return { storageRoot: target, projectsRoot: path.join(target, 'projects'), source: 'settings', defaultStorageRoot: fallback }
}


/** 安全文件名片段：替换 Windows/Unix 非法字符，防路径穿越。 */
function safeFileSegment(value, fallback = 'unknown') {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (!text) return fallback
  const dotted = text.replace(/\.\./g, '_')
  const cleaned = dotted.replace(/[<>:"\\/|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '_').slice(0, 120)
  if (!cleaned || cleaned === '_') return fallback
  return cleaned
}


/** 项目提示词（人物卡 + 分镜）最大长度（真实接口对 prompt 有长度限制）。 */
export const MAX_PROJECT_PROMPT_CHARS = 4000

/** 分镜变更记录最多读取条数。 */
const CHANGE_LOG_LIMIT = 50

function projectError(message, code, status) {
  const error = new Error(message)
  error.name = code === 'NotFound' ? 'NotFoundError' : 'ValidationError'
  error.code = code
  error.status = status || 400
  return error
}

function normalizeProjectName(name) {
  const text = String(name === undefined || name === null ? '' : name).trim()
  if (!text) throw projectError('项目名不能为空（VideoName）', 'INVALID_PROJECT_NAME')
  if (text.length > 120) throw projectError('项目名过长（≤120 字符）', 'INVALID_PROJECT_NAME')
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(text) || text.includes('..')) {
    throw projectError('项目名含非法字符（不能包含 \\ / : * ? " < > | 或 ..）：' + text, 'INVALID_PROJECT_NAME')
  }
  return text
}

function normalizeShotId(shotId) {
  const raw = String(shotId === undefined || shotId === null ? '' : shotId).trim()
  if (!raw) throw projectError('镜头 id 不能为空（如 Shot1）', 'INVALID_SHOT_ID')
  const match = /^(?:shot\s*|镜头\s*)?(\d+)$/i.exec(raw)
  if (match) return 'Shot' + Number(match[1])
  const safe = safeFileSegment(raw)
  if (!safe || safe === 'unknown') throw projectError('镜头 id 无效：' + raw, 'INVALID_SHOT_ID')
  return safe
}

function normalizeCharacterName(name) {
  const text = String(name === undefined || name === null ? '' : name).trim()
  if (!text) throw projectError('角色名不能为空', 'INVALID_CHARACTER')
  return safeFileSegment(text, 'Char')
}

function asText(value) {
  return String(value === undefined || value === null ? '' : value).trim()
}

function asDuration(value) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? Math.round(num) : 0
}

/** 镜头字段归一化（相对宽松，擅长接收模型给的 JSON）。 */
function normalizeShot(raw, index) {
  const shot = raw && typeof raw === 'object' ? raw : {}
  const id = normalizeShotId(shot.id || shot.shotId || shot.no || 'Shot' + (index + 1))
  const result = {
    id,
    name: asText(shot.name || shot.title || '镜头 ' + id),
    scene: asText(shot.scene),
    shotType: asText(shot.shotType || shot.type || shot.size),
    camera: asText(shot.camera || shot.angle),
    movement: asText(shot.movement || shot.cameraMove),
    lighting: asText(shot.lighting || shot.tone || shot.color),
    environment: asText(shot.environment || shot.env || shot.ambience),
    transition: asText(shot.transition || shot.cut),
    duration: asDuration(shot.duration || shot.seconds),
    beat: (() => { const value = Number(shot.beat); return Number.isFinite(value) && value > 0 ? Math.round(value) : 0 })(),
    purpose: asText(shot.purpose || shot.task),
    screenDirection: asText(shot.screenDirection || shot.direction),
    eyeline: asText(shot.eyeline || shot.gaze),
    risk: asText(shot.risk),
    action: asText(shot.action || shot.content || shot.description),
    dialogue: asText(shot.dialogue || shot.line),
    subtitle: asText(shot.subtitle || shot.caption || shot.subtitleText),
    sound: asText(shot.sound || shot.audio),
    characters: Array.isArray(shot.characters) ? shot.characters.map((item) => asText(item)).filter(Boolean) : [],
    // 幕/区域归属 + 镜头级出场（覆盖幕级 cast）+ 镜头类型（普通/报幕/转场）
    actId: asText(shot.actId || shot.act),
    areaId: asText(shot.areaId || shot.area || shot.locationId),
    cast: normalizeCast(shot.cast !== undefined ? shot.cast : shot.characters),
    kind: ['shot', 'title', 'transition'].includes(asText(shot.kind)) ? asText(shot.kind) : 'shot',
    notes: asText(shot.notes),
    sketchPath: asText(shot.sketchPath)
  }
  // characters 与 cast 保持同步（characters 为旧字段，供旧代码/界面使用）
  const names = result.characters.length ? result.characters : result.cast.map((item) => item.name)
  result.characters = names
  if (!result.cast.length && names.length) result.cast = names.map((name) => ({ name, lookId: '' }))
  return result
}

/** 场景地图：从上方看的地点/物件/人物站位/相机位，用来检查画面方向、视线与 180 度法则。 */
export function normalizeSceneMap(raw) {
  const empty = { description: '', environment: '', objects: [], characters: [], cameras: [], notes: '' }
  if (raw === undefined || raw === null || raw === '') return empty
  if (typeof raw === 'string') return { ...empty, description: asText(raw) }
  if (typeof raw !== 'object') return empty
  const readList = (value) => (Array.isArray(value) ? value.map((item) => asText(item)).filter(Boolean) : [])
  return {
    description: asText(raw.description || raw.summary || raw.location),
    environment: asText(raw.environment || raw.env || raw.ambience),
    objects: readList(raw.objects),
    characters: readList(raw.characters),
    cameras: readList(raw.cameras),
    notes: asText(raw.notes)
  }
}

/** 项目基线：整个项目每次生成都复用的固定参数（模型/分辨率/比例/种子/风格卡）。 */
function normalizeBaseline(raw) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const seed = Number(value.seed)
  const baseline = {
    model: asText(value.model),
    resolution: asText(value.resolution),
    ratio: asText(value.ratio),
    duration: asDuration(value.duration),
    styleCard: asText(value.styleCard || value.style),
    notes: asText(value.notes)
  }
  if (Number.isFinite(seed)) baseline.seed = Math.round(seed)
  for (const key of Object.keys(baseline)) {
    if (baseline[key] === '' || baseline[key] === 0) delete baseline[key]
  }
  return baseline
}

/** 镜头/幕的出場角色列表：['阿海'] 或 [{name,lookId}] → [{name,lookId}]。 */
function normalizeCast(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (typeof item === 'string') return { name: asText(item), lookId: '' }
    const obj = item && typeof item === 'object' ? item : {}
    return { name: asText(obj.name || obj.character || obj.characterId || obj.id), lookId: asText(obj.lookId || obj.look) }
  }).filter((item) => item.name)
}

/** 人物图片路径列表（本地绝对路径，最多 10 张）。 */
function normalizeCharacterImages(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => asText(item)).filter(Boolean).slice(0, 10)
}

/** 人物基础身份（全片恒定：脸/体型/身份不能变，否则观众认不出是同一人）。 */
function normalizeIdentity(raw, legacy) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const old = legacy && typeof legacy === 'object' ? legacy : {}
  return {
    age: asText(value.age || old.age),
    face: asText(value.face || value.faceFeatures || old.face),
    hairBase: asText(value.hairBase || value.hair || old.hair),
    body: asText(value.body || value.build || old.body),
    signature: asText(value.signature || value.mark || old.signature),
    identityNotes: asText(value.notes || value.identityNotes)
  }
}

/** 形象变体（Look）：服装/发型/状态随剧情变化，但脸/体型/身份不变。 */
function normalizeLook(raw, index) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const views = value.views && typeof value.views === 'object' ? value.views : {}
  return {
    id: safeFileSegment(asText(value.id || value.name) || 'look' + (index + 1), 'look' + (index + 1)),
    name: asText(value.name || value.title) || ('形象 ' + (index + 1)),
    hair: asText(value.hair || value.hairStyle),
    costume: asText(value.costume || value.outfit || value.clothing),
    description: asText(value.description || value.appearance || value.design),
    views: {
      front: asText(views.front || views['正面']),
      side: asText(views.side || views['侧面']),
      back: asText(views.back || views['背面'])
    },
    referenceImages: normalizeCharacterImages(value.referenceImages || value.images || value.photos),
    notes: asText(value.notes)
  }
}

/** 区域设定（项目级）：一个区域的空间布局/标志物/光线/贯穿道具，供多幕/多镜头引用。 */
function normalizeArea(raw, index) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const id = safeFileSegment(asText(value.id || value.name) || 'area' + (index + 1), 'area' + (index + 1))
  return {
    id,
    name: asText(value.name || value.title) || id,
    description: asText(value.description || value.summary || value.location),
    layout: asText(value.layout || value.spatial || value.geography),
    landmarks: (Array.isArray(value.landmarks) ? value.landmarks : []).map((item) => asText(item)).filter(Boolean),
    lighting: asText(value.lighting || value.light),
    props: (Array.isArray(value.props) ? value.props : []).map((item) => asText(item)).filter(Boolean),
    mapPath: asText(value.mapPath || value.map),
    notes: asText(value.notes)
  }
}

/** 幕（Act）：叙事单位，声明本幕出场人物（cast）、所在区域、报幕与情绪。 */
function normalizeAct(raw, index) {
  const value = raw && typeof raw === 'object' ? raw : {}
  const id = safeFileSegment(asText(value.id || value.name) || 'act' + (index + 1), 'act' + (index + 1))
  const titleCard = value.titleCard && typeof value.titleCard === 'object' ? value.titleCard : {}
  return {
    id,
    name: asText(value.name || value.title) || ('第 ' + (index + 1) + ' 幕'),
    purpose: asText(value.purpose || value.goal),
    mood: asText(value.mood || value.tone),
    areaId: asText(value.areaId || value.area),
    cast: normalizeCast(value.cast),
    titleCard: { text: asText(titleCard.text || value.titleText), style: asText(titleCard.style) },
    notes: asText(value.notes)
  }
}

/** 人物卡外观分栏（analyze 可逐栏逐项定位）。 */
export const CHARACTER_FIELDS = [
  { key: 'age', label: '年龄' },
  { key: 'face', label: '长相' },
  { key: 'hair', label: '发型/发色' },
  { key: 'costume', label: '服装' },
  { key: 'body', label: '体型' },
  { key: 'signature', label: '标志性特征' }
]

/** 把人物卡外观各栏组合成一段 appearance 文本（兼容只有 appearance 的旧数据）。 */
export function composeCharacterAppearance(fields = {}) {
  const parts = []
  for (const def of CHARACTER_FIELDS) {
    const value = asText(fields[def.key])
    if (value) parts.push(def.label + '：' + value)
  }
  return parts.join('；')
}

function normalizeCharacter(raw) {
  const char = raw && typeof raw === 'object' ? raw : {}
  const name = normalizeCharacterName(char.name || char.id || '')
  const legacy = {
    age: char.age,
    face: char.face || char.faceFeatures || char.features,
    hair: char.hair || char.hairStyle,
    costume: char.costume || char.outfit || char.clothing,
    body: char.body || char.build,
    signature: char.signature || char.mark
  }
  const identity = normalizeIdentity(char.identity, legacy)
  let looks = Array.isArray(char.looks) ? char.looks.map((item, index) => normalizeLook(item, index)) : []
  if (!looks.length) {
    // 兼容旧人物卡：旧字段拆进 identity 后，默认形象只保留发型/服装；
    // 旧 appearance 全文只作为兜底（否则编辑时会把整段外观重复塞进「形象描述」）。
    const appearance = asText(char.appearance || char.design || char.look || char.description)
    const hasIdentity = Boolean(identity.age || identity.face || identity.hairBase || identity.body || identity.signature)
    const fallbackDescription = (hasIdentity || legacy.hair || legacy.costume) ? '' : appearance
    looks = [normalizeLook({
      name: '默认形象',
      hair: legacy.hair,
      costume: legacy.costume,
      description: fallbackDescription
    }, 0)]
  }
  // 兼容输出：从身份 + 第一套形象合成旧字段（供旧代码/面板使用）
  const primary = looks[0]
  const fields = {
    age: identity.age,
    face: identity.face,
    hair: primary.hair || identity.hairBase,
    costume: primary.costume,
    body: identity.body,
    signature: identity.signature
  }
  const appearance = asText(char.appearance || char.design || char.look || char.description) || composeCharacterAppearance(fields) || primary.description
  return { name, identity, looks, appearance, ...fields, notes: asText(char.notes) }
}

function formatTimestamp(ms) {
  const date = new Date(Number(ms) || Date.now())
  return date.toISOString()
}

async function pathExists(filePath) {
  try {
    const stat = await fs.stat(filePath)
    return stat
  } catch (error) {
    return null
  }
}

async function readJson(filePath, fallback = null) {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    if (!text || !text.trim()) return fallback
    return JSON.parse(text)
  } catch (error) {
    return fallback
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = filePath + '.tmp-' + process.pid + '-' + Date.now().toString(36)
  await fs.writeFile(tmpPath, JSON.stringify(value, null, 2) + '\n', 'utf8')
  await fs.rename(tmpPath, filePath)
  return filePath
}

async function appendJsonl(filePath, entry) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.appendFile(filePath, JSON.stringify(entry) + '\n', 'utf8')
  return filePath
}

async function readJsonl(filePath, limit = CHANGE_LOG_LIMIT) {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    const rows = text.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
      try { return JSON.parse(line) } catch (error) { return null }
    }).filter(Boolean)
    return rows.slice(Math.max(0, rows.length - limit))
  } catch (error) {
    return []
  }
}

/**
 * 分镜自查（文章方法论）：景别错开、一镜一事、台词拆镜头、空镜、总时长、钩子。
 * 返回 { warnings: [{ code, message }], stats: { shotCount, totalDuration } }，不抛错。
 */
/** 环境描写归纳：environment 优先，回退 scene + lighting（兼容旧分镜）。 */
const TIME_WORDS = ['清晨', '早晨', '上午', '中午', '正午', '下午', '黄昏', '傍晚', '日落', '夜晚', '深夜', '凌晨', '白天', '夜景', '夜色']
const WEATHER_WORDS = ['雨', '雪', '雾', '霓虹', '阳光', '阴天', '晴天']
export function shotEnvironmentText(shot) {
  const value = shot && typeof shot === 'object' ? shot : {}
  return [value.environment, value.scene, value.lighting].map((item) => asText(item)).filter(Boolean).join('；')
}
function findTimeWord(text) {
  const value = asText(text)
  for (const word of TIME_WORDS) if (value.indexOf(word) !== -1) return word
  return ''
}
export function findWeatherWord(text) {
  const value = asText(text)
  for (const word of WEATHER_WORDS) if (value.indexOf(word) !== -1) return word
  return ''
}

/** 区域设定自查：缺布局/标志物/光线时提示（区域大，描述越全越稳）。 */
export function validateAreas(areas) {
  const warnings = []
  const list = Array.isArray(areas) ? areas : []
  if (!list.length) return warnings
  for (const area of list) {
    if (!area.description) warnings.push({ code: 'AREA_MISSING_DESCRIPTION', message: '区域「' + area.name + '」缺少描述：写清地点/氛围' })
    if (!area.layout) warnings.push({ code: 'AREA_MISSING_LAYOUT', message: '区域「' + area.name + '」缺少空间布局：入口/中心/标志物的位置关系（镜头方向与连贯性靠它）' })
    if (!area.lighting) warnings.push({ code: 'AREA_MISSING_LIGHTING', message: '区域「' + area.name + '」缺少光线/色调：写清时间/光源，避免各镜头光色不一致' })
    if (!area.landmarks.length && !area.props.length) warnings.push({ code: 'AREA_NO_LANDMARKS', message: '区域「' + area.name + '」没有标志物/贯穿道具：建议写 2~3 个（如灯塔、旧锚），保证同一区域的镜头认得出来' })
  }
  return warnings
}

/** 幕自查：cast 引用人物/形象是否存在、区域引用是否存在、报幕是否为空。 */
export function validateActs(acts, characters = [], areas = []) {
  const warnings = []
  const list = Array.isArray(acts) ? acts : []
  const charNames = new Set((Array.isArray(characters) ? characters : []).map((item) => item && item.name))
  const areaIds = new Set((Array.isArray(areas) ? areas : []).map((item) => item && item.id))
  if (!list.length) return warnings
  for (const act of list) {
    if (!act.cast.length && !act.titleCard.text) warnings.push({ code: 'ACT_EMPTY', message: '幕「' + act.name + '」既没有出场人物也没有报幕：至少声明本幕 cast' })
    for (const member of act.cast) {
      if (charNames.size && !charNames.has(member.name)) warnings.push({ code: 'ACT_CAST_UNKNOWN', message: '幕「' + act.name + '」的出场人物「' + member.name + '」不在人物卡里：先 action=save-characters 保存该角色' })
    }
    if (act.areaId && areaIds.size && !areaIds.has(act.areaId)) warnings.push({ code: 'ACT_AREA_UNKNOWN', message: '幕「' + act.name + '」引用的区域「' + act.areaId + '」不存在：先 action=save-areas 保存区域' })
  }
  return warnings
}

export function validateShotList(shots, characters = [], context = {}) {
  const warnings = []
  const list = Array.isArray(shots) ? shots.filter((item) => item && typeof item === 'object') : []
  const stats = { shotCount: list.length, totalDuration: 0 }
  if (!list.length) {
    return { warnings: [{ code: 'EMPTY', message: '分镜为空：至少写 1 个镜头' }], stats }
  }
  for (let i = 0; i < list.length; i++) {
    const shot = list[i]
    const label = shot.id || ('Shot' + (i + 1))
    const prev = i > 0 ? list[i - 1] : null
    stats.totalDuration += Number(shot.duration) > 0 ? Number(shot.duration) : 0
    if (!shot.shotType) warnings.push({ code: 'MISSING_SHOT_TYPE', message: label + ' 缺少景别：写远景/全景/中景/近景/特写（相邻镜头要远近交替）' })
    else if (SHOT_TYPES.indexOf(shot.shotType) === -1) warnings.push({ code: 'SHOT_TYPE_UNKNOWN', message: label + ' 景别「' + shot.shotType + '」不在规范内：建议用 远景/全景/中景/近景/特写' })
    if (prev && shot.shotType && prev.shotType && shot.shotType === prev.shotType) warnings.push({ code: 'SHOT_TYPE_REPEAT', message: label + ' 与 ' + prev.id + ' 景别相同（' + shot.shotType + '）：相邻镜头要远近交替，否则画面闷' })
    if (!shot.duration) warnings.push({ code: 'MISSING_DURATION', message: label + ' 缺少时长：先估每镜时长，再把全片总时长加一遍' })
    else if (Number(shot.duration) > 8) warnings.push({ code: 'SHOT_TOO_LONG', message: label + ' 时长 ' + shot.duration + ' 秒偏长：短视频单镜头建议 3~8 秒，按动作/人物位置拆成多个镜头' })
    if (shot.action && Number(shot.duration) > 8 && /固定/.test(asText(shot.movement))) warnings.push({ code: 'SHOT_STATIC_LONG', message: label + ' 固定机位 + ' + shot.duration + ' 秒：即使机位固定，也要按「动作变化 / 人物入画 / 位置变化」拆成多个镜头（每镜 3~8 秒）' })
    if (!shot.action) warnings.push({ code: 'MISSING_ACTION', message: label + ' 缺少画面内容：一句话写清这个镜头拍什么、人在干嘛' })
    else if (shot.action.length > 24 && /然后|接着|随后|之后|再|又/.test(shot.action)) warnings.push({ code: 'ACTION_TOO_MANY', message: label + ' 一个镜头塞了多个动作：一个镜头只做一件事，拆成两个镜头' })
    if (shot.action) {
      const phases = (shot.action.match(/\d+\s*[-~到至]\s*\d+\s*秒/g) || []).length
      if (phases >= 2) warnings.push({ code: 'ACTION_MULTI_PHASE', message: label + ' 画面按时间写了 ' + phases + ' 段动作：一段动作对应一个镜头，拆成 ' + phases + ' 个镜头' })
      const moves = ['进入', '入画', '走到', '走进', '跑向', '跑到', '飞向', '移到', '移动到', '移动到', '出现在', '离开', '退场', '登场']
      const hitMoves = moves.filter((word) => shot.action.includes(word))
      if (hitMoves.length >= 2) warnings.push({ code: 'ACTION_POSITION_CHANGE', message: label + ' 人物进出/位置变化（' + hitMoves.slice(0, 3).join('/') + '…）：按人物位置变化拆镜头' })
    }
    if (shot.dialogue && shot.dialogue.length > 60) warnings.push({ code: 'DIALOGUE_TOO_LONG', message: label + ' 台词过长（' + shot.dialogue.length + ' 字）：台词按镜头拆开，说到哪句配哪个画面' })
    if (shot.dialogue && !shot.action) warnings.push({ code: 'DIALOGUE_NO_ACTION', message: label + ' 有台词但画面内容是空的：声音要跟着画面走' })
    if (shot.subtitle && shot.subtitle.length > 40) warnings.push({ code: 'SUBTITLE_TOO_LONG', message: label + ' 字幕过长（' + shot.subtitle.length + ' 字）：屏幕字幕建议一句话' })
    if (!shot.movement) warnings.push({ code: 'MISSING_MOVEMENT', message: label + ' 缺少运镜：写固定/推/拉/摇/移/跟拍（新手优先固定）' })
    else if (MOVEMENTS.indexOf(shot.movement) === -1) warnings.push({ code: 'MOVEMENT_UNKNOWN', message: label + ' 运镜「' + shot.movement + '」建议用大白话：固定/推/拉/摇/移/跟拍' })
    const envText = shotEnvironmentText(shot)
    if (!envText) warnings.push({ code: 'MISSING_ENVIRONMENT', message: label + ' 缺少环境描写：写清时间/天气/光线/色彩（如「黄昏，雨后街道，暖橙侧光」），否则生成时各镜头环境容易不统一' })
    else if (!asText(shot.environment)) warnings.push({ code: 'NO_SHOT_ENVIRONMENT', message: label + ' 只有场景/光线、没有 environment 环境描写：建议明写「时间 + 天气 + 光线 + 色彩基调」，避免生成后黄昏变夜晚' })
    if (prev) {
      const prevEnv = shotEnvironmentText(prev)
      const prevTime = findTimeWord(prevEnv)
      const curTime = findTimeWord(envText)
      if (prevTime && curTime && prevTime !== curTime) warnings.push({ code: 'ENVIRONMENT_JUMP', message: label + ' 环境时间是「' + curTime + '」，与 ' + (prev.id || '上一镜') + ' 的「' + prevTime + '」不一致：同一场戏时间要统一，否则生成后环境会变（黄昏变夜晚）' })
    }
  }
  const seenPurpose = new Map()
  for (const shot of list) {
    const label = shot.id || '未知镜头'
    if (!shot.purpose) warnings.push({ code: 'MISSING_PURPOSE', message: label + ' 缺少镜头任务：一句话写「观众从这个镜头学到/看到什么」，没有任务的镜头删掉' })
    else {
      const key = shot.purpose.trim()
      if (seenPurpose.has(key)) warnings.push({ code: 'PURPOSE_REPEAT', message: label + ' 与 ' + seenPurpose.get(key) + ' 镜头任务重复：传达同样内容就删/合并一个' })
      else seenPurpose.set(key, label)
    }
  }
  const leftRight = (value) => /左\s*[→\-—]?\s*右/.test(String(value || ''))
  const rightLeft = (value) => /右\s*[→\-—]?\s*左/.test(String(value || ''))
  for (let i = 1; i < list.length; i++) {
    const previous = list[i - 1]
    const current = list[i]
    if (!previous.screenDirection || !current.screenDirection) continue
    const conflict = (leftRight(previous.screenDirection) && rightLeft(current.screenDirection)) || (rightLeft(previous.screenDirection) && leftRight(current.screenDirection))
    if (conflict) warnings.push({ code: 'DIRECTION_JUMP', message: current.id + ' 与 ' + previous.id + ' 画面方向相反：检查是否跳轴（180 度法则）；反打/转场要在 transition 写清楚' })
  }
  for (const shot of list) {
    if (String(shot.risk).toLowerCase() === 'high' || shot.risk === '高') warnings.push({ code: 'HIGH_RISK', message: shot.id + ' 标记为高风险镜头：先单独测试这个镜头，再批量做其他镜头（省钱且更早发现问题）' })
  }
  if (!list.some((shot) => !shot.dialogue && shot.scene)) warnings.push({ code: 'NO_ESTABLISHING', message: '缺少空镜/环境镜头：全片都是有人说话的镜头，建议加一个交代环境的空镜' })
  if (!list.some((shot) => shotEnvironmentText(shot))) warnings.push({ code: 'NO_ENVIRONMENT', message: '全片没有任何环境描写：至少写项目级 sceneMap.environment（时间/天气/光线/色彩基调），生成时会逐镜注入，保证环境统一' })
  if (stats.totalDuration > 60) warnings.push({ code: 'TOTAL_TOO_LONG', message: '全片总时长 ' + stats.totalDuration + ' 秒超过 60 秒：短视频建议控制在 60 秒内，先删减镜头' })
  if (characters.length && !list.some((shot) => Array.isArray(shot.characters) && shot.characters.length)) warnings.push({ code: 'NO_SHOT_CHARACTERS', message: '分镜没有标注出场角色：生成时人物卡无法逐镜注入' })
  // —— 幕/区域/人物形象结构自查（context 可选，兼容旧调用）——
  const acts = Array.isArray(context && context.acts) ? context.acts : []
  const areas = Array.isArray(context && context.areas) ? context.areas : []
  const actIds = new Set(acts.map((item) => item && item.id))
  const areaIds = new Set(areas.map((item) => item && item.id))
  const charMap = new Map((Array.isArray(characters) ? characters : []).map((item) => [typeof item === 'string' ? item : (item && item.name), item]))
  for (const shot of list) {
    const label = shot.id || '未知镜头'
    if (acts.length && shot.actId && !actIds.has(shot.actId)) warnings.push({ code: 'SHOT_ACT_UNKNOWN', message: label + ' 归属的幕「' + shot.actId + '」不存在：先 action=save-acts 保存幕（或删除该字段）' })
    if (acts.length && !shot.actId) warnings.push({ code: 'SHOT_NO_ACT', message: label + ' 没有归属幕：建议写 actId（按幕组织分镜），否则多幕结构下无法按幕注入人物/区域' })
    if (shot.areaId && areaIds.size && !areaIds.has(shot.areaId)) warnings.push({ code: 'SHOT_AREA_UNKNOWN', message: label + ' 引用的区域「' + shot.areaId + '」不存在：先 action=save-areas 保存区域' })
    const shotCast = Array.isArray(shot.cast) ? shot.cast : []
    for (const member of shotCast) {
      const char = charMap.get(member.name)
      if (!char) { warnings.push({ code: 'SHOT_CAST_UNKNOWN', message: label + ' 的出场人物「' + member.name + '」不在人物卡里' }); continue }
      if (member.lookId && Array.isArray(char.looks) && char.looks.length && !char.looks.some((look) => look.id === member.lookId)) {
        warnings.push({ code: 'SHOT_LOOK_UNKNOWN', message: label + ' 引用的形象「' + member.lookId + '」在人物「' + member.name + '」里不存在' })
      }
    }
  }
  // 人物三视图完整性（文本规范；缺的不硬拦，只提示）
  for (const char of Array.isArray(characters) ? characters : []) {
    if (!char || !char.name) continue
    const looks = Array.isArray(char.looks) ? char.looks : []
    const primary = looks[0] || null
    if (!primary) { warnings.push({ code: 'CHAR_NO_LOOK', message: '人物「' + char.name + '」没有形象变体（looks）：至少写一套默认形象' }); continue }
    const views = primary.views || {}
    const missing = ['front', 'side', 'back'].filter((key) => !views[key])
    if (missing.length) warnings.push({ code: 'CHAR_VIEWS_INCOMPLETE', message: '人物「' + char.name + '」的「' + primary.name + '」三视图不完整（缺 ' + missing.join('/') + '）：建议补正面/侧面/背面描述，跨镜头人物才稳定' })
  }
  return { warnings, stats }
}

/** 用角色外观 + 分镜镜头组装最终提示词（生成时注入给 AI）。 */
function composeShotPrompt(project, shot, extraPrompt) {
  const lines = []
  lines.push('【视频项目】' + project.videoName)
  if (project.style) lines.push('【整体风格】' + project.style)
  const sceneMap = project.sceneMap && typeof project.sceneMap === 'object' ? project.sceneMap : {}
  if (sceneMap.environment) lines.push('【全片环境（所有镜头必须一致）】' + sceneMap.environment)
  const baseline = project.baseline && typeof project.baseline === 'object' ? project.baseline : {}
  const fixed = []
  if (baseline.ratio) fixed.push('画面比例：' + baseline.ratio)
  if (baseline.styleCard) fixed.push('风格卡：' + baseline.styleCard)
  if (fixed.length) lines.push('【创作参数（所有镜头保持一致）】' + fixed.join('；'))
  // —— 幕（叙事单位）：本幕标题/目的/情绪/报幕 ——
  const acts = Array.isArray(project.acts) ? project.acts : []
  const act = shot && shot.actId ? acts.find((item) => item.id === shot.actId || item.name === shot.actId) || null : (acts[0] || null)
  if (act) {
    lines.push('【本幕 · ' + (act.name || act.id) + '】')
    if (act.purpose) lines.push('本幕目的：' + act.purpose)
    if (act.mood) lines.push('情绪基调：' + act.mood)
    if (act.titleCard && act.titleCard.text) lines.push('报幕（幕标题卡）：' + act.titleCard.text + (act.titleCard.style ? '（样式：' + act.titleCard.style + '）' : ''))
  }
  // —— 区域设定（本幕/本镜所在区域，全幕统一） ——
  const areas = Array.isArray(project.areas) ? project.areas : []
  const areaId = (shot && shot.areaId) || (act && act.areaId) || ''
  const area = areaId ? areas.find((item) => item.id === areaId || item.name === areaId) || null : null
  if (area) {
    lines.push('【区域设定（同一区域所有镜头必须一致）】' + (area.name || area.id))
    if (area.description) lines.push('区域描述：' + area.description)
    if (area.layout) lines.push('空间布局：' + area.layout)
    if (area.landmarks && area.landmarks.length) lines.push('标志物：' + area.landmarks.join('、'))
    if (area.lighting) lines.push('区域光线：' + area.lighting)
    if (area.props && area.props.length) lines.push('贯穿道具：' + area.props.join('、'))
    lines.push('【区域一致性（硬性）】本镜头所在区域的空间关系、标志物位置、光源与色调必须与【区域设定】一致：不得改变建筑朝向、标志物位置或光源方向；跨区域镜头要交代移动方向。')
  }
  // —— 人物：本幕出场（cast）优先；镜头级 cast 覆盖；无幕/无 cast 时兼容旧行为（全部人物） ——
  const chars = Array.isArray(project.characters) ? project.characters : []
  const shotCast = shot && Array.isArray(shot.cast) ? shot.cast : []
  const actCast = act && Array.isArray(act.cast) ? act.cast : []
  const castList = shotCast.length ? shotCast : actCast
  const castMembers = castList.length ? castList : (acts.length ? [] : chars.map((char) => ({ name: char.name, lookId: '' })))
  const charMap = new Map(chars.map((char) => [char.name, char]))
  const usedChars = castMembers.map((member) => ({ member, char: charMap.get(member.name) })).filter((item) => item.char)
  if (usedChars.length) {
    lines.push('【人物卡（本幕出场）】')
    for (const { member, char } of usedChars) {
      const identity = char.identity && typeof char.identity === 'object' ? char.identity : {}
      const looks = Array.isArray(char.looks) ? char.looks : []
      const look = (member.lookId && looks.find((item) => item.id === member.lookId)) || looks[0] || null
      lines.push('- ' + char.name + (look && look.description ? '：' + look.description : (look ? '（本幕形象：' + look.name + '）' : '')))
      let firstLine = true
      const appendLine = (text) => {
        if (!text) return
        if (firstLine) { lines[lines.length - 1] += '；' + text; firstLine = false } else lines.push('  ' + text)
      }
      const base = []
      if (identity.age) base.push('年龄：' + identity.age)
      if (identity.face) base.push('长相：' + identity.face)
      if (identity.hairBase) base.push('发型根基：' + identity.hairBase)
      if (identity.body) base.push('体型：' + identity.body)
      if (identity.signature) base.push('标志性特征：' + identity.signature)
      if (base.length) lines.push('  基础设定（全片不变）：' + base.join('；'))
      if (look) {
        const lookParts = []
        if (look.hair) lookParts.push('发型/发色：' + look.hair)
        if (look.costume) lookParts.push('服装：' + look.costume)
        if (look.description) lookParts.push('形象描述：' + look.description)
        if (lookParts.length) lines.push('  本幕形象：' + lookParts.join('；'))
        const views = look.views || {}
        const viewParts = []
        if (views.front) viewParts.push('正面：' + views.front)
        if (views.side) viewParts.push('侧面：' + views.side)
        if (views.back) viewParts.push('背面：' + views.back)
        if (viewParts.length) lines.push('  三视图：' + viewParts.join('；'))
      }
    }
    lines.push('【人物一致性（硬性）】本幕出场人物的脸型、五官、体型、身份特征必须与基础设定一致，不得换脸；只允许按「本幕形象」改变服装/发型/状态。')
  } else if (castList.length) {
    lines.push('【人物卡（本幕出场）】' + castList.map((member) => member.name + (member.lookId ? '（' + member.lookId + '）' : '')).join('、') + '（人物卡未保存，先 save-characters）')
  }
  const shots = Array.isArray(project.shots) ? project.shots : []
  if (shot) {
    lines.push('【分镜 · ' + shot.id + '】')
    if (shot.name) lines.push('镜头名称：' + shot.name)
    const frame = []
    if (shot.shotType) frame.push('景别/机位：' + shot.shotType)
    if (shot.camera) frame.push('机位：' + shot.camera)
    if (shot.movement) frame.push('镜头运动：' + shot.movement)
    if (shot.duration) frame.push('时长：' + shot.duration + ' 秒')
    if (frame.length) lines.push(frame.join('；'))
    if (shot.scene) lines.push('场景：' + shot.scene)
    if (shot.lighting) lines.push('光线/色调：' + shot.lighting)
    if (shot.action) lines.push('画面内容：' + shot.action)
    if (shot.dialogue) lines.push('台词：' + shot.dialogue)
    if (shot.subtitle) lines.push('字幕：' + shot.subtitle)
    if (shot.sound) lines.push('音效：' + shot.sound)
    if (shot.transition) lines.push('转场：' + shot.transition)
    if (shot.characters.length) lines.push('出场角色：' + shot.characters.join('、'))
    const shotEnvironment = shot.environment || [shot.scene, shot.lighting].filter(Boolean).join('；')
    if (shotEnvironment) lines.push('环境：' + shotEnvironment)
    else if (sceneMap.environment) lines.push('环境：按【全片环境】执行（本镜未单独写环境）')
    if (shot.notes) lines.push('备注：' + shot.notes)
    lines.push('【环境一致性（硬性）】本镜头的时间/天气/光线/色彩基调必须与【全片环境】和前序镜头完全一致：不得从黄昏变成夜晚、不得改变霓虹灯/路灯/阳光等光源的方向与颜色；生成时优先遵守本镜环境描写。')
  } else if (shots.length) {
    lines.push('【分镜总览】共 ' + shots.length + ' 个镜头')
    for (const item of shots) {
      const parts = [item.id]
      if (item.name) parts.push(item.name)
      if (item.action) parts.push(item.action)
      lines.push('- ' + parts.join('：'))
    }
  }
  const extra = asText(extraPrompt)
  if (extra) lines.push('【附加要求】' + extra)
  let text = lines.join('\n')
  if (text.length > MAX_PROJECT_PROMPT_CHARS) {
    text = text.slice(0, MAX_PROJECT_PROMPT_CHARS - 20) + '…（以上为项目资料摘要）'
  }
  return text
}

/**
 * 创建视频项目仓储。
 * @param {object} options - root：projects 目录绝对路径（默认注入由 service 提供）。
 */
export function createProjects(options = {}) {
  const root = options.root || defaultProjectsRoot(options.env)
  const imageGen = options.imagegen && typeof options.imagegen === 'object'
    ? options.imagegen
    : { generateSketchImage, buildSketchPrompt, resolveImageGenConfig, resolveSketchSize, saveSketchImage }

  function projectDir(name) {
    return path.join(root, normalizeProjectName(name))
  }

  function shotsDir(name) {
    return path.join(projectDir(name), 'Shots')
  }

  function charactersDir(name) {
    return path.join(projectDir(name), 'Charactor')
  }

  function videoDir(name) {
    return path.join(projectDir(name), 'Video')
  }

  async function assertProject(name) {
    const dir = projectDir(name)
    const stat = await pathExists(dir)
    if (!stat || !stat.isDirectory()) throw projectError('项目不存在：' + normalizeProjectName(name), 'NotFound', 404)
    return dir
  }

  async function readShotsFile(name) {
    const payload = await readJson(path.join(shotsDir(name), 'mainShots.json'), null)
    const base = payload && typeof payload === 'object' ? payload : {}
    const shots = Array.isArray(base.shots) ? base.shots.map((item, index) => normalizeShot(item, index)) : []
    return {
      videoName: asText(base.videoName) || normalizeProjectName(name),
      style: asText(base.style),
      notes: asText(base.notes),
      baseline: normalizeBaseline(base.baseline),
      sceneMap: normalizeSceneMap(base.sceneMap),
      // 项目级设定：区域列表（世界地图）与幕（叙事单位）
      areas: Array.isArray(base.areas) ? base.areas.map((item, index) => normalizeArea(item, index)) : [],
      acts: Array.isArray(base.acts) ? base.acts.map((item, index) => normalizeAct(item, index)) : [],
      characters: Array.isArray(base.characters) ? base.characters.map((item) => asText(item)).filter(Boolean) : [],
      // 分镜/人物卡是否已经过用户确认（代码强制的流程状态；保存新内容会重置为 false）
      planConfirmed: base.planConfirmed === true,
      planConfirmedAt: Number(base.planConfirmedAt) || 0,
      shots,
      updatedAt: Number(base.updatedAt) || 0
    }
  }

  /** 把分镜文件里的确认状态重置为「未确认」（内容变了，旧确认作废）。 */
  async function resetPlanConfirmed(name) {
    const filePath = path.join(shotsDir(name), 'mainShots.json')
    const payload = await readJson(filePath, null)
    if (!payload || typeof payload !== 'object') return
    payload.planConfirmed = false
    payload.planConfirmedAt = 0
    await writeJson(filePath, payload)
  }

  async function readCharacters(name) {
    const dir = charactersDir(name)
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (error) {
      return []
    }
    const list = []
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue
      const payload = await readJson(path.join(dir, entry.name), null)
      if (!payload || typeof payload !== 'object') continue
      const normalized = normalizeCharacter({
        ...payload,
        name: asText(payload.name) || entry.name.replace(/\.json$/i, '')
      })
      list.push({ ...normalized, updatedAt: Number(payload.updatedAt) || 0 })
    }
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    return list
  }

  /** 验收记录按版本去重：每个版本保留最新一条（旧重复数据兼容）。 */
function dedupeReviews(reviews) {
  const list = Array.isArray(reviews) ? reviews : []
  const latest = new Map()
  for (const item of list) {
    if (!item) continue
    const key = String(item.version || '')
    if (!key) { latest.set('__' + Math.random(), item); continue }
    const prev = latest.get(key)
    if (!prev || String(item.at || '') >= String(prev.at || '')) latest.set(key, item)
  }
  return [...latest.values()]
}

async function readVersions(name, shotId) {
    const dir = path.join(videoDir(name), shotId)
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (error) {
      return { versions: [], changeLog: [] }
    }
    const versions = []
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^V0\.\d+$/.test(entry.name)) continue
      const versionDir = path.join(dir, entry.name)
      const meta = await readJson(path.join(versionDir, 'meta.json'), null)
      const videoPath = path.join(versionDir, 'video.mp4')
      const stat = await pathExists(videoPath)
      let nextMeta = meta && typeof meta === 'object' ? meta : null
      // 旧版本没有时长/类型信息：用 ffmpeg 探测一次并写回（用于区分「分镜片段 / 全片」）
      if (stat && stat.isFile() && (!nextMeta || nextMeta.durationSeconds === undefined || nextMeta.videoWidth === undefined)) {
        try {
          const ffmpeg = resolveFfmpeg(process.env)
          const durationSeconds = ffmpeg ? Number(probeDuration(ffmpeg, videoPath)) || 0 : 0
          let videoSize = null
          try { videoSize = ffmpeg ? probeVideoSize(ffmpeg, videoPath) : null } catch (error) { videoSize = null }
          if (durationSeconds > 0) {
            let shotDuration = 0
            try {
              const shotsFile = await readShotsFile(name)
              const shotData = (shotsFile.shots || []).find((item) => item.id === shotId)
              shotDuration = shotData && Number(shotData.duration) > 0 ? Number(shotData.duration) : 0
            } catch (error) { shotDuration = 0 }
            const suspectedFull = nextMeta && nextMeta.kind ? false : (shotDuration > 0 && durationSeconds > shotDuration * 1.5)
            nextMeta = {
              ...(nextMeta || {}),
              durationSeconds,
              videoWidth: videoSize ? videoSize.width : (nextMeta && nextMeta.videoWidth) || 0,
              videoHeight: videoSize ? videoSize.height : (nextMeta && nextMeta.videoHeight) || 0,
              shotDuration,
              suspectedFull,
              kind: nextMeta && nextMeta.kind ? nextMeta.kind : (suspectedFull ? 'full' : 'unknown')
            }
            await writeJson(path.join(versionDir, 'meta.json'), nextMeta)
          }
        } catch (error) { /* 探测失败不阻塞列表 */ }
      }
      versions.push({
        version: entry.name,
        dir: versionDir,
        videoPath: stat && stat.isFile() ? videoPath : '',
        bytes: stat && stat.isFile() ? stat.size : 0,
        meta: nextMeta
      })
    }
    versions.sort((a, b) => {
      const na = Number((/^V0\.(\d+)$/.exec(a.version) || [])[1] || 0)
      const nb = Number((/^V0\.(\d+)$/.exec(b.version) || [])[1] || 0)
      return na - nb
    })
    return {
      versions,
      changeLog: await readJsonl(path.join(dir, 'ChangeInfo.jsonl')),
      reviews: dedupeReviews(await readJsonl(path.join(dir, 'review.jsonl'))),
      versionNotes: await readJsonl(path.join(dir, 'versionNotes.jsonl')),
      adopted: await readJson(path.join(dir, 'adopted.json'), null)
    }
  }

  async function fullVideoInfo(name) {
    const dir = path.join(videoDir(name), 'FullVideo')
    const meta = await readJson(path.join(dir, 'meta.json'), null)
    const stat = await pathExists(path.join(dir, 'video.mp4'))
    if (!meta && !stat) return null
    return {
      dir,
      videoPath: stat && stat.isFile() ? path.join(dir, 'video.mp4') : '',
      bytes: stat && stat.isFile() ? stat.size : 0,
      meta: meta && typeof meta === 'object' ? meta : null,
      changeLog: await readJsonl(path.join(dir, 'ChangeInfo.jsonl'))
    }
  }

  async function nextVersionName(shotDir) {
    let entries = []
    try {
      entries = await fs.readdir(shotDir, { withFileTypes: true })
    } catch (error) {
      return 'V0.1'
    }
    let max = 0
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const match = /^V0\.(\d+)$/.exec(entry.name)
      if (match) max = Math.max(max, Number(match[1]))
    }
    return 'V0.' + (max + 1)
  }

  return {
    root,

    /** 项目列表（摘要）。 */
    async listProjects() {
      let entries = []
      try {
        entries = await fs.readdir(root, { withFileTypes: true })
      } catch (error) {
        return []
      }
      const list = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const project = await readShotsFile(entry.name)
        const characters = await readCharacters(entry.name)
        const videoRoot = videoDir(entry.name)
        let shotDirs = []
        try { shotDirs = await fs.readdir(videoRoot, { withFileTypes: true }) } catch (error) { shotDirs = [] }
        let versions = 0
        let hasFullVideo = false
        for (const shotEntry of shotDirs) {
          if (!shotEntry.isDirectory()) continue
          if (shotEntry.name === 'FullVideo') {
            hasFullVideo = Boolean(await pathExists(path.join(videoRoot, 'FullVideo', 'video.mp4')))
            continue
          }
          let versionDirs = []
          try { versionDirs = await fs.readdir(path.join(videoRoot, shotEntry.name), { withFileTypes: true }) } catch (error) { versionDirs = [] }
          versions += versionDirs.filter((item) => item.isDirectory() && /^V0\.\d+$/.test(item.name)).length
        }
        list.push({
          name: entry.name,
          updatedAt: Math.max(project.updatedAt, ...characters.map((item) => item.updatedAt)),
          style: project.style,
          baseline: project.baseline,
          hasBaseline: Boolean(project.baseline && Object.keys(project.baseline).length),
          characters: characters.length,
          shots: project.shots.length,
          versions,
          fullVideo: hasFullVideo
        })
      }
      list.sort((a, b) => b.updatedAt - a.updatedAt)
      return list
    },

    /** 创建项目（幂等：已存在时返回现有项目）。 */
    async createProject(name, input = {}) {
      const projectName = normalizeProjectName(name)
      const dir = projectDir(projectName)
      await fs.mkdir(path.join(dir, 'Charactor'), { recursive: true })
      await fs.mkdir(path.join(dir, 'Shots'), { recursive: true })
      await fs.mkdir(path.join(dir, 'Video'), { recursive: true })
      const existing = await pathExists(path.join(shotsDir(projectName), 'mainShots.json'))
      if (!existing) {
        const now = Date.now()
        await writeJson(path.join(shotsDir(projectName), 'mainShots.json'), {
          videoName: projectName,
          style: asText(input.style),
          notes: asText(input.notes),
          baseline: normalizeBaseline(input.baseline || input.params),
          sceneMap: normalizeSceneMap(input.sceneMap || input.scene_map),
          characters: [],
          shots: [],
          updatedAt: now
        })
        await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), {
          at: new Date(now).toISOString(),
          scope: 'project',
          op: 'create',
          target: projectName,
          summary: '创建项目',
          detail: asText(input.style) ? '风格：' + asText(input.style) : ''
        })
      }
      return this.getProject(projectName)
    },

    /** 项目详情（人物卡 + 分镜 + 变更记录 + 视频版本）。 */
    async getProject(name) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shots = await readShotsFile(projectName)
      const characters = await readCharacters(projectName)
      const changes = await readJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'))
      const videoRoot = videoDir(projectName)
      let shotDirs = []
      try { shotDirs = await fs.readdir(videoRoot, { withFileTypes: true }) } catch (error) { shotDirs = [] }
      const videoShots = []
      for (const entry of shotDirs) {
        if (!entry.isDirectory() || entry.name === 'FullVideo') continue
        const info = await readVersions(projectName, entry.name)
        const reviews = info.reviews.map((item) => ({ ...item, checks: Array.isArray(item.checks) ? item.checks : [] }))
        const lastReview = reviews.length ? reviews[reviews.length - 1] : null
        videoShots.push({
          id: entry.name,
          versions: info.versions,
          changeLog: info.changeLog,
          reviews,
          notes: Array.isArray(info.versionNotes) ? info.versionNotes : [],
          adoptedVersion: info.adopted && info.adopted.version ? String(info.adopted.version) : '',
          approved: Boolean(lastReview && lastReview.pass === true)
        })
      }
      videoShots.sort((a, b) => a.id.localeCompare(b.id, 'zh', { numeric: true }))
      const fullVideo = await fullVideoInfo(projectName)
      // 按幕分组（供面板/智能体展示：每一幕有它的分镜、出场人物、区域、报幕）
      const acts = (shots.acts || []).map((act) => ({
        ...act,
        area: (shots.areas || []).find((area) => area.id === act.areaId) || null,
        shots: shots.shots.filter((shot) => (shot.actId || (shots.acts && shots.acts[0] && shots.acts[0].id) || '') === act.id)
      }))
      const unassignedShots = shots.shots.filter((shot) => !shot.actId)
      return {
        videoName: projectName,
        dir: projectDir(projectName),
        style: shots.style,
        notes: shots.notes,
        baseline: shots.baseline,
        sceneMap: shots.sceneMap,
        areas: shots.areas || [],
        acts,
        unassignedShots,
        characters,
        planConfirmed: shots.planConfirmed,
        planConfirmedAt: shots.planConfirmedAt,
        updatedAt: shots.updatedAt,
        shots: shots.shots,
        changes,
        video: { shots: videoShots, fullVideo }
      }
    },

    /** 删除项目目录（不可恢复）。 */
    async deleteProject(name) {
      const projectName = normalizeProjectName(name)
      const dir = projectDir(projectName)
      const stat = await pathExists(dir)
      if (!stat || !stat.isDirectory()) throw projectError('项目不存在：' + projectName, 'NotFound', 404)
      await fs.rm(dir, { recursive: true, force: true })
      return { ok: true, name: projectName, deleted: true }
    },

    /** 需求引导：把不完整的用户需求补全成表格（不落盘）。 */
    buildGuide(payload = {}) {
      return buildGuideData(payload)
    },

    /** 生成后分析：抽帧或按智能体观察生成对比报告（并写 review 记录）。 */
    async analyzeShot(name, shotId, input = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shotKey = normalizeShotId(shotId)
      const shots = await readShotsFile(projectName)
      const characters = await readCharacters(projectName)
      const shot = shots.shots.find((item) => item.id === shotKey)
      if (!shot) throw projectError('项目 ' + projectName + ' 中不存在镜头 ' + shotKey, 'SHOT_NOT_FOUND', 404)
      const payload = input && typeof input === 'object' ? input : {}
      const observed = Array.isArray(payload.observed) ? payload.observed : []
      const version = asText(payload.version)
      if (observed.length) {
        const checklist = buildChecklist({ characters, shot })
        const report = compareWithObserved({ checklist, shot, observed })
        const issues = report.diffs.map((item) => item.label + '：' + (item.observed || item.note || '与需求不一致'))
        const checks = checklist.map((item) => {
          const diff = report.diffs.find((entry) => entry.key === item.key)
          return { key: item.key, label: item.label, pass: !diff, note: diff ? (diff.observed || diff.note || '与需求不一致') : '符合' }
        })
        const capability = this.videoCapability()
        const strategy = buildStrategy({
          checks,
          shot,
          capability,
          feedback: asText(payload.feedback || payload.userFeedback),
          frameIndex: payload.frameIndex !== undefined ? payload.frameIndex : payload.failedFrame,
          frameCount: payload.frameCount
        })
        await this.saveShotReview(projectName, shotKey, {
          version,
          checks,
          strategy,
          notes: '画面分析报告（analyze）',
          reviewer: 'analyze'
        })
        return { ok: true, mode: 'report', shot: shotKey, report, issues, strategy, capability }
      }
      const videoPath = asText(payload.videoPath || payload.sourcePath)
      if (!videoPath) {
        throw projectError('analyze 需要 videoPath（视频文件路径）或 observed（逐项观察结果）', 'INVALID_ANALYZE_INPUT')
      }
      const framesDir = path.join(videoDir(projectName), shotKey, 'review-frames', String(Date.now()))
      const result = extractFrames({ videoPath, outDir: framesDir, count: payload.frameCount, ffmpegPath: asText(payload.ffmpegPath) })
      const checklist = buildChecklist({ characters, shot })
      return {
        ok: true,
        mode: 'frames',
        shot: shotKey,
        frames: result.frames,
        framesDir,
        duration: result.duration,
        ffmpegPath: result.ffmpegPath,
        capability: this.videoCapability(),
        checklist,
        hint: '逐帧查看 frames 后，把每项 pass/note 以 observed=[{"key":"checklist.key","pass":true|false,"note":"..."}] 传回 action=analyze 生成对比报告。'
      }
    },

    /** 当前视频项目保存位置（默认/插件配置/设置文件）。 */
    readLocation() {
      return readProjectLocation({ env: options.env })
    },

    /** 修改视频项目保存位置（重启应用后生效）。 */
    updateLocation(storageRoot) {
      return updateProjectLocation({ env: options.env, storageRoot })
    },

    /** 保存人物卡（全量替换；旧角色文件会被移除）。 */
    async saveCharacters(name, characters, meta = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const list = Array.isArray(characters) ? characters : []
      const normalized = list.map((item) => normalizeCharacter(item))
      const dir = charactersDir(projectName)
      await fs.mkdir(dir, { recursive: true })
      const now = Date.now()
      const keep = new Set(normalized.map((item) => item.name + '.json'))
      const existing = await fs.readdir(dir).catch(() => [])
      for (const fileName of existing) {
        if (!fileName.toLowerCase().endsWith('.json')) continue
        if (!keep.has(fileName)) await fs.rm(path.join(dir, fileName), { force: true })
      }
      for (const char of normalized) {
        await writeJson(path.join(dir, char.name + '.json'), { ...char, updatedAt: now })
      }
      await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), {
        at: new Date(now).toISOString(),
        scope: 'characters',
        op: 'save',
        target: normalized.map((item) => item.name).join(','),
        summary: '保存人物卡 ' + normalized.length + ' 个',
        detail: asText(meta.detail)
      })
      // 人物卡变化 → 之前的分镜/人物卡确认作废，必须重新让用户确认
      await resetPlanConfirmed(projectName)
      const warnings = []
      for (const char of normalized) {
        const looks = Array.isArray(char.looks) ? char.looks : []
        if (!looks.length) { warnings.push({ code: 'CHAR_NO_LOOK', message: '人物「' + char.name + '」缺少形象变体：至少写一套默认形象（服装/发型/三视图）' }); continue }
        looks.forEach((look, index) => {
          const missing = ['front', 'side', 'back'].filter((key) => !(look.views && look.views[key]))
          if (missing.length) warnings.push({ code: 'CHAR_VIEWS_INCOMPLETE', message: '人物「' + char.name + '」的「' + (look.name || ('形象 ' + (index + 1))) + '」三视图不完整（缺 ' + missing.join('/') + '）：补正面/侧面/背面描述，跨镜头人物才稳定' })
        })
      }
      // 用户勾选「人物三视图自动出图」时：保存人物卡后默认生成三视图（按次计费；失败只记 warning，不影响保存）
      if (readCharacterSheetEnabled(process.env)) {
        const capability = resolveImageGenerationCapability({ env: process.env })
        if (!capability.capable) {
          warnings.push({ code: 'CHAR_SHEET_DISABLED', message: '已开启「人物三视图自动出图」，但当前没有可用图像生成能力：' + capability.detail })
        } else {
          let generated = 0
          for (const char of normalized) {
            const looks = Array.isArray(char.looks) ? char.looks : []
            for (const look of looks) {
              if (generated >= 6) break
              try {
                const result = await this.generateCharacterSheet(projectName, { charName: char.name, lookId: look.id })
                generated += result.sheets.length
              } catch (error) {
                warnings.push({ code: 'CHAR_SHEET_FAILED', message: '人物「' + char.name + '」三视图自动生成失败（' + (look.name || look.id || '默认形象') + '）：' + (error && error.message ? error.message : String(error)) })
              }
            }
          }
          if (generated > 0) warnings.push({ code: 'CHAR_SHEET_GENERATED', message: '已自动生成人物三视图 ' + generated + ' 张（按次计费）' })
        }
      }
      return { ok: true, videoName: projectName, characters: normalized, dir, planConfirmed: false, warnings }
    },

    /** 保存分镜脚本（全量替换）。 */
    async saveShots(name, input = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const payload = input && typeof input === 'object' ? input : {}
      const shots = Array.isArray(payload.shots) ? payload.shots.map((item, index) => normalizeShot(item, index)) : []
      const now = Date.now()
      const previous = await readShotsFile(projectName)
      const baselineInput = payload.baseline || payload.params
      const next = {
        videoName: projectName,
        style: asText(payload.style) || previous.style,
        notes: asText(payload.notes) || previous.notes,
        baseline: baselineInput !== undefined ? normalizeBaseline(baselineInput) : previous.baseline,
        sceneMap: payload.sceneMap !== undefined || payload.scene_map !== undefined ? normalizeSceneMap(payload.sceneMap !== undefined ? payload.sceneMap : payload.scene_map) : previous.sceneMap,
        // 项目级设定：区域（世界地图）与幕；不传则保留原值
        areas: payload.areas !== undefined ? (Array.isArray(payload.areas) ? payload.areas.map((item, index) => normalizeArea(item, index)) : []) : (previous.areas || []),
        acts: payload.acts !== undefined ? (Array.isArray(payload.acts) ? payload.acts.map((item, index) => normalizeAct(item, index)) : []) : (previous.acts || []),
        characters: Array.isArray(payload.characters) ? payload.characters.map((item) => asText(item)).filter(Boolean) : previous.characters,
        // 保存新分镜 → 旧确认作废（用户确认的是旧版本）
        planConfirmed: false,
        planConfirmedAt: 0,
        shots,
        updatedAt: now
      }
      const characterCards = await readCharacters(projectName)
      const castNames = Array.from(new Set([...(next.characters || []), ...characterCards.map((item) => item.name)]))
      const validation = validateShotList(shots, castNames, { acts: next.acts, areas: next.areas })
      await writeJson(path.join(shotsDir(projectName), 'mainShots.json'), next)
      await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), {
        at: new Date(now).toISOString(),
        scope: 'shots',
        op: 'save',
        target: shots.map((item) => item.id).join(','),
        summary: '保存分镜 ' + shots.length + ' 个镜头',
        detail: asText(payload.detail)
      })
      return { ok: true, videoName: projectName, style: next.style, shots, updatedAt: now, warnings: validation.warnings, stats: validation.stats }
    },

    /** 更新项目级元信息（风格/备注/固定参数/全片环境/场景地图；不动分镜/幕/区域/人物）。 */
    async updateProjectMeta(name, patch = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const payload = patch && typeof patch === 'object' ? patch : {}
      const shotsFile = await readShotsFile(projectName)
      const next = {
        videoName: shotsFile.videoName || projectName,
        style: payload.style !== undefined ? asText(payload.style) : shotsFile.style,
        notes: payload.notes !== undefined ? asText(payload.notes) : shotsFile.notes,
        baseline: payload.baseline !== undefined ? normalizeBaseline(payload.baseline) : shotsFile.baseline,
        sceneMap: payload.sceneMap !== undefined ? normalizeSceneMap(payload.sceneMap) : shotsFile.sceneMap,
        areas: shotsFile.areas || [],
        acts: shotsFile.acts || [],
        characters: shotsFile.characters,
        planConfirmed: false,
        planConfirmedAt: 0,
        shots: shotsFile.shots,
        updatedAt: Date.now()
      }
      await writeJson(path.join(shotsDir(projectName), 'mainShots.json'), next)
      await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), {
        at: new Date().toISOString(),
        scope: 'project',
        op: 'update',
        target: projectName,
        summary: '更新项目信息（风格/固定参数/全片环境）',
        detail: asText(payload.detail)
      })
      return { ok: true, videoName: projectName, project: await this.getProject(projectName) }
    },

    /**
     * 生成人物三视图（正/侧/背并排一张图），写入该形象的 referenceImages。
     * @param {string} name - 项目名
     * @param {{charName:string, lookId?:string, fetchImpl?:Function, timeoutMs?:number}} options
     */
    async generateCharacterSheet(name, options = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const charName = asText(options.charName).trim()
      if (!charName) throw projectError('缺少人物名（charName）', 'INVALID_CHARACTER', 400)
      const capability = resolveImageGenerationCapability({ env: process.env })
      if (!capability.capable) {
        throw projectError('当前没有可用的图像生成能力，人物三视图出图已关闭：' + capability.detail, 'IMAGE_GEN_UNAVAILABLE', 409)
      }
      const config = resolveImageGenConfig({ env: process.env })
      if (!config.capable) throw projectError('图像生成配置不完整：' + config.reason, 'IMAGE_GEN_UNCONFIGURED', 409)
      const characters = await readCharacters(projectName)
      const char = characters.find((item) => item.name === charName)
      if (!char) throw projectError('项目 ' + projectName + ' 中不存在人物 ' + charName + '，请先用 save-characters 保存人物卡', 'CHARACTER_NOT_FOUND', 404)
      const looks = Array.isArray(char.looks) && char.looks.length ? char.looks : [{}]
      const wanted = asText(options.lookId).trim()
      const targets = wanted ? looks.filter((look) => (look.id === wanted)) : looks
      if (wanted && !targets.length) throw projectError('人物 ' + charName + ' 中不存在形象 ' + wanted, 'LOOK_NOT_FOUND', 404)
      const projectShots = await readShotsFile(projectName)
      // 人物三视图可单独设置模型；未设置时回退草图模型
      const model = readCharacterSheetModel(process.env) || config.model
      // 三视图是横向并排（正/侧/背）：按模型支持的尺寸集合选（MiniMax 用 2048x1152）
      const size = /minimax/i.test(String(model)) ? '2048x1152' : '1536x1024'
      const dir = path.join(projectDir(projectName), LOOK_DIR_NAME, charName)
      const sheets = []
      for (const look of targets) {
        const prompt = buildCharacterSheetPrompt(char, look, {
          style: projectShots.style,
          baseline: projectShots.baseline
        })
        const image = await imageGen.generateSketchImage({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model,
          prompt,
          size,
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs
        })
        const saved = imageGen.saveSketchImage({
          dir,
          shotId: (look.id || 'look').replace(/[^A-Za-z0-9_-]/g, '') || 'look',
          label: '三视图',
          buffer: image.buffer,
          mediaType: image.mediaType
        })
        // 写回该 look 的 referenceImages（去重追加）
        const filePath = path.join(charactersDir(projectName), char.name + '.json')
        let raw = null
        try { raw = JSON.parse(await fs.readFile(filePath, 'utf8')) } catch (error) { raw = null }
        if (raw && typeof raw === 'object') {
          let rawLooks = Array.isArray(raw.looks) ? raw.looks : []
          if (!rawLooks.length) rawLooks = [{ id: 'look1', name: '默认形象' }]
          let slotIndex = -1
          if (wanted) slotIndex = rawLooks.findIndex((item) => item && (item.id === wanted || item.name === wanted))
          if (slotIndex < 0 && look && look.id) slotIndex = rawLooks.findIndex((item) => item && item.id === look.id)
          if (slotIndex < 0) slotIndex = 0
          const slot = rawLooks[slotIndex]
          if (slot) {
            const refs = Array.isArray(slot.referenceImages) ? slot.referenceImages.slice() : []
            if (refs.indexOf(saved.path) === -1) refs.push(saved.path)
            slot.referenceImages = refs
            raw.looks = rawLooks
            await writeJson(filePath, raw)
          }
        }
        sheets.push({ character: char.name, look: look.id || look.name || '默认形象', path: saved.path, prompt })
      }
      await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), {
        at: new Date().toISOString(),
        scope: 'characters',
        op: 'character-sheet',
        target: char.name,
        summary: '生成人物三视图 ' + sheets.length + ' 张',
        detail: asText(options.detail)
      })
      return { ok: true, videoName: projectName, character: char.name, sheets }
    },

    /**
     * 生成区域/场地设定图（场景概念图），写入 area.mapPath。
     * @param {string} name - 项目名
     * @param {{areaId:string, fetchImpl?:Function, timeoutMs?:number}} options
     */
    async generateAreaSheet(name, options = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const areaId = asText(options.areaId).trim()
      if (!areaId) throw projectError('缺少区域 id（areaId）', 'INVALID_AREA', 400)
      const capability = resolveImageGenerationCapability({ env: process.env })
      if (!capability.capable) {
        throw projectError('当前没有可用的图像生成能力，区域出图已关闭：' + capability.detail, 'IMAGE_GEN_UNAVAILABLE', 409)
      }
      const config = resolveImageGenConfig({ env: process.env })
      if (!config.capable) throw projectError('图像生成配置不完整：' + config.reason, 'IMAGE_GEN_UNCONFIGURED', 409)
      const shotsFile = await readShotsFile(projectName)
      const areas = Array.isArray(shotsFile.areas) ? shotsFile.areas : []
      const area = areas.find((item) => item.id === areaId)
      if (!area) throw projectError('项目 ' + projectName + ' 中不存在区域 ' + areaId + '，请先用 save-areas 保存区域设定', 'AREA_NOT_FOUND', 404)
      const prompt = buildAreaSheetPrompt(area, { style: shotsFile.style, baseline: shotsFile.baseline, sceneMap: shotsFile.sceneMap })
      // 区域/场地出图可单独设置模型；未设置时回退草图模型
      const areaModel = readAreaSheetModel(process.env) || config.model
      const image = await imageGen.generateSketchImage({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: areaModel,
        prompt,
        size: /minimax/i.test(String(areaModel)) ? '2048x1152' : '1536x1024',
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs
      })
      const dir = path.join(projectDir(projectName), AREA_DIR_NAME, area.name || area.id)
      const saved = imageGen.saveSketchImage({
        dir,
        shotId: String(area.id || 'area').replace(/[^A-Za-z0-9_-]/g, '') || 'area',
        label: '场地',
        buffer: image.buffer,
        mediaType: image.mediaType
      })
      const next = {
        videoName: shotsFile.videoName || projectName,
        style: shotsFile.style,
        notes: shotsFile.notes,
        baseline: shotsFile.baseline,
        sceneMap: shotsFile.sceneMap,
        areas: areas.map((item) => (item.id === area.id ? { ...item, mapPath: saved.path } : item)),
        acts: shotsFile.acts || [],
        characters: shotsFile.characters,
        planConfirmed: shotsFile.planConfirmed,
        planConfirmedAt: shotsFile.planConfirmedAt,
        shots: shotsFile.shots,
        updatedAt: Date.now()
      }
      await writeJson(path.join(shotsDir(projectName), 'mainShots.json'), next)
      await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), {
        at: new Date().toISOString(),
        scope: 'areas',
        op: 'area-sheet',
        target: area.id,
        summary: '生成区域设定图 1 张',
        detail: asText(options.detail)
      })
      return { ok: true, videoName: projectName, area: area.id, path: saved.path, prompt }
    },

    /** 保存区域设定（世界地图；全量替换）。 */
    async saveAreas(name, areas, meta = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const list = Array.isArray(areas) ? areas.map((item, index) => normalizeArea(item, index)) : []
      const shotsFile = await readShotsFile(projectName)
      const next = {
        videoName: shotsFile.videoName || projectName,
        style: shotsFile.style,
        notes: shotsFile.notes,
        baseline: shotsFile.baseline,
        sceneMap: shotsFile.sceneMap,
        areas: list,
        acts: shotsFile.acts || [],
        characters: shotsFile.characters,
        planConfirmed: false,
        planConfirmedAt: 0,
        shots: shotsFile.shots,
        updatedAt: Date.now()
      }
      await writeJson(path.join(shotsDir(projectName), 'mainShots.json'), next)
      await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), {
        at: new Date().toISOString(),
        scope: 'areas',
        op: 'save',
        target: list.map((item) => item.id).join(','),
        summary: '保存区域设定 ' + list.length + ' 个',
        detail: asText(meta.detail)
      })
      const warnings = validateAreas(list)
      // 用户勾选「区域/场地自动出图」时：保存区域设定后默认生成场地设定图（按次计费；失败只记 warning，不影响保存）
      if (readAreaSheetEnabled(process.env)) {
        const capability = resolveImageGenerationCapability({ env: process.env })
        if (!capability.capable) {
          warnings.push({ code: 'AREA_SHEET_DISABLED', message: '已开启「区域/场地自动出图」，但当前没有可用图像生成能力：' + capability.detail })
        } else {
          let generated = 0
          for (const area of list) {
            if (generated >= 4) break
            try {
              await this.generateAreaSheet(projectName, { areaId: area.id })
              generated += 1
            } catch (error) {
              warnings.push({ code: 'AREA_SHEET_FAILED', message: '区域「' + (area.name || area.id) + '」场地图自动生成失败：' + (error && error.message ? error.message : String(error)) })
            }
          }
          if (generated > 0) warnings.push({ code: 'AREA_SHEET_GENERATED', message: '已自动生成区域设定图 ' + generated + ' 张（按次计费）' })
        }
      }
      return { ok: true, videoName: projectName, areas: list, warnings }
    },

    /** 保存幕设定（叙事单位：本幕出场人物 cast/区域/报幕）。 */
    async saveActs(name, acts, meta = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const list = Array.isArray(acts) ? acts.map((item, index) => normalizeAct(item, index)) : []
      const shotsFile = await readShotsFile(projectName)
      const characters = await readCharacters(projectName)
      const next = {
        videoName: shotsFile.videoName || projectName,
        style: shotsFile.style,
        notes: shotsFile.notes,
        baseline: shotsFile.baseline,
        sceneMap: shotsFile.sceneMap,
        areas: shotsFile.areas || [],
        acts: list,
        characters: shotsFile.characters,
        planConfirmed: false,
        planConfirmedAt: 0,
        shots: shotsFile.shots,
        updatedAt: Date.now()
      }
      await writeJson(path.join(shotsDir(projectName), 'mainShots.json'), next)
      await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), {
        at: new Date().toISOString(),
        scope: 'acts',
        op: 'save',
        target: list.map((item) => item.id).join(','),
        summary: '保存幕设定 ' + list.length + ' 幕',
        detail: asText(meta.detail)
      })
      return { ok: true, videoName: projectName, acts: list, warnings: validateActs(list, characters, next.areas || []) }
    },

    /**
     * 记录「用户已确认分镜/人物卡」：之后才允许 build-prompt（出提示词）和 sketch（画草图）。
     * 保存新分镜/新人物卡会自动把确认状态重置为 false，必须重新确认。
     */
    async confirmPlan(name, meta = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shotsFile = await readShotsFile(projectName)
      if (!shotsFile.shots.length) throw projectError('项目 ' + projectName + ' 还没有分镜，先保存分镜再确认', 'SHOTS_EMPTY', 409)
      const now = Date.now()
      const next = {
        videoName: shotsFile.videoName || projectName,
        style: shotsFile.style,
        notes: shotsFile.notes,
        baseline: shotsFile.baseline,
        sceneMap: shotsFile.sceneMap,
        areas: shotsFile.areas || [],
        acts: shotsFile.acts || [],
        characters: shotsFile.characters,
        planConfirmed: true,
        planConfirmedAt: now,
        shots: shotsFile.shots,
        updatedAt: shotsFile.updatedAt
      }
      await writeJson(path.join(shotsDir(projectName), 'mainShots.json'), next)
      await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), {
        at: new Date(now).toISOString(),
        scope: 'plan',
        op: 'confirm',
        target: shotsFile.shots.map((item) => item.id).join(','),
        summary: '用户确认分镜/人物卡（' + shotsFile.shots.length + ' 个镜头）',
        detail: asText(meta.detail)
      })
      return { ok: true, videoName: projectName, planConfirmed: true, planConfirmedAt: now, shots: shotsFile.shots.length }
    },

    /** 追加一条分镜更改记录（不修改 mainShots，用于记录「改了什么、为什么」）。 */
    async recordShotChange(name, change = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const payload = change && typeof change === 'object' ? change : {}
      const entry = {
        at: new Date().toISOString(),
        scope: 'shots',
        op: asText(payload.op) || 'update',
        target: asText(payload.shot) || asText(payload.target),
        summary: asText(payload.summary) || '分镜更改',
        detail: asText(payload.detail)
      }
      await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), entry)
      return { ok: true, videoName: projectName, change: entry }
    },

    /** 把一条已完成任务的视频归档为某个镜头的新版本（V0.n）。 */
    async saveShotVersion(name, shotId, input = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shot = normalizeShotId(shotId)
      const payload = input && typeof input === 'object' ? input : {}
      const sourcePath = asText(payload.sourcePath)
      if (!sourcePath) throw projectError('saveShotVersion 需要 sourcePath（本地视频路径）', 'MISSING_VIDEO')
      const sourceStat = await pathExists(sourcePath)
      if (!sourceStat || !sourceStat.isFile() || sourceStat.size <= 0) throw projectError('视频文件不存在或为空：' + sourcePath, 'MISSING_VIDEO')
      const shotDir = path.join(videoDir(projectName), shot)
      await fs.mkdir(shotDir, { recursive: true })
      const version = await nextVersionName(shotDir)
      const versionDir = path.join(shotDir, version)
      await fs.mkdir(versionDir, { recursive: true })
      const destVideo = path.join(versionDir, 'video.mp4')
      await fs.copyFile(sourcePath, destVideo)
      const now = Date.now()
      // 区分「分镜片段 / 全片」：显式 kind 优先；未标注时用 ffmpeg 探测时长，与分镜时长明显不符则判为疑似全片
      const declaredKind = asText(payload.kind).toLowerCase()
      const kindInput = ['shot', 'full'].indexOf(declaredKind) !== -1 ? declaredKind : 'unknown'
      let durationSeconds = 0
      let videoWidth = 0
      let videoHeight = 0
      try {
        const ffmpeg = resolveFfmpeg(process.env)
        if (ffmpeg) {
          durationSeconds = Number(probeDuration(ffmpeg, sourcePath)) || 0
          const size = probeVideoSize(ffmpeg, sourcePath)
          if (size) { videoWidth = size.width; videoHeight = size.height }
        }
      } catch (error) { durationSeconds = 0 }
      let shotDuration = 0
      try {
        const shotsFile = await readShotsFile(projectName)
        const shotData = (shotsFile.shots || []).find((item) => item.id === shot)
        shotDuration = shotData && Number(shotData.duration) > 0 ? Number(shotData.duration) : 0
      } catch (error) { shotDuration = 0 }
      const suspectedFull = kindInput === 'unknown' && durationSeconds > 0 && shotDuration > 0 && durationSeconds > shotDuration * 1.5
      const effectiveKind = kindInput === 'unknown' ? (suspectedFull ? 'full' : 'unknown') : kindInput
      const meta = {
        version,
        shot,
        kind: effectiveKind,
        durationSeconds,
        videoWidth,
        videoHeight,
        shotDuration,
        suspectedFull,
        taskId: asText(payload.taskId),
        recordId: asText(payload.recordId),
        prompt: asText(payload.prompt),
        model: asText(payload.model),
        mode: asText(payload.mode),
        params: payload.params && typeof payload.params === 'object' ? payload.params : {},
        provider: asText(payload.provider),
        strategy: normalizeStrategy(payload.strategy),
        generatedAt: now,
        sourcePath,
        bytes: sourceStat.size
      }
      await writeJson(path.join(versionDir, 'meta.json'), meta)
      await appendJsonl(path.join(shotDir, 'ChangeInfo.jsonl'), {
        at: new Date(now).toISOString(),
        scope: 'video',
        op: 'save-version',
        target: shot,
        summary: '归档 ' + version + (meta.taskId ? '（任务 ' + meta.taskId + '）' : ''),
        detail: asText(payload.detail)
      })
      const warnings = []
      if (suspectedFull) {
        warnings.push({ code: 'VERSION_LOOKS_LIKE_FULL', message: '此视频时长 ' + durationSeconds + ' 秒，明显长于分镜 ' + shot + ' 的时长 ' + shotDuration + ' 秒：可能把「全片视频」归档成了分镜片段。全片请用 full-video 保存；如果确认这段就是该分镜的片段，请用 kind=shot 重新归档或忽略此提示。' })
      }
      return {
        ok: true,
        videoName: projectName,
        shot,
        version,
        kind: effectiveKind,
        durationSeconds,
        suspectedFull,
        dir: versionDir,
        videoPath: destVideo,
        bytes: sourceStat.size,
        meta,
        warnings
      }
    },

    /** 当前环境是否支持「局部编辑视频」：固定配置/共享能力文件（由生成插件探测写入）。 */
    videoCapability() {
      return resolveVideoEditCapability({ env: process.env })
    },

    /** 当前环境能否生成单镜头草图（图像生成能力，由生成插件探测或固定配置决定）。 */
    imageCapability() {
      return resolveImageGenerationCapability({ env: process.env })
    },

    /**
     * 为镜头生成草图（黑白线稿），保存到 <项目>/Storyboards/<ShotN>-<时间戳>.png，并把路径写回分镜 sketchPath。
     *
     * 输入严格只用「已保存的分镜脚本字段 + 人物卡」：不接受调用方附加的自由文本（防止智能体临时加内容/改画面）。
     * 按分镜 id 每个镜头输出一张独立图片（不把多个镜头画进一张图）：
     *   - 传 shot=<ShotN> → 只画这一个镜头（单张）；
     *   - 不传 shot → 按分镜顺序为每个镜头各画一张（每镜头一次请求）。
     * 只在用户明确同意「画草图」后调用（图像生成按次计费）。
     * @returns {Promise<{ok:boolean,videoName:string,shot:string,path:string,images:Array<{shot:string,path:string}>,prompt:string,model:string,size:string,source:string,capability:object}>}
     */
    async sketchShot(name, shotId, sketchOptions = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shotsFile = await readShotsFile(projectName)
      if (!shotsFile.shots.length) throw projectError('项目 ' + projectName + ' 还没有分镜，先保存分镜再画草图', 'SHOTS_EMPTY', 409)
      if (!shotsFile.planConfirmed) throw projectError('分镜/人物卡还没有经过用户确认，不能画草图。先把分镜和人物卡展示给用户确认，用户同意后调用 action=confirm-plan，再画草图（保存新的分镜/人物卡会自动把确认状态重置，需要重新确认）', 'PLAN_NOT_CONFIRMED', 409)
      const capability = resolveImageGenerationCapability({ env: process.env })
      if (!capability.capable) {
        throw projectError('当前没有可用的图像生成能力，草图分镜功能已关闭：' + capability.detail, 'IMAGE_GEN_UNAVAILABLE', 409)
      }
      const config = imageGen.resolveImageGenConfig({ env: process.env })
      if (!config.capable) throw projectError('图像生成配置不完整：' + config.reason, 'IMAGE_GEN_UNCONFIGURED', 409)
      // 画哪些镜头：分镜 id 必填或按全部分镜逐张
      const wanted = asText(shotId).trim()
      let targets = []
      if (!wanted) {
        targets = shotsFile.shots.slice()
      } else {
        const shotKey = normalizeShotId(wanted)
        const shot = shotsFile.shots.find((item) => item.id === shotKey)
        if (!shot) throw projectError('项目 ' + projectName + ' 中不存在镜头 ' + shotKey + '，请先用 action=save-shots 保存分镜', 'SHOT_NOT_FOUND', 404)
        targets = [shot]
      }
      const characters = await readCharacters(projectName)
      const model = config.model // 模型只用用户在设置里选的，不接受调用方覆盖（防绕过用户选择）
      const size = imageGen.resolveSketchSize(shotsFile.baseline, model)
      const dir = path.join(projectDir(projectName), SKETCH_DIR_NAME)
      const images = []
      for (const shot of targets) {
        const prompt = imageGen.buildSketchPrompt(shot, { ...shotsFile, characters })
        const image = await imageGen.generateSketchImage({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model,
          prompt,
          size,
          fetchImpl: sketchOptions.fetchImpl,
          timeoutMs: sketchOptions.timeoutMs
        })
        const label = asText(shot.name) || asText(shot.shotType) || asText(shot.action).slice(0, 12) || '草图'
        const saved = imageGen.saveSketchImage({ dir, shotId: shot.id, label, buffer: image.buffer, mediaType: image.mediaType })
        images.push({ shot: shot.id, path: saved.path, prompt })
      }
      const now = Date.now()
      const byShot = new Map(images.map((item) => [item.shot, item.path]))
      const nextFile = {
        videoName: shotsFile.videoName || projectName,
        style: shotsFile.style,
        notes: shotsFile.notes,
        baseline: shotsFile.baseline,
        sceneMap: shotsFile.sceneMap,
        areas: shotsFile.areas || [],
        acts: shotsFile.acts || [],
        characters: shotsFile.characters,
        planConfirmed: shotsFile.planConfirmed,
        planConfirmedAt: shotsFile.planConfirmedAt,
        shots: shotsFile.shots.map((item) => (byShot.has(item.id) ? { ...item, sketchPath: byShot.get(item.id) } : item)),
        updatedAt: now
      }
      await writeJson(path.join(shotsDir(projectName), 'mainShots.json'), nextFile)
      await appendJsonl(path.join(shotsDir(projectName), 'changeInfo.jsonl'), {
        at: new Date(now).toISOString(),
        scope: 'storyboard',
        op: 'sketch',
        target: images.map((item) => item.shot).join(','),
        summary: '生成镜头草图（' + model + '）：' + images.map((item) => item.shot).join('、'),
        detail: '按分镜 id 每镜头一张'
      })
      const first = images[0]
      return {
        ok: true,
        videoName: projectName,
        shot: first.shot,
        path: first.path,
        prompt: first.prompt,
        images: images.map((item) => ({ shot: item.shot, path: item.path })),
        model,
        size,
        source: config.source,
        capability
      }
    },

    /** 生成验收表（6 栏逐项，pass 留空待智能体打勾）。 */
    async reviewTemplate(name, shotId) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shotKey = normalizeShotId(shotId)
      const shots = await readShotsFile(projectName)
      const shot = shots.shots.find((item) => item.id === shotKey)
      if (!shot) throw projectError('项目 ' + projectName + ' 中不存在镜头 ' + shotKey, 'SHOT_NOT_FOUND', 404)
      const characters = await readCharacters(projectName)
      const project = { ...shots, characters }
      const checks = REVIEW_CHECKS.map((def) => ({
        key: def.key,
        label: def.label,
        hint: def.hint,
        expected: reviewExpected(def.key, shot, project),
        pass: null,
        note: ''
      }))
      return { ok: true, videoName: projectName, shot: shotKey, checks, capability: this.videoCapability(), hint: '逐栏验收：pass=true/false，note 写看到什么；全部 pass 才算通过；提交 checks 后会给出调整策略（局部改/整条重做/保留前段）。' }
    },

    /** 记录一次镜头验收结果：支持 6 栏逐项打勾（checks）或旧式 pass+issues。 */
    async saveShotReview(name, shotId, input = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shot = normalizeShotId(shotId)
      const payload = input && typeof input === 'object' ? input : {}
      const shotDir = path.join(videoDir(projectName), shot)
      await fs.mkdir(shotDir, { recursive: true })
      const checks = normalizeReviewChecks(payload.checks)
      const explicitPass = typeof payload.pass === 'boolean' ? payload.pass : null
      const failedChecks = checks.filter((item) => item.pass !== true)
      const pass = checks.length ? failedChecks.length === 0 : explicitPass === true
      const issues = Array.isArray(payload.issues) ? payload.issues.map((item) => asText(item)).filter(Boolean) : []
      for (const item of failedChecks) {
        const note = item.note ? '：' + item.note : ''
        const text = item.label + note
        if (issues.indexOf(text) === -1) issues.push(text)
      }
      let strategy = normalizeStrategy(payload.strategy)
      if (!strategy && checks.length) {
        const shotList = await readShotsFile(projectName)
        const shotData = shotList.shots.find((item) => item.id === shot)
        strategy = buildStrategy({
          checks,
          shot: shotData,
          capability: this.videoCapability(),
          feedback: asText(payload.feedback),
          frameIndex: payload.frameIndex,
          frameCount: payload.frameCount
        })
      }
      const review = {
        at: new Date().toISOString(),
        version: asText(payload.version),
        pass,
        checks,
        strategy,
        issues,
        notes: asText(payload.notes || payload.detail),
        reviewer: asText(payload.reviewer) || 'agent'
      }
      // 同一版本只保留最新一条验收记录（不累积重复记录）
      const reviewPath = path.join(shotDir, 'review.jsonl')
      const existingReviews = (await readJsonl(reviewPath)).filter((item) => !(item && review.version && String(item.version) === String(review.version)))
      existingReviews.push(review)
      await fs.writeFile(reviewPath, existingReviews.map((item) => JSON.stringify(item)).join('\n') + '\n', 'utf8')
      await appendJsonl(path.join(shotDir, 'ChangeInfo.jsonl'), {
        at: review.at,
        scope: 'video',
        op: 'review',
        target: shot,
        summary: '验收 ' + (review.version || '') + '：' + (review.pass ? '通过' : '不通过'),
        detail: review.issues.join('；') || review.notes
      })
      return { ok: true, videoName: projectName, shot, review, passed: review.pass, strategy }
    },

    /**
     * 撤销某版本的验收记录（把该版本的 review 从 review.jsonl 里移除），用于「改回未验收」。
     */
    async clearShotReview(name, shotId, version) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shot = normalizeShotId(shotId)
      const versionName = asText(version)
      if (!versionName) throw projectError('缺少版本号（如 V0.1）', 'INVALID_VERSION', 400)
      const shotDir = path.join(videoDir(projectName), shot)
      const reviewPath = path.join(shotDir, 'review.jsonl')
      const reviews = await readJsonl(reviewPath)
      const next = reviews.filter((item) => !(item && String(item.version || '') === versionName))
      const removed = reviews.length - next.length
      if (removed > 0) {
        const text = next.map((item) => JSON.stringify(item)).join('\n') + (next.length ? '\n' : '')
        await fs.writeFile(reviewPath, text, 'utf8')
      }
      await appendJsonl(path.join(shotDir, 'ChangeInfo.jsonl'), {
        at: new Date().toISOString(),
        scope: 'video',
        op: 'clear-review',
        target: shot,
        summary: '撤销版本 ' + versionName + ' 的验收',
        detail: '移除 ' + removed + ' 条验收记录'
      })
      return { ok: true, videoName: projectName, shot, version: versionName, removed }
    },

    /**
     * 给某个镜头版本加「修改标记/备注」（追加到 Video/<Shot>/versionNotes.jsonl 与变更记录）。
     */
    async addShotVersionNote(name, shotId, version, note) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shot = normalizeShotId(shotId)
      const versionName = asText(version)
      const text = asText(note)
      if (!versionName) throw projectError('缺少版本号（如 V0.1）', 'INVALID_VERSION', 400)
      if (!text) throw projectError('标记内容不能为空', 'INVALID_NOTE', 400)
      const info = await readVersions(projectName, shot)
      if (!info.versions.some((item) => item.version === versionName)) {
        throw projectError('镜头 ' + shot + ' 不存在版本 ' + versionName, 'VERSION_NOT_FOUND', 404)
      }
      const now = new Date().toISOString()
      await appendJsonl(path.join(videoDir(projectName), shot, 'versionNotes.jsonl'), {
        at: now,
        shot,
        version: versionName,
        note: text
      })
      await appendJsonl(path.join(videoDir(projectName), shot, 'ChangeInfo.jsonl'), {
        at: now,
        scope: 'video',
        op: 'version-note',
        target: shot,
        summary: '版本 ' + versionName + ' 标记：' + text,
        detail: ''
      })
      return { ok: true, videoName: projectName, shot, version: versionName, note: text, at: now }
    },

    /**
     * 指定该镜头「采用」哪个版本（用于全片组装/验收基准；一个镜头只有一个采用版本）。
     */
    async setAdoptedVersion(name, shotId, version) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shot = normalizeShotId(shotId)
      const versionName = asText(version)
      if (!versionName) throw projectError('缺少版本号（如 V0.1）', 'INVALID_VERSION', 400)
      const info = await readVersions(projectName, shot)
      if (!info.versions.some((item) => item.version === versionName)) {
        throw projectError('镜头 ' + shot + ' 不存在版本 ' + versionName, 'VERSION_NOT_FOUND', 404)
      }
      const now = new Date().toISOString()
      await writeJson(path.join(videoDir(projectName), shot, 'adopted.json'), { version: versionName, at: now })
      await appendJsonl(path.join(videoDir(projectName), shot, 'ChangeInfo.jsonl'), {
        at: now,
        scope: 'video',
        op: 'adopt-version',
        target: shot,
        summary: '采用版本 ' + versionName,
        detail: ''
      })
      return { ok: true, videoName: projectName, shot, adoptedVersion: versionName, at: now }
    },

    /** 保存全分镜合成视频（FullVideo 单文件，覆盖旧文件）。 */
    async saveFullVideo(name, input = {}) {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const payload = input && typeof input === 'object' ? input : {}
      const sourcePath = asText(payload.sourcePath)
      // 流程校验：全片应基于「已归档的镜头视频」；未验收的镜头会把全片标记为「待验收」
      const shotsFile = await readShotsFile(projectName)
      const shotList = Array.isArray(shotsFile.shots) ? shotsFile.shots : []
      if (!shotList.length) throw projectError('项目 ' + projectName + ' 还没有分镜：先 save-shots 保存分镜，再把镜头视频 save-version 归档，最后合成全片', 'FULL_VIDEO_NO_SHOTS', 409)
      const missingVersions = []
      const pendingReview = []
      const approvedVersions = {}
      for (const shot of shotList) {
        const info = await readVersions(projectName, shot.id)
        const versions = Array.isArray(info.versions) ? info.versions : []
        const reviews = Array.isArray(info.reviews) ? info.reviews : []
        if (!versions.length) { missingVersions.push(shot.id); continue }
        const versionNames = new Set(versions.map((item) => item.version))
        // 区别版本：某版本有「针对该版本」的验收通过记录才算该版本通过（兼容旧记录：没有 version 的通过记录视为最新版本）
        const passedVersions = new Set(reviews.filter((item) => item && item.pass === true && item.version && versionNames.has(item.version)).map((item) => item.version))
        const passedWithoutVersion = reviews.some((item) => item && item.pass === true && !item.version)
        const latestVersion = versions[versions.length - 1].version
        const adoptedVersion = info.adopted && info.adopted.version ? String(info.adopted.version) : ''
        // 用户/面板指定了「采用版本」时以它为准（必须存在且该版本验收通过）；否则回退到最新已验收版本
        if (adoptedVersion) {
          if (!versionNames.has(adoptedVersion)) {
            pendingReview.push(shot.id + '（采用版本 ' + adoptedVersion + ' 不存在）')
            continue
          }
          const adoptedPassed = passedVersions.has(adoptedVersion) || (passedWithoutVersion && adoptedVersion === latestVersion)
          if (adoptedPassed) {
            approvedVersions[shot.id] = adoptedVersion
            continue
          }
          pendingReview.push(shot.id + '（采用版本 ' + adoptedVersion + ' 未验收通过）')
          continue
        }
        const approved = versions
          .filter((item) => passedVersions.has(item.version) || (passedWithoutVersion && item.version === latestVersion))
          .map((item) => item.version)
        if (approved.length) {
          // 有多个通过版本时，取最新的通过版本（全片来源版本）
          approvedVersions[shot.id] = approved[approved.length - 1]
          continue
        }
        pendingReview.push(shot.id)
      }
      if (missingVersions.length) {
        throw projectError('这些镜头还没有归档视频版本：' + missingVersions.join('、') + '。先把镜头视频 save-version 归档到项目，再合成全片（full-video 不检查/不归档单个镜头视频）', 'FULL_VIDEO_NOT_ARCHIVED', 409)
      }
      const verified = pendingReview.length === 0
      const destDir = path.join(videoDir(projectName), 'FullVideo')
      await fs.mkdir(destDir, { recursive: true })
      let bytes = 0
      if (sourcePath) {
        const sourceStat = await pathExists(sourcePath)
        if (!sourceStat || !sourceStat.isFile() || sourceStat.size <= 0) throw projectError('视频文件不存在或为空：' + sourcePath, 'MISSING_VIDEO')
        await fs.copyFile(sourcePath, path.join(destDir, 'video.mp4'))
        bytes = sourceStat.size
      }
      const now = Date.now()
      const meta = {
        taskId: asText(payload.taskId),
        recordId: asText(payload.recordId),
        prompt: asText(payload.prompt),
        model: asText(payload.model),
        provider: asText(payload.provider),
        generatedAt: now,
        sourcePath,
        bytes,
        verified,
        pendingReview,
        approvedVersions,
        adoptedVersions: approvedVersions
      }
      await writeJson(path.join(destDir, 'meta.json'), meta)
      await appendJsonl(path.join(destDir, 'ChangeInfo.jsonl'), {
        at: new Date(now).toISOString(),
        scope: 'video',
        op: 'save-full-video',
        target: 'FullVideo',
        summary: '保存全片' + (payload.taskId ? '（任务 ' + payload.taskId + '）' : ''),
        detail: asText(payload.detail)
      })
      return { ok: true, videoName: projectName, dir: destDir, videoPath: path.join(destDir, 'video.mp4'), bytes, verified, pendingReview, approvedVersions, adoptedVersions: approvedVersions, meta }
    },

    /** 组装生成提示词：读取项目人物卡 + 指定镜头分镜 + 固定参数，并给出「输入是否齐全」检查清单。 */
    async buildShotPrompt(name, shotId, extraPrompt = '') {
      const projectName = normalizeProjectName(name)
      await assertProject(projectName)
      const shots = await readShotsFile(projectName)
      if (!shots.planConfirmed) throw projectError('分镜/人物卡还没有经过用户确认，不能出生成提示词。先把分镜和人物卡展示给用户确认，用户同意后调用 action=confirm-plan，再 build-prompt（保存新的分镜/人物卡会自动把确认状态重置，需要重新确认）', 'PLAN_NOT_CONFIRMED', 409)
      const characters = await readCharacters(projectName)
      const project = { ...shots, characters }
      const wanted = asText(shotId)
      let shot = null
      if (wanted) {
        const shotKey = normalizeShotId(wanted)
        shot = shots.shots.find((item) => item.id === shotKey) || null
        if (!shot) {
          throw projectError('项目 ' + projectName + ' 中不存在镜头 ' + shotKey + '，请先用 op=save-shots 保存分镜', 'SHOT_NOT_FOUND', 404)
        }
      }
      const prompt = composeShotPrompt(project, shot, extraPrompt)
      const baseline = shots.baseline && typeof shots.baseline === 'object' ? shots.baseline : {}
      // 作品端只决定创作参数（画面比例/时长）；模型/分辨率/种子由生成工具端决定（两个插件保持独立）
      const params = {}
      if (baseline.ratio) params.ratio = baseline.ratio
      const duration = shot && shot.duration ? shot.duration : baseline.duration
      if (duration) params.duration = duration
      const checks = []
      if (!characters.length) checks.push('缺少人物卡：先生成角色外观设计（action=save-characters）')
      for (const char of characters) {
        if (!Array.isArray(char.looks) || !char.looks.length) checks.push('人物卡缺少形象变体（looks）：' + char.name)
        const primary = Array.isArray(char.looks) ? char.looks[0] : null
        if (primary && primary.views && !(primary.views.front || primary.views.side || primary.views.back)) {
          checks.push('人物「' + char.name + '」的三视图描述为空：建议补正面/侧面/背面（跨镜头人物更稳）')
        }
      }
      if (Array.isArray(shots.acts) && shots.acts.length && shot && !shot.actId) {
        checks.push('分镜没有归属幕（actId）：多幕结构下无法按幕注入本幕出场人物/区域')
      }
      if (Array.isArray(shots.areas) && shots.areas.length && shot && !shot.areaId && !(shot.actId && (shots.acts || []).some((act) => act.id === shot.actId && act.areaId))) {
        checks.push('分镜没有引用区域（areaId）：建议关联到已保存的区域，保证空间/光线连贯')
      }
      if (shot && Array.isArray(shot.cast) && shot.cast.length) {
        for (const member of shot.cast) {
          if (!characters.some((char) => char.name === member.name)) checks.push('分镜出场人物「' + member.name + '」不在人物卡里：先 save-characters')
        }
      }
      if (!shot) checks.push('未指定镜头：请传 shot=<Shot1>')
      else {
        if (!shot.shotType) checks.push('分镜缺少景别/机位：' + shot.id)
        if (!shot.movement) checks.push('分镜缺少镜头运动：' + shot.id)
        if (!shot.action) checks.push('分镜缺少画面内容：' + shot.id)
        if (!shot.duration) checks.push('分镜缺少时长：' + shot.id)
        if (!shot.characters.length) checks.push('分镜未标注出场角色：' + shot.id)
      }
      // 模型/分辨率/种子属于生成端参数，不在项目端检查；画面比例是创作决策，建议固定
      if (!baseline.ratio) checks.push('未设置画面比例：建议在项目信息里固定（如 9:16 竖屏 / 16:9 横屏），所有镜头统一')
      const wholePicture = validateShotList(shots.shots, characters, { acts: shots.acts, areas: shots.areas })
      const skipCodes = new Set(['MISSING_SHOT_TYPE', 'MISSING_ACTION', 'MISSING_DURATION', 'MISSING_MOVEMENT', 'EMPTY'])
      for (const warning of wholePicture.warnings) {
        if (!skipCodes.has(warning.code) && checks.indexOf(warning.message) === -1) checks.push(warning.message)
      }
      // 草图作参考图：仅当用户在设置里开启时，才把该镜头草图的绝对路径交给调用方（两个插件保持独立，本插件只返回路径）
      const sketchAsReference = readSketchAsReference(options.env)
      const referenceImage = shot && sketchAsReference && shot.sketchPath ? shot.sketchPath : ''
      if (shot && sketchAsReference && !shot.sketchPath) checks.push('已开启「草图作参考图」，但该镜头还没有草图：需要参考时先 action=sketch 画草图（或到设置里关闭该开关）')
      return { ok: true, videoName: projectName, shot: shot ? shot.id : '', prompt, params, checks, characters: characters.length, shots: shots.shots.length, shotStats: wholePicture.stats, sketchPath: shot ? (shot.sketchPath || '') : '', referenceImage }
    }
  }
}
