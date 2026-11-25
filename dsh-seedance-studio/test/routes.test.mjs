/**
 * routes.js 单测：/api/seedance/* 响应协议、参数校验、Range 媒体流、错误映射。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  createRoutes, describeRoutes, jsonValue, jsonError, mapErrorToResponse,
  readJsonRequest, parseRange, mediaResponse, requireSessionId, requireRecordId,
  RequestError, API_PREFIX, MEDIA_KINDS
} from '../server/routes/index.js'

const RECORD = {
  id: 'sd_abc_1', sessionId: 'sess-1', status: 'succeeded', progress: 100,
  prompt: '一只猫', model: 'doubao-seedance-2-5-260628', mode: 'text2video',
  createdAt: 1700000000000, files: { video: 'sd_abc_1.mp4' }
}

function makeService(overrides = {}) {
  const calls = []
  const service = {
    getConfig: () => ({ provider: 'demo', demo: true, demoReason: '演示模式', defaultModel: 'doubao-seedance-2-5-260628', maxBodyBytes: 64 * 1024 * 1024 }),
    settingsView: () => ({ provider: 'demo', demo: true, keys: { ark: '' } }),
    updateSettings: (patch) => { calls.push({ type: 'settings', patch }); return { view: { provider: patch.provider || 'demo', demo: true }, changed: { provider: true } } },
    models: () => ({ models: [{ id: 'm1' }], defaults: { defaultModel: 'm1' }, capabilities: {} }),
    history: async (sessionId, options) => { calls.push({ type: 'history', sessionId, options }); return [RECORD] },
    status: async (sessionId, id) => { calls.push({ type: 'status', sessionId, id }); if (id !== RECORD.id) throw Object.assign(new Error('任务不存在：' + id), { code: 'NotFound', status: 404 }); return RECORD },
    generate: async (sessionId, input) => { calls.push({ type: 'generate', sessionId, input }); return { ...RECORD, id: 'sd_gen_1', status: 'queued', prompt: input.prompt } },
    recreate: async (sessionId, sourceId, overrides) => { calls.push({ type: 'recreate', sessionId, sourceId, overrides }); return { record: { ...RECORD, id: 'sd_rec_1', originId: sourceId }, plan: { mode: 'reference' } } },
    cancel: async (sessionId, id) => { calls.push({ type: 'cancel', id }); return { ...RECORD, id, status: 'cancelled' } },
    remove: async (sessionId, id) => { calls.push({ type: 'remove', id }); return { deleted: true, removedFiles: ['x.mp4'] } },
    resolveMediaFile: async (id, kind) => { calls.push({ type: 'media', id, kind }); return overrides.media || null },
    ...overrides
  }
  return { service, calls }
}

async function callRoute(service, method, urlPath, options = {}) {
  const routes = createRoutes(service)
  const barePath = urlPath.split('?')[0]
  const route = routes.find((item) => item.path === API_PREFIX + barePath && item.methods.includes(method))
  assert.ok(route, '缺少路由 ' + method + ' ' + barePath)
  assert.equal(route.requestBody, 'buffered', '所有路由必须声明 requestBody: buffered')
  const url = 'http://127.0.0.1:51483' + API_PREFIX + urlPath
  const init = { method, headers: {} }
  if (options.body !== undefined) {
    init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
    init.headers['content-type'] = 'application/json'
  }
  if (options.headers) Object.assign(init.headers, options.headers)
  const response = await route.fetch(new Request(url, init))
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch (error) { json = null }
  return { response, text, json, route }
}

test('路由清单：全部 buffered 且 prefix 正确', () => {
  const { service } = makeService()
  const routes = createRoutes(service)
  assert.ok(routes.length >= 10)
  for (const route of routes) {
    assert.ok(route.path.startsWith(API_PREFIX + '/'))
    assert.equal(route.requestBody, 'buffered')
    assert.ok(Array.isArray(route.methods) && route.methods.length > 0)
    assert.equal(typeof route.fetch, 'function')
  }
  const summary = describeRoutes(routes)
  assert.ok(summary.includes('GET ' + API_PREFIX + '/config'))
})

test('GET /ping 与 /config', async () => {
  const { service } = makeService()
  let out = await callRoute(service, 'GET', '/ping')
  assert.equal(out.response.status, 200)
  assert.equal(out.json.ok, true)
  assert.equal(out.json.value.pong, true)

  out = await callRoute(service, 'GET', '/config')
  assert.equal(out.response.status, 200)
  assert.equal(out.json.value.provider, 'demo')
  assert.equal(out.json.value.demo, true)
  assert.equal(out.json.value.models.length, 1)
  assert.ok(out.json.value.settings)
  assert.ok(out.json.value.limits)
})

test('GET /history 与 /task：参数校验与 404', async () => {
  const { service } = makeService()
  let out = await callRoute(service, 'GET', '/history?sessionId=sess-1')
  assert.equal(out.json.ok, true)
  assert.equal(out.json.value.records.length, 1)
  assert.equal(out.json.value.records[0].id, 'sd_abc_1')

  // 不带 sessionId = 全部/最近历史（主面板用）
  out = await callRoute(service, 'GET', '/history')
  assert.equal(out.json.ok, true)
  assert.ok(Array.isArray(out.json.value.records))

  out = await callRoute(service, 'GET', '/history?sessionId=' + encodeURIComponent('a/b'))
  assert.equal(out.response.status, 400)

  out = await callRoute(service, 'GET', '/task?sessionId=sess-1&id=' + RECORD.id)
  assert.equal(out.json.value.record.id, RECORD.id)

  out = await callRoute(service, 'GET', '/task?sessionId=sess-1&id=sd_unknown_1')
  assert.equal(out.response.status, 404)
  assert.equal(out.json.ok, false)

  out = await callRoute(service, 'GET', '/task?sessionId=sess-1&id=../../etc/passwd')
  assert.equal(out.response.status, 400)
})

test('POST /generate：请求体校验与成功返回', async () => {
  const { service, calls } = makeService()
  let out = await callRoute(service, 'POST', '/generate', { body: { sessionId: 'sess-1', prompt: '一只猫' } })
  assert.equal(out.json.ok, true)
  assert.equal(out.json.value.record.status, 'queued')
  assert.equal(calls[0].input.prompt, '一只猫')
  assert.equal(calls[0].sessionId, 'sess-1')

  out = await callRoute(service, 'POST', '/generate', { body: { prompt: '没有 sessionId' } })
  assert.equal(out.response.status, 400)
  assert.equal(out.json.error.code, 'INVALID_SESSION_ID')

  out = await callRoute(service, 'POST', '/generate', { body: '{bad json' })
  assert.equal(out.response.status, 400)
  assert.equal(out.json.error.code, 'INVALID_BODY')

  out = await callRoute(service, 'POST', '/generate', { body: '[1,2]' })
  assert.equal(out.response.status, 400)
})

test('POST /generate：请求体过大 413', async () => {
  const { service } = makeService({ getConfig: () => ({ maxBodyBytes: 50 }) })
  const out = await callRoute(service, 'POST', '/generate', { body: { sessionId: 'sess-1', prompt: 'x'.repeat(200) } })
  assert.equal(out.response.status, 413)
  assert.equal(out.json.error.code, 'BODY_TOO_LARGE')
})

test('POST /recreate /cancel /delete', async () => {
  const { service, calls } = makeService()
  let out = await callRoute(service, 'POST', '/recreate', { body: { sessionId: 'sess-1', sourceId: RECORD.id, prompt: '续写' } })
  assert.equal(out.json.ok, true)
  assert.equal(out.json.value.record.originId, RECORD.id)
  assert.equal(out.json.value.plan.mode, 'reference')
  assert.equal(calls[0].overrides.prompt, '续写')

  out = await callRoute(service, 'POST', '/cancel', { body: { sessionId: 'sess-1', id: RECORD.id } })
  assert.equal(out.json.value.record.status, 'cancelled')

  out = await callRoute(service, 'POST', '/delete', { body: { sessionId: 'sess-1', id: RECORD.id } })
  assert.equal(out.json.ok, true)
  assert.equal(out.json.value.deleted, true)
  assert.equal(out.json.value.id, RECORD.id)
})

test('GET/POST /settings：读打码、写 patch', async () => {
  const { service, calls } = makeService()
  let out = await callRoute(service, 'GET', '/settings')
  assert.equal(out.json.ok, true)
  assert.equal(out.json.value.settings.demo, true)

  out = await callRoute(service, 'POST', '/settings', { body: { patch: { provider: 'ark', arkApiKey: 'ark-****cdef' } } })
  assert.equal(out.json.ok, true)
  assert.deepEqual(calls[0].patch, { provider: 'ark', arkApiKey: 'ark-****cdef' })
  assert.ok(Array.isArray(out.json.value.changed))

  // 也接受直接 body（不带 patch 包裹）
  out = await callRoute(service, 'POST', '/settings', { body: { provider: 'demo' } })
  assert.deepEqual(calls[1].patch, { provider: 'demo' })
})

test('GET /media：200 全量、206 Range、416 越界、HEAD', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-routes-media-'))
  const filePath = path.join(dir, 'sd_abc_1.mp4')
  const bytes = Buffer.alloc(1000, 5)
  fs.writeFileSync(filePath, bytes)
  const { service } = makeService({ media: { path: filePath, fileName: 'sd_abc_1.mp4' } })

  let out = await callRoute(service, 'GET', '/media?id=' + RECORD.id + '&kind=video')
  assert.equal(out.response.status, 200)
  assert.equal(out.response.headers.get('accept-ranges'), 'bytes')
  assert.equal(Number(out.response.headers.get('content-length')), 1000)
  assert.equal(out.response.headers.get('content-type'), 'video/mp4')

  out = await callRoute(service, 'GET', '/media?id=' + RECORD.id + '&kind=video', { headers: { range: 'bytes=100-199' } })
  assert.equal(out.response.status, 206)
  assert.equal(out.response.headers.get('content-range'), 'bytes 100-199/1000')
  assert.equal(Number(out.response.headers.get('content-length')), 100)

  out = await callRoute(service, 'GET', '/media?id=' + RECORD.id + '&kind=video', { headers: { range: 'bytes=5000-' } })
  assert.equal(out.response.status, 416)
  assert.equal(out.response.headers.get('content-range'), 'bytes */1000')

  out = await callRoute(service, 'GET', '/media?id=' + RECORD.id + '&kind=video', { headers: { range: 'bytes=-10' } })
  assert.equal(out.response.status, 206)

  out = await callRoute(service, 'HEAD', '/media?id=' + RECORD.id + '&kind=video')
  assert.equal(out.response.status, 200)
  assert.equal(out.text, '')

  out = await callRoute(service, 'GET', '/media?id=' + RECORD.id + '&kind=bogus')
  assert.equal(out.response.status, 400)
  assert.equal(out.json.error.code, 'INVALID_MEDIA_KIND')
})

