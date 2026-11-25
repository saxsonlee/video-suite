/**
 * dsh-seedance-studio — Seedance API 客户端（火山方舟官方 + 中转站 relay）。
 *
 * 官方接口：POST/GET/DELETE {baseUrl}/api/v3/contents/generations/tasks[/{id}]
 * 视频生成是异步任务：创建 → 轮询查询 → 成功后下载 content.video_url（24h 有效）。
 *
 * 中转站（relay）两类协议：
 * 1) ark    ：原样代理方舟端点（只换域名/Key）；
 * 2) openai ：POST /v1/video/generations + GET /v1/video/generations/{id}，
 *              请求体有 metadata / flat / orca 三种风格。
 * 两种协议统一归一化为本模块的 RemoteTask DTO，上层无感。
 *
 * 本模块只依赖 Node 内置能力（fetch/stream），可被 node --test 直接加载；
 * 所有网络调用都接受可注入的 fetchImpl，便于单测。
 * @module dsh-seedance-studio/server/api
 */

export { TERMINAL_STATUSES, STATUS_MAP, isTerminalStatus, normalizeStatus } from './status.js'
export { ApiError, ApiTimeoutError, describeApiError, apiErrorStatus } from './errors.js'
export { readJsonSafe, getByPath, pickTaskId, pickVideoUrl, extractErrorInfo } from './extract.js'
export { normalizeArkTask, normalizeRelayTask } from './normalize.js'
export { buildRelayCreateBody } from './relay-body.js'
export { assertTaskId, pollTask } from './poll.js'
export { ArkVideoClient } from './ark.js'
export { RelayVideoClient } from './relay.js'
export { createVideoClient } from './client.js'
export { RELAY_MODEL_PATHS, relayModelPaths, extractModelIds, listRelayModels } from './relay-models.js'
export { imageMediaTypeForPath, downloadFile } from './download.js'
