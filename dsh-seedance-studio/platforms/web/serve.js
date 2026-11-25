#!/usr/bin/env node
/**
 * dsh-seedance-studio — 独立后端命令行入口（不依赖 DSH）。
 *
 * 用法：
 *   node platforms/web/serve.js [--port 3000] [--host 127.0.0.1]
 *                          [--storage <dir>] [--token <secret>] [--cors]
 *                          [--api-key <ARK_API_KEY>] [--demo] [--no-static] [--verbose] [--lang zh|en]
 *
 * 示例：
 *   node platforms/web/serve.js --port 3000              # 演示模式（无 Key 自动 demo）
 *   node platforms/web/serve.js --api-key ark-xxxx       # 真实生成（方舟直连）
 *   node platforms/web/serve.js --port 8080 --cors --token my-secret
 *
 * 与 DSH 插件共享同一存储目录（默认 $DSH_HOME/storages/seedance-studio），
 * 独立后端与 DSH 页面看到同一份历史与设置；也可用 --storage 指定独立目录。
 *
 * @module dsh-seedance-studio/platforms/web/serve
 */
import { createStandaloneServer, defaultStaticDir } from './http.js'

// ==========================================================================
// i18n（终端文案；与页面 i18n.js 的 key 约定一致）
// ==========================================================================
const LANGUAGES = ['zh', 'en']
const MESSAGES = {
  zh: {
    'help.title': 'dsh-seedance-studio 独立后端 v0.1.0',
    'help.usage': '用法：node platforms/web/serve.js [options]',
    'help.options': '选项：',
    'help.port': '  --port <n>              监听端口（默认 3000）',
    'help.host': '  --host <addr>           监听地址（默认 127.0.0.1；0.0.0.0 表示对外网开放，注意安全）',
    'help.storage': '  --storage <dir>         存储目录（默认 $DSH_HOME/storages/seedance-studio，与 DSH 插件共享）',
    'help.token': '  --token <secret>        API 访问 token（默认无；建议对外暴露时启用）',
    'help.cors': '  --cors                  允许跨域（前后端分离部署时；同源前端无需）',
    'help.apiKey': '  --api-key <key>         方舟 API Key（等价 ARK_API_KEY 环境变量，仅本次进程）',
    'help.relayBase': '  --relay-base-url <url>  中转站地址（等价 RELAY_BASE_URL）',
    'help.relayKey': '  --relay-key <key>       中转站 Key（等价 RELAY_API_KEY；未给则回退 api-key）',
    'help.demo': '  --demo                  强制演示模式（不调用真实接口、不产生费用）',
    'help.noStatic': '  --no-static             不托管 platforms/web/public 静态前端（仅提供 API）',
    'help.verbose': '  --verbose               打印请求日志',
    'help.lang': '  --lang <zh|en>          终端界面语言（默认按系统语言，兜底中文）',
    'help.help': '  -h, --help              显示本帮助',
    'help.env': '环境变量（优先级低于 settings.json）：ARK_API_KEY / ARK_BASE_URL / RELAY_BASE_URL / RELAY_API_KEY / DEFAULT_MODEL / DEMO 等。',
    'help.api': 'API 前缀：/api/seedance（与 DSH 插件完全一致）：',
    'help.apiLines': '  GET  /api/seedance/ping|config|history|task\n  POST /api/seedance/generate|recreate|cancel|delete\n  GET|POST /api/seedance/settings\n  GET|HEAD /api/seedance/media?id=&kind=video|lastframe|poster',
    'error.unknownArg': '未知参数：{arg}（--help 查看用法）',
    'error.badLang': '不支持的语言：{lang}（可选：zh / en）',
    'shutdown.received': '收到 {signal}，正在停止独立后端…',
    'started.title': 'dsh-seedance-studio 独立后端已启动',
    'started.page': '  页面   ：{value}',
    'started.api': '  API    ：{value}/api/seedance',
    'started.mode': '  模式   ：{value}',
    'started.storage': '  存储   ：{value}',
    'started.static': '  静态页 ：{value}',
    'started.token': '  Token  ：{value}',
    'started.cors': '  CORS   ：{value}',
    'started.stop': '  Ctrl+C 停止',
    'mode.demo': '演示模式（未配置真实 API Key，不调用真实接口、不产生费用）',
    'mode.real': '真实模式 · {provider}',
    'provider.relay': '中转站',
    'provider.ark': '方舟直连',
    'value.notHosted': '（未托管）',
    'value.disabled': '关闭',
    'value.tokenOn': '已启用',
    'value.tokenOff': '未启用（仅建议本机使用）',
    'value.corsOn': '开启',
    'value.corsOff': '关闭',
    'storage.custom': '（--storage 指定，独立目录）',
    'storage.shared': '（与 DSH 插件共享）',
    'error.portInUse': '启动失败：端口 {port} 已被占用，请换一个 --port。',
    'error.start': '启动失败：{message}',
  },
  en: {
    'help.title': 'dsh-seedance-studio standalone backend v0.1.0',
    'help.usage': 'Usage: node platforms/web/serve.js [options]',
    'help.options': 'Options:',
    'help.port': '  --port <n>              listen port (default 3000)',
    'help.host': '  --host <addr>           listen address (default 127.0.0.1; 0.0.0.0 exposes to the network, use with care)',
    'help.storage': '  --storage <dir>         storage dir (default $DSH_HOME/storages/seedance-studio, shared with the DSH plugin)',
    'help.token': '  --token <secret>        API access token (default none; enable when exposed)',
    'help.cors': '  --cors                  allow cross-origin requests (for split frontend/backend deployments)',
    'help.apiKey': '  --api-key <key>         Ark API key (same as ARK_API_KEY, this process only)',
    'help.relayBase': '  --relay-base-url <url>  relay base URL (same as RELAY_BASE_URL)',
    'help.relayKey': '  --relay-key <key>       relay API key (same as RELAY_API_KEY; falls back to api-key)',
    'help.demo': '  --demo                  force demo mode (no real API calls, no cost)',
    'help.noStatic': '  --no-static             do not serve platforms/web/public (API only)',
    'help.verbose': '  --verbose               print request logs',
    'help.lang': '  --lang <zh|en>          terminal language (default follows the system, falls back to zh)',
    'help.help': '  -h, --help              show this help',
    'help.env': 'Environment variables (lower priority than settings.json): ARK_API_KEY / ARK_BASE_URL / RELAY_BASE_URL / RELAY_API_KEY / DEFAULT_MODEL / DEMO, etc.',
    'help.api': 'API prefix: /api/seedance (identical to the DSH plugin):',
    'help.apiLines': '  GET  /api/seedance/ping|config|history|task\n  POST /api/seedance/generate|recreate|cancel|delete\n  GET|POST /api/seedance/settings\n  GET|HEAD /api/seedance/media?id=&kind=video|lastframe|poster',
    'error.unknownArg': 'Unknown argument: {arg} (use --help for usage)',
    'error.badLang': 'Unsupported language: {lang} (available: zh / en)',
    'shutdown.received': 'Received {signal}, stopping the standalone backend…',
    'started.title': 'dsh-seedance-studio standalone backend started',
    'started.page': '  Page    : {value}',
    'started.api': '  API     : {value}/api/seedance',
    'started.mode': '  Mode    : {value}',
    'started.storage': '  Storage : {value}',
    'started.static': '  Static  : {value}',
    'started.token': '  Token   : {value}',
    'started.cors': '  CORS    : {value}',
    'started.stop': '  Ctrl+C to stop',
    'mode.demo': 'Demo mode (no real API key configured; no real calls, no cost)',
    'mode.real': 'Live mode · {provider}',
    'provider.relay': 'relay',
    'provider.ark': 'Ark direct',
    'value.notHosted': '(not hosted)',
    'value.disabled': 'disabled',
    'value.tokenOn': 'enabled',
    'value.tokenOff': 'disabled (localhost use only)',
    'value.corsOn': 'enabled',
    'value.corsOff': 'disabled',
    'storage.custom': ' (--storage: dedicated directory)',
    'storage.shared': ' (shared with the DSH plugin)',
    'error.portInUse': 'Failed to start: port {port} is already in use, pick another --port.',
    'error.start': 'Failed to start: {message}',
  }
}

