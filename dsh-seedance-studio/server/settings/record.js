/**
 * dsh-seedance-studio — settings / 设置文件读写与合并
 *
 * 本文件由 server/settings.js 拆分而来；对外契约由 settings/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DEFAULT_MODEL, DEFAULT_BASE_URL, DEFAULT_TASKS_PATH, DEFAULT_RELAY_CREATE_PATHS } from '../models/index.js'
import { SETTING_KEYS, KEY_ALIASES, DEFAULTS } from './defaults.js'

/** 把任意来源（settings 文件/环境变量/插件 config）的值规范为白名单字段记录。 */
export function normalizeSettingRecord(raw) {
  const record = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return record
  for (const [rawKey, rawValue] of Object.entries(raw)) {
    const key = KEY_ALIASES[rawKey] || rawKey
    if (SETTING_KEYS.indexOf(key) === -1) continue
    record[key] = rawValue
  }
  return record
}

/** 读取 settings.json；文件不存在或损坏时返回空记录并带错误信息（不让宿主崩溃）。 */
export function readSettingsFile(filePath, fsImpl = fs) {
  try {
    if (!fsImpl.existsSync(filePath)) return { data: {}, error: null }
    const text = fsImpl.readFileSync(filePath, 'utf8')
    if (!text || !text.trim()) return { data: {}, error: null }
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { data: {}, error: 'settings.json 顶层必须是对象' }
    }
    return { data: normalizeSettingRecord(parsed), error: null }
  } catch (error) {
    return { data: {}, error: 'settings.json 读取失败：' + (error && error.message ? error.message : String(error)) }
  }
}

/** 原子写 JSON 文件：先写临时文件再 rename；尽力设置 0600 权限。 */
export function writeJsonAtomic(filePath, value, fsImpl = fs) {
  const dir = path.dirname(filePath)
  fsImpl.mkdirSync(dir, { recursive: true })
  const tmpPath = filePath + '.tmp-' + process.pid + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const text = JSON.stringify(value, null, 2) + '\n'
  fsImpl.writeFileSync(tmpPath, text, { encoding: 'utf8', mode: 0o600 })
  try {
    fsImpl.renameSync(tmpPath, filePath)
  } catch (error) {
    try { fsImpl.rmSync(tmpPath, { force: true }) } catch (ignore) { /* 忽略清理失败 */ }
    throw error
  }
  try { fsImpl.chmodSync(filePath, 0o600) } catch (ignore) { /* Windows 上可能不支持 */ }
  return filePath
}

/**
 * 合并三层配置，得到规范化后的原始设置记录。
 * @returns {{ values: object, sources: object, fileError: string|null }}
 */
export function mergeSettings(options = {}) {
  const file = normalizeSettingRecord(options.file)
  const env = normalizeSettingRecord(options.env)
  const pluginConfig = normalizeSettingRecord(options.pluginConfig)
  const values = {}
  const sources = {}
  for (const key of SETTING_KEYS) {
    const candidates = [
      [file[key], 'settings.json'],
      [env[key], 'env'],
      [pluginConfig[key], 'config'],
      [DEFAULTS[key], 'default']
    ]
    for (const [value, source] of candidates) {
      if (value === undefined || value === null) continue
      if (typeof value === 'string' && value === '' && source !== 'settings.json') continue
      values[key] = value
      sources[key] = source
      break
    }
  }
  return { values, sources, fileError: options.fileError || null }
}
