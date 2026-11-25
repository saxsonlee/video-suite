/**
 * dsh-seedance-studio — api / 错误类型与错误描述
 *
 * 本文件由 server/api.js 拆分而来；对外契约由 api/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DEFAULT_BASE_URL, DEFAULT_RELAY_CREATE_PATHS, DEFAULT_TASKS_PATH } from '../models/index.js'

/** 统一的 API 错误（HTTP 层据此映射状态码）。 */
export class ApiError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = details.status || 0
    this.code = details.code || null
    this.type = details.type || null
    this.requestId = details.requestId || null
    this.body = details.body || null
  }
}

/** 取消/中止等错误。 */
export class ApiTimeoutError extends ApiError {
  constructor(message, lastTask) {
    super(message, { code: 'WaitTimeout' })
    this.name = 'ApiTimeoutError'
    this.lastTask = lastTask || null
  }
}

/** 常见错误码的中文排查建议（精简版）。 */
export const ERROR_HINTS = {
  AuthenticationError: 'API Key 缺失/无效/过期：检查 ARK_API_KEY 与账号区域',
  MissingApiKey: '缺少 API Key：在插件设置中填写 ARK_API_KEY 或 RELAY_API_KEY',
  MissingRelayBaseUrl: '已启用中转站模式但缺少 RELAY_BASE_URL',
  InvalidRelayBaseUrl: 'RELAY_BASE_URL 必须以 http:// 或 https:// 开头',
  RelayListUnsupported: '中转站没有统一的任务列表接口',
  RelayCancelUnsupported: '该中转站没有取消任务接口',
  'OperationDenied.ServiceNotOpen': '模型服务未开通：去方舟控制台「开通管理」开通对应模型',
  ModelNotOpen: '模型未开通或 model ID 不存在：核对模型 ID 并开通',
  AccountOverdueError: '账号欠费/逾期：请充值',
  AccessDenied: '无权限：检查 API Key 所属项目/子账号权限',
  'InvalidEndpointOrModel.NotFound': '模型/接入点不存在：核对 model 与 URL',
  PathNotFound: '路径错误：Base URL 只到主机名',
  SensitiveContentDetected: '输入内容涉敏感信息：更换提示词或素材',
  'InputImageSensitiveContentDetected.PrivacyInformation': '输入图片疑似包含真人，被内容安全策略拒绝',
  'ModelAccountRpmRateLimitExceeded': '超过模型 RPM 限流：降低频率并按指数退避重试',
  'ModelAccountConcurrentRequestsLimitExceeded': '超过并发上限：减少并发后重试',
  RequestBurstTooFast: '请求突发过快：逐步放量并加入抖动',
  QuotaExceeded: '额度/用量上限用尽：充值或调整用量上限',
  InternalServiceError: '服务内部错误：退避重试',
  ModelLoading: '模型加载中：退避重试',
  DownloadFailed: '媒体下载失败：视频 URL 24 小时有效，请重试或重新生成',
  WaitTimeout: '等待任务超时：任务仍在远端运行，可用 action=wait 继续等待'
}

/** 把错误描述为排障文本（含错误码/HTTP 状态/建议）。 */
export function describeApiError(error) {
  if (!error) return '未知错误'
  const parts = [error.message || String(error)]
  if (error.code) parts.push('错误码：' + error.code)
  if (error.status) parts.push('HTTP 状态：' + error.status)
  if (error.requestId) parts.push('请求 ID：' + error.requestId)
  const hint = ERROR_HINTS[error.code]
  if (hint) parts.push('建议：' + hint)
  else if (error.status === 401) parts.push('建议：API Key 无效或未携带')
  else if (error.status === 403) parts.push('建议：确认模型已开通、账号未欠费、Key 权限正确')
  else if (error.status === 404) parts.push('建议：核对模型 ID/接入点 ID 与请求 URL')
  else if (error.status === 429) parts.push('建议：触发限流，降低频率稍后重试')
  return parts.join('；')
}

/** 把 API 错误映射为 HTTP 状态码（路由层用）。 */
export function apiErrorStatus(error) {
  if (!error) return 500
  if (error.name === 'ValidationError') return 400
  if (error.status && error.status > 0) {
    if ([400, 401, 403, 404, 429].indexOf(error.status) !== -1) return error.status
    if (error.status >= 500) return 502
    return error.status
  }
  if (error.code === 'MissingApiKey' || error.code === 'MissingRelayBaseUrl' || error.code === 'InvalidRelayBaseUrl' || error.code === 'MissingConfig') return 503
  if (error.code === 'RelayCancelUnsupported' || error.code === 'RelayListUnsupported') return 501
  if (error.code === 'WaitTimeout') return 504
  if (error.code === 'ValidationError' || error.code === 'InvalidTaskId') return 400
  if (error instanceof ApiError) return 502
  return 500
}
