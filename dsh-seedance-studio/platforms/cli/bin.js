#!/usr/bin/env node
/**
 * dsh-seedance-studio — CLI 入口（bin: dsh-seedance-cli）。
 *
 * 两种用法：
 *   dsh-seedance-cli                交互式 TUI（主菜单 + 生成向导）
 *   dsh-seedance-cli <命令> [选项]   命令行模式（脚本/自动化友好，支持 --json）
 *
 * 复用 server/* 数据层（settings/store/tasks/service），存储默认与插件/Web 形态共享：
 *   $DSH_HOME/storages/seedance-studio/{sessions,media,settings.json}
 * 界面语言：--lang zh|en > LC_ALL/LC_MESSAGES/LANG > 默认中文（语言包在 locale/{zh,en}.js）。
 * @module dsh-seedance-studio/platforms/cli
 */
import { pathToFileURL } from 'node:url'
import { parseArgs, UsageError } from './lib/args.js'
import { detectLanguage, setLanguage, t } from './lib/i18n.js'
import { createCliContext } from './lib/context.js'
import { bold, configureRender, createConsoleIo, dim, red } from './lib/render.js'
import { runTui } from './lib/tui.js'
import { runGenerate } from './commands/generate.js'
import { runHistory } from './commands/history.js'
import { runModels } from './commands/models.js'
import { runStatus } from './commands/status.js'
import { runWait } from './commands/wait.js'
import { runCancel } from './commands/cancel.js'

/** CLI 版本（与包版本对齐）。 */
export const VERSION = '0.1.0'

/** 命令表：命令名 + 描述 key。 */
const COMMANDS = [
  ['generate', 'help.cmd.generate'],
  ['status', 'help.cmd.status'],
  ['wait', 'help.cmd.wait'],
  ['history', 'help.cmd.history'],
  ['models', 'help.cmd.models'],
  ['cancel', 'help.cmd.cancel'],
  ['tui', 'help.cmd.tui']
]

/** 选项表：flag 文本（语言无关）+ 描述 key。 */
const OPTIONS = [
  ['  -p, --prompt <text>', 'help.opt.prompt'],
  ['      --model <id>', 'help.opt.model'],
  ['      --mode <mode>', 'help.opt.mode'],
  ['  -r, --resolution <value>', 'help.opt.resolution'],
  ['      --ratio <ratio>', 'help.opt.ratio'],
  ['  -d, --duration <seconds>', 'help.opt.duration'],
  ['      --seed <int>', 'help.opt.seed'],
  ['      --first-frame <path|url>', 'help.opt.firstFrame'],
  ['      --last-frame <path|url>', 'help.opt.lastFrame'],
  ['      --image <path|url>', 'help.opt.image'],
  ['      --video <url>', 'help.opt.video'],
  ['      --wait-seconds <seconds>', 'help.opt.waitSeconds'],
  ['      --no-wait', 'help.opt.noWait'],
  ['  -s, --session <id>', 'help.opt.session'],
  ['      --storage <dir>', 'help.opt.storage'],
  ['      --demo', 'help.opt.demo'],
  ['      --json', 'help.opt.json'],
  ['      --lang <zh|en>', 'help.opt.lang'],
  ['      --no-color', 'help.opt.noColor'],
  ['  -h, --help', 'help.opt.help'],
  ['  -v, --version', 'help.opt.version']
]

/** 构建帮助文本（按当前语言）。 */
export function buildHelp() {
  const lines = [t('help.title'), '', t('help.usageTitle'), t('help.usage1'), t('help.usage2'), '', t('help.commandsTitle')]
  for (const [name, descriptionKey] of COMMANDS) {
    lines.push(t('help.command', { name: name, description: t(descriptionKey) }))
  }
  lines.push('', t('help.optionsTitle'))
  for (const [flag, descriptionKey] of OPTIONS) {
    lines.push(t('help.option', { flag: flag, description: t(descriptionKey) }))
  }
  lines.push('', t('help.examplesTitle'))
  for (let index = 1; index <= 6; index += 1) {
    lines.push(t('help.example', { command: t('help.example' + index) }))
  }
  lines.push('', t('help.footer'))
  return lines.join('\n')
}

/** 在解析前快速读取 --lang（保证参数错误也用正确语言）。 */
function fastLanguage(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--lang') return argv[i + 1]
    if (argv[i].startsWith('--lang=')) return argv[i].slice(7)
  }
  return undefined
}

/**
 * CLI 主入口。
 * @param {string[]} argv - process.argv.slice(2)。
 * @returns {Promise<number>} 退出码。
 */
export async function main(argv = process.argv.slice(2)) {
  setLanguage(detectLanguage({ lang: fastLanguage(argv) }))
  const parsed = parseArgs(argv)
  const options = parsed.options
  configureRender({ color: !options.noColor })
  if (options.help || parsed.command === 'help') {
    console.log(buildHelp())
    return 0
  }
  if (options.version) {
    console.log(t('cli.version', { version: VERSION }))
    return 0
  }
  const command = parsed.command
  const knownCommands = COMMANDS.map((item) => item[0])
  if (command && knownCommands.indexOf(command) === -1) {
    throw new UsageError(t('err.unknownCommand', { command: command, commands: knownCommands.join(' / ') }))
  }
  const context = createCliContext({
    storageRoot: options.storage,
    env: process.env,
    demo: options.demo,
    session: options.session,
    verbose: options.verbose
  })
  const io = createConsoleIo()
  try {
    if (!command || command === 'tui') {
      await runTui(context, options)
      return 0
    }
    const taskId = parsed.positionals[0] || options.taskId
    if (command === 'generate') {
      await runGenerate(context, options, io)
    } else if (command === 'status') {
      await runStatus(context, taskId, options, io)
    } else if (command === 'wait') {
      await runWait(context, taskId, options, io)
    } else if (command === 'history') {
      await runHistory(context, options, io)
    } else if (command === 'models') {
      await runModels(context, options, io)
    } else if (command === 'cancel') {
      await runCancel(context, taskId, options, io)
    }
    return 0
  } finally {
    context.close()
  }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) {
  main().then((code) => {
    process.exitCode = code
  }).catch((error) => {
    if (error instanceof UsageError) {
      console.error(red(t('err.argument', { message: error.message })))
      console.error(dim(t('err.usageHint')))
      process.exitCode = 2
    } else {
      console.error(red(t('err.failed', { message: error && error.message ? error.message : String(error) })))
      if (process.env.DSH_SEEDANCE_DEBUG) console.error(error)
      process.exitCode = 1
    }
  })
}
