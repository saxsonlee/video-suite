#!/usr/bin/env node
/**
 * show-progress.mjs — 查看「前端统一（iframe SPA）」这件事两边的工作进度。
 *
 * 用途：让用户随时确认 Lead（DSH 侧）与 Codex（Codex 侧）各自改到哪了。
 * 只读工程文件时间戳，不联网、不写文件。
 *
 * 用法：<runtime node> scripts/show-progress.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const HOUR = 3600 * 1000

const LEAD_SCOPES = [
  ['platforms/dsh-plugin/frontend/src', 'DSH 前端壳（StudioPage / iframe 桥）'],
  ['platforms/dsh-plugin/frontend/index.js', 'DSH 客户端产物（build-client 生成）'],
  ['platforms/web/public', 'SPA 唯一来源（Web 独立版页面）'],
  ['server/routes/panel-page.js', '面板 HTML 路由'],
  ['server/routes/manager.js', '路由注册'],
]
const CODEX_SCOPES = [
  ['platforms/codex-plugin', 'Codex 面板 / MCP 桥（codex 负责）'],
  ['scripts/pack.mjs', '打包器（codex 负责，SPA 内联）'],
  ['scripts/codex', 'Codex 构建/安装脚本（codex 负责）'],
]

function walk(dir) {
  const out = []
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    if (/node_modules|\.git|^dist$/.test(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p))
    else {
      try { out.push({ path: p, mtime: fs.statSync(p).mtimeMs }) } catch { /* ignore */ }
    }
  }
  return out
}

function scopeInfo(rel, label) {
  const abs = path.join(ROOT, rel)
  let st = null
  try { st = fs.statSync(abs) } catch { /* missing */ }
  let latest = 0
  let count = 0
  if (st && st.isFile()) { latest = st.mtimeMs; count = 1 }
  else if (st && st.isDirectory()) {
    for (const f of walk(abs)) { if (f.mtime > latest) latest = f.mtime; count++ }
  }
  return { label, latest, count }
}

const fmt = (ms) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '（无）')
const ago = (ms) => {
  if (!ms) return ''
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return mins + ' 分钟前'
  const h = Math.floor(mins / 60)
  return h + ' 小时 ' + (mins % 60) + ' 分钟前'
}

console.log('Seedance 前端统一｜工作进度')
console.log('='.repeat(56))
console.log('工程目录：' + ROOT)
console.log('S 当前时间：' + new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC')
console.log('')

const handoff = path.join(ROOT, 'HANDOFF-spa-unify.md')
let handoffMs = 0
try { handoffMs = fs.statSync(handoff).mtimeMs } catch { /* missing */ }
console.log('交接说明：' + (handoffMs ? fmt(handoffMs) : '缺失') + '（' + ago(handoffMs) + '）')
console.log('')

let leadLatest = 0
let codexLatest = 0
console.log('【Lead（我）负责的写域】')
for (const [rel, label] of LEAD_SCOPES) {
  const info = scopeInfo(rel, label)
  leadLatest = Math.max(leadLatest, info.latest)
  console.log('  ' + (info.latest ? fmt(info.latest) : '（无）').padEnd(26) + info.label)
}
console.log('')
console.log('【Codex 负责的写域】')
for (const [rel, label] of CODEX_SCOPES) {
  const info = scopeInfo(rel, label)
  codexLatest = Math.max(codexLatest, info.latest)
  console.log('  ' + (info.latest ? fmt(info.latest) : '（无）').padEnd(26) + info.label)
}
console.log('')

// dist 构建产物
console.log('【构建产物 dist/】')
const distDir = path.join(ROOT, 'dist')
for (const name of ['dsh', 'cli', 'web', 'codex']) {
  let t = 0
  try { t = fs.statSync(path.join(distDir, name)).mtimeMs } catch { /* missing */ }
  console.log('  dist/' + name + '  ' + (t ? fmt(t) : '（未构建）'))
}
console.log('')

// 最近修改的 12 个文件
const all = walk(path.join(ROOT, 'platforms')).concat(walk(path.join(ROOT, 'scripts'))).concat(walk(path.join(ROOT, 'server')))
all.sort((a, b) => b.mtime - a.mtime)
console.log('【最近修改的 12 个文件（排除 node_modules/dist）】')
for (const f of all.slice(0, 12)) {
  console.log('  ' + new Date(f.mtime).toISOString().replace('T', ' ').slice(0, 19) + '  ' + path.relative(ROOT, f.path).replace(/\\/g, '/'))
}
console.log('')

// 结论
const codexStarted = codexLatest > (handoffMs || 0)
console.log('【状态判断】')
console.log('  Lead 最近动作：' + (leadLatest ? ago(leadLatest) : '未知'))
console.log('  Codex 最近动作：' + (codexLatest ? ago(codexLatest) : '未知'))
if (!handoffMs) {
  console.log('  ⚠ 交接文件缺失：HANDOFF-spa-unify.md 不存在，codex 不知道要做什么。')
} else if (!codexStarted) {
  console.log('  ⏳ Codex 还没开始处理这份交接（Codex 写域最后修改早于交接文件）。')
  console.log('     把 HANDOFF-spa-unify.md 发给 codex，或告诉它「读 seedance-studio/HANDOFF-spa-unify.md 按分工执行」。')
} else {
  console.log('  ▶ Codex 已有动作（Codex 写域在交接文件之后被修改过）。')
  console.log('     可以对照 HANDOFF 验收标准检查它改了哪些文件。')
}
