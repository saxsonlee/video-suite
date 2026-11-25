/**
 * dsh-seedance-studio — store / 记录模型与状态
 *
 * 本文件由 server/store.js 拆分而来；对外契约由 store/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { SETTINGS_FILE_NAME, defaultStorageRoot } from '../settings/index.js'
import { safeFileSegment } from './files.js'

/** 记录状态枚举（PLAN §4）。 */
export const RECORD_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired']

/** 持久化错误。 */
export class StoreError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'StoreError'
    this.code = code || null
  }
}

/** 生成记录 ID：sd_<时间戳>_<随机串>。 */
export function createRecordId(now = Date.now(), random = Math.random) {
  const suffix = Math.floor(random() * 0xffffffff).toString(36).padStart(6, '0').slice(0, 6)
  return 'sd_' + now.toString(36) + '_' + suffix + Math.floor(random() * 1296).toString(36).padStart(2, '0')
}

/** 校验记录 ID（同时用于文件名，禁止路径穿越）。 */
export function isValidRecordId(id) {
  return typeof id === 'string' && /^sd_[A-Za-z0-9_]{4,80}$/.test(id)
}

/** 归一化单条历史记录（容错旧版本字段/类型）。 */
export function normalizeRecord(raw, fallbackSessionId) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const id = isValidRecordId(source.id) ? source.id : createRecordId()
  const sessionId = typeof source.sessionId === 'string' && source.sessionId ? source.sessionId : String(fallbackSessionId || 'default')
  const createdAt = Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : Date.now()
  const updatedAt = Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : createdAt
  const status = RECORD_STATUSES.indexOf(source.status) !== -1 ? source.status : 'queued'
  const record = {
    id,
    sessionId,
    createdAt,
    updatedAt,
    status,
    progress: Number.isFinite(Number(source.progress)) ? Math.max(0, Math.min(100, Math.round(Number(source.progress)))) : 0,
    prompt: typeof source.prompt === 'string' ? source.prompt : '',
    model: typeof source.model === 'string' ? source.model : '',
    provider: source.provider === 'relay' ? 'relay' : (source.provider === 'demo' ? 'demo' : 'ark'),
    mode: typeof source.mode === 'string' ? source.mode : 'text2video',
    params: source.params && typeof source.params === 'object' && !Array.isArray(source.params) ? { ...source.params } : {},
    inputs: source.inputs && typeof source.inputs === 'object' && !Array.isArray(source.inputs) ? source.inputs : { images: [], video: null, audio: null },
    meta: source.meta && typeof source.meta === 'object' && !Array.isArray(source.meta) ? { ...source.meta } : {}
  }
  for (const field of ['remoteTaskId', 'remoteVideoUrl', 'remoteLastFrameUrl', 'toolCallId', 'originId', 'error']) {
    if (source[field] !== undefined && source[field] !== null) record[field] = source[field]
  }
  if (record.error && typeof record.error === 'object') {
    record.error = { code: record.error.code || null, message: record.error.message || '任务失败' }
  }
  const files = source.files && typeof source.files === 'object' && !Array.isArray(source.files) ? source.files : {}
  record.files = {}
  for (const kind of ['video', 'lastFrame', 'poster']) {
    if (typeof files[kind] === 'string' && files[kind]) record.files[kind] = safeFileSegment(files[kind])
  }
  if (Array.isArray(record.inputs.images)) {
    record.inputs.images = record.inputs.images.filter((item) => item && typeof item === 'object').map((item) => ({ ...item }))
  } else {
    record.inputs.images = []
  }
  return record
}

export function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record))
}
