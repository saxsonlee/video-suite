import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRoutes, API_PREFIX } from '../server/routes.js'

function tempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vp-routes-'))
}

function findRoute(routes, method, suffix) {
  return routes.find((route) => route.path === API_PREFIX + suffix && route.methods.includes(method))
}

test('createRoutes：GET+POST /settings（合并一条路由，避免同 path 重复注册）、GET /models、GET /panel，均为 buffered', () => {
  const routes = createRoutes({ env: { USERPROFILE: tempHome() } })
  assert.equal(routes.length, 3)
  assert.ok(findRoute(routes, 'GET', '/settings'))
  assert.ok(findRoute(routes, 'POST', '/settings'))
  assert.ok(findRoute(routes, 'GET', '/models'))
  for (const route of routes) assert.equal(route.requestBody, 'buffered')
})

test('GET /settings：默认关闭、返回候选与脱敏 Key', async () => {
  const home = tempHome()
  const configFile = path.join(home, 'config.json')
  fs.writeFileSync(configFile, JSON.stringify({ imageGen: { enabled: true, model: 'gpt-image-2.5', apiKey: 'sk-secret-123456789' } }))
  const routes = createRoutes({ env: { USERPROFILE: home, VIDEO_CAPABILITIES_FILE: path.join(home, 'none.json') }, configFile })
  const response = await findRoute(routes, 'GET', '/settings').fetch(new Request('http://x' + API_PREFIX + '/settings'))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.ok, true)
  assert.equal(data.value.enabled, true)
  assert.equal(data.value.model, 'gpt-image-2.5')
  assert.equal(data.value.hasApiKey, true)
  assert.equal('apiKey' in data.value, false)
  assert.match(data.value.apiKeyMasked, /••••/)
})

test('POST /settings：保存后读取一致；留空 apiKey 不覆盖', async () => {
  const home = tempHome()
  const configFile = path.join(home, 'config.json')
  const routes = createRoutes({ env: { USERPROFILE: home }, configFile })
  const post = findRoute(routes, 'POST', '/settings')
  const first = await post.fetch(new Request('http://x' + API_PREFIX + '/settings', {
    method: 'POST',
    body: JSON.stringify({ enabled: true, model: 'gemini-3.1-flash-image', apiKey: 'sk-abcdefgh12345678' })
  }))
  const firstData = await first.json()
  assert.equal(firstData.ok, true)
  assert.equal(firstData.value.enabled, true)
  assert.equal(firstData.value.model, 'gemini-3.1-flash-image')
  const second = await post.fetch(new Request('http://x' + API_PREFIX + '/settings', {
    method: 'POST',
    body: JSON.stringify({ enabled: false, model: 'gpt-image-2.5' })
  }))
  const secondData = await second.json()
  assert.equal(secondData.value.enabled, false)
  const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'))
  assert.equal(stored.imageGen.apiKey, 'sk-abcdefgh12345678')
})

test('GET /models：mock 中转站返回图像模型候选', async () => {
  const home = tempHome()
  const routes = createRoutes({
    env: { USERPROFILE: home },
    configFile: path.join(home, 'config.json'),
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: 'gpt-image-2.5' }, { id: 'doubao-seedance-2.5' }] }), { status: 200 })
  })
  // 先保存地址与 Key
  await findRoute(routes, 'POST', '/settings').fetch(new Request('http://x' + API_PREFIX + '/settings', {
    method: 'POST',
    body: JSON.stringify({ enabled: true, model: 'gpt-image-2.5', baseUrl: 'https://relay.example', apiKey: 'k' })
  }))
  const response = await findRoute(routes, 'GET', '/models').fetch(new Request('http://x' + API_PREFIX + '/models'))
  const data = await response.json()
  assert.equal(data.ok, true)
  assert.deepEqual(data.value.models, ['gpt-image-2.5'])
})