let activeLang = 'zh'
function detectLanguage(argv, env) {
  const index = argv.indexOf('--lang')
  if (index !== -1 && argv[index + 1] && LANGUAGES.indexOf(argv[index + 1]) !== -1) return argv[index + 1]
  const fromEnv = String(env.LC_ALL || env.LC_MESSAGES || env.LANG || '').toLowerCase()
  if (fromEnv.indexOf('zh') === 0) return 'zh'
  if (fromEnv.indexOf('en') === 0) return 'en'
  return 'zh'
}
function t(key, params) {
  const dict = MESSAGES[activeLang] || MESSAGES.zh
  const template = dict[key] !== undefined ? dict[key] : (MESSAGES.zh[key] !== undefined ? MESSAGES.zh[key] : key)
  if (!params) return template
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
}

// ==========================================================================
// 参数解析与启动
// ==========================================================================
function parseArgs(argv) {
  const args = { port: 3000, host: '127.0.0.1', storage: '', token: '', cors: false, demo: false, noStatic: false, verbose: false, apiKey: '', relayBaseUrl: '', relayKey: '', lang: '', help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => (i < argv.length - 1 ? argv[++i] : '')
    switch (arg) {
      case '--port': args.port = Number(next()); break
      case '--host': args.host = next(); break
      case '--storage': args.storage = next(); break
      case '--token': args.token = next(); break
      case '--cors': args.cors = true; break
      case '--api-key': args.apiKey = next(); break
      case '--relay-base-url': args.relayBaseUrl = next(); break
      case '--relay-key': args.relayKey = next(); break
      case '--demo': args.demo = true; break
      case '--no-static': args.noStatic = true; break
      case '--verbose': args.verbose = true; break
      case '--lang': args.lang = next(); break
      case '--help':
      case '-h': args.help = true; break
      default:
        if (arg.startsWith('-')) throw new Error(t('error.unknownArg', { arg }))
    }
  }
  return args
}

