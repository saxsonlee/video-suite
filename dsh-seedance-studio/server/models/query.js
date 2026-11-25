/**
 * dsh-seedance-studio — models / 模型查询/公开视图
 *
 * 本文件由 server/models.js 拆分而来；对外契约由 models/index.js 统一 re-export。
 */
import { MODEL_MAP, MODES, MODELS, DEFAULT_MODEL, RATIOS, RESOLUTIONS, OUTPUT_FORMATS, OMNI_TASK_TYPES, MODE_INFO, LIMITS } from './catalog.js'
import { fail } from './validation.js'

/** 取模型定义；未知模型返回 null（允许自定义模型 ID / ep- 接入点）。 */
export function getModel(modelId) {
  return MODEL_MAP.get(modelId) || null
}

/** 某模型支持的模式列表。 */
export function modelModes(entry) {
  if (!entry) return MODES.slice()
  const modes = ['text2video']
  if (entry.firstFrame) modes.push('image2video')
  if (entry.firstFrame && entry.lastFrame) modes.push('firstlast')
  if (entry.references) modes.push('reference')
  if (entry.videoEditing) modes.push('edit', 'extend')
  if (entry.draft) modes.push('draft', 'draft-final')
  return modes
}

/** 对外公开的单个模型 DTO（供 UI 渲染参数控件）。 */
export function publicModel(model) {
  const defaultResolution = model.defaultResolution || (model.resolutions.indexOf('720p') !== -1 ? '720p' : model.resolutions[0])
  return {
    id: model.id,
    label: model.label,
    family: model.family,
    durations: model.durations.slice(),
    autoDuration: model.autoDuration === true,
    defaultDuration: model.defaultDuration,
    defaultResolution,
    defaultRatio: model.defaultRatio || (model.family === '1.0' ? '16:9' : 'adaptive'),
    resolutions: model.resolutions.slice(),
    ratios: model.ratios.slice(),
    audio: model.audio === true,
    audioAlone: model.audioAlone === true,
    firstFrame: model.firstFrame === true,
    lastFrame: model.lastFrame === true,
    references: model.references === true,
    draft: model.draft === true,
    omniReference: model.omniReference === true,
    outputFormats: model.outputFormats.slice(),
    videoEditing: model.videoEditing === true,
    cameraFixed: model.cameraFixed === true,
    frames: model.frames === true,
    flex: model.flex === true,
    tools: model.tools === true,
    priority: model.priority === true,
    maxImages: model.maxImages,
    maxVideos: model.maxVideos,
    maxAudios: model.maxAudios,
    seed: model.seed !== false,
    returnLastFrame: model.returnLastFrame !== false,
    watermark: model.watermark !== false,
    modes: modelModes(model),
    deprecated: model.deprecated === true,
    notes: model.notes
  }
}

/** 模型目录（公开 DTO 列表）。 */
export function listModels() {
  return MODELS.map(publicModel)
}

/** 全局默认值（/config 的 defaults 字段）。 */
export function publicDefaults(overrides) {
  const opts = overrides || {}
  const defaultModel = opts.defaultModel || DEFAULT_MODEL
  const entry = getModel(defaultModel)
  return {
    defaultModel,
    defaultMode: 'text2video',
    defaultResolution: entry ? (entry.resolutions.indexOf('720p') !== -1 ? '720p' : entry.resolutions[0]) : '720p',
    defaultRatio: entry && entry.family === '1.0' ? '16:9' : 'adaptive',
    defaultDuration: entry ? entry.defaultDuration : -1,
    defaultGenerateAudio: entry ? entry.audio === true : false,
    defaultWatermark: false,
    defaultReturnLastFrame: true,
    ratios: RATIOS.slice(),
    resolutions: RESOLUTIONS.slice(),
    outputFormats: OUTPUT_FORMATS.slice(),
    omniTaskTypes: OMNI_TASK_TYPES.slice(),
    modes: MODE_INFO.map((mode) => ({ ...mode }))
  }
}

/** 运行时能力说明（/config 的 capabilities 字段）。 */
export function capabilities() {
  return {
    modes: MODE_INFO.map((mode) => ({ ...mode })),
    limits: { ...LIMITS },
    videoReferenceRequiresUrl: true
  }
}

export function requireModel(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback || DEFAULT_MODEL
  if (typeof value !== 'string') fail('model 必须是字符串', 'model')
  const model = value.trim()
  if (!model) return fallback || DEFAULT_MODEL
  if (model.length > 128) fail('model 过长', 'model')
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(model)) {
    fail('model 只能是模型 ID 或接入点 ID（字母、数字、点、下划线、冒号、连字符）', 'model')
  }
  return model
}
