/**
 * dsh-seedance-studio — store / 文件/会话名工具
 *
 * 本文件由 server/store.js 拆分而来；对外契约由 store/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { SETTINGS_FILE_NAME, defaultStorageRoot } from '../settings/index.js'

/** 安全文件名片段：替换 Windows/Unix 非法字符，防路径穿越。 */
export function safeFileSegment(value, fallback = 'unknown') {
  const text = String(value === undefined || value === null ? '' : value).trim()
  if (!text) return fallback
  const dotted = text.replace(/\.\./g, '_')
  const cleaned = dotted.replace(/[<>:"\\/|?*\u0000-\u001f]/g, '_').replace(/^\.+/, '_').slice(0, 120)
  if (!cleaned || cleaned === '_') return fallback
  return cleaned
}

/** 会话 ID → 文件名（可读；非法/超长时加哈希后缀保证可逆性由记录内 sessionId 保证）。 */
export function sessionFileName(sessionId) {
  const text = String(sessionId || '')
  if (/^[A-Za-z0-9._:-]{1,80}$/.test(text) && !text.includes('..')) return text + '.json'
  const digest = crypto.createHash('sha1').update(text).digest('hex').slice(0, 10)
  return safeFileSegment(text, 'session').slice(0, 80) + '-' + digest + '.json'
}

/** 把 SHA-256 摘要转成短哈希。 */
export function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/** 解析 data URL：返回 { mime, ext, buffer }。 */
export function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]*)$/i.exec(dataUrl.trim())
  if (!match) return null
  const mime = match[1].toLowerCase()
  let buffer
  try {
    buffer = Buffer.from(match[2], 'base64')
  } catch (error) {
    return null
  }
  if (!buffer.length) return null
  const extByMime = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg'
  }
  return { mime, ext: extByMime[mime] || 'bin', buffer }
}
