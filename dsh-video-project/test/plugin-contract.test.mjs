/**
 * 插件包契约：package.json、cordis.patch.yml、plugin.js 入口声明齐全（静态检查，不依赖 DSH 运行时）。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('package.json：name/main/exports/dsh.bundle', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'dsh-video-project')
  assert.equal(pkg.main, 'platforms/dsh-plugin/plugin.js')
  assert.equal(pkg.dsh.bundle.patch, './platforms/dsh-plugin/cordis.patch.yml')
  assert.ok(fs.existsSync(path.join(packageDir, pkg.main)))
  assert.ok(fs.existsSync(path.join(packageDir, 'platforms/dsh-plugin/cordis.patch.yml')))
})

test('plugin.js：导出 name/apply/inject，注册 video_project 工具', () => {
  const text = fs.readFileSync(path.join(packageDir, 'platforms/dsh-plugin/plugin.js'), 'utf8')
  assert.ok(text.includes("export const name = 'video-project'"))
  assert.ok(text.includes('export function apply(ctx'))
  assert.ok(text.includes("export const inject = ['tools']"))
  assert.ok(text.includes('ctx.tools.register(tool)'))
  assert.ok(text.includes('createProjects'))
})

test('cordis.patch.yml：insert 本插件', () => {
  const text = fs.readFileSync(path.join(packageDir, 'platforms/dsh-plugin/cordis.patch.yml'), 'utf8')
  assert.ok(text.includes("id: video-project"))
  assert.ok(text.includes("name: 'dsh-video-project'"))
})

test('server/projects.js：导出 createProjects 与 defaultProjectsRoot', async () => {
  const mod = await import('../server/projects.js')
  assert.equal(typeof mod.createProjects, 'function')
  assert.equal(typeof mod.defaultProjectsRoot, 'function')
  assert.ok(mod.defaultProjectsRoot({ DSH_HOME: 'C:\\dsh-home' }).includes('video-project'))
})
