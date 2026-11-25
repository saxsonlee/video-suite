/**
 * dsh-seedance-studio — api / 中转站模型目录探测（含轻量连通性测试）
 *
 * 中转站/兼容网关通常支持 OpenAI 的 GET /v1/models；方舟兼容站点多在 /api/v3/models。
 * 本模块按协议依次尝试候选端点，返回第一个成功的模型列表；也用于设置页「测试连接」。
 * 只依赖 Node 内置能力（fetch），fetchImpl 可注入，便于单测。
 * @module dsh-seedance-studio/server/api/relay-models
 */
import { ApiError } from './errors.js'

/** 候选模型列表端点（按协议排序）。 */
export const RELAY_MODEL_PATHS = {
  ark: ['/api/v3/models', '/v1/models', '/models'],
  openai: ['/v1/models', '/api/v3/models', '/models']
}

/** 协议对应的候选端点（副本）。 */
export function relayModelPaths(protocol) {
  const key = protocol === 'ark' ? 'ark' : 'openai'
  return RELAY_MODEL_PATHS[key].slice()
}

/** 从任意常见模型列表响应里提取 [{id,label}]（去重、保持顺序）。 */
export function extractModelIds(payload) {
  const list = []
  const push = (item) => {
    if (!item) return
    if (typeof item === 'string') {
      const id = item.trim()
      if (id) list.push({ id, label: id })
      return
    }
    if (typeof item !== 'object') return
    const rawId = item.id !== undefined ? item.id : item.model !== undefined ? item.model : item.model_id !== undefined ? item.model_id : item.name
    const id = rawId === undefined || rawId === null ? '' : String(rawId).trim()
    if (!id) return
    const rawLabel = item.label !== undefined ? item.label : item.display_name !== undefined ? item.display_name : item.displayName !== undefined ? item.displayName : item.name
    const label = rawLabel === undefined || rawLabel === null || String(rawLabel).trim() === '' ? id : String(rawLabel).trim()
    list.push({ id, label })
  }
  const array = Array.isArray(payload) ? payload
    : payload && Array.isArray(payload.data) ? payload.data
      : payload && Array.isArray(payload.models) ? payload.models
        : payload && Array.isArray(payload.items) ? payload.items
          : payload && Array.isArray(payload.foundation_models) ? payload.foundation_models
            : null
  if (!array) return []
  for (const item of array) push(item)
  const seen = new Set()
  return list.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
}

/** 从错误响应里提取可读信息。 */
function errorMessage(payload, text, status) {
  if (payload && typeof payload === 'object') {
    const error = payload.error
    if (error && typeof error === 'object' && error.message) return String(error.message)
    if (typeof error === 'string' && error) return error
    if (payload.message) return String(payload.message)
  }
  const snippet = String(text || '').trim().slice(0, 200)
  return snippet || ('HTTP ' + status)
}

/**
 * 拉取中转站模型列表（候选端点逐个尝试，第一个成功即返回）。
 * @param {object} options - baseUrl/apiKey/protocol/timeoutMs/fetchImpl/authHeader/authPrefix。
 * @returns {Promise<{endpoint:string,url:string,protocol:string,models:Array,latencyMs:number}>}
 */
export async function listRelayModels(options = {}) {
  const baseUrl = String(options.baseUrl === undefined || options.baseUrl === null ? '' : options.baseUrl).trim().replace(/\/+$/, '')
  const apiKey = String(options.apiKey === undefined || options.apiKey === null ? '' : options.apiKey).trim()
  const protocol = options.protocol === 'ark' ? 'ark' : 'openai'
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : 15000
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (!baseUrl) throw new ApiError('缺少中转站地址：请先填写中转站 Base URL', { code: 'MissingRelayBaseUrl' })
  if (!/^https?:\/\//i.test(baseUrl)) throw new ApiError('中转站地址必须以 http(s):// 开头', { code: 'InvalidRelayBaseUrl' })
  if (typeof fetchImpl !== 'function') throw new ApiError('当前运行时缺少 fetch（需要 Node >= 18.18）', { code: 'NoFetch' })
  const headers = { Accept: 'application/json' }
  if (apiKey) {
    const authHeader = String(options.authHeader || 'Authorization').trim() || 'Authorization'
    const authPrefix = options.authPrefix === undefined ? 'Bearer ' : String(options.authPrefix)
    headers[authHeader] = authPrefix + apiKey
  }
  const failures = []
  for (const endpoint of relayModelPaths(protocol)) {
    const url = baseUrl + endpoint
    const startedAt = Date.now()
    let controller = null
    let timer = null
    try {
      controller = new AbortController()
      timer = setTimeout(() => controller.abort(), timeoutMs)
      const response = await fetchImpl(url, { method: 'GET', headers, signal: controller.signal })
      const text = await response.text()
      let payload = null
      try { payload = text ? JSON.parse(text) : null } catch (error) { payload = null }
      if (!response.ok) {
        failures.push({ url, status: response.status, message: errorMessage(payload, text, response.status) })
        continue
      }
      const models = extractModelIds(payload)
      if (!models.length) {
        failures.push({ url, status: response.status, message: '响应里没有可识别的模型列表（data/models/items）' })
        continue
      }
      return { endpoint, url, protocol, models, latencyMs: Date.now() - startedAt }
    } catch (error) {
      const message = error && error.name === 'AbortError' ? ('请求超时（' + timeoutMs + ' ms）') : String(error && error.message ? error.message : error)
      failures.push({ url, message })
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  const detail = failures.map((item) => item.url + (item.status ? ' → HTTP ' + item.status : '') + '：' + item.message).join('；')
  throw new ApiError('中转站模型列表获取失败（已尝试 ' + failures.length + ' 个端点）：' + detail, { code: 'RelayModelsFailed', body: failures })
}
