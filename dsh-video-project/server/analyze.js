/**
 * dsh-video-project — 生成后分析（抽帧 + 需求对比 + 改进建议）。
 *
 * 分工：
 *   - 本模块负责：找 ffmpeg、抽帧、从人物卡/分镜生成检查清单、把智能体的逐帧观察汇总成差异与建议；
 *   - 智能体负责：逐帧看图（视觉理解），把每项 pass/note 回填。
 * 不依赖任何视频生成插件：输入只有本地视频文件路径。
 * @module dsh-video-project/server/analyze
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_ROOT = path.resolve(HERE, '..')

/** 查找 ffmpeg：环境变量 > 插件 vendor/ffmpeg > 系统 PATH。 */
export function resolveFfmpeg(env = process.env) {
  const candidates = []
  for (const key of ['VIDEO_PROJECT_FFMPEG', 'FFMPEG_PATH']) {
    const value = env && env[key] ? String(env[key]).trim() : ''
    if (value) candidates.push(value)
  }
  candidates.push(path.join(PLUGIN_ROOT, 'vendor', 'ffmpeg', 'ffmpeg.exe'))
  candidates.push(path.join(PLUGIN_ROOT, 'vendor', 'ffmpeg', 'ffmpeg'))
  const pathDirs = String(env && env.PATH ? env.PATH : '').split(path.delimiter).filter(Boolean)
  for (const dir of pathDirs) {
    candidates.push(path.join(dir, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'))
  }
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
    } catch (error) {
      // 忽略不可读候选
    }
  }
  return ''
}

/** 用 ffmpeg 读取视频时长（秒）；读不到返回 0。 */
export function probeDuration(ffmpegPath, videoPath) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', videoPath], { encoding: 'utf8', timeout: 30000, windowsHide: true })
  const output = String(result.stderr || '') + String(result.stdout || '')
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(output)
  if (!match) return 0
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

function ffmpegError(message, code) {
  const error = new Error(message)
  error.code = code || 'FFMPEG_ERROR'
  return error
}

/**
 * 从视频里均匀抽帧（PNG）。返回 { ok, frames, duration, fps } 或抛错。
 */
/** 用 ffmpeg 读取视频宽高（像素）；读不到返回 null。 */
export function probeVideoSize(ffmpegPath, videoPath) {
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', videoPath], { encoding: 'utf8', timeout: 30000, windowsHide: true })
  const output = String(result.stderr || '') + String(result.stdout || '')
  const match = /Video: .*?, (\d{2,5})x(\d{2,5})/.exec(output)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return null
  return { width, height }
}

export function extractFrames(options = {}) {
  const ffmpegPath = options.ffmpegPath || resolveFfmpeg()
  if (!ffmpegPath) throw ffmpegError('未找到 ffmpeg：请设置环境变量 VIDEO_PROJECT_FFMPEG，或运行 scripts/fetch-ffmpeg.mjs 下载到 vendor/ffmpeg/', 'FFMPEG_NOT_FOUND')
  const videoPath = String(options.videoPath || '').trim()
  if (!videoPath || !fs.existsSync(videoPath)) throw ffmpegError('视频文件不存在：' + videoPath, 'VIDEO_NOT_FOUND')
  const outDir = String(options.outDir || '').trim()
  if (!outDir) throw ffmpegError('缺少抽帧输出目录 outDir', 'INVALID_FRAME_OUTPUT')
  const count = Math.min(Math.max(Number(options.count) || 8, 2), 24)
  fs.mkdirSync(outDir, { recursive: true })
  const duration = probeDuration(ffmpegPath, videoPath)
  const fps = duration > 0 ? Math.min(5, Math.max(0.1, count / duration)) : 1
  const pattern = path.join(outDir, 'f%02d.png')
  const result = spawnSync(ffmpegPath, [
    '-hide_banner', '-y', '-i', videoPath,
    '-vf', 'fps=' + fps.toFixed(3) + ',scale=640:-1',
    '-frames:v', String(count), pattern
  ], { encoding: 'utf8', timeout: 180000, windowsHide: true })
  const files = fs.readdirSync(outDir).filter((name) => /^f\d+\.png$/i.test(name)).sort()
  if (!files.length) {
    const tail = String(result.stderr || '').trim().split('\n').slice(-4).join('\n')
    throw ffmpegError('抽帧失败：' + (tail || 'ffmpeg 没有输出帧'), 'FFMPEG_FAILED')
  }
  return {
    ok: true,
    ffmpegPath,
    duration: Math.round(duration * 100) / 100,
    fps: Math.round(fps * 1000) / 1000,
    frames: files.map((name) => path.join(outDir, name))
  }
}

