#!/usr/bin/env node
/**
 * install-bundle.mjs — 把一个本地工作区 bundle 插件安装进 DSH profile（幂等、可回滚）。
 *
 * 做什么（对应 PLAN §3 与 dsh-app-boot 的 profile 契约）：
 *   1) 初始化 profile（不存在时用 dsh CLI 从随附 web 模板初始化，不启动服务）；
 *   2) 用 runtime pnpm 执行 add link:<package>，在 profile/node_modules 建立指向工作区的符号链接；
 *   3) 把包的 dsh.bundle 名（默认=package.json name）追加到 profile package.json 的 dsh.profile.bundles（有序、去重）；
 *   4) 备份 package.json + pnpm-lock.yaml，支持 --rollback 还原。
 *
 * 默认 dry-run，只打印计划；--apply 才落盘。dsh 运行时把 profile 的 dsh.profile.bundles 作为 patch 层组合，
 * 新增 bundle 后运行中的在线 profile（HMR 启用）会自动重组并挂载插件，无需重启桌面应用。
 *
 * 用法：
 *   <runtime node> scripts/install-bundle.mjs --profile seedance-dev --package <包目录>            # dry-run
 *   <runtime node> scripts/install-bundle.mjs --profile seedance-dev --package <包目录> --apply     # 安装
 *   <runtime node> scripts/install-bundle.mjs --profile seedance-dev --rollback                    # 回滚最近一次安装
 *   <runtime node> scripts/install-bundle.mjs --profile desktop --package <包目录> --apply --allow-desktop
 *
 * 选项：--profile <名> --home <DSH_HOME> --package <目录> --bundles-name <名> --apply --rollback --json --allow-desktop
 * 退出码：0 成功/无需变更；1 失败。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// 运行时绝对路径（PLAN §10；可用环境变量覆盖）
const RUNTIME_NODE = process.env.DSH_SPIKE_NODE
  ?? 'D:\\DeepSeek\\resources\\runtime\\primary-runtime\\dependencies\\node\\bin\\node.exe'
const RUNTIME_PNPM = process.env.DSH_SPIKE_PNPM
  ?? 'D:\\DeepSeek\\resources\\runtime\\primary-runtime\\dependencies\\pnpm\\bin\\pnpm.mjs'
const ELECTRON = process.env.DSH_SPIKE_ELECTRON ?? 'D:\\DeepSeek\\DeepSeek Harness.exe'
const DSH_BIN = process.env.DSH_SPIKE_DSH_BIN
  ?? 'D:\\DeepSeek\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js'
const DEFAULT_HOME = path.join(os.homedir(), '.dsh')
const BACKUP_DIRNAME = '.spike-install-backup'

function parseArgs(argv) {
  const out = { apply: false, rollback: false, json: false, allowDesktop: false, bundlesName: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => { const v = argv[++i]; if (v === undefined) fail('缺少参数值：' + a); return v }
    switch (a) {
      case '--profile': out.profile = next(); break
      case '--home': out.home = next(); break
      case '--package': out.package = next(); break
      case '--bundles-name': out.bundlesName = next(); break
      case '--apply': out.apply = true; break
      case '--rollback': out.rollback = true; break
      case '--json': out.json = true; break
      case '--allow-desktop': out.allowDesktop = true; break
      case '-h': case '--help': out.help = true; break
      default: fail('未知参数：' + a)
    }
  }
  return out
}
function fail(message) { console.error('[install-bundle] ERROR: ' + message); process.exit(1) }
function log(...args) { if (!globalThis.__jsonMode) console.log('[install-bundle]', ...args) }

function resolveHome(opts) { return path.resolve(opts.home ?? process.env.DSH_HOME ?? DEFAULT_HOME) }
function resolveProfileDir(opts) {
  const home = resolveHome(opts)
  const name = opts.profile
  if (!name) fail('必须提供 --profile <profile 名>')
  if (name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name === 'node_modules') fail('非法 profile 名：' + name)
  return { home, name, dir: path.join(home, 'profiles', name) }
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function writeJsonAtomic(file, value) {
  const tmp = file + '.tmp-' + process.pid
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  fs.renameSync(tmp, file)
}
function readManifest(profileDir) {
  const file = path.join(profileDir, 'package.json')
  if (!fs.existsSync(file)) return undefined
  return readJson(file)
}
function bundleNames(manifest) { return manifest?.dsh?.profile?.bundles ?? [] }
function backupDir(profileDir, stamp) { return path.join(profileDir, BACKUP_DIRNAME, stamp) }

/** 用 dsh CLI（Electron as Node）从随附 web 模板初始化 profile；不启动任何服务。 */
function initProfileFromWebTemplate({ home, name, dir, outLog }) {
  if (!fs.existsSync(ELECTRON)) fail('找不到 Electron 可执行文件：' + ELECTRON + '（可用 DSH_SPIKE_ELECTRON 覆盖）')
  // 注意：普通 node 看不到 app.asar 内部文件，fs.existsSync 会误判；asar 内路径交给 Electron-as-Node 解析。
  if (!DSH_BIN.includes('.asar') && !fs.existsSync(DSH_BIN)) fail('找不到 dsh CLI：' + DSH_BIN + '（可用 DSH_SPIKE_DSH_BIN 覆盖）')
  log('初始化 profile ' + name + ' ← web 模板（dsh --dump-config，不启动）…')
  const native = spawnSync(ELECTRON, [DSH_BIN, '--profile', name, '--from-default-profile', 'web', '--dump-config'], {
    encoding: 'utf8', timeout: 180000, windowsHide: true,
    env: { ...process.env, DSH_HOME: home, ELECTRON_RUN_AS_NODE: '1' },
  })
  if (native.error) fail('profile 初始化失败：' + native.error.message)
  if (native.status !== 0) fail('profile 初始化失败（exit ' + native.status + '）：' + (native.stderr || native.stdout || '').slice(-2000))
  if (outLog) fs.writeFileSync(outLog, native.stdout ?? '')
  if (!fs.existsSync(path.join(dir, 'package.json'))) fail('profile 初始化后仍找不到 package.json：' + dir)
}

