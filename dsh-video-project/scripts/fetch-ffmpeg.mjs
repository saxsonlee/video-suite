#!/usr/bin/env node
/**
 * fetch-ffmpeg.mjs — 下载 ffmpeg 到插件目录（vendor/ffmpeg/），供 analyze 抽帧使用。
 *
 * 什么时候需要：系统 PATH 里没有 ffmpeg、也没有设置 VIDEO_PROJECT_FFMPEG，
 * 且分发包没有自带 vendor/ffmpeg/。
 *
 * 下载来源（按顺序尝试，成功即停）：
 *   1) PyPI 镜像的 imageio-ffmpeg wheel（约 22MB，国内快；解压取 ffmpeg 二进制）
 *   2) gyan.dev 的 release essentials zip（约 110MB，官方稳定版）
 * 可用 --url <zip 直链> 强制指定来源。
 *
 * 用法：
 *   node scripts/fetch-ffmpeg.mjs                     # 自动选源
 *   node scripts/fetch-ffmpeg.mjs --url <zip 直链>    # 自定义下载地址
 *   node scripts/fetch-ffmpeg.mjs --dir <目录>        # 指定 vendor 目录（默认 vendor/ffmpeg）
 *   node scripts/fetch-ffmpeg.mjs --force             # 已存在也重新下载
 *
 * 退出码：0 成功；1 失败。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PYPI_JSON = process.env.VIDEO_PROJECT_FFMPEG_PYPI || 'https://pypi.tuna.tsinghua.edu.cn/pypi/imageio-ffmpeg/json'
const GYAN_URL = process.env.VIDEO_PROJECT_FFMPEG_URL || 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(HERE, '..')

function parseArgs(argv) {
  const out = { force: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => { const value = argv[++i]; if (value === undefined) fail('缺少参数值：' + arg); return value }
    if (arg === '--url') out.url = next()
    else if (arg === '--dir') out.dir = next()
    else if (arg === '--force') out.force = true
    else if (arg === '-h' || arg === '--help') out.help = true
    else fail('未知参数：' + arg)
  }
  return out
}
function fail(message) { console.error('[fetch-ffmpeg] ERROR: ' + message); process.exit(1) }
function log(...args) { console.log('[fetch-ffmpeg]', ...args) }
function exists(file) { try { return fs.existsSync(file) } catch (error) { return false } }

function findFfmpeg(dir) {
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()
    let entries = []
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch (error) { continue }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && (entry.name === 'ffmpeg.exe' || entry.name === 'ffmpeg' || /^ffmpeg-win-.*\.exe$/i.test(entry.name))) return full
    }
  }
  return ''
}

function extractZip(zipPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  const tar = spawnSync('tar', ['-xf', zipPath, '-C', outDir], { timeout: 600000, windowsHide: true })
  if (tar.status === 0) return true
  const psScript = "Expand-Archive -LiteralPath '" + zipPath.replace(/'/g, "''") + "' -DestinationPath '" + outDir.replace(/'/g, "''") + "' -Force"
  const ps = spawnSync('powershell.exe', ['-NoProfile', '-Command', psScript], { timeout: 600000, windowsHide: true })
  return ps.status === 0
}

async function download(url, destination, label) {
  log('下载 ' + label + '：' + url)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error('HTTP ' + response.status)
  const total = Number(response.headers.get('content-length') || 0)
  let received = 0
  let lastLog = Date.now()
  let lastPercent = -1
  const body = Readable.fromWeb(response.body)
  body.on('data', (chunk) => {
    received += chunk.length
    if (Date.now() - lastLog > 8000) {
      lastLog = Date.now()
      const percent = total ? Math.floor((received / total) * 100) : -1
      if (percent !== lastPercent) {
        lastPercent = percent
        log('已下载 ' + (received / 1024 / 1024).toFixed(1) + ' MB' + (total ? ' / ' + (total / 1024 / 1024).toFixed(1) + ' MB（' + percent + '%）' : ''))
      }
    }
  })
  await pipeline(body, fs.createWriteStream(destination))
}

/** 从 PyPI 镜像下载 imageio-ffmpeg wheel 并取出 ffmpeg 二进制。 */
async function fetchFromPypi(workDir, target) {
  const meta = await (await fetch(PYPI_JSON, { signal: AbortSignal.timeout(20000) })).json()
  const releases = meta && meta.releases && typeof meta.releases === 'object' ? meta.releases : {}
  const versions = Object.keys(releases)
  versions.sort((a, b) => {
    const pa = String(a).split('.').map(Number)
    const pb = String(b).split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pb[i] || 0) - (pa[i] || 0)
      if (diff) return diff
    }
    return 0
  })
  let wheel = ''
  for (const version of versions) {
    const files = Array.isArray(releases[version]) ? releases[version] : []
    const match = files.find((file) => /win_amd64\.whl$/i.test(file.filename || ''))
    if (match) { wheel = match; break }
  }
  if (!wheel) throw new Error('镜像里没有 Windows wheel')
  const wheelPath = path.join(workDir, 'imageio_ffmpeg.whl')
  await download(wheel.url, wheelPath, wheel.filename)
  const extracted = path.join(workDir, 'py-extracted')
  if (!extractZip(wheelPath, extracted)) throw new Error('wheel 解压失败')
  const found = findFfmpeg(extracted)
  if (!found) throw new Error('wheel 里没找到 ffmpeg 二进制')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(found, target)
  if (process.platform !== 'win32') fs.chmodSync(target, 0o755)
}

