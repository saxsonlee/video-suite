/**
 * dsh-seedance-studio — CLI 国际化（零依赖）。
 *
 * 语言包在 platforms/cli/locale/{zh,en}.js（扁平 key，两套 key 集一致）。
 * 语言检测优先级：显式 --lang > LC_ALL/LC_MESSAGES/LANG 环境变量 > 默认中文。
 * @module dsh-seedance-studio/platforms/cli/lib/i18n
 */
import zh from '../locale/zh.js'
import en from '../locale/en.js'

/** 语言包集合。 */
const DICTS = { zh, en }
/** 支持的语言。 */
export const LANGUAGES = ['zh', 'en']
let current = 'zh'

/** 显式设置语言（无效值忽略）。 */
export function setLanguage(language) {
  if (DICTS[language]) current = language
  return current
}

/** 当前语言。 */
export function getLanguage() {
  return current
}

/**
 * 检测语言。
 * @param {object} [options] - { lang: 显式语言, env: 环境变量对象 }。
 */
export function detectLanguage(options = {}) {
  const explicit = options.lang === undefined || options.lang === null ? '' : String(options.lang).trim().toLowerCase()
  if (explicit) {
    if (explicit.startsWith('zh')) return 'zh'
    if (explicit.startsWith('en')) return 'en'
    return current
  }
  const env = options.env || process.env
  const raw = String(env.LC_ALL || env.LC_MESSAGES || env.LANG || '').trim().toLowerCase()
  if (!raw) return 'zh'
  if (raw.startsWith('zh')) return 'zh'
  if (raw.startsWith('en')) return 'en'
  return 'zh'
}

/** 简单插值：{name} → params.name。 */
export function format(template, params) {
  const text = String(template)
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
}

/** 翻译（缺 key 时返回 key 本身，便于发现遗漏）。 */
export function t(key, params) {
  const dict = DICTS[current] || DICTS.zh
  const text = dict[key]
  if (text === undefined) return key
  return params ? format(text, params) : text
}

/** 两套语言包的 key 集是否一致（测试/自检用）。 */
export function dictionaryKeys() {
  const sets = {}
  for (const [language, dict] of Object.entries(DICTS)) sets[language] = Object.keys(dict).sort()
  return sets
}
