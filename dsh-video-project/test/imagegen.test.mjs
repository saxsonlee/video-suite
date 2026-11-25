/**
 * imagegen.js 单测：图像配置解析、提示词、尺寸、API 调用与草图落盘。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildSketchPrompt,
  generateSketchImage,
  pickDefaultImageModel,
  readSeedanceSettings,
  resolveImageGenConfig,
  resolveSketchSize,
  saveSketchImage
} from '../server/imagegen.js'

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-imagegen-'))
}

test('resolveSketchSize：跟随项目声明的分辨率+比例；gpt-image 系列映射固定尺寸', () => {
  // gpt-image 系列（固定尺寸，按比例就近）
  assert.equal(resolveSketchSize({ ratio: '9:16', resolution: '720p' }, 'gpt-image-2.5-sunburst'), '1024x1536')
  assert.equal(resolveSketchSize({ ratio: '16:9', resolution: '1080p' }, 'gpt-image-2.5'), '1536x1024')
  assert.equal(resolveSketchSize({ ratio: '1:1', resolution: '720p' }, 'gpt-image-2'), '1024x1024')
  // 其他模型：直接按视频尺寸（短边=分辨率）
  assert.equal(resolveSketchSize({ ratio: '9:16', resolution: '720p' }, 'seedream-4'), '720x1280')
  assert.equal(resolveSketchSize({ ratio: '16:9', resolution: '1080p' }, 'seedream-4'), '1920x1080')
  assert.equal(resolveSketchSize({ ratio: '1:1', resolution: '720p' }, 'seedream-4'), '720x720')
  assert.equal(resolveSketchSize({ ratio: '4:3', resolution: '720p' }, 'seedream-4'), '960x720')
  // 兼容字符串入参（旧调用）
  assert.equal(resolveSketchSize('9:16', 'gpt-image'), '1024x1536')
  // 缺省：9:16 竖屏 + 720p
  assert.equal(resolveSketchSize({}, 'seedream-4'), '720x1280')
})

test('pickDefaultImageModel：按首选顺序挑，找不到用第一项', () => {
  assert.equal(pickDefaultImageModel(['flux-pro', 'gpt-image-2', 'gpt-image-2.5']), 'gpt-image-2.5')
  assert.equal(pickDefaultImageModel(['seedream-4']), 'seedream-4')
  assert.equal(pickDefaultImageModel([]), '')
  assert.equal(pickDefaultImageModel([null, 42, 'gemini-3.1-flash-image']), 'gemini-3.1-flash-image')
})

test('resolveImageGenConfig：用户启用+指定模型后才 capable，接口地址按 环境变量 > config.json > 共享能力文件 > seedance 回退', () => {
  const home = tempHome()
  const env = { USERPROFILE: home, VIDEO_IMAGE_CAPABLE: '1', VIDEO_IMAGE_BASE_URL: 'https://env.example', VIDEO_IMAGE_API_KEY: 'env-key', VIDEO_IMAGE_MODEL: 'gpt-image-2.5' }
  const result = resolveImageGenConfig({ env })
  assert.equal(result.capable, true)
  assert.equal(result.enabled, true)
  assert.equal(result.baseUrl, 'https://env.example')
  assert.equal(result.apiKey, 'env-key')
  assert.equal(result.model, 'gpt-image-2.5')
  assert.match(result.source, /环境变量/)

  const configFile = path.join(home, 'vp-config.json')
  fs.writeFileSync(configFile, JSON.stringify({ imageGen: { enabled: true, baseUrl: 'https://cfg.example', apiKey: 'cfg-key', model: 'gemini-3.1-flash-image' } }))
  const r2 = resolveImageGenConfig({ env: { USERPROFILE: home, VIDEO_PROJECT_CONFIG_FILE: configFile } })
  assert.equal(r2.capable, true)
  assert.equal(r2.baseUrl, 'https://cfg.example')
  assert.equal(r2.model, 'gemini-3.1-flash-image')
  assert.match(r2.source, /config.json/)

  const capsFile = path.join(home, 'caps.json')
  fs.writeFileSync(capsFile, JSON.stringify({
    schemaVersion: 2,
    imageGeneration: { capable: true, models: ['gpt-image-2.5', 'gpt-image-2'], baseUrl: 'https://shared.example', provider: 'relay' }
  }))
  const seedDir = path.join(home, '.dsh', 'storages', 'seedance-studio')
  fs.mkdirSync(seedDir, { recursive: true })
  fs.writeFileSync(path.join(seedDir, 'settings.json'), JSON.stringify({ RELAY_BASE_URL: 'https://seedance.example', RELAY_API_KEY: 'seedance-key' }))
  // 用户只启用了、还没选模型：共享能力文件只给候选，不自动挑模型
  const capsOnly = path.join(home, 'caps-only.json')
  fs.writeFileSync(capsOnly, JSON.stringify({ imageGeneration: { capable: true, models: ['gpt-image-2.5', 'gpt-image-2'], baseUrl: 'https://shared.example' } }))
  const rShared = resolveImageGenConfig({ env: { USERPROFILE: home, VIDEO_CAPABILITIES_FILE: capsFile } })
  assert.equal(rShared.capable, false)
  assert.deepEqual(rShared.candidates, ['gpt-image-2.5', 'gpt-image-2'])
  assert.match(rShared.reason, /未启用|未选择图像模型/)
  // 用户启用并指定模型，但地址/Key 来自共享文件与 seedance 设置
  const userConfig = path.join(home, 'vp-user.json')
  fs.writeFileSync(userConfig, JSON.stringify({ imageGen: { enabled: true, model: 'gpt-image-2.5' } }))
  const r3 = resolveImageGenConfig({ env: { USERPROFILE: home, VIDEO_PROJECT_CONFIG_FILE: userConfig, VIDEO_CAPABILITIES_FILE: capsOnly } })
  assert.equal(r3.capable, true)
  assert.equal(r3.baseUrl, 'https://shared.example')
  assert.equal(r3.apiKey, 'seedance-key')
  assert.equal(r3.model, 'gpt-image-2.5')

  const r4 = resolveImageGenConfig({ env: { USERPROFILE: tempHome() } })
  assert.equal(r4.capable, false)
  assert.match(r4.reason, /未启用|缺少/)
})

test('readSeedanceSettings：读 RELAY_BASE_URL / RELAY_API_KEY', () => {
  const home = tempHome()
  const dir = path.join(home, '.dsh', 'storages', 'seedance-studio')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ RELAY_BASE_URL: 'https://r.example', RELAY_API_KEY: 'k' }))
  const result = readSeedanceSettings({ USERPROFILE: home })
  assert.equal(result.relayBaseUrl, 'https://r.example')
  assert.equal(result.relayApiKey, 'k')
})

test('resolveSketchSize：缺省模型/分辨率时按视频尺寸（短边=720）', () => {
  assert.equal(resolveSketchSize('9:16'), '720x1280')
  assert.equal(resolveSketchSize('16:9'), '1280x720')
  assert.equal(resolveSketchSize('1:1'), '720x720')
  assert.equal(resolveSketchSize('3:4'), '720x960')
  assert.equal(resolveSketchSize(''), '720x1280')
})

test('buildSketchPrompt：输入只用分镜脚本（不接受附加文本），输出要求单镜头单张', () => {
  const shot = {
    id: 'Shot3',
    name: '起跳',
    shotType: '特写（脚部）',
    camera: '低机位贴地',
    movement: '固定',
    duration: 3,
    scene: '紫色水晶地面',
    action: '黑色长靴蹬裂地面，粒子扬起',
    lighting: '蓝紫光',
    characters: ['少年']
  }
  const project = {
    style: '日系动画',
    characters: [{ name: '少年', age: '16', face: '锐利', hair: '黑短发', costume: '黑色战衣', body: '清瘦', signature: '蓝色能量枪' }]
  }
  const prompt = buildSketchPrompt(shot, project)
  assert.match(prompt, /黑白铅笔线稿/)
  assert.match(prompt, /特写（脚部）/)
  assert.match(prompt, /低机位贴地/)
  assert.match(prompt, /黑色长靴蹬裂地面/)
  assert.match(prompt, /少年/)
  assert.match(prompt, /蓝色能量枪/)
  // 附加文本不再进入提示词（防止智能体临时加内容）
  assert.doesNotMatch(prompt, /镜头再低一点/)
  assert.match(prompt, /只画这一个镜头/)
  assert.match(prompt, /【环境（本镜，全片一致）】/)
  assert.match(prompt, /不要文字/)
})

test('generateSketchImage：b64_json 返回图片 Buffer', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ b64_json: Buffer.from('fake-png-bytes').toString('base64') }], usage: { total_tokens: 10 } })
    }
  }
  const result = await generateSketchImage({ baseUrl: 'https://relay.example/', apiKey: 'k', model: 'gpt-image-2.5', prompt: 'p', size: '1536x1024', fetchImpl })
  assert.equal(result.buffer.toString(), 'fake-png-bytes')
  assert.equal(calls[0].url, 'https://relay.example/v1/images/generations')
  assert.equal(JSON.parse(calls[0].options.body).model, 'gpt-image-2.5')
  assert.equal(calls[0].options.headers.Authorization, 'Bearer k')
})

test('generateSketchImage：接口错误转成可读错误', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => '{"error":"bad key"}' })
  await assert.rejects(
    () => generateSketchImage({ baseUrl: 'https://relay.example', apiKey: 'k', model: 'm', prompt: 'p', fetchImpl }),
    (error) => error.code === 'IMAGE_GEN_API' && /401/.test(error.message)
  )
})

test('saveSketchImage：文件名可读（ShotN-镜头名），重名自动加序号', () => {
  const dir = path.join(tempHome(), 'Storyboards')
  const saved = saveSketchImage({ dir, shotId: 'Shot3', label: '起跳-特写', buffer: Buffer.from('png'), mediaType: 'image/png' })
  assert.ok(fs.existsSync(saved.path))
  assert.equal(saved.fileName, 'Shot3-起跳-特写.png')
  assert.equal(fs.readFileSync(saved.path, 'utf8'), 'png')
  const again = saveSketchImage({ dir, shotId: 'Shot3', label: '起跳-特写', buffer: Buffer.from('png2'), mediaType: 'image/png' })
  assert.equal(again.fileName, 'Shot3-起跳-特写-2.png')
  // 无 label 时退化为 ShotN.png
  const plain = saveSketchImage({ dir, shotId: 'Shot9', buffer: Buffer.from('x'), mediaType: 'image/png' })
  assert.equal(plain.fileName, 'Shot9.png')
})