function pnpmRun(profileDir, args, timeoutMs) {
  const res = spawnSync(RUNTIME_NODE, [RUNTIME_PNPM, ...args], {
    cwd: profileDir, encoding: 'utf8', timeout: timeoutMs ?? 240000, windowsHide: true,
    env: { ...process.env, CI: '1' },
  })
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', error: res.error?.message }
}
function packageInfo(packageDir) {
  const manifest = readJson(path.join(packageDir, 'package.json'))
  if (typeof manifest.name !== 'string') fail('包的 package.json 缺 name：' + packageDir)
  if (manifest.dsh?.bundle === undefined) fail('包没有 dsh.bundle 声明，不是 DSH bundle：' + packageDir)
  return { name: manifest.name, version: manifest.version }
}

function snapshotFiles(profileDir, stamp) {
  const dir = path.join(profileDir, BACKUP_DIRNAME, stamp)
  fs.mkdirSync(dir, { recursive: true })
  const copied = []
  for (const f of ['package.json', 'pnpm-lock.yaml']) {
    const src = path.join(profileDir, f)
    if (fs.existsSync(src)) { fs.copyFileSync(src, path.join(dir, f)); copied.push(f) }
  }
  const meta = { createdAt: new Date().toISOString(), profileDir, files: copied }
  fs.writeFileSync(path.join(dir, 'backup-meta.json'), JSON.stringify(meta, null, 2) + '\n')
  return dir
}
function latestBackup(profileDir) {
  const root = path.join(profileDir, BACKUP_DIRNAME)
  if (!fs.existsSync(root)) return undefined
  const dirs = fs.readdirSync(root).filter((d) => fs.existsSync(path.join(root, d, 'backup-meta.json'))).sort()
  if (dirs.length === 0) return undefined
  return path.join(root, dirs[dirs.length - 1])
}
function sameRealDirectory(left, right) {
  try {
    const a = fs.realpathSync.native(left).toLowerCase()
    const b = fs.realpathSync.native(right).toLowerCase()
    return a === b
  } catch { return false }
}
function linkSpecMatches(depSpec, packageDir) {
  if (typeof depSpec !== 'string' || !depSpec.startsWith('link:')) return false
  return sameRealDirectory(depSpec.slice('link:'.length), packageDir)
}
function linkTargetMatches(profileDir, packageName, packageDir) {
  const linkedDir = path.join(profileDir, 'node_modules', packageName)
  if (!fs.existsSync(path.join(linkedDir, 'package.json'))) return false
  return sameRealDirectory(linkedDir, packageDir)
}
function restoreFile(backup, profileDir, name) {
  const src = path.join(backup, name)
  const dst = path.join(profileDir, name)
  if (!fs.existsSync(src)) return false
  fs.copyFileSync(src, dst)
  return true
}

