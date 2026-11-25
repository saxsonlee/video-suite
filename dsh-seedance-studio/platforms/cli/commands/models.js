/**
 * dsh-seedance-studio — CLI models 命令（列出模型目录与默认参数）。
 * @module dsh-seedance-studio/platforms/cli/commands/models
 */
import { createConsoleIo, printModels } from '../lib/render.js'

/** models 命令：列出模型目录 / 默认值 / 能力。 */
export async function runModels(ctx, options = {}, io = createConsoleIo()) {
  const data = await ctx.service.models()
  if (options.json) {
    io.out(JSON.stringify(data, null, 2))
    return data
  }
  io.out(printModels(data))
  return data
}
