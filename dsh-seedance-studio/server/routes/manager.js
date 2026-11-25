/**
 * dsh-seedance-studio — routes / 路由注册
 *
 * 本文件由 server/routes.js 拆分而来；对外契约由 routes/index.js 统一 re-export。
 */
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { apiErrorStatus } from '../api/index.js'
import { LIMITS, MODES, MODE_INFO } from '../models/index.js'
import { API_PREFIX, MEDIA_KINDS, DEFAULT_MAX_BODY_BYTES } from './constants.js'
import { RequestError, jsonValue, mapErrorToResponse } from './errors.js'
import { requireSessionId, requireRecordId, readJsonRequest, queryValue } from './io.js'
import { mediaResponse } from './media.js'
import { buildPanelPage, buildSpaPanelPage } from './panel-page.js'

/**
 * 创建全部路由定义。
 *
 * @param {object} service - 宿主服务（由 index.js createHostService 提供）：
 *   getConfig(), settingsView(), updateSettings(patch), models(),
 *   history(sessionId,{limit}), status(sessionId,id), generate(sessionId,input,opts),
 *   recreate(sessionId,sourceId,overrides), cancel(sessionId,id), remove(sessionId,id),
 *   resolveMediaFile(id,kind) → {path,fileName}|null。
 * @returns {Array<{path:string, methods:string[], requestBody:string, fetch:Function}>}
 */
