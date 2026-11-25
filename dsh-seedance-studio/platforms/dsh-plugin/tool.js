/**
 * dsh-seedance-studio — 模型可调用的 seedance_video 工具定义。
 *
 * 本模块是纯工厂：不 import DSH 运行时，defineTool 由 index.js 注入
 * （便于 node --test 直接用假 defineTool 测试 execute/render 逻辑）。
 *
 * 工具语义（PLAN §5）：
 * - generate：创建任务后立即返回 { taskId, status:'queued', hint }，不阻塞；
 * - wait：轮询到终态或超时（默认 90s，最大 300s），响应 exec.signal 取消；
 * - status / history / recreate / cancel / models 按需使用；
 * - 单会话历史自动保存（sessionId 来自 exec.agent.session.id，缺失时回落 default）；
 * - 尾帧图存在时把 durable 图片附件引用放进结果 value.previewImage，render 时追加 image content block
 *   （与官方 read_image 一致；需 attachments 服务且当前模型声明 image 输入）。
 * @module dsh-seedance-studio/platforms/dsh-plugin/tool
 */

/** 工具名。 */
export const TOOL_NAME = 'seedance_video'

/** 可用 action（与 PLAN §5 一致）。 */
export const TOOL_ACTIONS = ['generate', 'status', 'wait', 'history', 'recreate', 'cancel', 'models']

/** waitSeconds 限制。 */
export const WAIT_SECONDS_DEFAULT = 150
export const WAIT_SECONDS_MAX = 300
/** imageUrls 中 dataURL 上限（约 2MB 原始图片 → base64 后约 2.8MB）。 */
export const MAX_INLINE_IMAGE_CHARS = 2.8 * 1024 * 1024
/** 单次 generate 允许的图片数量上限（模型侧放宽到 30，实际由 models.js 按模型再校验）。 */
export const MAX_IMAGE_URLS = 30

