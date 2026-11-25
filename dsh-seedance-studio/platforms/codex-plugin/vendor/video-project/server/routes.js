/**
 * dsh-video-project — /api/video-project/* 设置路由（设置面板用）
 *
 * 只做「草图分镜设置」的读写与候选模型拉取；不生成图片、不产生费用。
 * 由 plugin.js 通过 ctx.connection.fetch.register 注册；本模块不 import DSH 运行时，
 * 可用标准 Request 直接测试。
 * @module dsh-video-project/server/routes
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readImageGenSettings, saveImageGenSettings, fetchImageCandidates } from './image-settings.js'
import { readProjectMedia } from './media.js'
import { checkEnvironment } from './env-check.js'
import { spawn } from 'node:child_process'
import { resolveFfmpeg } from './analyze.js'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'

const PANEL_HTML = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'platforms', 'web', 'public', 'index.html')

/** 路由前缀。 */
export const API_PREFIX = '/api/video-project'

function jsonValue(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  })
}

function jsonError(error) {
  const code = error && error.code ? String(error.code) : 'SettingsError'
  const message = error && error.message ? String(error.message) : String(error)
  return jsonValue({ ok: false, error: { code, message } }, 400)
}

/**
 * 创建路由定义。
 * @param {{env?:object, fetchImpl?:Function, configFile?:string}} options
 * @returns {Array<{path:string, methods:string[], requestBody:string, fetch:Function}>}
 */
