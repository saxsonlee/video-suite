/**
 * dsh-seedance-studio — 宿主 Cordis 插件入口。
 *
 * 本文件是唯一 import DSH 运行时（@deepseek-ai/dsh-tools）的地方，其余 server 模块都是
 * 纯 Node 逻辑（可被 node --test 直接加载）。DSH 加载器按包内依赖解析该 import。
 *
 * 装配顺序：
 *   settings（配置/demo 判定）→ store（持久化）→ tasks（任务管理/恢复）
 *   → service（工具与路由共用的数据层）
 *   → tool（seedance_video 注册到 ctx.tools）→ routes（/api/seedance/* 注册到 connection.fetch）
 *
 * 生命周期：
 *   - 所有副作用都挂在当前插件 fiber 的 effect 上，卸载时自动清理；
 *   - tasks 的轮询定时器在 dispose 时 stop()。
 * @module dsh-seedance-studio
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createSettingsManager, defaultStorageRoot } from '../../server/settings/index.js'
import { createStore } from '../../server/store/index.js'
import { createTaskManager, buildRecreatePlan, defaultDemoMedia } from '../../server/tasks/index.js'
import { createSeedanceTool } from './tool.js'
import { createRoutes, describeRoutes } from '../../server/routes/index.js'
import { createHostService } from '../../server/service.js'
import { buildConfirmDenial, evaluateGenerateConfirmation } from '../../server/confirm.js'

/** Cordis 插件名。 */
export const name = 'seedance-studio'
/** 依赖服务：tools（注册工具）。connection 用动态 inject，便于无 Web 载体时降级。 */
export const inject = ['tools']

/** 包根目录（platforms/dsh-plugin/plugin.js → 包根）。 */
function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
}

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

/** 读取布尔开关：settings.json 的 DEBUG、config.debug 或环境变量 DSH_SEEDANCE_DEBUG=1。 */
function debugEnabled(config, env, settingsDebug) {
  if (settingsDebug === true) return true
  if (config && (config.debug === true || config.debug === '1' || config.debug === 'true')) return true
  const flag = env && env.DSH_SEEDANCE_DEBUG
  return flag === '1' || flag === 'true'
}

/**
 * Cordis 插件入口。
 * @param {object} ctx - Cordis Context。
 * @param {object} [config] - cordis.patch.yml 传入的插件 config（也参与设置优先级）。
 */
