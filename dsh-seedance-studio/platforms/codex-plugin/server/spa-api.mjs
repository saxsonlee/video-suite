// Adapt the shared SPA's HTTP-shaped contract to Codex's independent runtime.
// The SPA is owned by the Web/DSH lead; no UI or DSH settings are copied here.
import path from 'node:path';
import { publicDefaults, capabilities, LIMITS } from '../../../server/models/index.js';
import { fail, readJson, writeJson } from './util.mjs';

const PREFIX = '/api/seedance/';
const GET = new Set(['ping', 'config', 'settings', 'history', 'task', 'media', 'pending', 'ui-state']);
const POST = new Set(['settings', 'generate', 'recreate', 'cancel', 'delete', 'pending', 'ui-state', 'project']);
const QUERIES = { history: ['sessionId', 'limit'], task: ['sessionId', 'id'], media: ['id', 'kind'] };

export function isSpaRoute(method, route) {
  if (typeof route !== 'string' || !route.startsWith(PREFIX) || /[\\#\s]/.test(route)) return false;
  const [pathname] = route.split('?');
  const action = pathname.slice(PREFIX.length);
  if (!(method === 'GET' ? GET : method === 'POST' ? POST : new Set()).has(action)) return false;
  const url = new URL(route, 'http://codex.invalid');
  if (url.pathname !== pathname) return false;
  const allowed = method === 'GET' ? QUERIES[action] || [] : [];
  for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) return false;
  return true;
}

function sessionId(value = 'default') {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\x00-\x1f]/.test(value)) fail('INVALID_SESSION', '无效的会话标识');
  return value;
}
function requestId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(value)) fail('REQUEST_ID_REQUIRED', '请提供稳定 requestId，断线后查询原任务');
  return value;
}

