/**
 * dsh-video-project — 草图分镜的「用户确认」闸门（纯逻辑，可测试）
 *
 * 画草图按次计费：每次 action=sketch 前读取会话里最后一条真实用户消息，
 * 必须是用户主动要求画图（「画一下镜头 3 的草图」「出个草图看看」），
 * 或明确确认（「可以」「好」「来吧」）；否则 pre-execute 返回 deny，
 * 要求智能体先把「要画哪个镜头、黑白线稿、只确认机位/景别、大概费用」告诉用户，
 * 等用户确认后再画。不依赖审批弹窗。
 * @module dsh-video-project/server/confirm
 */

/** 视为「用户同意画草图 / 主动要求画图」的肯定词。 */
export const SKETCH_CONFIRM_WORDS = [
  '可以', '行', '好', '没问题', '确认', '同意', '画', '草图', '出图', '来个图', '来一张',
  '来吧', '开始', '做吧', 'OK', 'ok', '要得', '行吧', '都行', '按这个',
  '生成', '参考图', '分镜图', '线稿', '构图', '出草图'
]

/** 明确表示「先别画/先给方案」的短语：命中即拦截（优先于肯定词）。 */
export const SKETCH_REJECT_PHRASES = [
  '先别', '先不要', '不要画', '别画', '等等', '等一下', '慢着', '先给我', '先看',
  '先出方案', '先给方案', '让我看', '不准', '不要动', '先别提'
]

/** 把消息 content（字符串或 content block 数组）转成纯文本。 */
export function textOfContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join(' ')
}

/** 最后一条「真实用户消息」：排除 runtime-context / agent-instructions 等系统注入。 */
export function latestUserMessage(agent) {
  const session = agent && agent.session
  if (!session || typeof session.snapshotEvents !== 'function') return null
  let events = []
  try { events = session.snapshotEvents() } catch (error) { return null }
  if (!Array.isArray(events)) return null
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (!event || event.type !== 'user/message') continue
    const source = event.data && event.data.source
    if (!source || source.kind !== 'user') continue
    return event
  }
  return null
}

/** 一句话是否表达「同意画草图 / 要求画图」。 */
export function isSketchConfirmationMessage(text) {
  const value = String(text === undefined || text === null ? '' : text).trim()
  if (!value) return false
  for (const phrase of SKETCH_REJECT_PHRASES) if (value.includes(phrase)) return false
  for (const word of SKETCH_CONFIRM_WORDS) if (value.includes(word)) return true
  return false
}

/**
 * 判断是否允许本次画草图。
 * @param {object} agent - exec.agent
 * @returns {{allow:boolean,reason:string,text:string}}
 */
export function evaluateSketchConfirmation(agent) {
  const message = latestUserMessage(agent)
  if (!message) return { allow: false, reason: '会话里没有找到用户消息', text: '' }
  const text = textOfContent(message.data && message.data.content)
  if (!text.trim()) return { allow: false, reason: '最后一条用户消息没有文字，无法判断是否同意画草图', text: '' }
  if (!isSketchConfirmationMessage(text)) return { allow: false, reason: '最后一条用户消息没有明确同意画草图', text }
  return { allow: true, reason: '', text }
}

/** 拦截时返回给模型的说明（会作为工具错误文本展示）。 */
export function buildSketchDenial(detail) {
  const extra = detail ? '（' + detail + '）' : ''
  return '已拦截：画草图会按次产生费用，必须先得到用户明确确认' + extra + '。'
    + '请先告诉用户：① 要画哪个镜头（镜号 + 景别/机位）；② 输出是黑白线稿/分镜参考图（用于确认相机位置和景别，也可作为生成参考图），不参与视频生成；'
    + '③ 预计张数（一般就 1 张）和大致费用。等用户明确回复「可以 / 画 / 来吧」再调用 action=sketch。'
    + '在用户确认之前不要重复尝试画图；只读操作（get / list / build-prompt 等）不受影响。'
}


/** 人物三视图确认词：用户说「生成/出图/画」或直接提到三视图即视为明确要求。 */
export const CHARACTER_SHEET_CONFIRM_WORDS = [
  '三视图', '正视图', '侧视图', '背面图', '设定图', '人物图', '角色图',
  '生成', '出图', '画', '可以', '行', '好', '没问题', '确认', '同意',
  '来吧', '开始', '做吧', '出吧', '生成吧', 'OK', 'ok', '要得', '行吧', '都行', '按这个'
]

/** 人物三视图拒绝短语（命中即不生成）。 */
export const CHARACTER_SHEET_REJECT_PHRASES = [
  '先别', '先不要', '不要生成', '别生成', '不要画', '别画', '等等', '等一下', '慢着',
  '先给我', '先看', '先出方案', '先给方案', '让我看', '不准', '不要动', '先别提'
]

