/**
 * confirm.js 单测：生成前确认判定（肯定词/拒绝词、用户消息提取、拦截说明）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildConfirmDenial,
  evaluateGenerateConfirmation,
  isConfirmationMessage,
  latestUserMessage,
  textOfContent
} from '../server/confirm.js'

function fakeAgent(text) {
  return {
    session: {
      snapshotEvents: () => [
        { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } }
      ]
    }
  }
}

test('isConfirmationMessage：肯定词允许，拒绝词优先拦截', () => {
  assert.equal(isConfirmationMessage('可以，按这个生成'), true)
  assert.equal(isConfirmationMessage('好的，开始吧'), true)
  assert.equal(isConfirmationMessage('按这个方案来'), true)
  assert.equal(isConfirmationMessage('先给我方案，别生成'), false)
  assert.equal(isConfirmationMessage('这个镜头怎么改？'), false)
  assert.equal(isConfirmationMessage('不要生成，先看看'), false)
  assert.equal(isConfirmationMessage(''), false)
})

test('textOfContent：字符串/数组/空值', () => {
  assert.equal(textOfContent('你好'), '你好')
  assert.equal(textOfContent([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]), 'a b')
  assert.equal(textOfContent(null), '')
  assert.equal(textOfContent(123), '')
})

test('latestUserMessage：只认真实用户消息，跳过系统注入', () => {
  const agent = {
    session: {
      snapshotEvents: () => [
        { type: 'user/message', data: { source: { kind: 'user' }, content: '确认' } },
        { type: 'user/message', data: { source: { kind: 'runtime-context' }, content: '系统上下文' } },
        { type: 'assistant/message', data: {} }
      ]
    }
  }
  assert.equal(latestUserMessage(agent).data.content, '确认')
  assert.equal(latestUserMessage({}), null)
  assert.equal(latestUserMessage({ session: {} }), null)
})

test('evaluateGenerateConfirmation：有确认才允许；没确认/无消息/空文字一律拦截', () => {
  assert.equal(evaluateGenerateConfirmation(fakeAgent('可以，按这个生成')).allow, true)
  const denied = evaluateGenerateConfirmation(fakeAgent('这个视频不对，你偷偷改了分镜'))
  assert.equal(denied.allow, false)
  assert.ok(denied.reason.includes('没有明确确认'))
  assert.equal(evaluateGenerateConfirmation(fakeAgent('')).allow, false)
  assert.equal(evaluateGenerateConfirmation({}).allow, false)
})

test('buildConfirmDenial：说明要先给方案、列出改动点、等明确确认', () => {
  const text = buildConfirmDenial('最后一条用户消息没有明确确认生成')
  assert.ok(text.includes('确认'))
  assert.ok(text.includes('费用'))
  assert.ok(text.includes('改动点'))
  assert.ok(text.includes('generate/recreate'))
})
