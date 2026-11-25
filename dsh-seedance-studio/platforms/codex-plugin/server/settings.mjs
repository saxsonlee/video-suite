import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJson, writeJson, fail } from './util.mjs';
import { vault as systemVault } from './vault.mjs';
import { resolveConfig } from '../../../server/settings/config.js';
import { DEFAULTS } from '../../../server/settings/defaults.js';

const initial = () => ({
  provider: 'demo', inheritDsh: false, model: '', baseUrl: '', protocol: 'ark', style: 'metadata', createPath: '', queryPath: '', cancelPath: '',
  credential: null, keyEnv: '', image: { enabled: false, sketchAsReference: false, model: '', baseUrl: '', protocol: 'openai_images', keyEnv: '', credential: null }
});
function validateUrl(value, field) {
  if (!value) return;
  let parsed; try { parsed = new URL(value); } catch { fail('INVALID_URL', field + ' 不是有效网址'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash || parsed.search) fail('INVALID_URL', field + ' 需要不含凭据、查询和片段的 HTTP(S) API 根地址');
}

/**
 * 读取同机 DSH 插件共享的设置（$DSH_HOME/storages/seedance-studio/settings.json）。
 * 仅用于「Codex 面板未配置时继承」，不复制、不改写 DSH 的密钥文件。
 * @returns {object|null} 解析后的 DSH settings 或 null
 */
export function readDshSettings(file) {
  try {
    if (!file) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

/** 把 DSH 设置映射成 Codex 侧的继承配置（不含图像生成配置）。 */
export function mapDshSettings(dsh) {
  if (!dsh || typeof dsh !== 'object') return null;
  const pick = (value) => (typeof value === 'string' ? value.trim() : '');
  const keys = { ark: pick(dsh.ARK_API_KEY), relay: pick(dsh.RELAY_API_KEY) };
  const providerRaw = pick(dsh.provider).toLowerCase();
  let provider = providerRaw === 'ark' || providerRaw === 'relay' ? providerRaw : (keys.ark ? 'ark' : keys.relay ? 'relay' : '');
  if (!provider) return null;
  const relayProtocol = pick(dsh.RELAY_PROTOCOL).toLowerCase() === 'openai' ? 'openai' : 'ark';
  const relayStyle = ['flat', 'orca', 'metadata'].includes(pick(dsh.RELAY_STYLE)) ? pick(dsh.RELAY_STYLE) : 'metadata';
  return {
    provider,
    keys,
    baseUrl: provider === 'relay' ? pick(dsh.RELAY_BASE_URL) : pick(dsh.ARK_BASE_URL),
    model: pick(dsh.DEFAULT_MODEL),
    protocol: provider === 'relay' ? relayProtocol : 'ark',
    style: relayStyle,
    createPath: provider === 'relay' ? pick(dsh.RELAY_CREATE_PATH) : pick(dsh.ARK_TASKS_PATH),
    queryPath: provider === 'relay' ? pick(dsh.RELAY_QUERY_PATH) : '',
    cancelPath: provider === 'relay' ? pick(dsh.RELAY_CANCEL_PATH) : '',
    source: 'dsh'
  };
}

export function createSettings(root, { env = process.env, vault = systemVault, dshSettingsFile = '' } = {}) {
  const file = path.join(root, 'settings.json');
  let stored = { ...initial(), ...readJson(file, {}) };
  stored.image = { ...initial().image, ...stored.image };
  // 同机 DSH 共享配置：仅当显式开启（Codex 面板）时作为「未配置字段」的回退默认值，不写入 Codex 自己的 settings.json
  const inherited = dshSettingsFile ? mapDshSettings(readDshSettings(dshSettingsFile)) : null;
  let videoKey = '', imageKey = '';
  function getKey(cfg) { return cfg.keyEnv ? String(env[cfg.keyEnv] || '') : cfg.credential ? vault.get(cfg.credential) : ''; }
  function reloadKeys() { videoKey = getKey(stored); imageKey = getKey(stored.image); }
  reloadKeys();

  /** 合并 Codex 自己的设置与 DSH 继承值（逐字段回退）。 */
  function effective() {
    const own = {
      provider: stored.provider, baseUrl: stored.baseUrl, model: stored.model, protocol: stored.protocol,
      style: stored.style, createPath: stored.createPath, queryPath: stored.queryPath, cancelPath: stored.cancelPath
    };
    if (!inherited || stored.inheritDsh !== true) return { ...own, key: videoKey, inherited: false };
    const unset = stored.provider === 'demo' && !stored.baseUrl && !stored.model && !stored.credential && !stored.keyEnv;
    const provider = unset ? inherited.provider : stored.provider;
    const providerKey = provider === 'relay' ? inherited.keys.relay : inherited.keys.ark;
    const key = videoKey || providerKey;
    const usedInheritance = unset || !videoKey || !stored.baseUrl || !stored.model;
    return {
      provider,
      baseUrl: stored.baseUrl || inherited.baseUrl,
      model: stored.model || inherited.model,
      protocol: unset ? inherited.protocol : stored.protocol,
      style: stored.style || inherited.style,
      createPath: stored.createPath || inherited.createPath,
      queryPath: stored.queryPath || inherited.queryPath,
      cancelPath: stored.cancelPath || inherited.cancelPath,
      key,
      inherited: usedInheritance
    };
  }

  function view() {
    const eff = effective();
    const { credential, image, ...video } = stored;
    const { credential: imageRef, ...imageView } = image;
    const result = {
      ...video,
      provider: eff.provider,
      baseUrl: eff.baseUrl,
      model: eff.model,
      protocol: eff.protocol,
      style: eff.style,
      createPath: eff.createPath,
      queryPath: eff.queryPath,
      cancelPath: eff.cancelPath,
      hasKey: Boolean(eff.key),
      dataDir: root,
      image: { ...imageView, hasKey: Boolean(imageKey) }
    };
    if (eff.inherited) result.inheritedFrom = 'dsh';
    return result;
  }
  function update(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('INVALID_SETTINGS', '设置必须是对象');
    const next = structuredClone(stored);
    for (const key of ['provider', 'model', 'baseUrl', 'protocol', 'style', 'createPath', 'queryPath', 'cancelPath', 'keyEnv']) {
      if (patch[key] !== undefined) { if (typeof patch[key] !== 'string') fail('INVALID_SETTINGS', key + ' 必须是字符串'); next[key] = patch[key]; }
    }
    if (typeof patch.inheritDsh === 'boolean') next.inheritDsh = patch.inheritDsh;
    if (patch.image) for (const key of ['enabled', 'sketchAsReference', 'model', 'baseUrl', 'protocol', 'keyEnv']) if (patch.image[key] !== undefined) next.image[key] = patch.image[key];
    if (!['demo', 'ark', 'relay'].includes(next.provider)) fail('INVALID_PROVIDER', '请选择演示、Ark 或中转站');
    if (!['ark', 'openai'].includes(next.protocol)) fail('INVALID_PROTOCOL', '视频协议必须明确选择 ark 或 openai');
    if (!['metadata', 'flat', 'orca'].includes(next.style)) fail('INVALID_STYLE', '无效的中转请求格式');
    if (next.image.protocol !== 'openai_images') fail('INVALID_PROTOCOL', '草图目前仅支持显式 OpenAI Images 兼容协议');
    if (typeof next.image.enabled !== 'boolean') fail('INVALID_SETTINGS', 'image.enabled 必须是布尔值');
    if (typeof next.image.sketchAsReference !== 'boolean') fail('INVALID_SETTINGS', 'image.sketchAsReference 必须是布尔值');
    for (const cfg of [next, next.image]) {
      for (const key of ['model', 'baseUrl', 'keyEnv']) if (typeof cfg[key] !== 'string') fail('INVALID_SETTINGS', key + ' 必须是字符串');
      validateUrl(cfg.baseUrl, 'baseUrl');
      if (cfg.keyEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(cfg.keyEnv)) fail('INVALID_ENV', '请填写环境变量名称，不是密钥内容');
    }
    for (const key of ['createPath', 'queryPath', 'cancelPath']) if (next[key] && (!next[key].startsWith('/') || next[key].startsWith('//') || /[\r\n?#]/.test(next[key]))) fail('INVALID_PATH', key + ' 必须是以 / 开头的 API 路径');
    const newRefs = [];
    try {
      for (const [cfg, input] of [[next, patch], [next.image, patch.image || {}]]) {
        if (input.apiKey !== undefined && typeof input.apiKey !== 'string') fail('INVALID_KEY', 'API Key 必须是字符串');
        if (input.apiKey?.trim()) {
          const ref = 'CodexVideoStudio/' + randomUUID();
          vault.set(ref, input.apiKey.trim()); newRefs.push(ref); cfg.credential = ref; cfg.keyEnv = '';
        } else if (input.keyEnv) cfg.credential = null;
      }
      const nextVideoKey = getKey(next), nextImageKey = getKey(next.image);
      writeJson(file, next);
      const old = stored; stored = next; videoKey = nextVideoKey; imageKey = nextImageKey;
      for (const ref of [old.credential, old.image.credential]) if (ref && ![next.credential, next.image.credential].includes(ref)) { try { vault.delete(ref); } catch {} }
      return view();
    } catch (error) { for (const ref of newRefs) { try { vault.delete(ref); } catch {} } throw error; }
  }
  function runtime() {
    const eff = effective();
    const values = { ...DEFAULTS, provider: eff.provider, DEMO: eff.provider === 'demo', DEFAULT_MODEL: eff.model || DEFAULTS.DEFAULT_MODEL };
    if (eff.provider === 'ark') { values.ARK_API_KEY = eff.key; if (eff.baseUrl) values.ARK_BASE_URL = eff.baseUrl; if (eff.createPath) values.ARK_TASKS_PATH = eff.createPath; }
    if (eff.provider === 'relay') Object.assign(values, { RELAY_API_KEY: eff.key, RELAY_BASE_URL: eff.baseUrl, RELAY_PROTOCOL: eff.protocol, RELAY_STYLE: eff.style, RELAY_CREATE_PATH: eff.createPath, RELAY_QUERY_PATH: eff.queryPath, RELAY_CANCEL_PATH: eff.cancelPath });
    const cfg = resolveConfig({ values }, { storageRoot: path.join(root, 'studio') });
    if (eff.provider !== 'demo' && !eff.model) cfg.configError = '请先在面板明确选择真实视频模型';
    // Preserve exactly the configured API roots; endpoint construction is the adapter's responsibility.
    if (eff.baseUrl) {
      cfg.baseUrl = eff.baseUrl;
      if (eff.provider === 'ark') cfg.ark.baseUrl = eff.baseUrl;
      if (eff.provider === 'relay') { cfg.relay.baseUrl = eff.baseUrl; cfg.relayBaseUrl = eff.baseUrl; }
    }
    return cfg;
  }
  return {
    view, update, runtime,
    secrets: () => [effective().key, imageKey],
    imageConfig: () => ({ ...stored.image, apiKey: imageKey }),
    sketchAsReference: () => stored.image.sketchAsReference === true,
    inheritedFrom: () => (effective().inherited ? 'dsh' : undefined)
  };
}
