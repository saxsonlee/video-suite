/**
 * dsh-seedance-studio — api / 中转站请求体构造
 *
 * 本文件由 server/api.js 拆分而来；对外契约由 api/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_BASE_URL, DEFAULT_RELAY_CREATE_PATHS, DEFAULT_TASKS_PATH } from '../models/index.js'

export function assignDefined(target, key, value) {
  if (value !== undefined && value !== null && value !== '') target[key] = value
}

export function toRelayContentItem(item) {
  if (!item || typeof item !== 'object') return null
  if (item.type === 'draft_task') {
    const id = item.draft_task && item.draft_task.id
    return id ? { type: 'draft_task', draft_task: { id } } : null
  }
  if (item.type !== 'image_url' && item.type !== 'video_url' && item.type !== 'audio_url') return null
  const holder = item[item.type]
  const url = holder && typeof holder === 'object' ? holder.url : holder
  if (typeof url !== 'string' || !url) return null
  const node = { type: item.type }
  node[item.type] = { url }
  if (item.role) node.role = item.role === 'last_frame' ? 'end_frame' : item.role
  return node
}

/**
 * 构造中转站创建请求体（metadata / flat / orca 三种风格）。
 * @param {object} payload - 方舟风格请求体（snake_case）。
 * @param {object} options - style、mapModel(modelId)。
 */
export function buildRelayCreateBody(payload, options = {}) {
  const style = options.style || 'metadata'
  const mapModel = typeof options.mapModel === 'function' ? options.mapModel : (model) => model
  const content = Array.isArray(payload.content) ? payload.content : []
  let prompt = ''
  const media = []
  for (const item of content) {
    if (item && item.type === 'text' && !prompt) {
      prompt = String(item.text || '')
      continue
    }
    const node = toRelayContentItem(item)
    if (node) media.push(node)
  }
  if (!prompt) prompt = String(payload.prompt || '')
  const firstFrame = media.find((item) => item.type === 'image_url' && item.role === 'first_frame') || null

  const body = { model: mapModel(payload.model), prompt }
  const metadata = {}
  for (const field of ['ratio', 'resolution', 'generate_audio', 'watermark', 'return_last_frame', 'service_tier', 'camera_fixed', 'output_format', 'priority', 'seed', 'draft_task_id', 'omni_reference_task_type', 'tools', 'callback_url', 'safety_identifier']) {
    assignDefined(metadata, field, payload[field])
  }

  // MiniMax H3（经 new-api /videos）：时间用 seconds，分辨率/比例放 metadata；
  // 图生视频把首帧图放顶层 input_reference，并去掉 metadata.ratio（宽高比由首帧决定）。
  if (style === 'minimax') {
    const out = { model: mapModel(payload.model), prompt }
    if (typeof payload.duration === 'number' && payload.duration > 0) out.seconds = payload.duration
    const meta = {}
    assignDefined(meta, 'resolution', payload.resolution)
    if (firstFrame && firstFrame.image_url && firstFrame.image_url.url) {
      out.input_reference = firstFrame.image_url.url
    } else {
      assignDefined(meta, 'ratio', payload.ratio)
    }
    if (Object.keys(meta).length) out.metadata = meta
    return out
  }

  if (style === 'flat') {
    if (firstFrame) body.image = firstFrame.image_url.url
    if (typeof payload.duration === 'number' && payload.duration > 0) body.duration = payload.duration
    const flatKeys = ['ratio', 'resolution', 'seed', 'generate_audio', 'watermark', 'return_last_frame', 'service_tier', 'camera_fixed', 'output_format', 'priority']
    for (const key of flatKeys) assignDefined(body, key, metadata[key])
    const imageUrls = media.filter((item) => item.type === 'image_url').map((item) => item.image_url.url)
    if (imageUrls.length > 1) body.images = imageUrls
    return body
  }

  if (style === 'orca') {
    if (typeof payload.duration === 'number' && payload.duration > 0) metadata.duration = payload.duration
    if (media.length) metadata.content = media
    body.metadata = metadata
    return body
  }

  // new-api 风格：通用字段在顶层，Seedance 专有参数放 metadata。
  // New API 的 Seedance 插件会把 metadata 原样展开到上游任务体，duration 必须同时放进 metadata
  // 才会真正生效（只放顶层会被忽略、回落默认时长；见旧版参考归档 README §7.6，仅源码仓库）。
  // 注意：首帧图必须放在 metadata.content（带 role）里。不要再额外设置 body.image：
  // new-api 会用顶层 image 重新构造上游 content 且丢掉 role，方舟会报
  // "role must be specified for image contents"（已实测 2026-11-09）。
  if (typeof payload.duration === 'number' && payload.duration > 0) {
    body.duration = payload.duration
    metadata.duration = payload.duration
  }
  if (typeof payload.seed === 'number') body.seed = payload.seed
  if (media.length) metadata.content = media
  if (Object.keys(metadata).length) body.metadata = metadata
  return body
}
