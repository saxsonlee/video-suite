/**
 * 端到端：设置页「获取模型列表 / 测试连接」→ 默认模型直选中转站模型。
 * 真实 node:http 起 mock 中转站 + 独立后端（createStandaloneServer），走完整 HTTP 链路。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { createStandaloneServer } from '../platforms/web/http.js'

async function startMockRelay() {
  const calls = []
  const server = http.createServer((req, res) => {
    calls.push({ method: req.method, url: req.url, auth: req.headers.authorization })
    if (req.url === '/v1/models') {
      if (req.headers.authorization !== 'Bearer test-relay-key') {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'invalid key' } }))
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'relay-model-a', display_name: 'Relay A' }, { id: 'relay-model-b' }] }))
      return
    }
    res.writeHead(404, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'not found' } }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    url: 'http://127.0.0.1:' + address.port,
    calls,
    stop: () => new Promise((resolve) => server.close(resolve))
  }
}

async function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body === undefined ? {} : body)
  })
}

test('端到端：拉取中转站模型列表 / 测连通 / 保存后默认模型生效', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-relay-e2e-'))
  const mock = await startMockRelay()
  const host = createStandaloneServer({
    storageRoot: root,
    env: { RELAY_BASE_URL: mock.url, RELAY_API_KEY: 'test-relay-key', RELAY_PROTOCOL: 'openai' },
    now: () => 1700000000000,
    autoPoll: false
  })
  try {
    const info = await host.start({ port: 0 })
    const base = info.url

    // 1) 用已保存配置拉列表（测试连接）：openai 协议 → /v1/models 成功
    let res = await postJson(base + '/api/seedance/relay/models', {})
    let body = await res.json()
    assert.equal(res.status, 200)
    assert.equal(body.ok, true)
    assert.equal(body.value.endpoint, '/v1/models')
    assert.equal(body.value.protocol, 'openai')
    assert.deepEqual(body.value.models.map((item) => item.id), ['relay-model-a', 'relay-model-b'])
    assert.equal(body.value.models[0].label, 'Relay A')
    assert.ok(body.value.latencyMs >= 0)
    assert.ok(mock.calls.length >= 1, 'mock 中转站应收到请求')

    // 2) 弹窗里未保存的输入可覆盖已保存配置（输入即测）
    res = await postJson(base + '/api/seedance/relay/models', { baseUrl: mock.url, apiKey: 'test-relay-key', protocol: 'openai' })
    body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.value.models.length, 2)

    // 3) 错误 Key → 502 + RelayModelsFailed + 可读原因（不静默成功）
    res = await postJson(base + '/api/seedance/relay/models', { baseUrl: mock.url, apiKey: 'wrong-key', protocol: 'openai' })
    body = await res.json()
    assert.equal(res.status, 502)
    assert.equal(body.ok, false)
    assert.equal(body.error.code, 'RelayModelsFailed')
    assert.match(body.error.message, /invalid key/)

    // 4) 非法地址 → 503 + InvalidRelayBaseUrl
    res = await postJson(base + '/api/seedance/relay/models', { baseUrl: 'ftp://bad.example.com', apiKey: 'k' })
    body = await res.json()
    assert.equal(res.status, 503)
    assert.equal(body.error.code, 'InvalidRelayBaseUrl')

    // 5) 保存模型列表缓存 + 默认模型 → 读回保持一致（设置页下次打开可恢复）
    res = await postJson(base + '/api/seedance/settings', {
      patch: {
        defaultModel: 'relay-model-a',
        relayModels: [{ id: 'relay-model-a', label: 'Relay A' }, { id: 'relay-model-b', label: 'relay-model-b' }]
      }
    })
    body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.value.settings.defaultModel, 'relay-model-a')
    assert.equal(body.value.settings.relayModels.length, 2)

    res = await fetch(base + '/api/seedance/settings')
    body = await res.json()
    assert.equal(body.value.settings.defaultModel, 'relay-model-a')
    assert.deepEqual(body.value.settings.relayModels.map((item) => item.id), ['relay-model-a', 'relay-model-b'])

    // 6) /config 的 defaults 跟随设置：默认模型 + 已选模型清单（主面板「模型」下拉）
    res = await fetch(base + '/api/seedance/config')
    body = await res.json()
    assert.equal(body.value.defaults.defaultModel, 'relay-model-a')
    assert.deepEqual(body.value.defaults.enabledModels.map((item) => item.id), ['relay-model-a', 'relay-model-b'])

    // 7) 设置持久化到 settings.json（重启后仍生效）
    const saved = JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'))
    assert.equal(saved.DEFAULT_MODEL, 'relay-model-a')
    assert.equal(typeof saved.RELAY_MODELS, 'string')
    assert.deepEqual(JSON.parse(saved.RELAY_MODELS).map((item) => item.id), ['relay-model-a', 'relay-model-b'])
  } finally {
    await host.stop()
    await mock.stop()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