export function apply(ctx, config = {}) {
  const pluginConfig = config && typeof config === 'object' ? config : {}
  const root = typeof pluginConfig.storageRoot === 'string' && pluginConfig.storageRoot
    ? path.resolve(pluginConfig.storageRoot)
    : defaultStorageRoot(process.env)
  const bootLog = (text) => {
    try {
      fs.mkdirSync(root, { recursive: true })
      fs.appendFileSync(path.join(root, 'boot.log'), new Date().toISOString() + ' ' + text + '\n', 'utf8')
    } catch (error) {
      // 探针日志失败不影响插件
    }
  }
  const log = (level, message) => {
    try {
      const logger = ctx.logger
      if (logger && typeof logger[level] === 'function') logger[level]('seedance: ' + message)
    } catch (error) {
      // logger 不可用时忽略
    }
  }

  bootLog('host plugin apply start, config=' + JSON.stringify(pluginConfig))

  // ---- 1) 配置 / 存储 / 任务管理器 ----
  const settings = createSettingsManager({ storageRoot: root, env: process.env, pluginConfig })
  const store = createStore({ root, logger: log })
  store.init()
  const tasks = createTaskManager({
    store,
    getConfig: () => settings.getConfig(),
    demoMedia: defaultDemoMedia(packageRoot()),
    logger: log
  })
  const service = createHostService({ ctx, config: pluginConfig, store, settings, tasks })

  // 启动时探测「视频编辑 + 图像生成」能力并写入共享能力文件（供 video-project 等协作插件读取；失败不影响启动）
  Promise.resolve()
    .then(() => service.refreshCapabilities())
    .then((capability) => {
      const snapshot = capability && capability.snapshot ? capability.snapshot : null
      bootLog('capabilities: videoEdit=' + JSON.stringify(snapshot ? snapshot.videoEdit : null)
        + ' imageGeneration=' + JSON.stringify(snapshot ? snapshot.imageGeneration : null)
        + (capability && capability.ok === false ? ' (write failed: ' + capability.error + ')' : ''))
    })
    .catch((error) => {
      bootLog('capabilities probe failed: ' + (error instanceof Error ? error.message : String(error)))
    })

  // ---- 2) 注册 seedance_video 工具 ----
  const tool = createSeedanceTool({ defineTool, service })
  const toolDisposer = ctx.tools.register(tool)
  ctx.effect(() => () => {
    try {
      if (typeof toolDisposer === 'function') toolDisposer()
    } catch (error) {
      // 忽略卸载异常
    }
  }, 'seedance: tool dispose')
  bootLog('tool registered: ' + tool.name)

  // 生成前确认闸门：视频生成按次计费。读会话最后一条真实用户消息，没有明确确认（可以/生成/按这个来…）
  // 就不允许 generate/recreate——不依赖审批弹窗（部分会话审批策略为 never，弹窗会被自动拒绝）。
  const confirmGateEnabled = pluginConfig.confirmGenerate !== false
    && process.env.DSH_SEEDANCE_CONFIRM !== '0'
    && process.env.DSH_SEEDANCE_CONFIRM !== 'false'
  if (confirmGateEnabled) {
    ctx.on('tools/pre-execute', (exec, next) => {
      try {
        if (!exec || exec.name !== 'seedance_video') return next()
        const args = parseToolArguments(exec.arguments)
        const action = args && typeof args === 'object' ? args.action : undefined
        if (action !== 'generate' && action !== 'recreate') return next()
        const verdict = evaluateGenerateConfirmation(exec.agent)
        if (verdict.allow) return next()
        bootLog('generate blocked by confirm gate: ' + verdict.reason)
        return {
          kind: 'deny',
          reason: buildConfirmDenial(verdict.reason),
          displayReason: { zh: '视频生成需要用户确认', en: 'Video generation requires user confirmation' }
        }
      } catch (error) {
        bootLog('confirm gate error (allow): ' + (error instanceof Error ? error.message : String(error)))
        return next()
      }
    })
    bootLog('confirm gate registered')
  }

  // ---- 3) 注册 /api/seedance/* 路由（connection 服务存在时） ----
  try {
    if (ctx.inject) {
      // 与官方插件一致：fetch.register 内部用 owner Context 的 effect 绑定生命周期，
      // 插件卸载/重载时路由自动注销，无需再包一层 ctx.effect。
      ctx.inject(['connection'], (connCtx) => {
        const routes = createRoutes(service)
        for (const route of routes) connCtx.connection.fetch.register(route)
        bootLog('routes registered (' + routes.length + '): ' + describeRoutes(routes))
      })
    } else {
      bootLog('ctx.inject unavailable, routes not registered')
    }
  } catch (error) {
    bootLog('routes registration failed: ' + (error && error.message ? error.message : String(error)))
    log('error', '路由注册失败：' + (error && error.message ? error.message : String(error)))
  }

  // ---- 4) 调试开关：把带 token 的浏览器访问 URL 写进 boot.log（默认关闭） ----
  if (debugEnabled(pluginConfig, process.env, settings.getConfig().debug) && ctx.inject) {
    try {
      ctx.inject(['connection', 'webServer'], (debugCtx) => {
        try {
          const connection = debugCtx.connection
          const webServer = debugCtx.webServer
          let origin
          if (webServer && typeof webServer.getOrigin === 'function') origin = webServer.getOrigin()
          else if (webServer && webServer.port) origin = 'http://127.0.0.1:' + webServer.port
          const url = connection && typeof connection.authenticatedUrl === 'function' ? connection.authenticatedUrl(origin) : origin
          bootLog('debug authenticated url: ' + String(url))
        } catch (error) {
          bootLog('debug url failed: ' + (error && error.message ? error.message : String(error)))
        }
      })
    } catch (error) {
      bootLog('debug inject failed: ' + (error && error.message ? error.message : String(error)))
    }
  }

  // ---- 5) 恢复未完成任务 + 卸载清理 ----
  let recovered = 0
  try {
    recovered = tasks.start()
  } catch (error) {
    bootLog('task recovery failed: ' + (error && error.message ? error.message : String(error)))
  }
  bootLog('task recovery: ' + recovered + ' pending task(s) resumed; storage=' + root)
  ctx.effect(() => () => {
    try {
      tasks.stop()
    } catch (error) {
      // 忽略卸载异常
    }
  }, 'seedance: task manager stop')

  log('info', '插件已加载：' + (settings.getConfig().demo ? '演示模式' : 'provider=' + settings.getConfig().provider) + '，存储目录 ' + root + '，恢复 ' + recovered + ' 个未完成任务')
  bootLog('host plugin apply done')
}

/**
 * 供外部（测试/诊断）构建独立实例，不依赖 DSH ctx。
 * 注意：正常 DSH 加载走 apply；此工厂主要给单测与本地脚本使用。
 */
export function createStandaloneHost(options = {}) {
  const root = options.storageRoot || defaultStorageRoot(options.env || process.env)
  const settings = createSettingsManager({ storageRoot: root, env: options.env || process.env, pluginConfig: options.pluginConfig || {} })
  const store = createStore({ root, logger: options.logger })
  store.init()
  const tasks = createTaskManager({
    store,
    getConfig: () => settings.getConfig(),
    demoMedia: defaultDemoMedia(packageRoot()),
    logger: options.logger,
    now: options.now,
    createClient: options.createClient,
    downloadImpl: options.downloadImpl,
    autoPoll: options.autoPoll
  })
  return { root, settings, store, tasks, replayPlan: buildRecreatePlan }
}
