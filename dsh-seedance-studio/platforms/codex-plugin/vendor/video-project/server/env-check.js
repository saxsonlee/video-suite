/**
 * dsh-video-project — 环境自检
 *
 * 检查运行所需的本地条件，便于「新机器/新克隆的仓库」快速定位缺什么：
 * - Node 版本（>= 18）
 * - ffmpeg：解析路径（环境变量 > vendor > PATH）+ 实际能否执行 + 版本号
 * - 插件目录、项目存储目录是否存在且可写
 * - 可选依赖（Codex 平台的 node_modules）
 *
 * 不依赖 DSH 运行时，可被 `node scripts/check-env.mjs` 或 HTTP 路由直接调用。
 * @module dsh-video-project/server/env-check
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveFfmpeg } from './analyze.js'
import { readProjectLocation } from './projects.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 插件根目录（含 server/、vendor/、platforms/）。 */
export const PLUGIN_ROOT = path.resolve(HERE, '..')

/** 判断目录是否可写（写一个临时文件再删）。 */
function isWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, '.write-probe-' + process.pid + '-' + Date.now().toString(36))
    fs.writeFileSync(probe, 'ok')
    fs.rmSync(probe, { force: true })
    return true
  } catch (error) {
    return false
  }
}

/** 读取 ffmpeg 版本（取 -version 首行；失败返回空串）。 */
export function probeFfmpegVersion(ffmpegPath) {
  if (!ffmpegPath) return ''
  try {
    const result = spawnSync(ffmpegPath, ['-hide_banner', '-version'], { encoding: 'utf8', timeout: 15000, windowsHide: true })
    const text = String(result.stdout || '') + String(result.stderr || '')
    const line = text.split(/\r?\n/).find((item) => /ffmpeg version/i.test(item)) || text.split(/\r?\n/)[0] || ''
    return line.trim().slice(0, 200)
  } catch (error) {
    return ''
  }
}

/** 判断 ffmpeg 来源（便于用户理解为什么用的是这个）。 */
export function detectFfmpegSource(ffmpegPath, env = process.env) {
  if (!ffmpegPath) return ''
  const resolved = path.resolve(ffmpegPath)
  for (const key of ['VIDEO_PROJECT_FFMPEG', 'FFMPEG_PATH']) {
    const value = env && env[key] ? String(env[key]).trim() : ''
    if (value && path.resolve(value) === resolved) return 'env:' + key
  }
  const vendorDir = path.join(PLUGIN_ROOT, 'vendor', 'ffmpeg')
  if (resolved.toLowerCase().startsWith(vendorDir.toLowerCase())) return 'vendor'
  return 'PATH'
}

/** Node 主版本号是否满足要求（>= 18）。 */
export function isNodeVersionOk(version = process.versions.node, minMajor = 18) {
  const major = Number(String(version).split('.')[0])
  return Number.isFinite(major) && major >= minMajor
}

/**
 * 运行环境自检。
 * @param {object} [options] - env（环境变量）、storageRoot（项目存储根，可选）。
 * @returns {object} { ok, issues, checks: { node, ffmpeg, pluginDir, storage, codex } }
 */
export function checkEnvironment(options = {}) {
  const env = options.env || process.env
  const issues = []

  // ---- Node ----
  const nodeOk = isNodeVersionOk(process.versions.node)
  const node = {
    version: process.version,
    major: Number(process.versions.node.split('.')[0]),
    ok: nodeOk,
    hint: nodeOk ? '' : '需要 Node.js 18 或更高版本（或使用 DSH 自带运行时）'
  }
  if (!nodeOk) issues.push('NODE_TOO_OLD')

  // ---- ffmpeg ----
  const ffmpegPath = resolveFfmpeg(env)
  const ffmpegVersion = probeFfmpegVersion(ffmpegPath)
  const ffmpeg = {
    found: Boolean(ffmpegPath),
    path: ffmpegPath || '',
    source: detectFfmpegSource(ffmpegPath, env),
    version: ffmpegVersion,
    runnable: Boolean(ffmpegPath && ffmpegVersion),
    ok: Boolean(ffmpegPath && ffmpegVersion),
    hint: ffmpegPath && ffmpegVersion
      ? ''
      : '未找到可用的 ffmpeg：抽帧分析/视频时长与尺寸探测会不可用。修复方式（任选其一）：① 面板「设置 → 环境检查」点「下载 ffmpeg」；② 运行 scripts/fetch-ffmpeg.mjs；③ 安装系统 ffmpeg 并加入 PATH；④ 设置环境变量 VIDEO_PROJECT_FFMPEG'
  }
  if (!ffmpeg.ok) issues.push(ffmpeg.found ? 'FFMPEG_NOT_RUNNABLE' : 'FFMPEG_NOT_FOUND')

  // ---- 插件目录 ----
  const pluginDir = {
    path: PLUGIN_ROOT,
    exists: fs.existsSync(PLUGIN_ROOT),
    writable: isWritable(PLUGIN_ROOT),
    ok: fs.existsSync(PLUGIN_ROOT) && isWritable(PLUGIN_ROOT),
    hint: ''
  }
  if (!pluginDir.ok) {
    pluginDir.hint = '插件目录不存在或不可写：vendor/ 下载与画像落盘会失败'
    issues.push('PLUGIN_DIR_NOT_WRITABLE')
  }

  // ---- 项目存储目录 ----
  let storageRoot = String(options.storageRoot || '').trim()
  if (!storageRoot) {
    try {
      const location = readProjectLocation({ env })
      storageRoot = location.projectsRoot || location.storageRoot || ''
    } catch (error) {
      storageRoot = ''
    }
  }
  const storage = {
    path: storageRoot,
    exists: Boolean(storageRoot) && fs.existsSync(storageRoot),
    writable: Boolean(storageRoot) && isWritable(storageRoot),
    ok: Boolean(storageRoot) && isWritable(storageRoot),
    hint: ''
  }
  if (!storage.ok) {
    storage.hint = '项目存储目录不存在或不可写：无法保存项目/分镜/视频版本'
    issues.push('STORAGE_NOT_WRITABLE')
  }

  // ---- 可选：Codex 平台依赖 ----
  // Codex 平台在 dsh-seedance-studio 里；本插件自己不含 codex-plugin。
  // 只有同仓库兄弟目录存在时才检查（独立安装时不显示该项）。
  const siblingCodex = path.join(PLUGIN_ROOT, '..', 'dsh-seedance-studio', 'platforms', 'codex-plugin')
  const localCodex = path.join(PLUGIN_ROOT, 'platforms', 'codex-plugin')
  const codexRoot = fs.existsSync(localCodex) ? localCodex : (fs.existsSync(siblingCodex) ? siblingCodex : '')
  const codex = {
    present: Boolean(codexRoot),
    path: codexRoot,
    depsInstalled: Boolean(codexRoot) && fs.existsSync(path.join(codexRoot, 'node_modules')),
    ok: true,
    hint: ''
  }
  if (codex.present && !codex.depsInstalled) {
    codex.hint = 'Codex 平台依赖未安装（只在用 Codex 打包/运行时需要）：在该目录执行 pnpm install'
  }

  return {
    ok: issues.length === 0,
    issues,
    platform: process.platform,
    arch: process.arch,
    hostname: (() => { try { return os.hostname() } catch (error) { return '' } })(),
    checkedAt: new Date().toISOString(),
    checks: { node, ffmpeg, pluginDir, storage, codex }
  }
}
