/**
 * dsh-seedance-studio — settings / 配置解析
 *
 * 本文件由 server/settings.js 拆分而来；对外契约由 settings/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { DEFAULT_MODEL, DEFAULT_BASE_URL, DEFAULT_TASKS_PATH, DEFAULT_RELAY_CREATE_PATHS, MODELS as models } from '../models/index.js'
import { normalizeString, parseDemoFlag, parseIntSafe, normalizeBool, parseRelayModelMap, parseRelayModels } from './values.js'
import { PROVIDERS, DEFAULTS } from './defaults.js'
import { normalizeSettingRecord, mergeSettings } from './record.js'

export function detectRelayProtocol(explicit, relayBaseUrl, createPath) {
  const text = normalizeString(explicit).toLowerCase()
  if (text === 'ark' || text === 'volcengine' || text === 'ark-compatible') return 'ark'
  if (text === 'openai' || text === 'openai-video' || text === 'newapi' || text === 'generic') return 'openai'
  if (text === 'minimax' || text === 'minimax-video' || text === 'hailuo') return 'minimax'
  if (createPath && /^\/?videos\/?(\{id\})?$/.test(createPath)) return 'minimax'
  if (createPath) return /contents\/generations\/tasks/.test(createPath) ? 'ark' : 'openai'
  return /\/api\/v3(\/|$)/.test(relayBaseUrl) ? 'ark' : 'openai'
}

export function normalizeRelayStyle(value) {
  const style = normalizeString(value).toLowerCase()
  if (style === 'flat') return 'flat'
  if (style === 'orca' || style === 'orcarouter') return 'orca'
  if (style === 'minimax' || style === 'hailuo') return 'minimax'
  return 'metadata'
}

export function normalizeRelayPath(value, fallback) {
  let result = normalizeString(value) || normalizeString(fallback)
  if (!result) return ''
  if (result.charAt(0) !== '/') result = '/' + result
  return result
}

/**
 * 把模型名规范成可比对的形式：小写、非字母数字统一成 '-'、去掉末尾 6 位版本日期。
 * 例：doubao-seedance-2-5-260628 → doubao-seedance-2-5；doubao-seedance-2.5 → doubao-seedance-2-5
 */
export function normalizeModelStem(value) {
  const text = normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return text.replace(/-\d{6}$/, '')
}

/**
 * 中转站模式下把默认模型收敛到用户勾选的模型清单：
 * 默认模型必须来自用户的中转站模型列表，不能沿用内置的方舟官方模型 ID。
 * 不在清单时先按「去掉版本日期后的名字」匹配同系列项，匹配不到再用清单首项。
 * @param {string} defaultModel - 配置里的默认模型。
 * @param {Array<{id:string,label?:string}>} relayModels - 用户勾选的中转站模型清单。
 * @returns {{model:string,adjusted:boolean,reason:string}}
 */
export function resolveRelayDefaultModel(defaultModel, relayModels, knownModels) {
  const list = Array.isArray(relayModels)
    ? relayModels.filter((item) => item && normalizeString(item.id))
    : []
  if (list.length === 0) return { model: defaultModel, adjusted: false, reason: '' }
  const current = normalizeString(defaultModel)
  if (list.some((item) => item.id === current)) return { model: current, adjusted: false, reason: '' }
  const stem = normalizeModelStem(current)
  const matched = stem ? list.find((item) => normalizeModelStem(item.id) === stem) : null
  if (matched) {
    return {
      model: matched.id,
      adjusted: true,
      reason: '默认模型不在中转站已选模型清单，已按同系列匹配到 ' + matched.id
    }
  }
  // 清单里没有同系列项时：如果这个模型是内置目录里的（如 MiniMax-H3），尊重用户显式选择
  const known = Array.isArray(knownModels) ? knownModels : []
  if (current && known.indexOf(current) !== -1) return { model: current, adjusted: false, reason: '' }
  return {
    model: list[0].id,
    adjusted: true,
    reason: '默认模型不在中转站已选模型清单，已改用清单首项 ' + list[0].id
  }
}

