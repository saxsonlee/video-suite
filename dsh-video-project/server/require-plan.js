/**
 * dsh-video-project — 视频生成的「优先走编导流程」闸门（纯逻辑，可测试）
 *
 * 设计目标（与插件独立性不冲突）：
 *   - dsh-video-project 与 dsh-seedance-studio 互相独立、可单独安装；
 *   - 当「视频项目」已安装时，视频生成默认优先走编导流程：
 *     本会话如果还没调用过 video_project（create / save-* / build-prompt 等），
 *     则拦截生成工具的 generate，要求先建项目/保存人物卡分镜；
 *   - 用户明确说「跳过项目 / 直接生成 / 不用项目」时放行（一次会话内继续放行）；
 *   - 可用环境变量 DSH_VIDEO_PROJECT_REQUIRE_PLAN=0 关闭该闸门。
 *
 * 闸门只在本插件存在时生效；没有安装视频项目插件时，生成插件完全不受影响。
 * @module dsh-video-project/server/require-plan
 */
import { latestUserMessage, textOfContent } from './confirm.js'

/** 视为「用户明确跳过项目、要求直接生成」的短语。 */
export const SKIP_PLAN_PHRASES = [
  '跳过项目', '不用项目', '不建项目', '不建项目', '直接生成', '直接出', '快速生成',
  '别管项目', '不管项目', '不用编导', '跳过编导', '不用分镜', '直接做'
]

/** 生成类动作：会真正产生视频/图片，需要优先走项目流程。 */
export const GENERATE_ACTIONS = ['generate']

/** 从会话事件里找本会话是否调用过 video_project（任意一次即可）。 */
export function hasVideoProjectCall(agent) {
  const session = agent && agent.session
  if (!session || typeof session.snapshotEvents !== 'function') return false
  let events = []
  try { events = session.snapshotEvents() } catch (error) { return null }
  if (!Array.isArray(events)) return null
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (!event || (event.type !== 'tool/call' && event.type !== 'tool/result')) continue
    const data = event.data || {}
    const name = data.name || data.toolName || (data.tool && (data.tool.name || data.tool))
    if (name === 'video_project') return true
  }
  return false
}

/** 最后一条用户消息是否明确表示「跳过项目、直接生成」。 */
export function userWantsSkipPlan(agent) {
  const message = latestUserMessage(agent)
  if (!message) return false
  const text = textOfContent(message.data && message.data.content)
  if (!text.trim()) return false
  for (const phrase of SKIP_PLAN_PHRASES) if (text.includes(phrase)) return true
  return false
}

/**
 * 判断一次生成工具调用是否被「优先走项目」闸门拦截。
 * @param {object} exec - tools/pre-execute 的 exec（含 name/arguments/agent）
 * @returns {{block:boolean, reason:string}}
 */
export function evaluateRequirePlan(exec) {
  try {
    if (!exec || exec.name !== 'seedance_video') return { block: false, reason: '' }
    const raw = exec.arguments
    let args = raw
    if (typeof raw === 'string') {
      try { args = JSON.parse(raw) } catch (error) { args = {} }
    }
    if (!args || typeof args !== 'object') return { block: false, reason: '' }
    const action = String(args.action || '')
    if (GENERATE_ACTIONS.indexOf(action) === -1) return { block: false, reason: '' }
    const called = hasVideoProjectCall(exec.agent)
    if (called === true) return { block: false, reason: '' }
    if (called === null) return { block: false, reason: '' }
    if (userWantsSkipPlan(exec.agent)) return { block: false, reason: '' }
    return {
      block: true,
      reason: '本会话还没有走视频项目（编导工作台）流程'
    }
  } catch (error) {
    // 闸门自身异常时放行，避免误伤
    return { block: false, reason: '' }
  }
}


/**
 * 异步版「优先走项目」判定：以项目状态为准（而不是会话事件）。
 * 原因：agent 通过 run_code 内层调用工具时不会记入会话事件，事件校验会误判。
 * 规则：本会话生成前，只要存储里存在「已确认（planConfirmed=true）」的项目就放行；
 *      用户明确说跳过项目也放行；无法读取项目状态时放行（不误伤）。
 * @param {object} exec - tools/pre-execute 的 exec
 * @param {object} projects - createProjects 实例（listProjects/getProject）
 * @returns {Promise<{block:boolean,reason:string}>}
 */
export async function evaluateRequirePlanWithProjects(exec, projects) {
  try {
    if (!exec || exec.name !== 'seedance_video') return { block: false, reason: '' }
    const raw = exec.arguments
    let args = raw
    if (typeof raw === 'string') {
      try { args = JSON.parse(raw) } catch (error) { args = {} }
    }
    if (!args || typeof args !== 'object') return { block: false, reason: '' }
    const action = String(args.action || '')
    if (GENERATE_ACTIONS.indexOf(action) === -1) return { block: false, reason: '' }
    if (userWantsSkipPlan(exec.agent)) return { block: false, reason: '' }
    // 会话事件里有 video_project 调用也算（兼容部分运行环境）
    if (hasVideoProjectCall(exec.agent) === true) return { block: false, reason: '' }
    if (!projects || typeof projects.listProjects !== 'function') return { block: false, reason: '' }
    let list = null
    try { list = await projects.listProjects() } catch (error) { return { block: false, reason: '' } }
    if (!Array.isArray(list)) return { block: false, reason: '' }
    let hasConfirmed = false
    for (const item of list.slice(0, 5)) {
      try {
        const project = await projects.getProject(item.name)
        if (project && project.planConfirmed === true) { hasConfirmed = true; break }
      } catch (error) { /* 单个项目损坏不影响判断 */ }
    }
    if (hasConfirmed) return { block: false, reason: '' }
    return { block: true, reason: '还没有「已确认（confirm-plan）」的视频项目' }
  } catch (error) {
    return { block: false, reason: '' }
  }
}

/** 拦截时返回给模型的说明（工具错误文本）。 */
export function buildPlanDenial(detail) {
  const extra = detail ? '（' + detail + '）' : ''
  return '已拦截：已安装「视频项目」插件，视频任务默认优先走编导流程' + extra + '。'
    + '请先用 video_project：create 建项目 → save-characters（人物卡/形象变体）→ save-areas/save-acts（区域/幕）→ save-shots（分镜）→ 给用户确认后 confirm-plan → build-prompt（拿到 prompt/params），再调用生成工具。'
    + '如果用户明确要求跳过项目、直接生成，请让用户说「跳过项目/直接生成」，本次生成会放行。'
    + '只读操作（list/get/build-prompt/review 等）不受此闸门影响。'
}
