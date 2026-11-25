/**
 * dsh-seedance-studio — models / 方舟请求体构造
 *
 * 本文件由 server/models.js 拆分而来；对外契约由 models/index.js 统一 re-export。
 */
import { ValidationError } from './validation.js'
import { getModel } from './query.js'
import { normalizeGenerateRequest } from './request.js'

/**
 * 把规范化请求转换为方舟官方创建任务请求体（snake_case）。
 * @param {object} normalized - normalizeGenerateRequest 的返回值。
 * @returns {object} Ark 请求体。
 */
export function buildArkPayload(normalized) {
  if (!normalized || typeof normalized !== 'object') throw new ValidationError('buildArkPayload 需要规范化请求对象')
  const { model, mode, prompt, media, params, draftTaskId } = normalized
  const content = []
  if (mode === 'draft-final') {
    content.push({ type: 'draft_task', draft_task: { id: draftTaskId } })
  } else {
    if (prompt) content.push({ type: 'text', text: prompt })
    const images = (media && media.images) || []
    for (const image of images) {
      content.push({ type: 'image_url', image_url: { url: image.url }, ...(image.role ? { role: image.role } : {}) })
    }
    const videos = (media && media.videos) || []
    for (const video of videos) content.push({ type: 'video_url', video_url: { url: video.url }, role: 'reference_video' })
    const audios = (media && media.audios) || []
    for (const audio of audios) content.push({ type: 'audio_url', audio_url: { url: audio.url }, role: 'reference_audio' })
  }
  if (content.length === 0) throw new ValidationError('请求内容为空：请至少填写提示词或提供素材')

  const payload = { model, content }
  const entry = getModel(model)
  if (mode === 'draft') payload.draft = true
  // omni_reference_task_type 是 2.5 专有字段：2.0 系列靠提示词意图 + reference_video 完成编辑/延长，不传该字段
  if ((mode === 'edit' || mode === 'extend') && entry && entry.family === '2.5') payload.omni_reference_task_type = mode
  if (params.resolution) payload.resolution = params.resolution
  if (params.ratio) payload.ratio = params.ratio
  if (typeof params.duration === 'number' && mode !== 'draft-final') payload.duration = params.duration
  if (params.generateAudio !== undefined) payload.generate_audio = params.generateAudio
  if (params.watermark !== undefined) payload.watermark = params.watermark
  if (params.cameraFixed !== undefined) payload.camera_fixed = params.cameraFixed
  if (params.seed !== undefined) payload.seed = params.seed
  if (params.returnLastFrame !== undefined && mode !== 'draft-final') payload.return_last_frame = params.returnLastFrame
  if (params.outputFormat) payload.output_format = params.outputFormat
  if (params.priority !== undefined) payload.priority = params.priority
  return payload
}

/** 生成请求的一行摘要（日志/展示用，隐藏 data URI 大字段）。 */
export function summarizeRequest(normalized) {
  const media = normalized.media || { images: [], videos: [], audios: [] }
  return {
    model: normalized.model,
    mode: normalized.mode,
    promptChars: (normalized.prompt || '').length,
    images: media.images.length,
    videos: media.videos.length,
    audios: media.audios.length,
    params: normalized.params
  }
}
