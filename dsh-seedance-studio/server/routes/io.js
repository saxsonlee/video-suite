/**
 * dsh-seedance-studio — routes / 请求参数校验
 *
 * 本文件由 server/routes.js 拆分而来；对外契约由 routes/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { apiErrorStatus } from '../api/index.js'
import { LIMITS, MODES } from '../models/index.js'
import { MAX_SESSION_ID_CHARS, DEFAULT_MAX_BODY_BYTES } from './constants.js'
import { RequestError } from './errors.js'

/** 校验并规范化会话 ID（HTTP 参数/请求体共用）。 */
export function requireSessionId(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new RequestError(400, 'INVALID_SESSION_ID', 'sessionId 必填且必须是非空字符串')
  const value = raw.trim()
  if (value.length > MAX_SESSION_ID_CHARS) throw new RequestError(400, 'INVALID_SESSION_ID', 'sessionId 过长（最多 ' + MAX_SESSION_ID_CHARS + ' 字符）')
  if (/[\u0000-\u001f<>:"\\/|?*]/.test(value)) throw new RequestError(400, 'INVALID_SESSION_ID', 'sessionId 含非法字符')
  return value
}

/** 校验记录 ID（防路径穿越/注入）。 */
export function requireRecordId(raw) {
  if (typeof raw !== 'string' || !/^sd_[A-Za-z0-9_]{4,80}$/.test(raw.trim())) {
    throw new RequestError(400, 'INVALID_TASK_ID', '任务 ID 格式不合法（应为 sd_...）')
  }
  return raw.trim()
}

/** 读取并解析 JSON 请求体，限制字节数。 */
export async function readJsonRequest(request, maxBytes = DEFAULT_MAX_BODY_BYTES) {
  const declared = request.headers && typeof request.headers.get === 'function' ? request.headers.get('content-length') : null
  if (declared !== null && Number(declared) > maxBytes) {
    throw new RequestError(413, 'BODY_TOO_LARGE', '请求体过大（上限 ' + Math.round(maxBytes / 1024 / 1024) + ' MB）')
  }
  let buffer
  try {
    buffer = await request.arrayBuffer()
  } catch (error) {
    throw new RequestError(400, 'INVALID_BODY', '读取请求体失败：' + (error && error.message ? error.message : String(error)))
  }
  if (buffer.byteLength > maxBytes) {
    throw new RequestError(413, 'BODY_TOO_LARGE', '请求体过大（上限 ' + Math.round(maxBytes / 1024 / 1024) + ' MB）')
  }
  if (buffer.byteLength === 0) return {}
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch (error) {
    throw new RequestError(400, 'INVALID_BODY', '请求体不是合法 UTF-8')
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new RequestError(400, 'INVALID_BODY', '请求体不是合法 JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestError(400, 'INVALID_BODY', '请求体必须是 JSON 对象')
  }
  return parsed
}

export function queryValue(url, name) {
  const value = url.searchParams.get(name)
  return value === null ? null : value
}
