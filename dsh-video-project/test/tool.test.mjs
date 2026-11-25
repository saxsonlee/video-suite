/**
 * tool.js 单测：video_project 参数/action 分发/错误处理/渲染。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { TOOL_ACTIONS, TOOL_DESCRIPTION, TOOL_NAME, buildOutput, buildParameters, createVideoProjectTool, renderToolResult } from '../platforms/dsh-plugin/tool.js'

const fakeDefineTool = (definition) => definition

function makeProjects(overrides = {}) {
  const calls = []
  const emptyProject = { videoName: '项目', characters: [], shots: [], changes: [], video: { shots: [{ id: 'Shot1', reviews: [{ pass: true }], approved: true }], fullVideo: null }, dir: 'C:\\project' }
  const projects = {
    listProjects: async () => { calls.push({ type: 'list' }); return [{ name: '项目', shots: 1, characters: 2, versions: 3 }] },
    createProject: async (name, input) => { calls.push({ type: 'create', name, input }); return { ...emptyProject, videoName: name } },
    getProject: async (name) => { calls.push({ type: 'get', name }); return { ...emptyProject, videoName: name } },
    deleteProject: async (name) => { calls.push({ type: 'delete', name }); return { ok: true, name } },
    saveCharacters: async (name, characters, meta) => { calls.push({ type: 'saveCharacters', name, characters, meta }); return { characters } },
    saveShots: async (name, payload) => { calls.push({ type: 'saveShots', name, payload }); return { shots: payload.shots, warnings: [{ code: 'SHOT_TYPE_REPEAT', message: 'Shot2 与 Shot1 景别相同' }], stats: { shotCount: payload.shots.length, totalDuration: 8 } } },
    recordShotChange: async (name, change) => { calls.push({ type: 'recordShotChange', name, change }); return { ok: true } },
    buildShotPrompt: async (name, shot, extra) => { calls.push({ type: 'buildShotPrompt', name, shot, extra }); return { prompt: 'PROMPT-' + shot, shot, params: { model: 'm1', seed: 7 }, checks: ['未锁定模型：x'] } },
    readLocation: () => ({ storageRoot: 'C:\\default\\video-project', projectsRoot: 'C:\\default\\video-project\\projects', source: 'default', defaultStorageRoot: 'C:\\default\\video-project' }),
    updateLocation: (storageRoot) => { calls.push({ type: 'updateLocation', storageRoot }); return { storageRoot, projectsRoot: storageRoot + '\\projects', source: 'settings' } },
    saveShotReview: async (name, shot, input) => { calls.push({ type: 'saveShotReview', name, shot, input }); return { ok: true, shot, review: { ...input, pass: input.pass === true }, passed: input.pass === true } },
    reviewTemplate: async (name, shot) => { calls.push({ type: 'reviewTemplate', name, shot }); return { ok: true, videoName: name, shot, checks: [{ key: 'shotType', label: '景别/机位', hint: 'x', expected: '全景', pass: null, note: '' }, { key: 'action', label: '画面内容', hint: 'y', expected: '奔跑', pass: null, note: '' }], hint: '打勾' } },
    buildGuide: (payload) => { calls.push({ type: 'buildGuide', payload }); return { fields: [{ key: 'style', label: '整体风格', value: '电影感写实', source: 'suggested', hint: 'x' }], draft: { style: '电影感写实' }, missing: [], toConfirm: ['style'], next: '确认后建项目' } },
    analyzeShot: async (name, shot, input) => {
      calls.push({ type: 'analyzeShot', name, shot, input })
      if (input && Array.isArray(input.observed) && input.observed.length) {
        return { ok: true, mode: 'report', shot, report: { pass: false, serious: 1, diffs: [{ key: 'action', label: '动作', expected: '奔跑', observed: '站立', severity: 'serious' }], improvements: ['把动作写清楚'], revisedShot: { action: '开头即奔跑' } }, issues: ['动作：站立'] }
      }
      return { ok: true, mode: 'frames', shot, frames: ['C:\\f\\f01.png', 'C:\\f\\f02.png'], framesDir: 'C:\\f', duration: 8, checklist: [{ key: 'action', label: '动作', expected: '奔跑' }], hint: '看图后回填 observed' }
    },
    sketchShot: async (name, shot, options) => {
      calls.push({ type: 'sketchShot', name, shot, options })
      return { ok: true, videoName: name, shot, path: 'C:\\p\\Storyboards\\Shot3-1.png', prompt: 'SKETCH-PROMPT', model: 'gpt-image-2.5', size: '1536x1024', source: 'test', capability: { capable: true, models: ['gpt-image-2.5'] } }
    },
    confirmPlan: async (name, meta) => { calls.push({ type: 'confirmPlan', name, meta }); return { ok: true, videoName: name, planConfirmed: true, planConfirmedAt: 12345, shots: 2 } },
    saveShotVersion: async (name, shot, input) => { calls.push({ type: 'saveShotVersion', name, shot, input }); return { shot, version: 'V0.1', videoPath: 'C:\\v\\Video\\Shot1\\V0.1\\video.mp4' } },
    saveFullVideo: async (name, input) => { calls.push({ type: 'saveFullVideo', name, input }); return { videoPath: 'C:\\v\\Video\\FullVideo\\video.mp4' } },
    ...overrides
  }
  return { projects, calls }
}

function makeTool(overrides) {
  const { projects, calls } = makeProjects(overrides)
  const tool = createVideoProjectTool({ defineTool: fakeDefineTool, service: { projects } })
  return { tool, calls }
}

test('工具定义：名称、action 枚举、输出 schema、渲染函数', () => {
  const { tool } = makeTool()
  assert.equal(tool.name, TOOL_NAME)
  assert.equal(tool.parameters.action.required, true)
  assert.deepEqual(tool.parameters.action.enum, TOOL_ACTIONS)
  assert.ok(tool.output.schema.properties.project)
  assert.equal(typeof tool.output.render, 'function')
})

test('create：调用 createProject 并返回项目', async () => {
  const { tool, calls } = makeTool()
  const result = await tool.execute({ action: 'create', project: '新片', payload: '{"style":"电影感"}' })
  assert.equal(result.ok, true)
  assert.equal(calls[0].type, 'create')
  assert.equal(calls[0].name, '新片')
  assert.equal(calls[0].input.style, '电影感')
})

test('list：不需要 project', async () => {
  const { tool } = makeTool()
  const result = await tool.execute({ action: 'list' })
  assert.equal(result.ok, true)
  assert.equal(result.projects.length, 1)
})

test('缺少 project / 非法 payload → 失败', async () => {
  const { tool } = makeTool()
  const missing = await tool.execute({ action: 'get' })
  assert.equal(missing.ok, false)
  assert.equal(missing.error.code, 'ValidationError')
  const badJson = await tool.execute({ action: 'create', project: 'x', payload: '{bad' })
  assert.equal(badJson.ok, false)
  const notObject = await tool.execute({ action: 'create', project: 'x', payload: '[]' })
  assert.equal(notObject.ok, false)
})

test('build-prompt：生成提示词并回传 shot', async () => {
  const { tool, calls } = makeTool()
  const result = await tool.execute({ action: 'build-prompt', project: 'p', shot: 'Shot2', payload: '{"extra":"更暖"}' })
  assert.equal(result.ok, true)
  assert.equal(calls[0].type, 'buildShotPrompt')
  assert.equal(calls[0].shot, 'Shot2')
  assert.equal(calls[0].extra, '更暖')
  assert.equal(result.prompt, 'PROMPT-Shot2')
  assert.equal(result.params.model, 'm1')
  assert.equal(result.checks.length, 1)
})

test('review：无 checks 时先生成验收表，带 checks 再提交', async () => {
  const { tool, calls } = makeTool()
  const template = await tool.execute({ action: 'review', project: 'p', shot: 'Shot1' })
  assert.equal(template.ok, true)
  assert.equal(calls[0].type, 'reviewTemplate')
  assert.equal(template.checks.length, 2)
  assert.equal(template.checks[0].pass, null)
  const submit = await tool.execute({ action: 'review', project: 'p', shot: 'Shot1', payload: JSON.stringify({ version: 'V0.1', checks: [{ key: 'shotType', pass: true, note: '对' }, { key: 'action', pass: false, note: '没跑' }] }) })
  assert.equal(submit.ok, true)
  assert.equal(submit.passed, false)
  assert.ok(submit.checks.length === 2)
  const call = calls.filter((item) => item.type === 'saveShotReview')[0]
  assert.equal(call.input.checks.length, 2)
})

test('save-version：透传 sourcePath/taskId', async () => {
  const { tool, calls } = makeTool()
  const result = await tool.execute({ action: 'save-version', project: 'p', shot: 'Shot1', sourcePath: 'C:\\v\\a.mp4', taskId: 'sd_1' })
  assert.equal(result.ok, true)
  assert.equal(calls[0].type, 'saveShotVersion')
  assert.equal(calls[0].input.sourcePath, 'C:\\v\\a.mp4')
  assert.equal(calls[0].input.taskId, 'sd_1')
  assert.equal(result.version, 'V0.1')
})

test('review：记录验收通过/不通过', async () => {
  const { tool, calls } = makeTool()
  const pass = await tool.execute({ action: 'review', project: 'p', shot: 'Shot1', payload: '{"version":"V0.1","pass":true}' })
  assert.equal(pass.ok, true)
  assert.equal(calls[0].type, 'saveShotReview')
  assert.equal(calls[0].input.pass, true)
  const fail = await tool.execute({ action: 'review', project: 'p', shot: 'Shot1', payload: '{"version":"V0.1","pass":false,"issues":["人物不一致"]}' })
  assert.equal(fail.ok, true)
  const reviewCalls = calls.filter((item) => item.type === 'saveShotReview')
  assert.equal(reviewCalls.length, 2)
  assert.equal(reviewCalls[1].input.pass, false)
  assert.ok(String(fail.message).includes('不通过'))
})

test('save-version 缺少 sourcePath → 失败', async () => {
  const { tool } = makeTool()
  const result = await tool.execute({ action: 'save-version', project: 'p', shot: 'Shot1' })
  assert.equal(result.ok, false)
})

test('full-video：保存全片', async () => {
  const { tool, calls } = makeTool()
  const result = await tool.execute({ action: 'full-video', project: 'p', sourcePath: 'C:\\v\\full.mp4' })
  assert.equal(result.ok, true)
  assert.equal(calls[0].type, 'saveFullVideo')
  assert.equal(result.ok, true)
})

test('未知 action → 失败', async () => {
  const { tool } = makeTool()
  const result = await tool.execute({ action: 'nope', project: 'p' })
  assert.equal(result.ok, false)
})

test('render：成功/失败/项目摘要/prompt', () => {
  const success = renderToolResult({}, {
    ok: true,
    action: 'build-prompt',
    message: '已生成完整提示词',
    prompt: '【人物卡】小橘',
    project: { videoName: '片', characters: [{ name: 'a' }], shots: [{ id: 'Shot1' }], video: { shots: [{ versions: [{ version: 'V0.1' }] }] }, dir: 'C:\\p' }
  })
  assert.ok(success[0].text.includes('片'))
  assert.ok(success[0].text.includes('【人物卡】小橘'))
  const fail = renderToolResult({}, { ok: false, action: 'get', error: { code: 'NotFound', message: '项目不存在' } })
  assert.ok(fail[0].text.includes('项目不存在'))
})


test('guide：需求表格（不需要 project）', async () => {
  const { tool, calls } = makeTool()
  const result = await tool.execute({ action: 'guide', payload: '{"request":"雨夜女孩撑伞"}' })
  assert.equal(result.ok, true)
  assert.equal(calls[0].type, 'buildGuide')
  assert.equal(result.fields.length, 1)
  assert.deepEqual(result.toConfirm, ['style'])
})

test('save-shots：返回分镜自查 warnings', async () => {
  const { tool } = makeTool()
  const result = await tool.execute({ action: 'save-shots', project: 'p', payload: JSON.stringify({ shots: [{ id: 'Shot1', action: '走路', shotType: '中景', movement: '固定', duration: 4 }] }) })
  assert.equal(result.ok, true)
  assert.ok(Array.isArray(result.warnings))
  assert.equal(result.warnings.length, 1)
  assert.ok(result.message.includes('自查'))
  assert.equal(result.stats.totalDuration, 8)
})

test('analyze：抽帧模式与报告模式', async () => {
  const { tool, calls } = makeTool()
  const frames = await tool.execute({ action: 'analyze', project: 'p', shot: 'Shot1', payload: '{"videoPath":"C:\\\\v.mp4"}' })
  assert.equal(frames.ok, true)
  assert.equal(frames.mode, 'frames')
  assert.equal(frames.frames.length, 2)
  const report = await tool.execute({ action: 'analyze', project: 'p', shot: 'Shot1', payload: JSON.stringify({ observed: [{ key: 'action', pass: false, note: '站立' }] }) })
  assert.equal(report.ok, true)
  assert.equal(report.mode, 'report')
  assert.equal(report.report.pass, false)
  assert.ok(report.improvements.length > 0)
  assert.equal(calls.filter((item) => item.type === 'analyzeShot').length, 2)
})

test('analyze 缺少 shot → 失败', async () => {
  const { tool } = makeTool()
  const result = await tool.execute({ action: 'analyze', project: 'p' })
  assert.equal(result.ok, false)
})

test('location：查询与修改保存位置', async () => {
  const { tool, calls } = makeTool()
  const info = await tool.execute({ action: 'location' })
  assert.equal(info.ok, true)
  assert.equal(info.storageRoot, 'C:\\default\\video-project')
  const target = JSON.stringify({ storageRoot: 'D:\\我的视频项目' })
  const updated = await tool.execute({ action: 'location', payload: target })
  assert.equal(updated.ok, true)
  const updates = calls.filter((item) => item.type === 'updateLocation')
  assert.equal(updates.length, 1)
  assert.equal(updated.storageRoot, 'D:\\我的视频项目')
})

test('工具描述包含「生成前/重生成前给用户确认」约束', () => {
  assert.ok(TOOL_DESCRIPTION.includes('生成前把 prompt/params/分镜摘要给用户确认'))
  assert.ok(TOOL_DESCRIPTION.includes('先把修改方案给用户确认'))
  assert.ok(TOOL_DESCRIPTION.includes('不要直接重抽'))
})


test('sketch：生成单镜头草图并返回图片路径（输入只用分镜脚本，不接受 note）', async () => {
  const { tool, calls } = makeTool()
  const result = await tool.execute({ action: 'sketch', project: '项目', shot: 'Shot3' })
  assert.equal(result.ok, true)
  assert.equal(calls[0].type, 'sketchShot')
  assert.equal(calls[0].shot, 'Shot3')
  assert.deepEqual(calls[0].options, {})
  assert.equal(result.image, 'C:\\p\\Storyboards\\Shot3-1.png')
  assert.equal(result.shot, 'Shot3')
  assert.match(result.message, /草图/)
  assert.match(result.hint, /相机位置/)
  const blocks = renderToolResult({ action: 'sketch' }, result)
  assert.match(blocks[0].text, /草图文件/)
})

test('sketch：不传 shot 时按全部分镜每镜头一张；能力关闭时返回可读错误', async () => {
  const { tool } = makeTool({ sketchShot: async () => ({ ok: true, shot: 'Shot1', path: 'C:\\p\\s1.png', images: [{ shot: 'Shot1', path: 'C:\\p\\s1.png' }, { shot: 'Shot2', path: 'C:\\p\\s2.png' }], model: 'gpt-image-2.5', size: '1536x1024', capability: { capable: true } }) })
  let result = await tool.execute({ action: 'sketch', project: '项目' })
  assert.equal(result.ok, true)
  assert.equal(result.images.length, 2)
  assert.match(result.message, /2 张/)
  const failing = makeTool({
    sketchShot: async () => {
      const error = new Error('当前没有可用的图像生成能力，草图分镜功能已关闭：x')
      error.code = 'IMAGE_GEN_UNAVAILABLE'
      throw error
    }
  })
  result = await failing.tool.execute({ action: 'sketch', project: '项目', shot: 'Shot1' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'IMAGE_GEN_UNAVAILABLE')
})

test('confirm-plan：记录用户确认并返回 planConfirmed', async () => {
  const { tool, calls } = makeTool()
  const result = await tool.execute({ action: 'confirm-plan', project: '项目' })
  assert.equal(result.ok, true)
  assert.equal(result.planConfirmed, true)
  assert.equal(calls[0].type, 'confirmPlan')
  assert.equal(calls[0].name, '项目')
})

test('未确认时 build-prompt：把 PLAN_NOT_CONFIRMED 错误返回给模型（要求先确认）', async () => {
  const err = new Error('分镜/人物卡还没有经过用户确认')
  err.code = 'PLAN_NOT_CONFIRMED'
  const { tool } = makeTool({
    buildShotPrompt: async () => { throw err }
  })
  const result = await tool.execute({ action: 'build-prompt', project: '项目', shot: 'Shot1' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'PLAN_NOT_CONFIRMED')
})
