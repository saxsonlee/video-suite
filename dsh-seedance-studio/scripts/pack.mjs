#!/usr/bin/env node
/**
 * dsh-seedance-studio — 多形态打包脚本。
 *
 * 把「单个形态目录 + server/ + 公共资源 + 裁剪后的 package.json」复制到 dist/<platform>/，
 * 目录内相对路径保持不变（platforms/* → server/*、media/ 的相对导入可直接工作）。
 *
 * 用法：
 *   node scripts/pack.mjs --platform dsh|cli|web|codex|all [--out dist] [--clean] [--no-verify]
 *
 * 产物（dist/ 下）：
 *   dsh/   DSH 插件包（package.json 含 main/exports/dsh/peerDependencies，不含 bin）
 *   cli/   CLI 独立包（bin: dsh-seedance-cli）
 *   web/   Web 独立包（bin: dsh-seedance-web）
 *   codex/ Codex 原生插件（MCP 工具 + 内嵌面板；源码在 platforms/codex-plugin/）
 * @module dsh-seedance-studio/scripts/pack
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const PLATFORMS = ['dsh', 'cli', 'web', 'codex']

/** 每个形态都需要的公共目录。 */
const COMMON_ENTRIES = ['server', 'media', ...(fs.existsSync(path.join(ROOT, 'shared')) ? ['shared'] : [])]
/** 形态专属条目。 */
const PLATFORM_ENTRIES = {
  dsh: ['platforms/dsh-plugin', 'platforms/web/public', 'locale', 'docs', 'README.md', 'PLAN.md'],
  cli: ['platforms/cli', 'README.md', 'PLAN.md'],
  web: ['platforms/web', 'locale', 'README.md', 'PLAN.md']
}

/** 生成目标包的 package.json（按形态裁剪）。 */
function buildPackageJson(platform) {
  if (platform === 'dsh') {
    return {
      name: PKG.name,
      version: PKG.version,
      private: PKG.private,
      description: PKG.description,
      type: 'module',
      main: PKG.main,
      exports: PKG.exports,
      files: ['platforms/**', 'server/**', 'shared/**', 'media/**', 'locale/**', 'docs/**', 'README.md', 'PLAN.md'],
      dsh: PKG.dsh,
      peerDependencies: PKG.peerDependencies
    }
  }
  const suffix = platform === 'cli' ? 'CLI 形态（终端 TUI）' : 'Web 形态（脱离 DSH 独立运行）'
  const bin = platform === 'cli'
    ? { 'dsh-seedance-cli': './platforms/cli/bin.js' }
    : { 'dsh-seedance-web': './platforms/web/serve.js' }
  return {
    name: PKG.name + '-' + platform,
    version: PKG.version,
    private: PKG.private,
    description: 'Seedance 视频创作台 · ' + suffix,
    type: 'module',
    bin,
    files: ['platforms/**', 'server/**', 'shared/**', 'media/**', 'locale/**', 'README.md', 'PLAN.md']
  }
}

/** 解析 CLI 参数。 */
function parseArgs(argv) {
  const options = { platform: '', out: 'dist', clean: false, verify: true }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const match = /^--(platform|out)=(.*)$/.exec(token)
    if (match) {
      options[match[1]] = match[2]
      continue
    }
    if (token === '--platform') {
      i += 1
      if (i >= argv.length) throw new Error('--platform 缺少数值（dsh / cli / web / codex / all）')
      options.platform = argv[i]
      continue
    }
    if (token === '--out') {
      i += 1
      if (i >= argv.length) throw new Error('--out 缺少数值')
      options.out = argv[i]
      continue
    }
    if (token === '--clean') { options.clean = true; continue }
    if (token === '--no-verify') { options.verify = false; continue }
    if (token === '--help' || token === '-h') { options.help = true; continue }
    throw new Error('未知参数：' + token)
  }
  return options
}

/** 递归复制（排除 node_modules/.git）。 */
async function copyEntry(rel, destRoot) {
  const source = path.join(ROOT, rel)
  const target = path.join(destRoot, rel)
  await fsp.mkdir(path.dirname(target), { recursive: true })
  await fsp.cp(source, target, {
    recursive: true,
    filter: (file) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(file) && !/[\\/]docs[\\/]reference([\\/]|$)/.test(path.relative(ROOT, file))
  })
}

/** 统计目录文件数与字节数。 */
async function dirStats(dir) {
  let files = 0
  let bytes = 0
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const nested = await dirStats(full)
      files += nested.files
      bytes += nested.bytes
    } else if (entry.isFile()) {
      files += 1
      bytes += (await fsp.stat(full)).size
    }
  }
  return { files, bytes }
}

/** 打包单个形态。 */
async function packPlatform(platform, outDir) {
  if (PLATFORMS.indexOf(platform) === -1) throw new Error('未知形态：' + platform)
  const destRoot = path.join(outDir, platform)
  await fsp.rm(destRoot, { recursive: true, force: true })
  await fsp.mkdir(destRoot, { recursive: true })
  if (platform === 'codex') {
    const { packCodex } = await import('./codex/pack.mjs')
    await packCodex(destRoot)
    return { platform, destRoot, ...await dirStats(destRoot) }
  }
  for (const entry of COMMON_ENTRIES.concat(PLATFORM_ENTRIES[platform])) {
    if (!fs.existsSync(path.join(ROOT, entry))) throw new Error('缺少打包条目：' + entry)
    await copyEntry(entry, destRoot)
  }
  await fsp.writeFile(path.join(destRoot, 'package.json'), JSON.stringify(buildPackageJson(platform), null, 2) + '\n', 'utf8')
  const stats = await dirStats(destRoot)
  return { platform, destRoot, ...stats }
}

