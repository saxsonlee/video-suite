/**
 * dsh-seedance-studio — api / 方舟官方客户端
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
import { readJsonSafe, pickTaskId, extractErrorInfo } from './extract.js'
import { normalizeArkTask } from './normalize.js'
import { normalizeBaseUrl, normalizeTasksPath, assertTaskId, pollTask } from './poll.js'

/**
 * 火山方舟官方视频客户端。
 */
export class ArkVideoClient {
  constructor(options = {}) {
    this.apiKey = String(options.apiKey || '').trim()
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.tasksPath = normalizeTasksPath(options.tasksPath)
    this.fetchImpl = options.fetchImpl || globalThis.fetch
    this.timeoutMs = options.timeoutMs || 60000
    this.userAgent = options.userAgent || 'dsh-seedance-studio/0.1'
    this.provider = 'ark'
    if (!this.apiKey) throw new ApiError('缺少 API Key：请在插件设置中填写 ARK_API_KEY', { code: 'MissingApiKey' })
    if (typeof this.fetchImpl !== 'function') throw new ApiError('当前运行时缺少 fetch（需要 Node >= 18.18）', { code: 'NoFetch' })
  }

  get tasksUrl() {
    return this.baseUrl + this.tasksPath
  }

  taskUrl(taskId) {
    return this.tasksUrl + '/' + encodeURIComponent(assertTaskId(taskId))
  }

  async request(method, url, body) {
    const headers = {
      Authorization: 'Bearer ' + this.apiKey,
      Accept: 'application/json',
      'User-Agent': this.userAgent
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      let response
      try {
        response = await this.fetchImpl(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal
        })
      } catch (error) {
        if (error && error.name === 'AbortError') throw new ApiError('请求火山方舟超时（' + this.timeoutMs + ' ms）', { code: 'Timeout' })
        throw new ApiError('网络请求失败：' + (error && error.message ? error.message : String(error)), { code: 'NetworkError' })
      }
      const requestId = response.headers && typeof response.headers.get === 'function'
        ? (response.headers.get('x-request-id') || response.headers.get('x-tt-logid') || null)
        : null
      let data
      try {
        data = await readJsonSafe(response)
      } catch (error) {
        if (error && error.name === 'AbortError') throw new ApiError('读取火山方舟响应超时（' + this.timeoutMs + ' ms）', { code: 'Timeout' })
        throw new ApiError('读取火山方舟响应失败：' + (error && error.message ? error.message : String(error)), { code: 'NetworkError' })
      }
      if (!response.ok) {
        const info = extractErrorInfo(data)
        throw new ApiError(info.message || ('火山方舟接口返回 HTTP ' + response.status), {
          status: response.status,
          code: info.code,
          type: info.type,
          requestId,
          body: data
        })
      }
      return { data, requestId }
    } finally {
      clearTimeout(timer)
    }
  }

  /** 创建任务，返回 { id, requestId }。 */
  async createTask(payload) {
    if (!payload || typeof payload !== 'object') throw new ApiError('createTask 需要请求体对象', { code: 'InvalidPayload' })
    if (!payload.model) throw new ApiError('请求体缺少 model', { code: 'InvalidPayload' })
    if (!Array.isArray(payload.content) || payload.content.length === 0) throw new ApiError('请求体缺少 content', { code: 'InvalidPayload' })
    const result = await this.request('POST', this.tasksUrl, payload)
    const data = result.data || {}
    const id = typeof data.id === 'string' ? data.id : pickTaskId(data)
    if (!id) throw new ApiError('创建任务成功但响应缺少任务 ID', { code: 'UnexpectedResponse', requestId: result.requestId, body: data })
    return { id, requestId: result.requestId }
  }

  /** 查询单个任务（返回统一 RemoteTask）。 */
  async getTask(taskId) {
    const result = await this.request('GET', this.taskUrl(taskId))
    const task = normalizeArkTask(result.data)
    if (!task.id) task.id = taskId
    return task
  }

  /** 取消任务（仅 queued 可取消；已结束任务 DELETE 是删除记录）。 */
  async cancelTask(taskId) {
    const result = await this.request('DELETE', this.taskUrl(taskId))
    return { ok: true, requestId: result.requestId }
  }

  /** 分页查询任务列表。 */
  async listTasks(query = {}) {
    const params = new URLSearchParams()
    params.set('page_num', String(query.pageNum || 1))
    params.set('page_size', String(query.pageSize || 20))
    if (query.model) params.set('filter.model', String(query.model))
    if (query.status) params.set('filter.status', String(query.status))
    const result = await this.request('GET', this.tasksUrl + '?' + params.toString())
    const data = result.data || {}
    const items = Array.isArray(data.items) ? data.items : (data.data && Array.isArray(data.data.items) ? data.data.items : [])
    return { items: items.map(normalizeArkTask), total: typeof data.total === 'number' ? data.total : items.length, requestId: result.requestId }
  }

  async waitForTask(taskId, options) {
    return pollTask(this, taskId, options)
  }
}
