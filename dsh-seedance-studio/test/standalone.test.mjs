/**
 * 独立后端（脱离 DSH）集成测试：真实 node:http 监听 127.0.0.1:0。
 * 覆盖：ping/config/静态页/404、demo 生成→历史→媒体 Range→再创作→删除、token 鉴权、CORS、405。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createStandaloneServer } from '../platforms/web/http.js'

function makeHarness(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-standalone-'))
  const clock = { value: 1700000000000, advance(ms) { this.value += ms } }
  const server = createStandaloneServer({
    storageRoot: root,
    env: {},
    now: () => clock.value,
    random: () => 0,
    autoPoll: false,
    ...options
  })
  return { root, clock, server }
}

async function postJson(base, path, body, headers = {}) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
}

test('独立后端：ping / config / 静态页 / 404', async () => {
  const { root, server } = makeHarness()
  try {
    const info = await server.start({ port: 0 })
    const base = info.url
    let res = await fetch(base + '/api/seedance/ping')
    assert.equal(res.status, 200)
    let data = await res.json()
    assert.equal(data.ok, true)
    assert.equal(data.value.pong, true)

    res = await fetch(base + '/api/seedance/config')
    data = await res.json()
    assert.equal(data.ok, true)
    assert.equal(data.value.demo, true)
    assert.ok(data.value.models.length >= 6)
    assert.ok(data.value.defaults.defaultModel)

    res = await fetch(base + '/')
    assert.equal(res.status, 200)
    const pageHtml = await res.text()
    assert.match(pageHtml, /Seedance/)
    assert.match(pageHtml, /src="i18n\.js"/)
    assert.ok((pageHtml.match(/data-i18n=/g) || []).length >= 20, 'data-i18n 属性太少')
    const i18nRes = await fetch(base + '/i18n.js')
    assert.equal(i18nRes.status, 200)
    assert.match(await i18nRes.text(), /SeedanceI18n/)

    res = await fetch(base + '/api/seedance/unknown')
    assert.equal(res.status, 404)
    data = await res.json()
    assert.equal(data.ok, false)
    assert.equal(data.error.code, 'NOT_FOUND')
  } finally {
    await server.stop()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('独立后端：demo 生成 → 历史 → 媒体 Range → 再创作 → 删除', async () => {
  const { root, clock, server } = makeHarness()
  try {
    const info = await server.start({ port: 0 })
    const base = info.url
    const sessionId = 'standalone-test-1'

    // 1) 生成（demo 自动模式）
    let res = await postJson(base, '/api/seedance/generate', {
      sessionId,
      prompt: '一只橘猫在窗台上伸懒腰，阳光洒落，电影感'
    })
    assert.equal(res.status, 200)
    let body = await res.json()
    assert.equal(body.ok, true)
    const record = body.value.record
    assert.equal(record.status, 'queued')
    assert.equal(record.provider, 'demo')
    const id = record.id
    assert.ok(id)

    // 2) 推进时钟 → running
    clock.advance(2500)
    await server.runtime.tasks.runPollSession(sessionId, id)
    res = await fetch(base + '/api/seedance/history?sessionId=' + encodeURIComponent(sessionId))
    body = await res.json()
    assert.equal(body.value.records.length, 1)
    assert.equal(body.value.records[0].status, 'running')

    // 3) 推进到完成（demo doneAtMs=8000）
    clock.advance(6000)
    await server.runtime.tasks.runPollSession(sessionId, id)
    res = await fetch(base + '/api/seedance/task?sessionId=' + encodeURIComponent(sessionId) + '&id=' + encodeURIComponent(id))
    body = await res.json()
    assert.equal(body.value.record.status, 'succeeded')
    assert.equal(body.value.record.progress, 100)

    // 4) 媒体：整段 + Range 206
    res = await fetch(base + '/api/seedance/media?id=' + encodeURIComponent(id) + '&kind=video')
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'video/mp4')
    const full = await res.arrayBuffer()
    assert.ok(full.byteLength > 10000, 'demo 视频应落盘真实示例（852KB）')

    res = await fetch(base + '/api/seedance/media?id=' + encodeURIComponent(id) + '&kind=video', { headers: { range: 'bytes=0-1023' } })
    assert.equal(res.status, 206)
    assert.equal((await res.arrayBuffer()).byteLength, 1024)
    assert.match(res.headers.get('content-range') || '', /^bytes 0-1023\//)

    // 5) 再创作（基于历史视频）
    res = await postJson(base, '/api/seedance/recreate', {
      sessionId,
      sourceId: id,
      prompt: '同一只橘猫，换到海边日落场景',
      params: { duration: 4 }
    })
    body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.value.record.status, 'queued')
    assert.equal(body.value.record.originId, id)
    assert.ok(body.value.plan && body.value.plan.originId === id)

    // 6) 删除记录与媒体
    res = await postJson(base, '/api/seedance/delete', { sessionId, id })
    body = await res.json()
    assert.equal(body.ok, true)
    assert.equal(body.value.deleted, true)
    res = await fetch(base + '/api/seedance/media?id=' + encodeURIComponent(id) + '&kind=video')
    assert.equal(res.status, 404)
  } finally {
    await server.stop()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('独立后端：token 鉴权', async () => {
  const { root, server } = makeHarness({ token: 'secret-123' })
  try {
    const info = await server.start({ port: 0 })
    const base = info.url

    let res = await fetch(base + '/api/seedance/ping')
    assert.equal(res.status, 401)
    let body = await res.json()
    assert.equal(body.error.code, 'UNAUTHORIZED')

    res = await fetch(base + '/api/seedance/ping', { headers: { authorization: 'Bearer secret-123' } })
    assert.equal(res.status, 200)

    res = await fetch(base + '/api/seedance/ping?token=secret-123')
    assert.equal(res.status, 200)

    res = await fetch(base + '/')
    assert.equal(res.status, 200, '静态页不要求 token（本机同源）')
  } finally {
    await server.stop()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('独立后端：CORS 预检与 405', async () => {
  const { root, server } = makeHarness({ cors: true })
  try {
    const info = await server.start({ port: 0 })
    const base = info.url

    let res = await fetch(base + '/api/seedance/ping', { method: 'OPTIONS' })
    assert.equal(res.status, 204)
    assert.equal(res.headers.get('access-control-allow-origin'), '*')
    assert.match(res.headers.get('access-control-allow-methods') || '', /POST/)

    res = await fetch(base + '/api/seedance/ping', { method: 'DELETE' })
    assert.equal(res.status, 405)
    const body = await res.json()
    assert.equal(body.error.code, 'METHOD_NOT_ALLOWED')
    assert.match(res.headers.get('allow') || '', /GET/)

    res = await fetch(base + '/api/seedance/ping')
    assert.equal(res.headers.get('access-control-allow-origin'), '*')
  } finally {
    await server.stop()
    fs.rmSync(root, { recursive: true, force: true })
  }
})
