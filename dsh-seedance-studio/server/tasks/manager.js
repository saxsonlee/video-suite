/**
 * dsh-seedance-studio — tasks / 任务管理器
 *
 * 本文件由 server/tasks.js 拆分而来；对外契约由 tasks/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createVideoClient, isTerminalStatus, ApiError, ApiTimeoutError, downloadFile, describeApiError } from '../api/index.js'
import { normalizeGenerateRequest, buildArkPayload, getModel, MODES, ValidationError } from '../models/index.js'
import { createRecordId, isValidRecordId } from '../store/index.js'
import { DEMO_TIMELINE, DEMO_DURATION_SECONDS, DEMO_FAIL_KEYWORDS, demoTaskId, demoStateAt } from './demo.js'
import { TaskError, errorMessage } from './errors.js'
import { buildRecreatePlan } from './recreate.js'
import { sleep, jitter } from './helpers.js'

/** 智能体 wait 期间两次主动查询的间隔（10~15 秒随机）：视频生成通常 30 秒~几分钟，无需每秒查。 */
const WAIT_POLL_MIN_MS = 10 * 1000
const WAIT_POLL_MAX_MS = 15 * 1000

/**
 * 创建任务管理器。
 *
 * @param {object} options
 * @param {object} options.store - store.js 的存储实例。
 * @param {Function} options.getConfig - 返回运行期配置（settings.resolveConfig）。
 * @param {object} [options.demoMedia] - demo 视频/尾帧路径。
 * @param {Function} [options.logger] - (level, message) => void。
 * @param {Function} [options.now] - 时钟注入（测试用）。
 * @param {Function} [options.createClient] - 远端客户端工厂注入（测试用）。
 * @param {Function} [options.downloadImpl] - 媒体下载实现注入（测试用）。
 * @param {boolean} [options.autoPoll] - 是否自动调度轮询（默认 true）。
 * @param {Function} [options.random] - 随机数注入（测试用）。
 */
