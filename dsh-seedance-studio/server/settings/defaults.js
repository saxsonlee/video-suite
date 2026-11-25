/**
 * dsh-seedance-studio — settings / 默认值与设置键
 *
 * 本文件由 server/settings.js 拆分而来；对外契约由 settings/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DEFAULT_MODEL, DEFAULT_BASE_URL, DEFAULT_TASKS_PATH, DEFAULT_RELAY_CREATE_PATHS } from '../models/index.js'

/** 持久化目录名（位于 $DSH_HOME/storages/ 下）。 */
export const STORAGE_DIR_NAME = 'seedance-studio'

/** 用户设置文件名。 */
export const SETTINGS_FILE_NAME = 'settings.json'

/** 支持的 provider 取值。 */
export const PROVIDERS = ['auto', 'ark', 'relay', 'demo']

/** 中转站协议。 */
export const RELAY_PROTOCOLS = ['ark', 'openai', 'minimax']

/** 中转站请求体风格。 */
export const RELAY_STYLES = ['metadata', 'flat', 'orca', 'minimax']

/** 默认值（最低优先级）。 */
export const DEFAULTS = {
  provider: 'auto',
  ARK_API_KEY: '',
  ARK_BASE_URL: DEFAULT_BASE_URL,
  ARK_TASKS_PATH: DEFAULT_TASKS_PATH,
  RELAY_BASE_URL: '',
  RELAY_API_KEY: '',
  RELAY_PROTOCOL: '',
  RELAY_CREATE_PATH: '',
  RELAY_QUERY_PATH: '',
  RELAY_CANCEL_PATH: '',
  RELAY_STYLE: 'metadata',
  RELAY_MODEL_MAP: '',
  RELAY_MODELS: '',
  RELAY_AUTH_HEADER: 'Authorization',
  RELAY_AUTH_PREFIX: 'Bearer ',
  DEFAULT_MODEL,
  DEMO: '',
  POLL_INTERVAL_MS: 3000,
  WAIT_TIMEOUT_MS: 15 * 60 * 1000,
  RUNNING_TIMEOUT_MS: 20 * 60 * 1000,
  REQUEST_TIMEOUT_MS: 60000,
  DOWNLOAD_TIMEOUT_MS: 600000,
  MAX_BODY_BYTES: 64 * 1024 * 1024,
  DEBUG: false
}

/** 允许写入 settings.json 的字段（白名单，防止注入任意对象）。 */
export const SETTING_KEYS = Object.keys(DEFAULTS)

/** 前端可能用 camelCase 提交的字段别名。 */
export const KEY_ALIASES = {
  provider: 'provider',
  demo: 'DEMO',
  debug: 'DEBUG',
  arkApiKey: 'ARK_API_KEY',
  arkBaseUrl: 'ARK_BASE_URL',
  arkTasksPath: 'ARK_TASKS_PATH',
  relayApiKey: 'RELAY_API_KEY',
  relayBaseUrl: 'RELAY_BASE_URL',
  relayProtocol: 'RELAY_PROTOCOL',
  relayCreatePath: 'RELAY_CREATE_PATH',
  relayQueryPath: 'RELAY_QUERY_PATH',
  relayCancelPath: 'RELAY_CANCEL_PATH',
  relayStyle: 'RELAY_STYLE',
  relayModelMap: 'RELAY_MODEL_MAP',
  relayModels: 'RELAY_MODELS',
  relayAuthHeader: 'RELAY_AUTH_HEADER',
  relayAuthPrefix: 'RELAY_AUTH_PREFIX',
  defaultModel: 'DEFAULT_MODEL',
  pollIntervalMs: 'POLL_INTERVAL_MS',
  waitTimeoutMs: 'WAIT_TIMEOUT_MS',
  runningTimeoutMs: 'RUNNING_TIMEOUT_MS',
  requestTimeoutMs: 'REQUEST_TIMEOUT_MS',
  maxBodyBytes: 'MAX_BODY_BYTES'
}
