/**
 * dsh-video-project — 禁止脚本绕行画分镜的闸门测试
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  argumentText,
  buildScriptDrawingDenial,
  detectScriptDrawing,
  looksLikeScriptDrawing
} from '../server/script-guard.js'

test('looksLikeScriptDrawing：同时命中「画分镜意图 + 绘图库」才算', () => {
  assert.equal(looksLikeScriptDrawing('用 PIL 画分镜草图'), true)
  assert.equal(looksLikeScriptDrawing('from PIL import ImageDraw 画分镜'), true)
  assert.equal(looksLikeScriptDrawing('分镜表：Shot1 全景 5 秒'), false)
  assert.equal(looksLikeScriptDrawing('用 PIL 处理头像尺寸'), false)
  assert.equal(looksLikeScriptDrawing(''), false)
})

test('detectScriptDrawing：write 写 .py 绘图脚本拦截；写文字分镜不拦', () => {
  const blocked = detectScriptDrawing({
    name: 'write',
    arguments: JSON.stringify({ file_path: 'C:\\x\\draw-storyboard.py', content: 'from PIL import ImageDraw\n# 画分镜草图' })
  })
  assert.equal(blocked.block, true)
  assert.match(blocked.reason, /分镜/)

  const textOnly = detectScriptDrawing({
    name: 'write',
    arguments: JSON.stringify({ file_path: 'C:\\x\\storyboard.md', content: '分镜表：Shot1 全景 5 秒' })
  })
  assert.equal(textOnly.block, false)

  const nonScript = detectScriptDrawing({
    name: 'write',
    arguments: JSON.stringify({ file_path: 'C:\\x\\notes.txt', content: '用 PIL 画分镜草图' })
  })
  assert.equal(nonScript.block, false)
})

test('detectScriptDrawing：命令类工具命中即拦', () => {
  const blocked = detectScriptDrawing({ name: 'pwsh', arguments: JSON.stringify({ command: 'python draw-storyboard.py' }) })
  // 命令里没出现分镜词 → 不拦（避免误伤普通 python 命令）
  assert.equal(blocked.block, false)
  const blocked2 = detectScriptDrawing({ name: 'pwsh', arguments: JSON.stringify({ command: 'python draw.py  # 用 PIL 画分镜草图' }) })
  assert.equal(blocked2.block, true)
})

test('detectScriptDrawing：不相关工具/空参数不拦', () => {
  assert.equal(detectScriptDrawing({ name: 'read', arguments: '{"file_path":"x"}' }).block, false)
  assert.equal(detectScriptDrawing({}).block, false)
  assert.equal(detectScriptDrawing(null).block, false)
})

test('argumentText：对象/字符串/空值', () => {
  assert.equal(argumentText({ a: 1 }), '{"a":1}')
  assert.equal(argumentText('raw'), 'raw')
  assert.equal(argumentText(undefined), '')
})

test('buildScriptDrawingDenial：说明正确做法（confirm-plan + sketch）', () => {
  const text = buildScriptDrawingDenial('检测到写脚本画分镜')
  assert.match(text, /confirm-plan/)
  assert.match(text, /sketch/)
})