export function createTaskManager(options = {}) {
  const store = options.store
  if (!store) throw new TaskError('createTaskManager 需要 store', 'MissingStore')
  const getConfig = options.getConfig || (() => ({}))
  const demoMedia = options.demoMedia || { videoPath: '', lastFramePath: '' }
  const logger = options.logger || (() => {})
  const now = options.now || (() => Date.now())
  const random = options.random || Math.random
  const createClientImpl = options.createClient || createVideoClient
  const downloadImpl = options.downloadImpl || downloadFile
  const autoPoll = options.autoPoll !== false

  const timers = new Map()
  const inFlight = new Set()
  const clients = new Map()
  let stopped = false

  function clientCacheKey(config) {
    return JSON.stringify([config.provider, config.arkApiKey, config.ark, config.relay])
  }

  /** 获取（缓存）远端客户端；配置错误抛 TaskError。 */
  function getClient(config) {
    if (!config || config.demo) throw new TaskError('演示模式（demo）没有远端客户端', 'DemoMode')
    if (config.configError) throw new TaskError(config.configError, 'ConfigError')
    const key = clientCacheKey(config)
    if (clients.has(key)) return clients.get(key)
    let client
    try {
      client = createClientImpl(config)
    } catch (error) {
      throw new TaskError(error && error.message ? error.message : '创建 API 客户端失败', error && error.code ? error.code : 'ClientError')
    }
    clients.clear()
    clients.set(key, client)
    return client
  }

  function shouldFailDemo(record) {
    const prompt = String(record.prompt || '')
    return DEMO_FAIL_KEYWORDS.some((keyword) => prompt.indexOf(keyword) !== -1)
  }

  function timerKey(sessionId, recordId) {
    return sessionId + '/' + recordId
  }

  function clearTimer(sessionId, recordId) {
    const key = timerKey(sessionId, recordId)
    const timer = timers.get(key)
    if (timer) {
      clearTimeout(timer)
      timers.delete(key)
    }
  }

  function schedule(sessionId, recordId, delayMs) {
    if (stopped || !autoPoll) return
    clearTimer(sessionId, recordId)
    const timer = setTimeout(() => {
      timers.delete(timerKey(sessionId, recordId))
      runPoll(sessionId, recordId).catch((error) => {
        logger('error', '轮询异常：' + errorMessage(error))
      })
    }, Math.max(0, delayMs))
    if (typeof timer.unref === 'function') timer.unref()
    timers.set(timerKey(sessionId, recordId), timer)
  }

  function nextPollDelay(config) {
    const base = Math.max(1000, Number(config.pollIntervalMs) || 3000)
    return base + jitter(Math.min(1000, Math.floor(base / 3)), random)
  }

  /**
   * 远端不返回进度时的平滑估算：按「已耗时 / 预计总时长」推 5%~95%。
   * 预计总时长随视频时长与分辨率粗估（仅用于进度条，不影响任务本身）。
   */
  function estimateRunningProgress(record) {
    const params = record.params || {}
    const duration = Math.max(4, Number(params.duration) || 5)
    const resolution = String(params.resolution || '720p')
    const heavy = /1080|4k/i.test(resolution) || record.mode === 'reference' || record.mode === 'edit' || record.mode === 'extend'
    const totalMs = Math.max(45000, duration * 9000 + (heavy ? 45000 : 20000))
    const elapsed = Math.max(0, now() - (Number(record.createdAt) || now()))
    const estimated = Math.round(5 + (elapsed / totalMs) * 90)
    return Math.min(95, Math.max(Number(record.progress) || 5, estimated))
  }

  /** 下载单个远端媒体（最多重试 3 次，指数退避）。 */
  async function downloadWithRetry(url, dest, options = {}) {
    const attempts = Number(options.attempts) > 0 ? Number(options.attempts) : 3
    let lastError = null
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await downloadImpl(url, dest, { timeoutMs: options.timeoutMs, headers: options.headers })
        return
      } catch (error) {
        lastError = error
        if (attempt < attempts - 1) await sleep(1000 * (attempt + 1))
      }
    }
    throw lastError
  }

  /** 下载终态媒体并返回 files/错误。 */
  async function downloadTerminalMedia(record, config, task) {
    const files = { ...(record.files || {}) }
    const meta = { ...(record.meta || {}) }
    try {
      if (task.videoUrl) {
        const format = record.params && record.params.outputFormat === 'mov' ? 'mov' : 'mp4'
        const fileName = store.mediaName(record.id, 'video', 0, format)
        const dest = store.mediaPath(fileName)
        await downloadWithRetry(task.videoUrl, dest, { timeoutMs: config.downloadTimeoutMs || 600000, attempts: 3, headers: task.downloadHeaders })
        files.video = fileName
      }
    } catch (error) {
      meta.downloadError = '视频下载失败（已自动重试 3 次，可稍后再 wait/status 自动补下载，或从远端链接下载）：' + errorMessage(error)
      logger('warn', '视频下载失败（保留远端 URL）：' + errorMessage(error))
    }
    try {
      if (task.lastFrameUrl) {
        const fileName = store.mediaName(record.id, 'lastFrame')
        const dest = store.mediaPath(fileName)
        await downloadWithRetry(task.lastFrameUrl, dest, { timeoutMs: config.downloadTimeoutMs || 600000, attempts: 2, headers: task.downloadHeaders })
        files.lastFrame = fileName
      }
    } catch (error) {
      meta.lastFrameDownloadError = '尾帧下载失败：' + errorMessage(error)
      logger('warn', '尾帧下载失败：' + errorMessage(error))
    }
    return { files, meta }
  }

  /** 成功但本地视频缺失时补下载（带 60 秒节流，避免频繁重试）。 */
  async function ensureTerminalDownload(sessionId, record) {
    try {
      if (!record || record.status !== 'succeeded') return record
      const files = record.files && typeof record.files === 'object' ? record.files : null
      if (files && files.video) return record
      if (!record.remoteVideoUrl) return record
      const meta = record.meta && typeof record.meta === 'object' ? record.meta : {}
      const lastAt = Number(meta.downloadRetryAt) || 0
      if (now() - lastAt < 60 * 1000) return record
      const config = getConfig()
      const finalized = await downloadTerminalMedia(record, config, { videoUrl: record.remoteVideoUrl, lastFrameUrl: record.remoteLastFrameUrl })
      const nextMeta = { ...meta, ...finalized.meta, downloadRetryAt: now() }
      if (finalized.files && finalized.files.video) delete nextMeta.downloadError
      const updated = store.patchRecord(sessionId, record.id, {
        updatedAt: now(),
        files: finalized.files,
        meta: nextMeta
      })
      if (updated && finalized.files && finalized.files.video) logger('info', '补下载成功：' + record.id)
      return updated || record
    } catch (error) {
      logger('warn', '补下载失败：' + errorMessage(error))
      return record
    }
  }

  /** demo 成功落盘：复制包内示例视频与尾帧。 */
  async function finalizeDemoMedia(record) {
    const files = { ...(record.files || {}) }
    const meta = { ...(record.meta || {}) }
    try {
      const videoName = store.mediaName(record.id, 'video')
      const copied = await store.copyMedia(videoName, demoMedia.videoPath)
      files.video = videoName
      meta.bytes = copied.bytes
    } catch (error) {
      meta.downloadError = '复制演示视频失败：' + errorMessage(error)
      logger('warn', '复制演示视频失败：' + errorMessage(error))
    }
    try {
      if (demoMedia.lastFramePath && fs.existsSync(demoMedia.lastFramePath)) {
        const lastFrameName = store.mediaName(record.id, 'lastFrame')
        await store.copyMedia(lastFrameName, demoMedia.lastFramePath)
        files.lastFrame = lastFrameName
      }
    } catch (error) {
      meta.lastFrameDownloadError = '复制演示尾帧失败：' + errorMessage(error)
    }
    meta.duration = DEMO_DURATION_SECONDS
    meta.demo = true
    meta.usage = { completion_tokens: 0, total_tokens: 0, demo: true }
    return { files, meta }
  }

  /**
   * 单步轮询：拉取远端（或推进 demo）状态，更新并落盘记录。
   * @returns {object} 更新后的记录。
   */
  async function pollStep(record) {
    const config = getConfig()
    const patch = { updatedAt: now() }
    const meta = { ...(record.meta || {}) }

    if (record.provider === 'demo') {
      const state = demoStateAt(record.createdAt, now(), shouldFailDemo(record))
      patch.status = state.status
      patch.progress = state.progress
      if (state.status === 'succeeded') {
        const finalized = await finalizeDemoMedia({ ...record, meta })
        patch.files = finalized.files
        patch.meta = finalized.meta
        delete patch.meta.pollErrors
      } else if (state.status === 'failed') {
        patch.error = { code: 'DemoFailure', message: '演示模式：提示词包含失败关键词，已模拟任务失败（用于验证失败态）' }
        patch.meta = meta
      } else {
        patch.meta = meta
      }
      return store.patchRecord(record.sessionId, record.id, patch)
    }

    // ---- 真实远端任务 ----
    if (!record.remoteTaskId) {
      patch.status = 'failed'
      patch.progress = 100
      patch.error = { code: 'MissingRemoteTask', message: '任务记录缺少远端任务 ID，无法继续轮询（可能是内部错误）' }
      return store.patchRecord(record.sessionId, record.id, patch)
    }
    let client
    try {
      client = getClient(config)
    } catch (error) {
      const pollErrors = (meta.pollErrors || 0) + 1
      meta.pollErrors = pollErrors
      meta.pollError = errorMessage(error)
      patch.meta = meta
      if (pollErrors > 20 || now() - record.createdAt > 10 * 60 * 1000) {
        patch.status = 'failed'
        patch.progress = 100
        patch.error = { code: error && error.code ? error.code : 'ConfigError', message: '无法继续轮询任务：' + errorMessage(error) }
      }
      const updated = store.patchRecord(record.sessionId, record.id, patch)
      return updated
    }

    let task
    try {
      task = await client.getTask(record.remoteTaskId)
    } catch (error) {
      const pollErrors = (meta.pollErrors || 0) + 1
      meta.pollErrors = pollErrors
      meta.pollError = errorMessage(error)
      patch.meta = meta
      if (error && (error.code === 'InvalidTaskId' || (error.status === 404 && pollErrors >= 3))) {
        patch.status = 'failed'
        patch.progress = 100
        patch.error = { code: 'TaskNotFound', message: '远端任务不存在或已过期：' + errorMessage(error) }
      } else if (pollErrors > 20 || now() - record.createdAt > 48 * 60 * 60 * 1000) {
        patch.status = 'failed'
        patch.progress = 100
        patch.error = { code: error && error.code ? error.code : 'PollFailed', message: '轮询任务失败：' + errorMessage(error) }
      }
      return store.patchRecord(record.sessionId, record.id, patch)
    }

    meta.pollErrors = 0
    delete meta.pollError
    if (task.model && !record.model) patch.model = task.model
    if (task.videoUrl) patch.remoteVideoUrl = task.videoUrl
    if (task.lastFrameUrl) patch.remoteLastFrameUrl = task.lastFrameUrl
    if (task.usage) meta.usage = task.usage
    if (task.meta && typeof task.meta === 'object') {
      for (const field of ['resolution', 'ratio', 'duration', 'seed', 'draftTaskId']) {
        if (task.meta[field] !== undefined) meta[field] = task.meta[field]
      }
    }
    if (task.status === 'queued') {
      patch.status = 'queued'
      patch.progress = typeof task.progress === 'number' ? task.progress : Math.max(record.progress || 0, 5)
    } else if (task.status === 'running') {
      patch.status = 'running'
      patch.progress = typeof task.progress === 'number' ? task.progress : estimateRunningProgress(record)
    } else if (task.status === 'succeeded') {
      if (record.mode === 'draft' && record.remoteTaskId) meta.draftTaskId = record.remoteTaskId
      const finalized = await downloadTerminalMedia(record, config, task)
      patch.files = finalized.files
      patch.meta = { ...meta, ...finalized.meta }
      patch.status = 'succeeded'
      patch.progress = 100
      delete patch.meta.pollErrors
    } else if (task.status === 'failed' || task.status === 'expired' || task.status === 'cancelled') {
      patch.status = task.status === 'cancelled' ? 'cancelled' : (task.status === 'expired' ? 'expired' : 'failed')
      patch.progress = 100
      patch.meta = meta
      patch.error = task.error || { code: task.status === 'expired' ? 'Expired' : 'Failed', message: task.status === 'expired' ? '任务已过期' : '任务失败' }
    } else {
      patch.meta = meta
    }
    // 运行/排队超时保护：上游偶尔会卡住任务，避免记录无限「生成中」
    const runningTimeoutMs = Number(config.runningTimeoutMs) || 20 * 60 * 1000
    if ((patch.status === 'running' || patch.status === 'queued') && now() - (Number(record.createdAt) || now()) > runningTimeoutMs) {
      patch.status = 'failed'
      patch.progress = 100
      patch.error = {
        code: 'Timeout',
        message: '生成超时：超过 ' + Math.round(runningTimeoutMs / 60000) + ' 分钟仍未完成（可能上游任务卡住），请重新生成'
      }
    }
    if (!patch.meta) patch.meta = meta
    const updated = store.patchRecord(record.sessionId, record.id, patch)
    return updated
  }

  /** 执行一次轮询（含调度下一步）；供内部定时器与测试使用。 */
  async function runPoll(sessionId, recordId) {
    const key = sessionId + '/' + recordId
    if (inFlight.has(key)) return store.getRecord(sessionId, recordId)
    inFlight.add(key)
    try {
      const record = store.getRecord(sessionId, recordId)
      if (!record) {
        clearTimer(sessionId, recordId)
        return null
      }
      if (isTerminalStatus(record.status)) {
        clearTimer(sessionId, recordId)
        return record
      }
      let updated
      try {
        updated = await pollStep(record)
      } catch (error) {
        logger('error', '轮询失败：' + errorMessage(error))
        updated = store.patchRecord(sessionId, recordId, {
          updatedAt: now(),
          meta: { ...(record.meta || {}), pollError: errorMessage(error), pollErrors: ((record.meta || {}).pollErrors || 0) + 1 }
        })
      }
      if (!updated) return null
      if (isTerminalStatus(updated.status)) {
        clearTimer(sessionId, recordId)
        logger('info', '任务进入终态：' + updated.id + ' ' + updated.status)
      } else {
        schedule(sessionId, recordId, nextPollDelay(getConfig()))
      }
      return updated
    } finally {
      inFlight.delete(key)
    }
  }

  /** 手动推进一次轮询（测试/工具 action=wait 使用，不等待定时器）。 */
  async function pollNow(sessionId, recordId) {
    return runPollSession(sessionId, recordId)
  }

  async function runPollSession(sessionId, recordId) {
    const record = store.getRecord(sessionId, recordId)
    if (!record || isTerminalStatus(record.status)) return record
    const updated = await pollStep(record)
    if (updated && !isTerminalStatus(updated.status) && autoPoll) schedule(sessionId, recordId, nextPollDelay(getConfig()))
    return updated
  }

  /** 创建任务记录并启动轮询。 */
  async function createRecord(sessionId, input, createOptions = {}) {
    const config = getConfig()
    const normalized = normalizeGenerateRequest(input, { defaultModel: config.defaultModel, relayModels: config.relayModels, useRelay: Boolean(config.useRelay) })
    const recordId = createRecordId(now(), random)
    const createdAt = now()
    const inputs = await store.persistInputMedia(recordId, normalized.inputs)
    const record = {
      id: recordId,
      sessionId: String(sessionId || 'default'),
      createdAt,
      updatedAt: createdAt,
      status: 'queued',
      progress: 0,
      prompt: normalized.prompt,
      model: normalized.model,
      provider: config.demo ? 'demo' : config.provider,
      mode: normalized.mode,
      params: normalized.params,
      inputs,
      meta: { request: summarizeRequestSafe(normalized) }
    }
    if (createOptions.toolCallId) record.toolCallId = String(createOptions.toolCallId)
    if (createOptions.originId) record.originId = String(createOptions.originId)
    if (normalized.draftTaskId) record.meta.draftTaskId = normalized.draftTaskId

    if (config.demo) {
      record.provider = 'demo'
      record.remoteTaskId = demoTaskId(recordId)
      record.meta.demo = true
      record.meta.demoTimeline = { ...DEMO_TIMELINE }
    } else {
      const client = getClient(config)
      const payload = buildArkPayload(normalized)
      let created
      try {
        created = await client.createTask(payload)
      } catch (error) {
        throw new TaskError('创建视频任务失败：' + errorMessage(error), error && error.code ? error.code : 'CreateFailed', error && error.status ? error.status : 0)
      }
      record.remoteTaskId = created.id
      if (normalized.mode === 'draft') record.meta.draftTaskId = created.id
    }
    const saved = store.upsertRecord(record.sessionId, record)
    logger('info', '已创建任务 ' + saved.id + '（' + saved.model + '/' + saved.mode + '/' + saved.provider + '）')
    if (autoPoll) schedule(saved.sessionId, saved.id, 0)
    return saved
  }

  function summarizeRequestSafe(normalized) {
    try {
      return {
        model: normalized.model,
        mode: normalized.mode,
        promptChars: (normalized.prompt || '').length,
        images: (normalized.media.images || []).length,
        videos: (normalized.media.videos || []).length,
        audios: (normalized.media.audios || []).length,
        params: normalized.params
      }
    } catch (error) {
      return {}
    }
  }

  /** 等待记录进入终态或超时（工具 action=wait 使用）。 */
  async function waitForRecord(sessionId, recordId, waitOptions = {}) {
    const timeoutMs = Math.max(0, Number(waitOptions.timeoutMs) || 30000)
    const signal = waitOptions.signal
    const startedAt = now()
    while (true) {
      if (signal && signal.aborted) {
        const aborted = store.getRecord(sessionId, recordId)
        return aborted || null
      }
      let record = store.getRecord(sessionId, recordId)
      if (!record) throw new TaskError('任务不存在：' + recordId, 'NotFound', 404)
      if (!record.remoteTaskId) return record
      if (isTerminalStatus(record.status) && record.provider !== 'demo') {
        if (record.status === 'succeeded' && !(record.files && record.files.video)) {
          record = (await ensureTerminalDownload(sessionId, record)) || record
        }
        return record
      }
      const elapsed = now() - startedAt
      if (elapsed >= timeoutMs) {
        const current = store.getRecord(sessionId, recordId)
        return { ...(current || record), meta: { ...(current || record).meta, waitTimedOut: true } }
      }
      // 主动推进一步，避免只依赖后台定时器（也让测试可预期）
      if (record.status !== 'succeeded') {
        try {
          const updated = await runPollSession(sessionId, recordId)
          if (updated) record = updated
        } catch (error) {
          logger('warn', '等待期间轮询失败：' + errorMessage(error))
        }
      }
      if (record && isTerminalStatus(record.status)) {
        if (record.status === 'succeeded' && !(record.files && record.files.video)) {
          record = await ensureTerminalDownload(sessionId, record) || record
        }
        return record
      }
      // 等待期间间隔 10~15 秒再查一次（后台定时器仍按 3~4 秒刷新页面进度，两者互补）
      const waitQuietMs = WAIT_POLL_MIN_MS + Math.round(random() * (WAIT_POLL_MAX_MS - WAIT_POLL_MIN_MS))
      await sleep(Math.min(waitQuietMs, Math.max(100, timeoutMs - elapsed)), signal)
    }
  }

  /** 取消任务（仅排队中可取消）。 */
  async function cancelRecord(sessionId, recordId) {
    const record = store.getRecord(sessionId, recordId)
    if (!record) throw new TaskError('任务不存在：' + recordId, 'NotFound', 404)
    if (isTerminalStatus(record.status)) return record
    if (record.provider === 'demo') {
      clearTimer(sessionId, recordId)
      return store.patchRecord(sessionId, recordId, {
        updatedAt: now(),
        status: 'cancelled',
        progress: 100,
        error: { code: 'Cancelled', message: '任务已取消（演示模式）' }
      })
    }
    if (record.status === 'running') {
      throw new TaskError('任务运行中不可取消（方舟仅允许取消排队中的任务）', 'RunningCannotCancel', 409)
    }
    const config = getConfig()
    const client = getClient(config)
    try {
      await client.cancelTask(record.remoteTaskId)
    } catch (error) {
      throw new TaskError('取消任务失败：' + errorMessage(error), error && error.code ? error.code : 'CancelFailed', error && error.status ? error.status : 0)
    }
    clearTimer(sessionId, recordId)
    return store.patchRecord(sessionId, recordId, {
      updatedAt: now(),
      status: 'cancelled',
      progress: 100,
      error: { code: 'Cancelled', message: '任务已取消' }
    })
  }

  /** 记录读取/列表。 */
  function getRecord(sessionId, recordId) {
    if (!isValidRecordId(recordId)) throw new TaskError('任务 ID 格式不合法：' + String(recordId), 'InvalidTaskId', 400)
    return store.getRecord(sessionId, recordId)
  }

  function listRecords(sessionId, listOptions = {}) {
    let records = store.listRecords(sessionId)
    if (listOptions.status) records = records.filter((record) => record.status === listOptions.status)
    const limit = Number(listOptions.limit)
    if (Number.isFinite(limit) && limit > 0) records = records.slice(0, Math.min(200, Math.floor(limit)))
    return records
  }

  /** 全部会话记录（跨会话；主面板无会话时用）。 */
  function listAllRecords(listOptions = {}) {
    let records = store.listAllRecords ? store.listAllRecords({}) : []
    if (listOptions.status) records = records.filter((record) => record.status === listOptions.status)
    const limit = Number(listOptions.limit)
    if (Number.isFinite(limit) && limit > 0) records = records.slice(0, Math.min(200, Math.floor(limit)))
    return records
  }

  /** 删除记录及本地媒体。 */
  function deleteRecord(sessionId, recordId) {
    if (!isValidRecordId(recordId)) throw new TaskError('任务 ID 格式不合法：' + String(recordId), 'InvalidTaskId', 400)
    clearTimer(sessionId, recordId)
    const result = store.deleteRecord(sessionId, recordId)
    if (!result.deleted) throw new TaskError('任务不存在：' + recordId, 'NotFound', 404)
    return result
  }

  /** 再创作：基于历史记录创建新任务。 */
  async function recreate(sessionId, sourceId, overrides = {}, createOptions = {}) {
    if (!isValidRecordId(sourceId)) throw new TaskError('来源任务 ID 格式不合法：' + String(sourceId), 'InvalidTaskId', 400)
    const source = store.getRecord(sessionId, sourceId)
    if (!source) throw new TaskError('来源任务不存在：' + sourceId, 'NotFound', 404)
    const config = getConfig()
    const plan = buildRecreatePlan(source, overrides, { now: now(), config })
    const request = {
      prompt: plan.prompt,
      model: plan.model,
      mode: plan.mode,
      params: plan.params
    }
    if (plan.mediaKind === 'remote-video' && plan.mediaUrl) {
      request.inputs = { video: { url: plan.mediaUrl } }
    } else if (plan.mediaKind === 'last-frame') {
      const dataUrl = await readLastFrameDataUrl(source)
      if (!dataUrl) throw new TaskError('本地尾帧图缺失，无法复用', 'MissingLastFrame', 409)
      request.inputs = { images: [{ role: plan.mediaRole || 'first_frame', dataUrl }] }
      // 参考视频模式下首尾帧互斥：reference_image 由 mode=reference 决定
    }
    const record = await createRecord(sessionId, request, { ...createOptions, originId: sourceId })
    record.originId = sourceId
    const planSummary = {
      originId: sourceId,
      mode: plan.mode,
      mediaKind: plan.mediaKind,
      mediaRole: plan.mediaRole || null,
      remoteVideoUrl: plan.remoteVideoUrl || null,
      warnings: plan.warnings
    }
    record.meta = { ...(record.meta || {}), recreate: planSummary }
    const saved = store.upsertRecord(sessionId, record)
    return { record: saved, plan }
  }

  /** 读取记录落盘尾帧为 data URL。 */
  async function readLastFrameDataUrl(record) {
    const filePath = store.recordFilePath(record, 'lastFrame')
    if (!filePath) return null
    try {
      const buffer = await fsp.readFile(filePath)
      return 'data:image/jpeg;base64,' + buffer.toString('base64')
    } catch (error) {
      logger('warn', '读取尾帧失败：' + errorMessage(error))
      return null
    }
  }

  /** 进程重启后恢复未完成任务轮询。 */
  function start() {
    stopped = false
    let recovered = 0
    const sessions = store.listSessions()
    for (const session of sessions) {
      const records = store.listRecords(session.sessionId)
      for (const record of records) {
        if (isTerminalStatus(record.status)) continue
        recovered += 1
        logger('info', '恢复未完成任务轮询：' + record.id + '（' + record.status + '）')
        if (autoPoll) schedule(session.sessionId, record.id, 200 + jitter(800, random))
      }
    }
    return recovered
  }

  /** 停止所有轮询定时器（插件卸载时调用）。 */
  function stop() {
    stopped = true
    for (const timer of timers.values()) clearTimeout(timer)
    timers.clear()
    clients.clear()
  }

  return {
    createRecord,
    getRecord,
    listRecords,
    listAllRecords,
    deleteRecord,
    cancelRecord,
    recreate,
    buildRecreatePlan,
    waitForRecord,
    ensureTerminalDownload,
    pollNow,
    runPoll,              // 自动轮询入口（定时器/测试）
    runPollSession,       // 单步轮询（不等待定时器）
    start,
    stop,
    get activeTimerCount() { return timers.size }
  }
}
