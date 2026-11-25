/**
 * dsh-seedance-studio — tasks / 演示模式模拟器
 *
 * 本文件由 server/tasks.js 拆分而来；对外契约由 tasks/index.js 统一 re-export。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createVideoClient, isTerminalStatus, ApiError, ApiTimeoutError, downloadFile, describeApiError } from '../api/index.js'
import { normalizeGenerateRequest, buildArkPayload, getModel, MODES, ValidationError } from '../models/index.js'
import { createRecordId, isValidRecordId } from '../store/index.js'

/** demo 模拟器时间线（毫秒）。 */
export const DEMO_TIMELINE = { runningAtMs: 2000, halfAtMs: 6000, doneAtMs: 8000 }

/** demo 视频时长（秒）。 */
export const DEMO_DURATION_SECONDS = 5

/** demo 失败关键词（QA 用它验证失败态 UI；普通提示词不会触发）。 */
export const DEMO_FAIL_KEYWORDS = ['__seedance_demo_fail__', '演示失败']

/** 远端视频 URL 有效期（24h，超过则再创作改用本地尾帧）。 */
export const REMOTE_URL_TTL_MS = 24 * 60 * 60 * 1000

/** demo 任务 ID（可辨识，便于日志与测试）。 */
export function demoTaskId(recordId) {
  return 'demo-' + recordId
}

/**
 * 计算 demo 任务在某一时刻的状态（纯函数，便于测试）。
 * @param {number} createdAt - 记录创建时间戳（ms）。
 * @param {number} now - 当前时间戳（ms）。
 * @param {boolean} [shouldFail] - 是否命中失败关键词。
 * @returns {{ status: string, progress: number }}
 */
export function demoStateAt(createdAt, now, shouldFail = false) {
  const elapsed = Math.max(0, Number(now) - Number(createdAt))
  if (shouldFail) {
    if (elapsed < DEMO_TIMELINE.runningAtMs) return { status: 'queued', progress: 5 }
    if (elapsed < DEMO_TIMELINE.doneAtMs) return { status: 'running', progress: 30 }
    return { status: 'failed', progress: 100 }
  }
  if (elapsed < DEMO_TIMELINE.runningAtMs) return { status: 'queued', progress: 5 }
  if (elapsed < DEMO_TIMELINE.halfAtMs) return { status: 'running', progress: 30 }
  if (elapsed < DEMO_TIMELINE.doneAtMs) return { status: 'running', progress: 70 }
  return { status: 'succeeded', progress: 100 }
}

/** 默认 demo 素材路径（相对于包根）。 */
export function defaultDemoMedia(packageRoot) {
  return {
    videoPath: path.join(packageRoot, 'media', 'demo.mp4'),
    lastFramePath: path.join(packageRoot, 'media', 'demo-lastframe.jpg')
  }
}
