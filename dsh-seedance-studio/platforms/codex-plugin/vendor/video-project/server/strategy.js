/**
 * dsh-video-project — 同一镜头的调整策略
 *
 * 三种策略（与视频生成能力解耦）：
 * - local-edit：用当前视频做局部修改（需要模型支持「编辑视频」，由能力配置决定）；
 * - regenerate：完全丢弃当前视频，整条重新生成（最可控、最贵）；
 * - keep-frames：保留前段已认可的帧，从某一秒之后重新生成（衔接需检查）。
 *
 * 判断依据：验收 6 栏不通过项 + 当前编辑能力 + 用户对话/抽帧给出的保留点。
 * @module dsh-video-project/server/strategy
 */

/** 核心栏：不通过就整条重做（角色/构图/运镜/景别/衔接类）。 */
export const CORE_CHECK_KEYS = ['shotType', 'action', 'movement', 'characters', 'continuity', 'composition']
/** 次要栏：只影响局部（台词/字幕/时长/场景/光线类）。 */
export const MINOR_CHECK_KEYS = ['dialogue', 'duration', 'scene', 'lighting']

function asText(value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

function isCoreKey(key) {
  const value = asText(key)
  if (value.startsWith('character:')) return true
  return CORE_CHECK_KEYS.indexOf(value) !== -1
}

function labelOf(checks, key) {
  const item = checks.find((check) => check && check.key === key)
  return item && item.label ? item.label : key
}

/** 归一化策略记录（写版本/验收时用）。 */
export function normalizeStrategy(raw) {
  if (!raw || typeof raw !== 'object') return null
  const type = asText(raw.type)
  if (['local-edit', 'regenerate', 'keep-frames'].indexOf(type) === -1) return null
  const keepUntil = Number(raw.keepUntil)
  return {
    type,
    keepUntil: Number.isFinite(keepUntil) && keepUntil > 0 ? Math.round(keepUntil * 10) / 10 : 0,
    reason: asText(raw.reason),
    estimatedGenerations: Number(raw.estimatedGenerations) > 0 ? Math.round(Number(raw.estimatedGenerations)) : 1
  }
}

/** 从抽帧索引估算「保留到第几秒」：问题帧之前的内容视为可用。 */
export function estimateKeepUntil(options = {}) {
  const shot = options.shot && typeof options.shot === 'object' ? options.shot : {}
  const duration = Number(shot.duration) || 0
  const frameCount = Math.max(1, Math.round(Number(options.frameCount) || 1))
  const frameIndex = Math.min(frameCount - 1, Math.max(0, Math.round(Number(options.frameIndex) || 0)))
  if (duration <= 0) return 0
  const value = ((frameIndex + 1) / frameCount) * duration
  return Math.max(0.1, Math.round(value * 10) / 10)
}

/** 从用户对话里提取「保留到第 X 秒」（如用户说「前 3 秒都行」）。 */
export function parseKeepUntilFromFeedback(feedback) {
  const text = asText(feedback)
  if (!text) return null
  const match = text.match(/(\d+(?:\.\d+)?)\s*秒/)
  if (!match) return null
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

/**
 * 生成调整策略建议。
 * @param {object} options - checks（验收栏）、shot（分镜）、capability（编辑能力）、feedback（用户原话）、frameIndex/frameCount（抽帧定位）。
 * @returns {{type:string,keepUntil:number,reason:string,estimatedGenerations:number,available:boolean,failedKeys:string[]}}
 */
export function buildStrategy(options = {}) {
  const checks = Array.isArray(options.checks) ? options.checks.filter((item) => item && typeof item === 'object') : []
  const shot = options.shot && typeof options.shot === 'object' ? options.shot : {}
  const capability = options.capability && typeof options.capability === 'object' ? options.capability : { capable: false }
  if (!checks.length) {
    return { type: 'unknown', keepUntil: 0, reason: '还没有验收栏数据：先逐栏验收（review）或抽帧分析（analyze）后再判断', estimatedGenerations: 0, available: true, failedKeys: [] }
  }
  const failed = checks.filter((check) => check.pass !== true)
  if (!failed.length) {
    return { type: 'approved', keepUntil: 0, reason: '验收全部通过，不需要调整', estimatedGenerations: 0, available: true, failedKeys: [] }
  }
  const failedKeys = failed.map((check) => asText(check.key) || 'unknown')
  const coreFailed = failedKeys.filter(isCoreKey)
  const minorOnly = failedKeys.every((key) => isCoreKey(key) === false)
  const feedbackKeep = parseKeepUntilFromFeedback(options.feedback)
  const frameKeep = options.frameIndex !== undefined ? estimateKeepUntil({ shot, frameIndex: options.frameIndex, frameCount: options.frameCount }) : null
  const durationHalf = Math.round(((Number(shot.duration) || 0) / 2) * 10) / 10
  const keepUntil = feedbackKeep !== null ? feedbackKeep : (frameKeep !== null ? frameKeep : durationHalf)
  const labels = failedKeys.map((key) => labelOf(checks, key)).join('、')

  if (coreFailed.length) {
    return {
      type: 'regenerate',
      keepUntil: 0,
      reason: '核心栏不通过（' + coreFailed.map((key) => labelOf(checks, key)).join('、') + '）：角色/构图/运镜/景别/衔接问题整条重做最可控',
      estimatedGenerations: 1,
      available: true,
      failedKeys
    }
  }
  if (capability && capability.capable && minorOnly) {
    return {
      type: 'local-edit',
      keepUntil: 0,
      reason: '只有局部问题（' + labels + '），且当前模型支持编辑视频：用当前视频局部修改最省',
      estimatedGenerations: 1,
      available: true,
      failedKeys
    }
  }
  return {
    type: 'keep-frames',
    keepUntil,
    reason: '前段可用、仅' + labels + '不通过：保留前 ' + keepUntil + ' 秒，从该点之后重新生成',
    estimatedGenerations: 1,
    available: true,
    failedKeys
  }
}

/** 策略的下一步操作提示（工具输出用）。 */
export function strategyHint(strategy) {
  if (!strategy || typeof strategy !== 'object') return ''
  if (strategy.type === 'approved') return '不需要调整，可 save-version 锁定版本。'
  if (strategy.type === 'regenerate') return '先跟用户确认「整条重做」方案（要改什么），确认后重新生成；不要直接重抽。'
  if (strategy.type === 'local-edit') return '先跟用户确认「局部改」方案（改哪一块、保留整条），确认后用编辑视频模式生成；若模型不支持再做整条重做。'
  if (strategy.type === 'keep-frames') return '先跟用户确认「保留前 ' + (strategy.keepUntil || 0) + ' 秒、之后重新生成」方案，确认后截取认可帧作为首帧续写。'
  return strategy.reason || ''
}
