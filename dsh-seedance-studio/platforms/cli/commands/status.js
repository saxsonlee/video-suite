/**
 * dsh-seedance-studio — CLI status 命令。
 * @module dsh-seedance-studio/platforms/cli/commands/status
 */
import { UsageError } from '../lib/args.js'
import { t } from '../lib/i18n.js'
import { createConsoleIo, printRecord } from '../lib/render.js'

/** status 命令：查看单条任务详情。 */
export async function runStatus(ctx, taskId, options = {}, io = createConsoleIo()) {
  if (!taskId) throw new UsageError(t('status.needId'))
  const record = await ctx.service.status(ctx.session, taskId)
  const paths = ctx.service.recordPaths(record)
  if (options.json) {
    io.out(JSON.stringify({ record, paths }, null, 2))
    return record
  }
  io.out(printRecord(record, paths))
  return record
}
