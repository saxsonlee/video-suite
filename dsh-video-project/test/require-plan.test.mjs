import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateRequirePlan, evaluateRequirePlanWithProjects, hasVideoProjectCall, userWantsSkipPlan, buildPlanDenial, SKIP_PLAN_PHRASES } from '../server/require-plan.js'

function mockAgent({ events = [], lastUserText = '' } = {}) {
  const sessionEvents = events.map((event) => ({ ...event }))
  if (lastUserText) {
    sessionEvents.push({ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: lastUserText }] } })
  }
  return { session: { snapshotEvents: () => sessionEvents } }
}

test('evaluateRequirePlan：非生成动作/其他工具不拦截', () => {
  assert.equal(evaluateRequirePlan(null).block, false)
  assert.equal(evaluateRequirePlan({ name: 'video_project', arguments: {} }).block, false)
  assert.equal(evaluateRequirePlan({ name: 'seedance_video', arguments: { action: 'history' } }).block, false)
  assert.equal(evaluateRequirePlan({ name: 'seedance_video', arguments: JSON.stringify({ action: 'models' }) }).block, false)
})

test('evaluateRequirePlan：本会话没走视频项目时拦截 generate', () => {
  const agent = mockAgent({ lastUserText: '帮我做个 12 秒技能演示视频' })
  const verdict = evaluateRequirePlan({ name: 'seedance_video', arguments: { action: 'generate' }, agent })
  assert.equal(verdict.block, true)
  assert.match(verdict.reason, /视频项目/)
  const denail = buildPlanDenial(verdict.reason)
  assert.match(denail, /video_project/)
  assert.match(denail, /跳过项目/)
})

test('evaluateRequirePlan：本会话调用过 video_project 时放行', () => {
  const agent = mockAgent({ events: [{ type: 'tool/call', data: { name: 'video_project' } }], lastUserText: '生成吧' })
  assert.equal(hasVideoProjectCall(agent), true)
  assert.equal(evaluateRequirePlan({ name: 'seedance_video', arguments: { action: 'generate' }, agent }).block, false)
})

test('evaluateRequirePlan：用户明确说跳过项目时放行', () => {
  assert.equal(userWantsSkipPlan(mockAgent({ lastUserText: '这个简单，跳过项目直接生成' })), true)
  const agent = mockAgent({ lastUserText: '不用分镜，直接做' })
  assert.equal(evaluateRequirePlan({ name: 'seedance_video', arguments: { action: 'generate' }, agent }).block, false)
})

test('evaluateRequirePlan：无法读取会话状态时放行（不误伤）', () => {
  const weird = { name: 'seedance_video', arguments: { action: 'generate' }, agent: { session: { snapshotEvents: () => { throw new Error('boom') } } } }
  assert.equal(evaluateRequirePlan(weird).block, false)
  assert.equal(hasVideoProjectCall({ session: { snapshotEvents: () => { throw new Error('boom') } } }), null)
})

test('SKIP_PLAN_PHRASES 覆盖常见跳过说法', () => {
  assert.ok(SKIP_PLAN_PHRASES.includes('跳过项目'))
  assert.ok(SKIP_PLAN_PHRASES.includes('直接生成'))
})


test('evaluateRequirePlanWithProjects：有已确认项目时放行（run_code 内层调用不会误判）', async () => {
  const projects = {
    listProjects: async () => [{ name: 'p1' }],
    getProject: async () => ({ planConfirmed: true })
  }
  const exec = { name: 'seedance_video', arguments: { action: 'generate' }, agent: mockAgent({ lastUserText: '生成吧' }) }
  assert.equal((await evaluateRequirePlanWithProjects(exec, projects)).block, false)
})

test('evaluateRequirePlanWithProjects：项目未确认时拦截', async () => {
  const projects = {
    listProjects: async () => [{ name: 'p1' }],
    getProject: async () => ({ planConfirmed: false })
  }
  const exec = { name: 'seedance_video', arguments: { action: 'generate' }, agent: mockAgent({ lastUserText: '生成吧' }) }
  assert.equal((await evaluateRequirePlanWithProjects(exec, projects)).block, true)
})

test('evaluateRequirePlanWithProjects：无项目时拦截', async () => {
  const projects = { listProjects: async () => [], getProject: async () => ({}) }
  const exec = { name: 'seedance_video', arguments: { action: 'generate' }, agent: mockAgent({ lastUserText: '生成吧' }) }
  assert.equal((await evaluateRequirePlanWithProjects(exec, projects)).block, true)
})

test('evaluateRequirePlanWithProjects：无法读取项目状态时放行（不误伤）', async () => {
  const projects = { listProjects: async () => { throw new Error('boom') }, getProject: async () => ({}) }
  const exec = { name: 'seedance_video', arguments: { action: 'generate' }, agent: mockAgent({ lastUserText: '生成吧' }) }
  assert.equal((await evaluateRequirePlanWithProjects(exec, projects)).block, false)
})

test('evaluateRequirePlanWithProjects：用户说跳过项目时放行', async () => {
  const projects = { listProjects: async () => [], getProject: async () => ({}) }
  const exec = { name: 'seedance_video', arguments: { action: 'generate' }, agent: mockAgent({ lastUserText: '跳过项目直接生成' }) }
  assert.equal((await evaluateRequirePlanWithProjects(exec, projects)).block, false)
})
