/**
 * dsh-seedance-studio — 独立后端（Standalone Server）。
 *
 * 让 Seedance 后端脱离 DSH 运行时独立运行（与旧项目独立服务的用法一致）：
 *   - 复用 server/* 全部业务逻辑（settings / store / tasks / service / routes），本文件不 import DSH；
 *   - 用 node:http 暴露与 DSH 插件完全相同的 /api/seedance/* Fetch 路由；
 *       请求 → 标准 Request → createRoutes 路由 → 标准 Response → 写回 node res；
 *   - 可选托管 platforms/web/public 静态前端（同源；--cors 支持前后端分离部署）；
 *   - 可选 Bearer token 保护（--token），默认仅监听 127.0.0.1；
 *   - 与 DSH 插件共享同一存储目录（默认 $DSH_HOME/storages/seedance-studio），
 *     因此独立后端与 DSH 页面看到的是同一份会话历史与设置。
 *
 * 用法（见 platforms/web/serve.js CLI）：
 *   node platforms/web/serve.js --port 3000
 *   node platforms/web/serve.js --port 8080 --storage D:\\data --token secret --cors
 *
 * @module dsh-seedance-studio/platforms/web/http
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { createSettingsManager, defaultStorageRoot } from '../../server/settings/index.js'
import { createStore } from '../../server/store/index.js'
import { createTaskManager, defaultDemoMedia } from '../../server/tasks/index.js'
import { createHostService } from '../../server/service.js'
import { createRoutes, API_PREFIX, DEFAULT_MAX_BODY_BYTES } from '../../server/routes/index.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 插件包根目录（platforms/web/http.js → 包根）。 */
export function packageRoot() {
  return path.resolve(HERE, '..', '..')
}

/** 独立前端静态目录（包内 platforms/web/public）。 */
export function defaultStaticDir() {
  return path.join(HERE, 'public')
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
}

function mimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

/**
 * 组装独立后端运行时（settings → store → tasks → service → routes）。
 * 不依赖 DSH ctx：ctx 仅提供 `get()` 的降级实现（工具侧能力在独立模式不可用）。
 *
 * @param {object} [options]
 * @param {string} [options.storageRoot] 存储目录；默认 $DSH_HOME/storages/seedance-studio（与 DSH 插件共享）
 * @param {object} [options.env] 环境变量来源（KEY / DEMO / RELAY_* 等）
 * @param {object} [options.pluginConfig] 插件 config（优先级低于环境变量与 settings.json）
 * @param {Function} [options.now] 时钟注入（测试用）
 * @param {Function} [options.random] 随机源注入（测试用）
 * @param {Function} [options.createClient] 远端客户端注入（测试用）
 * @param {Function} [options.downloadImpl] 下载实现注入（测试用）
 * @param {boolean} [options.autoPoll] 是否自动轮询远端任务（测试可关）
 * @param {Function} [options.logger] 日志函数
 */
export function createStandaloneRuntime(options = {}) {
  const env = options.env || process.env
  const root = options.storageRoot || defaultStorageRoot(env)
  const settings = createSettingsManager({ storageRoot: root, env, pluginConfig: options.pluginConfig || {} })
  const store = createStore({ root, logger: options.logger })
  store.init()
  const tasks = createTaskManager({
    store,
    getConfig: () => settings.getConfig(),
    demoMedia: defaultDemoMedia(packageRoot()),
    logger: options.logger,
    now: options.now,
    random: options.random,
    createClient: options.createClient,
    downloadImpl: options.downloadImpl,
    autoPoll: options.autoPoll
  })
  const ctx = { get: () => undefined }
  const service = createHostService({ ctx, config: options.pluginConfig || {}, store, settings, tasks })
  const routes = createRoutes(service)
  return { root, settings, store, tasks, service, routes }
}

function readRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    let settled = false
    const fail = (error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > limit) {
        const error = new Error('请求体超过上限（' + limit + ' 字节）')
        error.code = 'PAYLOAD_TOO_LARGE'
        error.status = 413
        fail(error)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (settled) return
      settled = true
      resolve(Buffer.concat(chunks))
    })
    req.on('error', (error) => fail(error))
  })
}

/** 去掉 fetch 规范禁止的 hop-by-hop 头（其余原样透传）。 */
const DROP_HEADERS = new Set([
  'connection', 'content-length', 'host', 'transfer-encoding', 'upgrade',
  'keep-alive', 'proxy-connection', 'te', 'trailer'
])

