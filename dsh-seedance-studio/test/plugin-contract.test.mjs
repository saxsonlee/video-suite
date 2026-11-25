import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginDir = path.join(ROOT, 'platforms', 'dsh-plugin')

test('package: 客户端依赖与入口声明完整（含右侧栏提供者包）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './platforms/dsh-plugin/frontend/index.js')
  const inject = pkg.dsh.client.inject
  assert.ok(Array.isArray(inject), 'dsh.client.inject 必须是数组')
  for (const name of [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-ui-sidebar-right',
  ]) {
    assert.ok(inject.includes(name), 'dsh.client.inject 缺少 ' + name)
  }
})

test('client: bundle 声明 sidebarRightTabs 注入并注册右侧栏 tab', () => {
  const bundle = fs.readFileSync(path.join(pluginDir, 'frontend', 'index.js'), 'utf8')
  assert.ok(bundle.includes("'slots', 'locale', 'layout', 'sessions', 'sidebarRightTabs'"), 'bundle inject 缺少 sidebarRightTabs')
  assert.ok(bundle.includes('ctx.sidebarRightTabs'), 'bundle 未读取 sidebarRightTabs 服务')
  assert.ok(bundle.includes('sidebar.right.pane.tab'), 'bundle 未注册 sidebar.right.pane.tab slot')
})

test('client: sidebar-tab 源码注册 guide 卡片与侧栏窗口体', () => {
  const source = fs.readFileSync(path.join(pluginDir, 'frontend', 'src', 'app', 'sidebar-tab.js'), 'utf8')
  assert.ok(source.includes("SIDEBAR_TAB_ID = 'dsh-seedance-studio/studio'"), '缺少 SIDEBAR_TAB_ID')
  assert.ok(source.includes("SIDEBAR_TAB_KIND = 'seedance-studio'"), '缺少 SIDEBAR_TAB_KIND')
  assert.ok(source.includes("name: 'sidebar.right.pane.tab'"), '缺少窗口体 slot 注册')
  assert.ok(source.includes('guide: ['), '缺少 guide 卡片')
  assert.ok(source.includes('SidebarStudioBody'), '缺少窗口体组件')
  const register = fs.readFileSync(path.join(pluginDir, 'frontend', 'src', 'app', 'register.js'), 'utf8')
  assert.ok(register.includes('registerRightSidebar(ctx, t, safeEffect)'), 'apply 未调用 registerRightSidebar')
})

test('client: 对话联动（打开会话/发送到对话）片段与构建清单', () => {
  const bridge = fs.readFileSync(path.join(pluginDir, 'frontend', 'src', 'core', 'chat-bridge.js'), 'utf8')
  assert.ok(bridge.includes('function openSessionChat'), '缺少 openSessionChat')
  assert.ok(bridge.includes('function sendRecordToChat'), '缺少 sendRecordToChat')
  assert.ok(bridge.includes('chat.continueMessage'), '缺少继续分析消息模板')
  assert.ok(bridge.includes("'uiWorkspace'"), '缺少 uiWorkspace 调用')
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-client.mjs'), 'utf8')
  assert.ok(build.includes("'core/chat-bridge.js'"), 'SEGMENT_ORDER 缺少 chat-bridge')
})
