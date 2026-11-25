/**
 * 三形态 i18n 测试：语言包完整性、翻译行为、独立版静态页不再硬编码中文。
 *  - CLI：platforms/cli/locale/{zh,en}.js（ESM default export）
 *  - 前端插件：platforms/dsh-plugin/frontend/src/i18n/dictionaries.js（bundle 片段，new Function 加载）
 *  - 独立 Web：platforms/web/public/i18n.js（浏览器全局 IIFE，沙箱加载）
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zhDict from '../platforms/cli/locale/zh.js'
import enDict from '../platforms/cli/locale/en.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CJK = /[\u4e00-\u9fa5]/
const FRONTEND_DICT = path.join(ROOT, 'platforms', 'dsh-plugin', 'frontend', 'src', 'i18n', 'dictionaries.js')
const WEB_I18N = path.join(ROOT, 'platforms', 'web', 'public', 'i18n.js')
const WEB_HTML = path.join(ROOT, 'platforms', 'web', 'public', 'index.html')

function keySet(dict) {
  return new Set(Object.keys(dict))
}

function loadFrontendDict() {
  const code = fs.readFileSync(FRONTEND_DICT, 'utf8')
  const factory = new Function(
    code + '\nreturn { DICT_ZH, DICT_EN, dictionaryKeyDiff, translate, installTranslator, formatTemplate };'
  )
  return factory()
}

const LOCALES_DIR = path.join(ROOT, 'platforms', 'web', 'public', 'locales')

/** 读取 locales 目录下全部语言包（动态 i18n 数据源）。 */
function readLocaleFiles() {
  const files = fs.readdirSync(LOCALES_DIR).filter((name) => /\.json$/i.test(name) && name.toLowerCase() !== 'languages.json')
  const locales = []
  const dictionaries = {}
  for (const name of files) {
    const code = name.replace(/\.json$/i, '')
    dictionaries[code] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, name), 'utf8'))
    locales.push(code)
  }
  return { locales, dictionaries }
}

function loadWebI18n() {
  const code = fs.readFileSync(WEB_I18N, 'utf8')
  const win = {}
  const storage = {
    map: {},
    getItem(name) { return Object.prototype.hasOwnProperty.call(this.map, name) ? this.map[name] : null },
    setItem(name, value) { this.map[name] = String(value) },
    removeItem(name) { delete this.map[name] }
  }
  win.localStorage = storage
  const nav = { language: 'en-US' }
  win.navigator = nav
  // 面板单文件会内联注入语言包；测试模拟同样的注入
  win.__SD_LOCALES__ = readLocaleFiles()
  new Function('window', 'navigator', 'localStorage', code)(win, nav, storage)
  return { win, storage }
}

test('CLI 语言包：zh/en key 集一致且值非空', () => {
  const zhKeys = keySet(zhDict)
  const enKeys = keySet(enDict)
  assert.ok(zhKeys.size > 100, 'CLI zh 字典 key 太少: ' + zhKeys.size)
  assert.equal(enKeys.size, zhKeys.size, 'CLI en/zh key 数不一致')
  for (const key of zhKeys) assert.ok(enKeys.has(key), 'CLI en 缺少 key: ' + key)
  for (const key of enKeys) assert.ok(zhKeys.has(key), 'CLI zh 缺少 key: ' + key)
  for (const key of zhKeys) assert.equal(typeof zhDict[key], 'string', 'CLI zh 值类型错误: ' + key)
  for (const key of enKeys) assert.equal(typeof enDict[key], 'string', 'CLI en 值类型错误: ' + key)
})

