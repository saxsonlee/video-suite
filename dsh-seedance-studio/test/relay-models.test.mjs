/**
 * relay-models 单测：候选端点、响应解析、鉴权头、端点回退与失败映射。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { RELAY_MODEL_PATHS, relayModelPaths, extractModelIds, listRelayModels } from '../server/api/index.js'
import { ApiError } from '../server/api/errors.js'

function mockFetch(handler) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return handler(url, init)
  }
  return { fetchImpl, calls }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
}

test('候选端点：按协议排序且每次返回副本', () => {
  assert.deepEqual(relayModelPaths('ark'), ['/api/v3/models', '/v1/models', '/models'])
  assert.deepEqual(relayModelPaths('openai'), ['/v1/models', '/api/v3/models', '/models'])
  assert.deepEqual(relayModelPaths('unknown'), RELAY_MODEL_PATHS.openai)
  const copy = relayModelPaths('ark')
  copy.push('/x')
  assert.equal(RELAY_MODEL_PATHS.ark.length, 3, '常量不得被外部修改')
})

test('extractModelIds：兼容 data/models/items/foundation_models/纯数组并去重', () => {
  assert.deepEqual(extractModelIds({ data: [{ id: 'a' }, { id: 'b', display_name: 'B 模型' }] }), [
    { id: 'a', label: 'a' },
    { id: 'b', label: 'B 模型' }
  ])
  assert.deepEqual(extractModelIds({ models: ['x', { id: 'x' }, { id: 'y', label: 'Y' }] }), [
    { id: 'x', label: 'x' },
    { id: 'y', label: 'Y' }
  ])
  assert.deepEqual(extractModelIds([{ model: 'm1' }, { model_id: 'm2', name: 'M2' }]), [
    { id: 'm1', label: 'm1' },
    { id: 'm2', label: 'M2' }
  ])
  assert.deepEqual(extractModelIds({ items: [{ id: 'i1' }] }), [{ id: 'i1', label: 'i1' }])
  assert.deepEqual(extractModelIds({ foundation_models: [{ id: 'f1' }] }), [{ id: 'f1', label: 'f1' }])
  assert.deepEqual(extractModelIds(null), [])
  assert.deepEqual(extractModelIds({ nope: true }), [])
  assert.deepEqual(extractModelIds([{ id: '' }, {}, 42]), [])
})

test('listRelayModels：openai 协议成功、带鉴权头、去掉末尾斜杠', async () => {
  const { fetchImpl, calls } = mockFetch((url) => url.endsWith('/v1/models') ? jsonResponse({ data: [{ id: 'seedance-2.5' }, { id: 'seedance-1.0' }] }) : jsonResponse({}, 404))
  const result = await listRelayModels({ baseUrl: 'https://relay.example.com/', apiKey: 'relay-key-123', protocol: 'openai', fetchImpl, timeoutMs: 1000 })
  assert.equal(result.endpoint, '/v1/models')
  assert.equal(result.protocol, 'openai')
  assert.equal(result.url, 'https://relay.example.com/v1/models')
  assert.deepEqual(result.models.map((item) => item.id), ['seedance-2.5', 'seedance-1.0'])
  assert.equal(calls[0].init.headers.Authorization, 'Bearer relay-key-123')
  assert.equal(calls[0].init.method, 'GET')
  assert.ok(result.latencyMs >= 0)
})

test('listRelayModels：ark 协议先试 /api/v3/models，失败后回退 /v1/models', async () => {
  const { fetchImpl, calls } = mockFetch((url) => {
    if (url.endsWith('/api/v3/models')) return jsonResponse({ error: { message: 'not found' } }, 404)
    if (url.endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'ark-relay-model' }] })
    return jsonResponse({}, 404)
  })
  const result = await listRelayModels({ baseUrl: 'https://relay.example.com', apiKey: 'k', protocol: 'ark', fetchImpl })
  assert.equal(result.endpoint, '/v1/models')
  assert.deepEqual(result.models.map((item) => item.id), ['ark-relay-model'])
  assert.equal(calls.length, 2)
})

test('listRelayModels：自定义鉴权头/前缀', async () => {
  const { fetchImpl, calls } = mockFetch(() => jsonResponse({ data: [{ id: 'm' }] }))
  await listRelayModels({ baseUrl: 'https://relay.example.com', apiKey: 'secret', protocol: 'openai', fetchImpl, authHeader: 'X-API-Key', authPrefix: '' })
  assert.equal(calls[0].init.headers['X-API-Key'], 'secret')
  assert.equal(calls[0].init.headers.Authorization, undefined)
})

test('listRelayModels：全部端点失败 → 抛出可读 ApiError（含每个端点原因）', async () => {
  const { fetchImpl } = mockFetch(() => jsonResponse({ error: { message: 'invalid key' } }, 401))
  await assert.rejects(
    () => listRelayModels({ baseUrl: 'https://relay.example.com', apiKey: 'bad', protocol: 'openai', fetchImpl }),
    (error) => error instanceof ApiError && error.code === 'RelayModelsFailed' && /invalid key/.test(error.message) && /3 个端点/.test(error.message)
  )
})

test('listRelayModels：参数校验与空列表处理', async () => {
  await assert.rejects(() => listRelayModels({ baseUrl: '' }), (error) => error.code === 'MissingRelayBaseUrl')
  await assert.rejects(() => listRelayModels({ baseUrl: 'ftp://relay' }), (error) => error.code === 'InvalidRelayBaseUrl')
  const { fetchImpl } = mockFetch(() => jsonResponse({ data: [] }))
  await assert.rejects(
    () => listRelayModels({ baseUrl: 'https://relay.example.com', protocol: 'openai', fetchImpl }),
    (error) => error.code === 'RelayModelsFailed' && /没有可识别的模型列表/.test(error.message)
  )
  const { fetchImpl: slowFetch } = mockFetch((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
  }))
  await assert.rejects(
    () => listRelayModels({ baseUrl: 'https://relay.example.com', protocol: 'openai', fetchImpl: slowFetch, timeoutMs: 20 }),
    (error) => error.code === 'RelayModelsFailed' && /超时/.test(error.message)
  )
})
