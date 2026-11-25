/**
 * dsh-seedance-studio — store / 存储管理器
 *
 * 本文件由 server/store.js 拆分而来；对外契约由 store/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { SETTINGS_FILE_NAME, defaultStorageRoot } from '../settings/index.js'
import { StoreError, isValidRecordId, normalizeRecord, cloneRecord } from './record.js'
import { safeFileSegment, sessionFileName, hashBuffer, parseDataUrl } from './files.js'

/**
 * 创建持久化存储。
 * @param {object} options - root、fsImpl、logger、maxInlineDataUrlChars。
 */
export function createStore(options = {}) {
  const fsImpl = options.fsImpl || fs
  const root = options.root || defaultStorageRoot()
  const sessionsDir = path.join(root, 'sessions')
  const mediaDir = path.join(root, 'media')
  const settingsFile = path.join(root, SETTINGS_FILE_NAME)
  const bootLogFile = path.join(root, 'boot.log')
  const maxInlineDataUrlChars = options.maxInlineDataUrlChars || 256 * 1024
  const logger = options.logger || (() => {})
  const cache = new Map()

  function init() {
    fsImpl.mkdirSync(sessionsDir, { recursive: true })
    fsImpl.mkdirSync(mediaDir, { recursive: true })
    return { root, sessionsDir, mediaDir, settingsFile }
  }

  function sessionPath(sessionId) {
    return path.join(sessionsDir, sessionFileName(sessionId))
  }

  /** 读取会话记录（带内存缓存与损坏容错）。 */
  function loadSession(sessionId) {
    const key = String(sessionId || 'default')
    if (cache.has(key)) return cache.get(key)
    const filePath = sessionPath(key)
    let records = []
    try {
      if (fsImpl.existsSync(filePath)) {
        const text = fsImpl.readFileSync(filePath, 'utf8')
        const parsed = text && text.trim() ? JSON.parse(text) : []
        const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.records) ? parsed.records : [])
        records = list.map((item) => normalizeRecord(item, key))
      }
    } catch (error) {
      logger('warn', '会话历史读取失败（已忽略损坏文件）：' + filePath + '：' + (error && error.message ? error.message : String(error)))
      records = []
    }
    records.sort((a, b) => b.createdAt - a.createdAt)
    cache.set(key, records)
    return records
  }

  function persistSession(sessionId, records) {
    const key = String(sessionId || 'default')
    const filePath = sessionPath(key)
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true })
    const tmpPath = filePath + '.tmp-' + process.pid + '-' + Date.now().toString(36)
    const sorted = records.slice().sort((a, b) => b.createdAt - a.createdAt)
    const text = JSON.stringify(sorted, null, 2) + '\n'
    fsImpl.writeFileSync(tmpPath, text, 'utf8')
    try {
      fsImpl.renameSync(tmpPath, filePath)
    } catch (error) {
      try { fsImpl.rmSync(tmpPath, { force: true }) } catch (ignore) { /* 忽略 */ }
      throw new StoreError('会话历史写入失败：' + (error && error.message ? error.message : String(error)), 'WRITE_FAILED')
    }
    cache.set(key, sorted)
  }

  /** 列表（新 → 旧，含进行中任务）。 */
  function listRecords(sessionId) {
    return loadSession(sessionId).map(cloneRecord)
  }

  /** 全部会话记录（跨会话，新 → 旧；主面板/无会话场景用）。 */
  function listAllRecords(listOptions = {}) {
    const limit = Number(listOptions.limit)
    let files = []
    try { files = fsImpl.readdirSync(sessionsDir).filter((name) => String(name).endsWith('.json')) } catch (error) { files = [] }
    const all = []
    for (const name of files) {
      try {
        const text = fsImpl.readFileSync(path.join(sessionsDir, name), 'utf8')
        const parsed = text && text.trim() ? JSON.parse(text) : []
        const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.records) ? parsed.records : [])
        for (const item of list) {
          const sessionIdGuess = item && item.sessionId ? item.sessionId : String(name).replace(/\.json$/, '')
          all.push(cloneRecord(normalizeRecord(item, sessionIdGuess)))
        }
      } catch (error) { /* 跳过损坏文件 */ }
    }
    all.sort((a, b) => b.createdAt - a.createdAt)
    return Number.isFinite(limit) && limit > 0 ? all.slice(0, limit) : all
  }

  /** 查询单条记录。 */
  function getRecord(sessionId, id) {
    const found = loadSession(sessionId).find((record) => record.id === id)
    return found ? cloneRecord(found) : null
  }

  /** 新增或更新一条记录（原子写盘）。 */
  function upsertRecord(sessionId, record) {
    const key = String(sessionId || (record && record.sessionId) || 'default')
    const records = loadSession(key)
    const normalized = normalizeRecord({ ...record, sessionId: key }, key)
    const index = records.findIndex((item) => item.id === normalized.id)
    if (index === -1) records.unshift(normalized)
    else records[index] = normalized
    persistSession(key, records)
    return cloneRecord(normalized)
  }

  /** 更新记录的部分字段（不存在时返回 null）。 */
  function patchRecord(sessionId, id, patch) {
    const records = loadSession(sessionId)
    const index = records.findIndex((item) => item.id === id)
    if (index === -1) return null
    const next = normalizeRecord({ ...records[index], ...patch, id, sessionId, updatedAt: patch && patch.updatedAt !== undefined ? patch.updatedAt : Date.now() }, sessionId)
    records[index] = next
    persistSession(sessionId, records)
    return cloneRecord(next)
  }

  /** 媒体文件绝对路径（拒绝非法文件名，防路径穿越）。 */
  function mediaPath(fileName) {
    if (typeof fileName !== 'string' || !fileName) throw new StoreError('媒体文件名无效', 'INVALID_MEDIA_NAME')
    if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
      throw new StoreError('媒体文件名无效（禁止路径分隔符）：' + fileName, 'INVALID_MEDIA_NAME')
    }
    const resolved = path.resolve(mediaDir, fileName)
    const prefix = path.resolve(mediaDir) + path.sep
    if (!resolved.toLowerCase().startsWith(prefix.toLowerCase())) throw new StoreError('媒体文件越界：' + fileName, 'INVALID_MEDIA_NAME')
    return resolved
  }

  function mediaExists(fileName) {
    try {
      return fsImpl.existsSync(mediaPath(fileName))
    } catch (error) {
      return false
    }
  }

  /** 原子写入媒体字节。 */
  function writeMedia(fileName, buffer) {
    const filePath = mediaPath(fileName)
    fsImpl.mkdirSync(mediaDir, { recursive: true })
    const tmpPath = filePath + '.part'
    fsImpl.writeFileSync(tmpPath, buffer)
    fsImpl.renameSync(tmpPath, filePath)
    return filePath
  }

  /** 复制媒体文件到 media/（demo 模式复用包内示例视频）。 */
  async function copyMedia(fileName, sourcePath) {
    const filePath = mediaPath(fileName)
    fsImpl.mkdirSync(mediaDir, { recursive: true })
    const tmpPath = filePath + '.part'
    await fsImpl.promises.copyFile(sourcePath, tmpPath)
    await fsImpl.promises.rename(tmpPath, filePath)
    const stat = await fsImpl.promises.stat(filePath)
    return { path: filePath, bytes: stat.size }
  }

  function deleteMedia(fileName) {
    try {
      fsImpl.rmSync(mediaPath(fileName), { force: true })
    } catch (error) {
      logger('warn', '媒体文件删除失败：' + fileName + '：' + (error && error.message ? error.message : String(error)))
    }
  }

  /** 记录中引用到的媒体文件名列表。 */
  function recordMediaFiles(record) {
    const files = []
    const add = (name) => {
      if (typeof name === 'string' && name && files.indexOf(name) === -1) files.push(name)
    }
    if (record && record.files) {
      add(record.files.video)
      add(record.files.lastFrame)
      add(record.files.poster)
    }
    const images = record && record.inputs && Array.isArray(record.inputs.images) ? record.inputs.images : []
    for (const image of images) add(image && image.file)
    if (record && record.inputs && record.inputs.audio && typeof record.inputs.audio === 'object') add(record.inputs.audio.file)
    return files
  }

  /** 删除记录及其本地媒体。 */
  function deleteRecord(sessionId, id) {
    const records = loadSession(sessionId)
    const index = records.findIndex((item) => item.id === id)
    if (index === -1) return { deleted: false, removedFiles: [] }
    const removed = records[index]
    records.splice(index, 1)
    const removedFiles = recordMediaFiles(removed)
    persistSession(sessionId, records)
    for (const fileName of removedFiles) deleteMedia(fileName)
    return { deleted: true, removedFiles }
  }

  /** 媒体相对文件名生成。 */
  function mediaName(recordId, kind, index = 0, ext = 'mp4') {
    if (!isValidRecordId(recordId)) throw new StoreError('记录 ID 无效：' + recordId, 'INVALID_RECORD_ID')
    if (kind === 'video') return recordId + '.' + (ext === 'mov' ? 'mov' : 'mp4')
    if (kind === 'lastFrame') return recordId + '-lastframe.jpg'
    if (kind === 'poster') return recordId + '-poster.jpg'
    if (kind === 'input') {
      const suffix = index === 'audio' ? '-in-audio' : '-in' + Number(index)
      return recordId + suffix + '.' + safeFileSegment(ext, 'bin')
    }
    throw new StoreError('未知媒体类型：' + kind, 'INVALID_MEDIA_KIND')
  }

  /**
   * 把请求中的 data URL 输入图片落盘（避免历史索引过大），并记哈希。
   * @param {string} recordId - 记录 ID。
   * @param {object} inputs - 规范化请求的 inputs（原地修改并返回）。
   */
  async function persistInputMedia(recordId, inputs) {
    const result = inputs && typeof inputs === 'object' ? inputs : { images: [] }
    const images = Array.isArray(result.images) ? result.images : []
    for (let i = 0; i < images.length; i += 1) {
      const image = images[i]
      if (!image || typeof image !== 'object') continue
      const dataUrl = image.dataUrl || (typeof image.url === 'string' && image.url.startsWith('data:') ? image.url : null)
      if (!dataUrl) continue
      const parsed = parseDataUrl(dataUrl)
      if (!parsed) continue
      const fileName = mediaName(recordId, 'input', i, parsed.ext)
      writeMedia(fileName, parsed.buffer)
      image.file = fileName
      image.sha256 = hashBuffer(parsed.buffer)
      image.mime = parsed.mime
      if (dataUrl.length <= maxInlineDataUrlChars) image.dataUrl = dataUrl
      else delete image.dataUrl
      if (typeof image.url === 'string' && image.url.startsWith('data:')) delete image.url
    }
    result.images = images
    // 音频 dataURL 同样落盘
    if (result.audio && typeof result.audio === 'object') {
      const audioDataUrl = result.audio.dataUrl || (typeof result.audio.url === 'string' && result.audio.url.startsWith('data:') ? result.audio.url : null)
      if (audioDataUrl) {
        const parsed = parseDataUrl(audioDataUrl)
        if (parsed) {
          const fileName = mediaName(recordId, 'input', 'audio', parsed.ext)
          writeMedia(fileName, parsed.buffer)
          result.audio.file = fileName
          result.audio.sha256 = hashBuffer(parsed.buffer)
          result.audio.mime = parsed.mime
          if (audioDataUrl.length <= maxInlineDataUrlChars) result.audio.dataUrl = audioDataUrl
          else delete result.audio.dataUrl
          if (typeof result.audio.url === 'string' && result.audio.url.startsWith('data:')) delete result.audio.url
        }
      }
    }
    return result
  }

  /** 读取记录内落盘的输入图片为 data URL（再创作兜底用）。 */
  async function readInputImageDataUrl(record, index) {
    const images = record && record.inputs && Array.isArray(record.inputs.images) ? record.inputs.images : []
    const image = images[index]
    if (!image || typeof image !== 'object') return null
    if (typeof image.dataUrl === 'string' && image.dataUrl.startsWith('data:')) return image.dataUrl
    if (typeof image.url === 'string' && image.url.startsWith('data:')) return image.url
    if (!image.file) return null
    try {
      const buffer = await fsImpl.promises.readFile(mediaPath(image.file))
      const mime = image.mime || (image.file.endsWith('.png') ? 'image/png' : image.file.endsWith('.webp') ? 'image/webp' : 'image/jpeg')
      return 'data:' + mime + ';base64,' + buffer.toString('base64')
    } catch (error) {
      logger('warn', '读取输入图片失败：' + (error && error.message ? error.message : String(error)))
      return null
    }
  }

  /** 记录某个媒体类型的绝对路径（不存在返回 null）。 */
  function recordFilePath(record, kind) {
    if (!record || !record.files) return null
    const nameByKind = { video: record.files.video, lastFrame: record.files.lastFrame, poster: record.files.poster }
    const fileName = nameByKind[kind]
    if (!fileName) return null
    try {
      const filePath = mediaPath(fileName)
      return fsImpl.existsSync(filePath) ? filePath : null
    } catch (error) {
      return null
    }
  }

  /** 扫描所有会话文件（用于进程重启后恢复未完成任务）。 */
  function listSessions() {
    const sessions = []
    let entries = []
    try {
      entries = fsImpl.readdirSync(sessionsDir)
    } catch (error) {
      return sessions
    }
    for (const entry of entries) {
      if (!entry.endsWith('.json') || entry.includes('.tmp-')) continue
      const filePath = path.join(sessionsDir, entry)
      try {
        const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
        const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.records) ? parsed.records : [])
        if (!list.length) continue
        const first = normalizeRecord(list[0], '')
        sessions.push({ sessionId: first.sessionId, count: list.length, filePath })
      } catch (error) {
        logger('warn', '会话文件解析失败（跳过）：' + filePath)
      }
    }
    return sessions
  }

  /** 追加 boot.log（安装验证探针；失败不影响宿主）。 */
  function appendBootLog(text) {
    try {
      fsImpl.mkdirSync(root, { recursive: true })
      fsImpl.appendFileSync(bootLogFile, new Date().toISOString() + ' ' + String(text) + '\n', 'utf8')
    } catch (error) {
      // 忽略：日志写入失败不应影响插件
    }
  }

  return {
    root,
    sessionsDir,
    mediaDir,
    settingsFile,
    bootLogFile,
    init,
    sessionPath,
    listRecords,
    listAllRecords,
    getRecord,
    upsertRecord,
    patchRecord,
    deleteRecord,
    mediaPath,
    mediaExists,
    writeMedia,
    copyMedia,
    deleteMedia,
    recordMediaFiles,
    recordFilePath,
    mediaName,
    persistInputMedia,
    readInputImageDataUrl,
    listSessions,
    appendBootLog,
    loadSession
  }
}
