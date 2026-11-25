/**
 * dsh-video-project — 宿主 Cordis 插件入口（独立「视频项目 / 编导工作台」插件）。
 *
 * 只注册 video_project 工具，不注册 HTTP 路由、不调用视频模型：
 *   项目资料（人物卡/分镜/版本）落盘在 <DSH_HOME>/storages/video-project/projects/，
 *   视频生成由会话中的任意生成工具完成（本插件只做策划与分析，不绑定具体生成插件）。
 *
 * @module dsh-video-project
 */
import fs from 'node:fs'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createProjects, resolveProjectStorageRoot } from '../../server/projects.js'
import { createVideoProjectTool } from './tool.js'
import { createRoutes, describeRoutes } from '../../server/routes.js'
import { buildSketchDenial, evaluateSketchConfirmation, buildCharacterSheetDenial, evaluateCharacterSheetConfirmation, buildAreaSheetDenial, evaluateAreaSheetConfirmation } from '../../server/confirm.js'
import { buildPlanDenial, evaluateRequirePlanWithProjects } from '../../server/require-plan.js'
import { buildScriptDrawingDenial, detectScriptDrawing } from '../../server/script-guard.js'

/** Cordis 插件名。 */
export const name = 'video-project'
/** 依赖服务：tools（注册工具）。 */
export const inject = ['tools']

/** 解析工具调用参数（对象或 JSON 字符串）。 */
function parseToolArguments(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const value = JSON.parse(raw)
      return value && typeof value === 'object' ? value : {}
    } catch (error) {
      return {}
    }
  }
  return {}
}

