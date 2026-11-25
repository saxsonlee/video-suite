/**
 * dsh-seedance-studio — CLI 交互式 TUI（终端菜单 + 生成向导）。
 *
 * 零依赖实现：readline 逐题问答 + ANSI 渲染，不占用备用屏幕（保持终端可回滚）。
 * 仅 TTY 环境可用；非 TTY 请走子命令（--help 查看）。文案走 lib/i18n.js。
 * @module dsh-seedance-studio/platforms/cli/lib/tui
 */
import readline from 'node:readline'
import { t } from './i18n.js'
import { bold, createConsoleIo, dim, red, yellow } from './render.js'
import { runGenerate } from '../commands/generate.js'
import { runHistory } from '../commands/history.js'
import { runModels } from '../commands/models.js'
import { runStatus } from '../commands/status.js'
import { runWait } from '../commands/wait.js'

/** 读取一行。 */
function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve))
}

/** 显示启动横幅。 */
function printBanner(ctx) {
  const mode = ctx.config.demo ? t('tui.demoMode') : t('tui.providerMode', { provider: ctx.config.provider })
  console.log('')
  console.log(bold(t('tui.banner')))
  console.log(dim(t('tui.storage', { root: ctx.root })))
  console.log(dim(t('tui.session', { session: ctx.session, mode: mode })))
}

/** 显示运行配置。 */
function printConfig(ctx) {
  const config = ctx.config
  console.log('')
  console.log(bold(t('tui.configTitle')))
  console.log('  ' + t('tui.configStorage') + '    ' + ctx.root)
  console.log('  ' + t('tui.configSession') + '    ' + ctx.session)
  console.log('  ' + t('tui.configProvider') + '    ' + (config.demo ? t('tui.configDemoProvider') : config.provider))
  if (config.demo && config.demoReason) console.log('  ' + t('tui.configDemoReason') + '    ' + config.demoReason)
  console.log('  ' + t('tui.configModel') + '    ' + config.defaultModel)
  console.log('  ' + t('tui.configSettings') + '    ' + ctx.root + '/settings.json')
  console.log('  ' + t('tui.configSessions') + '    ' + ctx.root + '/sessions/')
  console.log('  ' + t('tui.configMedia') + '    ' + ctx.root + '/media/')
}

/** 生成向导。 */
async function generateWizard(ctx, rl, io) {
  const prompt = (await ask(rl, t('tui.wizardPrompt'))).trim()
  if (!prompt) {
    console.log(red(t('tui.wizardPromptEmpty')))
    return
  }
  const data = await ctx.service.models()
  console.log('')
  console.log(bold(t('tui.modelsTitle', { default: data.defaults.defaultModel })))
  data.models.forEach((model, index) => {
    console.log(dim(t('tui.modelLine', {
      index: String(index + 1).padStart(2, ' '),
      id: model.id,
      durations: (model.durations || []).join('/'),
      resolutions: (model.resolutions || []).join('/')
    })))
  })
  const modelChoice = (await ask(rl, t('tui.modelChoice'))).trim()
  const chosen = modelChoice ? data.models[Number(modelChoice) - 1] : undefined
  if (modelChoice && !chosen) {
    console.log(red(t('tui.invalidModel')))
    return
  }
  const durationRaw = (await ask(rl, t('tui.duration', { default: data.defaults.defaultDuration }))).trim()
  const ratioRaw = (await ask(rl, t('tui.ratio', { default: data.defaults.defaultRatio }))).trim()
  const resolutionRaw = (await ask(rl, t('tui.resolution', { default: data.defaults.defaultResolution }))).trim()
  const waitRaw = (await ask(rl, t('tui.waitAsk'))).trim().toLowerCase()

  const options = { prompt: prompt, wait: waitRaw !== 'n', waitSeconds: 180 }
  if (chosen) options.model = chosen.id
  if (durationRaw) options.duration = durationRaw
  if (ratioRaw) options.ratio = ratioRaw
  if (resolutionRaw) options.resolution = resolutionRaw
  console.log('')
  try {
    await runGenerate(ctx, options, io)
  } catch (error) {
    console.log(red(t('tui.generateFailed', { message: error && error.message ? error.message : String(error) })))
  }
}

/** 查看/等待任务。 */
async function taskWizard(ctx, rl, io) {
  const taskId = (await ask(rl, t('tui.taskId'))).trim()
  if (!taskId) return
  try {
    await runStatus(ctx, taskId, {}, io)
    const waitRaw = (await ask(rl, t('tui.waitConfirm'))).trim().toLowerCase()
    if (waitRaw === 'y') await runWait(ctx, taskId, { waitSeconds: 180 }, io)
  } catch (error) {
    console.log(red(t('tui.queryFailed', { message: error && error.message ? error.message : String(error) })))
  }
}

/** 启动交互式 TUI。 */
export async function runTui(ctx) {
  if (!process.stdin.isTTY) throw new Error(t('tui.needTty'))
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const io = createConsoleIo()
  try {
    printBanner(ctx)
    let exit = false
    while (!exit) {
      console.log('')
      console.log(bold(t('tui.menuTitle')))
      console.log(t('tui.menu1'))
      console.log(t('tui.menu2'))
      console.log(t('tui.menu3'))
      const choice = (await ask(rl, t('tui.choose'))).trim()
      switch (choice) {
        case '1':
          await generateWizard(ctx, rl, io)
          break
        case '2':
          await runHistory(ctx, {}, io)
          break
        case '3':
          await taskWizard(ctx, rl, io)
          break
        case '4':
          await runModels(ctx, {}, io)
          break
        case '5':
          printConfig(ctx)
          break
        case '0':
        case 'q':
        case 'Q':
          exit = true
          console.log(dim(t('tui.bye')))
          break
        default:
          console.log(yellow(t('tui.invalid')))
      }
    }
  } finally {
    rl.close()
  }
}
