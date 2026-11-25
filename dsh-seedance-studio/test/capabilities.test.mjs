/**
 * capabilities.js 单测：模型编辑能力探测、共享能力文件路径/写入/读回。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CAPABILITIES_SCHEMA_VERSION,
  buildCapabilitiesSnapshot,
  detectImageModels,
  detectVideoEdit,
  isImageModel,
  refreshVideoCapabilities,
  resolveCapabilitiesFile
} from '../server/capabilities.js'
import { MODELS } from '../server/models/index.js'

test('detectVideoEdit：有支持编辑的模型 → capable + 模型清单；全不支持 → false', () => {
  const detected = detectVideoEdit(MODELS)
  assert.equal(detected.capable, true)
  assert.ok(detected.models.includes('doubao-seedance-2-5-260628'))
  assert.ok(detected.models.every((id) => MODELS.find((model) => model.id === id)?.deprecated !== true))
  const none = detectVideoEdit([{ id: 'x', videoEditing: false }, { id: 'y', videoEditing: true, deprecated: true }])
  assert.equal(none.capable, false)
  assert.deepEqual(none.models, [])
})

test('buildCapabilitiesSnapshot：结构、版本、时间可注入', () => {
  const now = new Date('2026-11-05T08:00:00.000Z')
  const snapshot = buildCapabilitiesSnapshot(MODELS, now)
  assert.equal(snapshot.schemaVersion, CAPABILITIES_SCHEMA_VERSION)
  assert.equal(snapshot.source, 'seedance-studio')
  assert.equal(snapshot.updatedAt, now.toISOString())
  assert.equal(snapshot.videoEdit.capable, true)
  assert.equal(snapshot.videoEdit.checkedAt, now.toISOString())
})

test('resolveCapabilitiesFile：环境变量覆盖优先，默认 home/.dsh/video-capabilities.json', () => {
  assert.equal(resolveCapabilitiesFile({ VIDEO_CAPABILITIES_FILE: 'D:\\tmp\\cap.json', USERPROFILE: 'C:\\Users\\x' }), path.resolve('D:\\tmp\\cap.json'))
  assert.equal(resolveCapabilitiesFile({ USERPROFILE: 'C:\\Users\\x' }), path.join('C:\\Users\\x', '.dsh', 'video-capabilities.json'))
})

test('refreshVideoCapabilities：探测并写入能力文件（目录自动创建）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-cap-'))
  try {
    const file = path.join(dir, 'nested', 'video-capabilities.json')
    const result = refreshVideoCapabilities({ env: { VIDEO_CAPABILITIES_FILE: file }, models: MODELS })
    assert.equal(result.ok, true)
    assert.equal(result.path, file)
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(saved.source, 'seedance-studio')
    assert.equal(saved.videoEdit.capable, true)
    assert.ok(saved.videoEdit.models.length > 0)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})


test('detectImageModels：识别中转站图像生成模型并去重保序', () => {
  const list = [
    'doubao-seedance-2.5',
    { id: 'gpt-image-2.5' },
    'gemini-3.1-flash-image',
    'Doubao-Seed-2.0-pro',
    'gpt-image-2',
    'noise-model',
    'dall-e-3',
    { id: 'gpt-image-2.5' }
  ]
  assert.deepEqual(detectImageModels(list), ['gpt-image-2.5', 'gemini-3.1-flash-image', 'gpt-image-2', 'dall-e-3'])
  assert.equal(isImageModel('gpt-image-2.5'), true)
  assert.equal(isImageModel('gemini-3.1-flash-image'), true)
  assert.equal(isImageModel('doubao-seedance-2.5'), false)
  assert.equal(isImageModel(''), false)
})

test('能力快照包含图像生成能力（imageGeneration）', () => {
  const now = new Date('2026-11-05T09:30:00.000Z')
  const snapshot = buildCapabilitiesSnapshot([], now, {
    imageModels: ['gpt-image-2.5', 'gemini-3.1-flash-image'],
    imageProvider: 'relay',
    imageBaseUrl: 'https://relay.example.com'
  })
  assert.equal(snapshot.schemaVersion, 2)
  assert.equal(snapshot.imageGeneration.capable, true)
  assert.deepEqual(snapshot.imageGeneration.models, ['gpt-image-2.5', 'gemini-3.1-flash-image'])
  assert.equal(snapshot.imageGeneration.provider, 'relay')
  assert.equal(snapshot.imageGeneration.baseUrl, 'https://relay.example.com')
  assert.equal(snapshot.videoEdit.capable, false)

  const none = buildCapabilitiesSnapshot([], now)
  assert.equal(none.imageGeneration.capable, false)
  assert.deepEqual(none.imageGeneration.models, [])
})

test('refreshVideoCapabilities：把图像能力一起写入文件', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-caps-'))
  const file = path.join(dir, 'caps.json')
  const result = refreshVideoCapabilities({
    filePath: file,
    models: [],
    imageModels: ['gpt-image-2.5'],
    imageProvider: 'relay',
    imageBaseUrl: 'https://relay.example.com'
  })
  assert.equal(result.ok, true)
  const written = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.equal(written.imageGeneration.capable, true)
  assert.deepEqual(written.imageGeneration.models, ['gpt-image-2.5'])
})


test('图像模型识别：MiniMax-H3-Image 是图像模型，MiniMax-H3（视频）不是', () => {
  assert.equal(isImageModel('MiniMax-H3-Image'), true)
  assert.equal(isImageModel('MiniMax-H3'), false)
  assert.deepEqual(detectImageModels(['MiniMax-H3-Image', 'MiniMax-H3', 'gpt-image-2.5']), ['MiniMax-H3-Image', 'gpt-image-2.5'])
})
