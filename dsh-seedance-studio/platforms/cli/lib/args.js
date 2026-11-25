/**
 * dsh-seedance-studio — CLI 参数解析（零第三方依赖）。
 *
 * 支持子命令 + 位置参数、值选项（--prompt/-p）、布尔选项（--json/--wait）、
 * 否定选项（--no-wait）、可重复选项（--image a --image b）。
 * 错误消息走 lib/i18n.js（支持 --lang）。
 * @module dsh-seedance-studio/platforms/cli/lib/args
 */
import { t } from './i18n.js'

/** 参数错误（退出码 2）。 */
export class UsageError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}

/** 值选项：`--name value` / `-n value`。 */
const VALUE_OPTIONS = {
  prompt: 'prompt', p: 'prompt',
  model: 'model',
  mode: 'mode',
  duration: 'duration', d: 'duration',
  ratio: 'ratio',
  resolution: 'resolution', r: 'resolution',
  seed: 'seed',
  'first-frame': 'firstFrame',
  'last-frame': 'lastFrame',
  image: 'image',
  video: 'video',
  session: 'session', s: 'session',
  storage: 'storage',
  limit: 'limit',
  'wait-seconds': 'waitSeconds',
  'task-id': 'taskId',
  lang: 'lang'
}

/** 布尔选项：直接置 true。 */
const BOOL_OPTIONS = {
  demo: 'demo',
  json: 'json',
  wait: 'wait',
  verbose: 'verbose',
  'generate-audio': 'generateAudio',
  watermark: 'watermark',
  'return-last-frame': 'returnLastFrame',
  help: 'help', h: 'help',
  version: 'version', v: 'version'
}

/** 否定选项：`--no-xxx` → 目标字段 false。 */
const NEGATED_OPTIONS = {
  'no-wait': 'wait',
  'no-color': 'color',
  'no-generate-audio': 'generateAudio',
  'no-watermark': 'watermark',
  'no-last-frame': 'returnLastFrame'
}

/** 把值写入 options；重复出现的选项收集为数组。 */
function setValue(options, key, value) {
  if (!(key in options)) {
    options[key] = value
    return
  }
  if (Array.isArray(options[key])) {
    options[key].push(value)
    return
  }
  options[key] = [options[key], value]
}

/** 解析命令行参数。 */
export function parseArgs(argv) {
  const positionals = []
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (token.startsWith('--')) {
      let name = token.slice(2)
      let inlineValue
      const eq = name.indexOf('=')
      if (eq !== -1) {
        inlineValue = name.slice(eq + 1)
        name = name.slice(0, eq)
      }
      if (name in VALUE_OPTIONS) {
        let value = inlineValue
        if (value === undefined) {
          i += 1
          if (i >= argv.length) throw new UsageError(t('args.missingValue', { name: name }))
          value = argv[i]
        }
        setValue(options, VALUE_OPTIONS[name], value)
        continue
      }
      if (name in BOOL_OPTIONS) {
        if (inlineValue !== undefined) throw new UsageError(t('args.boolNoValue', { option: '--' + name }))
        options[BOOL_OPTIONS[name]] = true
        continue
      }
      if (name in NEGATED_OPTIONS) {
        if (inlineValue !== undefined) throw new UsageError(t('args.boolNoValue', { option: '--' + name }))
        options[NEGATED_OPTIONS[name]] = false
        continue
      }
      throw new UsageError(t('args.unknownOption', { option: '--' + name }))
    }
    if (token.startsWith('-') && token.length > 1 && token !== '-') {
      const name = token.slice(1)
      if (name in VALUE_OPTIONS) {
        i += 1
        if (i >= argv.length) throw new UsageError(t('args.missingValue', { name: name }))
        setValue(options, VALUE_OPTIONS[name], argv[i])
        continue
      }
      if (name in BOOL_OPTIONS) {
        options[BOOL_OPTIONS[name]] = true
        continue
      }
      throw new UsageError(t('args.unknownOption', { option: '-' + name }))
    }
    positionals.push(token)
  }
  return {
    command: positionals.length > 0 ? positionals[0] : '',
    positionals: positionals.slice(1),
    options
  }
}
