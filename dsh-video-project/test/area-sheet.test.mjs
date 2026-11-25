import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildAreaSheetPrompt } from '../server/imagegen.js'
import { readAreaSheetEnabled, readImageGenSettings, saveImageGenSettings } from '../server/image-settings.js'
import { createProjects } from '../server/projects.js'

const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-area-'))
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

test('buildAreaSheetPrompt：场地描述包含布局/标志物/光线/道具', () => {
  const prompt = buildAreaSheetPrompt(
    { id: 'dock', name: '码头', description: '黄昏海港', layout: '入口在南、栈道向北', landmarks: ['系船柱'], lighting: '暖橙侧光', props: ['铜哨'] },
    { style: '游戏宣传片', baseline: { styleCard: '2D 卡通渲染' } }
  )
  assert.match(prompt, /场景/)
  assert.match(prompt, /码头/)
  assert.match(prompt, /入口在南/)
  assert.match(prompt, /系船柱/)
  assert.match(prompt, /暖橙侧光/)
  assert.match(prompt, /铜哨/)
})

test('areaSheet 设置：默认关闭、保存后读取一致、保留 imageGen', () => {
  const home = tempHome()
  const configFile = path.join(home, 'config.json')
  const env = { USERPROFILE: home }
  assert.equal(readAreaSheetEnabled(env, configFile), false)
  saveImageGenSettings({ enabled: true, model: 'gpt-image-2.5', areaSheet: { enabled: true } }, { env, configFile })
  assert.equal(readAreaSheetEnabled(env, configFile), true)
  const view = readImageGenSettings({ env, configFile })
  assert.equal(view.areaSheet.enabled, true)
  assert.equal(view.enabled, true)
})

test('generateAreaSheet：生成场地设定图并写入 area.mapPath', async () => {
  await withImageEnv(async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-area-gen-'))
    const projects = createProjects({ root })
    await projects.createProject('区域出图项目', { style: 'Q版' })
    await projects.saveAreas('区域出图项目', [{ id: 'dock', name: '码头', layout: '入口在南', landmarks: ['系船柱'], lighting: '暖橙侧光' }])
    const result = await projects.generateAreaSheet('区域出图项目', { areaId: 'dock', fetchImpl: mockImageFetch() })
    assert.equal(result.ok, true)
    assert.ok(fs.existsSync(result.path))
    const project = await projects.getProject('区域出图项目')
    assert.equal(project.areas[0].mapPath, result.path)
  })
})

test('saveAreas：开启自动出图但能力不可用时返回 warning，不阻塞保存', async () => {
  const saved = { ...process.env }
  process.env.VIDEO_IMAGE_CAPABLE = '0'
  try {
    const home = tempHome()
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-area-auto-'))
    const configFile = path.join(home, 'config.json')
    saveImageGenSettings({ areaSheet: { enabled: true } }, { env: { USERPROFILE: home }, configFile })
    const savedConfig = saved.VIDEO_PROJECT_CONFIG_FILE
    process.env.VIDEO_PROJECT_CONFIG_FILE = configFile
    const projects = createProjects({ root })
    await projects.createProject('自动区域项目', {})
    const result = await projects.saveAreas('自动区域项目', [{ id: 'dock', name: '码头', layout: '入口在南' }])
    assert.equal(result.ok, true)
    const codes = result.warnings.map((item) => item.code)
    assert.ok(codes.includes('AREA_SHEET_DISABLED'))
    if (savedConfig === undefined) delete process.env.VIDEO_PROJECT_CONFIG_FILE
    else process.env.VIDEO_PROJECT_CONFIG_FILE = savedConfig
  } finally {
    if (saved.VIDEO_IMAGE_CAPABLE === undefined) delete process.env.VIDEO_IMAGE_CAPABLE
    else process.env.VIDEO_IMAGE_CAPABLE = saved.VIDEO_IMAGE_CAPABLE
  }
})
