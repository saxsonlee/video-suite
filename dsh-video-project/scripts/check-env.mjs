#!/usr/bin/env node
/**
 * check-env.mjs — 环境自检（新克隆仓库后先跑这个）
 *
 * 检查：Node 版本、ffmpeg（路径/来源/能否执行/版本）、插件目录与项目存储目录是否可写、
 *       Codex 平台依赖（可选）。缺 ffmpeg 时可直接 `--fetch` 下载到 vendor/ffmpeg/。
 *
 * 用法：
 *   node scripts/check-env.mjs               # 人类可读输出
 *   node scripts/check-env.mjs --json        # 机器可读（脚本/CI 用）
 *   node scripts/check-env.mjs --fetch       # 缺 ffmpeg 时自动下载（约 22~110MB）
 *
 * 退出码：0 = 环境可用（ffmpeg 可选，缺失只提示）；1 = 关键项不可用（Node 过旧/目录不可写）
 *        加 --require-ffmpeg 时，缺 ffmpeg 也算失败。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkEnvironment } from '../server/env-check.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(HERE, '..')
const WANT_JSON = process.argv.includes('--json')
const WANT_FETCH = process.argv.includes('--fetch')
const REQUIRE_FFMPEG = process.argv.includes('--require-ffmpeg')

function icon(ok) { return ok ? '✓' : '✗' }

function runFetch() {
  return new Promise((resolve) => {
    const script = path.join(HERE, 'fetch-ffmpeg.mjs')
    console.log('\n[check-env] 开始下载 ffmpeg（首次约 22~110MB，请稍候）…')
    const child = spawn(process.execPath, [script], { cwd: PLUGIN_ROOT, stdio: 'inherit', windowsHide: false })
    child.on('exit', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}

async function main() {
  let report = checkEnvironment()
  if (WANT_FETCH && !report.checks.ffmpeg.ok) {
    const ok = await runFetch()
    if (ok) report = checkEnvironment()
  }
  if (WANT_JSON) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    const { checks } = report
    console.log('\n=== 视频项目 · 环境自检 ===\n')
    console.log(icon(checks.node.ok) + ' Node ' + checks.node.version + (checks.node.ok ? '' : '（需要 >= 18）'))
    if (checks.ffmpeg.ok) {
      console.log(icon(true) + ' ffmpeg：' + checks.ffmpeg.path)
      console.log('    来源：' + checks.ffmpeg.source + '  ' + checks.ffmpeg.version)
    } else {
      console.log(icon(false) + ' ffmpeg：未找到可用程序（抽帧分析/视频探测将不可用）')
      console.log('    修复：node scripts/fetch-ffmpeg.mjs  （或加 --fetch 一步到位）')
      console.log('          也可以安装系统 ffmpeg 加入 PATH，或设置环境变量 VIDEO_PROJECT_FFMPEG')
    }
    console.log(icon(checks.pluginDir.ok) + ' 插件目录：' + checks.pluginDir.path + (checks.pluginDir.writable ? '（可写）' : '（不可写）'))
    console.log(icon(checks.storage.ok) + ' 项目存储：' + (checks.storage.path || '（未解析）') + (checks.storage.writable ? '（可写）' : '（不可写）'))
    if (checks.codex.present) {
      console.log((checks.codex.depsInstalled ? '✓' : '·') + ' Codex 依赖：' + (checks.codex.depsInstalled ? '已安装' : '未安装（仅 Codex 打包/运行时需要）'))
    }
    console.log('')
    if (report.ok) console.log('结论：环境可用 ✅')
    else {
      console.log('结论：有需要处理的问题 ⚠️')
      for (const c of Object.values(checks)) if (c.hint) console.log('  - ' + c.hint)
    }
    console.log('')
  }
  const hardFail = !report.checks.node.ok || !report.checks.pluginDir.ok || !report.checks.storage.ok
  const ffmpegFail = REQUIRE_FFMPEG && !report.checks.ffmpeg.ok
  process.exit(hardFail || ffmpegFail ? 1 : 0)
}

main().catch((error) => {
  console.error('[check-env] 自检失败：' + (error && error.message ? error.message : String(error)))
  process.exit(1)
})
