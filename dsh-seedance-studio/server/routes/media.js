/**
 * dsh-seedance-studio — routes / 媒体响应与 Range
 *
 * 本文件由 server/routes.js 拆分而来；对外契约由 routes/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { apiErrorStatus } from '../api/index.js'
import { LIMITS, MODES } from '../models/index.js'
import { RequestError, jsonError } from './errors.js'

/** 解析单段 Range 头；返回 null 表示无 Range，抛出 416 表示非法/不可满足。 */
export function parseRange(rangeHeader, size) {
  if (!rangeHeader || typeof rangeHeader !== 'string') return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) throw new RequestError(416, 'RANGE_NOT_SATISFIABLE', '仅支持单段 bytes=start-end 的 Range 请求')
  const startRaw = match[1]
  const endRaw = match[2]
  let start
  let end
  if (startRaw === '' && endRaw === '') throw new RequestError(416, 'RANGE_NOT_SATISFIABLE', 'Range 区间无效')
  if (startRaw === '') {
    // bytes=-N：最后 N 字节
    const suffix = Number(endRaw)
    if (!Number.isFinite(suffix) || suffix <= 0) throw new RequestError(416, 'RANGE_NOT_SATISFIABLE', 'Range 区间无效')
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startRaw)
    end = endRaw === '' ? size - 1 : Number(endRaw)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    throw new RequestError(416, 'RANGE_NOT_SATISFIABLE', 'Range 超出文件范围')
  }
  if (end >= size) end = size - 1
  return { start, end, length: end - start + 1 }
}

export function contentTypeForMedia(filePath, kind) {
  const ext = path.extname(String(filePath || '')).toLowerCase()
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4'
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.webm') return 'video/webm'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return kind === 'video' ? 'video/mp4' : 'image/jpeg'
}

/**
 * 构造媒体 Response（支持 Range / HEAD / 404）。
 * @param {object} options - request、absolutePath、kind。
 */
export async function mediaResponse(request, absolutePath, kind) {
  let stat
  try {
    stat = await fs.promises.stat(absolutePath)
  } catch (error) {
    return jsonError(new RequestError(404, 'MEDIA_NOT_FOUND', '媒体文件不存在（可能已被清理）'), 404)
  }
  if (!stat.isFile()) return jsonError(new RequestError(404, 'MEDIA_NOT_FOUND', '媒体路径不是文件'), 404)
  const headers = {
    'Content-Type': contentTypeForMedia(absolutePath, kind),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600'
  }
  const rangeHeader = request.headers && typeof request.headers.get === 'function' ? request.headers.get('range') : null
  const method = String(request.method || 'GET').toUpperCase()
  let range
  try {
    range = parseRange(rangeHeader, stat.size)
  } catch (error) {
    headers['Content-Range'] = 'bytes */' + stat.size
    return new Response(null, { status: 416, headers })
  }
  if (range) {
    headers['Content-Range'] = 'bytes ' + range.start + '-' + range.end + '/' + stat.size
    headers['Content-Length'] = String(range.length)
    if (method === 'HEAD') return new Response(null, { status: 206, headers })
    const stream = fs.createReadStream(absolutePath, { start: range.start, end: range.end })
    return new Response(Readable.toWeb(stream), { status: 206, headers })
  }
  headers['Content-Length'] = String(stat.size)
  if (method === 'HEAD') return new Response(null, { status: 200, headers })
  const stream = fs.createReadStream(absolutePath)
  return new Response(Readable.toWeb(stream), { status: 200, headers })
}
