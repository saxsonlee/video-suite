#!/usr/bin/env node
/**
 * check-client-bundle.mjs — 静态校验 dsh-video-project 客户端 bundle。
 *
 * 校验内容：__ModuleLoader__ 外壳、id、exports（apply/inject）、必需服务、
 * 面板为 iframe 壳（承载共享 SPA /api/video-project/panel），apply 注册侧边栏入口、主面板与设置分区。
 * 用法：node scripts/check-client-bundle.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const BUNDLE = path.join(ROOT, 'platforms', 'dsh-plugin', 'frontend', 'index.js')
const EXPECTED_ID = 'dsh-video-project'
const REQUIRED_SERVICES = ['slots', 'locale']

const failures = []
function check(name, fn) {
  try { fn(); console.log('  ✓ ' + name) } catch (error) {
    failures.push(name + ': ' + (error && error.message ? error.message : String(error)))
    console.log('  ✗ ' + name + ' — ' + (error && error.message ? error.message : String(error)))
  }
}
function assert(condition, message) { if (!condition) throw new Error(message || 'assertion failed') }
assert.ok = (condition, message) => assert(condition, message)
assert.equal = (actual, expected, message) => { if (actual !== expected) throw new Error((message || '值不相等') + '：' + JSON.stringify(actual) + ' !== ' + JSON.stringify(expected)) }

const source = fs.readFileSync(BUNDLE, 'utf8')

let captured = null
const fakeWindow = { __ModuleLoader__: { load: (mod) => { captured = mod } } }
const stubReact = {
  createElement: () => null,
  Fragment: Symbol('Fragment'),
  useState: () => [undefined, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useRef: () => ({ current: null })
}
const context = vm.createContext({
  window: fakeWindow,
  console,
  fetch: () => Promise.reject(new Error('not used')),
  document: undefined,
  require: (name) => { assert(name === 'react', 'unexpected require: ' + name); return stubReact }
})

check('bundle 可被 vm 解析并注册 __ModuleLoader__', () => {
  new vm.Script(source, { filename: 'frontend/index.js' }).runInContext(context)
  assert(captured, '没有调用 window.__ModuleLoader__.load')
  assert.equal(captured.id, EXPECTED_ID)
  assert.equal(typeof captured.factory, 'function')
})

check('exports：apply/inject/NS', () => {
  const exports = captured.factory((name) => stubReact)
  assert.equal(typeof exports.apply, 'function', '缺少 apply')
  assert.ok(Array.isArray(exports.inject), 'inject 必须是数组')
  for (const service of REQUIRED_SERVICES) assert.ok(exports.inject.includes(service), '缺少服务 ' + service)
  assert.equal(exports.NS, 'videoProject')
})

check('apply：注册 sidebar.panellist、main（项目列表）与 settings.section（草图设置）', () => {
  const exports = captured.factory((name) => stubReact)
  const registrations = []
  let effects = 0
  const fakeCtx = {
    effect: (fn) => { effects += 1; fn() },
    locale: { register: () => {}, bind: () => (key) => key },
    slots: {
      inject: (name, fn) => fn(),
      register: (options, component) => { registrations.push({ options, component }); return () => {} }
    }
  }
  exports.apply(fakeCtx)
  assert.ok(effects >= 1, '应注入样式 effect')
  assert.equal(registrations.length, 3, '应注册 3 个槽位（侧边栏 + 主面板 + 设置分区），实际 ' + registrations.length)
  const names = registrations.map((item) => item.options.name)
  assert.ok(names.includes('sidebar.panellist'), '缺少 sidebar.panellist')
  assert.ok(names.includes('main'), '缺少 main')
  const main = registrations.find((item) => item.options.name === 'main')
  assert.equal(main.options.key, 'video-project')
  assert.equal(typeof main.component, 'function')
  const section = registrations.find((item) => item.options.name === 'settings.section')
  assert.ok(section, '缺少 settings.section（设置分区）')
  assert.equal(section.options.id, 'video-project')
  assert.equal(typeof section.component, 'function')
})

check('面板外壳：iframe 指向共享 SPA 路由（/api/video-project/panel）', () => {
  assert.ok(source.includes('/api/video-project/panel'), '面板应使用共享 SPA 路由 /api/video-project/panel')
  assert.ok(source.includes('iframe'), '面板应通过 iframe 承载共享 SPA')
  assert.ok(source.includes("view === 'settings'") || source.includes("view: 'settings'"), '应支持设置视图参数')
})

if (failures.length) {
  console.error('\n客户端 bundle 校验失败：' + failures.length + ' 项')
  process.exit(1)
}
console.log('\n客户端 bundle 校验通过')