test('GET /media：文件不存在 404、记录 id 非法 400', async () => {
  const { service } = makeService({ media: null })
  let out = await callRoute(service, 'GET', '/media?id=sd_abc_1&kind=video')
  assert.equal(out.response.status, 404)
  assert.equal(out.json.error.code, 'MEDIA_NOT_FOUND')
  out = await callRoute(service, 'GET', '/media?id=bad!id&kind=video')
  assert.equal(out.response.status, 400)
})

test('POST /relay/models：透传弹窗输入并返回模型列表（测试连接）', async () => {
  const { service, calls } = makeService({
    relayModels: async (input) => {
      calls.push({ type: 'relay-models', input })
      return { endpoint: '/v1/models', protocol: 'openai', models: [{ id: 'm1', label: 'M1' }], latencyMs: 12 }
    }
  })
  const out = await callRoute(service, 'POST', '/relay/models', { body: { baseUrl: 'https://relay.example.com', apiKey: 'k', protocol: 'openai' } })
  assert.equal(out.response.status, 200)
  assert.equal(out.json.ok, true)
  assert.equal(out.json.value.models[0].id, 'm1')
  assert.equal(out.json.value.latencyMs, 12)
  assert.equal(calls[0].input.baseUrl, 'https://relay.example.com')
  assert.equal(calls[0].input.protocol, 'openai')
})

