/**
 * dsh-seedance-studio — tasks / 轮询辅助
 *
 * 本文件由 server/tasks.js 拆分而来；对外契约由 tasks/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createVideoClient, isTerminalStatus, ApiError, ApiTimeoutError, downloadFile, describeApiError } from '../api/index.js'
import { normalizeGenerateRequest, buildArkPayload, getModel, MODES, ValidationError } from '../models/index.js'
import { createRecordId, isValidRecordId } from '../store/index.js'

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function jitter(maxMs = 1000, random = Math.random) {
  return Math.floor(random() * maxMs)
}
