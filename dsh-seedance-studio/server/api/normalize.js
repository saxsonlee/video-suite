/**
 * dsh-seedance-studio — api / 任务响应归一化
 *
 * 本文件由 server/api.js 拆分而来；对外契约由 api/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_BASE_URL, DEFAULT_RELAY_CREATE_PATHS, DEFAULT_TASKS_PATH } from '../models/index.js'
import { isTerminalStatus, normalizeStatus } from './status.js'
import { clampProgress, toTimestampSeconds, normalizeRemoteError, getByPath, pickTaskId, pickVideoUrl, extractErrorInfo } from './extract.js'

/**
 * 归一化方舟官方查询响应为统一 RemoteTask DTO。
 * @param {object} raw - 方舟 /tasks/{id} 响应体。
 * @returns {object} { id, status, progress, videoUrl, lastFrameUrl, error, usage, model, meta }
 */
export function normalizeArkTask(raw) {
  const task = {
    id: '',
    status: 'queued',
    progress: undefined,
    videoUrl: null,
    lastFrameUrl: null,
    error: null,
    usage: null,
    model: null,
    createdAt: undefined,
    meta: {}
  }
  if (!raw || typeof raw !== 'object') return task
  if (typeof raw.id === 'string') task.id = raw.id
  const status = normalizeStatus(raw.status)
  if (status) task.status = status
  const content = raw.content && typeof raw.content === 'object' ? raw.content : {}
  if (typeof content.video_url === 'string') task.videoUrl = content.video_url
  if (typeof content.last_frame_url === 'string') task.lastFrameUrl = content.last_frame_url
  if (raw.usage && typeof raw.usage === 'object') task.usage = raw.usage
  task.progress = clampProgress(raw.progress)
  if (typeof raw.model === 'string') task.model = raw.model
  task.createdAt = toTimestampSeconds(raw.created_at)
  for (const field of ['resolution', 'ratio', 'duration', 'seed', 'generate_audio']) {
    if (raw[field] !== undefined) task.meta[field] = raw[field]
  }
  if (typeof raw.draft_task_id === 'string' && raw.draft_task_id) task.meta.draftTaskId = raw.draft_task_id
  if (isTerminalStatus(task.status)) {
    if (task.status === 'succeeded') {
      if (!task.videoUrl) {
        // 成功但没有视频 URL：按失败处理，避免前端以为出片
        task.status = 'failed'
        task.error = { code: 'MissingVideoUrl', message: '任务成功但响应缺少 content.video_url' }
      }
    } else {
      task.error = normalizeRemoteError(task.status, raw.error)
    }
  }
  return task
}

/**
 * 归一化中转站响应为统一 RemoteTask DTO。
 * @param {object} raw - 中转站响应体。
 * @param {object} [options] - videoField、fallbackId。
 */
export function normalizeRelayTask(raw, options = {}) {
  const full = raw && typeof raw === 'object' ? raw : {}
  let core = full.data
  if (Array.isArray(core)) core = core[0]
  const looksLikeTask = core && typeof core === 'object' &&
    (core.task_id || core.id || core.status || core.result_url || core.video_url || core.url)
  if (!looksLikeTask) core = full

  const id = pickTaskId(core) || pickTaskId(full) || options.fallbackId || ''
  const videoUrl = pickVideoUrl(full, options.videoField)
  let status = normalizeStatus(core.status || full.status)
  if (!status) status = videoUrl ? 'succeeded' : 'queued'
  const task = {
    id,
    status,
    progress: clampProgress(core.progress !== undefined ? core.progress : full.progress),
    videoUrl,
    lastFrameUrl: getByPath(full, 'last_frame_url') || getByPath(full, 'data.last_frame_url') || getByPath(full, 'content.last_frame_url') || null,
    error: null,
    usage: (core.usage && typeof core.usage === 'object' ? core.usage : (full.usage && typeof full.usage === 'object' ? full.usage : null)),
    model: core.model || full.model || null,
    createdAt: toTimestampSeconds(core.created_at || full.created_at || core.submit_time || full.submit_time),
    meta: {}
  }
  // 有些中转站（MiniMax）查询响应里不带视频 URL，需要按 id 拼下载端点（如 /videos/{id}/content）
  if (status === 'succeeded' && !task.videoUrl && options.fallbackVideoUrl) {
    task.videoUrl = options.fallbackVideoUrl
    task.status = 'succeeded'
  }
  if (isTerminalStatus(status)) {
    if (status === 'succeeded') {
      if (!task.videoUrl) {
        task.status = 'failed'
        task.error = { code: 'MissingVideoUrl', message: '中转站任务成功但响应缺少视频 URL' }
      }
    } else {
      const info = extractErrorInfo(full)
      task.error = normalizeRemoteError(status, {
        code: info.code,
        message: info.message || core.fail_reason || full.fail_reason || undefined
      })
    }
  }
  return task
}