/** 插件入口。 */
export function apply(ctx, config = {}) {
  const pluginConfig = config && typeof config === 'object' ? config : {}
  const appendBootLog = (text) => {
    try {
      fs.appendFileSync(path.join(storageRoot, 'boot.log'), new Date().toISOString() + ' ' + text + '\n', 'utf8')
    } catch (error) {
      // 探针日志失败不影响插件
    }
  }
  // 保存位置优先级：插件 config.storageRoot（profile patch）> 共享设置文件（seedance 设置页写入）> 默认目录
  const resolved = resolveProjectStorageRoot({ pluginConfig, env: process.env })
  const storageRoot = resolved.storageRoot
  const projectsRoot = resolved.projectsRoot

  const projects = createProjects({ root: projectsRoot })
  const tool = createVideoProjectTool({ defineTool, service: { projects } })
  const disposer = ctx.tools.register(tool)
  ctx.effect(() => () => {
    try {
      if (typeof disposer === 'function') disposer()
    } catch (error) {
      // 忽略卸载异常
    }
  }, 'video-project: tool dispose')

  // 草图费用确认闸门：画草图按次计费，必须由用户明确同意/主动要求。
  // 读会话最后一条真实用户消息，没有明确同意就不允许 action=sketch（不依赖审批弹窗）。
  const sketchConfirmEnabled = pluginConfig.confirmSketch !== false
    && process.env.DSH_VIDEO_PROJECT_SKETCH_CONFIRM !== '0'
    && process.env.DSH_VIDEO_PROJECT_SKETCH_CONFIRM !== 'false'
  if (sketchConfirmEnabled) {
    ctx.on('tools/pre-execute', (exec, next) => {
      try {
        if (!exec || exec.name !== 'video_project') return next()
        const args = parseToolArguments(exec.arguments)
        const action = args && typeof args === 'object' ? args.action : undefined
        if (action === 'sketch') {
          const verdict = evaluateSketchConfirmation(exec.agent)
          if (verdict.allow) return next()
          appendBootLog('sketch blocked by confirm gate: ' + verdict.reason)
          return {
            kind: 'deny',
            reason: buildSketchDenial(verdict.reason),
            displayReason: { zh: '画草图需要用户确认', en: 'Storyboard sketch requires user confirmation' }
          }
        }
        if (action === 'character-sheet') {
          const verdict = evaluateCharacterSheetConfirmation(exec.agent)
          if (verdict.allow) return next()
          appendBootLog('character-sheet blocked by confirm gate: ' + verdict.reason)
          return {
            kind: 'deny',
            reason: buildCharacterSheetDenial(verdict.reason),
            displayReason: { zh: '生成人物三视图需要用户确认', en: 'Character sheet generation requires user confirmation' }
          }
        }
        if (action === 'area-sheet') {
          const verdict = evaluateAreaSheetConfirmation(exec.agent)
          if (verdict.allow) return next()
          appendBootLog('area-sheet blocked by confirm gate: ' + verdict.reason)
          return {
            kind: 'deny',
            reason: buildAreaSheetDenial(verdict.reason),
            displayReason: { zh: '生成区域设定图需要用户确认', en: 'Area sheet generation requires user confirmation' }
          }
        }
        return next()
      } catch (error) {
        appendBootLog('sketch confirm gate error (allow): ' + (error instanceof Error ? error.message : String(error)))
        return next()
      }
    })
    appendBootLog('sketch confirm gate registered')
  }

  // 禁止「自己写脚本画分镜/草图」的绕行闸门：分镜草图必须由本插件调用户选定的图像模型生成。
  // 只拦截「画分镜意图 + 绘图库/绘图 API」同时出现且目标为脚本/页面的 write/edit 或命令类工具；
  // 纯文字/表格/HTML 分镜排版不受影响。
  const scriptDrawingGuardEnabled = pluginConfig.blockScriptDrawing !== false
    && process.env.DSH_VIDEO_PROJECT_BLOCK_SCRIPT_DRAW !== '0'
    && process.env.DSH_VIDEO_PROJECT_BLOCK_SCRIPT_DRAW !== 'false'
  if (scriptDrawingGuardEnabled) {
    ctx.on('tools/pre-execute', (exec, next) => {
      try {
        const verdict = detectScriptDrawing(exec)
        if (!verdict.block) return next()
        appendBootLog('script drawing blocked (' + (exec && exec.name) + '): ' + verdict.reason)
        return {
          kind: 'deny',
          reason: buildScriptDrawingDenial(verdict.reason),
          displayReason: { zh: '画分镜草图请用视频项目插件', en: 'Use the video project sketch action instead of drawing scripts' }
        }
      } catch (error) {
        appendBootLog('script drawing guard error (allow): ' + (error instanceof Error ? error.message : String(error)))
        return next()
      }
    })
    appendBootLog('script drawing guard registered')
  }

  // 「视频生成优先走编导流程」闸门：本插件存在时，本会话尚未调用 video_project 就 generate → 拦截引导。
  // 与生成插件解耦：只拦截 seedance_video 这个工具名（未安装生成插件时该工具不存在，闸门无影响）；
  // 用户明确说「跳过项目/直接生成」时放行；可用 DSH_VIDEO_PROJECT_REQUIRE_PLAN=0 关闭。
  const requirePlanEnabled = pluginConfig.requirePlan !== false
    && process.env.DSH_VIDEO_PROJECT_REQUIRE_PLAN !== '0'
    && process.env.DSH_VIDEO_PROJECT_REQUIRE_PLAN !== 'false'
  if (requirePlanEnabled) {
    ctx.on('tools/pre-execute', async (exec, next) => {
      try {
        const verdict = await evaluateRequirePlanWithProjects(exec, projects)
        if (!verdict.block) return next()
        appendBootLog('require-plan blocked: ' + verdict.reason)
        return {
          kind: 'deny',
          reason: buildPlanDenial(verdict.reason),
          displayReason: { zh: '视频任务请优先走视频项目', en: 'Use the video project workflow first' }
        }
      } catch (error) {
        appendBootLog('require-plan guard error (allow): ' + (error instanceof Error ? error.message : String(error)))
        return next()
      }
    })
    appendBootLog('require-plan gate registered')
  }

  // 注册 /api/video-project/* 设置路由（草图分镜设置面板用；connection 服务存在时）
  try {
    if (ctx.inject) {
      ctx.inject(['connection'], (connCtx) => {
        try {
          const routes = createRoutes({ projects })
          for (const route of routes) connCtx.connection.fetch.register(route)
          appendBootLog('routes registered (' + routes.length + '): ' + describeRoutes(routes))
        } catch (error) {
          appendBootLog('routes registration error: ' + (error instanceof Error ? error.message : String(error)))
        }
      })
    }
  } catch (error) {
    // connection 不可用时设置面板不可用，但工具/配置文件仍然可用
  }

  try {
    fs.mkdirSync(storageRoot, { recursive: true })
    fs.appendFileSync(path.join(storageRoot, 'boot.log'), new Date().toISOString() + ' video-project plugin loaded; storageRoot=' + storageRoot + ' source=' + resolved.source + ' projects=' + projectsRoot + '\n', 'utf8')
  } catch (error) {
    // 探针日志失败不影响插件
  }
}
