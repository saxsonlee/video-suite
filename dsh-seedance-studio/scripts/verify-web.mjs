#!/usr/bin/env node
/**
 * verify-web.mjs — 一键验证 DSH bundle 插件的安装/加载链路（测试实例，绝不碰 desktop profile）。
 *
 * 流程：
 *   1) 确保测试 profile 存在（不存在则用 dsh CLI 从 web 模板初始化）；
 *   2) 若给了 --package：确保 link 安装 + dsh.profile.bundles 已启用（复用 install-bundle.mjs）；
 *   3) 后台启动 dsh web（默认端口 51999，--no-open），从输出解析带 token 的 URL；
 *      立即 GET tokenUrl（redirect=manual）换 cookie，落盘 <log-dir>/web-cookie.json（不含 token）；
 *   4) 轮询 GET /api/seedance/ping 直到 200（可用 --ping-path 覆盖）；
 *   5) GET /（带 cookie）解析 globalThis.__DSH_BOOT__，确认 bundle 的 client 条目在客户端启动模块图；
 *      再 GET 该条目的 combo URL，确认 200 且 body 含 __ModuleLoader__；
 *   6) 检查宿主 boot.log 在实例启动后出现新行（--boot-log 可指定；默认自动找 <home>/storages/<name>/boot.log）；
 *   7) 全部通过则 PASS（退出码 0），否则 FAIL（退出码 1）；结束 taskkill 实例进程树并确认端口释放。
 *
 * --hmr 模式：先确保 profile 未安装/未启用该插件，启动实例后再执行热安装（pnpm link + bundles 追加），
 *             轮询 HMR 是否挂载宿主 + 客户端 graph；用于回答「运行中的应用能否热加载新插件」。
 * --keep：PASS 后保留实例运行（写 cookie keepAlive=true），打印复用信息，Ctrl+C 时清理退出（供 QA/Lead 复用）。
 *
 * 用法：
 *   <runtime node> scripts/verify-web.mjs                                  # 冷启动验证 seedance-dev + 已装插件
 *   <runtime node> scripts/verify-web.mjs --package <包目录>               # 先安装再冷启动验证
 *   <runtime node> scripts/verify-web.mjs --hmr                            # 热安装（HMR）验证
 *   <runtime node> scripts/verify-web.mjs --keep                           # 常驻实例供 E2E 复用
 * 选项：--profile <名> --home <DSH_HOME> --package <目录> --port 51999 --timeout 120000
 *       --log-dir <目录> --boot-log <文件> --ping-path <路径> --bundle <包名> --hmr --keep --json
 * 退出码：0 PASS；1 FAIL。
 */
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { ensureProfile, installBundle } from './install-bundle.mjs'

const RUNTIME_NODE = process.env.DSH_SPIKE_NODE
  ?? 'D:\\DeepSeek\\resources\\runtime\\primary-runtime\\dependencies\\node\\bin\\node.exe'
const ELECTRON = process.env.DSH_SPIKE_ELECTRON ?? 'D:\\DeepSeek\\DeepSeek Harness.exe'
const DSH_BIN = process.env.DSH_SPIKE_DSH_BIN
  ?? 'D:\\DeepSeek\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js'
const DEFAULT_HOME = path.join(os.homedir(), '.dsh')
const WORKSPACE = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')

function parseArgs(argv) {
  const out = { profile: 'seedance-dev', port: 51999, timeout: 120000, hmr: false, keep: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => { const v = argv[++i]; if (v === undefined) fail('缺少参数值：' + a); return v }
    switch (a) {
      case '--profile': out.profile = next(); break
      case '--home': out.home = next(); break
      case '--package': out.package = next(); break
      case '--port': out.port = Number(next()); break
      case '--timeout': out.timeout = Number(next()); break
      case '--log-dir': out.logDir = next(); break
      case '--boot-log': out.bootLog = next(); break
      case '--ping-path': out.pingPath = next(); break
      case '--bundle': out.bundle = next(); break
      case '--hmr': out.hmr = true; break
      case '--keep': out.keep = true; break
      case '--json': out.json = true; break
      case '-h': case '--help': out.help = true; break
      default: fail('未知参数：' + a)
    }
  }
  return out
}
function fail(message) { console.error('[verify-web] ERROR: ' + message); process.exit(1) }
function info(...args) { console.log('[verify-web]', ...args) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function resolveHome(opts) { return path.resolve(opts.home ?? process.env.DSH_HOME ?? DEFAULT_HOME) }
function profileDirOf(opts) { return path.join(resolveHome(opts), 'profiles', opts.profile) }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }
function readProfileManifest(dir) { const f = path.join(dir, 'package.json'); return fs.existsSync(f) ? readJson(f) : undefined }