export function createSpaApi({ root, studio, mediaUrl, appProject }) {
  const prefsFile = path.join(root, 'panel-ui-state.json');
  const pendingFile = path.join(root, 'panel-pending.json');
  let submissions = Promise.resolve();
  const pending = () => readJson(pendingFile);
  const preferences = () => ({ sessionId: 'default', lang: 'zh', theme: 'dark', ...readJson(prefsFile, {}) });
  function lookup(id, session) {
    requestId(id);
    const found = studio.history(true, session).find(j => j.id === id || j.requestId === id || j.recordId === id);
    if (!found) fail('JOB_NOT_FOUND', '未找到此会话的任务编号', 404);
    return found;
  }
  function record(job) {
    return {
      id: job.id, recordId: job.recordId, requestId: job.requestId, sessionId: job.sessionId,
      status: job.status || (job.state === 'completed' ? 'succeeded' : job.state === 'failed' || job.state === 'interrupted' ? 'failed' : 'queued'),
      state: job.state, kind: job.kind, model: job.model, mode: job.mode, provider: job.provider, demo: job.demo,
      prompt: job.prompt, params: job.params, progress: job.progress, createdAt: job.createdAt, updatedAt: job.updatedAt,
      error: job.error, warning: job.warning
    };
  }
  function settingsView() {
    const s = studio.settings.view();
    return {
      provider: s.provider, providerRequested: s.provider, demo: s.provider === 'demo', defaultModel: s.model,
      arkBaseUrl: s.provider === 'ark' ? s.baseUrl : '', relayBaseUrl: s.provider === 'relay' ? s.baseUrl : '',
      relayProtocol: s.protocol, relayStyle: s.style, storageRoot: root,
      keys: { ark: s.provider === 'ark' && s.hasKey ? '••••••••' : '', relay: s.provider === 'relay' && s.hasKey ? '••••••••' : '' },
      hasArkKey: s.provider === 'ark' && s.hasKey, hasRelayKey: s.provider === 'relay' && s.hasKey,
      inheritDsh: s.inheritDsh === true, inheritedFrom: s.inheritedFrom, image: s.image, model: s.model, protocol: s.protocol, baseUrl: s.baseUrl, keyEnv: s.keyEnv,
      createPath: s.createPath, queryPath: s.queryPath, cancelPath: s.cancelPath
    };
  }
  function updateSettings(body) {
    const patch = body.patch || body;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) fail('INVALID_SETTINGS', '设置必须是对象');
    const current = studio.settings.view(), provider = patch.provider || current.provider;
    if (!['demo', 'ark', 'relay'].includes(provider)) fail('EXPLICIT_PROVIDER_REQUIRED', 'Codex 插件需要明确选择 demo、ark 或 relay，不会自动切换服务商');
    const direct = ['model', 'baseUrl', 'protocol', 'style', 'createPath', 'queryPath', 'cancelPath', 'keyEnv', 'apiKey', 'image'];
    const map = { DEFAULT_MODEL: 'model', RELAY_PROTOCOL: 'protocol', RELAY_STYLE: 'style', RELAY_CREATE_PATH: 'createPath', RELAY_QUERY_PATH: 'queryPath', RELAY_CANCEL_PATH: 'cancelPath', ARK_TASKS_PATH: 'createPath' };
    const accepted = new Set(['provider', ...direct, ...Object.keys(map), 'ARK_BASE_URL', 'RELAY_BASE_URL', 'ARK_API_KEY', 'RELAY_API_KEY', 'inheritDsh', 'relayModels']);
    for (const key of Object.keys(patch)) if (!accepted.has(key)) fail('INVALID_SETTINGS', '不支持的 Codex 设置字段：' + key);
    const next = { provider };
    if (patch.inheritDsh !== undefined) { if (typeof patch.inheritDsh !== 'boolean') fail('INVALID_SETTINGS', 'inheritDsh 必须是布尔值'); next.inheritDsh = patch.inheritDsh; }
    for (const key of direct) if (patch[key] !== undefined) next[key] = patch[key];
    for (const [key, dest] of Object.entries(map)) if (patch[key] !== undefined) next[dest] = patch[key];
    for (const [route, prefix] of [['ark', 'ARK'], ['relay', 'RELAY']]) {
      const key = patch[prefix + '_API_KEY'], base = patch[prefix + '_BASE_URL'];
      if ((key || base) && provider !== route) fail('SETTINGS_ROUTE_MISMATCH', '请只填写当前所选服务商的连接与密钥');
      if (provider === route) { if (key) next.apiKey = key; if (base) next.baseUrl = base; }
    }
    if (provider !== current.provider && provider !== 'demo' && current.hasKey && !next.apiKey && !next.keyEnv) fail('SETTINGS_ROUTE_KEY_REQUIRED', '切换服务商时请明确提供对应密钥或环境变量，避免沿用另一连接的凭据');
    studio.updateSettings(next);
    return { settings: settingsView() };
  }
  async function submit(action, body) {
    const id = requestId(body.requestId), session = sessionId(body.sessionId);
    if (body.confirmed !== true) fail('CONFIRMATION_REQUIRED', '请确认本次生成操作', 409);
    const prior = pending();
    if (prior && prior.id !== id) fail('PENDING_CONFLICT', '有尚未核验的提交，请先按原 requestId 查询，不能重复提交', 409);
    const input = { ...body, sessionId: session };
    if (action === 'recreate') input.sourceId = lookup(body.sourceId, session).recordId;
    if (action === 'recreate' && !input.sourceId) fail('SOURCE_NOT_READY', '来源任务还没有可用于再创作的记录', 409);
    if (!prior) writeJson(pendingFile, { id, kind: 'video', sessionId: session, createdAt: Date.now() });
    try {
      const job = await studio.generate(input);
      return { record: record(studio.job(job.id, true)), job };
    } catch (error) {
      // Validation failed before a receipt existed: no paid request can be replayed.
      const accepted = studio.history().some(j => j.requestId === id);
      if (!accepted && pending()?.id === id) writeJson(pendingFile, null);
      throw error;
    }
  }
  return async function spaRequest(method, route, body = {}) {
    if (!isSpaRoute(method, route)) fail('APP_ROUTE_REJECTED', '不支持的共享面板操作');
    const url = new URL(route, 'http://codex.invalid'), action = url.pathname.slice(PREFIX.length);
    let value;
    if (method === 'GET') {
      if (action === 'ping') value = { pong: true, platform: 'codex', time: new Date().toISOString() };
      if (action === 'pending') value = { pending: pending() };
      if (action === 'ui-state') value = preferences();
      if (action === 'settings') value = { settings: settingsView() };
      if (action === 'config') {
        const settings = settingsView(), models = studio.models();
        const defaults = publicDefaults({ defaultModel: models.defaultModel });
        const items = models.items.slice();
        if (!items.some(m => m.id === defaults.defaultModel)) items.push({ ...items[0], id: defaults.defaultModel, label: defaults.defaultModel });
        value = { provider: settings.provider, demo: settings.demo, defaultModel: defaults.defaultModel, models: items,
          defaults: { ...defaults, params: { resolution: defaults.defaultResolution, ratio: defaults.defaultRatio, duration: defaults.defaultDuration } },
          capabilities: capabilities(), settings, limits: LIMITS, pending: pending(), platform: 'codex' };
      }
      if (action === 'history') {
        const session = sessionId(url.searchParams.get('sessionId') || undefined);
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
        value = { records: studio.history(true, session).filter(j => j.kind === 'video').slice(0, limit).map(record), pending: pending() };
      }
      if (action === 'task') value = { record: record(lookup(url.searchParams.get('id'), sessionId(url.searchParams.get('sessionId') || undefined))) };
      if (action === 'media') {
        const job = lookup(url.searchParams.get('id'));
        const kind = url.searchParams.get('kind');
        if (!['poster', 'video'].includes(kind)) fail('INVALID_MEDIA_REQUEST', '无效的媒体类型');
        const reference = mediaUrl(kind === 'video' ? job.videoPath : job.lastFramePath);
        if (!reference) fail('MEDIA_UNAVAILABLE', '媒体文件尚未就绪或不存在', 404);
        value = { reference, mimeType: kind === 'video' ? 'video/mp4' : 'image/jpeg' };
      }
    } else {
      if (action === 'ui-state') {
        const next = preferences();
        for (const key of Object.keys(body)) if (!['sessionId', 'lang', 'theme'].includes(key)) fail('INVALID_UI_STATE', '面板偏好只保存会话、语言和主题');
        if (body.sessionId !== undefined) next.sessionId = sessionId(body.sessionId);
        if (body.lang !== undefined) { if (!['zh', 'en'].includes(body.lang)) fail('INVALID_UI_STATE', '无效的语言'); next.lang = body.lang; }
        if (body.theme !== undefined) { if (!['dark', 'light'].includes(body.theme)) fail('INVALID_UI_STATE', '无效的主题'); next.theme = body.theme; }
        writeJson(prefsFile, next); value = next;
      }
      if (action === 'settings') value = updateSettings(body);
      if (action === 'generate' || action === 'recreate') {
        const operation = submissions.then(() => submit(action, body));
        submissions = operation.catch(() => {}); value = await operation;
      }
      if (action === 'pending') {
        requestId(body.requestId);
        if (!['ack', 'clear'].includes(body.action)) fail('INVALID_PENDING', '无效的未决任务操作');
        const prior = pending();
        if (prior && prior.id !== body.requestId) fail('PENDING_CONFLICT', '未决任务编号不匹配', 409);
        if (body.action === 'ack') lookup(body.requestId);
        else if (body.confirmed !== true) fail('CONFIRMATION_REQUIRED', '放弃核验需要用户明确确认', 409);
        if (prior) writeJson(pendingFile, null);
        value = { pending: pending() };
      }
      if (action === 'cancel') value = { record: record(await studio.cancel(lookup(body.id, sessionId(body.sessionId)).id)) };
      if (action === 'delete') {
        if (body.confirmed !== true) fail('CONFIRMATION_REQUIRED', '删除本地记录与媒体需要确认', 409);
        const job = lookup(body.id, sessionId(body.sessionId));
        await studio.remove(job.id); value = { removed: true, id: job.id };
      }
      if (action === 'project') {
        value = appProject(await studio.project(body));
        if (value.referenceImage) value.referenceImage = mediaUrl(value.referenceImage) || '';
      }
    }
    return { ok: true, value };
  };
}
