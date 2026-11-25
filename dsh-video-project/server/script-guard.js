/**
 * dsh-video-project — 「禁止自己写脚本画分镜/草图」的行为闸门（纯逻辑，可测试）
 *
 * 分镜草图的设计约定：由视频项目插件调用用户在设置里选定的图像模型生成
 * （action=sketch，分镜先确认 + 用户同意费用），不允许智能体绕过插件、
 * 自己写 Python/JS 脚本用 PIL/绘图库把「分镜图/草图」画出来。
 *
 * 本模块只做「工具调用是否属于脚本绕行画图」的判断，供 plugin.js 注册到
 * tools/pre-execute 使用；不拦截正常的文字/表格/HTML 分镜排版。
 * @module dsh-video-project/server/script-guard
 */

/** 被视为「画分镜/草图」的意图词。 */
export const DRAW_WORDS = [
  '分镜', '草图', '线稿', 'storyboard', 'story-board', '分镜图', '分镜草图',
  '镜头草图', '画面草图', 'storyboard 草图'
]

/** 绘图库 / 绘图 API 关键词（命中才可能是「脚本画图」）。 */
export const DRAW_STACK_WORDS = [
  'PIL', 'Pillow', 'ImageDraw', 'ImageFont', 'matplotlib', 'pygame', 'cv2',
  'cairo', 'skia', 'drawImage', 'drawRect', 'drawRectangle', 'createElementNS',
  'getContext', 'canvas', 'svgwrite', 'svg.drawing', 'plotly', 'graphviz'
]

/** 可能承载脚本绘图的文件扩展名。 */
export const SCRIPT_FILE_EXTENSIONS = [
  '.py', '.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.html', '.htm', '.svg', '.bat', '.ps1', '.sh'
]

/** 可能执行脚本的工具名（不同会话里名字可能不同）。 */
export const SCRIPT_TOOL_NAMES = [
  'write', 'edit', 'pwsh', 'bash', 'shell', 'execute_command', 'execute_shell', 'terminal'
]

/** 文本里是否同时出现「画分镜意图」与「绘图库/绘图 API」。 */
export function looksLikeScriptDrawing(text) {
  const value = String(text === undefined || text === null ? '' : text)
  if (!value) return false
  const lower = value.toLowerCase()
  const hasIntent = DRAW_WORDS.some((word) => lower.includes(word.toLowerCase()))
  if (!hasIntent) return false
  return DRAW_STACK_WORDS.some((word) => lower.includes(word.toLowerCase()))
}

/** 把工具参数转成可扫描的纯文本。 */
export function argumentText(argumentsValue) {
  if (argumentsValue === undefined || argumentsValue === null) return ''
  if (typeof argumentsValue === 'string') return argumentsValue
  try {
    return JSON.stringify(argumentsValue)
  } catch (error) {
    return String(argumentsValue)
  }
}

/**
 * 判断一次工具调用是否属于「自己写脚本画分镜/草图」。
 * @param {{name?:string, arguments?:unknown, config?:unknown}} exec - 工具执行请求
 * @returns {{block:boolean, reason:string}}
 */
export function detectScriptDrawing(exec) {
  const toolName = exec && typeof exec.name === 'string' ? exec.name : ''
  if (!toolName || SCRIPT_TOOL_NAMES.indexOf(toolName) === -1) return { block: false, reason: '' }
  const text = argumentText(exec.arguments)
  if (!looksLikeScriptDrawing(text)) return { block: false, reason: '' }
  // write/edit：只有目标文件是脚本/页面时才拦（避免误伤纯文本分镜表）
  if (toolName === 'write' || toolName === 'edit') {
    let parsed = null
    try { parsed = typeof exec.arguments === 'string' ? JSON.parse(exec.arguments) : exec.arguments } catch (error) { parsed = null }
    const filePath = parsed && typeof parsed === 'object'
      ? String(parsed.file_path || parsed.path || parsed.target || '')
      : ''
    const lowerPath = filePath.toLowerCase()
    if (!lowerPath) return { block: false, reason: '' }
    const isScriptFile = SCRIPT_FILE_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))
    if (!isScriptFile) return { block: false, reason: '' }
    return {
      block: true,
      reason: '检测到「写脚本画分镜/草图」：' + filePath + '。分镜草图只能由视频项目插件调用用户选定的图像模型生成，不能自己写脚本画图。'
    }
  }
  // 命令类工具：命令文本里同时出现画分镜意图 + 绘图库 → 拦
  return {
    block: true,
    reason: '检测到「用命令/脚本画分镜/草图」。分镜草图只能由视频项目插件调用用户选定的图像模型生成（action=sketch，需分镜确认 + 用户同意），不能自己写脚本画图。'
  }
}

/** 拦截时返回给模型的说明。 */
export function buildScriptDrawingDenial(reason) {
  return '已拦截：' + (reason || '检测到自己写脚本画分镜草图')
    + '。正确做法：① 先有分镜（action=save-shots）并让用户确认（action=confirm-plan）；'
    + '② 需要草图时，问用户是否要画（说明费用），用户同意后调用 action=sketch（图像模型由用户在视频项目设置里选）；'
    + '③ 如果想要文字版分镜表/排版预览，可以直接用文字或 HTML 输出，但不要调用 PIL/matplotlib/canvas 等绘图库画分镜图。'
}
