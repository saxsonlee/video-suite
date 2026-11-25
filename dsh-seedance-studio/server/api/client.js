/**
 * dsh-seedance-studio — api / 客户端工厂
 *
 * 本文件由 server/api.js 拆分而来；对外契约由 api/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_BASE_URL, DEFAULT_RELAY_CREATE_PATHS, DEFAULT_TASKS_PATH } from '../models/index.js'
import { ApiError } from './errors.js'
import { ArkVideoClient } from './ark.js'
import { RelayVideoClient } from './relay.js'

/**
 * 根据运行期配置创建远端客户端（demo 模式不创建远端客户端）。
 * @param {object} config - settings.resolveConfig() 的返回值。
 * @param {object} [options] - fetchImpl、timeoutMs。
 */
export function createVideoClient(config, options = {}) {
  if (!config) throw new ApiError('缺少运行期配置', { code: 'MissingConfig' })
  if (config.demo || config.provider === 'demo') {
    throw new ApiError('演示模式（demo）没有远端客户端，请使用本地模拟任务', { code: 'DemoMode' })
  }
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const timeoutMs = options.timeoutMs || config.requestTimeoutMs || 60000
  if (config.provider === 'relay') {
    if (!config.relay) throw new ApiError(config.configError || '中转站配置不完整', { code: 'MissingRelayBaseUrl' })
    return new RelayVideoClient({ ...config.relay, fetchImpl, timeoutMs })
  }
  return new ArkVideoClient({
    apiKey: config.arkApiKey,
    baseUrl: config.ark.baseUrl,
    tasksPath: config.ark.tasksPath,
    timeoutMs,
    fetchImpl
  })
}