function toFetchHeaders(rawHeaders) {
  const headers = {}
  for (const [key, value] of Object.entries(rawHeaders || {})) {
    if (DROP_HEADERS.has(key.toLowerCase())) continue
    if (typeof value === 'string') headers[key] = value
    else if (Array.isArray(value)) headers[key] = value.join(', ')
  }
  return headers
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

async function writeResponse(res, response, method) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (lower === 'set-cookie' || lower === 'content-length') return
    try {
      res.setHeader(key, value)
    } catch (error) {
      // 非法响应头忽略，避免整条请求失败
    }
  })
  if (method === 'HEAD' || !response.body) {
    res.end()
    return
  }
  const stream = Readable.fromWeb(response.body)
  stream.on('error', () => {
    try {
      res.destroy()
    } catch (error) {
      // 忽略
    }
  })
  stream.pipe(res)
}

/**
 * 创建独立后端 HTTP 服务（未监听；调用 start() 后开始服务）。
 *
 * @param {object} [options]
 * @param {number} [options.port=3000] 监听端口
 * @param {string} [options.host='127.0.0.1'] 监听地址（默认仅本机）
 * @param {string} [options.token] 访问 API 所需的 Bearer token（空 = 不鉴权，仅建议本机）
 * @param {boolean} [options.cors] 是否开启 CORS（前后端分离部署时）
 * @param {string|false} [options.staticDir] 静态前端目录；false 关闭静态托管
 * @param {boolean} [options.verbose] 请求日志
 * @param {object} [options.storageRoot] 存储目录（默认与 DSH 共享）
 * @param {object} [options.env] 环境变量来源
 * @param {Function} [options.now] 时钟注入（测试）
 * @param {Function} [options.random] 随机源注入（测试）
 * @param {Function} [options.createClient] 远端客户端注入（测试）
 * @param {Function} [options.downloadImpl] 下载实现注入（测试）
 * @param {boolean} [options.autoPoll] 自动轮询开关（测试）
 * @param {Function} [options.logger] 日志函数
 */
