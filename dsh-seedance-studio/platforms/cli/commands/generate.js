/**
 * dsh-seedance-studio — CLI generate 命令（含图片参数加载与交互式提示词）。
 *
 * 输入结构与 seedance_video 工具一致：
 *   { prompt, model, mode, params: {...}, inputs: { images, video } }
 * 图片参数支持公网 URL / data:base64 / 本地文件路径（本地文件转 dataURL 下发）。
 * 界面文案走 lib/i18n.js。
 * @module dsh-seedance-studio/platforms/cli/commands/generate
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { UsageError } from '../lib/args.js'
import { t } from '../lib/i18n.js'
import { bold, createConsoleIo, dim, green, printRecord } from '../lib/render.js'
import { waitForTask } from './wait.js'

/** 图片扩展名 → MIME。 */
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

/** 本地图片转 dataURL（CLI 没有工作区服务，直接读文件）。 */
async function localImageToDataUrl(filePath) {
  const stat = await fsp.stat(filePath).catch(() => null)
  if (!stat || !stat.isFile()) throw new UsageError(t('generate.imageMissing', { path: filePath }))
  if (stat.size > 10 * 1024 * 1024) throw new UsageError(t('generate.imageTooLarge', { path: filePath }))
  const mime = IMAGE_MIME[path.extname(filePath).toLowerCase()]
  if (!mime) throw new UsageError(t('generate.imageFormat', { path: filePath }))
  const buffer = await fsp.readFile(filePath)
  return 'data:' + mime + ';base64,' + buffer.toString('base64')
}

/** 把图片参数转成 generate 输入项：{ url } 或 { dataUrl }。 */
export async function toImageInput(value) {
  const text = String(value == null ? '' : value).trim()
  if (!text) throw new UsageError(t('generate.imageEmpty'))
  if (/^https?:\/\//i.test(text)) return { url: text }
  if (text.startsWith('data:')) return { dataUrl: text }
  return { dataUrl: await localImageToDataUrl(path.resolve(text)) }
}

/** 根据 CLI 选项构建 generate 输入（纯函数 + 本地图片读取）。 */
export async function buildGenerateInput(options = {}) {
  const input = {}
  if (options.model) input.model = options.model
  if (options.mode) input.mode = options.mode

  const params = {}
  if (options.duration !== undefined) params.duration = Number(options.duration)
  if (options.resolution !== undefined) params.resolution = String(options.resolution)
  if (options.ratio !== undefined) params.ratio = String(options.ratio)
  if (options.seed !== undefined) params.seed = Number(options.seed)
  if (options.generateAudio !== undefined) params.generateAudio = Boolean(options.generateAudio)
  if (options.watermark !== undefined) params.watermark = Boolean(options.watermark)
  if (options.returnLastFrame !== undefined) params.returnLastFrame = Boolean(options.returnLastFrame)
  if (Object.keys(params).length > 0) input.params = params

  const images = []
  if (options.firstFrame) images.push(await toImageInput(options.firstFrame))
  if (options.lastFrame) images.push(await toImageInput(options.lastFrame))
  const extraImages = options.image === undefined ? [] : [].concat(options.image)
  for (const value of extraImages) images.push(await toImageInput(value))
  if (images.length > 0) {
    input.inputs = input.inputs || {}
    input.inputs.images = images
    if (!input.mode) {
      if (options.firstFrame && options.lastFrame) input.mode = 'firstlast'
      else if (options.firstFrame) input.mode = 'image2video'
      else if (!options.video) input.mode = 'reference'
    }
  }
  if (options.video) {
    input.inputs = input.inputs || {}
    input.inputs.video = { url: String(options.video).trim() }
    if (!input.mode) input.mode = 'reference'
  }
  return input
}

/** 交互式读取一行（TTY 场景）。 */
async function askQuestion(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return await new Promise((resolve) => rl.question(question, resolve))
  } finally {
    rl.close()
  }
}

/** generate 命令：创建任务；默认等待完成（--no-wait 立即返回）。 */
export async function runGenerate(ctx, options = {}, io = createConsoleIo()) {
  let prompt = options.prompt
  if (!prompt || !String(prompt).trim()) {
    if (!process.stdin.isTTY) throw new UsageError(t('generate.promptRequired'))
    prompt = await askQuestion(t('generate.promptLabel'))
    if (!prompt || !String(prompt).trim()) throw new UsageError(t('generate.promptEmpty'))
  }
  prompt = String(prompt).trim()

  const input = await buildGenerateInput(options)
  input.prompt = prompt
  const record = await ctx.service.generate(ctx.session, input)
  const providerLabel = record.provider === 'demo' ? t('render.providerDemo') : record.provider

  if (!options.json) {
    io.out(green(t('generate.created', {
      id: record.id,
      model: record.model,
      mode: record.mode,
      provider: providerLabel
    })))
  }

  const shouldWait = options.wait !== false
  let final = record
  let timedOut = false
  if (shouldWait) {
    const seconds = options.waitSeconds ? Number(options.waitSeconds) : 120
    const waitSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 120
    const waited = await waitForTask(ctx, record.id, {
      timeoutMs: waitSeconds * 1000,
      onProgress: (current) => io.progress(current)
    })
    io.clearLine()
    final = waited.record
    timedOut = waited.timedOut
    if (timedOut && !options.json) {
      io.out(dim(t('generate.timeout', { seconds: waitSeconds, id: record.id })))
    }
  }

  const paths = ctx.service.recordPaths(final)
  if (options.json) {
    io.out(JSON.stringify({ record: final, paths, timedOut }, null, 2))
    return final
  }
  io.out(printRecord(final, paths))
  if (final.status === 'succeeded' && paths.videoPath) {
    io.out(green(t('generate.saved', { path: paths.videoPath })))
  }
  return final
}
