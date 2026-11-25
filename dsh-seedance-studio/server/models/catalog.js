/**
 * dsh-seedance-studio — models / 常量与模型目录
 *
 * 本文件由 server/models.js 拆分而来；对外契约由 models/index.js 统一 re-export。
 */

/** 默认模型：Seedance 2.5（2026-06 发布的最新旗舰）。 */
export const DEFAULT_MODEL = 'doubao-seedance-2-5-260628'

/** 火山方舟（中国区）默认数据面地址。 */
export const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com'

/** 视频生成任务端点路径。 */
export const DEFAULT_TASKS_PATH = '/api/v3/contents/generations/tasks'

/** 中转站默认创建路径（按协议）。 */
export const DEFAULT_RELAY_CREATE_PATHS = { ark: DEFAULT_TASKS_PATH, openai: '/v1/video/generations', minimax: '/videos' }

/** 支持的比例（2.5 首尾帧/编辑/延长任务只能 adaptive）。 */
export const RATIOS = ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']

/** 分辨率全集（模型各有子集）。 */
export const RESOLUTIONS = ['480p', '720p', '1080p', '4k']

/** 图片素材角色。 */
export const IMAGE_ROLES = ['first_frame', 'last_frame', 'reference_image']

/** 视频素材角色。 */
export const VIDEO_ROLES = ['reference_video']

/** 音频素材角色。 */
export const AUDIO_ROLES = ['reference_audio']

/** 输出格式（2.5 支持 mov）。 */
export const OUTPUT_FORMATS = ['mp4', 'mov']

/** 全模态参考任务类型提示。 */
export const OMNI_TASK_TYPES = ['auto', 'edit', 'extend']

/** 创作模式枚举（与 PLAN §4 GenerateRequest.mode 一致）。 */
export const MODES = ['text2video', 'image2video', 'firstlast', 'reference', 'edit', 'extend', 'draft', 'draft-final']

/** 模式的展示信息与素材要求（供 /api/seedance/config 下发 UI）。 */
export const MODE_INFO = [
  { id: 'text2video', label: '文生视频', description: '仅用提示词生成视频', requires: [] },
  { id: 'image2video', label: '图生视频', description: '用一张首帧图 + 提示词生成视频', requires: ['image:first_frame'] },
  { id: 'firstlast', label: '首尾帧', description: '指定首帧与尾帧，模型补全中间过程', requires: ['image:first_frame', 'image:last_frame'] },
  { id: 'reference', label: '全模态参考', description: '参考图/参考视频/参考音频生成新视频', requires: ['media:reference'] },
  { id: 'edit', label: '视频编辑', description: '对输入视频按提示词编辑（Seedance 2.x 支持）', requires: ['video'] },
  { id: 'extend', label: '视频延长', description: '延长输入视频（Seedance 2.x 支持）', requires: ['video'] },
  { id: 'draft', label: '样片（draft）', description: '低成本 480p 样片，确认后可转正式视频', requires: [] },
  { id: 'draft-final', label: '样片转正式', description: '用样片任务 ID 生成 1080p 正式视频', requires: ['draftTaskId'] }
]

/** 各字段限制（与方舟文档一致）。 */
export const LIMITS = {
  maxPromptChars: 20000,
  maxUrlChars: 4096,
  maxDataUriChars: 40 * 1024 * 1024,
  maxImageDataUriChars: 30 * 1024 * 1024,
  maxBodyBytes: 64 * 1024 * 1024,
  maxSeed: 2147483647,
  maxDraftTaskIdChars: 128
}

/**
 * 模型目录（火山方舟中国区模型 ID）。
 * 注意：官方可能下线旧模型；列表仅供 UI 展示，接口允许传任意模型 ID / 接入点 ID。
 */