/** 验证 dsh 包结构（DSH 运行需要），不做运行时加载。 */
function verifyDsh(destRoot) {
  const target = path.join(destRoot, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(target, 'utf8'))
  const mustExist = [pkg.main, pkg.exports['.'], pkg.exports['./client'], pkg.exports['./cordis.patch.yml'], pkg.dsh.bundle.patch]
  for (const rel of mustExist) {
    if (!rel) throw new Error('dsh 包 package.json 缺少关键字段')
    if (!fs.existsSync(path.join(destRoot, rel))) throw new Error('dsh 包缺少文件：' + rel)
  }
  if (!pkg.peerDependencies || !pkg.peerDependencies['@deepseek-ai/dsh-tools']) throw new Error('dsh 包缺少 peerDependencies')
  if (!fs.existsSync(path.join(destRoot, 'platforms/web/public/index.html'))) throw new Error('dsh 包缺少共享 SPA 来源')
  return 'dsh 包结构完整（main/exports/patch/peerDependencies）'
}

/** 验证 CLI 包：直接跑 models --json。 */
async function verifyCli(destRoot) {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-pack-cli-'))
  const env = { ...process.env, ARK_API_KEY: '', RELAY_API_KEY: '', RELAY_BASE_URL: '', TEMP: os.tmpdir(), TMP: os.tmpdir() }
  try {
    const result = await exec(process.execPath, [
      path.join(destRoot, 'platforms', 'cli', 'bin.js'), 'models', '--json', '--demo', '--storage', storage
    ], { cwd: destRoot, env, timeout: 30000 })
    const data = JSON.parse(String(result.stdout))
    if (!data.models || data.models.length !== 6) throw new Error('CLI 包 models 输出异常')
    return 'CLI 包可用（models --json 返回 ' + data.models.length + ' 个模型）'
  } finally {
    fs.rmSync(storage, { recursive: true, force: true })
  }
}

/** 验证 Web 包：起服务 → 抓页面与 ping。 */
async function verifyWeb(destRoot) {
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-pack-web-'))
  const env = { ...process.env, ARK_API_KEY: '', RELAY_API_KEY: '', RELAY_BASE_URL: '', TEMP: os.tmpdir(), TMP: os.tmpdir() }
  const child = spawn(process.execPath, [path.join(destRoot, 'platforms', 'web', 'serve.js'), '--port', '0', '--storage', storage, '--demo'], {
    cwd: destRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  child.stderr.on('data', (chunk) => { output += String(chunk) })
  let port = 0
  for (let i = 0; i < 30 && !port; i += 1) {
    const match = /http:\/\/127\.0\.0\.1:(\d+)/.exec(output)
    if (match) port = Number(match[1])
    else await new Promise((resolve) => setTimeout(resolve, 100))
  }
  try {
    if (!port) throw new Error('Web 包启动失败：' + output.slice(0, 300))
    const page = await fetch('http://127.0.0.1:' + port + '/')
    const html = await page.text()
    if (page.status !== 200 || !html.includes('Seedance')) throw new Error('Web 包页面异常')
    const ping = await fetch('http://127.0.0.1:' + port + '/api/seedance/ping')
    if (ping.status !== 200) throw new Error('Web 包 ping 异常')
    return 'Web 包可用（页面 200/' + html.length + ' 字符、ping 200）'
  } finally {
    child.kill()
    await new Promise((resolve) => setTimeout(resolve, 300))
    fs.rmSync(storage, { recursive: true, force: true })
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help || !options.platform) {
    console.log('用法：node scripts/pack.mjs --platform dsh|cli|web|codex|all [--out dist] [--clean] [--no-verify]')
    if (!options.platform && !options.help) process.exitCode = 2
    return
  }
  const outDir = path.resolve(ROOT, options.out)
  const targets = options.platform === 'all' ? PLATFORMS.slice() : [options.platform]
  for (const platform of targets) {
    if (PLATFORMS.indexOf(platform) === -1) throw new Error('未知形态：' + platform + '（可用：dsh / cli / web / codex / all）')
  }
  // Validate resolved paths before deleting generated output. --out must never
  // overwrite the source tree (including through a junction/symlink).
  const { assertPackDestination } = await import('./pack-paths.mjs')
  for (const platform of targets) assertPackDestination(ROOT, outDir, platform)
  console.log('打包目标：' + targets.join(', ') + ' → ' + path.relative(ROOT, outDir) + '/')
  for (const platform of targets) {
    const result = await packPlatform(platform, outDir)
    console.log('  ✓ ' + platform + '/  ' + result.files + ' 个文件，' + (result.bytes / 1024).toFixed(1) + ' KB')
  }
  if (!options.verify) return
  console.log('\n验证：')
  const verifiers = { dsh: verifyDsh, cli: verifyCli, web: verifyWeb,
    codex: async destRoot => (await import('./codex/verify-package.mjs')).verifyCodex(destRoot) }
  for (const platform of targets) {
    const message = await verifiers[platform](path.join(outDir, platform))
    console.log('  ✓ ' + message)
  }
  console.log('\n打包完成。')
}

main().catch((error) => {
  console.error('打包失败：' + (error && error.message ? error.message : String(error)))
  process.exitCode = 1
})
