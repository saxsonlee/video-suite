/**
 * dsh-seedance-studio — tasks / 任务错误
 *
 * 本文件由 server/tasks.js 拆分而来；对外契约由 tasks/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createVideoClient, isTerminalStatus, ApiError, ApiTimeoutError, downloadFile, describeApiError } from '../api/index.js'
import { normalizeGenerateRequest, buildArkPayload, getModel, MODES, ValidationError } from '../models/index.js'
import { createRecordId, isValidRecordId } from '../store/index.js'

/** 任务管理器错误（HTTP 层据此映射状态码）。 */
export class TaskError extends Error {
  constructor(message, code, status = 0) {
    super(message)
    this.name = 'TaskError'
    this.code = code || 'TaskError'
    this.status = status
  }
}

export function errorMessage(error) {
  if (!error) return '未知错误'
  if (error.code === 'WaitTimeout' || error.code === 'Aborted') return error.message
  if (error.name === 'ValidationError') return error.message
  if (error instanceof ApiError || error instanceof TaskError) return describeApiError(error)
  return error && error.message ? error.message : String(error)
}
