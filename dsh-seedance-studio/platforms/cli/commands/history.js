/**
 * dsh-seedance-studio — CLI history 命令（按会话列出历史记录）。
 * @module dsh-seedance-studio/platforms/cli/commands/history
 */
import { t } from '../lib/i18n.js'
import { createConsoleIo, dim, printHistory } from '../lib/render.js'

/** history 命令：列出当前会话的历史记录（新 → 旧）。 */
export async function runHistory(ctx, options = {}, io = createConsoleIo()) {
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 20))
  const records = await ctx.service.history(ctx.session, { limit })
  if (options.json) {
    const enriched = records.map((record) => ({ ...record, ...ctx.service.recordPaths(record) }))
    io.out(JSON.stringify({ session: ctx.session, total: enriched.length, records: enriched }, null, 2))
    return records
  }
  if (!records.length) {
    io.out(dim(t('render.historyEmpty', { session: ctx.session })))
    return records
  }
  io.out(printHistory(records, ctx.session))
  return records
}
