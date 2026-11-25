import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fail, inside, readJson, writeJson } from './util.mjs';
import { createStudio } from './studio.mjs';
import { VERSION } from './version.mjs';
import { createSpaApi } from './spa-api.mjs';
import { createVideoProjectApi } from './video-project-api.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4', '.mov': 'video/quicktime' };
function equal(a, b) { return typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
async function readBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail('CONTENT_TYPE', '请求需要 application/json', 415);
  let total = 0; const chunks = [];
  for await (const chunk of req) { total += chunk.length; if (total > 48 * 1024 * 1024) fail('BODY_TOO_LARGE', '请求超过 48 MiB', 413); chunks.push(chunk); }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { fail('INVALID_JSON', 'JSON 格式错误'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('INVALID_BODY', '请求必须是 JSON 对象');
  return body;
}
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data));
}
export async function startServer({ root, token = randomBytes(32).toString('hex'), port = 0, studioOptions, dshSettingsFile = '' } = {}) {
  const studio = await createStudio(root, { ...studioOptions, dshSettingsFile });
  const videoProjectApi = createVideoProjectApi({ root });
  const media = new Map(), mediaByPath = new Map();
  const pendingFile = path.join(root, 'panel-pending.json');
  function updatePending(body) {
    if (!['set', 'clear'].includes(body.action) || !/^[A-Za-z0-9_.:-]{8,128}$/.test(body.requestId || '')) fail('INVALID_PENDING', '未决任务操作或编号无效');
    const previous = readJson(pendingFile);
    if (previous && previous.id !== body.requestId) fail('PENDING_CONFLICT', '还有其他未核验的任务，请刷新工作台并先查询原任务', 409);
    if (body.action === 'clear') { writeJson(pendingFile, null); return { ok: true, pending: null }; }
    if (!['video', 'sketch'].includes(body.kind) || (previous && previous.kind !== body.kind)) fail('INVALID_PENDING', '任务类型与保存的编号不匹配');
    const pending = previous || { id: body.requestId, kind: body.kind, createdAt: Date.now() };
    writeJson(pendingFile, pending); return { ok: true, pending };
  }
  let origin;
  function mediaUrl(file) {
    if (!file || !fs.existsSync(file)) return undefined;
    const real = fs.realpathSync(file);
    if (!inside(fs.realpathSync(root), real)) return undefined;
    let id = mediaByPath.get(real);
    if (!id) { id = randomBytes(18).toString('hex'); mediaByPath.set(real, id); media.set(id, real); }
    return '/media/' + id + '?token=' + token;
  }
  function appJob(job) {
    return { ...job, videoUrl: mediaUrl(job.videoPath), lastFrameUrl: mediaUrl(job.lastFramePath), images: job.images?.map(image => ({ ...image, url: mediaUrl(image.path) })) };
  }
  function appProject(result) {
    if (result.frames) result.frames = result.frames.map(frame => typeof frame === 'string' ? { path: frame, url: mediaUrl(frame) } : { ...frame, url: mediaUrl(frame.path) });
    if (result.images) result.images = result.images.map(image => ({ ...image, url: mediaUrl(image.path) }));
    if (result.job) result.job = appJob(result.job);
    return result;
  }
  const spaRequest = createSpaApi({ root, studio, mediaUrl, appProject });
  async function sendFile(req, res, file) {
    const stat = await fs.promises.stat(file); if (!stat.isFile()) fail('NOT_FOUND', '文件不存在', 404);
    let start = 0, end = stat.size - 1, status = 200;
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }); res.end(); return; }
      if (!match[1]) start = Math.max(0, stat.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }); res.end(); return; }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = Math.max(0, end - start + 1); res.writeHead(status, headers);
    if (req.method === 'HEAD' || stat.size === 0) { res.end(); return; }
    const stream = fs.createReadStream(file, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'");
    try {
      if (req.headers.host !== new URL(origin).host) fail('HOST_REJECTED', 'Invalid host', 403);
      if (req.headers.origin && req.headers.origin !== origin) fail('ORIGIN_REJECTED', 'Cross-origin requests are not accepted', 403);
      const url = new URL(req.url, origin), method = req.method;
      const cookie = /(?:^|;\s*)video_studio=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      const supplied = req.headers['x-video-studio-token'] || url.searchParams.get('token') || (method === 'GET' || method === 'HEAD' ? cookie : null);
      if (!equal(supplied, token)) fail('UNAUTHORIZED', '请从 Codex 的 open_video_studio 工具或启动脚本打开面板', 401);
      if (!['GET', 'HEAD', 'POST'].includes(method)) fail('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
      const route = url.pathname;
      if (route.startsWith('/api/seedance/')) {
        const body = method === 'POST' ? await readBody(req) : undefined;
        return json(res, 200, await spaRequest(method, route + url.search, body));
      }
      if (route.startsWith('/api/video-project/')) {
        const body = method === 'POST' ? await readBody(req) : undefined;
        const result = await videoProjectApi.handle(method, route, url.searchParams, body);
        return json(res, result.status, result.value);
      }
      if (method === 'GET' && route === '/api/health') return json(res, 200, { ok: true, name: 'codex-video-studio', version: VERSION, pid: process.pid, root });
      if (method === 'GET' && route === '/api/state') { const state = await studio.state(); state.jobs = state.jobs.map(appJob); state.pending = readJson(pendingFile); return json(res, 200, state); }
      if (method === 'GET' && route === '/api/jobs') return json(res, 200, { ok: true, jobs: studio.history(true).map(appJob) });
      if (method === 'GET' && /^\/api\/jobs\/[^/]+$/.test(route)) return json(res, 200, { ok: true, job: appJob(studio.job(decodeURIComponent(route.split('/').pop()), true)) });
      if (method === 'POST') {
        const body = await readBody(req);
        if (route === '/api/panel-pending') return json(res, 200, updatePending(body));
        if (route === '/api/settings') return json(res, 200, { ok: true, settings: studio.updateSettings(body) });
        if (route === '/api/models') return json(res, 200, await studio.catalog());
        if (route === '/api/generate') {
          if (JSON.stringify(body.inputs || {}).includes(token)) fail('LOCAL_MEDIA_REFERENCE', '本地预览链接不可发送给模型；请将图片转为上传文件或 data URL');
          return json(res, 202, { ok: true, job: appJob(await studio.generate(body)) });
        }
        if (route === '/api/project') return json(res, 200, appProject(await studio.project(body)));
        if (/^\/api\/jobs\/[^/]+\/cancel$/.test(route)) return json(res, 200, { ok: true, job: appJob(await studio.cancel(decodeURIComponent(route.split('/')[3]))) });
        if (route === '/rpc') return json(res, 200, await dispatchTool(studio, body.name, body.arguments || {}, origin + '/?token=' + token));
        fail('NOT_FOUND', '接口不存在', 404);
      }
      if (route.startsWith('/media/')) {
        const file = media.get(route.slice(7)); if (!file) fail('NOT_FOUND', '媒体不存在，请刷新任务列表', 404);
        if (!inside(fs.realpathSync(root), fs.realpathSync(file))) fail('MEDIA_PATH', '媒体路径不在当前插件数据目录', 403);
        return await sendFile(req, res, file);
      }
      fail('NOT_FOUND', '页面不存在', 404);
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 400, { ok: false, error: studio.error(error), ...(error.code === 'PENDING_CONFLICT' ? { pending: readJson(pendingFile) } : {}) });
      else res.destroy();
    }
  });
  server.requestTimeout = 240000; server.headersTimeout = 15000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = 'http://127.0.0.1:' + server.address().port;
  return { server, studio, token, origin, url: origin + '/?token=' + token, async close() { await studio.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
export async function dispatchTool(studio, name, args, panelUrl) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) fail('INVALID_ARGS', '工具参数必须是对象');
  switch (name) {
    case 'open_video_studio': return { ok: true, panel: 'video-studio', version: VERSION, protocolVersion: 1 };
    case 'video_studio_status': { const s = studio.settings.view(); return { ok: true, provider: s.provider, demo: s.provider === 'demo', model: s.model, hasKey: s.hasKey, dataDir: s.dataDir, activeJobs: studio.history().filter(j => !['completed', 'failed', 'interrupted'].includes(j.state)).length, imageEnabled: s.image.enabled }; }
    case 'video_models': return { ok: true, ...studio.models() };
    case 'video_generate': {
      const accessToken = new URL(panelUrl).searchParams.get('token');
      if (accessToken && JSON.stringify(args.inputs || {}).includes(accessToken)) fail('LOCAL_MEDIA_REFERENCE', '本地预览链接不可发送给模型；请用本地文件或图片 data URL');
      return { ok: true, job: await studio.generate(args) };
    }
    case 'video_job': return { ok: true, job: await studio.wait(args.id, args.waitSeconds) };
    case 'video_history': return { ok: true, jobs: studio.history(false, args.sessionId).slice(0, Math.max(1, Math.min(200, Number(args.limit) || 30))) };
    case 'video_cancel': return { ok: true, job: await studio.cancel(args.id) };
    case 'video_project': return await studio.project(args);
    default: fail('UNKNOWN_TOOL', '未知工具', 404);
  }
}
