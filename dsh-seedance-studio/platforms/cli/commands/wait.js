/**
 * dsh-seedance-studio — CLI wait 命令与等待辅助。
 * @module dsh-seedance-studio/platforms/cli/commands/wait
 */
import { UsageError } from '../lib/args.js'
import { t } from '../lib/i18n.js'
import { bold, createConsoleIo, dim, printRecord, statusLabel, yellow } from '../lib/render.js'

/** 终态状态集合。 */
export const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled', 'expired'])

/** 是否终态。 */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 轮询等待任务进入终态。 */
export async function waitForTask(ctx, taskId, options = {}) {
  const timeoutMs = typeof options.timeoutMs === 'number' && options.timeoutMs > 0 ? options.timeoutMs : 120000
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {}
  const startedAt = Date.now()
  let record = await ctx.service.status(ctx.session, taskId)
  while (!isTerminalStatus(record.status)) {
    if (Date.now() - startedAt >= timeoutMs) return { record, timedOut: true }
    onProgress(record)
    await sleep(1000)
    record = await ctx.service.status(ctx.session, taskId)
  }
  return { record, timedOut: false }
}

/** wait 命令：等待任务完成并展示详情。 */
export async function runWait(ctx, taskId, options = {}, io = createConsoleIo()) {
  if (!taskId) throw new UsageError(t('wait.needId'))
  const seconds = options.waitSeconds ? Number(options.waitSeconds) : 120
  const { record, timedOut } = await waitForTask(ctx, taskId, {
    timeoutMs: (Number.isFinite(seconds) && seconds > 0 ? seconds : 120) * 1000,
    onProgress: (current) => io.progress(current)
  })
  io.clearLine()
  const paths = ctx.service.recordPaths(record)
  if (options.json) {
    io.out(JSON.stringify({ record, paths, timedOut }, null, 2))
    return { record, timedOut }
  }
  if (record.status === 'succeeded') {
    io.out(bold(t('wait.completed', { status: statusLabel(record.status) })) + dim(t('wait.completedNote')))
  } else if (timedOut) {
    io.out(yellow(t('wait.timeout')))
  } else {
    io.out(bold(t('wait.finished', { status: statusLabel(record.status) })))
  }
  io.out(printRecord(record, paths))
  return { record, timedOut }
}
