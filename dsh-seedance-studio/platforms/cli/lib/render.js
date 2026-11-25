/**
 * dsh-seedance-studio — CLI 终端渲染（颜色 / 表格 / 进度条 / 记录视图）。
 *
 * 所有界面文案走 lib/i18n.js 的 t()（语言包在 locale/{zh,en}.js），
 * 颜色用 ANSI SGR，表格按显示宽度（中文按 2 格）对齐；非 TTY 自动关闭颜色。
 * @module dsh-seedance-studio/platforms/cli/lib/render
 */
import { t } from './i18n.js'

const state = { color: Boolean(process.stdout.isTTY) && !process.env.NO_COLOR }
const STATUS_KEYS = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired']

/** 配置渲染（--no-color / 测试用）。 */
export function configureRender(options = {}) {
  if (options.color !== undefined) state.color = Boolean(options.color) && Boolean(process.stdout.isTTY)
}

function sgr(code) {
  return (text) => (state.color ? '\u001b[' + code + 'm' + String(text) + '\u001b[0m' : String(text))
}

export const bold = sgr('1')
export const dim = sgr('2')
export const red = sgr('31')
export const green = sgr('32')
export const yellow = sgr('33')
export const cyan = sgr('36')
export const magenta = sgr('35')

/** 状态中文/英文文案（未知状态原样返回）。 */
export function statusLabel(status) {
  const value = String(status == null ? '' : status)
  if (STATUS_KEYS.indexOf(value) === -1) return value || '-'
  return t('status.' + value)
}

/** 带颜色的状态徽标。 */
export function statusBadge(status) {
  const text = '[' + statusLabel(status) + ']'
  if (status === 'succeeded') return green(text)
  if (status === 'failed') return red(text)
  if (status === 'cancelled' || status === 'expired') return dim(text)
  if (status === 'running') return yellow(text)
  return cyan(text)
}

/** 进度条（0-100）。 */
export function progressBar(progress, width = 20) {
  const percent = Math.max(0, Math.min(100, Number(progress) || 0))
  const filled = Math.round((percent / 100) * width)
  return '[' + '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled)) + '] ' + String(Math.round(percent)).padStart(3, ' ') + '%'
}

/** 终端显示宽度（CJK 字符按 2 格）。 */
export function displayWidth(text) {
  let width = 0
  for (const ch of String(text)) {
    const code = ch.codePointAt(0)
    const wide = (code >= 0x1100 && code <= 0x115f)
      || code === 0x2329 || code === 0x232a
      || (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f)
      || (code >= 0xac00 && code <= 0xd7a3)
      || (code >= 0xf900 && code <= 0xfaff)
      || (code >= 0xfe10 && code <= 0xfe19)
      || (code >= 0xfe30 && code <= 0xfe6f)
      || (code >= 0xff00 && code <= 0xff60)
      || (code >= 0xffe0 && code <= 0xffe6)
      || (code >= 0x1f300 && code <= 0x1f64f)
      || (code >= 0x1f900 && code <= 0x1f9ff)
    width += wide ? 2 : 1
  }
  return width
}

/** 按显示宽度右补空格。 */
export function padEnd(text, width) {
  const diff = width - displayWidth(text)
  return String(text) + (diff > 0 ? ' '.repeat(diff) : '')
}

/** 按显示宽度截断（超出加省略号）。 */
export function truncate(text, maxWidth) {
  const value = String(text == null ? '' : text)
  if (displayWidth(value) <= maxWidth) return value
  let out = ''
  for (const ch of value) {
    if (displayWidth(out + ch) > maxWidth - 1) break
    out += ch
  }
  return out + '…'
}

/** 简单表格（表头 + 分隔线 + 行），按显示宽度对齐。 */
export function table(headers, rows) {
  const widths = headers.map((header, index) => {
    let width = displayWidth(header)
    for (const row of rows) width = Math.max(width, displayWidth(row[index] == null ? '' : row[index]))
    return width
  })
  const renderRow = (cells) => cells.map((cell, index) => padEnd(cell == null ? '' : cell, widths[index])).join('  ')
  const separator = widths.map((width) => '─'.repeat(width)).join('  ')
  return [renderRow(headers), separator, ...rows.map(renderRow)].join('\n')
}

/** 时间戳 → 本地 'YYYY-MM-DD HH:mm:ss'。 */
export function formatTime(timestamp) {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  const pad = (value) => String(value).padStart(2, '0')
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
}

