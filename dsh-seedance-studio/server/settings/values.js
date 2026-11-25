/**
 * dsh-seedance-studio — settings / 值解析与打码工具
 *
 * 本文件由 server/settings.js 拆分而来；对外契约由 settings/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DEFAULT_MODEL, DEFAULT_BASE_URL, DEFAULT_TASKS_PATH, DEFAULT_RELAY_CREATE_PATHS } from '../models/index.js'

/** 把密钥打码成可下发给浏览器的形式（如 ark-****abcd）。 */
export function maskSecret(value) {
  const key = String(value === undefined || value === null ? '' : value).trim()
  if (!key) return ''
  if (key.length <= 8) return '****'
  return key.slice(0, 4) + '****' + key.slice(-4)
}

/** 判断字符串是否打码值（含 ****），用于阻止把打码值回写覆盖真实 Key。 */
export function isMaskedSecret(value) {
  return typeof value === 'string' && value.indexOf('****') !== -1
}

export function parseDemoFlag(value) {
  if (value === true) return true
  if (value === false) return false
  if (typeof value === 'number') return value !== 0
  const text = String(value === undefined || value === null ? '' : value).trim().toLowerCase()
  if (text === '' || text === 'auto') return undefined
  if (['1', 'true', 'yes', 'on'].indexOf(text) !== -1) return true
  if (['0', 'false', 'no', 'off'].indexOf(text) !== -1) return false
  return undefined
}

export function parseIntSafe(value, fallback, min, max) {
  const num = typeof value === 'number' ? value : Number(String(value === undefined || value === null ? '' : value).trim())
  if (!Number.isFinite(num)) return fallback
  const rounded = Math.round(num)
  if (rounded < min || rounded > max) return fallback
  return rounded
}

export function normalizeBool(value, fallback) {
  if (value === true) return true
  if (value === false) return false
  const text = String(value === undefined || value === null ? '' : value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].indexOf(text) !== -1) return true
  if (['0', 'false', 'no', 'off'].indexOf(text) !== -1) return false
  return fallback
}

export function normalizeString(value) {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/** 解析 RELAY_MODEL_MAP：支持 JSON 对象、逗号/分号/换行分隔的 a=b 列表。 */
/** 解析 RELAY_MODELS 缓存：JSON 数组（[{id,label}] 或字符串数组），容错返回 []。 */
export function parseRelayModels(value) {
  let source = value
  if (typeof source === 'string') {
    const text = source.trim()
    if (!text) return []
    try { source = JSON.parse(text) } catch (error) { return [] }
  }
  if (!Array.isArray(source)) return []
  const out = []
  const seen = new Set()
  for (const item of source) {
    let id = ''
    let label = ''
    if (typeof item === 'string') {
      id = item.trim()
      label = id
    } else if (item && typeof item === 'object') {
      id = normalizeString(item.id)
      label = normalizeString(item.label) || id
    }
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, label: label || id })
  }
  return out
}

export function parseRelayModelMap(value) {
  if (value === undefined || value === null || value === '') return {}
  if (typeof value === 'object' && !Array.isArray(value)) {
    const out = {}
    for (const key of Object.keys(value)) {
      const from = String(key).trim()
      const to = normalizeString(value[key])
      if (from && to) out[from] = to
    }
    return out
  }
  const text = String(value).trim()
  if (text.startsWith('{')) {
    try {
      return parseRelayModelMap(JSON.parse(text))
    } catch (error) {
      // 退回 a=b 解析
    }
  }
  const out = {}
  for (const pair of text.split(/[,;\n]/)) {
    const item = pair.trim()
    if (!item) continue
    const index = item.indexOf('=')
    if (index <= 0) continue
    const from = item.slice(0, index).trim()
    const to = item.slice(index + 1).trim()
    if (from && to) out[from] = to
  }
  return out
}
