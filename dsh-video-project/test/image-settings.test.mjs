import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  IMAGE_MODEL_PATTERN,
  isImageModel,
  maskApiKey,
  readImageGenSettings,
  saveImageGenSettings,
  readSketchAsReference,
  extractModelIds,
  fetchImageCandidates
} from '../server/image-settings.js'

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-img-settings-'))
}

test('isImageModel：识别常见图像生成模型，不误伤视频模型', () => {
  assert.match('gpt-image-2.5', IMAGE_MODEL_PATTERN)
  assert.equal(isImageModel('gpt-image-1.5'), true)
  assert.equal(isImageModel('gemini-3.1-flash-image'), true)
  assert.equal(isImageModel('seedream-4'), true)
  assert.equal(isImageModel('flux-pro'), true)
  assert.equal(isImageModel('doubao-seedance-2.5'), false)
  assert.equal(isImageModel('gpt-4o'), false)
  assert.equal(isImageModel(''), false)
  assert.equal(isImageModel(null), false)
})

test('maskApiKey：只保留首尾少量字符', () => {
  assert.equal(maskApiKey(''), '')
  assert.equal(maskApiKey('short'), '••••')
  assert.equal(maskApiKey('sk-1234567890abcdef'), 'sk-1••••cdef')
})

test('extractModelIds：兼容 data/items 两种模型列表结构', () => {
  assert.deepEqual(extractModelIds({ data: [{ id: 'a' }, { id: 'b' }] }), ['a', 'b'])
  assert.deepEqual(extractModelIds({ models: [{ id: 'x' }, { id: 'a' }] }), ['x', 'a'])
  assert.deepEqual(extractModelIds({ data: ['s1', 's2'] }), ['s1', 's2'])
  assert.deepEqual(extractModelIds(null), [])
})

test('readImageGenSettings：默认关闭、不自动挑模型，候选来自共享能力文件', () => {
  const home = tempHome()
  const shared = {
    payload: {
      imageGeneration: { capable: true, models: ['gpt-image-2.5', 'gemini-3.1-flash-image'], baseUrl: 'https://relay.example' }
    }
  }
  const view = readImageGenSettings({ env: { USERPROFILE: home }, shared })
  assert.equal(view.enabled, false)
  assert.equal(view.model, '')
  assert.deepEqual(view.candidates, ['gpt-image-2.5', 'gemini-3.1-flash-image'])
  assert.equal(view.baseUrl, 'https://relay.example')
  assert.equal(view.hasApiKey, false)
})

test('saveImageGenSettings：只写 imageGen、保留其他字段；读回不带明文 Key', () => {
  const home = tempHome()
  const configFile = path.join(home, 'config.json')
  fs.writeFileSync(configFile, JSON.stringify({ storageRoot: 'D:/videos', imageGen: { model: 'old-model' } }))
  const saved = saveImageGenSettings({ enabled: true, model: 'gpt-image-2.5', apiKey: 'sk-secret-123456789' }, { env: { USERPROFILE: home }, configFile })
  assert.equal(saved.ok, true)
  assert.equal(saved.settings.enabled, true)
  assert.equal(saved.settings.model, 'gpt-image-2.5')
  assert.equal(saved.settings.hasApiKey, true)
  assert.equal('apiKey' in saved.settings, false)
  const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  assert.equal(stored.storageRoot, 'D:/videos')
  assert.equal(stored.imageGen.enabled, true)
  assert.equal(stored.imageGen.model, 'gpt-image-2.5')
  assert.equal(stored.imageGen.apiKey, 'sk-secret-123456789')
  // 留空 apiKey 表示不修改
  saveImageGenSettings({ enabled: false, model: 'gemini-3.1-flash-image' }, { env: { USERPROFILE: home }, configFile })
  const stored2 = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  assert.equal(stored2.imageGen.apiKey, 'sk-secret-123456789')
  // clearApiKey 清除
  saveImageGenSettings({ clearApiKey: true }, { env: { USERPROFILE: home }, configFile })
  const stored3 = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  assert.equal(stored3.imageGen.apiKey, '')
})

test('readSketchAsReference：config 开关优先、env 兜底、默认关闭；保存写顶层且保留其他字段', () => {
  const home = tempHome()
  const configFile = path.join(home, 'config.json')
  const env = { USERPROFILE: home }
  // 默认关闭
  assert.equal(readSketchAsReference(env, configFile), false)
  // config 顶层开启
  fs.writeFileSync(configFile, JSON.stringify({ sketchAsReference: true, imageGen: { model: 'm' } }))
  assert.equal(readSketchAsReference(env, configFile), true)
  assert.equal(readImageGenSettings({ env, configFile }).sketchAsReference, true)
  // config 明确关闭时 env 不能强制打开
  fs.writeFileSync(configFile, JSON.stringify({ sketchAsReference: false }))
  assert.equal(readSketchAsReference({ USERPROFILE: home, VIDEO_SKETCH_AS_REFERENCE: '1' }, configFile), false)
  // 旧配置没有该字段时 env 兜底
  fs.writeFileSync(configFile, JSON.stringify({ imageGen: { model: 'm' } }))
  assert.equal(readSketchAsReference({ USERPROFILE: home, VIDEO_SKETCH_AS_REFERENCE: '1' }, configFile), true)
  // 保存写顶层、保留其他字段
  saveImageGenSettings({ sketchAsReference: true }, { env, configFile })
  const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  assert.equal(stored.sketchAsReference, true)
  assert.equal(stored.imageGen.model, 'm')
  saveImageGenSettings({ sketchAsReference: false }, { env, configFile })
  assert.equal(readSketchAsReference(env, configFile), false)
})

test('fetchImageCandidates：拉 /v1/models 只返回图像模型；缺地址/Key 给出提示', async () => {
  const home = tempHome()
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, init })
    return new Response(JSON.stringify({ data: [{ id: 'gpt-image-2.5' }, { id: 'doubao-seedance-2.5' }, { id: 'gemini-3.1-flash-image' }] }), { status: 200 })
  }
  const result = await fetchImageCandidates({ env: { USERPROFILE: home }, baseUrl: 'https://relay.example', apiKey: 'k', fetchImpl })
  assert.deepEqual(result.models, ['gpt-image-2.5', 'gemini-3.1-flash-image'])
  assert.match(result.source, /relay\.example/)
  assert.equal(calls[0].url, 'https://relay.example/v1/models')
  assert.match(calls[0].init.headers.Authorization, /Bearer k/)
  // 无地址
  const noUrl = await fetchImageCandidates({ env: { USERPROFILE: home }, fetchImpl })
  assert.equal(noUrl.models.length, 0)
  assert.match(noUrl.error, /中转站地址/)
  // 无 Key
  const noKey = await fetchImageCandidates({ env: { USERPROFILE: home }, baseUrl: 'https://relay.example', useSavedApiKey: false, fetchImpl })
  assert.equal(noKey.models.length, 0)
  assert.match(noKey.error, /API Key/)
})

test('fetchImageCandidates：接口报错时返回错误说明，不抛异常', async () => {
  const home = tempHome()
  const fetchImpl = async () => new Response('bad gateway', { status: 502 })
  const result = await fetchImageCandidates({ env: { USERPROFILE: home }, baseUrl: 'https://relay.example', apiKey: 'k', fetchImpl })
  assert.equal(result.models.length, 0)
  assert.match(result.error, /502/)
})
