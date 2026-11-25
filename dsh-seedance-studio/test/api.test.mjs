/**
 * api.js 单测：Ark/relay 响应归一化、请求体构造、客户端交互、错误映射、媒体下载。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import {
  isTerminalStatus, normalizeStatus, ApiError, readJsonSafe, pickTaskId, pickVideoUrl,
  extractErrorInfo, normalizeArkTask, normalizeRelayTask, buildRelayCreateBody,
  ArkVideoClient, RelayVideoClient, createVideoClient, downloadFile, describeApiError, apiErrorStatus,
  assertTaskId, TERMINAL_STATUSES
} from '../server/api/index.js'

const M25 = 'doubao-seedance-2-5-260628'

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
}

test('状态归一化', () => {
  assert.equal(normalizeStatus('QUEUED'), 'queued')
  assert.equal(normalizeStatus('in_progress'), 'running')
  assert.equal(normalizeStatus('completed'), 'succeeded')
  assert.equal(normalizeStatus('canceled'), 'cancelled')
  assert.equal(normalizeStatus('weird'), null)
  for (const status of TERMINAL_STATUSES) assert.ok(isTerminalStatus(status))
  assert.equal(isTerminalStatus('running'), false)
})

test('normalizeArkTask：成功/运行中/失败', () => {
  const succeeded = normalizeArkTask({
    id: 'cgt-1', model: M25, status: 'succeeded', created_at: 1700000000,
    content: { video_url: 'https://cdn.example.com/v.mp4', last_frame_url: 'https://cdn.example.com/l.jpg' },
    usage: { completion_tokens: 100, total_tokens: 120 }
  })
  assert.equal(succeeded.status, 'succeeded')
  assert.equal(succeeded.videoUrl, 'https://cdn.example.com/v.mp4')
  assert.equal(succeeded.lastFrameUrl, 'https://cdn.example.com/l.jpg')
  assert.equal(succeeded.usage.total_tokens, 120)
  assert.equal(succeeded.createdAt, 1700000000)

  const running = normalizeArkTask({ id: 'cgt-2', status: 'running', progress: 55 })
  assert.equal(running.status, 'running')
  assert.equal(running.progress, 55)

  const failed = normalizeArkTask({ id: 'cgt-3', status: 'failed', error: { code: 'SensitiveContentDetected', message: '提示词违规' } })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.error.code, 'SensitiveContentDetected')

  const missingUrl = normalizeArkTask({ id: 'cgt-4', status: 'succeeded', content: {} })
  assert.equal(missingUrl.status, 'failed')
  assert.equal(missingUrl.error.code, 'MissingVideoUrl')
})

test('normalizeRelayTask：多种中转响应结构', () => {
  const a = normalizeRelayTask({ data: [{ task_id: 't-1', status: 'successful', result_url: 'https://r/v.mp4', progress: '100' }] })
  assert.equal(a.id, 't-1')
  assert.equal(a.status, 'succeeded')
  assert.equal(a.videoUrl, 'https://r/v.mp4')
  assert.equal(a.progress, undefined === a.progress ? a.progress : a.progress)

  const b = normalizeRelayTask({ task_id: 't-2', status: 'processing', progress: 30 })
  assert.equal(b.status, 'running')
  assert.equal(b.progress, 30)

  const c = normalizeRelayTask({ data: { id: 't-3', status: 'failed', fail_reason: '内容不合法' } })
  assert.equal(c.status, 'failed')
  assert.match(c.error.message, /内容不合法/)

  const d = normalizeRelayTask({ id: 't-4', status: 'succeeded', video_url: 'https://r/v2.mp4' })
  assert.equal(d.videoUrl, 'https://r/v2.mp4')

  const e = normalizeRelayTask({}, { fallbackId: 'fallback-1' })
  assert.equal(e.id, 'fallback-1')
})

test('pickTaskId / pickVideoUrl / extractErrorInfo / readJsonSafe', async () => {
  assert.equal(pickTaskId({ data: { task_id: 'x' } }), 'x')
  assert.equal(pickTaskId({ id: 12 }), '12')
  assert.equal(pickVideoUrl({ output: 'https://a/b.mp4' }), 'https://a/b.mp4')
  assert.equal(pickVideoUrl({ data: { videos: [{ url: 'https://a/c.mp4' }] } }), 'https://a/c.mp4')
  const info = extractErrorInfo({ error: { code: 'X', message: '错误' } })
  assert.equal(info.code, 'X')
  assert.equal(info.message, '错误')
  assert.deepEqual(await readJsonSafe(jsonResponse({ a: 1 })), { a: 1 })
  assert.deepEqual(await readJsonSafe(new Response('not-json')), { raw: 'not-json' })
})

test('buildRelayCreateBody：metadata / flat / orca 三种风格', () => {
  const payload = {
    model: M25,
    content: [
      { type: 'text', text: '一只猫' },
      { type: 'image_url', image_url: { url: 'https://e/a.png' }, role: 'first_frame' },
      { type: 'image_url', image_url: { url: 'https://e/b.png' }, role: 'last_frame' }
    ],
    duration: 5,
    ratio: 'adaptive',
    resolution: '720p',
    seed: 7,
    generate_audio: true
  }
  const mapModel = (model) => 'mapped-' + model
  const metadata = buildRelayCreateBody(payload, { style: 'metadata', mapModel })
  assert.equal(metadata.model, 'mapped-' + M25)
  assert.equal(metadata.prompt, '一只猫')
  // new-api 风格不再额外设置 body.image：首帧只放 metadata.content（带 role），
  // 否则 new-api 会用顶层 image 重建上游 content 并丢掉 role（方舟报 role must be specified，2026-11-09 实测）
  assert.equal(metadata.image, undefined)
  assert.equal(metadata.duration, 5)
  assert.equal(metadata.metadata.ratio, 'adaptive')
  // New API 中转站只展开 metadata：duration 必须同时出现在 metadata（06:46 relay.mjs 实测修复）
  assert.equal(metadata.metadata.duration, 5)
  assert.equal(metadata.metadata.content.length, 2)
  assert.equal(metadata.metadata.content[1].role, 'end_frame')

  const flat = buildRelayCreateBody(payload, { style: 'flat' })
  assert.equal(flat.image, 'https://e/a.png')
  assert.equal(flat.duration, 5)
  assert.equal(flat.metadata, undefined)
  assert.equal(flat.ratio, 'adaptive')
  assert.ok(Array.isArray(flat.images))

  const orca = buildRelayCreateBody(payload, { style: 'orca' })
  assert.equal(orca.metadata.duration, 5)
  assert.equal(orca.metadata.content.length, 2)
  assert.equal(orca.image, undefined)
})

test('ArkVideoClient：创建/查询/取消 + 鉴权头与错误映射', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null })
    if (url.endsWith('/tasks') && init.method === 'POST') {
      return jsonResponse({ id: 'cgt-abc' }, 200, { 'x-request-id': 'req-1' })
    }
    if (url.endsWith('/cgt-abc') && init.method === 'GET') {
      return jsonResponse({ id: 'cgt-abc', status: 'succeeded', content: { video_url: 'https://cdn/v.mp4' } })
    }
    if (init.method === 'DELETE') return jsonResponse({})
    return jsonResponse({ error: { code: 'X', message: 'unexpected' } }, 500)
  }
  const client = new ArkVideoClient({ apiKey: 'ark-test-key-123', baseUrl: 'https://ark.example.com', tasksPath: '/api/v3/contents/generations/tasks', fetchImpl })
  const created = await client.createTask({ model: M25, content: [{ type: 'text', text: 'hi' }] })
  assert.equal(created.id, 'cgt-abc')
  assert.equal(created.requestId, 'req-1')
  assert.equal(calls[0].headers.Authorization, 'Bearer ark-test-key-123')
  assert.equal(calls[0].body.model, M25)
  assert.equal(calls[0].url, 'https://ark.example.com/api/v3/contents/generations/tasks')

  const task = await client.getTask('cgt-abc')
  assert.equal(task.status, 'succeeded')
  assert.equal(task.videoUrl, 'https://cdn/v.mp4')
  assert.equal(calls[1].url, 'https://ark.example.com/api/v3/contents/generations/tasks/cgt-abc')

  const cancelled = await client.cancelTask('cgt-abc')
  assert.equal(cancelled.ok, true)

  assert.throws(() => new ArkVideoClient({ apiKey: '' }), (error) => error.code === 'MissingApiKey')
  assert.throws(() => assertTaskId('../x'), (error) => error.code === 'InvalidTaskId')
})

test('ArkVideoClient：HTTP 错误映射为 ApiError', async () => {
  const client = new ArkVideoClient({
    apiKey: 'k-1234567890',
    fetchImpl: async () => jsonResponse({ error: { code: 'AuthenticationError', message: 'invalid key' } }, 401)
  })
  await assert.rejects(() => client.getTask('cgt-x'), (error) => {
    assert.ok(error instanceof ApiError)
    assert.equal(error.status, 401)
    assert.equal(error.code, 'AuthenticationError')
    assert.match(describeApiError(error), /401/)
    assert.equal(apiErrorStatus(error), 401)
    return true
  })
})

test('RelayVideoClient：openai 协议请求体/查询/取消', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null })
    if (init.method === 'POST') return jsonResponse({ data: [{ task_id: 'relay-1' }] })
    if (init.method === 'GET') return jsonResponse({ data: { task_id: 'relay-1', status: 'succeeded', result_url: 'https://r/v.mp4' } })
    return jsonResponse({})
  }
  const client = new RelayVideoClient({
    baseUrl: 'https://relay.example.com',
    apiKey: 'relay-key-123456',
    protocol: 'openai',
    style: 'metadata',
    modelMap: { [M25]: 'seedance-2.5' },
    fetchImpl
  })
  const created = await client.createTask({ model: M25, content: [{ type: 'text', text: 'hi' }], duration: 5, resolution: '720p' })
  assert.equal(created.id, 'relay-1')
  assert.equal(calls[0].url, 'https://relay.example.com/v1/video/generations')
  assert.equal(calls[0].body.model, 'seedance-2.5')
  assert.equal(calls[0].headers.Authorization, 'Bearer relay-key-123456')
  const task = await client.getTask('relay-1')
  assert.equal(task.status, 'succeeded')
  assert.equal(calls[1].url, 'https://relay.example.com/v1/video/generations/relay-1')

  const relayArk = new RelayVideoClient({ baseUrl: 'https://relay.example.com', apiKey: 'k-123456', protocol: 'ark', fetchImpl: async () => jsonResponse({}) })
  assert.equal(relayArk.createPath, '/api/v3/contents/generations/tasks')
  assert.throws(() => new RelayVideoClient({ baseUrl: '', apiKey: 'k' }), (error) => error.code === 'MissingRelayBaseUrl')
  assert.throws(() => new RelayVideoClient({ baseUrl: 'ftp://x', apiKey: 'k' }), (error) => error.code === 'InvalidRelayBaseUrl')
})

test('createVideoClient：demo 抛错、ark/relay 分支', () => {
  assert.throws(() => createVideoClient({ demo: true, provider: 'demo' }), (error) => error.code === 'DemoMode')
  const ark = createVideoClient({ demo: false, provider: 'ark', requestTimeoutMs: 1000, ark: { baseUrl: 'https://ark.example.com', tasksPath: '/api/v3/contents/generations/tasks', apiKey: 'k-123' }, arkApiKey: 'k-123', relay: null })
  assert.ok(ark instanceof ArkVideoClient)
  const relay = createVideoClient({ demo: false, provider: 'relay', requestTimeoutMs: 1000, ark: {}, arkApiKey: '', relay: { baseUrl: 'https://relay.example.com', apiKey: 'k-123', protocol: 'openai', style: 'metadata' } })
  assert.ok(relay instanceof RelayVideoClient)
})

test('downloadFile：通过本地 HTTP 服务下载并原子落盘', async () => {
  const bytes = Buffer.from('fake-video-content-'.repeat(100))
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': bytes.length })
    res.end(bytes)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-dl-'))
  const dest = path.join(dir, 'v.mp4')
  try {
    const result = await downloadFile('http://127.0.0.1:' + port + '/v.mp4', dest)
    assert.equal(result.bytes, bytes.length)
    assert.equal(fs.readFileSync(dest).toString(), bytes.toString())
    assert.equal(fs.existsSync(dest + '.part'), false)
  } finally {
    server.close()
  }
})
