/**
 * dsh-seedance-studio — api / 远端任务状态映射
 *
 * 本文件由 server/api.js 拆分而来；对外契约由 api/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_BASE_URL, DEFAULT_RELAY_CREATE_PATHS, DEFAULT_TASKS_PATH } from '../models/index.js'

/** 任务终态。 */
export const TERMINAL_STATUSES = ['succeeded', 'failed', 'cancelled', 'expired']

/** 状态归一化映射（兼容中转站的各种写法）。 */
export const STATUS_MAP = {
  queued: 'queued',
  pending: 'queued',
  not_start: 'queued',
  notstart: 'queued',
  submitted: 'queued',
  waiting: 'queued',
  created: 'queued',
  running: 'running',
  in_progress: 'running',
  inprogress: 'running',
  processing: 'running',
  generating: 'running',
  started: 'running',
  succeeded: 'succeeded',
  success: 'succeeded',
  successful: 'succeeded',
  completed: 'succeeded',
  complete: 'succeeded',
  finished: 'succeeded',
  done: 'succeeded',
  failed: 'failed',
  failure: 'failed',
  error: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  cancel: 'cancelled',
  expired: 'expired',
  timeout: 'expired',
  timed_out: 'expired'
}

/** 判断是否终态。 */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.indexOf(status) !== -1
}

/** 归一化任务状态（无法识别时返回 null）。 */
export function normalizeStatus(value) {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (STATUS_MAP[key]) return STATUS_MAP[key]
  const compact = key.replace(/_/g, '')
  for (const name of Object.keys(STATUS_MAP)) {
    if (name.replace(/_/g, '') === compact) return STATUS_MAP[name]
  }
  return null
}
