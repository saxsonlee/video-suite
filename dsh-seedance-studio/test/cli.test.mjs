/**
 * CLI（platforms/cli）单测与集成测试：
 * i18n（语言检测/切换/语言包完整性）、参数解析、终端渲染、上下文装配、
 * 生成命令、进程级冒烟（--json 输出、--lang、退出码）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseArgs, UsageError } from '../platforms/cli/lib/args.js'
import {
  dictionaryKeys, detectLanguage, getLanguage, setLanguage, t
} from '../platforms/cli/lib/i18n.js'
import {
  statusLabel, statusBadge, progressBar, displayWidth, truncate, table, formatTime, printRecord
} from '../platforms/cli/lib/render.js'
import { createCliContext } from '../platforms/cli/lib/context.js'
import { buildGenerateInput, runGenerate } from '../platforms/cli/commands/generate.js'
import { runStatus } from '../platforms/cli/commands/status.js'
import { runHistory } from '../platforms/cli/commands/history.js'
import { runModels } from '../platforms/cli/commands/models.js'
import { runCancel } from '../platforms/cli/commands/cancel.js'
import { MODELS } from '../server/models/index.js'

/** 模型目录条目数（加模型时测试自动跟随，不用改断言）。 */
const MODEL_COUNT = MODELS.length

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BIN = path.join(PACKAGE_ROOT, 'platforms', 'cli', 'bin.js')
const exec = promisify(execFile)

function makeStorage() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-cli-'))
}

function makeIo() {
  const lines = []
  return { lines, out: (text) => lines.push(String(text)), progress: () => {}, clearLine: () => {} }
}

function cliEnv() {
  return {
    ...process.env,
    LANG: 'zh_CN.UTF-8',
    LC_ALL: '',
    ARK_API_KEY: '',
    RELAY_API_KEY: '',
    RELAY_BASE_URL: '',
    TEMP: os.tmpdir(),
    TMP: os.tmpdir()
  }
}

async function runBin(args, options = {}) {
  try {
    const result = await exec(process.execPath, [BIN].concat(args), {
      cwd: PACKAGE_ROOT,
      env: cliEnv(),
      timeout: options.timeout || 60000,
      maxBuffer: 10 * 1024 * 1024
    })
    return { code: 0, stdout: String(result.stdout), stderr: String(result.stderr) }
  } catch (error) {
    return { code: error.code, stdout: String(error.stdout || ''), stderr: String(error.stderr || '') }
  }
}

test('i18n：语言检测、切换、插值与语言包 key 集一致性', () => {
  const keys = dictionaryKeys()
  assert.deepEqual(keys.zh, keys.en, 'zh/en 语言包 key 集必须一致')
  assert.ok(keys.zh.length > 100, '语言包应有完整文案（>100 key）')

  assert.equal(detectLanguage({ lang: 'en' }), 'en')
  assert.equal(detectLanguage({ lang: 'zh-CN' }), 'zh')
  assert.equal(detectLanguage({ lang: '', env: { LANG: 'en_US.UTF-8' } }), 'en')
  assert.equal(detectLanguage({ lang: '', env: { LC_ALL: 'zh_CN.UTF-8' } }), 'zh')
  assert.equal(detectLanguage({ lang: '', env: {} }), 'zh')

  try {
    setLanguage('en')
    assert.equal(getLanguage(), 'en')
    assert.equal(t('status.succeeded'), 'Succeeded')
    assert.equal(t('generate.created', { id: 'sd_1', model: 'm1', mode: 'text2video', provider: 'demo' }),
      'Created task sd_1 (m1 / text2video / demo)')
  } finally {
    setLanguage('zh')
  }
  assert.equal(getLanguage(), 'zh')
  assert.equal(t('status.succeeded'), '已完成')
  assert.equal(t('missing.key'), 'missing.key')
})

test('parseArgs：子命令、值选项、布尔/否定、重复选项、未知选项', () => {
  let parsed = parseArgs(['generate', '--prompt', '海边日落', '-d', '5', '--json', '--no-wait'])
  assert.equal(parsed.command, 'generate')
  assert.equal(parsed.options.prompt, '海边日落')
  assert.equal(parsed.options.duration, '5')
  assert.equal(parsed.options.json, true)
  assert.equal(parsed.options.wait, false)

  parsed = parseArgs(['--prompt=带等号', '--model', 'm1', '--lang', 'en'])
  assert.equal(parsed.options.prompt, '带等号')
  assert.equal(parsed.options.model, 'm1')
  assert.equal(parsed.options.lang, 'en')

  parsed = parseArgs(['--image', 'a.png', '--image', 'b.png'])
  assert.deepEqual(parsed.options.image, ['a.png', 'b.png'])

  parsed = parseArgs(['status', 'sd_abc_1', '--json'])
  assert.equal(parsed.command, 'status')
  assert.deepEqual(parsed.positionals, ['sd_abc_1'])

  assert.throws(() => parseArgs(['--bogus']), UsageError)
  assert.throws(() => parseArgs(['--prompt']), UsageError)
})