export function createRoutes(options = {}) {
  const env = options.env || process.env
  const configFile = options.configFile
  const fetchImpl = options.fetchImpl
  const projects = options.projects || null

  function settingsView() {
    return readImageGenSettings({ env, configFile })
  }

  // ---- 环境自检（ffmpeg / Node / 目录可写性；新克隆仓库后用来确认缺什么） ----
  let ffmpegFetchState = { running: false, startedAt: 0, exitCode: null, tail: '' }
  function pluginRoot() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  }

  const envRoutes = [
    {
      path: API_PREFIX + '/env',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => {
        try {
          const report = checkEnvironment({ env })
          return jsonValue({ ok: true, value: { ...report, fetch: ffmpegFetchState } })
        } catch (error) { return jsonError(error) }
      }
    },
    {
      // 后台下载 ffmpeg 到 vendor/ffmpeg/（约 22~110MB）。返回立即；前端轮询 GET /env 看结果。
      path: API_PREFIX + '/env/fetch-ffmpeg',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async () => { try {
        if (ffmpegFetchState.running) return jsonValue({ ok: true, value: { started: false, running: true, message: 'ffmpeg 正在下载中，请稍候' } })
        const root = pluginRoot()
        const script = path.join(root, 'scripts', 'fetch-ffmpeg.mjs')
        if (!fs.existsSync(script)) throw new Error('缺少 scripts/fetch-ffmpeg.mjs')
        ffmpegFetchState = { running: true, startedAt: Date.now(), exitCode: null, tail: '' }
        const child = spawn(process.execPath, [script], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        const append = (chunk) => {
          const text = String(chunk || '')
          ffmpegFetchState.tail = (ffmpegFetchState.tail + text).slice(-4000)
        }
        if (child.stdout) child.stdout.on('data', append)
        if (child.stderr) child.stderr.on('data', append)
        child.on('exit', (code) => { ffmpegFetchState = { ...ffmpegFetchState, running: false, exitCode: code } })
        child.on('error', (error) => { ffmpegFetchState = { ...ffmpegFetchState, running: false, exitCode: -1, tail: String(error && error.message || error) } })
        return jsonValue({ ok: true, value: { started: true, running: true, message: '已开始下载 ffmpeg（约 22~110MB），完成后会自动可用' } })
      } catch (error) { return jsonError(error) } }
    }
  ]

  const panelRoutes = [
    {
      // 共享 SPA 面板（项目列表/详情/设置；iframe 承载）
      path: API_PREFIX + '/panel',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const url = new URL(request.url)
          const view = url.searchParams.get('view') === 'settings' ? 'settings' : 'projects'
          const platform = String(url.searchParams.get('platform') || 'dsh').slice(0, 20)
          let html = fs.readFileSync(PANEL_HTML, 'utf8')
          const boot = '<script>window.__VP_PANEL__ = ' + JSON.stringify({ platform, view }) + ';</script>'
          html = html.replace('<head>', '<head>\n' + boot)
          return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
        } catch (error) {
          return jsonValue({ ok: false, error: { code: 'PANEL_UNAVAILABLE', message: error && error.message ? String(error.message) : String(error) } }, 500)
        }
      }
    }
  ]

  const projectRoutes = projects ? [
    {
      // 项目列表（面板展示用；只读）
      path: API_PREFIX + '/projects',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => {
        try {
          const list = await projects.listProjects()
          const location = projects.readLocation ? projects.readLocation() : {}
          return jsonValue({ ok: true, value: { projects: list, storageRoot: location.storageRoot || '', projectsRoot: location.projectsRoot || '' } })
        } catch (error) {
          return jsonError(error)
        }
      }
    },
    {
      // 项目内图片预览（三视图/草图；只允许项目目录内文件）
      path: API_PREFIX + '/media',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const url = new URL(request.url)
          const filePath = String(url.searchParams.get('path') || '').trim()
          if (!filePath) return jsonValue({ ok: false, error: { code: 'INVALID_PATH', message: '缺少 path 参数' } }, 400)
          const result = await readProjectMedia(filePath, { env })
          const headers = { 'content-type': result.mimeType, 'cache-control': 'no-store', 'accept-ranges': 'bytes' }
          // 视频播放/拖动需要 Range：简单实现单区间 206
          const range = request.headers.get('range')
          if (range && /^bytes=\d*-\d*$/.test(range.trim())) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
            const size = result.buffer.length
            let start = match[1] ? Number(match[1]) : 0
            let end = match[2] ? Number(match[2]) : size - 1
            if (Number.isFinite(start) && Number.isFinite(end) && start <= end) {
              end = Math.min(end, size - 1)
              start = Math.max(0, Math.min(start, end))
              headers['content-range'] = 'bytes ' + start + '-' + end + '/' + size
              headers['content-length'] = String(end - start + 1)
              return new Response(result.buffer.subarray(start, end + 1), { status: 206, headers })
            }
          }
          return new Response(result.buffer, { status: 200, headers })
        } catch (error) {
          return jsonValue({ ok: false, error: { code: error && error.code ? String(error.code) : 'MEDIA_ERROR', message: error && error.message ? String(error.message) : String(error) } }, error && error.status ? error.status : 400)
        }
      }
    },
    {
      // 视频首帧缩略图（详情里的静态预览：按原始比例，稳定不受布局影响）
      path: API_PREFIX + '/thumb',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const url = new URL(request.url)
          const filePath = String(url.searchParams.get('path') || '').trim()
          if (!filePath) return jsonValue({ ok: false, error: { code: 'INVALID_PATH', message: '缺少 path 参数' } }, 400)
          const media = await readProjectMedia(filePath, { env })
          if (!media.mimeType.startsWith('video/')) return jsonValue({ ok: false, error: { code: 'NOT_VIDEO', message: '不是视频文件' } }, 400)
          const location = projects && projects.readLocation ? projects.readLocation() : {}
          const projectsRoot = location.projectsRoot || ''
          const cacheDir = projectsRoot ? path.join(projectsRoot, '.thumbs') : ''
          const hash = crypto.createHash('sha1').update(filePath + ':' + (media.size || 0)).digest('hex').slice(0, 20)
          const cachePath = cacheDir ? path.join(cacheDir, hash + '.jpg') : ''
          if (cachePath && fs.existsSync(cachePath)) {
            return new Response(fs.readFileSync(cachePath), { status: 200, headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' } })
          }
          const ffmpeg = resolveFfmpeg(env)
          if (!ffmpeg || !cachePath) return jsonValue({ ok: false, error: { code: 'FFMPEG_MISSING', message: '缺少 ffmpeg，无法生成缩略图' } }, 503)
          fs.mkdirSync(cacheDir, { recursive: true })
          const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', '0', '-i', filePath, '-frames:v', '1', '-vf', 'scale=min(1080\\,iw):-2', '-q:v', '3', '-y', cachePath], { encoding: 'utf8', timeout: 30000, windowsHide: true })
          if (!fs.existsSync(cachePath)) return jsonValue({ ok: false, error: { code: 'THUMB_FAILED', message: '抽帧失败：' + String((result.stderr || '').slice(0, 200)) } }, 500)
          return new Response(fs.readFileSync(cachePath), { status: 200, headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=86400' } })
        } catch (error) {
          return jsonValue({ ok: false, error: { code: error && error.code ? String(error.code) : 'THUMB_ERROR', message: error && error.message ? String(error.message) : String(error) } }, error && error.status ? error.status : 400)
        }
      }
    },
    {
      // 视频播放页（详情里用 iframe 嵌入：隔离外部样式，按原始比例完整显示）
      path: API_PREFIX + '/player',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const url = new URL(request.url)
          const filePath = String(url.searchParams.get('path') || '').trim()
          if (!filePath) return new Response('缺少 path 参数', { status: 400, headers: { 'content-type': 'text/plain; charset=utf-8' } })
          await readProjectMedia(filePath, { env })
          const src = API_PREFIX + '/media?path=' + encodeURIComponent(filePath)
          const html = '<!doctype html><html><head><meta charset="utf-8"><title>视频预览</title><style>html,body{margin:0;height:100%;background:#000;display:flex;align-items:center;justify-content:center;overflow:hidden}video{max-width:100%;max-height:100%;outline:none}</style></head><body><video controls playsinline preload="metadata" src="' + src + '"></video></body></html>'
          return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } })
        } catch (error) {
          return new Response('视频播放页不可用：' + (error && error.message ? error.message : String(error)), { status: error && error.status ? error.status : 400, headers: { 'content-type': 'text/plain; charset=utf-8' } })
        }
      }
    },
    {
      // 项目详情（GET）与项目内容编辑（POST：meta/characters/areas/acts/shots）
      path: API_PREFIX + '/project',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          const url = new URL(request.url)
          if (request.method === 'POST') {
            if (!projects) return jsonValue({ ok: false, error: { code: 'PROJECTS_UNAVAILABLE', message: '项目服务不可用' } }, 500)
            let body = {}
            try { const text = await request.text(); body = text ? JSON.parse(text) : {} } catch (error) { body = {} }
            const action = String(body.action || 'meta')
            if (action === 'create') {
              const name = String(body.name || '').trim()
              if (!name) return jsonValue({ ok: false, error: { code: 'INVALID_PROJECT', message: '缺少 name（项目名）' } }, 400)
              const project = await projects.createProject(name, body.payload || {})
              return jsonValue({ ok: true, value: { project } })
            }
            if (!body.name) return jsonValue({ ok: false, error: { code: 'INVALID_PROJECT', message: '缺少 name（项目名）' } }, 400)
            if (action === 'meta') {
              const result = await projects.updateProjectMeta(body.name, body.patch || {})
              return jsonValue({ ok: true, value: result })
            }
            if (action === 'characters') {
              if (!Array.isArray(body.characters)) return jsonValue({ ok: false, error: { code: 'INVALID_CHARACTERS', message: '需要 characters 数组' } }, 400)
              const result = await projects.saveCharacters(body.name, body.characters)
              return jsonValue({ ok: true, value: result })
            }
            if (action === 'areas') {
              if (!Array.isArray(body.areas)) return jsonValue({ ok: false, error: { code: 'INVALID_AREAS', message: '需要 areas 数组' } }, 400)
              const result = await projects.saveAreas(body.name, body.areas)
              return jsonValue({ ok: true, value: result })
            }
            if (action === 'acts') {
              if (!Array.isArray(body.acts)) return jsonValue({ ok: false, error: { code: 'INVALID_ACTS', message: '需要 acts 数组' } }, 400)
              const result = await projects.saveActs(body.name, body.acts)
              return jsonValue({ ok: true, value: result })
            }
            if (action === 'delete') {
              if (!body.name) return jsonValue({ ok: false, error: { code: 'INVALID_DELETE', message: '缺少项目名' } }, 400)
              const result = await projects.deleteProject(body.name)
              return jsonValue({ ok: true, value: result })
            }
            if (action === 'review') {
              if (!body.shot) return jsonValue({ ok: false, error: { code: 'INVALID_REVIEW', message: '需要 shot' } }, 400)
              const result = await projects.saveShotReview(body.name, body.shot, {
                version: body.version,
                pass: body.pass,
                checks: body.checks,
                issues: body.issues,
                notes: body.notes,
                feedback: body.feedback
              })
              return jsonValue({ ok: true, value: result })
            }
            if (action === 'clear-review') {
              if (!body.shot || !body.version) return jsonValue({ ok: false, error: { code: 'INVALID_CLEAR_REVIEW', message: '需要 shot、version' } }, 400)
              const result = await projects.clearShotReview(body.name, body.shot, body.version)
              return jsonValue({ ok: true, value: result })
            }
            if (action === 'adopt-version') {
              if (!body.shot || !body.version) return jsonValue({ ok: false, error: { code: 'INVALID_ADOPT', message: '需要 shot、version' } }, 400)
              const result = await projects.setAdoptedVersion(body.name, body.shot, body.version)
              return jsonValue({ ok: true, value: result })
            }
            if (action === 'version-note') {
              if (!body.shot || !body.version || !body.note) return jsonValue({ ok: false, error: { code: 'INVALID_VERSION_NOTE', message: '需要 shot、version、note' } }, 400)
              const result = await projects.addShotVersionNote(body.name, body.shot, body.version, body.note)
              return jsonValue({ ok: true, value: result })
            }
            if (action === 'shots') {
              if (!Array.isArray(body.shots)) return jsonValue({ ok: false, error: { code: 'INVALID_SHOTS', message: '需要 shots 数组' } }, 400)
              const result = await projects.saveShots(body.name, { shots: body.shots })
              return jsonValue({ ok: true, value: result })
            }
            return jsonValue({ ok: false, error: { code: 'UNKNOWN_ACTION', message: '未知操作：' + action } }, 400)
          }
          const name = String(url.searchParams.get('name') || '').trim()
          if (!name) return jsonValue({ ok: false, error: { code: 'INVALID_PROJECT', message: '缺少 name 参数（项目名）' } }, 400)
          const project = await projects.getProject(name)
          return jsonValue({ ok: true, value: { project } })
        } catch (error) {
          const status = error && error.status === 404 ? 404 : 400
          return jsonValue({ ok: false, error: { code: error && error.code ? String(error.code) : 'ProjectError', message: error && error.message ? String(error.message) : String(error) } }, status)
        }
      }
    }
  ] : []

  return [
    ...envRoutes,
    ...panelRoutes,
    ...projectRoutes,
    {
      // 注意：connection.fetch.register 以 path 为唯一键，同一 path 的多种方法必须合并到一条路由
      path: API_PREFIX + '/settings',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        try {
          if (request.method === 'POST') {
            let body = {}
            try {
              const text = await request.text()
              body = text ? JSON.parse(text) : {}
            } catch (error) {
              body = {}
            }
            const result = saveImageGenSettings(body, { env, configFile })
            return jsonValue({ ok: true, value: result.settings })
          }
          return jsonValue({ ok: true, value: settingsView() })
        } catch (error) {
          return jsonError(error)
        }
      }
    },
    {
      path: API_PREFIX + '/models',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async () => {
        try {
          const result = await fetchImageCandidates({ env, configFile, fetchImpl })
          return jsonValue({ ok: true, value: { models: result.models, source: result.source, error: result.error } })
        } catch (error) {
          return jsonError(error)
        }
      }
    }
  ]
}

/** 路由摘要（启动日志用）。 */
export function describeRoutes(routes = []) {
  return (Array.isArray(routes) ? routes : []).map((route) => route.methods.join('/') + ' ' + route.path).join(', ')
}