function portInUse(port) {
  const res = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true })
  return (res.stdout ?? '').split('\n').some((line) => line.includes(':' + port + ' ') && line.includes('LISTENING'))
}
function httpGet(port, pathname, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'GET', headers: headers ?? {} }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end()
  })
}
function killTree(pid) {
  if (!pid) return
  try { spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true }) } catch { /* ignore */ }
}
async function waitPortFree(port, ms) {
  const deadline = Date.now() + (ms ?? 10000)
  while (Date.now() < deadline) { if (!portInUse(port)) return true; await sleep(500) }
  return !portInUse(port)
}

function deriveBundleName(opts) {
  if (opts.bundle) return opts.bundle
  if (opts.package) return readJson(path.join(path.resolve(opts.package), 'package.json')).name
  const manifest = readProfileManifest(profileDirOf(opts))
  const bundles = manifest?.dsh?.profile?.bundles ?? []
  const candidates = bundles.filter((b) => !String(b).startsWith('@deepseek-ai/'))
  return candidates.length > 0 ? candidates[candidates.length - 1] : undefined
}
function resolveBootLog(opts, home, startedAt) {
  if (opts.bootLog) return path.resolve(opts.bootLog)
  const storages = path.join(home, 'storages')
  if (!fs.existsSync(storages)) return undefined
  const candidates = []
  for (const entry of fs.readdirSync(storages, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const file = path.join(storages, entry.name, 'boot.log')
    if (fs.existsSync(file)) candidates.push({ file, mtime: fs.statSync(file).mtimeMs })
  }
  if (candidates.length === 0) return undefined
  candidates.sort((a, b) => b.mtime - a.mtime)
  const fresh = candidates.find((c) => c.mtime >= startedAt - 5000)
  return (fresh ?? candidates[0]).file
}
function findBootGraph(html) {
  const marker = 'globalThis["__DSH_BOOT__"] = '
  const at = html.indexOf(marker)
  if (at === -1) return undefined
  const start = at + marker.length
  const end = html.indexOf('</script>', start)
  if (end === -1) return undefined
  try { return { graph: JSON.parse(html.slice(start, end).trim()), raw: html.slice(start, end).trim() } } catch { return undefined }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help || Number.isNaN(opts.port)) {
    console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 30).join('\n'))
    process.exit(opts.help ? 0 : 1)
  }
  const home = resolveHome(opts)
  const profDir = profileDirOf(opts)
  const logDir = path.resolve(opts.logDir ?? path.join(os.tmpdir(), 'dsh-seedance-verify'))
  fs.mkdirSync(logDir, { recursive: true })
  const bundleName = deriveBundleName(opts)
  const pingPath = opts.pingPath ?? '/api/seedance/ping'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const summary = { startedAt: new Date().toISOString(), profile: opts.profile, profileDir: profDir, port: opts.port, bundleName, hmr: opts.hmr, steps: {}, pass: false }
  const report = (key, value) => { summary.steps[key] = value; info(key + ':', typeof value === 'string' ? value : JSON.stringify(value)) }

  // ── 0) profile ──
  const ensured = ensureProfile({ profile: opts.profile, home })
  report('profileReady', { dir: profDir, created: ensured.created })

  // ── 1) 冷启动安装（可选）──
  if (opts.package && !opts.hmr) {
    const installed = await installBundle({ profile: opts.profile, home, package: path.resolve(opts.package), apply: true })
    report('install', { alreadyInstalled: installed.alreadyInstalled, bundles: installed.bundlesAfter })
  }

  // ── 2) HMR 模式：确保 profile 尚未启用插件 ──
  if (opts.hmr) {
    const manifest = readProfileManifest(profDir)
    const bundles = manifest?.dsh?.profile?.bundles ?? []
    if (bundleName && bundles.includes(bundleName)) {
      const { spawnSync: run } = await import('node:child_process')
      const next = { ...manifest, dsh: { ...manifest.dsh, profile: { ...manifest.dsh.profile, bundles: bundles.filter((b) => b !== bundleName) } } }
      fs.writeFileSync(path.join(profDir, 'package.json'), JSON.stringify(next, null, 2) + '\n')
      run(RUNTIME_NODE, [process.env.DSH_SPIKE_PNPM ?? 'D:\\DeepSeek\\resources\\runtime\\primary-runtime\\dependencies\\pnpm\\bin\\pnpm.mjs', 'remove', bundleName], { cwd: profDir, encoding: 'utf8', windowsHide: true, timeout: 240000, env: { ...process.env, CI: '1' } })
      report('hmrReset', { removedBundle: bundleName })
    }
    const afterReset = readProfileManifest(profDir)
    const resetBundles = afterReset?.dsh?.profile?.bundles ?? []
    report('hmrResetState', { bundles: resetBundles, removed: bundleName ? !resetBundles.includes(bundleName) : null })
    if (bundleName && resetBundles.includes(bundleName)) fail('hmr 预清理失败：profile 仍启用 ' + bundleName + '（可能有并发进程在写 profile，请稍后重试）')
  }

  const manifestNow = readProfileManifest(profDir)
  const enabledBundles = manifestNow?.dsh?.profile?.bundles ?? []
  if (bundleName && !enabledBundles.includes(bundleName)) {
    if (!opts.hmr) fail('profile 的 dsh.profile.bundles 不含 ' + bundleName + '；先运行 install-bundle.mjs --apply 或传 --package')
  }

  if (portInUse(opts.port)) fail('端口 ' + opts.port + ' 已被占用，请换 --port 或先释放')

  // ── 3) 启动实例 ──
  const outPath = path.join(logDir, 'web-' + stamp + '.out.log')
  const errPath = path.join(logDir, 'web-' + stamp + '.err.log')
  const outFd = fs.openSync(outPath, 'a')
  const errFd = fs.openSync(errPath, 'a')
  const startedAt = Date.now()
  const child = spawn(ELECTRON, [DSH_BIN, '--profile', opts.profile, '--port', String(opts.port), '--no-open'], {
    cwd: WORKSPACE,
    env: { ...process.env, DSH_HOME: home, ELECTRON_RUN_AS_NODE: '1', DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
    stdio: ['ignore', outFd, errFd], windowsHide: true,
  })
  const pid = child.pid
  summary.pid = pid
  report('spawn', { pid, outLog: outPath, errLog: errPath })

  let token
  let url
  const bootDeadline = Date.now() + Math.min(opts.timeout, 90000)
  while (Date.now() < bootDeadline) {
    const txt = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : ''
    const m = txt.match(/dsh web:\s*(http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_\-]+))/)
    if (m) { url = m[1]; token = m[3]; break }
    const err = fs.existsSync(errPath) ? fs.readFileSync(errPath, 'utf8') : ''
    if (err.includes('Error:') && !err.includes('ExperimentalWarning')) break
    await sleep(500)
  }
  if (!token) {
    killTree(pid)
    await waitPortFree(opts.port)
    console.error('[verify-web] FAIL: 实例未在超时内输出 dsh web URL。stderr tail:\n' + (fs.existsSync(errPath) ? fs.readFileSync(errPath, 'utf8').slice(-3000) : ''))
    summary.error = 'no-url'
    fs.writeFileSync(path.join(logDir, 'verify-web-summary.json'), JSON.stringify(summary, null, 2))
    process.exit(1)
  }
  report('boot', { listening: true, urlRedacted: 'http://127.0.0.1:' + opts.port + '/?token=<redacted>', bootMs: Date.now() - startedAt })

  // ── 4) 立即换 cookie 并落盘 ──
  const tokenExchange = await httpGet(opts.port, '/?token=' + encodeURIComponent(token))
  const setCookie = [].concat(tokenExchange.headers['set-cookie'] ?? []).map(String)
  const cookie = String(setCookie[0] ?? '').split(';')[0]
  if (!cookie) { killTree(pid); console.error('[verify-web] FAIL: token 交换未返回 Set-Cookie'); process.exit(1) }
  const cookieFile = path.join(logDir, 'web-cookie.json')
  const cookieData = { origin: 'http://127.0.0.1:' + opts.port, port: opts.port, cookieName: cookie.split('=')[0], cookie, setCookie, obtainedAt: new Date().toISOString(), pid, keepAlive: false, note: 'launch-token exchange (GET /?token=...), cookie valid while this dsh web instance lives' }
  fs.writeFileSync(cookieFile, JSON.stringify(cookieData, null, 2))
  report('auth', { tokenExchangeStatus: tokenExchange.status, cookieName: cookieData.cookieName, cookieFile })

  // ── 4.5) HMR 基线校验：热安装前插件必须尚未挂载 ──
  if (opts.hmr) {
    let baselinePing
    try { baselinePing = await httpGet(opts.port, pingPath, { cookie }) } catch { baselinePing = undefined }
    let baselineEntry
    try { const bIdx = await httpGet(opts.port, '/', { cookie }); const bParsed = findBootGraph(bIdx.body); baselineEntry = bundleName ? bParsed?.graph?.entries?.find((e) => e.id === bundleName) : undefined } catch { baselineEntry = undefined }
    const baselineClean = (!baselinePing || baselinePing.status !== 200) && !baselineEntry
    report('hmrBaseline', { clean: baselineClean, pingStatus: baselinePing?.status ?? 'request-error', graphEntry: baselineEntry ?? null })
    if (!baselineClean) {
      killTree(pid); await waitPortFree(opts.port)
      summary.error = 'hmr-baseline-contaminated'
      fs.writeFileSync(path.join(logDir, 'verify-web-summary.json'), JSON.stringify(summary, null, 2))
      console.error('[verify-web] FAIL: HMR 基线被污染——热安装前插件已挂载（可能另一进程/队友同时写 profile package.json 或启动了实例）。请隔离环境后重跑。')
      process.exit(1)
    }
  }

  // ── 5) 轮询 ping ──
  const deadline = Date.now() + opts.timeout
  let ping
  let lastPing
  while (Date.now() < deadline) {
    try { ping = await httpGet(opts.port, pingPath, { cookie }) } catch (e) { lastPing = 'request-error: ' + e.message; await sleep(500); continue }
    lastPing = { status: ping.status, body: ping.body.slice(0, 300) }
    if (ping.status === 200 && ping.body.includes('"ok"')) break
    await sleep(700)
  }
  const pingOk = !!ping && ping.status === 200
  report('ping', { path: pingPath, ok: pingOk, status: lastPing?.status, body: ping?.body?.slice(0, 300) })
  fs.writeFileSync(path.join(logDir, 'verify-web-ping.json'), JSON.stringify({ path: pingPath, status: lastPing?.status, ok: pingOk, body: ping?.body ?? '', at: new Date().toISOString() }, null, 2))

  // ── 6) 客户端启动模块图 + bundle 资源 ──
  let graphEntry
  let bundleStep
  const index = await httpGet(opts.port, '/', { cookie })
  const parsed = findBootGraph(index.body)
  if (parsed && bundleName) graphEntry = parsed.graph.entries?.find((e) => e.id === bundleName)
  report('bootGraph', { indexStatus: index.status, entries: parsed?.graph?.entries?.length ?? 0, bundleEntry: graphEntry ?? null })
  if (graphEntry) {
    const bundleUrl = '/' + String(graphEntry.url).replace(/^\/+/, '')
    const bundleRes = await httpGet(opts.port, bundleUrl, { cookie })
    bundleStep = { url: bundleUrl, status: bundleRes.status, bytes: bundleRes.body.length, hasModuleLoader: bundleRes.body.includes('__ModuleLoader__'), hasBundleId: bundleRes.body.includes(bundleName) }
    if (bundleRes.body.length > 0) fs.writeFileSync(path.join(logDir, 'bundle-' + stamp + '.client.js'), bundleRes.body)
    report('bundle', bundleStep)
  }
  // 无 cookie 应 401（鉴权生效）
  let indexNoAuth
  try { indexNoAuth = (await httpGet(opts.port, '/')).status } catch { indexNoAuth = 'error' }
  report('authNegative', { indexWithoutCookie: indexNoAuth })

  // ── 7) boot.log ──
  const bootLog = resolveBootLog(opts, home, startedAt)
  let bootLogStep = { file: bootLog ?? null, fresh: false, tail: '' }
  if (bootLog) {
    const content = fs.readFileSync(bootLog, 'utf8')
    const lines = content.trim().split('\n').filter(Boolean)
    const fresh = lines.filter((line) => { const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/); return m && Date.parse(m[1]) >= startedAt - 5000 })
    bootLogStep = { file: bootLog, fresh: fresh.length > 0, freshLines: fresh.slice(-10), tail: lines.slice(-5) }
  }
  report('bootLog', bootLogStep)

  // ── 8) HMR 热安装（若 --hmr）──
  if (opts.hmr) {
    if (!opts.package) { killTree(pid); fail('--hmr 需要 --package <包目录>') }
    if (pingOk) report('hmrPingBefore', { status: lastPing?.status, note: 'plugin should NOT be active before hot install' })
    const hmrStart = Date.now()
    const installed = await installBundle({ profile: opts.profile, home, package: path.resolve(opts.package), apply: true })
    report('hmrInstall', { bundles: installed.bundlesAfter, applyMs: Date.now() - hmrStart })
    const hmrDeadline = Date.now() + opts.timeout
    let hmrPingOk = false
    let hmrGraphEntry
    let hmrLogFresh = false
    let hmrElapsed
    while (Date.now() < hmrDeadline) {
      const content = bootLog ? fs.readFileSync(bootLog, 'utf8') : ''
      const fresh = content.trim().split('\n').filter(Boolean).some((line) => { const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/); return m && Date.parse(m[1]) >= hmrStart })
      let hp
      try { hp = await httpGet(opts.port, pingPath, { cookie }) } catch { hp = undefined }
      let entry
      try {
        const idx = await httpGet(opts.port, '/', { cookie })
        const p = findBootGraph(idx.body)
        entry = bundleName ? p?.graph.entries?.find((e) => e.id === bundleName) : undefined
      } catch { entry = undefined }
      if (fresh && hp?.status === 200 && entry) {
        hmrLogFresh = true; hmrPingOk = true; hmrGraphEntry = entry; hmrElapsed = Date.now() - hmrStart; break
      }
      hmrLogFresh = hmrLogFresh || fresh
      hmrGraphEntry = hmrGraphEntry || entry
      await sleep(1000)
    }
    report('hmr', { elapsedMs: hmrElapsed ?? null, bootLogFresh: hmrLogFresh, pingOk: hmrPingOk, graphEntry: hmrGraphEntry ?? null })
    summary.pass = hmrLogFresh && hmrPingOk && !!hmrGraphEntry
  } else {
    summary.pass = pingOk
      && !!graphEntry
      && !!bundleStep && bundleStep.status === 200 && bundleStep.hasModuleLoader
      && bootLogStep.fresh
  }

  // ── 9) 清理 / --keep ──
  if (summary.pass && opts.keep) {
    cookieData.keepAlive = true
    cookieData.pid = pid
    fs.writeFileSync(cookieFile, JSON.stringify(cookieData, null, 2))
    summary.kept = true
    fs.writeFileSync(path.join(logDir, 'verify-web-summary.json'), JSON.stringify(summary, null, 2))
    info('PASS — 实例保持运行（--keep）。复用信息（不含 token）：')
    info('  origin   : http://127.0.0.1:' + opts.port)
    info('  cookie   : ' + cookieFile)
    info('  pid      : ' + pid)
    info('  bootLog  : ' + (bootLog ?? 'n/a'))
    info('  graph    : ' + JSON.stringify({ bundle: bundleName, entry: graphEntry?.id, rev: graphEntry?.rev }))
    info('  ping     : ' + (pingOk ? '200' : 'FAILED') + '（重启后 token/cookie 会变化，重新读取 web-cookie.json）')
    info('  Ctrl+C 退出并自动 kill 实例。')
    await new Promise((resolve) => {
      const stop = async () => { info('收到中断，清理实例…'); killTree(pid); await waitPortFree(opts.port); resolve() }
      process.on('SIGINT', stop)
      process.on('SIGTERM', stop)
    })
    process.exit(0)
  }

  killTree(pid)
  const freed = await waitPortFree(opts.port)
  report('cleanup', { killed: true, portFreed: freed })
  summary.finishedAt = new Date().toISOString()
  fs.writeFileSync(path.join(logDir, 'verify-web-summary.json'), JSON.stringify(summary, null, 2))
  if (opts.json) console.log(JSON.stringify(summary, null, 2))
  if (summary.pass) { console.log('[verify-web] PASS — 插件加载链路全部通过（宿主 boot.log / ping 200 / client boot graph / bundle 200）'); process.exit(0) }
  console.log('[verify-web] FAIL — 见上方步骤输出与 ' + path.join(logDir, 'verify-web-summary.json'))
  if (lastPing?.status === 400) console.log('[verify-web] 提示：ping 400 通常因为精确 Fetch 路由未声明 requestBody: "buffered"（GET 请求会被 bridge 当作 streaming 抛 TypeError，webserver 回 400）。参考 dsh-client-ui-deliverables/lib/index.js:49。')
  process.exit(1)
}

if (import.meta.main) await main()