/** 工具描述（中文，面向模型）。 */
export const TOOL_DESCRIPTION = [
  'Seedance 视频创作台：生成/查询/等待/再创作 AI 视频，结果自动保存到当前会话的历史记录（可跨轮次、重启不丢）。',
  '何时用：用户要求"生成视频/文生视频/图生视频/首尾帧/参考视频/编辑视频/延长视频/做个样片"，或要查看/等待/再创作之前生成的视频。',
  '创作前置流程（重要）：调用 generate/recreate 前，先像「编剧 + 导演 + 角色设计」一样把方案定下来，不要只问一句话就直接生成。步骤：① 编剧：定故事/剧情（场景、起承转合、情绪基调），可给 1~2 个方向让用户选；② 角色设计：每个出场角色给出外观描述（年龄、长相、发型、服装、体型、标志性特征），保证多镜头一致；③ 导演：输出分镜脚本——逐镜头列出：镜头号 / 景别与机位 / 镜头运动 / 时长 / 画面内容 / 台词或音效，并给出整体风格（实写/动漫/3D/胶片感等）；④ 汇总成「分镜脚本 + 人物描述」给用户确认，用户确认（或说"可以了/按这个方案生成"）后再调用 generate。简单单镜头可精简，但至少要给出内容描述 + 角色外观（有角色时）+ 镜头设计。',
  '多镜头生成：分镜有多个镜头时，可按「一镜一条」生成（用上一镜头的尾帧作为下一镜头的首帧，保持角色与场景连贯）；单条整体视频则把分镜内容浓缩成一条完整 prompt。',
  '输出格式示例——分镜脚本表格：| 镜头 | 景别/机位 | 镜头运动 | 时长 | 画面内容 | 音效/台词 |；人物描述：姓名 / 年龄 / 长相 / 发型 / 服装 / 体型 / 标志性特征。分镜脚本与人物描述都要给用户确认后再生成。',
  '对话式生成：当用户先聊需求/创意，随后说"可以了/就按上面的内容生成一个视频/开始吧/按刚才说的做"时，直接从上文提炼视频描述（主体、动作、场景、风格、镜头、时长/比例），不要反问或要求用户重复；用户提到"上面那个方案/刚才说的/这个创意"时，以对话上下文中最新的方案为准。',
  '重新生成前必须确认（重要，防误花钱）：只要本次是「修改/优化已有视频」——包括改提示词、改参数（模型/分辨率/比例/种子/时长）、换参考图、改分镜/人物、基于上一版重抽，或同一会话此前已生成过视频——调用 generate/recreate 前必须：① 逐条列出本次改动点（改了什么、为什么改）；② 把新的分镜/人物描述（有角色时）/提示词要点/关键参数发给用户看；③ 等用户明确同意（如"可以/按这个生成/没问题"）后再调用。连续两次生成之间必须有用户消息；不允许自己连续重抽，也不要把"上一版确认过"当成对下一版的确认。只有用户首次提出的全新生成（此前没有任何生成记录）可以直接按对话式流程生成。硬拦截（重要）：插件会在真正执行前检查你之前最后一条用户消息是否明确确认；没有确认会直接拒绝本次生成并提示你——不要试图先调用 generate 再说，先给用户方案、等用户明确同意后再调用。',
  '典型流程：action=generate 创建任务（秒回 taskId）→ 用 action=wait 等待完成（单次默认等 150 秒、最多 300 秒；插件内部已轮询，不要在外面再写轮询）→ 返回记录里 videoPath 是本机绝对路径，可直接用于后续处理/展示；remoteVideoUrl 是远端链接（24 小时有效）。',
  '等待规则（重要）：等任务完成一律用 action=wait——插件内部已经轮询任务状态。不要用 run_code 自己写轮询代码、不要反复调用 status、不要读存储目录里的任务文件；这些外部轮询只会更慢、更贵。如果 wait 返回超时，继续用同一个 taskId 调 wait，直到状态变成 succeeded / failed / cancelled。',
  '再创作：action=recreate 传 sourceId（历史记录 id），宿主会继承原 prompt/参数并优先复用原视频（否则用落盘尾帧）生成新视频，新记录带 originId。',
  '分析闭环：生成/等待完成后返回 videoPath 与 lastFramePath；需要「分析视频」时可读取尾帧图（lastFramePath）看画面，需要修改时用 action=recreate（sourceId 传原任务 id）继续优化，形成「讨论 → 生成 → 分析 → 优化」闭环。',
  '演示模式：未配置 API Key 时自动进入 demo 模式（8 秒模拟成功，使用内置示例视频），不产生费用，流程与真实模式一致。',
  '限制：视频参考只接受 http(s) URL 或素材 ID，不能 base64；imageUrls 支持公网 URL 或 data:image base64（≤2MB/张），工作区图片用 workspaceImages 传路径由宿主读取：支持相对会话 cwd 的路径，也支持本机绝对路径（如其他插件生成的图片），单张 ≤10MB。',
  '参数一致性（重要）：同一组镜头/同一项目多次生成时，尽量沿用相同的 model/resolution/ratio/seed/duration（尤其是 seed：固定种子是保持画面风格稳定的关键），不要每次随机。',
  '单会话历史自动保存；不需要用户手动记录 taskId，history 可随时列出。'
].join('\n')

