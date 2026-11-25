/**
 * dsh-seedance-studio — 视频能力探测与共享能力文件
 *
 * 与 video-project 等协作插件解耦的约定：
 * - 共享能力文件默认 ~/.dsh/video-capabilities.json（环境变量 VIDEO_CAPABILITIES_FILE 可覆盖路径）；
 * - 内容：{ schemaVersion, source, updatedAt, videoEdit: { capable, models, checkedAt } }；
 * - 本插件只写「视频编辑」能力（模型目录里 videoEditing === true 且未下线）；
 * - imageGeneration 字段仅供协作插件使用/写入，本插件启动时不探测、不替用户选择图像模型；
 * - 其他插件读该文件，决定是否可以使用「局部编辑」策略；能力文件不存在时按不支持处理。
 * @module dsh-seedance-studio/server/capabilities
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MODELS } from './models/catalog.js'

/** 能力文件结构版本（后续扩展时递增）。 */
export const CAPABILITIES_SCHEMA_VERSION = 2

/** 默认共享能力文件名。 */
export const CAPABILITIES_FILE_NAME = 'video-capabilities.json'

/** 用户主目录（优先环境变量，便于测试注入）。 */
function homeDir(env) {
  const home = env && (env.USERPROFILE || env.HOME)
  if (home) return home
  try { return os.homedir() } catch (error) { return process.cwd() }
}

/** 共享能力文件路径：VIDEO_CAPABILITIES_FILE > <home>/.dsh/video-capabilities.json。 */
export function resolveCapabilitiesFile(env = process.env) {
  const override = env && typeof env.VIDEO_CAPABILITIES_FILE === 'string' ? env.VIDEO_CAPABILITIES_FILE.trim() : ''
  if (override) return path.resolve(override)
  return path.join(homeDir(env), '.dsh', CAPABILITIES_FILE_NAME)
}

/** 从模型目录探测「编辑视频」能力：videoEditing === true 且未标记下线。 */
export function detectVideoEdit(models = MODELS) {
  const list = Array.isArray(models) ? models : []
  const capableModels = list
    .filter((model) => model && model.videoEditing === true && model.deprecated !== true)
    .map((model) => model.id)
    .filter(Boolean)
  return { capable: capableModels.length > 0, models: capableModels }
}

/** 常见图像生成模型命名（gpt-image / Gemini 图像 / Seedream / Flux 等）。 */
/** 常见图像生成模型命名（gpt-image / Gemini 图像 / Seedream / Flux / MiniMax 图像 等）。 */
export const IMAGE_MODEL_PATTERN = /(^|[-_/])(gpt-image|gemini[-a-z0-9.]*image|gemini-nano-banana|nano-banana|seedream|flux|dall-e|imagen|qwen-image|kolors|minimax[-a-z0-9.]*image)/i

/** 判断一个模型 id 是否是图像生成模型。 */
export function isImageModel(id) {
  return typeof id === 'string' && IMAGE_MODEL_PATTERN.test(id.trim())
}

/**
 * 从模型列表里挑出图像生成模型（去重、保序）。
 * @param {Array<string|{id?:string}>} models - 模型 id 或 {id} 对象。
 * @returns {string[]}
 */
export function detectImageModels(models) {
  const list = Array.isArray(models) ? models : []
  const out = []
  for (const item of list) {
    const id = typeof item === 'string' ? item.trim() : (item && typeof item.id === 'string' ? item.id.trim() : '')
    if (id && isImageModel(id) && out.indexOf(id) === -1) out.push(id)
  }
  return out
}

/** 生成能力快照（可注入时间，便于测试）。 */
export function buildCapabilitiesSnapshot(models = MODELS, now = new Date(), options = {}) {
  const detected = detectVideoEdit(models)
  const at = now instanceof Date ? now.toISOString() : String(now || new Date().toISOString())
  const imageModels = Array.isArray(options.imageModels) ? options.imageModels.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : []
  return {
    schemaVersion: CAPABILITIES_SCHEMA_VERSION,
    source: 'seedance-studio',
    updatedAt: at,
    videoEdit: { capable: detected.capable, models: detected.models, checkedAt: at },
    imageGeneration: {
      capable: imageModels.length > 0,
      models: imageModels,
      checkedAt: at,
      provider: typeof options.imageProvider === 'string' ? options.imageProvider : '',
      baseUrl: typeof options.imageBaseUrl === 'string' ? options.imageBaseUrl : ''
    }
  }
}

/** 写能力文件（目录不存在会自动创建）。 */
export function writeCapabilitiesFile(filePath, snapshot) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
  return filePath
}

/**
 * 探测并写入共享能力文件。失败不抛（插件启动/查模型时调用，不能因此中断）。
 * @returns {{ok:boolean,path:string,snapshot:object,error?:string}}
 */
export function refreshVideoCapabilities(options = {}) {
  const env = options.env || process.env
  const filePath = options.filePath || resolveCapabilitiesFile(env)
  const snapshot = buildCapabilitiesSnapshot(options.models || MODELS, options.now, {
    imageModels: options.imageModels,
    imageProvider: options.imageProvider,
    imageBaseUrl: options.imageBaseUrl
  })
  try {
    writeCapabilitiesFile(filePath, snapshot)
    return { ok: true, path: filePath, snapshot }
  } catch (error) {
    return { ok: false, path: filePath, snapshot, error: error instanceof Error ? error.message : String(error) }
  }
}
