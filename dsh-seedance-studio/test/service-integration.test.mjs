/**
 * host/service.js + routes.js + tool.js 集成测试（不依赖 DSH 运行时）：
 * 用真实 settings/store/tasks(demo) 装配 service，再通过 HTTP 路由与工具走完整链路。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSettingsManager } from '../server/settings/index.js'
import { createStore } from '../server/store/index.js'
import { createTaskManager, defaultDemoMedia, REMOTE_URL_TTL_MS } from '../server/tasks/index.js'
import { createHostService } from '../server/service.js'
import { createRoutes, API_PREFIX } from '../server/routes/index.js'
import { createSeedanceTool, buildOutput as buildToolOutput } from '../platforms/dsh-plugin/tool.js'

const buildOutputRender = (value) => buildToolOutput().render({}, value)

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEMO_VIDEO = path.join(PACKAGE_ROOT, 'media', 'demo.mp4')
const DEMO_SIZE = fs.statSync(DEMO_VIDEO).size
const fakeDefineTool = (definition) => definition

function buildIntegration() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-integration-'))
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-ws-'))
  const clock = { value: 1700000000000, advance(ms) { this.value += ms } }
  const settings = createSettingsManager({ storageRoot: root, env: {} })
  const store = createStore({ root })
  store.init()
  const tasks = createTaskManager({
    store,
    getConfig: () => settings.getConfig(),
    demoMedia: defaultDemoMedia(PACKAGE_ROOT),
    now: () => clock.value,
    autoPoll: false,
    random: () => 0
  })
  const savedImages = []
  const state = { imageCapable: true }
  const ctx = {
    state,
    get(name) {
      if (name === 'workingDirectory') {
        return { ensure: async () => workspaceDir }
      }
      if (name === 'llm') {
        return {
          resolveModelInfo: async (provider, model) => ({ provider, model, inputModalities: ctx.state.imageCapable === false ? ['text'] : ['text', 'image'] })
        }
      }
      if (name === 'attachments') {
        return {
          saveImage: async ({ data, mediaType, name: fileName }) => {
            const ref = { attachmentId: 'att-' + (savedImages.length + 1), mediaType, bytes: data.length, width: 1280, height: 720, name: fileName }
            savedImages.push(ref)
            return ref
          }
        }
      }
      return undefined
    },
    logger: { info() {}, warn() {}, error() {} }
  }
  const service = createHostService({ ctx, config: {}, store, settings, tasks })
  const routes = createRoutes(service)
  async function call(method, urlPath, options = {}) {
    const bare = urlPath.split('?')[0]
    const route = routes.find((item) => item.path === API_PREFIX + bare && item.methods.includes(method))
    assert.ok(route, '缺少路由 ' + method + ' ' + bare)
    const init = { method, headers: {} }
    if (options.body !== undefined) {
      init.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body)
      init.headers['content-type'] = 'application/json'
    }
    if (options.headers) Object.assign(init.headers, options.headers)
    const response = await route.fetch(new Request('http://127.0.0.1:51483' + API_PREFIX + urlPath, init))
    const text = await response.text()
    let json = null
    try { json = JSON.parse(text) } catch (error) { json = null }
    return { response, text, json }
  }
  return { root, workspaceDir, settings, store, tasks, clock, ctx, service, routes, savedImages, call }
}

test('service + routes 集成：config / 生成 / 落盘 / 媒体 Range / 历史 / 再创作 / 取消 / 删除', async () => {
  const h = buildIntegration()
  const sessionId = 'session-int-1'

  // 1) /config：demo 配置、模型目录、打码设置
  let out = await h.call('GET', '/config')
  assert.equal(out.response.status, 200)
  assert.equal(out.json.value.provider, 'demo')
  assert.equal(out.json.value.demo, true)
  assert.ok(out.json.value.models.length >= 6)
  assert.equal(out.json.value.settings.keys.ark, '')
  assert.ok(out.json.value.capabilities.modes.length >= 6)

  // 2) /generate：真实链路创建 demo 任务
  out = await h.call('POST', '/generate', { body: { sessionId, prompt: '一只橘猫在窗台上伸懒腰' } })
  assert.equal(out.json.ok, true)
  const recordId = out.json.value.record.id
  assert.equal(out.json.value.record.status, 'queued')

  // 3) 推进时钟并轮询到成功
  h.clock.advance(2500)
  await h.tasks.runPollSession(sessionId, recordId)
  h.clock.advance(6000)
  await h.tasks.runPollSession(sessionId, recordId)
  h.clock.advance(2000)
  const done = await h.tasks.runPollSession(sessionId, recordId)
  assert.equal(done.status, 'succeeded')

  // 4) /task
  out = await h.call('GET', '/task?sessionId=' + sessionId + '&id=' + recordId)
  assert.equal(out.json.value.record.status, 'succeeded')
  assert.equal(out.json.value.record.files.video, recordId + '.mp4')

  // 5) /media 全量与 Range
  out = await h.call('GET', '/media?id=' + recordId + '&kind=video')
  assert.equal(out.response.status, 200)
  assert.equal(out.response.headers.get('content-type'), 'video/mp4')
  assert.equal(Number(out.response.headers.get('content-length')), DEMO_SIZE)
  out = await h.call('GET', '/media?id=' + recordId + '&kind=video', { headers: { range: 'bytes=0-99' } })
  assert.equal(out.response.status, 206)
  assert.equal(out.response.headers.get('content-range'), 'bytes 0-99/' + DEMO_SIZE)
  out = await h.call('GET', '/media?id=' + recordId + '&kind=lastframe')
  assert.equal(out.response.status, 200)
  assert.equal(out.response.headers.get('content-type'), 'image/jpeg')

  // 6) /history
  out = await h.call('GET', '/history?sessionId=' + sessionId)
  assert.equal(out.json.value.records.length, 1)
  assert.equal(out.json.value.records[0].id, recordId)

  // 7) /recreate：远端过期 → 尾帧首帧模式
  h.store.patchRecord(sessionId, recordId, {
    remoteVideoUrl: 'https://cdn.example.com/expired.mp4',
    updatedAt: h.clock.value - REMOTE_URL_TTL_MS - 1000
  })
  out = await h.call('POST', '/recreate', { body: { sessionId, sourceId: recordId, prompt: '让猫跳下窗台' } })
  assert.equal(out.json.ok, true)
  assert.equal(out.json.value.record.originId, recordId)
  assert.equal(out.json.value.record.mode, 'image2video')
  assert.equal(out.json.value.plan.mediaKind, 'last-frame')
  assert.equal(out.json.value.record.inputs.images[0].role, 'first_frame')
  assert.ok(out.json.value.record.inputs.images[0].file, '尾帧输入应落盘')

  // 8) /cancel（新任务排队中可取消）
  out = await h.call('POST', '/generate', { body: { sessionId, prompt: '待取消任务' } })
  const pendingId = out.json.value.record.id
  out = await h.call('POST', '/cancel', { body: { sessionId, id: pendingId } })
  assert.equal(out.json.value.record.status, 'cancelled')

  // 9) /delete：记录与媒体一起删除
  const videoPath = h.store.mediaPath(recordId + '.mp4')
  assert.ok(fs.existsSync(videoPath))
  out = await h.call('POST', '/delete', { body: { sessionId, id: recordId } })
  assert.equal(out.json.value.deleted, true)
  assert.equal(fs.existsSync(videoPath), false)
  out = await h.call('GET', '/media?id=' + recordId + '&kind=video')
  assert.equal(out.response.status, 404)

  // 10) /settings：写设置并立即生效
  out = await h.call('POST', '/settings', { body: { patch: { provider: 'demo', defaultModel: 'doubao-seedance-2-5-260628' } } })
  assert.equal(out.json.ok, true)
  assert.equal(out.json.value.settings.provider, 'demo')
  out = await h.call('GET', '/settings')
  assert.equal(out.json.value.settings.defaultModel, 'doubao-seedance-2-5-260628')
})

test('service + 工具集成：generate/status/history 与 workspaceImages 落盘', async () => {
  const h = buildIntegration()
  // 准备一张工作区图片（1x1 PNG）
  const pngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63ffffffff0f0000050001a5f645400000000049454e44ae426082', 'hex')
  const imagePath = path.join(h.workspaceDir, 'ref.png')
  fs.writeFileSync(imagePath, pngBytes)

  const tool = createSeedanceTool({ defineTool: fakeDefineTool, service: h.service })
  const exec = {
    callId: 'call-int-1',
    signal: new AbortController().signal,
    agent: {
      session: { id: 'session-tool-int', requestHeader: () => ({ config: { provider: 'test', model: 'vision-model' } }) },
      options: { provider: 'test', model: 'vision-model' }
    }
  }

  let result = await tool.execute({ action: 'generate', prompt: '让参考图动起来', workspaceImages: ['ref.png'] }, exec)
  assert.equal(result.ok, true)
  assert.equal(result.action, 'generate')
  const taskId = result.taskId
  assert.ok(taskId)
  const created = h.tasks.getRecord('session-tool-int', taskId)
  assert.equal(created.inputs.images.length, 1)
  assert.ok(created.inputs.images[0].file)
  assert.ok(fs.existsSync(h.store.mediaPath(created.inputs.images[0].file)))

  // 推进到终态后 status 返回本地视频绝对路径
  h.clock.advance(9000)
  await h.tasks.runPollSession('session-tool-int', taskId)
  result = await tool.execute({ action: 'status', taskId }, exec)
  assert.equal(result.ok, true)
  assert.equal(result.status, 'succeeded')
  assert.ok(result.videoPath)
  assert.ok(fs.existsSync(result.videoPath))
  assert.equal(result.lastFramePath.endsWith('-lastframe.jpg'), true)
  assert.ok(result.previewImage, 'status 应带尾帧 durable 附件引用')
  const blocks = buildOutputRender(result)
  assert.equal(blocks[blocks.length - 1].type, 'image')

  // history 摘要
  result = await tool.execute({ action: 'history', limit: 10 }, exec)
  assert.equal(result.ok, true)
  assert.equal(result.total, 1)
  assert.equal(result.records[0].id, taskId)
  assert.ok(result.records[0].videoPath)

  // models
  result = await tool.execute({ action: 'models' }, exec)
  assert.ok(result.models.length >= 6)
  assert.equal(result.defaults.defaultModel, h.settings.getConfig().defaultModel)

  // recreate 通过工具
  h.store.patchRecord('session-tool-int', taskId, { remoteVideoUrl: 'https://cdn/x.mp4', updatedAt: h.clock.value - REMOTE_URL_TTL_MS - 1000 })
  result = await tool.execute({ action: 'recreate', sourceId: taskId, prompt: '续写' }, exec)
  assert.equal(result.ok, true)
  assert.equal(result.plan.mode, 'image2video')
  assert.ok(result.taskId)
})

test('service.attachmentForLastFrame：有 attachments 服务时返回 image 引用', async () => {
  const h = buildIntegration()
  const record = await h.tasks.createRecord('session-att', { prompt: '附件测试' })
  h.clock.advance(9000)
  const done = await h.tasks.runPollSession('session-att', record.id)
  assert.equal(done.status, 'succeeded')
  const exec = { callId: 'c', signal: new AbortController().signal, agent: { session: { id: 'session-att' }, options: { provider: 'p', model: 'm' } } }
  const ref = await h.service.attachmentForLastFrame(done, exec)
  assert.ok(ref)
  assert.equal(ref.mediaType, 'image/jpeg')
  assert.ok(ref.attachmentId.startsWith('att-'))
  // 没有尾帧时返回 null
  const noFrame = await h.service.attachmentForLastFrame({ files: {} }, exec)
  assert.equal(noFrame, null)
  // 纯文本模型 → 静默跳过（不能把图片 block 发给不支持 image 输入的模型）
  h.ctx.state.imageCapable = false
  assert.equal(await h.service.attachmentForLastFrame(done, exec), null)
  h.ctx.state.imageCapable = true
})

test('service.resolveMediaFile：按 id/kind 找到文件，陌生 id 返回 null', async () => {
  const h = buildIntegration()
  const record = await h.tasks.createRecord('s', { prompt: 'media resolve' })
  h.clock.advance(9000)
  const done = await h.tasks.runPollSession('s', record.id)
  const video = await h.service.resolveMediaFile(done.id, 'video')
  assert.ok(video && video.path.endsWith('.mp4'))
  const lastFrame = await h.service.resolveMediaFile(done.id, 'lastframe')
  assert.ok(lastFrame && lastFrame.path.endsWith('-lastframe.jpg'))
  assert.equal(await h.service.resolveMediaFile('sd_unknown_1', 'video'), null)
  assert.ok(h.service.recordPaths(done).videoPath)
})

test('service.wait：demo 模式等待到终态（tool wait action 依赖该方法）', async () => {
  const h = buildIntegration()
  const record = await h.tasks.createRecord('session-wait', { prompt: '等待测试' })
  h.clock.advance(9000)
  const done = await h.service.wait('session-wait', record.id, { timeoutMs: 2000 })
  assert.equal(done.status, 'succeeded')
  assert.ok(done.files && done.files.video, 'demo 成功后应有本地视频文件')
  const tool = createSeedanceTool({ defineTool: fakeDefineTool, service: h.service })
  const exec = { callId: 'c', signal: new AbortController().signal, agent: { session: { id: 'session-wait' } } }
  const waited = await tool.execute({ action: 'wait', taskId: record.id, waitSeconds: 5 }, exec)
  assert.equal(waited.ok, true)
  assert.equal(waited.status, 'succeeded')
})
