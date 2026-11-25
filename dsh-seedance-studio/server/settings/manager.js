/**
 * dsh-seedance-studio — settings / 设置管理器
 *
 * 本文件由 server/settings.js 拆分而来；对外契约由 settings/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DEFAULT_MODEL, DEFAULT_BASE_URL, DEFAULT_TASKS_PATH, DEFAULT_RELAY_CREATE_PATHS } from '../models/index.js'
import { PROVIDERS, SETTINGS_FILE_NAME, SETTING_KEYS } from './defaults.js'
import { isMaskedSecret, parseDemoFlag, parseIntSafe, normalizeString } from './values.js'
import { normalizeSettingRecord, readSettingsFile, mergeSettings, writeJsonAtomic } from './record.js'
import { defaultStorageRoot } from './paths.js'
import { resolveConfig } from './config.js'
import { settingsView } from './view.js'

/** 设置更新/校验失败。 */
export class SettingError extends Error {
  constructor(message, field) {
    super(message)
    this.name = 'SettingError'
    this.field = field || null
  }
}

/** 计算一次设置更新的落盘 diff（只保留白名单字段，忽略打码值）。 */
export function applySettingsPatch(currentValues, patch) {
  const normalized = normalizeSettingRecord(patch)
  const next = { ...currentValues }
  const changed = {}
  for (const [key, rawValue] of Object.entries(normalized)) {
    if (key === 'provider') {
      const value = normalizeString(rawValue).toLowerCase()
      if (PROVIDERS.indexOf(value) === -1) throw new SettingError('provider 取值必须是 ' + PROVIDERS.join(' / '), 'provider')
      if (next.provider !== value) { next.provider = value; changed.provider = value }
      continue
    }
    if (key === 'ARK_API_KEY' || key === 'RELAY_API_KEY') {
      const value = normalizeString(rawValue)
      if (isMaskedSecret(value)) continue // 打码值不回写
      if (value === '') continue // 空串表示不修改（清空请显式删除文件字段；避免误清）
      if (next[key] !== value) { next[key] = value; changed[key] = value }
      continue
    }
    if (key === 'DEMO' || key === 'DEBUG') {
      const flag = parseDemoFlag(rawValue)
      const value = flag === undefined ? '' : flag
      if (next[key] !== value) { next[key] = value; changed[key] = value }
      continue
    }
    if (key === 'RELAY_MODELS') {
      const text = Array.isArray(rawValue) ? JSON.stringify(rawValue) : normalizeString(rawValue)
      if (text.length > 65536) throw new SettingError('RELAY_MODELS 缓存过大（上限 64KB）', 'RELAY_MODELS')
      if (next[key] !== text) { next[key] = text; changed[key] = text }
      continue
    }
    if (key === 'RELAY_MODEL_MAP') {
      const trimmed = normalizeString(rawValue)
      if (next[key] !== trimmed) { next[key] = trimmed; changed[key] = trimmed }
      continue
    }
    if (['POLL_INTERVAL_MS', 'WAIT_TIMEOUT_MS', 'REQUEST_TIMEOUT_MS', 'DOWNLOAD_TIMEOUT_MS', 'MAX_BODY_BYTES'].indexOf(key) !== -1) {
      const value = parseIntSafe(rawValue, next[key], 0, 1024 * 1024 * 1024 * 10)
      if (next[key] !== value) { next[key] = value; changed[key] = value }
      continue
    }
    const value = normalizeString(rawValue)
    if (next[key] !== value) { next[key] = value; changed[key] = value }
  }
  return { next, changed }
}

/**
 * 创建设置管理器：加载 settings.json、解析运行期配置、原子保存更新。
 * @param {object} options - storageRoot、env、pluginConfig、fsImpl。
 * @returns {object} 管理器：getConfig/reload/view/update/settingsFile。
 */
export function createSettingsManager(options = {}) {
  const fsImpl = options.fsImpl || fs
  const env = options.env || process.env
  const pluginConfig = options.pluginConfig || {}
  const storageRoot = options.storageRoot || defaultStorageRoot(env)
  const settingsFile = path.join(storageRoot, SETTINGS_FILE_NAME)
  let state = load()

  function load() {
    const read = readSettingsFile(settingsFile, fsImpl)
    const merged = mergeSettings({ file: read.data, env, pluginConfig, fileError: read.error })
    const fileValues = normalizeSettingRecord(read.data)
    return { merged, fileValues, read }
  }

  function getConfig() {
    return resolveConfig(state.merged, { storageRoot, settingsFile })
  }

  function reload() {
    state = load()
    return getConfig()
  }

  /** 写回 settings.json（仅白名单字段；密钥打码值不覆盖真实值）。 */
  function saveFileValues(nextValues) {
    const persisted = {}
    for (const key of SETTING_KEYS) {
      const value = nextValues[key]
      if (value === undefined || value === null || value === '') continue
      if (key === 'RELAY_MODEL_MAP' && value && typeof value === 'object' && Object.keys(value).length === 0) continue
      persisted[key] = value
    }
    writeJsonAtomic(settingsFile, persisted, fsImpl)
  }

  /**
   * 更新部分设置并立即生效。
   * @param {object} patch - 部分设置（支持 camelCase 别名）。
   * @returns {{ config: object, view: object, changed: object }}
   */
  function update(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new SettingError('设置必须是 JSON 对象')
    const { next, changed } = applySettingsPatch(state.fileValues, patch)
    if (Object.keys(changed).length === 0) {
      return { config: getConfig(), view: settingsView(getConfig()), changed: {} }
    }
    saveFileValues(next)
    state = load()
    const config = getConfig()
    return { config, view: settingsView(config), changed }
  }

  return {
    storageRoot,
    settingsFile,
    getConfig,
    reload,
    view() { return settingsView(getConfig()) },
    update,
    get fileValues() { return { ...state.fileValues } }
  }
}
