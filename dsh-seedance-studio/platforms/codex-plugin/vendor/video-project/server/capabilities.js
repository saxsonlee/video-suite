/**
 * dsh-video-project — 视频能力配置（判断当前是否能「局部编辑视频」）
 *
 * 与生成插件解耦的约定：
 * - 生成插件（如 dsh-seedance-studio）探测模型是否支持编辑视频，写入共享能力文件
 *   默认 ~/.dsh/video-capabilities.json（环境变量 VIDEO_CAPABILITIES_FILE 可改）；
 * - 本插件优先读「固定配置」：环境变量 VIDEO_EDIT_CAPABLE（true/false），
 *   其次读 ~/.dsh/video-project/config.json 的 videoEditCapable（环境变量 VIDEO_PROJECT_CONFIG_FILE 可改）；
 *   再次读共享能力文件；都没有则按「不支持」处理（保守）。
 * @module dsh-video-project/server/capabilities
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CAPABILITIES_FILE_NAME = 'video-capabilities.json'

function homeDir(env) {
  const home = env && (env.USERPROFILE || env.HOME)
  if (home) return home
  try { return os.homedir() } catch (error) { return process.cwd() }
}

/** 共享能力文件路径。 */
export function resolveCapabilitiesFile(env = process.env) {
  const override = env && typeof env.VIDEO_CAPABILITIES_FILE === 'string' ? env.VIDEO_CAPABILITIES_FILE.trim() : ''
  if (override) return path.resolve(override)
  return path.join(homeDir(env), '.dsh', CAPABILITIES_FILE_NAME)
}

