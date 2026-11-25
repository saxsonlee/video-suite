/**
 * dsh-seedance-studio — api / 中转站客户端
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
import { normalizeRelayTask } from './normalize.js'
import { buildRelayCreateBody } from './relay-body.js'
import { assertTaskId, pollTask } from './poll.js'

/**
 * 中转站 relay 客户端。
 */
export class RelayVideoClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl || '').trim().replace(/\/+$/, '')
    this.apiKey = String(options.apiKey || '').trim()
    this.protocol = options.protocol === 'ark' ? 'ark' : (options.protocol === 'minimax' ? 'minimax' : 'openai')
    this.style = options.style === 'flat' ? 'flat'
      : (options.style === 'orca' ? 'orca'
      : (options.style === 'minimax' ? 'minimax' : 'metadata'))
    this.createPath = String(options.createPath || DEFAULT_RELAY_CREATE_PATHS[this.protocol]).trim()
    this.queryPath = String(options.queryPath || (this.createPath + '/{id}')).trim()
    this.cancelPath = String(options.cancelPath || this.queryPath).trim()
    this.modelMap = options.modelMap && typeof options.modelMap === 'object' ? options.modelMap : {}
    this.videoField = String(options.videoField || '').trim()
    this.authHeader = String(options.authHeader || 'Authorization').trim() || 'Authorization'
    this.authPrefix = options.authPrefix === undefined ? 'Bearer ' : String(options.authPrefix)
    this.timeoutMs = options.timeoutMs || 60000
    this.fetchImpl = options.fetchImpl || globalThis.fetch
    this.userAgent = options.userAgent || 'dsh-seedance-studio/0.1 (relay)'
    this.provider = 'relay'
    if (!this.baseUrl) throw new ApiError('缺少中转站地址：请在插件设置中填写 RELAY_BASE_URL', { code: 'MissingRelayBaseUrl' })
    if (!/^https?:\/\//i.test(this.baseUrl)) throw new ApiError('RELAY_BASE_URL 必须以 http(s):// 开头', { code: 'InvalidRelayBaseUrl' })
    if (!this.apiKey) throw new ApiError('缺少中转站 API Key：请填写 RELAY_API_KEY（或 ARK_API_KEY）', { code: 'MissingApiKey' })
    if (typeof this.fetchImpl !== 'function') throw new ApiError('当前运行时缺少 fetch（需要 Node >= 18.18）', { code: 'NoFetch' })
    if (this.createPath.charAt(0) !== '/') this.createPath = '/' + this.createPath
    if (this.queryPath.charAt(0) !== '/') this.queryPath = '/' + this.queryPath
    if (this.cancelPath.charAt(0) !== '/') this.cancelPath = '/' + this.cancelPath
  }

  mapModel(model) {
    return this.modelMap[model] || model
  }

  urlFor(pathTemplate, taskId) {
    const encoded = encodeURIComponent(assertTaskId(taskId))
    if (pathTemplate.indexOf('{id}') !== -1) return this.baseUrl + pathTemplate.replace('{id}', encoded)
    return this.baseUrl + pathTemplate.replace(/\/+$/, '') + '/' + encoded
  }

  async request(method, url, body) {
    const headers = { Accept: 'application/json', 'User-Agent': this.userAgent }
    headers[this.authHeader] = this.authPrefix + this.apiKey
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
        if (error && error.name === 'AbortError') throw new ApiError('请求中转站超时（' + this.timeoutMs + ' ms）', { code: 'Timeout' })
        throw new ApiError('网络请求失败（中转站）：' + (error && error.message ? error.message : String(error)), { code: 'NetworkError' })
      }
      let data
      try {
        data = await readJsonSafe(response)
      } catch (error) {
        if (error && error.name === 'AbortError') throw new ApiError('读取中转站响应超时（' + this.timeoutMs + ' ms）', { code: 'Timeout' })
        throw new ApiError('读取中转站响应失败：' + (error && error.message ? error.message : String(error)), { code: 'NetworkError' })
      }
      if (!response.ok) {
        const info = extractErrorInfo(data)
        throw new ApiError(info.message || ('中转站接口返回 HTTP ' + response.status), {
          status: response.status,
          code: info.code,
          type: info.type,
          body: data
        })
      }
      return data
    } finally {
      clearTimeout(timer)
    }
  }

  async createTask(payload) {
    if (!payload || typeof payload !== 'object') throw new ApiError('createTask 需要请求体对象', { code: 'InvalidPayload' })
    if (!payload.model) throw new ApiError('请求体缺少 model', { code: 'InvalidPayload' })
    const body = buildRelayCreateBody(payload, { style: this.style, mapModel: this.mapModel.bind(this) })
    const data = await this.request('POST', this.baseUrl + this.createPath, body)
    const id = pickTaskId(data)
    if (!id) throw new ApiError('中转站创建任务成功但响应缺少任务 ID', { code: 'UnexpectedResponse', body: data })
    return { id, requestId: null }
  }

  async getTask(taskId) {
    const data = await this.request('GET', this.urlFor(this.queryPath, taskId))
    // MiniMax 协议：产物在 GET /videos/{id}/content（二进制，需要鉴权），查询响应里没有 URL
    const contentUrl = this.protocol === 'minimax' ? this.urlFor('/videos/{id}/content', taskId) : ''
    const task = normalizeRelayTask(data, { videoField: this.videoField, fallbackId: taskId, fallbackVideoUrl: contentUrl })
    if (!task.id) task.id = taskId
    // 需要鉴权下载的产物（MiniMax content 端点）把请求头带上，供 tasks 下载时使用
    if (task.videoUrl && contentUrl && task.videoUrl === contentUrl) {
      task.downloadHeaders = { [this.authHeader]: this.authPrefix + this.apiKey }
    }
    return task
  }

  async cancelTask(taskId) {
    try {
      await this.request('DELETE', this.urlFor(this.cancelPath, taskId))
      return { ok: true, requestId: null }
    } catch (error) {
      if (error && (error.status === 404 || error.status === 405 || error.status === 501)) {
        throw new ApiError('该中转站未提供取消任务接口（DELETE ' + this.cancelPath + '）', {
          status: error.status,
          code: 'RelayCancelUnsupported',
          body: error.body || null
        })
      }
      throw error
    }
  }

  async listTasks() {
    throw new ApiError('中转站协议没有统一的任务列表接口，请使用任务 ID 查询或查看本地历史记录', { code: 'RelayListUnsupported' })
  }

  async waitForTask(taskId, options) {
    return pollTask(this, taskId, options)
  }
}
