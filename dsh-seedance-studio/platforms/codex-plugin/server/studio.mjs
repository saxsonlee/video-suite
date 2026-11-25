import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, readJson, writeJson, fail, digest, safeError, sleep } from './util.mjs';
import { createSettings } from './settings.mjs';
import { createStore } from '../../../server/store/index.js';
import { createTaskManager, defaultDemoMedia } from '../../../server/tasks/index.js';
import { createHostService } from '../../../server/service.js';
import { listModels, normalizeGenerateRequest } from '../../../server/models/index.js';
import { createProjects } from '../vendor/video-project/server/projects.js';
import { createVideoProjectTool } from '../vendor/video-project/tool.js';
import { buildSketchPrompt, resolveSketchSize, saveSketchImage } from '../vendor/video-project/server/imagegen.js';

const terminal = new Set(['succeeded', 'failed', 'cancelled', 'expired']);
const finished = new Set(['completed', 'failed', 'interrupted']);
function projectView(p) {
  if (!p || !Array.isArray(p.shots)) return p;
  return { ...p, name: p.videoName, path: p.dir, shots: { shots: p.shots, baseline: p.baseline, style: p.style, notes: p.notes, sceneMap: p.sceneMap, planConfirmed: p.planConfirmed } };
}
function requestId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{8,128}$/.test(value)) fail('REQUEST_ID_REQUIRED', '请提供 8–128 位稳定 requestId；查询未完成任务时复用原编号');
  return value;
}
function endpoint(root, suffix) {
  const base = root.replace(/\/+$/, '');
  return /\/v1$/.test(base) && suffix.startsWith('/v1/') ? base + suffix.slice(3) : base + suffix;
}
export async function createStudio(root, options = {}) {
  fs.mkdirSync(root, { recursive: true });
  const settings = createSettings(root, options);
  const store = createStore({ root: path.join(root, 'studio') }); store.init();
  const tasks = createTaskManager({ store, getConfig: settings.runtime, demoMedia: defaultDemoMedia(ROOT), ...options.taskOptions });
  const service = createHostService({ ctx: {}, store, tasks, settings: { getConfig: settings.runtime } });
  const projects = createProjects({ root: path.join(root, 'projects'), env: {}, getSketchAsReference: settings.sketchAsReference });
  // These capabilities belong to this plugin. Never import DSH's global settings or keys.
  projects.videoCapability = () => ({ capable: false, source: 'unverified', models: [], detail: '尚未核实当前模型的视频编辑能力' });
  projects.imageCapability = () => {
    const c = settings.imageConfig(); return { enabled: c.enabled, capable: Boolean(c.enabled && c.model && c.baseUrl && c.apiKey), model: c.model, detail: '使用本插件独立图像设置' };
  };
  const projectTool = createVideoProjectTool({ defineTool: value => value, service: { projects } });
  const jobsDir = path.join(root, 'jobs'); fs.mkdirSync(jobsDir, { recursive: true });
  const jobs = new Map(), pending = new Set();
  let projectQueue = Promise.resolve();
  function save(job) { writeJson(path.join(jobsDir, job.id + '.json'), job); jobs.set(job.id, job); }
  for (const entry of fs.readdirSync(jobsDir)) {
    if (!/^job_[a-f0-9-]+\.json$/.test(entry)) continue;
    const job = readJson(path.join(jobsDir, entry));
    if (!job?.id) continue;
    if (job.state === 'submitting' || (job.kind === 'sketch' && job.state === 'running')) {
      const record = job.kind === 'video' ? store.listRecords(job.sessionId).find(r => r.toolCallId === job.requestId) : null;
      if (record) { job.recordId = record.id; job.state = 'running'; }
      else { job.state = 'interrupted'; job.error = { code: 'SUBMISSION_INTERRUPTED', message: '上次进程在提交期间退出，结果未知。请先核对服务商记录；不会自动重发。' }; }
      save(job);
    } else jobs.set(job.id, job);
  }
  tasks.start();
  function find(id) {
    const job = jobs.get(id) || [...jobs.values()].find(j => j.requestId === id);
    if (!job) fail('JOB_NOT_FOUND', '未找到任务编号', 404);
    return job;
  }
  function view(job, app = false) {
    const record = job.recordId ? store.getRecord(job.sessionId, job.recordId) : null;
    if (record) {
      const next = terminal.has(record.status) ? (record.status === 'succeeded' ? 'completed' : 'failed') : 'running';
      if (job.state !== next || job.status !== record.status) { job.state = next; job.status = record.status; job.updatedAt = Date.now(); save(job); }
    }
    const result = {
      id: job.id, requestId: job.requestId, kind: job.kind, sessionId: job.sessionId, state: job.state,
      createdAt: job.createdAt, updatedAt: record?.updatedAt || job.updatedAt, model: record?.model || job.model,
      mode: record?.mode || job.mode, demo: job.demo, provider: record?.provider || job.provider,
      recordId: job.recordId, remoteTaskId: record?.remoteTaskId, status: record?.status || job.status,
      progress: record?.progress, ...service.recordPaths(record)
    };
    if (job.error || record?.error) result.error = safeError(job.error || record.error, settings.secrets());
    if (job.images) result.images = job.images;
    if (job.warning) result.warning = job.warning;
    if (app) { result.prompt = record?.prompt || job.prompt || ''; result.params = record?.params || job.params; }
    return result;
  }
  function history(app = false, sessionId) { return [...jobs.values()].filter(j => !sessionId || j.sessionId === sessionId).map(j => view(j, app)).sort((a, b) => b.createdAt - a.createdAt); }
  function active() { return history().some(j => !finished.has(j.state)); }
  function receipt(input, kind, hash = digest(input)) {
    const id = requestId(input.requestId);
    const old = [...jobs.values()].find(j => j.requestId === id);
    if (old) { if (old.hash !== hash || old.kind !== kind) fail('REQUEST_ID_CONFLICT', '该 requestId 已用于不同内容；不要将它用于新任务', 409); return { job: old, existed: true }; }
    const config = settings.runtime();
    const job = { id: 'job_' + randomUUID(), requestId: id, hash, kind, sessionId: String(input.sessionId || 'default'), state: 'submitting', createdAt: Date.now(), updatedAt: Date.now(), model: input.model || config.defaultModel, mode: input.mode || 'text2video', demo: config.demo, provider: config.provider, prompt: input.prompt, params: input.params };
    save(job); return { job, existed: false };
  }
  function background(job, operation) {
    const promise = Promise.resolve().then(operation).catch(error => {
      job.state = ['NetworkError', 'Timeout', 'ETIMEDOUT', 'ECONNRESET', 'ABORT_ERR', 'UnexpectedResponse'].includes(error.code) || error.name === 'TimeoutError' || error.name === 'AbortError' ? 'interrupted' : 'failed';
      job.error = safeError(error, settings.secrets()); job.updatedAt = Date.now(); save(job);
    }).finally(() => pending.delete(promise));
    pending.add(promise);
  }
  async function generate(input) {
    const fingerprint = digest(input);
    // Deduplicate before consulting changed settings or spending anything.
    requestId(input.requestId);
    const existing = [...jobs.values()].find(j => j.requestId === input.requestId);
    if (existing) { if (existing.hash !== digest(input) || existing.kind !== 'video') fail('REQUEST_ID_CONFLICT', '相同编号对应不同请求', 409); return view(existing); }
    if (input.confirmed !== true) fail('CONFIRMATION_REQUIRED', '请先确认这次生成；真实模式会调用已选服务商并可能计费', 409);
    if (/"(?:video-studio-media:|blob:)/i.test(JSON.stringify(input.inputs || {}))) fail('LOCAL_MEDIA_REFERENCE', '插件预览引用不能发给服务商，请使用上传图片、图片 data URL 或公开媒体地址');
    const config = settings.runtime();
    if (config.configError) fail('CONFIG_ERROR', config.configError, 409);
    if (input.sessionId && (typeof input.sessionId !== 'string' || input.sessionId.length > 200)) fail('INVALID_SESSION', '无效的会话标识');
    if (input.sketchReference !== undefined) {
      const ref = input.sketchReference;
      if (!ref || typeof ref !== 'object' || Array.isArray(ref) || typeof ref.project !== 'string' || !ref.project.trim() || typeof ref.shot !== 'string' || !ref.shot.trim()) fail('INVALID_SKETCH_REFERENCE', '草图参考需要 project 和 shot');
      if (!settings.sketchAsReference()) fail('SKETCH_REFERENCE_DISABLED', '草图作参考图尚未开启或已关闭，请移除草图参考后再提交', 409);
      if (input.mode !== 'reference' || input.sourceId) fail('SKETCH_REFERENCE_MODE', '分镜草图只用于 reference 模式，不能与历史再创作同时使用', 409);
      const prepared = await projects.buildShotPrompt(ref.project, ref.shot);
      if (!prepared.referenceImage) fail('SKETCH_REFERENCE_MISSING', '该镜头没有可读取的已保存草图，请先生成或移除草图参考', 409);
      input = { ...input, workspaceImages: [...(input.workspaceImages || []), prepared.referenceImage] };
    }
    if (input.workspaceImages?.length) {
      const urls = await service.workspaceImages(input.workspaceImages, null);
      input = { ...input, inputs: { ...input.inputs, images: [...(input.inputs?.images || []), ...urls.map(dataUrl => ({ dataUrl }))] } };
      delete input.workspaceImages;
    }
    if (!input.sourceId) normalizeGenerateRequest(input, { defaultModel: config.defaultModel });
    else if (!store.getRecord(input.sessionId || 'default', input.sourceId)) fail('SOURCE_NOT_FOUND', '找不到同一会话的再创作来源', 404);
    const { job, existed } = receipt(input, 'video', fingerprint);
    if (existed) return view(job);
    background(job, async () => {
      const result = input.sourceId
        ? await service.recreate(job.sessionId, input.sourceId, input, { toolCallId: job.requestId })
        : await service.generate(job.sessionId, input, { toolCallId: job.requestId });
      const record = result.record || result;
      job.recordId = record.id; job.state = 'running'; job.updatedAt = Date.now(); save(job);
    });
    return view(job);
  }
  async function sketch(input) {
    requestId(input.requestId);
    const old = [...jobs.values()].find(j => j.requestId === input.requestId);
    if (old) { if (old.hash !== digest(input) || old.kind !== 'sketch') fail('REQUEST_ID_CONFLICT', '相同编号对应不同请求', 409); return { ok: true, action: 'sketch', job: view(old), images: old.images || [] }; }
    if (input.confirmed !== true) fail('CONFIRMATION_REQUIRED', '请明确确认本镜头的付费草图生成', 409);
    if (!input.shot) fail('SHOT_REQUIRED', '草图必须指定单个镜头，每次只提交一张');
    const project = await projects.getProject(input.project);
    if (!project.planConfirmed) fail('PLAN_NOT_CONFIRMED', '请先确认人物卡和分镜', 409);
    const shot = project.shots.find(s => s.id === input.shot);
    if (!shot) fail('SHOT_NOT_FOUND', '镜头不存在', 404);
    const cfg = settings.imageConfig();
    if (!cfg.enabled || !cfg.model || !cfg.baseUrl || !cfg.apiKey) fail('IMAGE_GEN_UNCONFIGURED', '请先在设置中启用草图并明确配置图像模型、地址和密钥', 409);
    const { job } = receipt(input, 'sketch'); job.model = cfg.model; job.demo = false; job.provider = 'openai_images'; job.state = 'running'; save(job);
    const prompt = buildSketchPrompt(shot, project), size = resolveSketchSize(project.baseline, cfg.model);
    const planHash = digest({ shot: { ...shot, sketchPath: undefined }, sceneMap: project.sceneMap, baseline: project.baseline, style: project.style, characters: project.characters });
    background(job, async () => {
      const response = await fetch(endpoint(cfg.baseUrl, '/v1/images/generations'), { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: cfg.model, prompt, n: 1, size }), signal: AbortSignal.timeout(180000) });
      if (!response.ok) fail('IMAGE_API_ERROR', '图像接口返回 HTTP ' + response.status);
      const data = await response.json(), item = data?.data?.[0]; let buffer, mediaType = 'image/png';
      if (item?.b64_json) buffer = Buffer.from(item.b64_json, 'base64');
      else if (item?.url && /^https?:\/\//.test(item.url)) {
        const file = await fetch(item.url, { signal: AbortSignal.timeout(60000) });
        if (!file.ok) fail('IMAGE_DOWNLOAD_ERROR', '图片下载失败');
        buffer = Buffer.from(await file.arrayBuffer()); mediaType = file.headers.get('content-type') || mediaType;
      }
      if (!buffer?.length || buffer.length > 50 * 1024 * 1024) fail('IMAGE_EMPTY', '未收到有效大小的图片');
      const saved = saveSketchImage({ dir: path.join(project.dir, 'Storyboards'), shotId: shot.id, buffer, mediaType });
      const attach = projectQueue.then(async () => {
        const current = await projects.getProject(input.project);
        const currentShot = current.shots.find(item => item.id === shot.id);
        const currentHash = digest({ shot: { ...currentShot, sketchPath: undefined }, sceneMap: current.sceneMap, baseline: current.baseline, style: current.style, characters: current.characters });
        if (!current.planConfirmed || !currentShot || currentHash !== planHash) return false;
        await projects.saveShotSketch(input.project, shot.id, saved.path);
        return true;
      });
      projectQueue = attach.catch(() => {});
      const attachedToShot = await attach;
      if (!attachedToShot) job.warning = '生成期间分镜或人物卡已修改，草图文件已保留，未关联到新版分镜';
      job.images = [{ shot: shot.id, path: saved.path, attachedToShot }]; job.state = 'completed'; job.updatedAt = Date.now(); save(job);
    });
    return { ok: true, action: 'sketch', message: '草图任务已提交；用 video_job 查询结果', job: view(job), images: [] };
  }
  async function projectAction(input) {
    if (input.action === 'sketch') return sketch(input);
    if (['confirm-plan', 'delete'].includes(input.action) && input.confirmed !== true) fail('CONFIRMATION_REQUIRED', '此操作需要用户明确确认', 409);
    if (input.action === 'location') return { ok: true, action: 'location', storageRoot: root, projectsRoot: path.join(root, 'projects'), hint: '如需更改存储目录，设置 CODEX_VIDEO_STUDIO_HOME 后重启本地服务。' };
    if (input.action === 'delete' && history().some(j => j.kind === 'sketch' && !finished.has(j.state))) fail('ACTIVE_JOBS', '草图生成期间请等待再删除项目', 409);
    let payload = typeof input.payload === 'string' ? JSON.parse(input.payload) : { ...(input.payload || {}) };
    if (input.action === 'analyze' && payload.count !== undefined && payload.frameCount === undefined) payload.frameCount = payload.count;
    const result = await projectTool.execute({ ...input, payload: JSON.stringify(payload) });
    if (!result.ok) fail(result.error?.code || 'PROJECT_ERROR', result.error?.message || result.message);
    if (result.project) result.project = projectView(result.project);
    return result;
  }
  async function catalog() {
    const cfg = settings.runtime();
    if (cfg.demo) fail('DEMO_CATALOG', '演示模式不会请求上游模型目录');
    if (cfg.configError && !cfg.apiKey) fail('CONFIG_ERROR', cfg.configError);
    const rootUrl = cfg.provider === 'ark' ? cfg.ark.baseUrl : cfg.relay?.baseUrl;
    const suffix = cfg.provider === 'ark' || cfg.relay?.protocol === 'ark' ? '/api/v3/models' : '/v1/models';
    const response = await fetch(endpoint(rootUrl, suffix), { headers: { Authorization: 'Bearer ' + cfg.apiKey }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) fail('CATALOG_ERROR', '模型目录返回 HTTP ' + response.status);
    const body = await response.json(), items = body.data || body.models || body.items;
    if (!Array.isArray(items)) fail('CATALOG_FORMAT', '模型目录不是受支持的列表格式');
    return { ok: true, source: 'upstream', items: items.map(m => ({ id: String(m.id || m.name || m), label: String(m.display_name || m.label || m.id || m.name || m) })) };
  }
  return {
    root, settings, store, tasks, service, projects,
    models: () => ({ items: listModels(), source: 'bundled-unverified', defaultModel: settings.runtime().defaultModel }),
    async state() { return { ok: true, settings: settings.view(), models: this.models(), jobs: history(true), projects: await projects.listProjects() }; },
    history, generate, catalog,
    job: (id, app = false) => view(find(id), app),
    async wait(id, seconds = 0) { const end = Date.now() + Math.min(20, Math.max(0, seconds)) * 1000; let result; do { result = view(find(id)); if (finished.has(result.state) || Date.now() >= end) return result; await sleep(250); } while (true); },
    async cancel(id) { const job = find(id); if (!job.recordId) fail('CANCEL_UNAVAILABLE', '任务仍在提交或是草图任务，暂不支持取消', 409); await tasks.cancelRecord(job.sessionId, job.recordId); return view(job); },
    async remove(id) {
      const job = find(id), current = view(job);
      if (!finished.has(current.state)) fail('ACTIVE_JOBS', '请先等待或取消运行中的任务，再删除本地记录', 409);
      if (job.recordId) await service.remove(job.sessionId, job.recordId);
      fs.rmSync(path.join(jobsDir, job.id + '.json'), { force: true }); jobs.delete(job.id);
    },
    updateSettings(patch) { if (active()) fail('ACTIVE_JOBS', '请等待进行中的任务结束后修改连接，避免把查询发送到另一服务商', 409); return settings.update(patch); },
    project(input) { const next = projectQueue.then(() => projectAction(input)); projectQueue = next.catch(() => {}); return next; },
    async close() { tasks.stop(); await Promise.allSettled([...pending]); tasks.stop(); },
    error: error => safeError(error, settings.secrets())
  };
}
