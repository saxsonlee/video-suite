import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildChecklist, compareWithObserved, resolveFfmpeg, extractFrames, probeDuration } from '../server/analyze.js'

const FFMPEG = process.env.VIDEO_PROJECT_FFMPEG
  || 'C:\\\\Users\\\\Administrator\\\\.dsh\\\\dsh-runtimes\\\\dsh-primary-runtime\\\\dependencies\\\\python\\\\Lib\\\\site-packages\\\\imageio_ffmpeg\\\\binaries\\\\ffmpeg-win-x86_64-v9.0.2.exe'
const HAS_FFMPEG = fs.existsSync(FFMPEG)

const characters = [{ name: '阿澈', appearance: '银发、黑色风衣、身高偏瘦' }]
const shot = {
  id: 'Shot1',
  action: '撑伞在雨中奔跑，回头看向镜头',
  shotType: '全景→中景',
  camera: '略低机位/过肩',
  movement: '侧面跟拍，末尾小幅上摇',
  scene: '雨夜街道，积水倒影',
  lighting: '冷蓝雨夜 + 暖黄路灯'
}

test('buildChecklist：人物卡外观 + 分镜各字段都成为检查项', () => {
  const list = buildChecklist({ characters, shot })
  const keys = list.map((item) => item.key)
  assert.ok(keys.includes('character:阿澈'))
  assert.ok(keys.includes('action'))
  assert.ok(keys.includes('composition'))
  assert.ok(keys.includes('movement'))
  assert.ok(keys.includes('scene'))
  assert.ok(keys.includes('environment')) // 环境一致性检查项
  assert.ok(keys.includes('lighting'))
  assert.ok(keys.includes('continuity'))
  assert.ok(list.find((item) => item.key === 'character:阿澈').expected.includes('银发'))
})

test('buildChecklist：人物卡 6 栏 → 逐栏检查项（可逐项定位）', () => {
  const list = buildChecklist({
    characters: [{ name: '阿橘', age: '3 岁', hair: '橘色短毛', signature: '右耳缺一角' }],
    shot
  })
  const keys = list.map((item) => item.key)
  assert.ok(keys.includes('character:阿橘:age'))
  assert.ok(keys.includes('character:阿橘:hair'))
  assert.ok(keys.includes('character:阿橘:signature'))
  assert.ok(!keys.includes('character:阿橘'))
  assert.ok(list.find((item) => item.key === 'character:阿橘:hair').expected === '橘色短毛')
})

test('compareWithObserved：全部通过 → pass；有失败 → 差异/建议/修订分镜', () => {
  const checklist = buildChecklist({ characters, shot })
  const pass = compareWithObserved({
    checklist, shot,
    observed: checklist.map((item) => ({ key: item.key, pass: true, note: '符合' }))
  })
  assert.equal(pass.pass, true)
  assert.equal(pass.diffs.length, 0)
  assert.equal(pass.revisedShot, null)

  const fail = compareWithObserved({
    checklist, shot,
    observed: [
      { key: 'character:阿澈', pass: false, note: '第 3 帧是黑色短发' },
      { key: 'action', pass: false, note: '全程站立没有奔跑' },
      { key: 'lighting', pass: true, note: '符合' }
    ]
  })
  assert.equal(fail.pass, false)
  assert.equal(fail.serious, 2)
  assert.ok(fail.diffs.some((item) => item.key === 'character:阿澈' && item.severity === 'serious'))
  assert.ok(fail.improvements.length > 0)
  assert.ok(fail.improvements.some((item) => item.includes('角色外观')))
  assert.ok(fail.revisedShot && fail.revisedShot.action.includes('开头'))
})

test('resolveFfmpeg：环境变量指定优先', () => {
  if (!HAS_FFMPEG) return
  assert.equal(resolveFfmpeg({ VIDEO_PROJECT_FFMPEG: FFMPEG, PATH: '' }), FFMPEG)
  const fallback = resolveFfmpeg({ PATH: '' })
  if (fallback) assert.ok(/ffmpeg(\.exe)?$/i.test(fallback) && fs.existsSync(fallback))
  else assert.equal(fallback, '')
})

test('extractFrames + probeDuration：用真实 ffmpeg 抽帧', { skip: !HAS_FFMPEG }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-project-frames-'))
  const video = path.join(dir, 'test.mp4')
  const made = spawnSync(FFMPEG, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=2', '-pix_fmt', 'yuv420p', video], { encoding: 'utf8', timeout: 120000, windowsHide: true })
  assert.equal(made.status, 0, String(made.stderr || '').slice(-500))
  const duration = probeDuration(FFMPEG, video)
  assert.ok(duration > 0)
  const outDir = path.join(dir, 'frames')
  const result = extractFrames({ videoPath: video, outDir, count: 4, ffmpegPath: FFMPEG })
  assert.equal(result.frames.length, 4)
  for (const frame of result.frames) assert.ok(fs.existsSync(frame) && fs.statSync(frame).size > 0)
})
