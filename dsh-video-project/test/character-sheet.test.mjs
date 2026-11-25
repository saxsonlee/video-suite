import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildCharacterSheetPrompt } from '../server/imagegen.js'
import { readCharacterSheetEnabled, readImageGenSettings, saveImageGenSettings } from '../server/image-settings.js'
import { createProjects } from '../server/projects.js'

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-sheet-'))
}

function mockImageFetch() {
  return async () => new Response(JSON.stringify({ data: [{ b64_json: PNG_BASE64 }] }), { status: 200, headers: { 'content-type': 'application/json' } })
}

function withImageEnv(fn) {
  const saved = { ...process.env }
  process.env.VIDEO_IMAGE_CAPABLE = '1'
  process.env.VIDEO_IMAGE_MODEL = 'gpt-image-2.5'
  process.env.VIDEO_IMAGE_BASE_URL = 'https://relay.example'
  process.env.VIDEO_IMAGE_API_KEY = 'sk-test'
  return Promise.resolve().then(fn).finally(() => {
    for (const key of ['VIDEO_IMAGE_CAPABLE', 'VIDEO_IMAGE_MODEL', 'VIDEO_IMAGE_BASE_URL', 'VIDEO_IMAGE_API_KEY']) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  })
}

test('buildCharacterSheetPrompt：三视图描述包含正/侧/背与身份/形象', () => {
  const prompt = buildCharacterSheetPrompt(
    { name: '阿海', identity: { face: '左眉疤', hairBase: '短发' }, looks: [{ id: 'dock', name: '工人装', costume: '灰蓝外套', views: { front: '正面站姿' } }] },
    { id: 'dock', name: '工人装', costume: '灰蓝外套', views: { front: '正面站姿' } },
    { style: '游戏宣传片' }
  )
  assert.match(prompt, /三视图/)
  assert.match(prompt, /正面/)
  assert.match(prompt, /侧面/)
  assert.match(prompt, /背面/)
  assert.match(prompt, /左眉疤/)
  assert.match(prompt, /灰蓝外套/)
  assert.match(prompt, /正面站姿/)
})

test('characterSheet 设置：默认关闭、保存后读取一致、保留 imageGen', () => {
  const home = tempHome()
  const configFile = path.join(home, 'config.json')
  const env = { USERPROFILE: home }
  assert.equal(readCharacterSheetEnabled(env, configFile), false)
  saveImageGenSettings({ enabled: true, model: 'gpt-image-2.5', characterSheet: { enabled: true } }, { env, configFile })
  assert.equal(readCharacterSheetEnabled(env, configFile), true)
  const view = readImageGenSettings({ env, configFile })
  assert.equal(view.characterSheet.enabled, true)
  assert.equal(view.enabled, true)
  assert.equal(view.model, 'gpt-image-2.5')
})

test('generateCharacterSheet：生成三视图并写入该形象的参考图', async () => {
  await withImageEnv(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-sheet-gen-'))
    const projects = createProjects({ root })
    await projects.createProject('三视图项目', { style: 'Q版', baseline: { ratio: '9:16' } })
    await projects.saveCharacters('三视图项目', [
      { name: '阿海', identity: { face: '左眉疤' }, looks: [{ id: 'dock', name: '工人装', costume: '灰蓝外套', views: { front: '正面' } }] }
    ])
    const result = await projects.generateCharacterSheet('三视图项目', { charName: '阿海', lookId: 'dock', fetchImpl: mockImageFetch() })
    assert.equal(result.ok, true)
    assert.equal(result.sheets.length, 1)
    assert.ok(fs.existsSync(result.sheets[0].path))
    const raw = JSON.parse(fs.readFileSync(path.join(root, '三视图项目/Charactor/阿海.json'), 'utf8'))
    assert.ok(Array.isArray(raw.looks[0].referenceImages))
    assert.equal(raw.looks[0].referenceImages.length, 1)
    assert.equal(raw.looks[0].referenceImages[0], result.sheets[0].path)
  })
})

