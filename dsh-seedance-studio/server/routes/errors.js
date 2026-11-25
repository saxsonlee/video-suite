/**
 * dsh-seedance-studio — routes / 响应构造与错误映射
 *
 * 本文件由 server/routes.js 拆分而来；对外契约由 routes/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { apiErrorStatus } from '../api/index.js'
import { LIMITS, MODES } from '../models/index.js'

/** 路由层错误（携带 HTTP 状态码）。 */
export class RequestError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'RequestError'
    this.status = status
    this.code = code
  }
}

/** 成功响应。 */
export function jsonValue(value, status = 200) {
  return Response.json({ ok: true, value }, { status })
}

/** 失败响应。 */
export function jsonError(error, status) {
  const code = error && error.code ? String(error.code) : 'Error'
  const message = error && error.message ? String(error.message) : '未知错误'
  const httpStatus = status || apiErrorStatus(error)
  return Response.json({ ok: false, error: { code, message } }, { status: httpStatus })
}

/** 把异常映射为失败响应（不抛错，保证宿主路由稳定）。 */
export function mapErrorToResponse(error) {
  if (error instanceof RequestError) return jsonError(error, error.status)
  return jsonError(error)
}
