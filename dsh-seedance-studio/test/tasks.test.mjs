/**
 * tasks.js 单测：demo 时间线、任务状态机、终态落盘、取消、恢复、再创作决策。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createStore } from '../server/store/index.js'
import { mergeSettings, resolveConfig } from '../server/settings/index.js'
import {
  DEMO_TIMELINE, demoStateAt, demoTaskId, buildRecreatePlan,
  createTaskManager, TaskError, defaultDemoMedia, REMOTE_URL_TTL_MS
} from '../server/tasks/index.js'

const M25 = 'doubao-seedance-2-5-260628'
const M10 = 'doubao-seedance-1-0-pro-250528'

function configFor(env = {}, pluginConfig = {}) {
  return resolveConfig(mergeSettings({ env, pluginConfig }))
}

function tempDemoMedia() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-demo-media-'))
  const videoPath = path.join(dir, 'demo.mp4')
  const lastFramePath = path.join(dir, 'demo-lastframe.jpg')
  fs.writeFileSync(videoPath, Buffer.from('demo-video-bytes'))
  fs.writeFileSync(lastFramePath, Buffer.from('demo-lastframe-bytes'))
  return { dir, videoPath, lastFramePath }
}

function newHarness(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-tasks-'))
  const store = createStore({ root })
  store.init()
  const clock = { value: 1700000000000, advance(ms) { this.value += ms } }
  const demoMedia = options.demoMedia || tempDemoMedia()
  const manager = createTaskManager({
    store,
    getConfig: options.getConfig || (() => configFor({})),
    demoMedia,
    now: () => clock.value,
    autoPoll: false,
    random: () => 0,
    createClient: options.createClient,
    downloadImpl: options.downloadImpl
  })
  return { root, store, clock, demoMedia, manager }
}

test('demo 时间线：2s/6s/8s 与失败关键词', () => {
  const start = 1000
  assert.deepEqual(demoStateAt(start, start + 10), { status: 'queued', progress: 5 })
  assert.deepEqual(demoStateAt(start, start + DEMO_TIMELINE.runningAtMs), { status: 'running', progress: 30 })
  assert.deepEqual(demoStateAt(start, start + DEMO_TIMELINE.halfAtMs), { status: 'running', progress: 70 })
  assert.deepEqual(demoStateAt(start, start + DEMO_TIMELINE.doneAtMs), { status: 'succeeded', progress: 100 })
  assert.deepEqual(demoStateAt(start, start + 5000, true), { status: 'running', progress: 30 })
  assert.deepEqual(demoStateAt(start, start + 9000, true), { status: 'failed', progress: 100 })
})

test('buildRecreatePlan：远端视频新鲜 → 参考视频模式', () => {
  const now = 1700000000000
  const record = {
    id: 'sd_old_1', model: M25, prompt: '原提示词', params: { resolution: '720p', duration: 5 },
    updatedAt: now - 60 * 60 * 1000, remoteVideoUrl: 'https://cdn/v.mp4', files: { lastFrame: 'sd_old_1-lastframe.jpg' }
  }
  const plan = buildRecreatePlan(record, {}, { now })
  assert.equal(plan.mode, 'reference')
  assert.equal(plan.mediaKind, 'remote-video')
  assert.equal(plan.remoteVideoUrl, 'https://cdn/v.mp4')
  assert.equal(plan.prompt, '原提示词')
  assert.deepEqual(plan.warnings, [])
})

test('buildRecreatePlan：远端过期 → 本地尾帧首帧续写', () => {
  const now = 1700000000000
  const record = {
    id: 'sd_old_2', model: M25, prompt: '原提示词', updatedAt: now - REMOTE_URL_TTL_MS - 1000,
    remoteVideoUrl: 'https://cdn/expired.mp4',
    files: { lastFrame: 'sd_old_2-lastframe.jpg' }
  }
  const plan = buildRecreatePlan(record, {}, { now })
  assert.equal(plan.mode, 'image2video')
  assert.equal(plan.mediaKind, 'last-frame')
  assert.equal(plan.mediaRole, 'first_frame')
  assert.ok(plan.warnings.some((text) => text.includes('过期')))
})

test('buildRecreatePlan：无素材 → 纯文生 + warning；模型不支持视频参考时回退尾帧', () => {
  const now = 1700000000000
  const plan = buildRecreatePlan({ id: 'sd_x_1', model: M25, prompt: 'p', updatedAt: now }, {}, { now })
  assert.equal(plan.mode, 'text2video')
  assert.equal(plan.mediaKind, 'none')
  assert.ok(plan.warnings.length > 0)

  const noVideoRef = buildRecreatePlan({
    id: 'sd_x_2', model: M10, prompt: 'p', updatedAt: now, remoteVideoUrl: 'https://cdn/v.mp4', files: { lastFrame: 'a.jpg' }
  }, {}, { now })
  assert.equal(noVideoRef.mode, 'image2video')
  assert.match(noVideoRef.warnings.join(';'), /不支持参考视频/)
})

test('buildRecreatePlan：显式覆盖 mode/prompt/model/params 与非法组合', () => {
  const now = 1700000000000
  const base = { id: 'sd_x_3', model: M25, prompt: 'old', params: { duration: 5 }, updatedAt: now - 2 * REMOTE_URL_TTL_MS, files: { lastFrame: 'x.jpg' } }
  const plan = buildRecreatePlan(base, { prompt: 'new prompt', model: M25, params: { duration: 8 } }, { now })
  assert.equal(plan.prompt, 'new prompt')
  assert.equal(plan.params.duration, 8)
  assert.throws(() => buildRecreatePlan(base, { mode: 'edit' }, { now }), (error) => error.code === 'SourceVideoExpired')
  assert.throws(() => buildRecreatePlan({ id: 'sd_y_1', updatedAt: now }, { mode: 'firstlast' }, { now }), (error) => error.code === 'MissingLastFrame')
})

test('demo 任务全流程：queued → running → succeeded + 落盘 + 历史', async () => {
  const { store, clock, manager, demoMedia } = newHarness()
  const sessionId = 'session-demo'
  const record = await manager.createRecord(sessionId, { prompt: '一只橘猫在窗台上' })
  assert.equal(record.provider, 'demo')
  assert.equal(record.remoteTaskId, demoTaskId(record.id))
  assert.equal(record.status, 'queued')

  clock.advance(2500)
  let current = await manager.runPollSession(sessionId, record.id)
  assert.equal(current.status, 'running')
  assert.equal(current.progress, 30)

  clock.advance(4000)
  current = await manager.runPollSession(sessionId, record.id)
  assert.equal(current.status, 'running')
  assert.equal(current.progress, 70)

  clock.advance(2000)
  current = await manager.runPollSession(sessionId, record.id)
  assert.equal(current.status, 'succeeded')
  assert.equal(current.progress, 100)
  assert.ok(current.files.video, '终态应落盘视频')
  const videoPath = store.mediaPath(current.files.video)
  assert.ok(fs.existsSync(videoPath))
  assert.equal(fs.readFileSync(videoPath).toString(), 'demo-video-bytes')
  assert.ok(current.files.lastFrame)
  assert.equal(current.meta.duration, 5)
  assert.equal(current.meta.demo, true)
  assert.equal(current.meta.usage.total_tokens, 0)

  // 终态后再轮询不改变状态
  clock.advance(10000)
  const after = await manager.runPollSession(sessionId, record.id)
  assert.equal(after.status, 'succeeded')

  const history = manager.listRecords(sessionId)
  assert.equal(history.length, 1)
  assert.equal(history[0].id, record.id)
})

test('demo 失败关键词 → failed', async () => {
  const { clock, manager } = newHarness()
  const record = await manager.createRecord('s', { prompt: '演示失败：故意触发失败路径' })
  clock.advance(9000)
  const current = await manager.runPollSession('s', record.id)
  assert.equal(current.status, 'failed')
  assert.equal(current.error.code, 'DemoFailure')
})

test('真实远端任务状态机：queued → running → succeeded，下载视频与尾帧', async () => {
  const downloaded = []
  const tasks = [
    { id: 'cgt-1', status: 'queued', progress: 10 },
    { id: 'cgt-1', status: 'running', progress: 55 },
    { id: 'cgt-1', status: 'succeeded', videoUrl: 'https://cdn/v.mp4', lastFrameUrl: 'https://cdn/l.jpg', usage: { completion_tokens: 7, total_tokens: 7 } }
  ]
  let index = 0
  const fakeClient = {
    async createTask(payload) { return { id: 'cgt-1', payload } },
    async getTask() { return tasks[Math.min(index++, tasks.length - 1)] },
    async cancelTask() { return { ok: true } }
  }
  const harness = newHarness({
    getConfig: () => configFor({ ARK_API_KEY: 'ark-key-1234567890' }),
    createClient: () => fakeClient,
    downloadImpl: async (url, dest) => {
      downloaded.push({ url, dest })
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, 'video-from-remote')
      return { bytes: 17 }
    }
  })
  const record = await harness.manager.createRecord('sess-ark', { prompt: '远方风景', model: M25 })
  assert.equal(record.provider, 'ark')
  assert.equal(record.remoteTaskId, 'cgt-1')

  let current = await harness.manager.runPollSession('sess-ark', record.id)
  assert.equal(current.status, 'queued')
  assert.equal(current.progress, 10)

  current = await harness.manager.runPollSession('sess-ark', record.id)
  assert.equal(current.status, 'running')
  assert.equal(current.progress, 55)

  current = await harness.manager.runPollSession('sess-ark', record.id)
  assert.equal(current.status, 'succeeded')
  assert.equal(current.remoteVideoUrl, 'https://cdn/v.mp4')
  assert.equal(current.remoteLastFrameUrl, 'https://cdn/l.jpg')
  assert.ok(current.files.video)
  assert.ok(current.files.lastFrame)
  assert.equal(current.meta.usage.total_tokens, 7)
  assert.equal(downloaded.length, 2)
  assert.ok(fs.existsSync(harness.store.mediaPath(current.files.video)))
})

test('远端失败/过期：错误被保留', async () => {
  const fakeClient = {
    async createTask() { return { id: 'cgt-f' } },
    async getTask() { return { id: 'cgt-f', status: 'failed', error: { code: 'SensitiveContentDetected', message: '提示词不合规' } } },
    async cancelTask() { return { ok: true } }
  }
  const harness = newHarness({ getConfig: () => configFor({ ARK_API_KEY: 'ark-key-1234567890' }), createClient: () => fakeClient })
  const record = await harness.manager.createRecord('s', { prompt: 'x' })
  const current = await harness.manager.runPollSession('s', record.id)
  assert.equal(current.status, 'failed')
  assert.equal(current.error.code, 'SensitiveContentDetected')
  assert.match(current.error.message, /不合规/)
})

test('运行超时：超过 20 分钟仍未完成 → failed/Timeout', async () => {
  const fakeClient = {
    async createTask() { return { id: 'cgt-timeout' } },
    async getTask() { return { id: 'cgt-timeout', status: 'running' } },
    async cancelTask() { return { ok: true } }
  }
  const harness = newHarness({ getConfig: () => configFor({ ARK_API_KEY: 'ark-key-1234567890' }), createClient: () => fakeClient })
  const record = await harness.manager.createRecord('s', { prompt: 'x' })
  harness.clock.advance(21 * 60 * 1000)
  const current = await harness.manager.runPollSession('s', record.id)
  assert.equal(current.status, 'failed')
  assert.equal(current.error.code, 'Timeout')
  assert.match(current.error.message, /超时/)
})

test('取消：排队可取消、运行中拒绝、demo 直接取消', async () => {
  const harness = newHarness()
  // demo
  const demo = await harness.manager.createRecord('s', { prompt: 'demo' })
  const cancelledDemo = await harness.manager.cancelRecord('s', demo.id)
  assert.equal(cancelledDemo.status, 'cancelled')

  // 真实：排队
  const fakeClient = { async createTask() { return { id: 'cgt-c' } }, async getTask() { return { id: 'cgt-c', status: 'queued' } }, async cancelTask() { return { ok: true } } }
  const arkHarness = newHarness({ getConfig: () => configFor({ ARK_API_KEY: 'ark-key-1234567890' }), createClient: () => fakeClient })
  const queued = await arkHarness.manager.createRecord('s', { prompt: 'x' })
  const cancelled = await arkHarness.manager.cancelRecord('s', queued.id)
  assert.equal(cancelled.status, 'cancelled')

  // 运行中拒绝
  const running = await arkHarness.manager.createRecord('s', { prompt: 'y' })
  arkHarness.store.patchRecord('s', running.id, { status: 'running' })
  await assert.rejects(() => arkHarness.manager.cancelRecord('s', running.id), (error) => error.code === 'RunningCannotCancel')
})

test('waitForRecord：超时返回 waitTimedOut，终态立即返回', async () => {
  // 超时用真实时钟（demo 8 秒不可能在 60ms 内完成）
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-wait-'))
  const store = createStore({ root })
  store.init()
  const manager = createTaskManager({
    store,
    getConfig: () => configFor({}),
    demoMedia: tempDemoMedia(),
    autoPoll: false,
    random: () => 0
  })
  const record = await manager.createRecord('s', { prompt: 'wait' })
  const timedOut = await manager.waitForRecord('s', record.id, { timeoutMs: 60 })
  assert.ok(timedOut)
  assert.equal(timedOut.meta.waitTimedOut, true)

  // 终态立即返回（终态记录不触发轮询）
  store.patchRecord('s', record.id, { status: 'succeeded', progress: 100 })
  const done = await manager.waitForRecord('s', record.id, { timeoutMs: 3000 })
  assert.equal(done.status, 'succeeded')
})

test('recreate：落盘尾帧读回 → 新记录带 originId 与 recreate 计划', async () => {
  const harness = newHarness()
  const source = await harness.manager.createRecord('sess-r', { prompt: '原视频' })
  harness.clock.advance(9000)
  let done = await harness.manager.runPollSession('sess-r', source.id)
  assert.equal(done.status, 'succeeded')
  assert.ok(done.files.lastFrame)
  // 模拟远端 URL 已过期（早于 24h 前）
  harness.store.patchRecord('sess-r', source.id, { remoteVideoUrl: 'https://cdn/old.mp4', updatedAt: harness.clock.value - REMOTE_URL_TTL_MS - 1000 })

  const { record: recreated, plan } = await harness.manager.recreate('sess-r', source.id, { prompt: '续写' })
  assert.equal(plan.mode, 'image2video')
  assert.equal(plan.mediaKind, 'last-frame')
  assert.equal(recreated.originId, source.id)
  assert.equal(recreated.prompt, '续写')
  assert.equal(recreated.mode, 'image2video')
  assert.ok(recreated.inputs.images.length >= 1)
  assert.equal(recreated.inputs.images[0].role, 'first_frame')
  assert.ok(recreated.meta.recreate)
  assert.equal(recreated.meta.recreate.originId, source.id)
})

test('恢复未完成任务：start() 计数；deleteRecord 清理媒体', async () => {
  const harness = newHarness()
  const record = await harness.manager.createRecord('sess-r2', { prompt: '未完成' })
  const recovered = harness.manager.start()
  assert.equal(recovered, 1)
  harness.manager.stop()

  const history = harness.manager.listRecords('sess-r2')
  assert.equal(history.length, 1)
  const removed = harness.manager.deleteRecord('sess-r2', record.id)
  assert.equal(removed.deleted, true)
  assert.deepEqual(harness.manager.listRecords('sess-r2'), [])
  assert.throws(() => harness.manager.deleteRecord('sess-r2', record.id), (error) => error.code === 'NotFound')
})

test('createRecord 校验失败抛出 ValidationError 且不落盘', async () => {
  const harness = newHarness()
  await assert.rejects(() => harness.manager.createRecord('s', { prompt: '' }), (error) => error.name === 'ValidationError')
  assert.deepEqual(harness.manager.listRecords('s'), [])
})


test('下载失败自动重试：前 2 次失败，第 3 次成功', async () => {
  const attempts = []
  const fakeClient = {
    async createTask() { return { id: 'cgt-retry' } },
    async getTask() { return { id: 'cgt-retry', status: 'succeeded', videoUrl: 'https://cdn/v.mp4' } },
    async cancelTask() { return { ok: true } }
  }
  const harness = newHarness({
    getConfig: () => configFor({ ARK_API_KEY: 'ark-key-1234567890' }),
    createClient: () => fakeClient,
    downloadImpl: async (url, dest) => {
      attempts.push(url)
      if (attempts.length < 3) throw new Error('network flake')
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, 'video-after-retry')
      return { bytes: 17 }
    }
  })
  const record = await harness.manager.createRecord('s', { prompt: '重试测试', model: M25 })
  const current = await harness.manager.runPollSession('s', record.id)
  assert.equal(current.status, 'succeeded')
  assert.ok(current.files.video, '重试后应落盘视频')
  assert.equal(current.meta.downloadError, undefined, '重试成功后不应残留下载错误')
  assert.equal(attempts.length, 3)
})

test('成功但本地视频缺失：wait 时自动补下载并返回本地路径', async () => {
  let allowDownload = false
  const fakeClient = {
    async createTask() { return { id: 'cgt-rescue' } },
    async getTask() { return { id: 'cgt-rescue', status: 'succeeded', videoUrl: 'https://cdn/v.mp4', lastFrameUrl: 'https://cdn/l.jpg' } },
    async cancelTask() { return { ok: true } }
  }
  const harness = newHarness({
    getConfig: () => configFor({ ARK_API_KEY: 'ark-key-1234567890' }),
    createClient: () => fakeClient,
    downloadImpl: async (url, dest) => {
      if (!allowDownload) throw new Error('download failed once')
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, 'video-after-rescue')
      return { bytes: 19 }
    }
  })
  const record = await harness.manager.createRecord('s', { prompt: '补下载测试', model: M25 })
  const first = await harness.manager.runPollSession('s', record.id)
  assert.equal(first.status, 'succeeded')
  assert.equal(first.files.video, undefined, '首次下载失败应无本地视频')
  assert.ok(String(first.meta.downloadError || '').includes('下载失败'))
  // 第二次 wait/status：允许下载 → 自动补下载
  allowDownload = true
  const rescued = await harness.manager.waitForRecord('s', record.id, { timeoutMs: 5000 })
  assert.equal(rescued.status, 'succeeded')
  assert.ok(rescued.files.video, '补下载后应有本地视频')
  assert.equal(rescued.meta.downloadError, undefined, '补下载成功后清除错误')
  assert.ok(fs.existsSync(harness.store.mediaPath(rescued.files.video)))
})
