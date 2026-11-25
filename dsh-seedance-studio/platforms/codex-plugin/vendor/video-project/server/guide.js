/**
 * dsh-video-project — 需求引导（把不完整的视频需求补全成一张可确认的表格）。
 *
 * 纯函数、只依赖 node：从用户一句话里识别已给的信息（时长/比例/风格/角色/场景/光线…），
 * 其余字段给「建议默认值」，让智能体把表格展示给用户逐项确认/修改，再写入人物卡与分镜。
 * @module dsh-video-project/server/guide
 */

/** 引导字段定义（顺序即表格顺序）。 */
export const GUIDE_FIELDS = [
  { key: 'subject', label: '主题/主体', hint: '视频里最重要的主体，或一句话主题' },
  { key: 'hook', label: '开头钩子（前 3 秒）', hint: '第一个镜头怎么抓住观众：直接进画面/抛出问题/一个强动作' },
  { key: 'style', label: '整体风格', hint: '写实 / 日系动画 / 3D / 赛博朋克 / 水墨 / 胶片', options: ['电影感写实', '日系赛璐璐动画', '3D 渲染', '赛博朋克', '水墨', '胶片质感'] },
  { key: 'ratio', label: '画面比例', hint: '竖屏 9:16 / 横屏 16:9 / 正方形 1:1', options: ['9:16', '16:9', '1:1'] },
  { key: 'duration', label: '时长（秒）', hint: '单个镜头建议 4~8 秒', options: [4, 5, 6, 8] },
  { key: 'shotCount', label: '镜头数', hint: '一镜一动作，复杂故事拆成多个镜头', options: [1, 2, 3, 4] },
  { key: 'characters', label: '角色外观（6 栏）', hint: '每个角色：年龄/长相/发型发色/服装/体型/标志性特征，逐栏写' },
  { key: 'script', label: '文字脚本（台词/旁白）', hint: '说什么：口播/旁白/对白；没有台词就写「无台词」' },
  { key: 'scene', label: '场景', hint: '地点/时间/天气/环境细节' },
  { key: 'mood', label: '情绪基调', hint: '安静 / 温暖 / 忧郁 / 紧张 / 浪漫 / 热血', options: ['安静', '温暖', '忧郁', '紧张', '浪漫', '热血'] },
  { key: 'lighting', label: '光线/色调', hint: '例如：冷蓝雨夜 + 暖黄路灯' },
  { key: 'sound', label: '音效/音乐', hint: '例如：雨声/环境音/轻音乐' }
]

const STYLE_RULES = [
  ['赛博朋克', ['赛博朋克', 'cyberpunk', '霓虹']],
  ['日系赛璐璐动画', ['日系', '赛璐璐', '动漫', '动画', '二次元']],
  ['水墨', ['水墨', '国风']],
  ['胶片质感', ['胶片', '复古']],
  ['3D 渲染', ['3d', '三维']]
]
const CHARACTER_WORDS = ['女孩', '男孩', '少女', '少年', '女人', '男人', '老人', '小孩', '孩子', '猫', '狗', '机器人', '宇航员', '医生', '学生', '战士', '骑士']
const SCENE_WORDS = ['雨夜', '雨中', '街道', '海边', '海边', '森林', '城市', '房间', '咖啡馆', '地铁', '车站', '沙漠', '山顶', '湖边', '校园', '古镇']
const MOOD_RULES = [
  ['忧郁', ['忧郁', '孤独', '伤感', '难过']],
  ['浪漫', ['浪漫', '甜蜜', '恋爱']],
  ['紧张', ['紧张', '悬疑', '刺激']],
  ['热血', ['热血', '燃']],
  ['温暖', ['温暖', '治愈', '温馨']],
  ['安静', ['安静', '宁静', '平静']]
]
const LIGHTING_WORDS = ['雨夜', '夜晚', '黄昏', '日落', '清晨', '霓虹', '烛光', '暖黄', '冷蓝', '阳光']

function text(value) {
  return String(value === undefined || value === null ? '' : value).trim()
}

function detectStyle(request) {
  const lower = request.toLowerCase()
  for (const [value, words] of STYLE_RULES) {
    if (words.some((word) => lower.includes(word))) return value
  }
  return ''
}

function detectRatio(request) {
  if (/\b9\s*[:：]\s*16\b|竖屏|竖版/.test(request)) return '9:16'
  if (/\b16\s*[:：]\s*9\b|横屏|横版/.test(request)) return '16:9'
  if (/\b1\s*[:：]\s*1\b|方形/.test(request)) return '1:1'
  return ''
}

function detectDuration(request) {
  const match = /(\d+(?:\.\d+)?)\s*(?:秒|s\b|sec)/i.exec(request)
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? Math.min(Math.round(value), 60) : 0
}