/** 工具参数 schema（DSH 统一 schema DSL）。 */
export function buildParameters() {
  return {
    action: {
      type: 'string',
      required: true,
      enum: TOOL_ACTIONS.slice(),
      description: '操作：generate 生成（生成前按工具描述先完成「编剧/导演/角色设计 → 分镜脚本+人物描述」并让用户确认，再生成；如果本次任务有人物一致性/多镜头/分镜要求且已安装视频项目插件，建议先用 video_project 工具建项目并保存人物卡/分镜，再用它 build-prompt 返回的 prompt/params 生成；修改/优化已有视频时必须先把改动点给用户确认）/ status 查单条（只查一次当前状态，不等待；等完成请用 wait） / wait 等待完成（内部轮询） / history 列当前会话历史 / recreate 基于历史再创作（同样先确认修改点）/ cancel 取消排队任务 / models 查模型目录与默认参数'
    },
    prompt: { type: 'string', description: '视频提示词（generate 必填，recreate 可选）。多镜头时按分镜逐镜头写（景别/机位/运动/时长/画面内容），并把角色外观描述写进 prompt 以保持一致性；用户说"按上面的内容生成"时从对话上下文提炼完整描述，而不是只取最后一句话；信息不足时先向用户提问确认。' },
    model: { type: 'string', description: '模型 ID；省略则使用设置里的默认模型。中转站模式下请用设置里勾选的中转站模型 id（如 doubao-seedance-2.5）；方舟粒度 id（如 doubao-seedance-2-5-260628）会自动映射到同系列的中转站别名；MiniMax 视频用 MiniMax-H3（协议会自动识别，不需要额外配置）（用 models action 可查看当前默认与候选）' },
    mode: {
      type: 'string',
      enum: ['text2video', 'image2video', 'firstlast', 'reference', 'edit', 'extend', 'draft', 'draft-final'],
      description: '创作模式，省略时按素材自动推断：纯文本=text2video；1 张图=image2video；首帧+尾帧=firstlast；参考图/视频/音频=reference；传了视频 URL 且提示词要求修改/延长时可显式传 edit/extend'
    },
    resolution: { type: 'string', description: '分辨率，默认按模型（Seedance 2.5 为 720p，可选 480p/720p/1080p/4k；MiniMax H3 为 768P 或 2K）；样片固定 480p。用 models action 可查看当前模型的可用值' },
    ratio: { type: 'string', enum: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'], description: '画面比例，默认 adaptive' },
    duration: { type: 'integer', description: '时长（秒），-1 表示自动；Seedance 2.5 为 4~30，2.0 系列为 4~15，MiniMax H3 为 4~15' },
    seed: { type: 'integer', description: '随机种子，-1 表示随机' },
    generateAudio: { type: 'boolean', description: '是否生成有声视频（Seedance 2.x 默认开启，false 可关闭）' },
    watermark: { type: 'boolean', description: '是否加 AI 生成水印，默认 false' },
    returnLastFrame: { type: 'boolean', description: '是否返回尾帧（默认 true，用于后续再创作）' },
    imageUrls: {
      type: 'array',
      items: { type: 'string' },
      description: '参考图/首帧图 URL 数组：公网 http(s) 链接或 data:image/...;base64（每张 ≤2MB）；首尾帧用 role 区分请改用宿主页面，工具按顺序：1 张=首帧，2 张=首尾帧，多张=参考图'
    },
    workspaceImages: {
      type: 'array',
      items: { type: 'string' },
      description: '本地图片路径数组：可传相对会话 cwd 的路径，也可传本机绝对路径（如 video-project 生成的草图/参考图），宿主读取并转 dataURL；单张 ≤10MB，支持 png/jpg/jpeg/webp/gif'
    },
    videoUrl: { type: 'string', description: '参考视频/待编辑视频的 http(s) URL（不能 base64），用于 reference/edit/extend 模式' },
    sourceId: { type: 'string', description: 'recreate 用：历史记录 id（sd_...）' },
    taskId: { type: 'string', description: 'status/wait/cancel 用：任务记录 id（sd_...）' },
    waitSeconds: { type: 'integer', description: 'wait 最长等待秒数，默认 150，最大 300；超时可再次 wait 继续等' },
    limit: { type: 'integer', description: 'history 返回条数，默认 20，最大 100' }
  }
}

/** 输出 schema（统一 DTO）。 */
export function buildOutput() {
  return {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ok: { type: 'boolean', required: true },
        action: { type: 'string', required: true },
        message: { type: 'string' },
        hint: { type: 'string' },
        taskId: { type: 'string' },
        status: { type: 'string' },
        progress: { type: 'number' },
        mode: { type: 'string' },
        model: { type: 'string' },
        prompt: { type: 'string' },
        provider: { type: 'string' },
        demo: { type: 'boolean' },
        videoUrl: { type: 'string' },
        videoPath: { type: 'string' },
        lastFramePath: { type: 'string' },
        posterPath: { type: 'string' },
        previewImage: { type: 'json' },
        durationSeconds: { type: 'number' },
        usage: { type: 'json' },
        error: {
          type: 'object',
          additionalProperties: false,
          properties: { code: { type: 'string' }, message: { type: 'string' } }
        },
        record: { type: 'json' },
        records: { type: 'array', items: { type: 'json' } },
        models: { type: 'array', items: { type: 'json' } },
        enabledModels: { type: 'array', items: { type: 'json' } },
        videoEditCapability: { type: 'json' },
        defaults: { type: 'json' },
        capabilities: { type: 'json' },
        plan: { type: 'json' },
        total: { type: 'integer' }
      }
    },
    render: renderToolResult
  }
}

