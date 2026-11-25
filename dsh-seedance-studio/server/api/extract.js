/**
 * dsh-seedance-studio — api / JSON/任务字段提取工具
 *
 * 本文件由 server/api.js 拆分而来；对外契约由 api/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_BASE_URL, DEFAULT_RELAY_CREATE_PATHS, DEFAULT_TASKS_PATH } from '../models/index.js'

/** 读取响应体为 JSON（非 JSON 时返回 { raw }，不抛错）。 */
export async function readJsonSafe(response) {
  let text = ''
  try {
    text = await response.text()
  } catch (error) {
    if (error && error.name === 'AbortError') throw error
    return null
  }
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (error) {
    return { raw: text }
  }
}

/** 按点号路径读取嵌套字段。 */
export function getByPath(obj, dotPath) {
  if (obj === null || obj === undefined) return undefined
  const parts = String(dotPath).split('.')
  let cursor = obj
  for (const part of parts) {
    if (cursor === null || cursor === undefined) return undefined
    if (Array.isArray(cursor) && /^\d+$/.test(part)) cursor = cursor[Number(part)]
    else if (typeof cursor === 'object') cursor = cursor[part]
    else return undefined
  }
  return cursor
}

/** 从响应中提取任务 ID（兼容多种中转站字段）。 */
export function pickTaskId(raw) {
  if (!raw || typeof raw !== 'object') return null
  const candidates = ['task_id', 'id', 'data.task_id', 'data.id', 'data.data.task_id', 'data.data.id', 'data.0.task_id', 'data.0.id', 'video_id']
  for (const candidate of candidates) {
    const value = getByPath(raw, candidate)
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return null
}

/** 从响应中按候选路径提取视频 URL。 */
export function pickVideoUrl(raw, preferredPath) {
  const candidates = preferredPath ? [preferredPath] : []
  candidates.push(
    'content.video_url',
    'data.content.video_url',
    'result_url',
    'data.result_url',
    'video_url',
    'data.video_url',
    'url',
    'data.url',
    'video.url',
    'videos.0.url',
    'outputs.0.url',
    'output',
    'data.output',
    'data.0.url',
    'data.0.video_url',
    'data.0.result_url',
    'data.videos.0.url',
    'data.videos.0.video_url',
    'data.outputs.0.url',
    'data.data.video_url',
    'data.data.result_url',
    'data.content.video_url',
    'data.result.video_url'
  )
  for (const candidate of candidates) {
    let value = getByPath(raw, candidate)
    if (Array.isArray(value)) value = value[0]
    if (value && typeof value === 'object') value = value.url || value.video_url || value.src || value.href
    if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value
  }
  return null
}

/** 提取错误信息（兼容 {error:{message}} / {message} 等结构）。 */
export function extractErrorInfo(data) {
  if (!data || typeof data !== 'object') return { message: '', code: null, type: null }
  const first = data.error && typeof data.error === 'object' ? data.error : null
  const inner = data.data && typeof data.data === 'object' ? data.data : null
  const innerErr = inner && inner.error && typeof inner.error === 'object' ? inner.error : null
  const message =
    (first && (first.message || first.msg)) ||
    (innerErr && (innerErr.message || innerErr.msg)) ||
    (typeof data.error === 'string' ? data.error : '') ||
    data.message ||
    data.msg ||
    data.detail ||
    (inner && (inner.message || inner.fail_reason)) ||
    ''
  const code = (first && first.code) || (innerErr && innerErr.code) || data.code || (inner && inner.code) || null
  const type = (first && first.type) || data.type || (innerErr && innerErr.type) || null
  return { message: message || '', code: code || null, type: type || null }
}

export function clampProgress(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return undefined
  return Math.max(0, Math.min(100, Math.round(num)))
}

export function toTimestampSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value)
  }
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return Math.floor(parsed / 1000)
  }
  return undefined
}

export function normalizeRemoteError(status, rawError) {
  if (!rawError) {
    if (status === 'cancelled') return { code: 'Cancelled', message: '任务已取消' }
    if (status === 'expired') return { code: 'Expired', message: '任务已过期（超过执行有效期仍未完成）' }
    return null
  }
  if (typeof rawError === 'string') return { code: null, message: rawError }
  return {
    code: rawError.code || rawError.type || null,
    message: rawError.message || rawError.msg || (status === 'cancelled' ? '任务已取消' : '任务失败')
  }
}