function detectShotCount(request) {
  const match = /(\d+)\s*个?\s*镜头/.exec(request)
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) && value > 0 ? Math.min(Math.round(value), 20) : 0
}

function detectCharacters(request) {
  const names = []
  for (const word of CHARACTER_WORDS) {
    if (request.includes(word) && names.indexOf(word) === -1) names.push(word)
  }
  return names.map((name) => ({ name, age: '', face: '', hair: '', costume: '', body: '', signature: '' }))
}

function detectScene(request) {
  const words = SCENE_WORDS.filter((word) => request.includes(word))
  return words.slice(0, 3).join('、')
}

function detectMood(request) {
  for (const [value, words] of MOOD_RULES) {
    if (words.some((word) => request.includes(word))) return value
  }
  return ''
}

function detectLighting(request) {
  const words = LIGHTING_WORDS.filter((word) => request.includes(word))
  return words.slice(0, 3).join('、')
}

function detectSound(request) {
  if (/雨/.test(request)) return '雨声 + 环境音'
  if (/海/.test(request)) return '海浪声 + 环境音'
  if (/夜/.test(request)) return '夜晚环境音（虫鸣/风声）'
  return ''
}

/** 把用户原话补全成「表格 + 待确认清单」。 */
export function buildGuide(input = {}) {
  const payload = input && typeof input === 'object' ? input : {}
  const request = text(payload.request || payload.prompt || payload.text)
  const prefs = payload.preferences && typeof payload.preferences === 'object' ? payload.preferences : {}
  const detected = {
    subject: request.replace(/^(请|帮我|给我|我要|我想|做一个|拍一个|生成一个|生成一段|做一段|拍一段)[，,。\s]*/u, '').trim().slice(0, 80),
    hook: '',
    script: '',
    style: detectStyle(request),
    ratio: detectRatio(request),
    duration: detectDuration(request),
    shotCount: detectShotCount(request),
    characters: detectCharacters(request),
    scene: detectScene(request),
    mood: detectMood(request),
    lighting: detectLighting(request),
    sound: detectSound(request)
  }
  const defaults = {
    subject: request ? detected.subject : '',
    hook: '开头 3 秒直接进入画面/动作，不铺垫',
    style: '电影感写实',
    ratio: '9:16',
    duration: 8,
    shotCount: 2,
    characters: [],
    script: '无台词（用画面和音效表达）',
    scene: '',
    mood: '',
    lighting: '',
    sound: '环境音'
  }
  const fields = []
  const missing = []
  const toConfirm = []
  for (const def of GUIDE_FIELDS) {
    const fromUser = detected[def.key]
    const hasUser = Array.isArray(fromUser) ? fromUser.length > 0 : Boolean(fromUser)
    let value = hasUser ? fromUser : (prefs[def.key] !== undefined ? prefs[def.key] : defaults[def.key])
    let source = hasUser ? 'user' : 'suggested'
    if (def.key === 'characters') {
      if (!hasUser) { value = []; source = 'missing'; missing.push('characters') }
      else {
        const needAppearance = fromUser.every((item) => !item.appearance && !item.age && !item.face && !item.hair && !item.costume && !item.body && !item.signature)
        if (needAppearance) { source = 'user'; toConfirm.push('characters') }
      }
    } else if (!hasUser && prefs[def.key] === undefined && (value === '' || value === undefined)) {
      source = 'missing'
      missing.push(def.key)
    } else if (!hasUser) {
      toConfirm.push(def.key)
    }
    fields.push({ key: def.key, label: def.label, value, source, hint: def.hint, options: def.options })
  }
  return {
    request,
    fields,
    draft: {
      subject: fields.find((item) => item.key === 'subject').value,
      hook: fields.find((item) => item.key === 'hook').value,
      style: fields.find((item) => item.key === 'style').value,
      ratio: fields.find((item) => item.key === 'ratio').value,
      duration: fields.find((item) => item.key === 'duration').value,
      shotCount: fields.find((item) => item.key === 'shotCount').value,
      characters: fields.find((item) => item.key === 'characters').value,
      script: fields.find((item) => item.key === 'script').value,
      scene: fields.find((item) => item.key === 'scene').value,
      mood: fields.find((item) => item.key === 'mood').value,
      lighting: fields.find((item) => item.key === 'lighting').value,
      sound: fields.find((item) => item.key === 'sound').value
    },
    missing,
    toConfirm,
    next: '把 fields 以表格展示给用户（suggested=建议默认值，可直接采用；missing=必须补全），用户确认或修改后：action=create → save-characters（角色外观按 6 栏：年龄/长相/发型/服装/体型/标志性特征）→ save-shots（分镜按 6 栏：镜号/景别/画面内容/台词字幕/运镜/时长）。'
  }
}
