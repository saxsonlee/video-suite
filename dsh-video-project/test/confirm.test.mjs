/**
 * dsh-video-project — 草图费用确认闸门测试
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSketchDenial,
  evaluateSketchConfirmation,
  isSketchConfirmationMessage,
  latestUserMessage,
  textOfContent,
  evaluateCharacterSheetConfirmation,
  isCharacterSheetConfirmationMessage,
  buildCharacterSheetDenial
} from '../server/confirm.js'

/** 构造 fake agent：一条真实用户消息 */
function fakeAgent(text) {
  return {
    session: {
      snapshotEvents() {
        return [{ type: 'user/message', data: { source: { kind: 'user' }, content: text } }]
      }
    }
  }
}

test('textOfContent：支持字符串与 content block 数组', () => {
  assert.equal(textOfContent('画一下草图'), '画一下草图')
  assert.equal(textOfContent([{ type: 'text', text: '画' }, { type: 'image' }, { type: 'text', text: '草图' }]), '画 草图')
  assert.equal(textOfContent(null), '')
})

test('latestUserMessage：跳过系统注入消息，取最后一条真实用户消息', () => {
  const agent = {
    session: {
      snapshotEvents() {
        return [
          { type: 'user/message', data: { source: { kind: 'user' }, content: '第一句' } },
          { type: 'user/message', data: { source: { kind: 'runtime-context' }, content: '注入' } },
          { type: 'user/message', data: { source: { kind: 'user' }, content: '画一下镜头3草图' } }
        ]
      }
    }
  }
  const message = latestUserMessage(agent)
  assert.equal(textOfContent(message.data.content), '画一下镜头3草图')
  assert.equal(latestUserMessage({}), null)
})

test('isSketchConfirmationMessage：主动要求画图/明确同意放行；拒绝词优先', () => {
  assert.equal(isSketchConfirmationMessage('画一下镜头 3 的草图'), true)
  assert.equal(isSketchConfirmationMessage('可以'), true)
  assert.equal(isSketchConfirmationMessage('好，画吧'), true)
  assert.equal(isSketchConfirmationMessage('先别画，让我看看分镜'), false)
  assert.equal(isSketchConfirmationMessage('等等，不要画'), false)
  assert.equal(isSketchConfirmationMessage(''), false)
})

test('evaluateSketchConfirmation：没有确认/没有消息一律拦截', () => {
  assert.equal(evaluateSketchConfirmation(fakeAgent('画一下镜头3的草图')).allow, true)
  assert.equal(evaluateSketchConfirmation(fakeAgent('这个分镜再改改')).allow, false)
  assert.equal(evaluateSketchConfirmation(fakeAgent('')).allow, false)
  assert.equal(evaluateSketchConfirmation({}).allow, false)
})

test('buildSketchDenial：说明要先告知费用、镜头、用途并等确认', () => {
  const text = buildSketchDenial('最后一条用户消息没有明确同意画草图')
  assert.match(text, /费用/)
  assert.match(text, /确认/)
})


test('character-sheet 确认：用户说「生成下三视图吧」允许', () => {
  const agent = { session: { snapshotEvents: () => ([{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: '生成下三视图吧' }] } }]) } }
  const verdict = evaluateCharacterSheetConfirmation(agent)
  assert.equal(verdict.allow, true)
})

test('character-sheet 确认：含三视图/生成/出图等词允许', () => {
  for (const text of ['帮我生成三视图', '出个三视图图片', '画一下人物三视图', '三视图来一张', '可以，生成吧']) {
    const agent = { session: { snapshotEvents: () => ([{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } }]) } }
    assert.equal(evaluateCharacterSheetConfirmation(agent).allow, true, text)
  }
  assert.equal(isCharacterSheetConfirmationMessage('生成下三视图吧'), true)
})

test('character-sheet 确认：明确拒绝/无关消息拦截', () => {
  const denyTexts = ['先别生成', '等一下再生成', '三视图先看看方案', '今天天气不错']
  for (const text of denyTexts) {
    const agent = { session: { snapshotEvents: () => ([{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] } }]) } }
    assert.equal(evaluateCharacterSheetConfirmation(agent).allow, false, text)
  }
  assert.equal(evaluateCharacterSheetConfirmation({ session: { snapshotEvents: () => [] } }).allow, false)
})

test('buildCharacterSheetDenial 文案区分草图', () => {
  const text = buildCharacterSheetDenial('测试')
  assert.match(text, /三视图/)
  assert.match(text, /按次/)
  assert.doesNotMatch(text, /黑白线稿/)
})

test('sketch 确认：「生成分镜参考图 / 出草图」等说法视为用户同意', () => {
  for (const text of ['生成分镜参考图', '帮我出一下草图', '生成草图看看', '画个线稿', '参考图来一张']) {
    const agent = fakeAgent([{ type: 'text', text }])
    assert.equal(evaluateSketchConfirmation(agent).allow, true, text)
  }
  assert.equal(isSketchConfirmationMessage('生成分镜参考图'), true)
})