test('项目数据路由：GET /projects 与 /project（面板读取用）', async () => {
  const { createProjects } = await import('../server/projects.js')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-projects-api-'))
  const projects = createProjects({ root })
  await projects.createProject('面板项目', { style: '电影感' })
  const routes = createRoutes({ env: { USERPROFILE: root }, projects })
  // 路由数量随功能增长（panel/projects/project/media/player/thumb/settings/models）；
  // 关键路由是否存在由下面的实际调用验证，这里只做下限检查。
  assert.ok(routes.length >= 6, '路由数量异常：' + routes.length)
  for (const path of ['/panel', '/projects', '/project', '/media', '/settings', '/models']) {
    assert.ok(routes.some((route) => route.path === API_PREFIX + path), '缺少路由 ' + path)
  }
  const list = await findRoute(routes, 'GET', '/projects').fetch(new Request('http://x' + API_PREFIX + '/projects'))
  assert.equal(list.status, 200)
  const listData = await list.json()
  assert.equal(listData.ok, true)
  assert.equal(listData.value.projects.length, 1)
  assert.equal(listData.value.projects[0].name, '面板项目')
  const detail = await findRoute(routes, 'GET', '/project').fetch(new Request('http://x' + API_PREFIX + '/project?name=' + encodeURIComponent('面板项目')))
  assert.equal(detail.status, 200)
  const detailData = await detail.json()
  assert.equal(detailData.value.project.videoName, '面板项目')
  const missing = await findRoute(routes, 'GET', '/project').fetch(new Request('http://x' + API_PREFIX + '/project?name=' + encodeURIComponent('不存在')))
  assert.equal(missing.status, 404)
  const noName = await findRoute(routes, 'GET', '/project').fetch(new Request('http://x' + API_PREFIX + '/project'))
  assert.equal(noName.status, 400)
})

test('GET /panel：共享 SPA 面板页（项目列表/设置视图）', async () => {
  const routes = createRoutes({ env: { USERPROFILE: tempHome() } })
  const panel = findRoute(routes, 'GET', '/panel')
  assert.ok(panel)
  const response = await panel.fetch(new Request('http://x' + API_PREFIX + '/panel?platform=dsh&view=settings'))
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') || '', /text\/html/)
  const text = await response.text()
  assert.ok(text.includes('视频项目'))
  assert.ok(text.includes('__VP_PANEL__'))
})

test('POST /project 编辑：meta / characters / areas / acts / shots', async () => {
  const { createProjects } = await import('../server/projects.js')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vp-edit-api-'))
  const projects = createProjects({ root })
  await projects.createProject('编辑项目', { style: '旧风格' })
  const routes = createRoutes({ env: { USERPROFILE: root }, projects })
  const post = findRoute(routes, 'POST', '/project')
  const call = async (body) => {
    const response = await post.fetch(new Request('http://x' + API_PREFIX + '/project', { method: 'POST', body: JSON.stringify(body) }))
    return { status: response.status, data: await response.json() }
  }
  const meta = await call({ action: 'meta', name: '编辑项目', patch: { style: '新风格', sceneMap: { environment: '夜晚，霓虹冷蓝' } } })
  assert.equal(meta.status, 200)
  assert.equal(meta.data.value.project.style, '新风格')
  assert.equal(meta.data.value.project.sceneMap.environment, '夜晚，霓虹冷蓝')
  const chars = await call({ action: 'characters', name: '编辑项目', characters: [{ name: '阿海', identity: { face: '左眉疤' }, looks: [{ id: 'dock', name: '工人装', views: { front: '正' } }] }] })
  assert.equal(chars.status, 200)
  const areas = await call({ action: 'areas', name: '编辑项目', areas: [{ id: 'dock', name: '码头', layout: '入口在南' }] })
  assert.equal(areas.status, 200)
  const acts = await call({ action: 'acts', name: '编辑项目', acts: [{ id: 'act1', name: '第一幕', cast: [{ name: '阿海', lookId: 'dock' }] }] })
  assert.equal(acts.status, 200)
  const shots = await call({ action: 'shots', name: '编辑项目', shots: [{ id: 'Shot1', actId: 'act1', areaId: 'dock', shotType: '全景', movement: '固定', duration: 4, action: '阿海走上码头', purpose: '交代环境', environment: '夜晚，霓虹冷蓝' }] })
  assert.equal(shots.status, 200)
  const detail = await projects.getProject('编辑项目')
  assert.equal(detail.shots.length, 1)
  assert.equal(detail.acts.length, 1)
  assert.equal(detail.places ? detail.places.length : detail.areas.length, 1)
})
