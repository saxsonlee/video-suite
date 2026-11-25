/**
 * MiniMax H3 接入测试（经中转站 /videos 协议）。
 *
 * 覆盖：模型目录、请求体（文生/图生）、协议与风格自动识别、任务查询产物地址、下载鉴权头。
 * 全部离线（注入 fetch / downloadImpl），不调用真实接口。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MODELS, getModel, publicModel, normalizeGenerateRequest, buildArkPayload
} from '../server/models/index.js'
import { buildRelayCreateBody } from '../server/api/relay-body.js'
import { RelayVideoClient } from '../server/api/relay.js'
import { normalizeRelayTask } from '../server/api/normalize.js'
import { mergeSettings, resolveConfig } from '../server/settings/index.js'

const MODEL = 'MiniMax-H3'
const BASE = 'https://relay.example.com/v1'

function relayConfig(patch = {}) {
  return resolveConfig(mergeSettings({
    env: {},
    pluginConfig: {
      provider: 'relay',
      RELAY_BASE_URL: 'https://relay.example.com',
      RELAY_API_KEY: 'sk-test',
      DEFAULT_MODEL: MODEL,
      RELAY_MODELS: MODEL,
      ...patch
    }
  }))
}

test('模型目录：MiniMax-H3 的能力与默认参数', () => {
  const entry = getModel(MODEL)
  assert.ok(entry, '模型目录应包含 ' + MODEL)
  assert.deepEqual(entry.resolutions, ['768P', '2K'])
  assert.deepEqual(entry.durations, [4, 15])
  assert.equal(entry.autoDuration, false)
  assert.equal(entry.firstFrame, true, '支持图生视频（首帧）')
  assert.equal(entry.audio, false)
  assert.equal(entry.defaultResolution, '768P')
  assert.equal(entry.defaultRatio, '16:9')
  const view = publicModel(entry)
  assert.equal(view.defaultResolution, '768P')
  assert.equal(view.defaultRatio, '16:9')
})

test('参数校验：分辨率只接受 768P/2K，时长 4~15，不支持音频', () => {
  const ok = normalizeGenerateRequest({ prompt: '纸船', model: MODEL, params: { resolution: '2K', ratio: '9:16', duration: 6 } }, { defaultModel: MODEL })
  assert.equal(ok.params.resolution, '2K')
  assert.equal(ok.params.ratio, '9:16')
  assert.equal(ok.params.duration, 6)
  assert.throws(() => normalizeGenerateRequest({ prompt: 'x', model: MODEL, params: { resolution: '720p' } }, { defaultModel: MODEL }), /768P/)
  assert.throws(() => normalizeGenerateRequest({ prompt: 'x', model: MODEL, params: { duration: 30 } }, { defaultModel: MODEL }), /4 ~ 15/)
  assert.throws(() => normalizeGenerateRequest({ prompt: 'x', model: MODEL, params: { generateAudio: true } }, { defaultModel: MODEL }), /不支持生成音频/)
})

test('请求体：文生视频用 seconds + metadata.resolution/ratio', () => {
  const arkPayload = buildArkPayload({
    prompt: '一只纸船漂在池塘上，固定机位',
    model: MODEL,
    mode: 'text2video',
    params: { resolution: '768P', ratio: '16:9', duration: 4 },
    media: { images: [], videos: [], audios: [] },
    inputs: { images: [], video: null, audio: null, draftTaskId: '' }
  }, getModel(MODEL))
  const body = buildRelayCreateBody(arkPayload, { style: 'minimax' })
  assert.equal(body.model, MODEL)
  assert.equal(body.prompt, '一只纸船漂在池塘上，固定机位')
  assert.equal(body.seconds, 4)
  assert.deepEqual(body.metadata, { resolution: '768P', ratio: '16:9' })
  assert.equal(body.duration, undefined, 'MiniMax 用 seconds，不应出现 duration')
  assert.equal(body.input_reference, undefined)
})

test('请求体：图生视频放顶层 input_reference 且不带 ratio', () => {
  const body = buildRelayCreateBody({
    model: MODEL,
    content: [
      { type: 'text', text: '纸船漂动' },
      { type: 'image_url', image_url: { url: 'https://example.com/first.png' }, role: 'first_frame' }
    ],
    duration: 6,
    ratio: '16:9',
    resolution: '2K'
  }, { style: 'minimax' })
  assert.equal(body.seconds, 6)
  assert.equal(body.input_reference, 'https://example.com/first.png')
  assert.equal(body.metadata.ratio, undefined, '图生视频不能带 ratio（由首帧决定）')
  assert.equal(body.metadata.resolution, '2K')
})

test('配置：默认模型为 MiniMax 时协议与风格自动识别', () => {
  const config = relayConfig()
  assert.equal(config.relay.protocol, 'minimax')
  assert.equal(config.relay.style, 'minimax')
  assert.equal(config.relay.createPath, '/videos')
  assert.equal(config.relay.queryPath, '/videos/{id}')
  assert.equal(config.relay.cancelPath, '/videos/{id}')
  // 用户显式选 flat 时尊重用户
  assert.equal(relayConfig({ RELAY_STYLE: 'flat' }).relay.style, 'flat')
  // 显式协议优先
  assert.equal(relayConfig({ RELAY_PROTOCOL: 'ark' }).relay.protocol, 'ark')
})

test('任务查询：completed → 成功，产物指向 /videos/{id}/content 并带下载鉴权头', async () => {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), headers: init.headers || {} })
    return new Response(JSON.stringify({ id: 'task-1', status: 'completed' }), { status: 200 })
  }
  const client = new RelayVideoClient({ baseUrl: BASE, apiKey: 'sk-test', protocol: 'minimax', style: 'minimax', createPath: '/videos', queryPath: '/videos/{id}', fetchImpl })
  const task = await client.getTask('task-1')
  assert.equal(task.status, 'succeeded')
  assert.equal(task.videoUrl, BASE + '/videos/task-1/content')
  assert.deepEqual(task.downloadHeaders, { Authorization: 'Bearer sk-test' })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers.Authorization, 'Bearer sk-test')
})

test('任务查询：in_progress → 运行中；failed → 带错误信息', async () => {
  const make = (body) => new RelayVideoClient({
    baseUrl: BASE, apiKey: 'sk-test', protocol: 'minimax', style: 'minimax',
    createPath: '/videos', queryPath: '/videos/{id}',
    fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 })
  })
  const running = await make({ id: 'a', status: 'in_progress' }).getTask('a')
  assert.equal(running.status, 'running')
  assert.equal(running.videoUrl, null, '运行中没有产物地址')
  const failed = await make({ id: 'b', status: 'failed', fail_reason: '内容不合规' }).getTask('b')
  assert.equal(failed.status, 'failed')
  assert.match(String(failed.error && failed.error.message), /不合规/)
})

test('创建任务：请求发到 /videos 且 body 符合 MiniMax 规范', async () => {
  const seen = []
  const fetchImpl = async (url, init = {}) => {
    seen.push({ url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : null })
    return new Response(JSON.stringify({ id: 'task-2' }), { status: 200 })
  }
  const client = new RelayVideoClient({ baseUrl: BASE, apiKey: 'sk-test', protocol: 'minimax', style: 'minimax', createPath: '/videos', queryPath: '/videos/{id}', fetchImpl })
  const created = await client.createTask({ model: MODEL, content: [{ type: 'text', text: '纸船' }], duration: 4, ratio: '16:9', resolution: '768P' })
  assert.equal(created.id, 'task-2')
  assert.equal(seen[0].url, BASE + '/videos')
  assert.equal(seen[0].method, 'POST')
  assert.deepEqual(seen[0].body, { model: MODEL, prompt: '纸船', seconds: 4, metadata: { resolution: '768P', ratio: '16:9' } })
})

test('归一化：没有产物 URL 且没有回退地址时按失败处理（防止假成功）', () => {
  const task = normalizeRelayTask({ id: 'x', status: 'completed' }, { fallbackId: 'x' })
  assert.equal(task.status, 'failed')
  assert.equal(task.error.code, 'MissingVideoUrl')
})
