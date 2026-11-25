/**
 * dsh-seedance-studio — settings / 设置对外视图
 *
 * 本文件由 server/settings.js 拆分而来；对外契约由 settings/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DEFAULT_MODEL, DEFAULT_BASE_URL, DEFAULT_TASKS_PATH, DEFAULT_RELAY_CREATE_PATHS } from '../models/index.js'
import { maskSecret } from './values.js'

/** 生成可下发给浏览器的设置视图（密钥打码，绝不返回明文）。 */
export function settingsView(config) {
  const relay = config.relay
  return {
    provider: config.provider,
    providerRequested: config.providerRequested,
    demo: config.demo === true,
    demoReason: config.demoReason || '',
    defaultModel: config.defaultModel,
    arkBaseUrl: config.ark.baseUrl,
    arkTasksPath: config.ark.tasksPath,
    relayBaseUrl: relay ? relay.baseUrl : (config.relayBaseUrl || ''),
    relayModels: Array.isArray(config.relayModels) ? config.relayModels.map((item) => ({ id: item.id, label: item.label })) : [],
    relayProtocol: relay ? relay.protocol : '',
    relayStyle: relay ? relay.style : '',
    relayCreatePath: relay ? relay.createPath : '',
    keys: {
      ark: maskSecret(config.arkApiKey),
      relay: maskSecret(config.relayApiKey)
    },
    hasArkKey: Boolean(config.arkApiKey),
    hasRelayKey: Boolean(config.relayApiKey),
    pollIntervalMs: config.pollIntervalMs,
    waitTimeoutMs: config.waitTimeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
    debug: config.debug,
    storageRoot: config.storageRoot,
    configError: config.configError || null,
    warnings: config.warnings.slice(),
    sources: { ...config.sources }
  }
}