function formatTimestamp(ms) {
  if (!Number.isFinite(Number(ms))) return ''
  try {
    const date = new Date(Number(ms))
    const pad = (num) => String(num).padStart(2, '0')
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
  } catch (error) {
    return ''
  }
}

function formatDuration(record) {
  if (record && record.meta && Number.isFinite(Number(record.meta.duration))) return Number(record.meta.duration)
  return null
}

/** 从 record 构造单行摘要文本。 */
export function describeRecord(record, paths = {}) {
  if (!record) return '（无记录）'
  const lines = []
  lines.push('任务 ' + (record.id || '?') + '：' + (record.status || 'unknown') + (record.progress ? '（' + record.progress + '%）' : ''))
  if (record.prompt) lines.push('提示词：' + String(record.prompt).slice(0, 200) + (String(record.prompt).length > 200 ? '…' : ''))
  lines.push('模型/模式：' + (record.model || '?') + ' / ' + (record.mode || '?') + '（' + (record.provider || '?') + '）')
  const duration = formatDuration(record)
  if (duration !== null) lines.push('时长：' + duration + ' 秒')
  if (record.error && record.error.message) lines.push('错误：' + record.error.message + (record.error.code ? '（' + record.error.code + '）' : ''))
  if (record.remoteVideoUrl) lines.push('远端视频：' + record.remoteVideoUrl)
  const videoPath = paths.videoPath
  if (videoPath) lines.push('本地视频：' + videoPath)
  const lastFramePath = paths.lastFramePath
  if (lastFramePath) lines.push('尾帧图：' + lastFramePath)
  const usage = record.usage || (record.meta && record.meta.usage)
  if (usage && (usage.total_tokens !== undefined || usage.completion_tokens !== undefined)) {
    lines.push('用量：completion_tokens=' + String(usage.completion_tokens || 0) + '，total_tokens=' + String(usage.total_tokens || 0))
  }
  if (record.createdAt) lines.push('创建时间：' + formatTimestamp(record.createdAt))
  if (record.originId) lines.push('再创作来源：' + record.originId)
  return lines.join('\n')
}