/** 本插件固定配置文件路径（~/.dsh/video-project/config.json，可被环境变量覆盖）。 */
export function resolveConfigFile(env = process.env) {
  const override = env && typeof env.VIDEO_PROJECT_CONFIG_FILE === 'string' ? env.VIDEO_PROJECT_CONFIG_FILE.trim() : ''
  if (override) return path.resolve(override)
  return path.join(homeDir(env), '.dsh', 'video-project', 'config.json')
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

/** 读共享能力文件（不存在/解析失败返回 null）。 */
export function readSharedCapabilities(options = {}) {
  const env = options.env || process.env
  const filePath = options.filePath || resolveCapabilitiesFile(env)
  const payload = readJson(filePath)
  if (!payload) return null
  return { filePath, payload }
}

/** 读本插件固定配置（不存在返回空对象）。 */
export function readProjectConfig(options = {}) {
  const env = options.env || process.env
  const filePath = options.filePath || resolveConfigFile(env)
  return { filePath, payload: readJson(filePath) || {} }
}

function parseBool(value) {
  if (value === true || value === 'true' || value === '1' || value === 1) return true
  if (value === false || value === 'false' || value === '0' || value === 0) return false
  return null
}

/**
 * 解析「能否局部编辑视频」。优先级：环境变量固定值 > 本插件固定配置 > 共享能力文件 > 默认 false。
 * @returns {{capable:boolean, source:string, models:string[], detail:string}}
 */
export function resolveVideoEditCapability(options = {}) {
  const env = options.env || process.env
  const shared = options.shared !== undefined ? options.shared : readSharedCapabilities({ env })
  const config = options.config !== undefined ? options.config : readProjectConfig({ env }).payload

  const envFlag = parseBool(env && env.VIDEO_EDIT_CAPABLE)
  if (envFlag !== null) {
    return { capable: envFlag, source: '环境变量 VIDEO_EDIT_CAPABLE', models: [], detail: '固定配置：环境变量强制' + (envFlag ? '支持' : '不支持') + '局部编辑' }
  }
  const configFlag = parseBool(config && config.videoEditCapable)
  if (configFlag !== null) {
    return { capable: configFlag, source: '固定配置 config.json', models: [], detail: '固定配置：video-project 的 config.json 指定' + (configFlag ? '支持' : '不支持') + '局部编辑' }
  }
  const sharedCapable = shared && shared.payload && shared.payload.videoEdit && shared.payload.videoEdit.capable === true
  if (sharedCapable) {
    const models = Array.isArray(shared.payload.videoEdit.models) ? shared.payload.videoEdit.models : []
    return { capable: true, source: '共享能力文件（生成插件探测）', models, detail: '生成插件探测到模型支持编辑视频' + (models.length ? '：' + models.join(', ') : '') }
  }
  return { capable: false, source: '默认（未配置）', models: [], detail: '没有读到编辑视频能力的配置/探测结果，按不支持处理（失败时不会误用局部编辑）' }
}

/**
 * 解析「能否生成单镜头草图（图像生成）」。
 *
 * 设计原则（用户指定，不自动决策）：
 * - 必须用户在视频项目设置里「启用草图分镜」并「选择图像模型」，功能才可用；
 * - 共享能力文件 / 生成插件探测结果只作为「候选模型清单」用于界面下拉，绝不自动启用或自动选模型；
 * - 环境变量 VIDEO_IMAGE_CAPABLE=1 + VIDEO_IMAGE_MODEL 可作为显式覆盖（调试/进阶用法）。
 * @returns {{capable:boolean, enabled:boolean, source:string, model:string, candidates:string[], baseUrl:string, provider:string, detail:string}}
 */
export function resolveImageGenerationCapability(options = {}) {
  const env = options.env || process.env
  const shared = options.shared !== undefined ? options.shared : readSharedCapabilities({ env })
  const config = options.config !== undefined ? options.config : readProjectConfig({ env }).payload
  const configImage = config && config.imageGen && typeof config.imageGen === 'object' ? config.imageGen : {}
  const sharedImage = shared && shared.payload && shared.payload.imageGeneration && typeof shared.payload.imageGeneration === 'object'
    ? shared.payload.imageGeneration
    : {}
  const candidates = Array.isArray(sharedImage.models)
    ? sharedImage.models.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : []
  const envFlag = parseBool(env && env.VIDEO_IMAGE_CAPABLE)
  const envModel = typeof env === 'object' && env && typeof env.VIDEO_IMAGE_MODEL === 'string' ? env.VIDEO_IMAGE_MODEL.trim() : ''
  if (envFlag === false) {
    return { capable: false, enabled: false, source: '环境变量 VIDEO_IMAGE_CAPABLE', model: '', candidates, baseUrl: '', provider: '', detail: '环境变量强制关闭草图分镜' }
  }
  if (envFlag === true && envModel) {
    return { capable: true, enabled: true, source: '环境变量 VIDEO_IMAGE_*', model: envModel, candidates, baseUrl: typeof sharedImage.baseUrl === 'string' ? sharedImage.baseUrl : '', provider: 'env', detail: '环境变量强制启用，模型：' + envModel }
  }
  if (configImage.enabled === false || configImage.capable === false) {
    return { capable: false, enabled: false, source: '用户设置（config.json imageGen 已关闭）', model: '', candidates, baseUrl: typeof sharedImage.baseUrl === 'string' ? sharedImage.baseUrl : '', provider: '', detail: '你已在视频项目设置里关闭草图分镜' }
  }
  const enabled = configImage.enabled === true || configImage.capable === true
  const model = typeof configImage.model === 'string' ? configImage.model.trim() : ''
  if (!enabled) {
    return {
      capable: false,
      enabled: false,
      source: '默认关闭（需在视频项目设置里开启）',
      model: '',
      candidates,
      baseUrl: typeof sharedImage.baseUrl === 'string' ? sharedImage.baseUrl : '',
      provider: '',
      detail: '草图分镜默认关闭：请在视频项目设置面板里勾选「启用」并从候选清单选择图像模型（不会自动替你选模型）。'
    }
  }
  if (!model) {
    return {
      capable: false,
      enabled: true,
      source: '已启用但未选择模型',
      model: '',
      candidates,
      baseUrl: typeof sharedImage.baseUrl === 'string' ? sharedImage.baseUrl : '',
      provider: '',
      detail: '已启用草图分镜但还没选择图像模型：请在设置面板里从候选清单选择' + (candidates.length ? '（候选：' + candidates.join('、') + '）' : '') + '。'
    }
  }
  return {
    capable: true,
    enabled: true,
    source: '用户设置（config.json imageGen）',
    model,
    candidates,
    baseUrl: typeof sharedImage.baseUrl === 'string' ? sharedImage.baseUrl : '',
    provider: 'relay',
    detail: '已启用，模型：' + model
  }
}