/** 确保 profile 已初始化（不存在时从 web 模板初始化，不启动）。返回 { profile, created }。 */
export function ensureProfile(opts) {
  const profile = resolveProfileDir(opts)
  let manifest = readManifest(profile.dir)
  if (manifest) return { profile, created: false }
  if (profile.name === 'desktop') fail('desktop profile 未初始化；桌面应用负责初始化其 profile，拒绝创建')
  initProfileFromWebTemplate({ home: profile.home, name: profile.name, dir: profile.dir })
  return { profile, created: true }
}

/** 核心：安装（opts.apply=false 时只算计划）。 */
export async function installBundle(opts) {
  const apply = !!opts.apply
  const profile = resolveProfileDir(opts)
  if (!opts.package) fail('必须提供 --package <包目录>')
  const packageDir = path.resolve(opts.package)
  if (!fs.existsSync(path.join(packageDir, 'package.json'))) fail('包目录没有 package.json：' + packageDir)
  const info = packageInfo(packageDir)
  const wantedBundle = opts.bundlesName ?? info.name
  const result = { profile, packageDir, packageName: info.name, packageVersion: info.version, bundleName: wantedBundle, changes: [], alreadyInstalled: false }

  let manifest = readManifest(profile.dir)
  if (!manifest) {
    if (profile.name === 'desktop') fail('desktop profile 未初始化；桌面应用负责初始化其 profile，拒绝创建')
    if (apply) {
      initProfileFromWebTemplate({ home: profile.home, name: profile.name, dir: profile.dir })
      manifest = readManifest(profile.dir)
    } else {
      result.changes.push('将初始化 profile：' + profile.dir)
    }
  }
  if (manifest) {
    const deps = manifest.dependencies ?? {}
    const bundles = bundleNames(manifest)
    result.dependenciesBefore = deps
    result.bundlesBefore = [...bundles]
    const depOk = linkSpecMatches(deps[info.name], packageDir)
    const bundleOk = bundles.includes(wantedBundle)
    const linked = linkTargetMatches(profile.dir, info.name, packageDir)
    result.alreadyInstalled = depOk && bundleOk && linked
    if (!depOk) result.changes.push('dependencies["' + info.name + '"] := "link:' + packageDir.replaceAll('\\', '/') + '"' + (deps[info.name] ? '（现有 link 指向其他目录，需重装）' : ''))
    if (!linked) result.changes.push('node_modules 缺少指向包目录的 link（需要 pnpm add）')

    if (!bundleOk) result.changes.push('dsh.profile.bundles += "' + wantedBundle + '"（追加到末尾）')
    if (result.alreadyInstalled) result.changes.push('已安装且已启用：无需变更')
  } else {
    result.bundlesBefore = []
    result.dependenciesBefore = {}
  }

  if (!apply) return result

  if (profile.name === 'desktop' && !opts.allowDesktop) fail('desktop profile 需要显式 --allow-desktop（提醒：桌面应用禁止重启；安装/回滚依赖 HMR 在线重组）')

  const currentDeps = manifest?.dependencies ?? {}
  const currentBundles = bundleNames(manifest)
  const linkedNow = linkTargetMatches(profile.dir, info.name, packageDir)
  const needsDep = !(linkSpecMatches(currentDeps[info.name], packageDir) && linkedNow)
  const needsBundle = !currentBundles.includes(wantedBundle)
  if (!needsDep && !needsBundle) { result.alreadyInstalled = true; return result }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  result.backupDir = snapshotFiles(profile.dir, stamp)

  if (needsDep || !linkedNow) {
    const spec = 'link:' + packageDir.replaceAll('\\', '/')
    log('pnpm add ' + spec + '（cwd=' + profile.dir + '）…')
    const add = pnpmRun(profile.dir, ['add', spec])
    result.pnpmAdd = { status: add.status, stdout: add.stdout.slice(-4000), stderr: add.stderr.slice(-4000) }
    if (add.status !== 0) {
      restoreFile(result.backupDir, profile.dir, 'package.json')
      restoreFile(result.backupDir, profile.dir, 'pnpm-lock.yaml')
      fail('pnpm add 失败（exit ' + add.status + '）：' + (add.stderr || add.stdout).slice(-1500) + '\n已恢复 profile package.json/lockfile')
    }
  }

  manifest = readManifest(profile.dir)
  const bundles = bundleNames(manifest)
  if (!bundles.includes(wantedBundle)) {
    const next = { ...manifest, dsh: { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...bundles, wantedBundle] } } }
    writeJsonAtomic(path.join(profile.dir, 'package.json'), next)
    manifest = next
  }
  result.dependenciesAfter = manifest.dependencies ?? {}
  result.bundlesAfter = bundleNames(manifest)
  return result
}

