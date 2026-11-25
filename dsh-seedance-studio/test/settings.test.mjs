/**
 * settings.js 单测：优先级、demo 判定、密钥打码、原子写设置。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULTS, PROVIDERS, maskSecret, isMaskedSecret, parseRelayModelMap, parseRelayModels,
  normalizeSettingRecord, readSettingsFile, mergeSettings, resolveConfig,
  settingsView, createSettingsManager, writeJsonAtomic, applySettingsPatch, SettingError
} from '../server/settings/index.js'

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-settings-'))
}

test('密钥打码', () => {
  assert.equal(maskSecret(''), '')
  assert.equal(maskSecret('short'), '****')
  assert.equal(maskSecret('ark-1234567890abcd'), 'ark-****abcd')
  assert.equal(isMaskedSecret('ark-****abcd'), true)
  assert.equal(isMaskedSecret('ark-real-key-1234'), false)
})

test('设置优先级：settings.json > env > pluginConfig > 默认', () => {
  const merged = mergeSettings({
    file: { ARK_API_KEY: 'file-key-12345678' },
    env: { ARK_API_KEY: 'env-key-abcdefgh', ARK_BASE_URL: 'https://env.example.com' },
    pluginConfig: { ARK_BASE_URL: 'https://config.example.com', provider: 'ark' }
  })
  assert.equal(merged.values.ARK_API_KEY, 'file-key-12345678')
  assert.equal(merged.values.ARK_BASE_URL, 'https://env.example.com')
  assert.equal(merged.values.provider, 'ark')
  assert.equal(merged.sources.ARK_API_KEY, 'settings.json')
  assert.equal(merged.sources.ARK_BASE_URL, 'env')
  assert.equal(merged.sources.provider, 'config')
  assert.equal(merged.values.DEFAULT_MODEL, DEFAULTS.DEFAULT_MODEL)
  assert.equal(merged.sources.DEFAULT_MODEL, 'default')
})

test('demo 判定：无 Key 自动 demo；有 Key 退出；显式 provider 优先', () => {
  let config = resolveConfig(mergeSettings({ env: {} }))
  assert.equal(config.provider, 'demo')
  assert.equal(config.demo, true)
  assert.match(config.demoReason, /演示模式/)

  config = resolveConfig(mergeSettings({ env: { ARK_API_KEY: 'ark-key-1234567890' } }))
  assert.equal(config.demo, false)
  assert.equal(config.provider, 'ark')
  assert.equal(config.arkApiKey, 'ark-key-1234567890')

  // 显式 provider=ark 且无 key：不自动 demo，而是配置错误（调用时报错）
  config = resolveConfig(mergeSettings({ pluginConfig: { provider: 'ark' }, env: {} }))
  assert.equal(config.demo, false)
  assert.equal(config.provider, 'ark')
  assert.match(config.configError || '', /ARK_API_KEY/)

  // DEMO=1 强制 demo
  config = resolveConfig(mergeSettings({ env: { DEMO: '1', ARK_API_KEY: 'ark-key-1234567890' } }))
  assert.equal(config.demo, true)
  assert.equal(config.provider, 'demo')

  // DEMO=0 显式关闭自动 demo
  config = resolveConfig(mergeSettings({ env: { DEMO: '0' } }))
  assert.equal(config.demo, false)
  assert.equal(config.provider, 'ark')

  // provider=demo
  config = resolveConfig(mergeSettings({ pluginConfig: { provider: 'demo' } }))
  assert.equal(config.demo, true)
})

test('relay 配置：baseUrl+key 自动识别协议/createPath/style/模型映射', () => {
  let config = resolveConfig(mergeSettings({ env: {
    RELAY_BASE_URL: 'https://relay.example.com/',
    RELAY_API_KEY: 'relay-key-abcdefgh',
    RELAY_MODEL_MAP: 'doubao-seedance-2-5-260628=seedance-2.5, old=new',
    RELAY_STYLE: 'orca'
  } }))
  assert.equal(config.demo, false)
  assert.equal(config.provider, 'relay')
  assert.equal(config.relay.baseUrl, 'https://relay.example.com')
  assert.equal(config.relay.protocol, 'openai')
  assert.equal(config.relay.createPath, '/v1/video/generations')
  assert.equal(config.relay.style, 'orca')
  assert.equal(config.relay.modelMap['doubao-seedance-2-5-260628'], 'seedance-2.5')
  assert.equal(config.relay.modelMap.old, 'new')

  config = resolveConfig(mergeSettings({ env: {
    RELAY_BASE_URL: 'https://relay.example.com/api/v3',
    RELAY_API_KEY: 'relay-key-abcdefgh',
    RELAY_PROTOCOL: 'ark'
  } }))
  assert.equal(config.relay.protocol, 'ark')
  assert.equal(config.relay.createPath, '/api/v3/contents/generations/tasks')

  // provider=relay 有 Key 但缺 baseUrl → configError
  config = resolveConfig(mergeSettings({ pluginConfig: { provider: 'relay' }, env: { RELAY_API_KEY: 'relay-key-123456' } }))
  assert.match(config.configError || '', /RELAY_BASE_URL/)
})

test('settingsView：密钥打码、不下发明文', () => {
  const config = resolveConfig(mergeSettings({ env: { ARK_API_KEY: 'ark-1234567890abcd' } }))
  const view = settingsView(config)
  assert.equal(view.keys.ark, 'ark-****abcd')
  assert.equal(view.hasArkKey, true)
  assert.equal(JSON.stringify(view).includes('ark-1234567890abcd'), false, '视图不得包含明文 Key')
  assert.equal(view.demo, false)
  assert.equal(view.defaultModel, DEFAULTS.DEFAULT_MODEL)
})

test('readSettingsFile 容错：不存在/损坏 JSON/非对象', () => {
  const root = tempRoot()
  const file = path.join(root, 'settings.json')
  assert.deepEqual(readSettingsFile(file), { data: {}, error: null })
  fs.writeFileSync(file, '{bad json', 'utf8')
  const broken = readSettingsFile(file)
  assert.deepEqual(broken.data, {})
  assert.ok(broken.error)
  fs.writeFileSync(file, '[1,2,3]', 'utf8')
  assert.ok(readSettingsFile(file).error)
  fs.writeFileSync(file, JSON.stringify({ ARK_API_KEY: 'k-123456789', unknownKey: 'x' }), 'utf8')
  const good = readSettingsFile(file)
  assert.equal(good.data.ARK_API_KEY, 'k-123456789')
  assert.equal(good.data.unknownKey, undefined, '白名单外的字段应被忽略')
})

test('parseRelayModelMap 兼容 JSON 与 a=b 字符串', () => {
  assert.deepEqual(parseRelayModelMap('a=b, c=d'), { a: 'b', c: 'd' })
  assert.deepEqual(parseRelayModelMap('{"a":"b"}'), { a: 'b' })
  assert.deepEqual(parseRelayModelMap(''), {})
})

test('设置管理器：更新写盘、打码值不回写、立即生效', () => {
  const root = tempRoot()
  const manager = createSettingsManager({ storageRoot: root, env: { ARK_API_KEY: 'env-secret-key-abcdef' } })
  assert.equal(manager.getConfig().demo, false)
  assert.equal(manager.getConfig().arkApiKey, 'env-secret-key-abcdef')

  const updated = manager.update({ provider: 'demo', arkApiKey: 'ark-****cdef', relayBaseUrl: 'https://relay.example.com' })
  assert.equal(updated.config.demo, true)
  assert.deepEqual(Object.keys(updated.changed).sort(), ['RELAY_BASE_URL', 'provider'])
  assert.equal(updated.config.arkApiKey, 'env-secret-key-abcdef', '打码值不得覆盖真实 Key')

  const saved = JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'))
  assert.equal(saved.provider, 'demo')
  assert.equal(saved.RELAY_BASE_URL, 'https://relay.example.com')
  assert.equal(saved.ARK_API_KEY, undefined)

  // 重新加载后仍生效
  const reloaded = createSettingsManager({ storageRoot: root, env: {} })
  assert.equal(reloaded.getConfig().demo, true)

  assert.throws(() => manager.update({ provider: 'invalid' }), (error) => error.name === 'SettingError' && error.field === 'provider')
  assert.throws(() => manager.update('not-object'), SettingError)
})

test('parseRelayModels / RELAY_MODELS 缓存：解析、持久化与视图', () => {
  assert.deepEqual(parseRelayModels(''), [])
  assert.deepEqual(parseRelayModels('not-json'), [])
  assert.deepEqual(parseRelayModels('{"a":1}'), [])
  assert.deepEqual(parseRelayModels('[{"id":"a","label":"A"},"b",{"id":"a","label":"重复"}]'), [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'b' }
  ])

  const root = tempRoot()
  const manager = createSettingsManager({ storageRoot: root, env: { ARK_API_KEY: 'env-secret-key-abcdef' } })
  assert.deepEqual(manager.getConfig().relayModels, [])

  const updated = manager.update({ relayModels: [{ id: 'seedance-2.5', label: 'Seedance 2.5' }, { id: 'seedance-1.0', label: 'Seedance 1.0' }] })
  assert.equal(updated.config.relayModels.length, 2)
  assert.deepEqual(manager.view().relayModels, [
    { id: 'seedance-2.5', label: 'Seedance 2.5' },
    { id: 'seedance-1.0', label: 'Seedance 1.0' }
  ])

  const saved = JSON.parse(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'))
  assert.equal(typeof saved.RELAY_MODELS, 'string')
  assert.deepEqual(JSON.parse(saved.RELAY_MODELS).map((item) => item.id), ['seedance-2.5', 'seedance-1.0'])

  const reloaded = createSettingsManager({ storageRoot: root, env: {} })
  assert.deepEqual(reloaded.view().relayModels.map((item) => item.id), ['seedance-2.5', 'seedance-1.0'])

  // 字符串形式（前端保存 JSON.stringify 结果）也能被解析
  const patched = applySettingsPatch({}, { relayModels: '[{"id":"x","label":"X"}]' })
  assert.equal(patched.next.RELAY_MODELS, '[{"id":"x","label":"X"}]')
})

test('applySettingsPatch 纯函数', () => {
  const { next, changed } = applySettingsPatch({}, { pollIntervalMs: 5000, DEMO: true, relayModelMap: 'a=b' })
  assert.equal(next.POLL_INTERVAL_MS, 5000)
  assert.equal(next.DEMO, true)
  assert.equal(next.RELAY_MODEL_MAP, 'a=b')
  assert.ok(changed.DEMO)
})

test('writeJsonAtomic 写入并保持可读', () => {
  const root = tempRoot()
  const file = path.join(root, 'nested', 'a.json')
  writeJsonAtomic(file, { hello: '世界' })
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { hello: '世界' })
})


test('relay 模式默认模型收敛到中转站已选清单', () => {
  const relayModels = [
    { id: 'doubao-seedance-2.0-fast', label: 'doubao-seedance-2.0-fast' },
    { id: 'doubao-seedance-2.5', label: 'doubao-seedance-2.5' }
  ]
  const merged = mergeSettings({ file: {
    provider: 'relay',
    RELAY_BASE_URL: 'https://relay.example.com',
    RELAY_API_KEY: 'relay-key-abcdefgh',
    RELAY_MODELS: JSON.stringify(relayModels),
    DEFAULT_MODEL: 'doubao-seedance-2-5-260628'
  } })
  const config = resolveConfig(merged)
  assert.equal(config.provider, 'relay')
  assert.equal(config.defaultModel, 'doubao-seedance-2.5', '应匹配用户清单里的同系列模型，不沿用官方 ID')
  assert.equal(config.defaultModelAdjusted, true)

  // 匹配不到同系列 → 清单首项
  const noMatch = resolveConfig(mergeSettings({ file: {
    provider: 'relay',
    RELAY_BASE_URL: 'https://relay.example.com',
    RELAY_API_KEY: 'relay-key-abcdefgh',
    RELAY_MODELS: JSON.stringify(relayModels),
    DEFAULT_MODEL: 'some-unknown-model'
  } }))
  assert.equal(noMatch.defaultModel, 'doubao-seedance-2.0-fast')

  // 默认模型本来就在清单里 → 保持不变
  const kept = resolveConfig(mergeSettings({ file: {
    provider: 'relay',
    RELAY_BASE_URL: 'https://relay.example.com',
    RELAY_API_KEY: 'relay-key-abcdefgh',
    RELAY_MODELS: JSON.stringify(relayModels),
    DEFAULT_MODEL: 'doubao-seedance-2.5'
  } }))
  assert.equal(kept.defaultModel, 'doubao-seedance-2.5')
  assert.equal(kept.defaultModelAdjusted, false)
})
