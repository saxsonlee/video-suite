/**
 * dsh-seedance-studio — /api/seedance/* 精确 Fetch 路由（浏览器页面与调试客户端共用）。
 *
 * 由 index.js 通过 ctx.connection.fetch.register 注册；每条路由都必须声明
 * requestBody: 'buffered'（精确 Fetch 路由契约，否则 GET 会被 bridge 当作流式请求而 400）。
 *
 * 统一响应（PLAN §4）：
 *   成功 { ok: true, value: ... }
 *   失败 { ok: false, error: { code, message } }
 * 媒体路由支持单段 Range（206/Content-Range/416），供 <video> 拖动播放。
 *
 * 本模块不 import DSH 运行时；Request/Response 使用 Node/Electron 全局实现，
 * 可被 node --test 直接调用验证（传入标准 Request 即可）。
 * @module dsh-seedance-studio/server/routes
 */

export { API_PREFIX, MEDIA_KINDS, MAX_SESSION_ID_CHARS, DEFAULT_MAX_BODY_BYTES } from './constants.js'
export { RequestError, jsonValue, jsonError, mapErrorToResponse } from './errors.js'
export { requireSessionId, requireRecordId, readJsonRequest } from './io.js'
export { parseRange, mediaResponse } from './media.js'
export { createRoutes, describeRoutes } from './manager.js'