test('POST /relay/models：失败映射为 ok:false 与可读错误', async () => {
  const { service } = makeService({
    relayModels: async () => { throw Object.assign(new Error('中转站模型列表获取失败（已尝试 3 个端点）'), { code: 'RelayModelsFailed', status: 502 }) }
  })
  const out = await callRoute(service, 'POST', '/relay/models', { body: {} })
  assert.equal(out.response.status, 502)
  assert.deepEqual(out.json, { ok: false, error: { code: 'RelayModelsFailed', message: '中转站模型列表获取失败（已尝试 3 个端点）' } })
})

test('错误映射：带 status/code 的服务错误 → 对应 HTTP 状态与 ok:false', async () => {
  const conflict = Object.assign(new Error('任务运行中不可取消'), { code: 'RunningCannotCancel', status: 409 })
  const { service } = makeService({ cancel: async () => { throw conflict } })
  const out = await callRoute(service, 'POST', '/cancel', { body: { sessionId: 'sess-1', id: RECORD.id } })
  assert.equal(out.response.status, 409)
  assert.deepEqual(out.json, { ok: false, error: { code: 'RunningCannotCancel', message: '任务运行中不可取消' } })
})

test('工具函数：jsonValue/jsonError/mapErrorToResponse/parseRange/readJsonRequest', async () => {
  let response = jsonValue({ a: 1 })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, value: { a: 1 } })
  response = jsonError(new RequestError(400, 'X', '坏请求'), 400)
  assert.deepEqual(await response.json(), { ok: false, error: { code: 'X', message: '坏请求' } })
  response = mapErrorToResponse(new Error('普通错误'))
  assert.equal(response.status, 500)
  const mapped = await mapErrorToResponse(Object.assign(new Error('冲突'), { code: 'C', status: 409 })).json()
  assert.equal(mapped.error.code, 'C')

  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9, length: 10 })
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99, length: 10 })
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99, length: 10 })
  assert.equal(parseRange(null, 100), null)
  assert.throws(() => parseRange('bytes=0-9,20-30', 100), (error) => error.status === 416)

  const request = new Request('http://x/y', { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } })
  assert.deepEqual(await readJsonRequest(request, 1000), { a: 1 })
  const empty = new Request('http://x/y', { method: 'POST' })
  assert.deepEqual(await readJsonRequest(empty, 1000), {})
  const big = new Request('http://x/y', { method: 'POST', body: 'x'.repeat(200) })
  await assert.rejects(() => readJsonRequest(big, 100), (error) => error.status === 413)

  assert.throws(() => requireSessionId('a/b'), RequestError)
  assert.equal(requireSessionId('sess-1'), 'sess-1')
  assert.equal(requireRecordId('sd_abc_123'), 'sd_abc_123')
  assert.throws(() => requireRecordId('abc'), RequestError)
  assert.deepEqual(MEDIA_KINDS, ['video', 'lastframe', 'poster'])
})
