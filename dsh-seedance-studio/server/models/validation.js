/**
 * dsh-seedance-studio — models / 校验错误与基础校验工具
 *
 * 本文件由 server/models.js 拆分而来；对外契约由 models/index.js 统一 re-export。
 */
import { LIMITS } from './catalog.js'

/** 参数校验失败（HTTP 层映射为 400）。 */
export class ValidationError extends Error {
  constructor(message, field) {
    super(message)
    this.name = 'ValidationError'
    this.field = field || null
  }
}

export function fail(message, field) {
  throw new ValidationError(message, field)
}

export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function pick(obj, snake, camel) {
  if (!isPlainObject(obj)) return undefined
  if (obj[snake] !== undefined) return obj[snake]
  if (camel && obj[camel] !== undefined) return obj[camel]
  return undefined
}

export function optionalString(value, field, maxLen) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') fail(field + ' 必须是字符串', field)
  const trimmed = value.trim()
  if (trimmed.length > maxLen) fail(field + ' 超长（最多 ' + maxLen + ' 字符）', field)
  return trimmed
}

export function optionalBoolean(value, field) {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'boolean') return value
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  fail(field + ' 必须是布尔值', field)
}

export function optionalInteger(value, field, min, max) {
  if (value === undefined || value === null || value === '') return undefined
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(num)) fail(field + ' 必须是整数', field)
  if (num < min || num > max) fail(field + ' 取值范围为 ' + min + ' ~ ' + max, field)
  return num
}

export function optionalEnum(value, field, allowed) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') fail(field + ' 必须是字符串', field)
  const trimmed = value.trim()
  if (allowed.indexOf(trimmed) === -1) fail(field + ' 取值必须是 ' + allowed.join(' / '), field)
  return trimmed
}

/** 校验并规范化素材 URL：图片/音频允许 data URI，视频不允许 base64。 */
export function validateMediaUrl(url, field, kind) {
  if (typeof url !== 'string' || !url.trim()) fail(field + ' 缺少 url', field)
  const value = url.trim()
  const maxLen = kind === 'image' ? LIMITS.maxImageDataUriChars : LIMITS.maxDataUriChars
  if (value.length > maxLen) fail(field + ' 数据过大（上限约 ' + Math.round(maxLen / 1024 / 1024) + ' MB）', field)
  if (/^data:/i.test(value)) {
    if (kind === 'video') fail('视频不支持 base64 内联，请使用 https 链接或素材 ID', field)
    if (kind === 'image' && !/^data:image\/(png|jpe?g|webp|gif|bmp|tiff|heic|heif);base64,/i.test(value)) {
      fail(field + ' 仅支持 data:image/(png|jpeg|webp|gif|bmp|tiff|heic|heif);base64 数据', field)
    }
    if (kind === 'audio' && !/^data:audio\/[a-z0-9.+-]+;base64,/i.test(value)) {
      fail(field + ' 仅支持 data:audio/<格式>;base64 数据', field)
    }
    return value
  }
  if (/^asset:\/\//i.test(value)) {
    if (value.length > LIMITS.maxUrlChars) fail(field + ' 素材 ID 过长', field)
    return value
  }
  if (/^workspace:/i.test(value)) fail(field + ' 需要宿主先读取为 data URI（workspacePath 请使用 inputs 字段）', field)
  if (!/^https?:\/\//i.test(value)) {
    fail(field + ' 需要 http(s) 链接、data URI 或素材 ID，收到：' + value.slice(0, 80), field)
  }
  if (value.length > LIMITS.maxUrlChars) fail(field + ' 链接过长', field)
  return value
}