export const MODELS = [
  {
    id: 'doubao-seedance-2-5-260628',
    label: 'Seedance 2.5',
    family: '2.5',
    durations: [4, 30],
    autoDuration: true,
    defaultDuration: -1,
    resolutions: ['480p', '720p', '1080p'],
    ratios: RATIOS.slice(),
    audio: true,
    audioAlone: true,
    firstFrame: true,
    lastFrame: true,
    references: true,
    draft: true,
    omniReference: true,
    outputFormats: ['mp4', 'mov'],
    maxImages: 30,
    maxVideos: 10,
    maxAudios: 10,
    videoEditing: true,
    cameraFixed: false,
    frames: false,
    flex: false,
    tools: true,
    priority: true,
    notes: '最新旗舰：4~30 秒、最高 1080p、全模态参考（30 图 + 10 视频 + 10 音频，音频可单独）、样片 draft、mp4/mov；默认智能时长 -1。'
  },
  {
    id: 'doubao-seedance-2-0-260128',
    label: 'Seedance 2.0',
    family: '2.0',
    durations: [4, 15],
    autoDuration: true,
    defaultDuration: 5,
    resolutions: ['480p', '720p', '1080p', '4k'],
    ratios: RATIOS.slice(),
    audio: true,
    audioAlone: false,
    firstFrame: true,
    lastFrame: true,
    references: true,
    draft: false,
    omniReference: false,
    outputFormats: ['mp4'],
    maxImages: 9,
    maxVideos: 3,
    maxAudios: 3,
    videoEditing: true,
    cameraFixed: false,
    frames: false,
    flex: false,
    tools: true,
    priority: true,
    notes: '支持 4k（限流极低：RPM 15、并发 1）、全模态参考、有声视频；4~15 秒。'
  },
  {
    id: 'doubao-seedance-2-0-fast-260128',
    label: 'Seedance 2.0 Fast',
    family: '2.0',
    durations: [4, 15],
    autoDuration: true,
    defaultDuration: 5,
    resolutions: ['480p', '720p'],
    ratios: RATIOS.slice(),
    audio: true,
    audioAlone: false,
    firstFrame: true,
    lastFrame: true,
    references: true,
    draft: false,
    omniReference: false,
    outputFormats: ['mp4'],
    maxImages: 9,
    maxVideos: 3,
    maxAudios: 3,
    videoEditing: true,
    cameraFixed: false,
    frames: false,
    flex: false,
    tools: true,
    priority: true,
    notes: '2.0 高性价比快速版：480p/720p、全模态参考、有声视频；4~15 秒。'
  },
  {
    id: 'doubao-seedance-2-0-mini-260615',
    label: 'Seedance 2.0 Mini',
    family: '2.0',
    durations: [4, 15],
    autoDuration: true,
    defaultDuration: 5,
    resolutions: ['480p', '720p'],
    ratios: RATIOS.slice(),
    audio: true,
    audioAlone: false,
    firstFrame: true,
    lastFrame: true,
    references: true,
    draft: false,
    omniReference: false,
    outputFormats: ['mp4'],
    maxImages: 9,
    maxVideos: 3,
    maxAudios: 3,
    videoEditing: true,
    cameraFixed: false,
    frames: false,
    flex: false,
    tools: true,
    priority: true,
    notes: '2.0 系列最便宜的轻量版：480p/720p、全模态参考、有声视频；4~15 秒。'
  },
  {
    id: 'doubao-seedance-1-0-pro-250528',
    label: 'Seedance 1.0 Pro（即将下线）',
    family: '1.0',
    durations: [2, 12],
    autoDuration: false,
    defaultDuration: 5,
    resolutions: ['480p', '720p', '1080p'],
    ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'],
    audio: false,
    audioAlone: false,
    firstFrame: true,
    lastFrame: true,
    references: false,
    draft: false,
    omniReference: false,
    outputFormats: ['mp4'],
    maxImages: 2,
    maxVideos: 0,
    maxAudios: 0,
    videoEditing: false,
    cameraFixed: true,
    frames: true,
    flex: true,
    tools: false,
    priority: false,
    deprecated: true,
    notes: '旧版 1.0 Pro：2026-11-24 关停，不建议新项目使用。'
  },
  {
    id: 'doubao-seedance-1-0-pro-fast-251015',
    label: 'Seedance 1.0 Pro Fast（即将下线）',
    family: '1.0',
    durations: [2, 12],
    autoDuration: false,
    defaultDuration: 5,
    resolutions: ['480p', '720p', '1080p'],
    ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'],
    audio: false,
    audioAlone: false,
    firstFrame: true,
    lastFrame: false,
    references: false,
    draft: false,
    omniReference: false,
    outputFormats: ['mp4'],
    maxImages: 1,
    maxVideos: 0,
    maxAudios: 0,
    videoEditing: false,
    cameraFixed: true,
    frames: true,
    flex: true,
    tools: false,
    priority: false,
    deprecated: true,
    notes: '旧版 1.0 Pro Fast：2026-11-24 关停；仅支持首帧。'
  },
  {
    id: 'MiniMax-H3',
    label: 'MiniMax H3',
    family: 'minimax',
    durations: [4, 15],
    autoDuration: false,
    defaultDuration: 5,
    resolutions: ['768P', '2K'],
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    defaultResolution: '768P',
    defaultRatio: '16:9',
    audio: false,
    audioAlone: false,
    firstFrame: true,
    lastFrame: false,
    references: false,
    draft: false,
    omniReference: false,
    outputFormats: ['mp4'],
    maxImages: 1,
    maxVideos: 0,
    maxAudios: 0,
    videoEditing: false,
    cameraFixed: false,
    frames: false,
    flex: false,
    tools: false,
    priority: false,
    seed: false,
    returnLastFrame: false,
    watermark: false,
    notes: 'MiniMax H3（经中转站 /videos）：4~15 秒、768P/2K；图生视频用首帧图，去掉 ratio。'
  }
]

/** 模型 ID → 模型定义。 */
export const MODEL_MAP = new Map(MODELS.map((model) => [model.id, model]))