/** 从 gyan.dev 下载完整 zip。 */
async function fetchFromGyan(workDir, target) {
  const zipPath = path.join(workDir, 'ffmpeg.zip')
  await download(GYAN_URL, zipPath, 'gyan.dev release essentials')
  const extracted = path.join(workDir, 'gyan-extracted')
  if (!extractZip(zipPath, extracted)) throw new Error('zip 解压失败')
  const found = findFfmpeg(extracted)
  if (!found) throw new Error('压缩包里没找到 ffmpeg')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(found, target)
  if (process.platform !== 'win32') fs.chmodSync(target, 0o755)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log('用法：node scripts/fetch-ffmpeg.mjs [--url <zip 直链>] [--dir <目录>] [--force]')
    return
  }
  const vendorDir = path.resolve(PLUGIN_ROOT, args.dir || 'vendor/ffmpeg')
  const binaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const target = path.join(vendorDir, binaryName)
  if (exists(target) && !args.force) {
    log('已存在：' + target + '（如需重新下载加 --force）')
    return
  }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-vp-ffmpeg-'))
  try {
    if (args.url) {
      const zipPath = path.join(workDir, 'custom.zip')
      await download(args.url, zipPath, '自定义地址')
      const extracted = path.join(workDir, 'custom-extracted')
      if (!extractZip(zipPath, extracted)) throw new Error('解压失败')
      const found = findFfmpeg(extracted)
      if (!found) throw new Error('压缩包里没找到 ffmpeg')
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(found, target)
    } else {
      const sources = [
        ['PyPI 镜像（imageio-ffmpeg wheel，约 22MB）', fetchFromPypi],
        ['gyan.dev（release essentials zip，约 110MB）', fetchFromGyan]
      ]
      let lastError = null
      for (const [label, fetchSource] of sources) {
        try {
          log('尝试来源：' + label)
          await fetchSource(workDir, target)
          lastError = null
          break
        } catch (error) {
          lastError = error
          log('该来源失败：' + (error && error.message ? error.message : String(error)))
        }
      }
      if (lastError) throw lastError
    }
    if (!exists(target)) throw new Error('下载后仍未找到 ffmpeg 二进制')
    if (process.platform !== 'win32') fs.chmodSync(target, 0o755)
    const bytes = fs.statSync(target).size
    log('完成：' + target + '（' + (bytes / 1024 / 1024).toFixed(1) + ' MB）')
    log('analyze 会自动使用它；也可以用 VIDEO_PROJECT_FFMPEG 指定其他二进制。')
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }) } catch (error) { /* 清理失败忽略 */ }
  }
}

main().catch((error) => fail(error && error.message ? error.message : String(error)))