/** 记录时长（秒）：优先 meta.duration，其次 updatedAt-createdAt。 */
export function formatDuration(record) {
  if (!record) return '-'
  const metaDuration = record.meta && record.meta.duration
  if (typeof metaDuration === 'number' && metaDuration > 0) return metaDuration + t('render.seconds')
  if (record.createdAt && record.updatedAt) {
    const seconds = Math.max(0, Math.round((record.updatedAt - record.createdAt) / 1000))
    return seconds + t('render.seconds')
  }
  return '-'
}

/** 字节数 → 人类可读。 */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0
  if (value < 1024) return value + ' B'
  if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB'
  return (value / 1024 / 1024).toFixed(1) + ' MB'
}

/** 单条记录详情视图（多行文本）。 */
export function printRecord(record, paths = {}) {
  if (!record) return dim(t('render.notFound'))
  const providerLabel = record.provider === 'demo' ? t('render.providerDemo') : (record.provider || '-')
  const lines = []
  lines.push(bold(t('render.task') + ' ') + cyan(record.id))
  lines.push('  ' + t('render.status') + '    ' + statusBadge(record.status)
    + (record.status === 'queued' || record.status === 'running' ? '  ' + progressBar(record.progress || 0, 16) : ''))
  lines.push('  ' + t('render.model') + '    ' + (record.model || '-')
    + '   ' + t('render.mode') + ' ' + (record.mode || '-')
    + '   ' + t('render.provider') + ' ' + providerLabel)
  lines.push('  ' + t('render.prompt') + '  ' + truncate(record.prompt || '-', 80))
  lines.push('  ' + t('render.created') + '    ' + formatTime(record.createdAt) + '   ' + t('render.duration') + ' ' + formatDuration(record))
  if (record.originId) lines.push('  ' + t('render.origin') + '    ' + record.originId + t('render.originRemix'))
  if (paths.videoPath) lines.push('  ' + t('render.video') + '    ' + green(paths.videoPath))
  if (paths.lastFramePath) lines.push('  ' + t('render.lastFrame') + '    ' + paths.lastFramePath)
  if (paths.posterPath) lines.push('  ' + t('render.poster') + '    ' + paths.posterPath)
  if (record.remoteVideoUrl) lines.push('  ' + t('render.remote') + '    ' + dim(record.remoteVideoUrl + t('render.remoteTtl')))
  if (record.error) lines.push('  ' + t('render.error') + '    ' + red(record.error.message || record.error.code || t('render.unknownError')))
  const usage = record.usage || (record.meta && record.meta.usage)
  if (usage) lines.push('  ' + t('render.usage') + '    ' + dim(JSON.stringify(usage)))
  return lines.join('\n')
}

/** 历史记录表格视图。 */
export function printHistory(records, sessionId) {
  const rows = records.map((record) => [
    record.id,
    statusLabel(record.status),
    record.model || '-',
    record.mode || '-',
    truncate(record.prompt || '-', 24),
    formatTime(record.createdAt),
    record.files && record.files.video ? t('table.local') : '-'
  ])
  return bold(t('render.historyTitle', { session: sessionId, total: records.length }))
    + '\n' + table([t('table.id'), t('table.status'), t('table.model'), t('table.mode'), t('table.prompt'), t('table.created'), t('table.video')], rows)
    + '\n\n' + dim(t('render.historyHint'))
}

/** 模型目录视图。 */
export function printModels(data) {
  const rows = data.models.map((model) => [
    model.id,
    model.label || '-',
    model.family || '-',
    (model.durations || []).join(','),
    (model.resolutions || []).join(','),
    (model.modes || []).join('/')
  ])
  return bold(t('render.modelsTitle', { count: data.models.length, default: data.defaults.defaultModel }))
    + '\n' + table([t('table.id'), t('table.name'), t('table.family'), t('table.durations'), t('table.resolutions'), t('table.modes')], rows)
    + '\n\n' + dim(t('render.modelsHint'))
}

/** 控制台 io（命令层通过它输出，便于测试替换）。 */
export function createConsoleIo() {
  return {
    out: (text) => process.stdout.write(String(text) + '\n'),
    progress: (record) => {
      if (!process.stdout.isTTY) return
      process.stdout.write('\r' + progressBar(record.progress || 0, 20) + ' ' + statusLabel(record.status) + '        ')
    },
    clearLine: () => {
      if (process.stdout.isTTY) process.stdout.write('\r\u001b[2K')
    }
  }
}