export function createStandaloneServer(options = {}) {
  const runtime = createStandaloneRuntime(options)
  const token = options.token ? String(options.token).trim() : ''
  const cors = options.cors === true
  const verbose = options.verbose === true
  const log = typeof options.logger === 'function' ? options.logger : () => {}
  const staticDir = options.staticDir === false
    ? null
    : path.resolve(String(options.staticDir || defaultStaticDir()))
  const routeMap = new Map(runtime.routes.map((route) => [route.path, route]))

  function cfgMaxBodyBytes() {
    try {
      const config = runtime.settings.getConfig()
      return (config && config.maxBodyBytes) || DEFAULT_MAX_BODY_BYTES
    } catch (error) {
      return DEFAULT_MAX_BODY_BYTES
    }
  }

  function checkToken(req, url) {
    if (!token) return true
    const header = String(req.headers.authorization || '')
    if (header.toLowerCase().startsWith('bearer ')) {
      if (header.slice(7).trim() === token) return true
    }
    const queryToken = url.searchParams.get('token')
    return queryToken !== null && queryToken === token
  }

  async function handleApi(req, res, url) {
    const route = routeMap.get(url.pathname)
    if (!route) {
      sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: '未知接口 ' + url.pathname } })
      return
    }
    const method = String(req.method || 'GET').toUpperCase()
    if (!route.methods.includes(method)) {
      res.setHeader('allow', route.methods.join(', '))
      sendJson(res, 405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: method + ' 不被支持；可用 ' + route.methods.join(' / ') } })
      return
    }
    let body
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        body = await readRequestBody(req, cfgMaxBodyBytes())
      } catch (error) {
        sendJson(res, error.status || 400, { ok: false, error: { code: error.code || 'BAD_REQUEST', message: error.message } })
        return
      }
    }
    const absoluteUrl = new URL(url.pathname + url.search, 'http://' + (req.headers.host || '127.0.0.1'))
    const request = new Request(absoluteUrl.toString(), {
      method,
      headers: toFetchHeaders(req.headers),
      body: body && body.length > 0 ? body : undefined
    })
    const response = await route.fetch(request)
    await writeResponse(res, response, method)
  }

  async function handleStatic(req, res, url) {
    const method = String(req.method || 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') {
      res.statusCode = 405
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('Method Not Allowed')
      return
    }
    if (!staticDir) {
      sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: '未托管静态前端（--no-static）' } })
      return
    }
    let pathname
    try {
      pathname = decodeURIComponent(url.pathname)
    } catch (error) {
      res.statusCode = 400
      res.end('Bad Request')
      return
    }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
    let target = path.resolve(staticDir, relative)
    if (target !== staticDir && !target.startsWith(staticDir + path.sep)) {
      res.statusCode = 403
      res.end('Forbidden')
      return
    }
    try {
      const stat = await fs.promises.stat(target)
      if (stat.isDirectory()) {
        target = path.join(target, 'index.html')
      }
      const finalStat = await fs.promises.stat(target)
      if (!finalStat.isFile()) throw new Error('not a file')
      res.statusCode = 200
      res.setHeader('content-type', mimeType(target))
      res.setHeader('content-length', String(finalStat.size))
      res.setHeader('cache-control', 'no-cache')
      if (method === 'HEAD') {
        res.end()
        return
      }
      const stream = fs.createReadStream(target)
      stream.on('error', () => {
        try {
          res.destroy()
        } catch (error) {
          // 忽略
        }
      })
      stream.pipe(res)
    } catch (error) {
      res.statusCode = 404
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end('Not Found')
    }
  }

  async function handle(req, res) {
    const startedAt = Date.now()
    const url = new URL(req.url || '/', 'http://' + (req.headers.host || '127.0.0.1'))
    if (cors) {
      res.setHeader('access-control-allow-origin', '*')
      res.setHeader('access-control-allow-methods', 'GET, HEAD, POST, OPTIONS')
      res.setHeader('access-control-allow-headers', 'authorization, content-type, x-seedance-token, range')
      res.setHeader('access-control-expose-headers', 'content-range, accept-ranges, content-length')
      if (String(req.method || '').toUpperCase() === 'OPTIONS') {
        res.statusCode = 204
        res.end()
        return
      }
    }
    const isApi = url.pathname === API_PREFIX || url.pathname.startsWith(API_PREFIX + '/')
    if (isApi && !checkToken(req, url)) {
      sendJson(res, 401, { ok: false, error: { code: 'UNAUTHORIZED', message: '需要有效 token（Authorization: Bearer <token> 或 ?token=）' } })
      return
    }
    try {
      if (isApi) await handleApi(req, res, url)
      else await handleStatic(req, res, url)
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      log('[seedance-standalone] 请求失败：' + message)
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message } })
      } else {
        try {
          res.destroy()
        } catch (destroyError) {
          // 忽略
        }
      }
    } finally {
      if (verbose) log('[seedance-standalone] ' + String(req.method || 'GET') + ' ' + url.pathname + ' ' + (Date.now() - startedAt) + 'ms')
    }
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      log('[seedance-standalone] 未捕获异常：' + (error && error.message ? error.message : String(error)))
      try {
        res.destroy()
      } catch (destroyError) {
        // 忽略
      }
    })
  })
  server.keepAliveTimeout = 60000

  /**
   * 启动监听。
   * @param {{ port?: number, host?: string }} [startOptions]
   * @returns {Promise<{ host: string, port: number, url: string }>}
   */
  function start(startOptions = {}) {
    const port = startOptions.port !== undefined ? Number(startOptions.port) : (options.port !== undefined ? Number(options.port) : 3000)
    const host = startOptions.host || options.host || '127.0.0.1'
    return new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.removeListener('error', onError)
        const address = server.address()
        const actualPort = address && typeof address === 'object' ? address.port : port
        const displayHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host
        resolve({ host, port: actualPort, url: 'http://' + displayHost + ':' + actualPort })
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(port, host)
    })
  }

  /** 停止服务并清理轮询定时器。 */
  async function stop() {
    try {
      runtime.tasks.stop()
    } catch (error) {
      // 忽略
    }
    await new Promise((resolve) => {
      if (!server.listening) {
        resolve()
        return
      }
      server.close(() => resolve())
      server.closeAllConnections?.()
    })
  }

  return {
    server,
    runtime,
    routes: runtime.routes,
    storageRoot: runtime.root,
    staticDir,
    token,
    cors,
    start,
    stop
  }
}