/** render：返回文本 content（含本地文件路径、状态、视频 URL、用量）。 */
export function renderToolResult(_args, value) {
  const blocks = []
  const lines = []
  if (!value || value.ok !== true) {
    const error = value && value.error ? value.error : { code: 'ToolError', message: '工具执行失败' }
    lines.push('Seedance 失败：' + (error.message || '未知错误') + (error.code ? '（' + error.code + '）' : ''))
    blocks.push({ type: 'text', text: lines.join('\n') })
    return blocks
  }
  if (value.message) lines.push(value.message)
  if (value.hint) lines.push(value.hint)
  if (value.record) {
    lines.push(describeRecord(value.record, { videoPath: value.videoPath, lastFramePath: value.lastFramePath }))
  } else if (value.taskId) {
    lines.push('任务：' + value.taskId + '（' + (value.status || 'queued') + '）')
  }
  if (Array.isArray(value.records)) {
    lines.push('历史记录（' + value.records.length + ' 条）：')
    for (const item of value.records.slice(0, 20)) {
      lines.push('- ' + (item.id || '?') + ' ' + (item.status || '?') + ' ' + String(item.prompt || '').slice(0, 60) + (item.videoPath ? ' → ' + item.videoPath : ''))
    }
  }
  const enabledModels = Array.isArray(value.enabledModels) ? value.enabledModels : []
  if (enabledModels.length) {
    lines.push('中转站已选模型（请优先使用这些）：')
    for (const item of enabledModels) lines.push('- ' + item.id)
  }
  if (Array.isArray(value.models)) {
    lines.push(enabledModels.length ? '内置模型目录（仅作参数参考；中转站模式请用上面的已选模型）：' : '可用模型：')
    for (const model of value.models) lines.push('- ' + model.id + '（' + model.label + '）分辨率 ' + model.resolutions.join('/') + '，时长 ' + model.durations.join('-') + 's')
  }
  if (value.plan && value.plan.warnings && value.plan.warnings.length) {
    lines.push('再创作提示：' + value.plan.warnings.join('；'))
  }
  if (lines.length === 0) lines.push('Seedance 操作完成：' + (value.action || ''))
  blocks.push({ type: 'text', text: lines.join('\n') })
  // 尾帧预览：与官方 read_image 一致，用 durable attachment 引用生成 image content block
  if (value.previewImage && typeof value.previewImage === 'object' && typeof value.previewImage.attachmentId === 'string') {
    blocks.push({
      type: 'image',
      attachment: {
        attachmentId: value.previewImage.attachmentId,
        mediaType: value.previewImage.mediaType || 'image/jpeg',
        bytes: Number(value.previewImage.bytes) || 0,
        width: Number(value.previewImage.width) || 0,
        height: Number(value.previewImage.height) || 0,
        ...(typeof value.previewImage.name === 'string' ? { name: value.previewImage.name } : {})
      }
    })
  }
  return blocks
}

/**
 * 递归清理为 lossless JSON：去掉 undefined 字段、NaN/Infinity 转 null、
 * Date 转 ISO 字符串、BigInt 转字符串、二进制跳过、循环引用跳过。
 * DSH 工具输出要求可无损 JSON 往返，否则会报 "invalid output: value is not lossless JSON"。
 */
export function toLosslessJson(value, seen) {
  const visited = seen || new WeakSet()
  if (value === undefined) return undefined
  if (value === null) return null
  const type = typeof value
  if (type === 'string' || type === 'boolean') return value
  if (type === 'number') return Number.isFinite(value) ? value : null
  if (type === 'bigint') return value.toString()
  if (type === 'function' || type === 'symbol') return undefined
  if (type !== 'object') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(value))) return undefined
  if (visited.has(value)) return undefined
  visited.add(value)
  if (Array.isArray(value)) {
    return value.map((item) => {
      const clean = toLosslessJson(item, visited)
      return clean === undefined ? null : clean
    })
  }
  const out = {}
  for (const key of Object.keys(value)) {
    const clean = toLosslessJson(value[key], visited)
    if (clean !== undefined) out[key] = clean
  }
  return out
}

function rangeError(message) {
  const error = new Error(message)
  error.name = 'ValidationError'
  return error
}

function clampInt(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(min, Math.min(max, Math.floor(num)))
}

/**
 * 从工具参数构造 GenerateRequest（不含 sessionId）。
 * @param {object} args - 工具参数。
 * @param {Function} workspaceImages - async (paths) => dataURL[]。
 */
