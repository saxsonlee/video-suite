/**
 * dsh-seedance-studio — CLI cancel 命令（取消排队中的任务）。
 * @module dsh-seedance-studio/platforms/cli/commands/cancel
 */
import { UsageError } from '../lib/args.js'
import { t } from '../lib/i18n.js'
import { createConsoleIo, green, statusLabel } from '../lib/render.js'

/** cancel 命令：取消排队中的任务（演示模式可随时取消）。 */
export async function runCancel(ctx, taskId, options = {}, io = createConsoleIo()) {
  if (!taskId) throw new UsageError(t('cancel.needId'))
  const record = await ctx.service.cancel(ctx.session, taskId)
  if (options.json) {
    io.out(JSON.stringify(record, null, 2))
    return record
  }
  io.out(green(t('cancel.done', { id: record.id, status: statusLabel(record.status) })))
  return record
}
