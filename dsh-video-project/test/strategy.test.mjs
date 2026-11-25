/**
 * strategy.js / capabilities.js 单测：调整策略判断、保留时间估算、能力配置优先级。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildStrategy, estimateKeepUntil, normalizeStrategy, parseKeepUntilFromFeedback } from '../server/strategy.js'
import { resolveVideoEditCapability, resolveImageGenerationCapability, resolveCapabilitiesFile, readSharedCapabilities } from '../server/capabilities.js'

const shot = { id: 'Shot1', duration: 6 }

test('buildStrategy：核心栏不通过 → regenerate', () => {
  const strategy = buildStrategy({
    checks: [
      { key: 'action', label: '画面内容', pass: false, note: '动作不对' },
      { key: 'dialogue', label: '台词/字幕', pass: true }
    ],
    shot,
    capability: { capable: true }
  })
  assert.equal(strategy.type, 'regenerate')
  assert.equal(strategy.keepUntil, 0)
  assert.ok(strategy.reason.includes('画面内容'))
})

test('buildStrategy：只有局部问题且支持编辑 → local-edit；不支持则 keep-frames', () => {
  const checks = [
    { key: 'dialogue', label: '台词/字幕', pass: false, note: '字幕错字' },
    { key: 'duration', label: '时长', pass: false, note: '短了 1 秒' },
    { key: 'action', label: '画面内容', pass: true }
  ]
  const capable = buildStrategy({ checks, shot, capability: { capable: true } })
  assert.equal(capable.type, 'local-edit')
  const notCapable = buildStrategy({ checks, shot, capability: { capable: false } })
  assert.equal(notCapable.type, 'keep-frames')
  assert.equal(notCapable.keepUntil, 3)
})

test('buildStrategy：用户对话给出保留点优先；全部通过 → approved', () => {
  const checks = [{ key: 'duration', label: '时长', pass: false }]
  const withFeedback = buildStrategy({ checks, shot, capability: { capable: false }, feedback: '前 4 秒都很好，后面再改' })
  assert.equal(withFeedback.type, 'keep-frames')
  assert.equal(withFeedback.keepUntil, 4)
  const approved = buildStrategy({ checks: [{ key: 'action', pass: true }], shot, capability: { capable: true } })
  assert.equal(approved.type, 'approved')
})

test('estimateKeepUntil：抽帧索引估算 + parseKeepUntilFromFeedback/normalizeStrategy', () => {
  assert.equal(estimateKeepUntil({ shot, frameIndex: 0, frameCount: 6 }), 1)
  assert.equal(estimateKeepUntil({ shot, frameIndex: 2, frameCount: 6 }), 3)
  assert.equal(parseKeepUntilFromFeedback('保留前 2.5 秒'), 2.5)
  assert.equal(parseKeepUntilFromFeedback('没有秒数'), null)
  const normalized = normalizeStrategy({ type: 'keep-frames', keepUntil: 3.456, reason: 'x' })
  assert.equal(normalized.type, 'keep-frames')
  assert.equal(normalized.keepUntil, 3.5)
  assert.equal(normalizeStrategy({ type: 'unknown' }), null)
})

test('resolveVideoEditCapability：环境变量 > 固定配置 > 共享能力文件 > 默认不支持', () => {
  const shared = { payload: { videoEdit: { capable: true, models: ['m1'] } } }
  assert.equal(resolveVideoEditCapability({ env: { VIDEO_EDIT_CAPABLE: 'false' }, shared, config: { videoEditCapable: true } }).capable, false)
  assert.equal(resolveVideoEditCapability({ env: {}, shared, config: { videoEditCapable: true } }).capable, true)
  const viaShared = resolveVideoEditCapability({ env: {}, shared, config: {} })
  assert.equal(viaShared.capable, true)
  assert.deepEqual(viaShared.models, ['m1'])
  assert.equal(resolveVideoEditCapability({ env: {}, shared: null, config: {} }).capable, false)
})

test('capabilities：共享文件路径与读取（存在/不存在）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-cap-'))
  try {
    const file = path.join(dir, 'video-capabilities.json')
    assert.equal(resolveCapabilitiesFile({ VIDEO_CAPABILITIES_FILE: file, USERPROFILE: 'C:\\Users\\x' }), path.resolve(file))
    assert.equal(readSharedCapabilities({ env: { VIDEO_CAPABILITIES_FILE: file } }), null)
    fs.writeFileSync(file, JSON.stringify({ videoEdit: { capable: true, models: ['m'] } }), 'utf8')
    const read = readSharedCapabilities({ env: { VIDEO_CAPABILITIES_FILE: file } })
    assert.equal(read.payload.videoEdit.capable, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveImageGenerationCapability：用户显式启用 + 指定模型才可用（不自动启用、不自动选模型）', () => {
  const shared = { payload: { imageGeneration: { capable: true, models: ['gpt-image-2.5'], baseUrl: 'https://relay.example', provider: 'relay' } } }
  assert.equal(resolveImageGenerationCapability({ env: { VIDEO_IMAGE_CAPABLE: 'false' }, shared, config: {} }).capable, false)
  // 环境变量强制启用但没有指定模型 → 仍不可用（不允许自动挑模型）
  const viaEnvNoModel = resolveImageGenerationCapability({ env: { VIDEO_IMAGE_CAPABLE: 'true' }, shared: null, config: {} })
  assert.equal(viaEnvNoModel.capable, false)
  const viaEnv = resolveImageGenerationCapability({ env: { VIDEO_IMAGE_CAPABLE: 'true', VIDEO_IMAGE_MODEL: 'gpt-image-2.5' }, shared: null, config: {} })
  assert.equal(viaEnv.capable, true)
  assert.equal(viaEnv.model, 'gpt-image-2.5')
  assert.match(viaEnv.source, /环境变量/)
  const closed = resolveImageGenerationCapability({ env: {}, shared, config: { imageGen: { enabled: false } } })
  assert.equal(closed.capable, false)
  assert.match(closed.detail, /关闭/)
  // 共享能力文件只作为候选清单：不会因为探测到图像模型就自动启用
  const viaShared = resolveImageGenerationCapability({ env: {}, shared, config: {} })
  assert.equal(viaShared.capable, false)
  assert.deepEqual(viaShared.candidates, ['gpt-image-2.5'])
  assert.equal(viaShared.baseUrl, 'https://relay.example')
  // 只配了接口、没启用没选模型 → 不可用
  const viaConfig = resolveImageGenerationCapability({ env: {}, shared: null, config: { imageGen: { baseUrl: 'https://cfg.example', apiKey: 'k' } } })
  assert.equal(viaConfig.capable, false)
  // 用户显式启用并选择模型 → 可用
  const userSelected = resolveImageGenerationCapability({ env: {}, shared, config: { imageGen: { enabled: true, model: 'gpt-image-2.5' } } })
  assert.equal(userSelected.capable, true)
  assert.equal(userSelected.model, 'gpt-image-2.5')
  // 启用了但还没选模型 → 不可用，并提示候选
  const noModel = resolveImageGenerationCapability({ env: {}, shared, config: { imageGen: { enabled: true } } })
  assert.equal(noModel.capable, false)
  assert.match(noModel.detail, /选择图像模型/)
  const none = resolveImageGenerationCapability({ env: {}, shared: null, config: {} })
  assert.equal(none.capable, false)
  assert.match(none.detail, /关闭/)
})