test('saveCharacters：开启自动出图但能力不可用时返回 warning，不阻塞保存', async () => {
  const saved = { ...process.env }
  process.env.VIDEO_IMAGE_CAPABLE = '0'
  try {
    const home = tempHome()
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-sheet-auto-'))
    const configFile = path.join(home, 'config.json')
    saveImageGenSettings({ characterSheet: { enabled: true } }, { env: { USERPROFILE: home }, configFile })
    const savedConfig = saved.VIDEO_PROJECT_CONFIG_FILE
    process.env.VIDEO_PROJECT_CONFIG_FILE = configFile
    const projects = createProjects({ root })
    await projects.createProject('自动出图项目', {})
    const result = await projects.saveCharacters('自动出图项目', [{ name: '阿海', identity: { face: '圆脸' }, looks: [{ id: 'look1', name: '默认形象' }] }])
    assert.equal(result.ok, true)
    const codes = result.warnings.map((item) => item.code)
    assert.ok(codes.includes('CHAR_SHEET_DISABLED'))
    if (savedConfig === undefined) delete process.env.VIDEO_PROJECT_CONFIG_FILE
    else process.env.VIDEO_PROJECT_CONFIG_FILE = savedConfig
  } finally {
    for (const key of ['VIDEO_IMAGE_CAPABLE']) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
})


test('各卡片独立模型：三视图/区域可单独设置并回退草图模型', async () => {
  const { readCharacterSheetModel, readAreaSheetModel } = await import('../server/image-settings.js')
  const home = tempHome()
  const configFile = path.join(home, 'config.json')
  const env = { USERPROFILE: home }
  saveImageGenSettings({ model: 'gpt-image-2.5-sunburst', characterSheet: { enabled: true, model: 'gpt-image-2.5-sunburst' }, areaSheet: { enabled: true, model: 'gemini-3.1-flash-image' } }, { env, configFile })
  assert.equal(readCharacterSheetModel(env, configFile), 'gpt-image-2.5-sunburst')
  assert.equal(readAreaSheetModel(env, configFile), 'gemini-3.1-flash-image')
  const view = readImageGenSettings({ env, configFile })
  assert.equal(view.characterSheet.model, 'gpt-image-2.5-sunburst')
  assert.equal(view.areaSheet.model, 'gemini-3.1-flash-image')
  // 未单独设置 → 空（生成时回退草图模型）
  const home2 = tempHome()
  const configFile2 = path.join(home2, 'config.json')
  const env2 = { USERPROFILE: home2 }
  saveImageGenSettings({ model: 'gpt-image-2.5-sunburst' }, { env: env2, configFile: configFile2 })
  assert.equal(readCharacterSheetModel(env2, configFile2), '')
  assert.equal(readAreaSheetModel(env2, configFile2), '')
})


test('MiniMax 出图：尺寸与请求体适配（1024/1152x2048/2048x1152 + response_format=url）', async () => {
  const { resolveSketchSize, generateSketchImage } = await import('../server/imagegen.js')
  // 尺寸集合
  assert.equal(resolveSketchSize({ ratio: '1:1', resolution: '1080p' }, 'MiniMax-H3-Image'), '1024x1024')
  assert.equal(resolveSketchSize({ ratio: '9:16', resolution: '1080p' }, 'MiniMax-H3-Image'), '1152x2048')
  assert.equal(resolveSketchSize({ ratio: '16:9', resolution: '1080p' }, 'MiniMax-H3-Image'), '2048x1152')
  // 请求体：response_format/url + output_format
  let seen = null
  const fetchImpl = async (url, init = {}) => {
    seen = { url: String(url), body: JSON.parse(init.body || '{}'), auth: (init.headers || {}).Authorization }
    return new Response(JSON.stringify({ data: [{ url: 'https://cdn.example.com/out.png' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const fetchImage = async (url) => new Response(Buffer.from('png-bytes'), { status: 200, headers: { 'content-type': 'image/png' } })
  const result = await generateSketchImage({
    baseUrl: 'https://relay.example.com',
    apiKey: 'sk-test',
    model: 'MiniMax-H3-Image',
    prompt: '黑白线稿',
    size: '1024x1024',
    fetchImpl: async (url, init) => (String(url).indexOf('/v1/images/') !== -1 ? fetchImpl(url, init) : fetchImage(url))
  })
  assert.ok(result.buffer.length > 0)
  assert.equal(seen.url, 'https://relay.example.com/v1/images/generations')
  assert.equal(seen.body.model, 'MiniMax-H3-Image')
  assert.equal(seen.body.response_format, 'url')
  assert.equal(seen.body.output_format, 'png')
  assert.equal(seen.body.size, '1024x1024')
  assert.equal(seen.auth, 'Bearer sk-test')
})