test('前端字典：zh/en key 集一致、en 值无中文、数量足够', () => {
  const { DICT_ZH, DICT_EN, dictionaryKeyDiff } = loadFrontendDict()
  const diff = dictionaryKeyDiff()
  assert.deepEqual(diff.missingEn, [], '前端 en 缺少 zh 的 key')
  assert.deepEqual(diff.missingZh, [], '前端 zh 缺少 en 的 key')
  assert.ok(Object.keys(DICT_ZH).length >= 300, '前端 zh 字典 key 太少: ' + Object.keys(DICT_ZH).length)
  assert.equal(Object.keys(DICT_EN).length, Object.keys(DICT_ZH).length)
  const cjk = Object.entries(DICT_EN).filter(([, value]) => CJK.test(value))
  assert.deepEqual(cjk.map(([key]) => key), [], '前端 en 字典仍含中文')
  const empty = Object.entries(DICT_ZH).filter(([, value]) => !String(value).trim())
  assert.deepEqual(empty.map(([key]) => key), [], '前端 zh 字典存在空值')
})

test('前端字典：translate 兜底中文并跟随宿主 locale', () => {
  const { DICT_ZH, DICT_EN, translate, installTranslator } = loadFrontendDict()
  assert.equal(translate('status.queued'), DICT_ZH['status.queued'])
  assert.equal(translate('no.such.key'), 'no.such.key')
  installTranslator((key) => (DICT_EN[key] === undefined ? key : DICT_EN[key]))
  assert.equal(translate('status.queued'), DICT_EN['status.queued'])
  assert.notEqual(translate('status.queued'), DICT_ZH['status.queued'])
  installTranslator(null)
  assert.equal(translate('status.queued'), DICT_ZH['status.queued'])
})

test('前端字典：formatTemplate 插值', () => {
  const { formatTemplate } = loadFrontendDict()
  assert.equal(formatTemplate('共 {total} 个', { total: 3 }), '共 3 个')
  assert.equal(formatTemplate('{a}-{b}', { a: 'x', b: 'y' }), 'x-y')
  assert.equal(formatTemplate('keep {missing}'), 'keep {missing}')
})

test('动态 i18n：语言清单来自语言文件（新增语言自动出现）', () => {
  const { win, storage } = loadWebI18n()
  const i18n = win.SeedanceI18n
  assert.ok(i18n, 'window.SeedanceI18n 未导出')
  const { locales } = readLocaleFiles()
  assert.deepEqual(i18n.LANGUAGES.slice().sort(), locales.slice().sort(), '语言清单应与 locales 目录一致')
  assert.ok(i18n.LANGUAGES.indexOf('zh') !== -1)
  assert.ok(i18n.LANGUAGES.indexOf('en') !== -1)
  assert.ok(i18n.LANGUAGES.indexOf('ru') !== -1, '俄语应出现在语言清单里')
  // navigator.language=en-US → 默认英文；文案为英文
  assert.equal(i18n.getLanguage(), 'en', 'navigator.language=en-US 应检测为 en')
  const enTitle = i18n.t('page.title')
  assert.ok(!CJK.test(enTitle), 'en 文案含中文: ' + enTitle)
  // 俄语切换
  i18n.setLanguage('ru')
  assert.equal(i18n.getLanguage(), 'ru')
  assert.equal(storage.map['seedance.web.lang'], 'ru')
  assert.ok(!CJK.test(i18n.t('page.title')), '俄语文案不应是中文')
  assert.match(i18n.t('page.title'), /[А-я]/)
  // 中文
  i18n.setLanguage('zh')
  assert.equal(i18n.getLanguage(), 'zh')
  assert.ok(CJK.test(i18n.t('page.title')), 'zh 文案应为中文')
  assert.equal(storage.map['seedance.web.lang'], 'zh')
  // 插值
  assert.equal(i18n.t('duration.seconds', { value: 5 }), '5 秒')
  // 语言自称
  assert.equal(i18n.languageName('ru'), 'Русский')
})

test('动态 i18n：所有语言文件 key 集一致（含 lang.name）', () => {
  const { locales, dictionaries } = readLocaleFiles()
  assert.ok(locales.length >= 3, '语言包太少: ' + locales.join(','))
  const base = Object.keys(dictionaries.zh || {})
  assert.ok(base.length >= 70, 'zh 语言包 key 太少: ' + base.length)
  for (const lang of locales) {
    const keys = Object.keys(dictionaries[lang] || {})
    assert.equal(keys.length, base.length, lang + ' 语言包 key 数量与 zh 不一致')
    const missing = base.filter((key) => keys.indexOf(key) === -1)
    assert.deepEqual(missing, [], lang + ' 语言包缺少 key')
    assert.equal(typeof dictionaries[lang]['lang.name'], 'string', lang + ' 缺少 lang.name')
    const empty = keys.filter((key) => !String(dictionaries[lang][key] || '').trim())
    assert.deepEqual(empty, [], lang + ' 语言包存在空值')
  }
})