function printHelp() {
  console.log([
    t('help.title'),
    '',
    t('help.usage'),
    '',
    t('help.options'),
    t('help.port'),
    t('help.host'),
    t('help.storage'),
    t('help.token'),
    t('help.cors'),
    t('help.apiKey'),
    t('help.relayBase'),
    t('help.relayKey'),
    t('help.demo'),
    t('help.noStatic'),
    t('help.verbose'),
    t('help.lang'),
    t('help.help'),
    '',
    t('help.env'),
    '',
    t('help.api'),
    t('help.apiLines')
  ].join('\n'))
}

const argv = process.argv.slice(2)
activeLang = detectLanguage(argv, process.env)
let args
try {
  args = parseArgs(argv)
} catch (error) {
  console.error(error && error.message ? error.message : String(error))
  process.exit(1)
}
if (args.lang) {
  if (LANGUAGES.indexOf(args.lang) === -1) {
    console.error(t('error.badLang', { lang: args.lang }))
    process.exit(1)
  }
  activeLang = args.lang
}
if (args.help) {
  printHelp()
  process.exit(0)
}

const env = { ...process.env }
if (args.apiKey) env.ARK_API_KEY = args.apiKey
if (args.relayBaseUrl) env.RELAY_BASE_URL = args.relayBaseUrl
if (args.relayKey) env.RELAY_API_KEY = args.relayKey
if (args.demo) env.DEMO = '1'

const server = createStandaloneServer({
  port: args.port,
  host: args.host,
  storageRoot: args.storage || undefined,
  token: args.token,
  cors: args.cors,
  env,
  verbose: args.verbose,
  staticDir: args.noStatic ? false : undefined
})

function shutdown(signal) {
  console.log('\n' + t('shutdown.received', { signal }))
  server.stop().then(() => process.exit(0)).catch(() => process.exit(1))
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

try {
  const info = await server.start()
  const config = server.runtime.settings.getConfig()
  const modeText = config.demo
    ? t('mode.demo')
    : t('mode.real', { provider: config.useRelay ? t('provider.relay') : t('provider.ark') })
  console.log([
    '',
    t('started.title'),
    t('started.page', { value: args.noStatic ? t('value.notHosted') : info.url + '/' }),
    t('started.api', { value: info.url }),
    t('started.mode', { value: modeText }),
    t('started.storage', { value: server.storageRoot + (args.storage ? t('storage.custom') : t('storage.shared')) }),
    t('started.static', { value: args.noStatic ? t('value.disabled') : defaultStaticDir() }),
    t('started.token', { value: args.token ? t('value.tokenOn') : t('value.tokenOff') }),
    t('started.cors', { value: args.cors ? t('value.corsOn') : t('value.corsOff') }),
    t('started.stop'),
    ''
  ].join('\n'))
} catch (error) {
  if (error && error.code === 'EADDRINUSE') {
    console.error(t('error.portInUse', { port: args.port }))
  } else {
    console.error(t('error.start', { message: error && error.message ? error.message : String(error) }))
  }
  process.exit(1)
}
