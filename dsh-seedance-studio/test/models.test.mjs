/**
 * models.js 单测：模型目录、模式推断、参数约束、Ark 请求体构造。
 * 运行：node --test seedance-studio/test/
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  mapModelToRelay,
  DEFAULT_MODEL, MODELS, MODES, MODE_INFO, RATIOS, RESOLUTIONS,
  getModel, listModels, publicDefaults, publicModel, capabilities,
  normalizeGenerateRequest, buildArkPayload, inferMode, ValidationError
} from '../server/models/index.js'

const M25 = 'doubao-seedance-2-5-260628'
const M20 = 'doubao-seedance-2-0-260128'
const M10 = 'doubao-seedance-1-0-pro-250528'

function expectValidation(fn, field) {
  try {
    fn()
  } catch (error) {
    assert.equal(error.name, 'ValidationError', '应为 ValidationError，实际：' + error.message)
    if (field) assert.equal(error.field, field, 'field 应为 ' + field + '，实际 ' + error.field)
    return error
  }
  assert.fail('应抛出 ValidationError')
}

test('模型目录：默认模型存在且 DTO 完整', () => {
  assert.ok(MODELS.length >= 6)
  assert.ok(getModel(DEFAULT_MODEL), '默认模型必须在目录中')
  assert.equal(getModel('not-exist-model'), null)
  const models = listModels()
  assert.equal(models.length, MODELS.length)
  for (const model of models) {
    assert.ok(model.id)
    assert.ok(Array.isArray(model.resolutions) && model.resolutions.length > 0)
    assert.ok(Array.isArray(model.ratios) && model.ratios.length > 0)
    assert.ok(Array.isArray(model.modes) && model.modes.includes('text2video'))
    assert.equal(typeof model.defaultResolution, 'string')
    assert.equal(typeof model.videoEditing, 'boolean')
  }
  const defaults = publicDefaults()
  assert.equal(defaults.defaultModel, DEFAULT_MODEL)
  assert.ok(defaults.modes.length === MODE_INFO.length)
  assert.ok(defaults.ratios.includes('adaptive'))
  assert.deepEqual(defaults.resolutions, RESOLUTIONS)
  const caps = capabilities()
  assert.equal(caps.videoReferenceRequiresUrl, true)
  assert.ok(caps.limits.maxPromptChars > 0)
})

test('模式能力：2.0 系列支持编辑/延长，1.0 不支持，draft 仅 2.5', () => {
  assert.ok(publicModel(getModel(M20)).modes.includes('edit'))
  assert.ok(publicModel(getModel(M20)).modes.includes('extend'))
  assert.ok(!publicModel(getModel(M10)).modes.includes('edit'))
  assert.ok(publicModel(getModel(M25)).modes.includes('draft'))
  assert.ok(!publicModel(getModel(M20)).modes.includes('draft'))
})

test('文生视频：默认参数与 Ark 请求体', () => {
  const req = normalizeGenerateRequest({ prompt: '一只橘猫在窗台上伸懒腰，阳光洒落' })
  assert.equal(req.mode, 'text2video')
  assert.equal(req.model, DEFAULT_MODEL)
  assert.equal(req.params.resolution, '720p')
  assert.equal(req.params.ratio, 'adaptive')
  assert.equal(req.params.duration, -1)
  assert.equal(req.params.returnLastFrame, true)
  assert.equal(req.media.images.length, 0)
  const payload = buildArkPayload(req)
  assert.equal(payload.model, DEFAULT_MODEL)
  assert.deepEqual(payload.content, [{ type: 'text', text: req.prompt }])
  assert.equal(payload.resolution, '720p')
  assert.equal(payload.ratio, 'adaptive')
  assert.equal(payload.duration, -1)
  assert.equal(payload.return_last_frame, true)
  assert.equal(payload.omni_reference_task_type, undefined)
})

test('显式参数：分辨率/比例/时长/seed/音频/水印', () => {
  const req = normalizeGenerateRequest({
    prompt: '测试',
    model: M20,
    params: { resolution: '1080p', ratio: '9:16', duration: 8, seed: 42, generateAudio: false, watermark: true, returnLastFrame: false }
  })
  const payload = buildArkPayload(req)
  assert.equal(payload.resolution, '1080p')
  assert.equal(payload.ratio, '9:16')
  assert.equal(payload.duration, 8)
  assert.equal(payload.seed, 42)
  assert.equal(payload.generate_audio, false)
  assert.equal(payload.watermark, true)
  assert.equal(payload.return_last_frame, false)
})

test('图生视频：单图自动推断首帧', () => {
  const req = normalizeGenerateRequest({ prompt: '让画面动起来', imageUrls: undefined, inputs: { images: ['https://example.com/a.png'] } })
  assert.equal(req.mode, 'image2video')
  assert.equal(req.media.images[0].role, 'first_frame')
  const payload = buildArkPayload(req)
  assert.equal(payload.content[1].type, 'image_url')
  assert.equal(payload.content[1].role, 'first_frame')
})

test('首尾帧：2.5 强制 ratio=adaptive，2.0 按显式规则', () => {
  const req = normalizeGenerateRequest({
    prompt: '从白天过渡到夜晚',
    model: M25,
    mode: 'firstlast',
    params: { ratio: '16:9' },
    inputs: {
      images: [
        { role: 'first_frame', url: 'https://example.com/first.png' },
        { role: 'last_frame', url: 'https://example.com/last.png' }
      ]
    }
  })
  assert.equal(req.mode, 'firstlast')
  assert.equal(req.params.ratio, 'adaptive', '2.5 首尾帧 ratio 必须 adaptive')
  const payload = buildArkPayload(req)
  assert.equal(payload.content.length, 3)
  assert.equal(payload.content[1].role, 'first_frame')
  assert.equal(payload.content[2].role, 'last_frame')
})

test('首尾帧：未显式 role 时按顺序赋 first_frame/last_frame（工具/HTTP 通用）', () => {
  const req = normalizeGenerateRequest({
    prompt: '从白天过渡到夜晚',
    model: M25,
    mode: 'firstlast',
    inputs: { images: [{ url: 'https://example.com/a.png' }, { url: 'https://example.com/b.png' }] }
  })
  assert.equal(req.mode, 'firstlast')
  assert.deepEqual(req.media.images.map((image) => image.role), ['first_frame', 'last_frame'])
  const payload = buildArkPayload(req)
  assert.equal(payload.content[1].role, 'first_frame')
  assert.equal(payload.content[2].role, 'last_frame')
})

test('首尾帧缺首帧/多图校验报错', () => {
  expectValidation(() => normalizeGenerateRequest({
    prompt: 'x', mode: 'firstlast',
    inputs: { images: [{ role: 'last_frame', url: 'https://example.com/last.png' }] }
  }), 'inputs.images')
  expectValidation(() => normalizeGenerateRequest({
    prompt: 'x', mode: 'firstlast',
    inputs: { images: [
      { role: 'first_frame', url: 'https://example.com/a.png' },
      { role: 'first_frame', url: 'https://example.com/b.png' }
    ] }
  }), 'inputs.images')
})

test('全模态参考：图文视音顺序与角色', () => {
  const req = normalizeGenerateRequest({
    prompt: '参考这个角色的风格',
    model: M25,
    mode: 'reference',
    inputs: {
      images: [{ role: 'reference_image', url: 'https://example.com/ref.png' }],
      video: { url: 'https://example.com/ref.mp4' },
      audio: { url: 'https://example.com/ref.mp3' }
    }
  })
  assert.equal(req.mode, 'reference')
  const payload = buildArkPayload(req)
  const types = payload.content.map((item) => item.type)
  assert.deepEqual(types, ['text', 'image_url', 'video_url', 'audio_url'])
  assert.equal(payload.content[2].role, 'reference_video')
  assert.equal(payload.content[3].role, 'reference_audio')
})

test('视频编辑/延长：2.5 传 omni 字段 + duration=-1；2.0 不传 omni 字段', () => {
  const req25 = normalizeGenerateRequest({
    prompt: '把天空改成晚霞', model: M25, mode: 'edit',
    inputs: { video: { url: 'https://example.com/in.mp4' } }
  })
  const p25 = buildArkPayload(req25)
  assert.equal(p25.omni_reference_task_type, 'edit')
  assert.equal(p25.duration, -1)
  assert.equal(p25.ratio, 'adaptive')

  const req20 = normalizeGenerateRequest({
    prompt: '把天空改成晚霞', model: M20, mode: 'extend',
    inputs: { video: { url: 'https://example.com/in.mp4' } }
  })
  const p20 = buildArkPayload(req20)
  assert.equal(p20.omni_reference_task_type, undefined, '2.0 不传 2.5 专有字段')
  assert.ok(typeof p20.duration === 'number' && p20.duration > 0, '2.0 编辑/延长用普通时长')
})

test('编辑/延长必须提供视频 URL；1.0 不支持', () => {
  expectValidation(() => normalizeGenerateRequest({ prompt: 'x', mode: 'edit' }), 'inputs.video')
  expectValidation(() => normalizeGenerateRequest({
    prompt: 'x', model: M10, mode: 'edit', inputs: { video: { url: 'https://example.com/in.mp4' } }
  }), 'model')
})

test('样片 draft：默认 480p、显式非 480p 报错、payload.draft=true', () => {
  const req = normalizeGenerateRequest({ prompt: '样片测试', model: M25, mode: 'draft' })
  assert.equal(req.params.resolution, '480p')
  const payload = buildArkPayload(req)
  assert.equal(payload.draft, true)
  assert.equal(payload.resolution, '480p')
  expectValidation(() => normalizeGenerateRequest({ prompt: '样片测试', model: M25, mode: 'draft', params: { resolution: '720p' } }), 'resolution')
})

test('样片转正式：draft_task content、1080p、禁止 prompt/素材', () => {
  const req = normalizeGenerateRequest({ model: M25, mode: 'draft-final', draftTaskId: 'cgt-draft-1', params: { watermark: true, outputFormat: 'mov' } })
  assert.equal(req.mode, 'draft-final')
  const payload = buildArkPayload(req)
  assert.deepEqual(payload.content, [{ type: 'draft_task', draft_task: { id: 'cgt-draft-1' } }])
  assert.equal(payload.resolution, '1080p')
  assert.equal(payload.watermark, true)
  assert.equal(payload.output_format, 'mov')
  expectValidation(() => normalizeGenerateRequest({ prompt: '不应传', mode: 'draft-final', draftTaskId: 'x' }), 'prompt')
})

test('参数与素材非法输入', () => {
  expectValidation(() => normalizeGenerateRequest({ prompt: '' }), 'prompt')
  expectValidation(() => normalizeGenerateRequest({ prompt: 'x', model: 'bad model!' }), 'model')
  expectValidation(() => normalizeGenerateRequest({ prompt: 'x', model: M25, params: { resolution: '4k' } }), 'resolution')
  expectValidation(() => normalizeGenerateRequest({ prompt: 'x', model: M25, params: { duration: 60 } }), 'duration')
  expectValidation(() => normalizeGenerateRequest({ prompt: 'x', mode: 'reference', inputs: { video: { url: 'data:video/mp4;base64,AAAA' } } }), 'inputs.video.url')
  expectValidation(() => normalizeGenerateRequest({ prompt: 'x', model: M10, mode: 'reference', inputs: { images: [{ url: 'https://example.com/a.png' }] } }), 'model')
  expectValidation(() => normalizeGenerateRequest({ prompt: 'x', model: M20, mode: 'draft' }), 'model')
  expectValidation(() => normalizeGenerateRequest({ prompt: 'x', mode: 'text2video', inputs: { images: [{ url: 'https://example.com/a.png' }] } }), 'mode')
})

test('inferMode 推断', () => {
  assert.equal(inferMode({ images: [] }), 'text2video')
  assert.equal(inferMode({ images: [{ role: 'first_frame' }] }), 'image2video')
  assert.equal(inferMode({ images: [{ role: 'first_frame' }, { role: 'last_frame' }] }), 'firstlast')
  assert.equal(inferMode({ images: [{ role: 'reference_image' }] }), 'reference')
  assert.equal(inferMode({ video: { url: 'https://x/y.mp4' } }), 'reference')
  assert.equal(inferMode({ video: { draftTaskId: 'd1' } }), 'draft-final')
})


test('mapModelToRelay：方舟粒度 id 映射到中转站别名', () => {
  const relayModels = [{ id: 'doubao-seedance-2.5', label: 'Seedance 2.5' }]
  assert.equal(mapModelToRelay('doubao-seedance-2-5-260628', relayModels).model, 'doubao-seedance-2.5')
  assert.equal(mapModelToRelay('doubao-seedance-2-5-260628', relayModels).adjusted, true)
  assert.equal(mapModelToRelay('doubao-seedance-2.5', relayModels).adjusted, false)
  assert.equal(mapModelToRelay('doubao-seedance-2-5-260628', []).model, 'doubao-seedance-2-5-260628')
  assert.equal(mapModelToRelay('some-other-model', relayModels).model, 'some-other-model')
})

test('normalizeGenerateRequest：中转站模式下显式粒度模型自动映射并提示', () => {
  const relayModels = [{ id: 'doubao-seedance-2.5', label: 'Seedance 2.5' }]
  const normalized = normalizeGenerateRequest(
    { prompt: '测试', model: 'doubao-seedance-2-5-260628' },
    { defaultModel: 'doubao-seedance-2-5-260628', relayModels, useRelay: true }
  )
  assert.equal(normalized.model, 'doubao-seedance-2.5')
  assert.ok(normalized.warnings.some((item) => String(item).includes('映射')))
})

test('normalizeGenerateRequest：非中转站模式不做映射', () => {
  const relayModels = [{ id: 'doubao-seedance-2.5' }]
  const normalized = normalizeGenerateRequest(
    { prompt: '测试', model: 'doubao-seedance-2-5-260628' },
    { defaultModel: 'doubao-seedance-2-5-260628', relayModels, useRelay: false }
  )
  assert.equal(normalized.model, 'doubao-seedance-2-5-260628')
})
