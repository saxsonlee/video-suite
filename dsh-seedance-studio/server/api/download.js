/**
 * dsh-seedance-studio — api / 媒体下载
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

/** 根据文件名后缀推断图片 MIME。 */
export function imageMediaTypeForPath(filePath) {
  const ext = String(path.extname(filePath || '')).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.bmp') return 'image/bmp'
  return 'image/jpeg'
}

/**
 * 下载远端媒体到本地文件（先写 .part 再 rename，避免半成品）。
 * @returns {{ path: string, bytes: number }}
 */
export async function downloadFile(url, destPath, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const timeoutMs = options.timeoutMs || 180000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // headers：需要鉴权的产物（如 MiniMax /videos/{id}/content）要带 Bearer
  const headers = options.headers && typeof options.headers === 'object' ? options.headers : null
  const response = await fetchImpl(url, { signal: controller.signal, ...(headers ? { headers } : {}) })
    if (!response.ok) throw new ApiError('下载媒体失败：HTTP ' + response.status, { status: response.status, code: 'DownloadFailed' })
    await fsp.mkdir(path.dirname(destPath), { recursive: true })
    const tmpPath = destPath + '.part'
    try {
      if (!response.body) throw new ApiError('下载媒体失败：响应没有 body', { code: 'DownloadFailed' })
      const fileStream = fs.createWriteStream(tmpPath)
      await pipeline(Readable.fromWeb(response.body), fileStream)
      await fsp.rename(tmpPath, destPath)
    } catch (error) {
      await fsp.rm(tmpPath, { force: true }).catch(() => {})
      throw error
    }
    const stat = await fsp.stat(destPath)
    return { path: destPath, bytes: stat.size }
  } catch (error) {
    if (error && error.name === 'AbortError') throw new ApiError('下载媒体超时（' + timeoutMs + ' ms）', { code: 'DownloadTimeout' })
    throw error
  } finally {
    clearTimeout(timer)
  }
}
