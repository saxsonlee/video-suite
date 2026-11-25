/**
 * tool.js 单测：参数映射、各 action、输出 DTO、render 文本、尾帧图片附件。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TOOL_NAME, TOOL_ACTIONS, TOOL_DESCRIPTION, WAIT_SECONDS_DEFAULT, WAIT_SECONDS_MAX, MAX_INLINE_IMAGE_CHARS,
  buildParameters, buildOutput, buildGenerateInput, createSeedanceTool, describeRecord, summarizeRecord, toLosslessJson
} from '../platforms/dsh-plugin/tool.js'

const fakeDefineTool = (definition) => definition

function makeRecord(overrides = {}) {
  return {
    id: 'sd_abc_1',
    sessionId: 'sess-1',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    status: 'succeeded',
    progress: 100,
    prompt: '一只橘猫',
    model: 'doubao-seedance-2-5-260628',
    mode: 'text2video',
    provider: 'demo',
    params: { duration: 5 },
    inputs: { images: [] },
    meta: { duration: 5, usage: { completion_tokens: 3, total_tokens: 4 } },
    files: { video: 'sd_abc_1.mp4' },
    remoteVideoUrl: 'https://cdn/v.mp4',
    ...overrides
  }
}

function makeService(overrides = {}) {
  const calls = []
  const service = {
    sessionId: (exec) => (exec && exec.agent && exec.agent.session ? 'sess-tool' : undefined),
    models: async () => ({ models: [{ id: 'm1', label: 'M1', resolutions: ['720p'], durations: [4, 5] }], defaults: { defaultModel: 'm1' }, capabilities: { demo: false } }),
    generate: async (sessionId, input, options) => { calls.push({ type: 'generate', sessionId, input, options }); return makeRecord({ files: {} }) },
    status: async () => makeRecord(),
    wait: async (sessionId, id, options) => { calls.push({ type: 'wait', options }); return makeRecord() },
    history: async (sessionId, options) => { calls.push({ type: 'history', options }); return [makeRecord(), makeRecord({ id: 'sd_abc_2' })] },
    recreate: async (sessionId, sourceId, overrides) => { calls.push({ type: 'recreate', sourceId, overrides }); return { record: makeRecord({ id: 'sd_abc_3', mode: 'reference' }), plan: { mode: 'reference', mediaKind: 'remote-video', warnings: ['过期'] } } },
    cancel: async () => makeRecord({ status: 'cancelled', files: {} }),
    recordPaths: (record) => record && record.files && record.files.video ? { videoPath: 'C:\\\\media\\\\' + record.id + '.mp4', lastFramePath: 'C:\\\\media\\\\' + record.id + '-lastframe.jpg' } : {},
    workspaceImages: async (paths) => paths.map((item, index) => 'data:image/png;base64,' + Buffer.from(item + index).toString('base64')),
    attachmentForLastFrame: async () => ({ attachmentId: 'att-1', mediaType: 'image/jpeg', bytes: 10, width: 64, height: 64 }),
    ...overrides
  }
  return { service, calls }
}

function makeExec(sessionId = 'sess-tool') {
  return { callId: 'call-1', signal: new AbortController().signal, agent: { session: { id: sessionId } } }
}

async function runTool(args, options = {}) {
  const { service, calls } = makeService(options.serviceOverrides)
  const tool = createSeedanceTool({ defineTool: fakeDefineTool, service })
  const exec = options.exec || makeExec()
  const result = await tool.execute(args, exec)
  return { tool, service, calls, exec, result }
}

test('工具定义：名称、action 枚举、必填、输出 schema', () => {
  const { service } = makeService()
  const tool = createSeedanceTool({ defineTool: fakeDefineTool, service })
  assert.equal(tool.name, TOOL_NAME)
  assert.equal(tool.parameters.action.required, true)
  assert.deepEqual(tool.parameters.action.enum, TOOL_ACTIONS)
  assert.equal(typeof tool.description, 'string')
  assert.ok(tool.description.includes('demo'))
  assert.ok(tool.output.schema.properties.ok.required)
  assert.equal(typeof tool.output.render, 'function')
  assert.equal(typeof tool.execute, 'function')
  assert.ok(tool.output.schema.properties.previewImage, '输出 schema 应含 previewImage（尾帧附件引用）')
})

test('generate：参数映射 + 立即返回 taskId/hint', async () => {
  const { result, calls } = await runTool({
    action: 'generate',
    prompt: '一只猫在跳舞',
    model: 'doubao-seedance-2-5-260628',
    mode: 'text2video',
    resolution: '1080p',
    ratio: '16:9',
    duration: 8,
    seed: 3,
    generateAudio: false,
    watermark: true,
    returnLastFrame: true,
    imageUrls: ['https://example.com/a.png'],
    videoUrl: 'https://example.com/v.mp4'
  })
  assert.equal(result.ok, true)
  assert.equal(result.action, 'generate')
  assert.equal(result.taskId, 'sd_abc_1')
  assert.ok(result.hint.includes('wait'))
  assert.equal(calls[0].sessionId, 'sess-tool')
  assert.equal(calls[0].input.prompt, '一只猫在跳舞')
  assert.equal(calls[0].input.params.resolution, '1080p')
  assert.equal(calls[0].input.params.generateAudio, false)
  assert.equal(calls[0].input.params.watermark, true)
  assert.deepEqual(calls[0].input.inputs.images, [{ url: 'https://example.com/a.png' }])
  assert.deepEqual(calls[0].input.inputs.video, { url: 'https://example.com/v.mp4' })
})

test('buildGenerateInput：workspaceImages 转 dataURL，超大内联图报错', async () => {
  const input = await buildGenerateInput({
    prompt: 'x',
    workspaceImages: ['a.png', 'b.jpg'],
    imageUrls: ['data:image/png;base64,' + Buffer.from('tiny').toString('base64')]
  }, async (paths) => paths.map((item) => 'data:image/png;base64,' + Buffer.from(item).toString('base64')))
  assert.equal(input.inputs.images.length, 3)
  assert.ok(input.inputs.images[0].dataUrl.startsWith('data:image/png;base64,'))
  assert.equal(input.inputs.images[1].dataUrl, 'data:image/png;base64,' + Buffer.from('a.png').toString('base64'))

  await assert.rejects(() => buildGenerateInput({ prompt: 'x', imageUrls: ['data:image/png;base64,' + 'A'.repeat(Math.ceil(MAX_INLINE_IMAGE_CHARS) + 10)] }, null), (error) => error.name === 'ValidationError')
  await assert.rejects(() => buildGenerateInput({ prompt: 'x', imageUrls: [''] }, null), (error) => error.name === 'ValidationError')
})

test('buildGenerateInput：未指定 mode 且 2 张图 → 自动 firstlast；显式 mode 不覆盖', async () => {
  const two = await buildGenerateInput({ prompt: 'x', imageUrls: ['https://a/1.png', 'https://a/2.png'] }, null)
  assert.equal(two.mode, 'firstlast', '2 张图按约定推断首尾帧')
  const one = await buildGenerateInput({ prompt: 'x', imageUrls: ['https://a/1.png'] }, null)
  assert.equal(one.mode, undefined, '1 张图交给宿主推断 image2video')
  const ref = await buildGenerateInput({ prompt: 'x', mode: 'reference', imageUrls: ['https://a/1.png', 'https://a/2.png'] }, null)
  assert.equal(ref.mode, 'reference', '显式 mode 优先')
})

test('错误码回退：无 error.code 时使用 error.name（ValidationError/ApiTimeoutError 等）', async () => {
  const overrides = {
    generate: async () => { const error = new Error('prompt 不能为空'); error.name = 'ValidationError'; throw error },
    wait: async () => { const error = new Error('等待超时'); error.name = 'ApiTimeoutError'; throw error }
  }
  let run = await runTool({ action: 'generate', prompt: 'x' }, { serviceOverrides: overrides })
  assert.equal(run.result.ok, false)
  assert.equal(run.result.error.code, 'ValidationError')
  run = await runTool({ action: 'wait', taskId: 'sd_abc_1' }, { serviceOverrides: overrides })
  assert.equal(run.result.error.code, 'ApiTimeoutError')
})

test('status/history/cancel/recreate 各 action', async () => {
  let run = await runTool({ action: 'status', taskId: 'sd_abc_1' })
  assert.equal(run.result.ok, true)
  assert.equal(run.result.status, 'succeeded')
  assert.match(run.result.videoPath, /sd_abc_1\.mp4$/)

  run = await runTool({ action: 'history', limit: 5 })
  assert.equal(run.result.records.length, 2)
  assert.equal(run.result.total, 2)
  assert.equal(run.result.records[0].id, 'sd_abc_1')

  run = await runTool({ action: 'recreate', sourceId: 'sd_abc_1', prompt: '续写' })
  assert.equal(run.result.ok, true)
  assert.equal(run.calls[0].sourceId, 'sd_abc_1')
  assert.equal(run.calls[0].overrides.prompt, '续写')
  assert.equal(run.result.taskId, 'sd_abc_3')
  assert.equal(run.result.plan.mode, 'reference')

  run = await runTool({ action: 'cancel', taskId: 'sd_abc_1' })
  assert.equal(run.result.status, 'cancelled')

  run = await runTool({ action: 'models' })
  assert.equal(run.result.models.length, 1)
  assert.equal(run.result.defaults.defaultModel, 'm1')
})

test('wait：超时/完成文本、waitSeconds 限制与 exec.signal 透传', async () => {
  const controller = new AbortController()
  const exec = { callId: 'c', signal: controller.signal, agent: { session: { id: 'sess-w' } } }
  let run = await runTool({ action: 'wait', taskId: 'sd_abc_1', waitSeconds: 120 }, { exec })
  assert.equal(run.result.ok, true)
  assert.equal(run.result.status, 'succeeded')
  assert.equal(run.calls[0].type, 'wait')
  assert.equal(run.calls[0].options.timeoutMs, 120000)
  assert.equal(run.calls[0].options.signal, controller.signal)

  // 超时
  const timeoutService = { wait: async () => makeRecord({ status: 'running', progress: 40, meta: { waitTimedOut: true } }) }
  run = await runTool({ action: 'wait', taskId: 'sd_abc_1', waitSeconds: 5 }, { serviceOverrides: timeoutService, exec })
  assert.equal(run.result.ok, true)
  assert.match(run.result.message, /超时/)

  // 超上限被 clamp
  run = await runTool({ action: 'wait', taskId: 'sd_abc_1', waitSeconds: 9999 }, { exec })
  assert.equal(run.calls[0].options.timeoutMs, WAIT_SECONDS_MAX * 1000)
})

test('错误路径：返回 ok:false + error，不抛错', async () => {
  const failing = {
    generate: async () => { const error = new Error('ARK_API_KEY 未配置'); error.code = 'ConfigError'; throw error },
    status: async () => { const error = new Error('任务不存在：sd_abc_9'); error.code = 'NotFound'; throw error }
  }
  let run = await runTool({ action: 'generate', prompt: 'x' }, { serviceOverrides: failing })
  assert.deepEqual(run.result, {
    ok: false,
    action: 'generate',
    message: 'ARK_API_KEY 未配置',
    error: { code: 'ConfigError', message: 'ARK_API_KEY 未配置' }
  })

  run = await runTool({ action: 'status', taskId: 'sd_abc_9' }, { serviceOverrides: failing })
  assert.equal(run.result.ok, false)
  assert.equal(run.result.error.code, 'NotFound')

  run = await runTool({ action: 'wait' }, {})
  assert.equal(run.result.ok, false)
  assert.match(run.result.error.message, /taskId/)

  run = await runTool({ action: 'invalid-action', prompt: 'x' }, {})
  assert.equal(run.result.ok, false)
})

test('exec 缺失/无 agent 会话 → sessionId 回落 default', async () => {
  const { result, calls } = await runTool({ action: 'generate', prompt: 'x' }, { exec: {} })
  assert.equal(result.ok, true)
  assert.equal(calls[0].sessionId, 'default')
})

test('render：成功文本包含状态/路径/用量；失败文本包含错误', () => {
  const { result } = { result: { ok: true, action: 'generate', message: '已创建任务', hint: '用 wait', record: makeRecord(), videoPath: 'C:\\\\media\\\\sd_abc_1.mp4' } }
  const blocks = buildOutput().render({}, result)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'text')
  assert.ok(blocks[0].text.includes('succeeded'))
  assert.ok(blocks[0].text.includes('C:\\\\media\\\\sd_abc_1.mp4'))
  assert.ok(blocks[0].text.includes('https://cdn/v.mp4'))
  assert.ok(blocks[0].text.includes('用量'))

  const failed = buildOutput().render({}, { ok: false, action: 'generate', error: { code: 'ConfigError', message: '缺 Key' } })
  assert.ok(failed[0].text.includes('失败'))
  assert.ok(failed[0].text.includes('缺 Key'))
  assert.ok(failed[0].text.includes('ConfigError'))
})

test('尾帧预览：结果 value 携带 durable previewImage，render 生成 image block', async () => {
  const { service } = makeService()
  const tool = createSeedanceTool({ defineTool: fakeDefineTool, service })
  const exec = makeExec()
  const executed = await tool.execute({ action: 'status', taskId: 'sd_abc_1' }, exec)
  assert.equal(executed.ok, true)
  assert.ok(executed.previewImage, 'status 应返回 previewImage')
  assert.equal(executed.previewImage.attachmentId, 'att-1')
  assert.equal(executed.previewImage.mediaType, 'image/jpeg')
  assert.equal(executed.previewImage.width, 64)

  const blocks = buildOutput().render({ action: 'status' }, executed)
  assert.equal(blocks.length, 2, '文本 + 图片两个 content block')
  assert.equal(blocks[0].type, 'text')
  assert.equal(blocks[1].type, 'image')
  assert.equal(blocks[1].attachment.attachmentId, 'att-1')
  assert.equal(blocks[1].attachment.mediaType, 'image/jpeg')

  // 没有尾帧附件时只有文本 block
  const noAttachment = { ...service, attachmentForLastFrame: async () => null }
  const tool2 = createSeedanceTool({ defineTool: fakeDefineTool, service: noAttachment })
  const status2 = await tool2.execute({ action: 'status', taskId: 'sd_abc_1' }, makeExec())
  assert.equal(status2.previewImage, undefined)
  assert.equal(buildOutput().render({ action: 'status' }, status2).length, 1)
})

test('describeRecord / summarizeRecord', () => {
  const text = describeRecord(makeRecord({ error: { code: 'X', message: '坏了' } }), { videoPath: 'p.mp4' })
  assert.ok(text.includes('succeeded'))
  assert.ok(text.includes('坏了'))
  const summary = summarizeRecord(makeRecord(), { videoPath: 'p.mp4' })
  assert.equal(summary.id, 'sd_abc_1')
  assert.equal(summary.videoPath, 'p.mp4')
  assert.equal(summary.durationSeconds, 5)
})

test('工具描述包含「重新生成前必须确认」约束（防误花钱）', () => {
  assert.ok(TOOL_DESCRIPTION.includes('重新生成前必须确认'))
  assert.ok(TOOL_DESCRIPTION.includes('连续两次生成之间必须有用户消息'))
  assert.ok(TOOL_DESCRIPTION.includes('不允许自己连续重抽'))
  assert.ok(TOOL_DESCRIPTION.includes('逐条列出本次改动点'))
})


test('工具输出可无损 JSON 往返（undefined/NaN 已清理，避免 invalid output）', async () => {
  const run = await runTool({ action: 'status', taskId: 'sd_abc_1' }, { serviceOverrides: {
    status: async () => makeRecord({ remoteVideoUrl: undefined, files: {}, meta: { duration: NaN, usage: { total_tokens: Infinity } } })
  } })
  // 无损往返：JSON 序列化再解析后必须与原值完全一致（不允许 undefined/NaN/Infinity）
  assert.deepStrictEqual(JSON.parse(JSON.stringify(run.result)), run.result)
  assert.equal('videoUrl' in run.result, false)
  assert.equal('videoPath' in run.result, false)
  assert.equal(run.result.record.meta.duration, null)
  assert.equal(run.result.record.meta.usage.total_tokens, null)
})

test('toLosslessJson：Date/BigInt/循环引用/二进制/函数清理', () => {
  const cyclic = { a: 1 }
  cyclic.self = cyclic
  const clean = toLosslessJson({
    when: new Date('2026-01-01T00:00:00.000Z'),
    big: 10n,
    nan: NaN,
    inf: -Infinity,
    fn: () => 1,
    undef: undefined,
    list: [undefined, NaN, 'x'],
    cyclic,
    bytes: Buffer.from('x'),
    nested: { keep: 'ok', drop: undefined }
  })
  assert.equal(clean.when, '2026-01-01T00:00:00.000Z')
  assert.equal(clean.big, '10')
  assert.equal(clean.nan, null)
  assert.equal(clean.inf, null)
  assert.equal('fn' in clean, false)
  assert.equal('undef' in clean, false)
  assert.deepEqual(clean.list, [null, null, 'x'])
  assert.deepEqual(clean.cyclic, { a: 1 })
  assert.equal('bytes' in clean, false)
  assert.deepEqual(clean.nested, { keep: 'ok' })
  assert.deepStrictEqual(JSON.parse(JSON.stringify(clean)), clean)
})

test('models 输出包含中转站已选清单（enabledModels）且 schema 允许', async () => {
  const run = await runTool({ action: 'models' }, { serviceOverrides: {
    models: async () => ({
      models: [{ id: 'm1', label: 'M1', resolutions: ['720p'], durations: [4, 5] }],
      defaults: { defaultModel: 'doubao-seedance-2.5', enabledModels: [{ id: 'doubao-seedance-2.5', label: 'doubao-seedance-2.5' }] },
      capabilities: {}
    })
  } })
  assert.deepEqual(run.result.enabledModels, [{ id: 'doubao-seedance-2.5', label: 'doubao-seedance-2.5' }])
  assert.ok(buildOutput().schema.properties.enabledModels)
  assert.match(run.result.message, /中转站模式/)
})


test('wait 超时提示继续 wait（禁止外部轮询）；工具描述含等待规则', async () => {
  const timeoutService = { wait: async () => makeRecord({ status: 'running', progress: 40, meta: { waitTimedOut: true } }) }
  const run = await runTool({ action: 'wait', taskId: 'sd_abc_1', waitSeconds: 10 }, { serviceOverrides: timeoutService })
  assert.equal(run.result.ok, true)
  assert.match(run.result.message, /超时/)
  assert.match(run.result.hint, /继续用 action=wait/)
  assert.match(run.result.hint, /不要自己写轮询代码/)
  assert.match(TOOL_DESCRIPTION, /等待规则/)
  assert.match(TOOL_DESCRIPTION, /不要用 run_code 自己写轮询/)
  assert.match(TOOL_DESCRIPTION, /不要反复调用 status/)
})