/** 一句话是否表达「生成人物三视图」。 */
export function isCharacterSheetConfirmationMessage(text) {
  const value = String(text === undefined || text === null ? '' : text).trim()
  if (!value) return false
  for (const phrase of CHARACTER_SHEET_REJECT_PHRASES) if (value.includes(phrase)) return false
  for (const word of CHARACTER_SHEET_CONFIRM_WORDS) if (value.includes(word)) return true
  return false
}

/**
 * 判断是否允许本次生成人物三视图。
 * @param {object} agent - exec.agent
 * @returns {{allow:boolean,reason:string,text:string}}
 */
export function evaluateCharacterSheetConfirmation(agent) {
  const message = latestUserMessage(agent)
  if (!message) return { allow: false, reason: '会话里没有找到用户消息', text: '' }
  const text = textOfContent(message.data && message.data.content)
  if (!text.trim()) return { allow: false, reason: '最后一条用户消息没有文字，无法判断是否要求生成三视图', text: '' }
  if (!isCharacterSheetConfirmationMessage(text)) return { allow: false, reason: '最后一条用户消息没有明确要求生成人物三视图', text }
  return { allow: true, reason: '', text }
}

/** 人物三视图拦截时的说明（与草图区分）。 */
export function buildCharacterSheetDenial(detail) {
  const extra = detail ? '（' + detail + '）' : ''
  return '已拦截：生成人物三视图会按次产生费用，必须先得到用户明确确认' + extra + '。'
    + '请先告诉用户：① 要生成哪个人物（以及哪套形象）；② 输出是人物正/侧/背并排的彩图设定图（不是分镜草图）；'
    + '③ 预计张数与大致费用。等用户明确回复「可以 / 生成 / 出图 / 三视图」后再调用 action=character-sheet。'
    + '注意：如果设置里已勾选「人物三视图自动出图」，保存人物卡（save-characters）时会自动生成，不需要手动调用本动作。'
    + '在用户确认之前不要重复尝试；只读操作（get / list / build-prompt 等）不受影响。'
}


/** 区域/场地出图确认词：用户说「生成/出图/画」或直接提到区域/场地/场景/地图即视为明确要求。 */
export const AREA_SHEET_CONFIRM_WORDS = [
  '场地', '区域', '场景', '地图', '场景图', '场地设定', '区域设定',
  '生成', '出图', '画', '可以', '行', '好', '没问题', '确认', '同意',
  '来吧', '开始', '做吧', '出吧', '生成吧', 'OK', 'ok', '要得', '行吧', '都行', '按这个'
]

/** 区域/场地出图拒绝短语。 */
export const AREA_SHEET_REJECT_PHRASES = [
  '先别', '先不要', '不要生成', '别生成', '不要画', '别画', '等等', '等一下', '慢着',
  '先给我', '先看', '先出方案', '先给方案', '让我看', '不准', '不要动', '先别提'
]

/** 一句话是否表达「生成区域/场地设定图」。 */
export function isAreaSheetConfirmationMessage(text) {
  const value = String(text === undefined || text === null ? '' : text).trim()
  if (!value) return false
  for (const phrase of AREA_SHEET_REJECT_PHRASES) if (value.includes(phrase)) return false
  for (const word of AREA_SHEET_CONFIRM_WORDS) if (value.includes(word)) return true
  return false
}

/** 判断是否允许本次生成区域/场地设定图。 */
export function evaluateAreaSheetConfirmation(agent) {
  const message = latestUserMessage(agent)
  if (!message) return { allow: false, reason: '会话里没有找到用户消息', text: '' }
  const text = textOfContent(message.data && message.data.content)
  if (!text.trim()) return { allow: false, reason: '最后一条用户消息没有文字，无法判断是否要求生成区域图', text: '' }
  if (!isAreaSheetConfirmationMessage(text)) return { allow: false, reason: '最后一条用户消息没有明确要求生成区域/场地设定图', text }
  return { allow: true, reason: '', text }
}

/** 区域出图拦截说明。 */
export function buildAreaSheetDenial(detail) {
  const extra = detail ? '（' + detail + '）' : ''
  return '已拦截：生成区域/场地设定图会按次产生费用，必须先得到用户明确确认' + extra + '。'
    + '请先告诉用户：① 要生成哪个区域/场地；② 输出是一张场景概念图（体现空间布局/标志物/光线/贯穿道具，用于统一多镜头）；'
    + '③ 预计张数与大致费用。等用户明确回复「可以 / 生成 / 出图 / 场地」后再调用 action=area-sheet。'
    + '注意：如果设置里已勾选「区域/场地自动出图」，保存区域设定（save-areas）时会自动生成，不需要手动调用。'
    + '在用户确认之前不要重复尝试；只读操作不受影响。'
}
