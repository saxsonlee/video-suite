/**
 * dsh-seedance-studio — CLI 上下文装配。
 *
 * 与 DSH 插件 / Web 形态复用同一套 server/* 数据层：
 *   settings（配置/demo 判定）→ store（持久化）→ tasks（任务管理）→ service（数据层）。
 * CLI 没有 DSH 运行时能力（工作区/附件），对应能力静默降级。
 * @module dsh-seedance-studio/platforms/cli/lib/context
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSettingsManager, defaultStorageRoot } from '../../../server/settings/index.js'
import { createStore } from '../../../server/store/index.js'
import { createTaskManager, defaultDemoMedia } from '../../../server/tasks/index.js'
import { createHostService } from '../../../server/service.js'

/** 包根目录（platforms/cli/lib/context.js → 包根）。 */
export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
}

/** CLI 默认会话 ID（与工具在无 agent 会话时的回落一致）。 */
export const DEFAULT_SESSION = 'default'

/**
 * 创建 CLI 上下文。
 * @param {object} [options]
 * @param {string} [options.storageRoot] - 自定义存储目录（默认 $DSH_HOME/storages/seedance-studio）。
 * @param {object} [options.env] - 环境变量（默认 process.env）。
 * @param {boolean} [options.demo] - 强制演示模式。
 * @param {string} [options.session] - 会话 ID（默认 default）。
 * @param {boolean} [options.verbose] - 输出调试日志到 stderr。
 */
export function createCliContext(options = {}) {
  const env = options.env || process.env
  const session = typeof options.session === 'string' && options.session.trim() ? options.session.trim() : DEFAULT_SESSION
  const root = typeof options.storageRoot === 'string' && options.storageRoot.trim()
    ? path.resolve(options.storageRoot.trim())
    : defaultStorageRoot(env)
  const pluginConfig = options.demo ? { provider: 'demo' } : {}
  const logger = options.verbose
    ? (level, message) => process.stderr.write('[seedance:' + level + '] ' + message + '\n')
    : () => {}
  const settings = createSettingsManager({ storageRoot: root, env, pluginConfig })
  const store = createStore({ root, logger })
  store.init()
  const tasks = createTaskManager({
    store,
    getConfig: () => settings.getConfig(),
    demoMedia: defaultDemoMedia(packageRoot()),
    logger
  })
  const service = createHostService({ ctx: { get: () => undefined }, config: pluginConfig, store, settings, tasks })
  // 恢复上次未完成任务的后台轮询（demo 任务会在本次 CLI 运行期间继续推进）。
  tasks.start()
  return {
    root,
    session,
    settings,
    store,
    tasks,
    service,
    config: settings.getConfig(),
    close() {
      try {
        tasks.stop()
      } catch (error) {
        // 忽略停止异常
      }
    }
  }
}
