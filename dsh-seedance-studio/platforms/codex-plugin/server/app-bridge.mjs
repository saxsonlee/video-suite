import { ensureDaemon } from './launcher.mjs';
import { isSpaRoute } from './spa-api.mjs';
import { fail } from './util.mjs';

export const MEDIA_CHUNK_BYTES = 512 * 1024;
export const MEDIA_LIMIT_BYTES = 256 * 1024 * 1024;
const REF = /^video-studio-media:([a-f0-9]{36})$/;
const GET_PATHS = new Set(['/api/state', '/api/jobs']);
const POST_PATHS = new Set(['/api/settings', '/api/models', '/api/generate', '/api/project', '/api/panel-pending']);

function allowed(method, route) {
  if (isSpaRoute(method, route)) return true;
  if (typeof route === 'string' && route.startsWith('/api/video-project/')) return true;
  // Validate the exact path before resolving it against the private loopback origin.
  if (typeof route !== 'string' || route.length > 512) return false;
  if (method === 'GET' && GET_PATHS.has(route)) return true;
  if (method === 'POST' && POST_PATHS.has(route)) return true;
  const pattern = method === 'GET' ? /^\/api\/jobs\/([^/]+)$/ : method === 'POST' ? /^\/api\/jobs\/([^/]+)\/cancel$/ : null;
  const match = pattern?.exec(route);
  if (match) { try { return /^[A-Za-z0-9_.:-]{8,128}$/.test(decodeURIComponent(match[1])); } catch { return false; } }
  return false;
}

function privateReferences(value, token) {
  if (typeof value === 'string') {
    const match = /^\/media\/([a-f0-9]{36})\?token=([a-f0-9]+)$/.exec(value);
    if (match && match[2] === token) return 'video-studio-media:' + match[1];
    return value;
  }
  if (Array.isArray(value)) return value.map(item => privateReferences(item, token));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, privateReferences(item, token)]));
  return value;
}

async function request(runtime, route, options) {
  try {
    return await fetch(runtime.origin + route, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(55000),
      headers: { 'X-Video-Studio-Token': runtime.token, ...options?.headers }
    });
  } catch {
    fail('LOCAL_CONNECTION_LOST', '插件后台连接中断。已提交的任务请按原 requestId 查询，不要重新提交。', 503);
  }
}

export async function callApp(args, runtimeOverride) {
  if (!args || !allowed(args.method, args.path)) fail('APP_ROUTE_REJECTED', '不支持的插件操作', 400);
  if (args.body !== undefined && (!args.body || typeof args.body !== 'object' || Array.isArray(args.body))) fail('INVALID_BODY', '操作参数必须是对象');
  const runtime = runtimeOverride || await ensureDaemon();
  const response = await request(runtime, args.path, {
    method: args.method,
    ...(args.method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args.body || {}) } : {})
  });
  let data;
  try { data = await response.json(); }
  catch { fail('LOCAL_RESPONSE_LOST', '插件后台响应无法解析。请按原 requestId 查询已提交的任务。', 503); }
  if (!data || typeof data.ok !== 'boolean') fail('LOCAL_RESPONSE_LOST', '插件后台返回了无效响应。请查询原任务编号。', 503);
  if (!response.ok) data.status = response.status;
  return privateReferences(data, runtime.token);
}

export async function readAppMedia(args, runtimeOverride) {
  const id = typeof args?.reference === 'string' && REF.exec(args.reference)?.[1];
  const offset = args?.offset ?? 0, length = args?.length ?? MEDIA_CHUNK_BYTES;
  if (!id || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 1 || length > MEDIA_CHUNK_BYTES) fail('INVALID_MEDIA_REQUEST', '媒体引用、起点或片段大小无效');
  if (offset >= MEDIA_LIMIT_BYTES) fail('MEDIA_TOO_LARGE', '面板最多预览 256 MiB 的媒体文件，请从本地输出路径打开', 413);
  const runtime = runtimeOverride || await ensureDaemon();
  const response = await request(runtime, '/media/' + id, { method: 'GET', headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
  if (!response.ok) {
    await response.body?.cancel();
    fail('MEDIA_UNAVAILABLE', '媒体不可读取。请刷新任务列表后重新打开预览。', response.status);
  }
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
  const mimeType = response.headers.get('content-type')?.split(';')[0];
  const total = Number(range?.[3]), end = Number(range?.[2]);
  if (response.status !== 206 || !range || Number(range[1]) !== offset || !Number.isSafeInteger(total) || end < offset || end >= total || end - offset + 1 > length || !/^(video\/(mp4|quicktime)|image\/(png|jpeg|webp))$/.test(mimeType || '')) {
    await response.body?.cancel(); fail('INVALID_MEDIA_RESPONSE', '插件媒体响应无效');
  }
  if (total > MEDIA_LIMIT_BYTES) { await response.body?.cancel(); fail('MEDIA_TOO_LARGE', '面板最多预览 256 MiB 的媒体文件，请从本地输出路径打开', 413); }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== end - offset + 1) fail('MEDIA_INCOMPLETE', '媒体片段不完整，请重新打开预览');
  return { ok: true, reference: args.reference, mimeType, total, offset, nextOffset: end + 1, data: bytes.toString('base64'), eof: end + 1 === total };
}
