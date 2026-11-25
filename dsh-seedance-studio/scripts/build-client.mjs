#!/usr/bin/env node
/**
 * build-client.mjs — 构建 DSH 客户端 bundle。
 *
 * 源码：platforms/dsh-plugin/frontend/src/（按功能分目录：theme / i18n / core / components / app；
 *       每个文件是 bundle factory 闭包内的一段代码，共享同一作用域）
 * 产物：platforms/dsh-plugin/frontend/index.js（DSH 加载的单文件 __ModuleLoader__ bundle）
 *
 * 片段拼接顺序由下方 SEGMENT_ORDER 显式维护（依赖顺序：被依赖的文件在前，
 * 后面的文件可以直接使用前面文件里声明的常量/函数/组件）。
 * 包装头/尾（__ModuleLoader__.load 外壳）由本脚本维护。
 *
 * 用法：
 *   node scripts/build-client.mjs            # 构建并写入 index.js
 *   node scripts/build-client.mjs --verify   # 只校验拼接结果与现有 index.js 是否逐字节一致
 *   node scripts/build-client.mjs --list     # 按拼接顺序列出源码文件与行数
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const FRONTEND = path.join(ROOT, 'platforms', 'dsh-plugin', 'frontend')
const SRC = path.join(FRONTEND, 'src')
const OUT = path.join(FRONTEND, 'index.js')

const HEAD_LINES = [
    "window.__ModuleLoader__.load({",
    "  id: 'dsh-seedance-studio',",
    "  factory: (require) => {",
    "    var module = { exports: {} };",
    "    var exports = module.exports;",
    "    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });",
    "",
    "    const React = require('react');",
    "    const NS = 'seedance';",
    "    const PANEL_ID = 'seedance';",
    "    /** 平台注入的服务：slots/locale/layout/sessions/sidebarRightTabs 见 PLAN §3.2；uiSession 通过 ctx.get 可选获取。 */",
    "    const inject = ['slots', 'locale', 'layout', 'sessions', 'sidebarRightTabs'];",
    "",
    "    const h = React.createElement;",
    "    const D = React.Fragment;",
    ""
  ]
// 包装尾：...片段结束后的收尾
const TAIL_LINES = [
    "    return module.exports;",
    "  }",
    "});"
  ]

const HEAD = HEAD_LINES.join('\n') + '\n'
const TAIL = TAIL_LINES.join('\n') + '\n'

// 片段拼接顺序（按功能分组；组内/组间均为依赖顺序）
const SEGMENT_ORDER = [
  // ── 主题样式（先定义 CSS 常量，供后面所有组件使用）────────────────
  'theme/base-styles.js',
  // ── 文案与常量 ────────────────────────────────────────────────
  'i18n/dictionaries.js',
  'core/constants.js',
  // ── 基础工具与数据访问 ───────────────────────────────────────
  'core/utils.js',
  'core/http-api.js',
  'core/normalize.js',
  'core/file-utils.js',
  // ── 表单 / 会话 / 深链 / hooks ───────────────────────────────
  'core/form-model.js',
  'core/session.js',
  'core/deep-link.js',
  'core/hooks.js',
  // 对话联动：打开会话 / 把记录发送给左侧对话（智能体继续分析优化）
  'core/chat-bridge.js',
  // ── 组件补充样式 ─────────────────────────────────────────────
  'theme/component-styles.js',
  // ── 基础组件 ─────────────────────────────────────────────────
  'components/icons.js',
  'components/primitives.js',
  'components/inputs.js',
  // ── 业务面板与弹窗 ───────────────────────────────────────────
  'components/material-panel.js',
  'components/params-panel.js',
  'components/creator-panel.js',
  'components/overlays.js',
  'components/history.js',
  'components/player-modal.js',
  'components/recreate-modal.js',
  'components/video-pick-modal.js',
  'components/settings-modal.js',
  // ── 页面补充样式 ─────────────────────────────────────────────
  'theme/page-styles.js',
  // ── 主页面与插件注册 ─────────────────────────────────────────
  'app/studio-page.js',
  // 右侧边栏接入：tab 类型 + guide 卡片 + 窗口体（依赖 StudioPage）
  'app/sidebar-tab.js',
  'app/register.js',
]

/** 递归列出 src 下所有 .js 相对路径（用于校验没有漏管/多管文件）。 */
function listSourceFiles() {
  const out = []
  const walk = (dir, base) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full, base)
      else if (entry.name.endsWith('.js')) out.push(path.relative(base, full).split(path.sep).join('/'))
    }
  }
  walk(SRC, SRC)
  return out.sort()
}

function build() {
  const onDisk = listSourceFiles()
  const missing = SEGMENT_ORDER.filter((rel) => !onDisk.includes(rel))
  const unlisted = onDisk.filter((rel) => !SEGMENT_ORDER.includes(rel))
  if (missing.length) {
    throw new Error('SEGMENT_ORDER 中列出的文件不存在：\n  ' + missing.join('\n  '))
  }
  if (unlisted.length) {
    throw new Error('src 下存在未加入 SEGMENT_ORDER 的文件：\n  ' + unlisted.join('\n  '))
  }
  const parts = SEGMENT_ORDER.map((rel) => {
    const text = fs.readFileSync(path.join(SRC, rel), 'utf8')
    return text.endsWith('\n') ? text : text + '\n'
  })
  return { source: HEAD + parts.join('') + TAIL }
}

const args = new Set(process.argv.slice(2))
const { source } = build()
new vm.Script(source, { filename: 'index.js' }) // 语法校验（与 DSH 加载同类脚本解析）

if (args.has('--list')) {
  console.log('client bundle 片段（' + SEGMENT_ORDER.length + ' 个，按拼接顺序）：')
  for (const rel of SEGMENT_ORDER) {
    const lineCount = fs.readFileSync(path.join(SRC, rel), 'utf8').split('\n').length - 1
    console.log('  ' + rel.padEnd(34) + lineCount + ' 行')
  }
  process.exit(0)
}

if (args.has('--verify')) {
  const current = fs.readFileSync(OUT, 'utf8')
  const same = current === source
  console.log('verify: ' + (same ? 'PASS — 拼接结果与现有 index.js 逐字节一致' : 'FAIL — 与现有 index.js 不一致'))
  if (!same) process.exit(1)
  process.exit(0)
}

fs.writeFileSync(OUT, source, 'utf8')
const lineCount = source.split('\n').length - 1
console.log('client bundle 已构建：' + path.relative(ROOT, OUT))
console.log('  片段 ' + SEGMENT_ORDER.length + ' 个，产物 ' + lineCount + ' 行 / ' + source.length + ' 字符')