test('render：状态文案、进度条、表格对齐、截断、记录视图', () => {
  setLanguage('zh')
  assert.equal(statusLabel('queued'), '排队中')
  assert.equal(statusLabel('succeeded'), '已完成')
  assert.equal(statusLabel('unknown'), 'unknown')
  assert.ok(statusBadge('failed').includes('失败'))
  const bar = progressBar(50, 10)
  assert.ok(bar.includes('█'.repeat(5)))
  assert.ok(bar.includes('50%'))

  const rows = [['sd_1', '已完成', '海边日落'], ['sd_2', '生成中', '城市夜景']]
  const rendered = table(['ID', '状态', '提示词'], rows)
  const lines = rendered.split('\n')
  const widths = lines.map((line) => displayWidth(line))
  assert.equal(new Set(widths).size, 1, '表格每行显示宽度应一致')
  assert.ok(lines[0].indexOf('状态') !== -1)

  assert.equal(truncate('abcdef', 4), 'abc…')
  assert.equal(displayWidth('中文'), 4)
  assert.equal(formatTime(1700000000000).length, 19)

  const record = {
    id: 'sd_1',
    status: 'succeeded',
    progress: 100,
    prompt: '测试',
    model: 'm1',
    mode: 'text2video',
    provider: 'demo',
    createdAt: 1700000000000,
    updatedAt: 1700000005000,
    meta: { duration: 5 },
    files: { video: 'sd_1.mp4' }
  }
  const view = printRecord(record, { videoPath: 'C:\\media\\sd_1.mp4' })
  assert.ok(view.includes('sd_1'))
  assert.ok(view.includes('已完成'))
  assert.ok(view.includes('5 秒'))
  assert.ok(view.includes('sd_1.mp4'))
})

test('context：装配 shared server 数据层（demo 强制），models/history 可用', async () => {
  const storage = makeStorage()
  const ctx = createCliContext({ storageRoot: storage, env: {}, demo: true, session: 'cli-test' })
  try {
    assert.equal(ctx.config.demo, true)
    assert.equal(ctx.session, 'cli-test')
    const data = await ctx.service.models()
    assert.equal(data.models.length, MODEL_COUNT)
    assert.equal(data.defaults.defaultModel, 'doubao-seedance-2-5-260628')
    assert.deepEqual(await ctx.service.history('cli-test'), [])
  } finally {
    ctx.close()
    fs.rmSync(storage, { recursive: true, force: true })
  }
})

test('generate 输入构建：参数映射 + 首帧/首尾帧模式推断', async () => {
  const input = await buildGenerateInput({
    model: 'doubao-seedance-2-5-260628',
    duration: '5',
    ratio: '16:9',
    resolution: '720p',
    firstFrame: 'https://example.com/first.png'
  })
  assert.equal(input.model, 'doubao-seedance-2-5-260628')
  assert.equal(input.params.duration, 5)
  assert.equal(input.params.ratio, '16:9')
  assert.equal(input.params.resolution, '720p')
  assert.deepEqual(input.inputs.images, [{ url: 'https://example.com/first.png' }])
  assert.equal(input.mode, 'image2video')

  const firstlast = await buildGenerateInput({
    firstFrame: 'https://example.com/a.png',
    lastFrame: 'https://example.com/b.png'
  })
  assert.equal(firstlast.mode, 'firstlast')
  assert.equal(firstlast.inputs.images.length, 2)

  const reference = await buildGenerateInput({ image: ['https://example.com/a.png', 'https://example.com/b.png', 'https://example.com/c.png'] })
  assert.equal(reference.mode, 'reference')
  assert.equal(reference.inputs.images.length, 3)
})

test('命令集成：创建（不等待）→ 状态 → 历史 → 取消', async () => {
  setLanguage('zh')
  const storage = makeStorage()
  const ctx = createCliContext({ storageRoot: storage, env: {}, demo: true, session: 'cmd-test' })
  try {
    const io = makeIo()
    const record = await runGenerate(ctx, { prompt: '命令行测试', wait: false }, io)
    assert.equal(record.status, 'queued')
    assert.ok(io.lines.join('\n').includes(record.id))

    const status = await runStatus(ctx, record.id, {}, makeIo())
    assert.equal(status.id, record.id)

    const history = await runHistory(ctx, {}, makeIo())
    assert.equal(history.length, 1)
    assert.equal(history[0].id, record.id)

    const cancelled = await runCancel(ctx, record.id, {}, makeIo())
    assert.equal(cancelled.status, 'cancelled')

    const models = await runModels(ctx, {}, makeIo())
    assert.equal(models.models.length, MODEL_COUNT)
  } finally {
    ctx.close()
    fs.rmSync(storage, { recursive: true, force: true })
  }
})

test('进程冒烟：models/history --json、--help/--version、--lang en、未知命令退出码', async () => {
  const storage = makeStorage()
  try {
    let result = await runBin(['models', '--json', '--demo', '--storage', storage])
    assert.equal(result.code, 0)
    const models = JSON.parse(result.stdout)
    assert.equal(models.models.length, MODEL_COUNT)

    result = await runBin(['history', '--json', '--demo', '--storage', storage])
    assert.equal(result.code, 0)
    const history = JSON.parse(result.stdout)
    assert.equal(history.total, 0)

    result = await runBin(['--help'])
    assert.equal(result.code, 0)
    assert.ok(result.stdout.includes('dsh-seedance-cli'))
    assert.ok(result.stdout.includes('generate'))
    assert.ok(result.stdout.includes('Seedance 视频创作台'))

    result = await runBin(['--lang', 'en', '--help'])
    assert.equal(result.code, 0)
    assert.ok(result.stdout.includes('Seedance Video Studio'))
    assert.ok(!result.stdout.includes('视频创作台'))

    result = await runBin(['--version'])
    assert.equal(result.code, 0)
    assert.ok(result.stdout.includes('0.1.0'))

    result = await runBin(['--lang', 'en', 'bogus'])
    assert.equal(result.code, 2)
    assert.ok(result.stderr.includes('Unknown command'))

    result = await runBin(['bogus'])
    assert.equal(result.code, 2)
    assert.ok(result.stderr.includes('未知命令'))
  } finally {
    fs.rmSync(storage, { recursive: true, force: true })
  }
})
