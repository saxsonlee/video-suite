/**
 * dsh-seedance-studio — models / 请求校验与参数归一化
 *
 * 本文件由 server/models.js 拆分而来；对外契约由 models/index.js 统一 re-export。
 */
import { MODES, LIMITS, RATIOS, RESOLUTIONS, OUTPUT_FORMATS, OMNI_TASK_TYPES } from './catalog.js'
import { fail, isPlainObject, optionalString, optionalEnum, pick, optionalBoolean, optionalInteger } from './validation.js'
import { getModel, requireModel } from './query.js'
import { normalizeImage, normalizeVideo, normalizeAudio, inferMode, assignDefaultRoles, countRoles } from './inputs.js'

/**
 * 校验并规范化一次生成请求（PLAN §4 GenerateRequest）。
 *
 * @param {object} input - 原始请求体（camelCase / snake_case 均可）。
 * @param {object} [options] - defaultModel、requirePrompt（默认 true）。
 * @returns {object} 规范化请求：{ prompt, model, mode, params, media, inputs, draftTaskId, warnings }
 */

/** 模型名规范化（与 settings/config.js 的 normalizeModelStem 规则一致；内联避免循环依赖）。 */
function normalizeModelStem(value) {
  const text = String(value === undefined || value === null ? '' : value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return text.replace(/-\d{6}$/, '')
}

/**
 * 中转站模式下把模型 ID 收敛到用户勾选的中转站模型清单：
 * 内置模型目录是方舟粒度 ID（如 doubao-seedance-2-5-260628），中转站通常只认别名（doubao-seedance-2.5）。
 * 规则：显式/默认模型不在清单时，按去掉版本日期后的名字匹配同系列项；匹配不到保留原值。
 * @returns {{model:string,adjusted:boolean,reason:string}}
 */
export function mapModelToRelay(model, relayModels) {
  const list = Array.isArray(relayModels) ? relayModels.filter((item) => item && typeof item.id === 'string' && item.id.trim()) : []
  if (list.length === 0) return { model, adjusted: false, reason: '' }
  const current = typeof model === 'string' ? model.trim() : ''
  if (!current) return { model, adjusted: false, reason: '' }
  if (list.some((item) => item.id === current)) return { model: current, adjusted: false, reason: '' }
  const stem = normalizeModelStem(current)
  const matched = stem ? list.find((item) => normalizeModelStem(item.id) === stem) : null
  if (matched) return { model: matched.id, adjusted: true, reason: '模型已映射到中转站别名：' + matched.id }
  return { model: current, adjusted: false, reason: '' }
}

export function normalizeGenerateRequest(input, options) {
  const opts = options || {}
  if (!isPlainObject(input)) fail('请求体必须是 JSON 对象')
  const requirePrompt = opts.requirePrompt !== false

  const requestedModel = requireModel(input.model, opts.defaultModel)
  const relayMapped = opts.useRelay && Array.isArray(opts.relayModels) ? mapModelToRelay(requestedModel, opts.relayModels) : { model: requestedModel, adjusted: false, reason: '' }
  const model = relayMapped.model
  const entry = getModel(model)
  const rawPrompt = optionalString(input.prompt, 'prompt', LIMITS.maxPromptChars)
  const rawInputs = isPlainObject(input.inputs) ? input.inputs : {}

  const rawImages = input.images !== undefined ? input.images : rawInputs.images
  let images = []
  if (rawImages !== undefined && rawImages !== null) {
    if (!Array.isArray(rawImages)) fail('inputs.images 必须是数组', 'inputs.images')
    const maxImages = entry ? entry.maxImages : 30
    if (rawImages.length > maxImages) fail('图片数量超过当前模型上限（' + maxImages + ' 张）', 'inputs.images')
    images = rawImages.map((raw, index) => normalizeImage(raw, index))
  }
  const video = normalizeVideo(input.video !== undefined ? input.video : rawInputs.video)
  const audio = normalizeAudio(input.audio !== undefined ? input.audio : rawInputs.audio)
  const draftTaskId = normalizeDraftTaskId(input, rawInputs, video)

  const modeRaw = optionalEnum(input.mode, 'mode', MODES)
  const modeState = { images, video, audio, draftTaskId }
  const mode = modeRaw || inferMode(modeState)
  const warnings = []
  if (relayMapped && relayMapped.adjusted && relayMapped.reason) warnings.push(relayMapped.reason)
  assignDefaultRoles(images, mode)

  validateCapabilities(entry, mode, modeState)
  validateModeInputs(entry, mode, modeState, warnings)

  let prompt = rawPrompt
  if (mode === 'draft-final') {
    if (prompt) fail('样片转正式任务不能再次传入提示词（prompt 由样片决定）', 'prompt')
    if (images.length || (video && (video.url || video.taskId)) || audio) fail('样片转正式任务不能再次传入图片/视频/音频素材', 'inputs')
  } else if (!prompt) {
    if (requirePrompt) fail('prompt 不能为空（文/图/参考/编辑/延长都需要提示词；样片转正式请传 draftTaskId）', 'prompt')
    warnings.push('prompt 为空，将仅使用素材生成')
  }

  const rawParams = isPlainObject(input.params) ? input.params : {}
  const params = normalizeParams(rawParams, entry, mode, modeState)
  const media = {
    images: images.map((image) => ({ role: image.role || undefined, url: image.dataUrl || image.url })),
    videos: video && video.url ? [{ role: 'reference_video', url: video.url }] : [],
    audios: audio ? [{ role: 'reference_audio', url: audio.dataUrl || audio.url }] : []
  }
  // 素材 URL 必须已解析（workspacePath 需宿主先读取为 data URI）
  for (let i = 0; i < media.images.length; i += 1) {
    if (!media.images[i].url) {
      fail('inputs.images[' + i + '] 的 workspacePath 需要宿主先读取为 data URI（请使用 imageUrls 或先上传）', 'inputs.images')
    }
  }

  return {
    prompt,
    model,
    mode,
    params,
    media,
    inputs: { images, video, audio },
    draftTaskId,
    warnings
  }
}

export function normalizeDraftTaskId(input, rawInputs, video) {
  const fromVideo = video && video.draftTaskId
  const explicit = input.draftTaskId !== undefined ? input.draftTaskId : rawInputs.draftTaskId
  const value = fromVideo || explicit
  if (!value) return null
  return optionalString(String(value), 'draftTaskId', LIMITS.maxDraftTaskIdChars)
}

export function validateCapabilities(entry, mode, state) {
  if (!entry) return
  if ((mode === 'image2video' || mode === 'firstlast') && entry.firstFrame !== true) {
    fail('模型 ' + entry.id + ' 不支持图片输入，请改用支持图生视频的模型', 'model')
  }
  if (mode === 'firstlast' && entry.lastFrame !== true) {
    fail('模型 ' + entry.id + ' 不支持尾帧图', 'inputs.images')
  }
  if (mode === 'reference' && entry.references !== true) {
    fail('模型 ' + entry.id + ' 不支持参考素材（参考图/视频/音频），请改选 Seedance 2.x 系列', 'model')
  }
  if ((mode === 'edit' || mode === 'extend') && entry.videoEditing !== true) {
    fail('模型 ' + entry.id + ' 不支持视频编辑/延长，请改选 Seedance 2.x 系列', 'model')
  }
  if ((mode === 'draft' || mode === 'draft-final') && entry.draft !== true) {
    fail('模型 ' + entry.id + ' 不支持样片模式（draft），仅 Seedance 2.5 支持', 'model')
  }
}

export function validateModeInputs(entry, mode, state, warnings) {
  const { images, video, audio, draftTaskId } = state
  const first = countRoles(images, 'first_frame')
  const last = countRoles(images, 'last_frame')
  const refs = countRoles(images, 'reference_image')
  const hasVideo = Boolean(video && video.url)
  const videoTaskId = Boolean(video && video.taskId)

  if (first > 1) fail('只能指定一张首帧图（first_frame）', 'inputs.images')
  if (last > 1) fail('只能指定一张尾帧图（last_frame）', 'inputs.images')
  if (last > 0 && first === 0) fail('使用尾帧图时必须同时提供首帧图（first_frame）', 'inputs.images')
  if (refs > 0 && (first > 0 || last > 0)) fail('首帧/首尾帧模式与参考图模式不能混用', 'inputs.images')

  if (mode === 'text2video') {
    if (images.length || hasVideo || videoTaskId || audio) fail('文生视频模式不支持参考素材，请切换到图生视频/全模态参考模式', 'mode')
    if (draftTaskId) fail('draftTaskId 只能用于样片转正式模式', 'mode')
  } else if (mode === 'image2video') {
    if (images.length !== 1 || first !== 1) fail('图生视频模式需要且只需要一张首帧图', 'inputs.images')
    if (hasVideo || videoTaskId || audio) fail('图生视频模式不支持视频/音频素材', 'mode')
  } else if (mode === 'firstlast') {
    if (images.length !== 2 || first !== 1 || last !== 1) fail('首尾帧模式需要一张首帧图 + 一张尾帧图', 'inputs.images')
    if (hasVideo || videoTaskId || audio) fail('首尾帧模式不支持视频/音频素材', 'mode')
  } else if (mode === 'reference') {
    if (videoTaskId) fail('参考视频暂不支持通过 taskId 引用，请提供 http(s) 视频 URL 或 asset:// 素材 ID', 'inputs.video')
    if (images.length + (hasVideo ? 1 : 0) + (audio ? 1 : 0) === 0) fail('全模态参考模式至少需要一张参考图、一段参考视频或一段参考音频', 'inputs')
    if (entry) {
      if (images.length > entry.maxImages) fail('参考图数量超过上限（' + entry.maxImages + ' 张）', 'inputs.images')
      if (hasVideo && entry.maxVideos < 1) fail('模型 ' + entry.id + ' 不支持参考视频', 'inputs.video')
      if (audio && entry.maxAudios < 1) fail('模型 ' + entry.id + ' 不支持参考音频', 'inputs.audio')
    }
  } else if (mode === 'edit' || mode === 'extend') {
    if (!hasVideo) fail((mode === 'edit' ? '视频编辑' : '视频延长') + '需要提供输入视频 URL', 'inputs.video')
    if (videoTaskId) fail('视频编辑/延长暂不支持通过 taskId 引用输入视频，请提供 http(s) 视频 URL', 'inputs.video')
    if (draftTaskId) fail('视频编辑/延长不能配合 draftTaskId 使用', 'inputs')
  } else if (mode === 'draft') {
    if (hasVideo) fail('样片模式不支持输入视频', 'inputs.video')
    if (draftTaskId) fail('样片模式不能传 draftTaskId', 'mode')
  } else if (mode === 'draft-final') {
    if (!draftTaskId) fail('样片转正式模式需要 draftTaskId（样片任务 ID）', 'draftTaskId')
    if (images.length || video || audio) fail('样片转正式模式不能传入素材', 'inputs')
  }

  if (entry && audio && images.length === 0 && !hasVideo && entry.audioAlone !== true) {
    fail('模型 ' + entry.id + ' 要求音频参考必须搭配至少一张图片或一段视频', 'inputs.audio')
  }
  if (videoTaskId && hasVideo) fail('inputs.video 的 url 与 taskId 不能同时提供', 'inputs.video')
  if (entry && entry.references !== true && refs > 0) fail('模型 ' + entry.id + ' 不支持参考图', 'inputs.images')
  if (audio && entry && entry.references !== true) fail('模型 ' + entry.id + ' 不支持参考音频', 'inputs.audio')
  if (warnings && mode === 'firstlast' && entry && entry.family === '1.0') {
    warnings.push('Seedance 1.0 首尾帧任务建议显式指定 duration')
  }
}

export function normalizeParams(raw, entry, mode, state) {
  const ratioDefault = entry ? (entry.defaultRatio || (entry.family === '1.0' ? '16:9' : 'adaptive')) : 'adaptive'
  const resolutionDefault = entry ? (entry.defaultResolution || (entry.resolutions.indexOf('720p') !== -1 ? '720p' : entry.resolutions[0])) : '720p'
  const durationDefault = entry ? entry.defaultDuration : -1

  // ---- 样片转正式：resolution 固定 1080p，禁止 prompt/素材/duration/ratio/seed/generate_audio；
  //      官方允许透传 watermark/output_format（见 api-reference §4 样片第 2 步）。
  if (mode === 'draft-final') {
    const resolution = optionalString(raw.resolution, 'resolution', 16)
    if (resolution && resolution !== '1080p') fail('样片转正式任务 resolution 必须为 1080p', 'resolution')
    const watermark = optionalBoolean(raw.watermark, 'watermark')
    const outputFormat = optionalString(pick(raw, 'outputFormat', 'output_format'), 'outputFormat', 16) || undefined
    if (outputFormat !== undefined) {
      if (OUTPUT_FORMATS.indexOf(outputFormat) === -1) fail('outputFormat 取值必须是 ' + OUTPUT_FORMATS.join(' / '), 'outputFormat')
      if (entry && entry.outputFormats.indexOf(outputFormat) === -1) fail('模型 ' + entry.id + ' 仅支持输出格式 ' + entry.outputFormats.join('/'), 'outputFormat')
    }
    return { resolution: '1080p', ratio: null, duration: null, generateAudio: undefined, seed: undefined, watermark, cameraFixed: undefined, returnLastFrame: undefined, outputFormat, priority: undefined, draft: false, omniType: 'auto' }
  }

  // ---- 分辨率 ----
  let resolution = optionalString(raw.resolution, 'resolution', 16) || resolutionDefault
  const allowedResolutions = entry && Array.isArray(entry.resolutions) && entry.resolutions.length ? entry.resolutions : RESOLUTIONS
  if (allowedResolutions.indexOf(resolution) === -1) {
    fail('模型 ' + (entry ? entry.id : '当前') + ' 支持的分辨率为 ' + allowedResolutions.join('/'), 'resolution')
  }
  if (mode === 'draft') {
    if (raw.resolution && raw.resolution !== '480p') fail('样片模式（draft）只能使用 480p 分辨率', 'resolution')
    resolution = '480p'
  }

  // ---- 比例 ----
  let ratio = optionalString(raw.ratio, 'ratio', 16) || ratioDefault
  if (RATIOS.indexOf(ratio) === -1) fail('ratio 取值必须是 ' + RATIOS.join(' / '), 'ratio')
  if (entry && entry.ratios.indexOf(ratio) === -1) {
    fail('模型 ' + entry.id + ' 支持的 ratio 为 ' + entry.ratios.join('/'), 'ratio')
  }
  const firstOrLast = state.images.some((image) => image.role === 'first_frame' || image.role === 'last_frame')
  const isEditOrExtend = mode === 'edit' || mode === 'extend'
  if (entry && entry.family === '2.5' && (firstOrLast || isEditOrExtend)) ratio = 'adaptive'
  if (entry && entry.family === '1.0' && mode === 'text2video' && ratio === 'adaptive') {
    fail('Seedance 1.0 系列文生视频不支持 ratio=adaptive，请使用 16:9 / 9:16 等具体比例', 'ratio')
  }

  // ---- 时长 ----
  let duration
  if (mode === 'edit' && entry && entry.family === '2.5') {
    // 2.5 视频编辑任务 duration 必须为 -1（官方约束）；2.0 系列编辑按普通时长
    duration = -1
  } else {
    duration = optionalInteger(raw.duration, 'duration', -1, 60)
    if (duration === undefined) duration = durationDefault
    if (duration === -1) {
      if (entry && entry.autoDuration !== true) fail('模型 ' + entry.id + ' 不支持 duration=-1（自动时长）', 'duration')
    } else if (entry && (duration < entry.durations[0] || duration > entry.durations[1])) {
      fail('duration 取值范围为 ' + entry.durations[0] + ' ~ ' + entry.durations[1] + ' 秒', 'duration')
    } else if (!entry && (duration < 1 || duration > 60)) {
      fail('duration 建议 1 ~ 60 秒', 'duration')
    }
  }

  // ---- 其它布尔/整数参数 ----
  const generateAudio = optionalBoolean(pick(raw, 'generateAudio', 'generate_audio'), 'generateAudio')
  if (generateAudio === true && entry && entry.audio !== true) {
    fail('模型 ' + entry.id + ' 不支持生成音频，请关闭 generateAudio 或改选 Seedance 2.x', 'generateAudio')
  }
  const watermark = optionalBoolean(raw.watermark, 'watermark')
  const cameraFixed = optionalBoolean(pick(raw, 'cameraFixed', 'camera_fixed'), 'cameraFixed')
  if (cameraFixed === true && entry && entry.family !== '1.0') {
    fail('模型 ' + entry.id + ' 不支持 cameraFixed 固定镜头', 'cameraFixed')
  }
  const seed = optionalInteger(raw.seed, 'seed', -1, LIMITS.maxSeed)
  // 官方默认 return_last_frame=false；本插件默认 true 是刻意选择：
  // 落盘尾帧后，「基于历史视频再创作」才能在本机续写（远端 URL 仅 24h 有效），且不额外收费。
  const rawReturnLastFrame = optionalBoolean(pick(raw, 'returnLastFrame', 'return_last_frame'), 'returnLastFrame')
  const returnLastFrame = rawReturnLastFrame === undefined ? true : rawReturnLastFrame
  const outputFormat = optionalString(pick(raw, 'outputFormat', 'output_format'), 'outputFormat', 16) || undefined
  if (outputFormat !== undefined) {
    if (OUTPUT_FORMATS.indexOf(outputFormat) === -1) fail('outputFormat 取值必须是 ' + OUTPUT_FORMATS.join(' / '), 'outputFormat')
    if (entry && entry.outputFormats.indexOf(outputFormat) === -1) {
      fail('模型 ' + entry.id + ' 仅支持输出格式 ' + entry.outputFormats.join('/'), 'outputFormat')
    }
  }
  const priority = optionalInteger(raw.priority, 'priority', 0, 9)
  if (priority !== undefined && entry && entry.priority !== true) fail('模型 ' + entry.id + ' 不支持 priority', 'priority')
  const omniType = mode === 'edit' ? 'edit' : mode === 'extend' ? 'extend' : (optionalEnum(raw.omniType, 'omniType', OMNI_TASK_TYPES) || 'auto')
  if ((omniType === 'edit' || omniType === 'extend') && mode !== 'edit' && mode !== 'extend') {
    fail('omniType=edit/extend 请使用 mode=edit / mode=extend', 'omniType')
  }

  return {
    resolution,
    ratio,
    duration,
    generateAudio,
    watermark,
    cameraFixed,
    seed,
    returnLastFrame,
    outputFormat,
    priority,
    draft: mode === 'draft',
    omniType
  }
}