export async function buildGenerateInput(args, workspaceImages) {
  const params = {}
  if (args.resolution !== undefined) params.resolution = args.resolution
  if (args.ratio !== undefined) params.ratio = args.ratio
  if (args.duration !== undefined) params.duration = args.duration
  if (args.seed !== undefined) params.seed = args.seed
  if (args.generateAudio !== undefined) params.generateAudio = args.generateAudio
  if (args.watermark !== undefined) params.watermark = args.watermark
  if (args.returnLastFrame !== undefined) params.returnLastFrame = args.returnLastFrame

  const images = []
  const imageUrls = Array.isArray(args.imageUrls) ? args.imageUrls : []
  if (imageUrls.length > MAX_IMAGE_URLS) throw rangeError('imageUrls 最多 ' + MAX_IMAGE_URLS + ' 张')
  for (const url of imageUrls) {
    if (typeof url !== 'string' || !url.trim()) throw rangeError('imageUrls 中存在空链接')
    const value = url.trim()
    if (value.startsWith('data:')) {
      if (value.length > MAX_INLINE_IMAGE_CHARS) {
        throw rangeError('imageUrls 内联数据超过约 2MB 上限：请压缩图片，或把图片放进工作区用 workspaceImages 传路径')
      }
      images.push({ dataUrl: value })
    } else {
      images.push({ url: value })
    }
  }
  const workspacePaths = Array.isArray(args.workspaceImages) ? args.workspaceImages.filter((item) => typeof item === 'string' && item.trim()) : []
  if (workspacePaths.length > 0) {
    if (typeof workspaceImages !== 'function') throw rangeError('当前环境不支持 workspaceImages（缺少工作区读取能力），请改用 imageUrls')
    const dataUrls = await workspaceImages(workspacePaths)
    for (const dataUrl of dataUrls) images.push({ dataUrl })
  }

  const input = {}
  if (args.prompt !== undefined) input.prompt = args.prompt
  if (args.model !== undefined) input.model = args.model
  // 工具侧约定（见参数说明）：1 张=首帧（image2video），2 张=首尾帧；多张=全模态参考（不传 mode 时）。
  if (args.mode !== undefined) input.mode = args.mode
  else if (images.length === 2) input.mode = 'firstlast'
  if (Object.keys(params).length > 0) input.params = params
  const inputs = {}
  if (images.length > 0) inputs.images = images
  if (args.videoUrl) inputs.video = { url: args.videoUrl }
  if (Object.keys(inputs).length > 0) input.inputs = inputs
  return input
}

/** 构造单条记录摘要（history 用）。 */
export function summarizeRecord(record, paths = {}) {
  if (!record) return null
  return {
    id: record.id,
    status: record.status,
    progress: record.progress,
    prompt: record.prompt,
    model: record.model,
    mode: record.mode,
    provider: record.provider,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    durationSeconds: formatDuration(record),
    remoteVideoUrl: record.remoteVideoUrl || null,
    videoPath: paths.videoPath || null,
    lastFramePath: paths.lastFramePath || null,
    error: record.error || null,
    originId: record.originId || null
  }
}

/**
 * 创建 seedance_video 工具定义。
 *
 * @param {object} options
 * @param {Function} options.defineTool - @deepseek-ai/dsh-tools 的 defineTool。
 * @param {object} options.service - 宿主服务（见 index.js createHostService）。
 * @returns 工具定义（可直接 ctx.tools.register）。
 */
