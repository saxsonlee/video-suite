import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGuide, GUIDE_FIELDS } from '../server/guide.js'

test('guide：识别用户原话里的时长/比例/风格/角色/场景', () => {
  const result = buildGuide({ request: '做一个 8 秒竖屏的日系动画：雨夜街头，一个女孩撑伞奔跑' })
  const byKey = Object.fromEntries(result.fields.map((item) => [item.key, item]))
  assert.equal(byKey.duration.value, 8)
  assert.equal(byKey.duration.source, 'user')
  assert.equal(byKey.ratio.value, '9:16')
  assert.equal(byKey.ratio.source, 'user')
  assert.equal(byKey.style.value, '日系赛璐璐动画')
  assert.equal(byKey.style.source, 'user')
  assert.equal(byKey.characters.value.length, 1)
  assert.equal(byKey.characters.value[0].name, '女孩')
  assert.ok(!byKey.characters.value[0].appearance)
  assert.equal(byKey.characters.value[0].age, '')
  assert.equal(byKey.characters.value[0].hair, '')
  assert.ok(result.toConfirm.includes('characters'))
  assert.ok(!result.missing.includes('characters'))
  assert.ok(result.draft.style)
  assert.equal(result.fields.length, GUIDE_FIELDS.length)
  assert.equal(byKey.hook.source, 'suggested')
  assert.ok(byKey.hook.value.includes('3 秒'))
  assert.ok(byKey.script.value.includes('无台词') || byKey.script.source !== 'missing')
})

test('guide：未提供的信息给建议默认值 / 缺失项', () => {
  const result = buildGuide({ request: '一段海边日落的风景' })
  const byKey = Object.fromEntries(result.fields.map((item) => [item.key, item]))
  assert.equal(byKey.duration.source, 'suggested')
  assert.equal(byKey.ratio.source, 'suggested')
  assert.ok(result.toConfirm.includes('duration'))
  assert.ok(result.toConfirm.includes('style'))
  assert.ok(result.missing.includes('characters') || byKey.characters.source === 'missing')
})

test('guide：preferences 覆盖建议值', () => {
  const result = buildGuide({ request: '海边日落', preferences: { ratio: '16:9', duration: 5, style: '胶片质感' } })
  const byKey = Object.fromEntries(result.fields.map((item) => [item.key, item]))
  assert.equal(byKey.ratio.value, '16:9')
  assert.equal(byKey.duration.value, 5)
  assert.equal(byKey.style.value, '胶片质感')
})