/** 回滚最近一次备份：恢复 package.json + lockfile，再 pnpm install 同步 node_modules。 */
export async function rollbackBundle(opts) {
  const profile = resolveProfileDir(opts)
  if (!fs.existsSync(path.join(profile.dir, 'package.json'))) fail('profile 未初始化：' + profile.dir)
  const backup = latestBackup(profile.dir)
  if (!backup) fail('找不到可回滚的备份（' + path.join(profile.dir, BACKUP_DIRNAME) + '）')
  if (profile.name === 'desktop' && !opts.allowDesktop) fail('desktop profile 回滚需要显式 --allow-desktop')
  const meta = readJson(path.join(backup, 'backup-meta.json'))
  const restored = []
  for (const f of ['package.json', 'pnpm-lock.yaml']) if (restoreFile(backup, profile.dir, f)) restored.push(f)
  const install = pnpmRun(profile.dir, ['install'])
  // pnpm install 在 lockfile 不变时可能不会替换已有的 link 目录（sync 不保证），这里按恢复后的清单逐项校验，
  // 发现链接目标不一致时再 install --force 修正，保证「回滚后 node_modules 与清单一致」。
  const verify = { checked: [], forced: false, ok: true, installStatus: install.status, stderr: install.stderr.slice(-2000) }
  const manifest = readManifest(profile.dir) ?? {}
  const deps = manifest.dependencies ?? {}
  const mismatched = []
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec !== 'string' || !spec.startsWith('link:')) continue
    const target = spec.slice('link:'.length)
    const ok = linkTargetMatches(profile.dir, name, target)
    verify.checked.push({ name, target, ok })
    if (!ok) mismatched.push(name)
  }
  if (mismatched.length > 0) {
    const forced = pnpmRun(profile.dir, ['install', '--force'])
    verify.forced = true
    verify.installStatus = forced.status
    verify.stderr = forced.stderr.slice(-2000)
    for (const item of verify.checked) item.ok = linkTargetMatches(profile.dir, item.name, item.target)
    verify.ok = verify.checked.every((item) => item.ok)
  }
  return { profile, backup, meta, restored, pnpmInstall: { status: install.status, stderr: install.stderr.slice(-2000) }, verify }
}

function printResult(result) {
  if (globalThis.__jsonMode) { console.log(JSON.stringify(result, null, 2)); return }
  console.log('\n=== install-bundle summary ===')
  console.log('profile     :', result.profile?.name, '→', result.profile?.dir)
  if (result.packageName) console.log('package     :', result.packageName + '@' + (result.packageVersion ?? '?'), '→', result.packageDir)
  if (result.bundleName) console.log('bundle      :', result.bundleName, '(dsh.profile.bundles)')
  if (result.backupDir) console.log('backup      :', result.backupDir)
  if (result.alreadyInstalled) console.log('status      : already installed, no change')
  if (result.changes?.length) { console.log('planned/applied changes:'); for (const c of result.changes) console.log('  -', c) }
  if (result.dependenciesAfter) {
    console.log('dependencies:', JSON.stringify(result.dependenciesBefore ?? {}), '→', JSON.stringify(result.dependenciesAfter))
    console.log('bundles     :', JSON.stringify(result.bundlesBefore ?? []), '→', JSON.stringify(result.bundlesAfter ?? []))
  } else if (result.bundlesBefore) {
    console.log('current deps:', JSON.stringify(result.dependenciesBefore ?? {}))
    console.log('current bundles:', JSON.stringify(result.bundlesBefore ?? []))
  }
  if (result.pnpmAdd) console.log('pnpm add    : exit', result.pnpmAdd.status)
  if (result.rollback) console.log('restored    :', result.restored.join(', '), '| pnpm install exit:', result.pnpmInstall?.status)
  if (result.rollback && result.verify) console.log('verify      :', 'link 一致=' + result.verify.ok + (result.verify.forced ? '（已用 install --force 修正）' : ''), JSON.stringify(result.verify.checked))
  console.log('next        : 在线 profile（HMR）会自动重组挂载；也可用 scripts/verify-web.mjs 起测试实例验证。')
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  globalThis.__jsonMode = !!opts.json
  if (opts.help || (!opts.rollback && !opts.package)) {
    const self = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n')
    console.log(self.slice(1, 27).join('\n'))
    process.exit(opts.help ? 0 : 1)
  }
  if (opts.rollback) { const r = await rollbackBundle(opts); r.rollback = true; printResult(r); return }
  const r = await installBundle(opts)
  printResult(r)
  if (!opts.apply) console.log('\nDRY-RUN：未写任何文件；加 --apply 执行安装。')
}

if (import.meta.main) await main()