export function createRoutes(service) {
  if (!service) throw new Error('createRoutes 需要 service')

  function maxBodyBytes() {
    try {
      const config = service.getConfig ? service.getConfig() : null
      return (config && config.maxBodyBytes) || DEFAULT_MAX_BODY_BYTES
    } catch (error) {
      return DEFAULT_MAX_BODY_BYTES
    }
  }

  async function handleJson(request, handler) {
    try {
      const value = await handler()
      return jsonValue(value)
    } catch (error) {
      return mapErrorToResponse(error)
    }
  }

  const routes = []

  // ---- 探针（安装验证用，spike/T1 依赖） ----
  routes.push({
    path: API_PREFIX + '/ping',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: async () => jsonValue({ pong: true, time: new Date().toISOString() })
  })

  // ---- 配置 ----
  routes.push({
    path: API_PREFIX + '/config',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handleJson(request, async () => {
      const config = service.getConfig()
      const models = service.models()
      const value = {
        provider: config.provider,
        demo: config.demo === true,
        demoReason: config.demoReason || '',
        providerRequested: config.providerRequested,
        defaultModel: config.defaultModel,
        models: models.models,
        defaults: models.defaults,
        capabilities: models.capabilities,
        modes: MODE_INFO,
        settings: service.settingsView(),
        locales: service.readLocales ? service.readLocales().locales : ['zh', 'en'],
        limits: { ...LIMITS }
      }
      return value
    })
  })

  // ---- 语言包（动态 i18n：新增语言 = 放一个语言文件） ----
  routes.push({
    path: API_PREFIX + '/locales',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handleJson(request, async () => {
      if (!service.readLocales) return { locales: ['zh', 'en'], dictionaries: {} }
      return service.readLocales()
    })
  })

  // ---- 会话历史 ----
  routes.push({
    path: API_PREFIX + '/history',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handleJson(request, async () => {
      const url = new URL(request.url)
      const sessionIdRaw = queryValue(url, 'sessionId')
      const sessionId = sessionIdRaw === null || String(sessionIdRaw).trim() === '' ? '' : requireSessionId(sessionIdRaw)
      const limitRaw = queryValue(url, 'limit')
      const limit = limitRaw === null ? undefined : Number(limitRaw)
      const records = await service.history(sessionId, { limit: Number.isFinite(limit) ? limit : undefined })
      return { records }
    })
  })

  // ---- 单任务查询 ----
  routes.push({
    path: API_PREFIX + '/task',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => handleJson(request, async () => {
      const url = new URL(request.url)
      const sessionId = requireSessionId(queryValue(url, 'sessionId'))
      const id = requireRecordId(queryValue(url, 'id'))
      const record = await service.status(sessionId, id)
      return { record }
    })
  })

  // ---- 创建生成任务 ----
  routes.push({
    path: API_PREFIX + '/generate',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handleJson(request, async () => {
      const body = await readJsonRequest(request, maxBodyBytes())
      const sessionId = requireSessionId(body.sessionId)
      const input = { ...body }
      delete input.sessionId
      const record = await service.generate(sessionId, input)
      return { record }
    })
  })

  // ---- 再创作 ----
  routes.push({
    path: API_PREFIX + '/recreate',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handleJson(request, async () => {
      const body = await readJsonRequest(request, maxBodyBytes())
      const sessionId = requireSessionId(body.sessionId)
      const sourceId = requireRecordId(body.sourceId)
      const overrides = {}
      if (body.prompt !== undefined) overrides.prompt = body.prompt
      if (body.model !== undefined) overrides.model = body.model
      if (body.mode !== undefined) overrides.mode = body.mode
      if (body.params !== undefined) overrides.params = body.params
      const result = await service.recreate(sessionId, sourceId, overrides)
      return { record: result.record, plan: result.plan }
    })
  })

  // ---- 取消 ----
  routes.push({
    path: API_PREFIX + '/cancel',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handleJson(request, async () => {
      const body = await readJsonRequest(request, maxBodyBytes())
      const sessionId = requireSessionId(body.sessionId)
      const id = requireRecordId(body.id)
      const record = await service.cancel(sessionId, id)
      return { record }
    })
  })

  // ---- 删除记录与本地媒体 ----
  routes.push({
    path: API_PREFIX + '/delete',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handleJson(request, async () => {
      const body = await readJsonRequest(request, maxBodyBytes())
      const sessionId = requireSessionId(body.sessionId)
      const id = requireRecordId(body.id)
      const result = await service.remove(sessionId, id)
      return { deleted: true, id, removedFiles: result && result.removedFiles ? result.removedFiles.length : 0 }
    })
  })

  // ---- 设置（读：打码） ----
  routes.push({
    path: API_PREFIX + '/settings',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: (request) => handleJson(request, async () => {
      if (String(request.method || 'GET').toUpperCase() === 'GET') {
        return { settings: service.settingsView() }
      }
      const body = await readJsonRequest(request, maxBodyBytes())
      const result = service.updateSettings(body.patch !== undefined ? body.patch : body)
      return { settings: result.view, changed: Object.keys(result.changed || {}) }
    })
  })

  // ---- 中转站模型列表 / 连通性测试（设置页用；输入可覆盖已保存配置） ----
  routes.push({
    path: API_PREFIX + '/relay/models',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => handleJson(request, async () => {
      const body = await readJsonRequest(request, maxBodyBytes())
      return await service.relayModels(body || {})
    })
  })

  // ---- 媒体字节流（Range/206） ----
  routes.push({
    path: API_PREFIX + '/media',
    methods: ['GET', 'HEAD'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        const url = new URL(request.url)
        const id = requireRecordId(queryValue(url, 'id'))
        const kind = queryValue(url, 'kind') || 'video'
        if (MEDIA_KINDS.indexOf(kind) === -1) throw new RequestError(400, 'INVALID_MEDIA_KIND', 'kind 必须是 ' + MEDIA_KINDS.join(' / '))
        const media = await service.resolveMediaFile(id, kind)
        if (!media) throw new RequestError(404, 'MEDIA_NOT_FOUND', '媒体文件不存在（记录可能已删除或仍在生成中）')
        return await mediaResponse(request, media.path, kind)
      } catch (error) {
        return mapErrorToResponse(error)
      }
    }
  })

  // ---- 面板页面（iframe 承载共享 SPA；?debug=1 返回最小测试页） ----
  routes.push({
    path: API_PREFIX + '/panel',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: (request) => {
      try {
        const url = new URL(request.url)
        const options = {
          theme: queryValue(url, 'theme'),
          lang: queryValue(url, 'lang'),
          platform: queryValue(url, 'platform'),
          sessionId: queryValue(url, 'session'),
        }
        const page = queryValue(url, 'debug') === '1' ? buildPanelPage(options) : buildSpaPanelPage(options)
        return new Response(page, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
        })
      } catch (error) {
        return new Response('面板页面加载失败：' + (error && error.message ? error.message : String(error)), {
          status: 500,
          headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
        })
      }
    }
  })

  return routes
}

/** 路由清单摘要（启动日志/boot.log 用）。 */
export function describeRoutes(routes) {
  return routes.map((route) => route.methods.join(',') + ' ' + route.path).join('; ')
}
