/**
 * dsh-seedance-studio — api / 轮询与 URL 工具
 *
 * 本文件由 server/api.js 拆分而来；对外契约由 api/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_BASE_URL, DEFAULT_RELAY_CREATE_PATHS, DEFAULT_TASKS_PATH } from '../models/index.js'
import { ApiError, ApiTimeoutError } from './errors.js'
import { isTerminalStatus } from './status.js'

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    let timer = null
    const cleanup = () => {
      if (timer) clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      cleanup()
      reject(new ApiError('等待任务已被取消', { code: 'Aborted' }))
    }
    timer = setTimeout(() => {
      cleanup()
      resolve()
    }, ms)
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort)
    }
  })
}

/** 校验任务 ID 格式（防止 URL 注入）。 */
export function assertTaskId(taskId) {
  if (typeof taskId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(taskId)) {
    throw new ApiError('任务 ID 格式不合法：' + String(taskId), { code: 'InvalidTaskId' })
  }
  return taskId
}

/**
 * 单任务轮询（generic：client 只需实现 getTask）。
 * @returns 终态 RemoteTask；超时抛 ApiTimeoutError；signal 中止抛 ApiError。
 */
export async function pollTask(client, taskId, options = {}) {
  const intervalMs = options.intervalMs || 5000
  const timeoutMs = options.timeoutMs || 15 * 60 * 1000
  const onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : () => {}
  const startedAt = Date.now()
  let lastTask = null
  while (true) {
    lastTask = await client.getTask(taskId)
    onUpdate(lastTask)
    if (lastTask && isTerminalStatus(lastTask.status)) return lastTask
    if (Date.now() - startedAt > timeoutMs) {
      throw new ApiTimeoutError('等待任务超时（' + Math.round(timeoutMs / 1000) + ' 秒），任务 ' + taskId + ' 当前状态：' + (lastTask && lastTask.status ? lastTask.status : 'unknown'), lastTask)
    }
    await sleep(intervalMs, options.signal)
  }
}

export function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
}

export function normalizeTasksPath(tasksPath) {
  let value = String(tasksPath || DEFAULT_TASKS_PATH).trim()
  if (!value.startsWith('/')) value = '/' + value
  return value.replace(/\/+$/, '')
}