/** 把人物卡 + 分镜拆成可逐项判定的检查清单。 */
export function buildChecklist(options = {}) {
  const characters = Array.isArray(options.characters) ? options.characters : []
  const shot = options.shot && typeof options.shot === 'object' ? options.shot : {}
  const items = []
  const CHARACTER_FIELDS = [
    ['age', '年龄'],
    ['face', '长相'],
    ['hair', '发型/发色'],
    ['costume', '服装'],
    ['body', '体型'],
    ['signature', '标志性特征']
  ]
  for (const char of characters) {
    const structured = CHARACTER_FIELDS.filter(([key]) => String((char && char[key]) || '').trim())
    if (structured.length) {
      for (const [key, label] of structured) {
        items.push({
          key: 'character:' + char.name + ':' + key,
          category: 'character',
          label: '角色「' + char.name + '」' + label,
          expected: String(char[key])
        })
      }
    } else {
      items.push({
        key: 'character:' + char.name,
        category: 'character',
        label: '角色「' + char.name + '」外观',
        expected: char.appearance || '（未写外观）'
      })
    }
  }
  if (shot.action) items.push({ key: 'action', category: 'action', label: '动作与画面内容', expected: shot.action })
  if (shot.shotType || shot.camera) {
    items.push({ key: 'composition', category: 'composition', label: '景别/机位', expected: [shot.shotType, shot.camera].filter(Boolean).join('；') })
  }
  if (shot.movement) items.push({ key: 'movement', category: 'composition', label: '镜头运动', expected: shot.movement })
  if (shot.scene) items.push({ key: 'scene', category: 'scene', label: '场景', expected: shot.scene })
  if (shot.lighting) items.push({ key: 'lighting', category: 'lighting', label: '光线/色调', expected: shot.lighting })
  const environment = [shot.environment, shot.scene, shot.lighting].filter((item) => String(item || '').trim()).join('；')
  if (environment) items.push({ key: 'environment', category: 'environment', label: '环境/时间（全片一致）', expected: environment })
  items.push({ key: 'continuity', category: 'continuity', label: '与设定/上一镜衔接', expected: '人物外观、画风与人物卡一致；动作与视线连贯' })
  return items
}

const SEVERITY = {
  character: 'serious',
  action: 'serious',
  composition: 'normal',
  scene: 'minor',
  lighting: 'minor',
  continuity: 'normal'
}

const IMPROVEMENTS = {
  character: [
    '在提示词里把角色外观写得更具体：发型/发色、服装、体型、年龄、标志性特征各写一句',
    '保持 seed、模型、比例、时长不变，只修改人物外观描述再生成一次',
    '若仍不一致：先生成一个角色特写镜头作为参考图，再用首帧/参考图模式生成正式镜头'
  ],
  action: [
    '把动作拆成「一个镜头一个动作」，并在提示词里明确动作的起止（如：开头即开始奔跑，持续到镜头结束）',
    '检查分镜 action 是否写了动作细节与表情；补齐后再生成',
    '若动作幅度太大容易变形，改为更简单、更可控的动作再试'
  ],
  composition: [
    '把景别变化写清楚（如：全景→中景→手部特写），并注明机位高度与角度',
    '镜头运动写明轨迹与速度（如：侧面跟拍，末尾小幅上摇）'
  ],
  scene: [
    '场景写具体：地点、时间、天气、环境细节各写一句',
    '把关键道具写进画面内容（如：透明伞、路灯、积水倒影）'
  ],
  lighting: [
    '在提示词里固定光线与色调（如：暖黄路灯 + 冷蓝雨夜），不要只写「夜晚」',
    '避免同一镜头里出现互相矛盾的光源描述'
  ],
  continuity: [
    '多镜头项目：用上一镜的尾帧作为下一镜首帧（首尾帧模式），保证人物与画风连贯',
    '同一项目的所有镜头沿用同一套 model/resolution/ratio/seed 参数'
  ]
}

function buildRevisedShot(shot, diffs) {
  const revised = { ...shot }
  const notes = []
  const categories = new Set(diffs.map((item) => item.category))
  if (categories.has('action') && shot.action) {
    revised.action = shot.action + '（动作在镜头开头 1 秒内进入，保持到镜头结束；表情与动作细节写清楚）'
  }
  if (categories.has('lighting') && shot.lighting) {
    revised.lighting = shot.lighting + '（固定冷暖对比，不要随机变化）'
  }
  if (categories.has('character')) {
    notes.push('角色外观以人物卡为准，生成时逐条对照')
  }
  if (categories.has('continuity')) {
    notes.push('使用上一镜尾帧作为首帧，保持人物与画风一致')
  }
  if (notes.length) revised.notes = [shot.notes, notes.join('；')].filter(Boolean).join('；')
  return revised
}

/**
 * 把智能体的逐项观察与检查清单对比，生成报告。
 * observed: [{ key, pass, note }]（key 来自 checklist）
 */
export function compareWithObserved(options = {}) {
  const checklist = Array.isArray(options.checklist) ? options.checklist : []
  const shot = options.shot && typeof options.shot === 'object' ? options.shot : {}
  const observed = Array.isArray(options.observed) ? options.observed : []
  const observedMap = new Map()
  for (const item of observed) {
    if (item && typeof item === 'object' && item.key) observedMap.set(String(item.key), item)
  }
  const diffs = []
  const passed = []
  for (const item of checklist) {
    const obs = observedMap.get(item.key)
    if (!obs) {
      diffs.push({ ...item, observed: '', severity: 'minor', note: '未提供观察，按未验证处理' })
      continue
    }
    if (obs.pass === true) {
      passed.push({ ...item, note: String(obs.note || '') })
    } else {
      diffs.push({ ...item, observed: String(obs.note || ''), severity: SEVERITY[item.category] || 'normal', note: String(obs.note || '') })
    }
  }
  const improvements = []
  for (const diff of diffs) {
    for (const text of IMPROVEMENTS[diff.category] || []) {
      if (improvements.indexOf(text) === -1) improvements.push(text)
    }
  }
  const serious = diffs.filter((item) => item.severity === 'serious').length
  const pass = diffs.length === 0
  return {
    pass,
    serious,
    checks: passed,
    diffs,
    improvements,
    revisedShot: diffs.length ? buildRevisedShot(shot, diffs) : null
  }
}