export function createSeedanceTool(options = {}) {
  const { defineTool, service } = options
  if (typeof defineTool !== 'function') throw new Error('createSeedanceTool 需要 defineTool')
  if (!service) throw new Error('createSeedanceTool 需要 service')

  function sessionIdOf(exec) {
    try {
      if (service.sessionId) return service.sessionId(exec) || 'default'
    } catch (error) {
      // 忽略：无 agent 会话时回落 default
    }
    return 'default'
  }

  function pathsOf(record) {
    try {
      return record && service.recordPaths ? service.recordPaths(record) : {}
    } catch (error) {
      return {}
    }
  }

  /**
   * 把记录落盘尾帧转成可持久化的图片附件引用（放进结果 value，与官方 read_image 一致：
   * 结果可回放渲染；失败静默忽略，不影响工具结果）。
   * @returns {{ attachmentId: string, mediaType: string, bytes: number, width: number, height: number, name?: string } | undefined}
   */
  async function previewFor(record, exec) {
    if (!record || !exec) return undefined
    try {
      const ref = service.attachmentForLastFrame ? await service.attachmentForLastFrame(record, exec) : null
      if (!ref || typeof ref !== 'object' || typeof ref.attachmentId !== 'string') return undefined
      const clean = { attachmentId: ref.attachmentId }
      clean.mediaType = typeof ref.mediaType === 'string' ? ref.mediaType : 'image/jpeg'
      clean.bytes = Number.isFinite(Number(ref.bytes)) ? Number(ref.bytes) : 0
      clean.width = Number.isFinite(Number(ref.width)) ? Number(ref.width) : 0
      clean.height = Number.isFinite(Number(ref.height)) ? Number(ref.height) : 0
      if (typeof ref.name === 'string') clean.name = ref.name
      return clean
    } catch (error) {
      return undefined
    }
  }

  function ok(action, extra) {
    return toLosslessJson({ ok: true, action, ...extra })
  }

  function failure(action, error) {
    // 错误码优先用 error.code（TaskError/ApiError 等自带），否则回退 error.name（ValidationError/ApiTimeoutError 等）
    const explicit = error && error.code ? String(error.code) : ''
    const name = error && error.name && error.name !== 'Error' ? String(error.name) : ''
    const code = explicit || name || 'ToolError'
    const message = error && error.message ? error.message : String(error)
    return toLosslessJson({ ok: false, action, message: message, error: { code, message } })
  }

  return defineTool({
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: buildParameters(),
    output: {
      schema: buildOutput().schema,
      render: renderToolResult
    },
    isConcurrencySafe: (args) => Boolean(args && (args.action === 'status' || args.action === 'history' || args.action === 'models')),
    async execute(args, exec) {
      const action = args && args.action
      try {
        if (TOOL_ACTIONS.indexOf(action) === -1) {
          throw rangeError('action 必须是 ' + TOOL_ACTIONS.join(' / '))
        }
        const sessionId = sessionIdOf(exec)
        if (action === 'models') {
          const models = await service.models()
          const enabled = models.defaults && Array.isArray(models.defaults.enabledModels) ? models.defaults.enabledModels : []
          const relayHint = enabled.length
            ? '；当前为中转站模式，已选模型：' + enabled.map((item) => item.id).join(' / ') + '（generate 时 model 留空即用默认 ' + models.defaults.defaultModel + '）'
            : ''
          return ok(action, {
            message: '共 ' + models.models.length + ' 个内置模型，默认 ' + models.defaults.defaultModel + relayHint,
            models: models.models,
            enabledModels: enabled,
            defaults: models.defaults,
            capabilities: models.capabilities
          })
        }
        if (action === 'generate') {
          const input = await buildGenerateInput(args, (paths) => service.workspaceImages(paths, exec))
          const record = await service.generate(sessionId, input, { toolCallId: exec && exec.callId })
          return ok(action, {
            message: '已创建视频生成任务（' + record.model + '/' + record.mode + '）。',
            hint: '用 action=wait 并传 taskId=' + record.id + ' 等待完成（插件内部轮询，不要自己写轮询代码；超时就再 wait 一次）。',
            taskId: record.id,
            status: record.status,
            progress: record.progress,
            model: record.model,
            mode: record.mode,
            provider: record.provider,
            demo: record.provider === 'demo',
            record
          })
        }
        if (action === 'status') {
          if (!args.taskId) throw rangeError('status 需要 taskId（sd_... 记录 id）')
          const record = await service.status(sessionId, args.taskId)
          const paths = pathsOf(record)
          const previewImage = await previewFor(record, exec)
          const downloadHint = record.status === 'succeeded' && !paths.videoPath
            ? '任务已成功，但本地视频尚未下载完成（网络/远端链接问题已自动重试）：可再调用 status 或 wait 一次自动补下载，或从 videoUrl 手动下载。'
            : undefined
          return ok(action, {
            hint: downloadHint,
            message: '任务当前状态：' + record.status,
            taskId: record.id,
            status: record.status,
            progress: record.progress,
            videoUrl: record.remoteVideoUrl || undefined,
            videoPath: paths.videoPath || undefined,
            lastFramePath: paths.lastFramePath || undefined,
            previewImage,
            record
          })
        }
        if (action === 'wait') {
          if (!args.taskId) throw rangeError('wait 需要 taskId（sd_... 记录 id）')
          const waitSeconds = clampInt(args.waitSeconds, 1, WAIT_SECONDS_MAX, WAIT_SECONDS_DEFAULT)
          const record = await service.wait(sessionId, args.taskId, { timeoutMs: waitSeconds * 1000, signal: exec && exec.signal })
          const paths = pathsOf(record)
          const previewImage = await previewFor(record, exec)
          const timedOut = Boolean(record && record.meta && record.meta.waitTimedOut)
          const downloadHint = !timedOut && record.status === 'succeeded' && !paths.videoPath
            ? '任务已成功，但本地视频尚未下载完成（已自动重试）：可再 wait 一次自动补下载，或从 videoUrl 手动下载。'
            : undefined
          return ok(action, {
            hint: timedOut ? '继续用 action=wait 并传同一个 taskId=' + record.id + ' 等待（插件内部轮询，不要自己写轮询代码）。' : downloadHint,
            message: timedOut
              ? '等待超时（' + waitSeconds + ' 秒），任务仍在进行中。'
              : '任务完成：' + record.status,
            taskId: record.id,
            status: record.status,
            progress: record.progress,
            videoUrl: record.remoteVideoUrl || undefined,
            videoPath: paths.videoPath || undefined,
            lastFramePath: paths.lastFramePath || undefined,
            usage: record.usage || (record.meta && record.meta.usage) || undefined,
            previewImage,
            record
          })
        }
        if (action === 'history') {
          const limit = clampInt(args.limit, 1, 100, 20)
          const records = await service.history(sessionId, { limit })
          const summaries = records.map((record) => summarizeRecord(record, pathsOf(record)))
          return ok(action, {
            message: '当前会话共 ' + records.length + ' 条历史记录。',
            records: summaries,
            total: summaries.length
          })
        }
        if (action === 'recreate') {
          if (!args.sourceId) throw rangeError('recreate 需要 sourceId（历史记录 id，sd_...）')
          const overrides = {}
          if (args.prompt !== undefined) overrides.prompt = args.prompt
          if (args.model !== undefined) overrides.model = args.model
          if (args.mode !== undefined) overrides.mode = args.mode
          const result = await service.recreate(sessionId, args.sourceId, overrides)
          const record = result.record
          return ok(action, {
            message: '已基于历史记录 ' + args.sourceId + ' 创建再创作任务（' + record.mode + '）。',
            hint: '用 action=wait 并传 taskId=' + record.id + ' 等待完成（插件内部轮询，不要自己写轮询代码）。',
            taskId: record.id,
            status: record.status,
            model: record.model,
            mode: record.mode,
            provider: record.provider,
            plan: result.plan,
            record
          })
        }
        if (action === 'cancel') {
          if (!args.taskId) throw rangeError('cancel 需要 taskId（sd_... 记录 id）')
          const record = await service.cancel(sessionId, args.taskId)
          return ok(action, {
            message: '任务已取消：' + record.id,
            taskId: record.id,
            status: record.status,
            record
          })
        }
        throw rangeError('未实现的 action：' + String(action))
      } catch (error) {
        return failure(action, error)
      }
    }
  })
}
