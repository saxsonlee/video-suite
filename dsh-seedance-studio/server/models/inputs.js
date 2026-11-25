/**
 * dsh-seedance-studio — models / 素材归一化与模式推断
 *
 * 本文件由 server/models.js 拆分而来；对外契约由 models/index.js 统一 re-export。
 */
import { IMAGE_ROLES, LIMITS } from './catalog.js'
import { fail, isPlainObject, optionalString, optionalEnum, validateMediaUrl } from './validation.js'

/** 单条图片素材：支持 {url,dataUrl,workspacePath,role} 或裸字符串。 */
export function normalizeImage(raw, index) {
  const label = 'inputs.images[' + index + ']'
  if (typeof raw === 'string') {
    return { role: undefined, url: validateMediaUrl(raw, label, 'image'), dataUrl: null, workspacePath: null }
  }
  if (!isPlainObject(raw)) fail(label + ' 必须是 url 字符串或 { url, role } 对象', 'inputs.images')
  const dataUrl = raw.dataUrl ? validateMediaUrl(String(raw.dataUrl), label + '.dataUrl', 'image') : null
  const url = !dataUrl && raw.url ? validateMediaUrl(String(raw.url), label + '.url', 'image') : null
  const workspacePath = raw.workspacePath ? optionalString(String(raw.workspacePath), label + '.workspacePath', 1024) : null
  if (!dataUrl && !url && !workspacePath) fail(label + ' 需要 url、dataUrl 或 workspacePath 之一', 'inputs.images')
  const role = optionalEnum(raw.role, label + '.role', IMAGE_ROLES)
  return { role, url, dataUrl, workspacePath }
}

export function normalizeVideo(raw) {
  if (!raw) return null
  if (typeof raw === 'string') raw = { url: raw }
  if (!isPlainObject(raw)) fail('inputs.video 必须是对象', 'inputs.video')
  const url = raw.url ? validateMediaUrl(String(raw.url), 'inputs.video.url', 'video') : null
  const taskId = raw.taskId ? optionalString(String(raw.taskId), 'inputs.video.taskId', 128) : null
  const draftTaskId = raw.draftTaskId ? optionalString(String(raw.draftTaskId), 'inputs.video.draftTaskId', LIMITS.maxDraftTaskIdChars) : null
  if (!url && !taskId && !draftTaskId) fail('inputs.video 需要 url、taskId 或 draftTaskId 之一', 'inputs.video')
  if (url && (taskId || draftTaskId)) fail('inputs.video 的 url 与 taskId 不能同时提供', 'inputs.video')
  return { url, taskId, draftTaskId }
}

export function normalizeAudio(raw) {
  if (!raw) return null
  if (typeof raw === 'string') raw = { url: raw }
  if (!isPlainObject(raw)) fail('inputs.audio 必须是对象', 'inputs.audio')
  const dataUrl = raw.dataUrl ? validateMediaUrl(String(raw.dataUrl), 'inputs.audio.dataUrl', 'audio') : null
  const url = !dataUrl && raw.url ? validateMediaUrl(String(raw.url), 'inputs.audio.url', 'audio') : null
  if (!dataUrl && !url) fail('inputs.audio 需要 url 或 dataUrl 之一', 'inputs.audio')
  return { url, dataUrl }
}

export function countRoles(images, role) {
  let count = 0
  for (const image of images) if (image.role === role) count += 1
  return count
}

/** 根据素材推断创作模式（未显式传 mode 时使用）。 */
export function inferMode(input) {
  const images = (input && input.images) || []
  const video = input && input.video
  const audio = input && input.audio
  if (video && video.draftTaskId) return 'draft-final'
  if (countRoles(images, 'last_frame') > 0) return 'firstlast'
  if (countRoles(images, 'first_frame') > 0) return 'image2video'
  if (countRoles(images, 'reference_image') > 0) return 'reference'
  if (video && video.url) return 'reference'
  if (audio) return 'reference'
  if (images.length > 0) return images.length === 1 ? 'image2video' : 'reference'
  return 'text2video'
}

export function assignDefaultRoles(images, mode) {
  images.forEach((image, index) => {
    if (image.role) return
    if (mode === 'image2video') image.role = 'first_frame'
    else if (mode === 'reference') image.role = 'reference_image'
    // 首尾帧模式没有显式 role 时按「第一张=首帧、第二张=尾帧」约定（与工具 imageUrls 顺序一致）
    else if (mode === 'firstlast') image.role = index === 0 ? 'first_frame' : 'last_frame'
  })
}
