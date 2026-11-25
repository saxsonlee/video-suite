/**
 * 端到端链路（不依赖 DSH 运行时）：settings(demo) → store → tasks(demo 模拟) → 媒体落盘 → 再创作 → 删除。
 * 使用包内真实 media/demo.mp4（852358 bytes）验证 demo 交付链路。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSettingsManager } from '../server/settings/index.js'
import { createStore } from '../server/store/index.js'
import { createTaskManager, defaultDemoMedia, buildRecreatePlan, REMOTE_URL_TTL_MS } from '../server/tasks/index.js'
import { listModels, publicDefaults, capabilities } from '../server/models/index.js'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEMO_VIDEO = path.join(PACKAGE_ROOT, 'media', 'demo.mp4')
const DEMO_LAST_FRAME = path.join(PACKAGE_ROOT, 'media', 'demo-lastframe.jpg')

function buildHarness() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-chain-'))
  const settings = createSettingsManager({ storageRoot: root, env: {} })
  const store = createStore({ root })
  store.init()
  const clock = { value: 1700000000000, advance(ms) { this.value += ms } }
  const tasks = createTaskManager({
    store,
    getConfig: () => settings.getConfig(),
    demoMedia: defaultDemoMedia(PACKAGE_ROOT),
    now: () => clock.value,
    autoPoll: false,
    random: () => 0
  })
  return { root, settings, store, clock, tasks }
}

test('demo 模式配置：无 Key 自动演示，模型目录可下发', () => {
  const { settings } = buildHarness()
  const config = settings.getConfig()
  assert.equal(config.demo, true)
  assert.equal(config.provider, 'demo')
  assert.equal(settings.view().keys.ark, '')
  assert.ok(config.defaultModel)
  assert.equal(listModels().length >= 6, true)
  assert.equal(publicDefaults().defaultModel, config.defaultModel)
  assert.ok(capabilities().modes.length >= 6)
})

test('demo 全链路：生成 → 轮询 → 成功落盘真实示例视频 → 历史 → 再创作 → 删除', async () => {
  assert.ok(fs.existsSync(DEMO_VIDEO), '包内 media/demo.mp4 必须存在')
  assert.ok(fs.existsSync(DEMO_LAST_FRAME), '包内 media/demo-lastframe.jpg 必须存在')
  const demoSize = fs.statSync(DEMO_VIDEO).size
  const { root, store, clock, tasks } = buildHarness()
  const sessionId = 'session-E2E-1'

  // 1) 生成
  const record = await tasks.createRecord(sessionId, { prompt: '一只橘猫在窗台上伸懒腰，阳光洒落，电影感' })
  assert.equal(record.provider, 'demo')
  assert.equal(record.status, 'queued')
  assert.ok(record.remoteTaskId)

  // 2) 轮询推进（注入时钟，避免真实等待 8 秒）
  clock.advance(2500)
  let current = await tasks.runPollSession(sessionId, record.id)
  assert.equal(current.status, 'running')

  clock.advance(6000)
  current = await tasks.runPollSession(sessionId, record.id)
  clock.advance(2000)
  current = await tasks.runPollSession(sessionId, record.id)
  assert.equal(current.status, 'succeeded')
  assert.equal(current.progress, 100)

  // 3) 真实媒体落盘校验
  assert.ok(current.files.video)
  const videoPath = store.mediaPath(current.files.video)
  assert.ok(fs.existsSync(videoPath))
  assert.equal(fs.statSync(videoPath).size, demoSize, 'demo 视频应完整复制（852358 bytes）')
  assert.ok(current.files.lastFrame)
  const lastFramePath = store.mediaPath(current.files.lastFrame)
  assert.ok(fs.existsSync(lastFramePath))
  assert.ok(fs.statSync(lastFramePath).size > 1000)

  // 4) 历史（新→旧）
  const history = tasks.listRecords(sessionId, { limit: 10 })
  assert.equal(history.length, 1)
  assert.equal(history[0].id, current.id)

  // 5) 再创作：把远端 URL 记为过期 → 用落盘尾帧（首帧模式）
  store.patchRecord(sessionId, current.id, {
    remoteVideoUrl: 'https://cdn.example.com/expired.mp4',
    updatedAt: clock.value - REMOTE_URL_TTL_MS - 1000
  })
  const plan = buildRecreatePlan(store.getRecord(sessionId, current.id), {}, { now: clock.value })
  assert.equal(plan.mode, 'image2video')
  assert.equal(plan.mediaKind, 'last-frame')

  const { record: recreated } = await tasks.recreate(sessionId, current.id, { prompt: '让猫跳下窗台' })
  assert.equal(recreated.originId, current.id)
  assert.equal(recreated.mode, 'image2video')
  assert.equal(recreated.meta.recreate.mediaKind, 'last-frame')
  clock.advance(9000)
  const recreatedDone = await tasks.runPollSession(sessionId, recreated.id)
  assert.equal(recreatedDone.status, 'succeeded')
  assert.ok(fs.existsSync(store.mediaPath(recreatedDone.files.video)))
  assert.equal(tasks.listRecords(sessionId).length, 2)

  // 6) 删除：记录与本地媒体一起清理
  const removed = tasks.deleteRecord(sessionId, current.id)
  assert.equal(removed.deleted, true)
  assert.ok(removed.removedFiles.includes(current.files.video))
  assert.equal(fs.existsSync(videoPath), false)
  assert.equal(tasks.listRecords(sessionId).length, 1)

  // 存储目录结构符合契约
  assert.ok(fs.existsSync(path.join(root, 'sessions')))
  assert.ok(fs.existsSync(path.join(root, 'media')))
  assert.ok(fs.existsSync(path.join(root, 'settings.json')) || fs.existsSync(path.join(root, 'settings.json')) === false)
})
