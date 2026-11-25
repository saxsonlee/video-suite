/**
 * dsh-seedance-studio — 生成前用户确认闸门（纯逻辑，可测试）
 *
 * 视频生成按次计费：每次 generate/recreate 前读取会话里最后一条真实用户消息，
 * 必须包含明确的确认词（可以/生成/按这个来…）且不含「先给我看/别生成」这类拒绝词，
 * 才允许调用；否则 pre-execute 返回 deny，提示智能体先给方案、等用户确认。
 *
 * 不是依赖审批弹窗（部分会话把审批策略设为 never，弹窗会被自动拒绝），而是硬性检查
 * 用户最近一句话——用户没开口确认，就一定生成不了。
 * @module dsh-seedance-studio/server/confirm
 */

/** 视为「用户已明确同意生成」的肯定词。 */
export const CONFIRM_WORDS = [
  '可以', '行吧', '好的', '没问题', '确认', '生成', '开始', '按这个', '就这么',
  '同意', '来吧', '做吧', '冲吧', 'OK', 'ok', '可以了', '开搞', '动手吧'
]

/** 明确表示「先不要生成/先给方案」的短语：命中即拦截（优先于肯定词）。 */
export const REJECT_PHRASES = [
  '不要生成', '别生成', '先别', '先不要', '先给我', '先看', '先出方案', '先给方案',
  '让我看', '慢着', '停下', '不准', '不要动', '等一下', '等等', '先别提'
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

/** 一句话是否是「明确同意生成」。 */
export function isConfirmationMessage(text) {
  const value = String(text === undefined || text === null ? '' : text).trim()
  if (!value) return false
  for (const phrase of REJECT_PHRASES) if (value.includes(phrase)) return false
  for (const word of CONFIRM_WORDS) if (value.includes(word)) return true
  return false
}

/**
 * 判断是否允许本次生成。
 * @param {object} agent - exec.agent
 * @returns {{allow:boolean,reason:string,text:string}}
 */
export function evaluateGenerateConfirmation(agent) {
  const message = latestUserMessage(agent)
  if (!message) return { allow: false, reason: '会话里没有找到用户消息', text: '' }
  const text = textOfContent(message.data && message.data.content)
  if (!text.trim()) return { allow: false, reason: '最后一条用户消息没有文字，无法判断是否确认', text: '' }
  if (!isConfirmationMessage(text)) return { allow: false, reason: '最后一条用户消息没有明确确认生成', text }
  return { allow: true, reason: '', text }
}

/** 拦截时返回给模型的说明（会作为工具错误文本展示）。 */
export function buildConfirmDenial(detail) {
  const extra = detail ? '（' + detail + '）' : ''
  return '已拦截：视频生成会产生费用，必须先得到用户明确确认' + extra + '。'
    + '请先向用户展示本次方案：① 这是新生成还是修改（修改要逐条列出改动点、为什么改）；'
    + '② 提示词要点 / 分镜 / 关键参数；然后等用户明确回复「可以 / 生成 / 按这个来」再调用 generate/recreate。'
    + '在用户确认之前不要重复尝试生成；只读操作（status / wait / history / models）不受影响。'
}