/**
 * 把合并后的设置解析为运行期配置（provider/demo/中转/超时等）。
 * @param {object} merged - mergeSettings 的返回值（或只传 values）。
 * @param {object} [options] - storageRoot、pluginConfig 等附加信息。
 * @returns {object} 运行期配置。
 */
export function resolveConfig(merged, options = {}) {
  const values = merged && merged.values ? merged.values : normalizeSettingRecord(merged)
  const sources = (merged && merged.sources) || {}
  const providerRaw = normalizeString(values.provider).toLowerCase()
  const providerRequested = PROVIDERS.indexOf(providerRaw) === -1 ? 'auto' : providerRaw
  const arkKey = normalizeString(values.ARK_API_KEY)
  const relayKey = normalizeString(values.RELAY_API_KEY)
  const arkBaseUrl = normalizeString(values.ARK_BASE_URL).replace(/\/+$/, '') || DEFAULT_BASE_URL
  const arkTasksPath = normalizeString(values.ARK_TASKS_PATH) || DEFAULT_TASKS_PATH
  const relayBaseUrl = normalizeString(values.RELAY_BASE_URL).replace(/\/+$/, '')
  const demoFlag = parseDemoFlag(values.DEMO)
  const explicitArk = providerRequested === 'ark'
  const explicitRelay = providerRequested === 'relay'
  const useRelay = providerRequested === 'demo' || demoFlag === true
    ? false
    : explicitRelay || (!explicitArk && Boolean(relayBaseUrl))
  const apiKey = useRelay ? (relayKey || arkKey) : arkKey
  const autoDemo = providerRequested === 'auto' && !useRelay && !apiKey && demoFlag !== false
  const demoActive = providerRequested === 'demo' || demoFlag === true || autoDemo
  const provider = demoActive ? 'demo' : (useRelay ? 'relay' : 'ark')

  const requestTimeoutMs = parseIntSafe(values.REQUEST_TIMEOUT_MS, DEFAULTS.REQUEST_TIMEOUT_MS, 5000, 300000)
  const relayModels = parseRelayModels(values.RELAY_MODELS)
  const configuredDefaultModel = normalizeString(values.DEFAULT_MODEL) || DEFAULT_MODEL
  const relayDefault = useRelay
    ? resolveRelayDefaultModel(configuredDefaultModel, relayModels, models.map((item) => item.id))
    : { model: configuredDefaultModel, adjusted: false, reason: '' }
  const config = {
    provider,
    providerRequested,
    demo: demoActive,
    demoReason: '',
    useRelay,
    apiKey,
    arkApiKey: arkKey,
    relayApiKey: relayKey,
    ark: { baseUrl: arkBaseUrl, tasksPath: arkTasksPath, apiKey: arkKey, timeoutMs: requestTimeoutMs },
    relay: null,
    baseUrl: arkBaseUrl,
    tasksPath: arkTasksPath,
    defaultModel: relayDefault.model,
    defaultModelAdjusted: relayDefault.adjusted,
    defaultModelAdjustReason: relayDefault.reason,
    relayModels,
    relayBaseUrl: relayBaseUrl,
    pollIntervalMs: parseIntSafe(values.POLL_INTERVAL_MS, DEFAULTS.POLL_INTERVAL_MS, 500, 60000),
    waitTimeoutMs: parseIntSafe(values.WAIT_TIMEOUT_MS, DEFAULTS.WAIT_TIMEOUT_MS, 1000, 2 * 60 * 60 * 1000),
    runningTimeoutMs: parseIntSafe(values.RUNNING_TIMEOUT_MS, DEFAULTS.RUNNING_TIMEOUT_MS, 60000, 24 * 60 * 60 * 1000),
    requestTimeoutMs,
    downloadTimeoutMs: parseIntSafe(values.DOWNLOAD_TIMEOUT_MS, DEFAULTS.DOWNLOAD_TIMEOUT_MS, 5000, 10 * 60 * 1000),
    maxBodyBytes: parseIntSafe(values.MAX_BODY_BYTES, DEFAULTS.MAX_BODY_BYTES, 1024 * 1024, 512 * 1024 * 1024),
    debug: normalizeBool(values.DEBUG, false),
    storageRoot: options.storageRoot || '',
    settingsFile: options.settingsFile || '',
    sources,
    fileError: (merged && merged.fileError) || null,
    configError: null,
    warnings: []
  }

  if (demoActive) {
    if (providerRequested === 'demo' || demoFlag === true) config.demoReason = '已强制演示模式（DEMO 已开启）'
    else config.demoReason = '未配置 API Key，自动进入演示模式（可在此填写 API Key）'
  }

  if (useRelay && !demoActive) {
    if (!relayBaseUrl) {
      config.configError = '已选择中转站模式（provider=relay），但未配置 RELAY_BASE_URL'
    } else if (!/^https?:\/\//i.test(relayBaseUrl)) {
      config.configError = 'RELAY_BASE_URL 必须以 http(s):// 开头'
    }
    // 协议自动识别：未显式设置 RELAY_PROTOCOL 时，按默认模型名推断
    // （MiniMax / Hailuo 走 /videos 协议；其它沿用原有探测）
    const modelHint = normalizeString(values.DEFAULT_MODEL).toLowerCase()
    const protocolValue = normalizeString(values.RELAY_PROTOCOL) || (/minimax|hailuo/.test(modelHint) ? 'minimax' : '')
    const createPath = normalizeRelayPath(values.RELAY_CREATE_PATH, DEFAULT_RELAY_CREATE_PATHS[detectRelayProtocol(protocolValue, relayBaseUrl, values.RELAY_CREATE_PATH)])
    const protocol = detectRelayProtocol(protocolValue, relayBaseUrl, createPath)
    config.relay = {
      baseUrl: relayBaseUrl,
      apiKey: apiKey,
      protocol,
      // 协议为 minimax 且风格仍是默认 metadata 时，自动用 minimax 请求体风格
      // （用户显式选 flat / orca 时尊重用户选择）
      style: (protocol === 'minimax' && ['', 'metadata'].indexOf(normalizeString(values.RELAY_STYLE).toLowerCase()) !== -1)
        ? 'minimax'
        : normalizeRelayStyle(values.RELAY_STYLE),
      createPath,
      queryPath: normalizeRelayPath(values.RELAY_QUERY_PATH, createPath + '/{id}'),
      cancelPath: normalizeRelayPath(values.RELAY_CANCEL_PATH, normalizeRelayPath(values.RELAY_QUERY_PATH, createPath + '/{id}')),
      modelMap: parseRelayModelMap(values.RELAY_MODEL_MAP),
      authHeader: normalizeString(values.RELAY_AUTH_HEADER) || 'Authorization',
      authPrefix: normalizeString(values.RELAY_AUTH_PREFIX) === '' ? '' : normalizeString(values.RELAY_AUTH_PREFIX),
      timeoutMs: requestTimeoutMs
    }
    if (config.relay.authPrefix === 'Bearer' || config.relay.authPrefix === 'bearer') config.relay.authPrefix = 'Bearer '
    if (!apiKey) config.configError = '已启用中转站模式，但未配置 RELAY_API_KEY（或 ARK_API_KEY）'
    config.baseUrl = relayBaseUrl
    config.tasksPath = createPath
  } else if (!demoActive && provider !== 'demo') {
    if (!apiKey) config.configError = 'provider=ark 但未配置 ARK_API_KEY'
  }

  if (config.fileError) config.warnings.push(config.fileError)
  if (config.configError) config.warnings.push(config.configError)
  return config
}
