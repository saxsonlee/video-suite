/**
 * dsh-seedance-studio — Seedance 模型目录、能力矩阵与参数约束。
 *
 * 数据依据：火山方舟视频生成接口官方文档（2026-11 核实，见参考归档
 * 旧版 API 校准文档）与旧版封装（仅源码仓库存档，不随发布包分发）。
 * 本模块是纯逻辑：不依赖 DSH 运行时、不做 I/O，可被 node --test 直接加载。
 *
 * 术语：
 * - mode：面向用户/模型的创作模式（文生视频/图生视频/首尾帧/全模态参考/编辑/延长/样片）；
 * - payload：转换为方舟官方 snake_case 请求体；
 * - media：已解析为可下发 URL 的素材（图片可为 data: URI，视频不允许 base64）。
 * @module dsh-seedance-studio/server/models
 */

export { DEFAULT_MODEL, DEFAULT_BASE_URL, DEFAULT_TASKS_PATH, DEFAULT_RELAY_CREATE_PATHS, RATIOS, RESOLUTIONS, IMAGE_ROLES, VIDEO_ROLES, AUDIO_ROLES, OUTPUT_FORMATS, OMNI_TASK_TYPES, MODES, MODE_INFO, LIMITS, MODELS, MODEL_MAP } from './catalog.js'
export { ValidationError } from './validation.js'
export { getModel, modelModes, publicModel, listModels, publicDefaults, capabilities } from './query.js'
export { inferMode } from './inputs.js'
export { normalizeGenerateRequest, mapModelToRelay } from './request.js'
export { buildArkPayload, summarizeRequest } from './payload.js'
