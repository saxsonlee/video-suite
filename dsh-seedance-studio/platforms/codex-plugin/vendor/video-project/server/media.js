/**
 * dsh-video-project — 项目内图片/视频读取（面板预览用）
 *
 * 只允许读取「视频项目存储目录」内的媒体文件，防止任意路径读取。
 * @module dsh-video-project/server/media
 */
import fs from 'node:fs'
import path from 'node:path'
import { readProjectLocation } from './projects.js'

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4'
}

function fail(code, message, status) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

/** 读项目目录内媒体文件，返回 buffer 与 mimeType。 */
export async function readProjectMedia(filePath, options = {}) {
  const env = options.env || process.env
  const location = readProjectLocation({ env })
  const root = path.resolve(location.projectsRoot)
  const target = path.resolve(filePath)
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw fail('MEDIA_FORBIDDEN', '只允许预览视频项目目录内的媒体文件', 403)
  let stat
  try { stat = fs.statSync(target) } catch (error) { throw fail('MEDIA_NOT_FOUND', '文件不存在：' + target, 404) }
  if (!stat.isFile()) throw fail('MEDIA_NOT_FOUND', '不是文件：' + target, 404)
  const ext = path.extname(target).toLowerCase()
  const mimeType = MIME[ext] || 'application/octet-stream'
  const isVideo = mimeType.startsWith('video/')
  const limitMb = isVideo ? 300 : 20
  if (stat.size > limitMb * 1024 * 1024) throw fail('MEDIA_TOO_LARGE', '文件过大（>' + limitMb + 'MB）', 413)
  return { buffer: fs.readFileSync(target), mimeType, size: stat.size }
}