test('独立版静态页：引用 i18n.js 且不硬编码中文 UI 文案', () => {
  const html = fs.readFileSync(WEB_HTML, 'utf8')
  assert.match(html, /src="i18n\.js"/, '静态页未引用 i18n.js')
  assert.ok((html.match(/data-i18n=/g) || []).length >= 20, 'data-i18n 属性太少')
  assert.ok((html.match(/data-i18n-placeholder=/g) || []).length >= 1, 'data-i18n-placeholder 属性太少')
  assert.ok((html.match(/data-i18n-title=/g) || []).length >= 1, 'data-i18n-title 属性太少')
  assert.match(html, /SeedanceI18n/, '静态页脚本未使用 I18n')
  const forbidden = ['生成参数', '还没有生成记录', '提示词', '分辨率', '画面比例', '生成音频', 'AI 水印', '历史记录', '再创作']
  for (const word of forbidden) {
    assert.equal(html.includes(word), false, '静态页仍含中文 UI 文案: ' + word)
  }
})

test('独立版静态页：i18n key 全部存在于字典', () => {
  const html = fs.readFileSync(WEB_HTML, 'utf8')
  const { dictionaries } = readLocaleFiles()
  const zhKeys = new Set(Object.keys(dictionaries.zh || {}))
  let m
  const used = new Set()
  for (const re of [/data-i18n(?:-placeholder|-title)?="([^"]+)"/g, /\bT\('([^']+)'/g, /\bI18n\.t\('([^']+)'/g]) {
    const r = new RegExp(re.source, 'g')
    while ((m = r.exec(html))) used.add(m[1])
  }
  // 动态拼接的 key 前缀（status.* / mode.* 由运行时拼出，静态检查跳过）
  const missing = [...used].filter((key) => key !== 'status.' && key !== 'mode.' && !zhKeys.has(key))
  assert.deepEqual(missing, [], '静态页引用了字典中不存在的 key')
  assert.ok(used.size >= 60, '静态页 i18n key 使用过少: ' + used.size)
})

test('独立后端 serve.js：终端语言包 zh/en key 集一致', () => {
  const file = path.join(ROOT, 'platforms', 'web', 'serve.js')
  const code = fs.readFileSync(file, 'utf8')
  const zhStart = code.indexOf('  zh: {')
  const enStart = code.indexOf('  en: {')
  assert.ok(zhStart !== -1 && enStart !== -1, 'serve.js 未找到 zh/en MESSAGES 段')
  const zhPart = code.slice(zhStart, enStart)
  const enPart = code.slice(enStart)
  const keysOf = (part) => {
    const out = new Set()
    const re = /'([a-zA-Z][a-zA-Z0-9_.-]*)':/g
    let match
    while ((match = re.exec(part))) out.add(match[1])
    return out
  }
  const zhKeys = keysOf(zhPart)
  const enKeys = keysOf(enPart)
  assert.ok(zhKeys.size >= 25, 'serve.js zh 文案太少: ' + zhKeys.size)
  assert.deepEqual([...zhKeys].filter((key) => !enKeys.has(key)), [], 'serve.js en 缺少 key')
  assert.deepEqual([...enKeys].filter((key) => !zhKeys.has(key)), [], 'serve.js zh 缺少 key')
  const cjk = [...enKeys].filter((key) => {
    const m = new RegExp("'" + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':\\s*'([^']*)'").exec(enPart)
    return m && CJK.test(m[1])
  })
  assert.deepEqual(cjk, [], 'serve.js en 文案仍含中文')
})
