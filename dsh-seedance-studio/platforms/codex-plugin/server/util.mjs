import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';

export const PLATFORM_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT = path.resolve(PLATFORM_ROOT, '../..');
export const PANEL_FILE = fs.existsSync(path.join(PLATFORM_ROOT, 'frontend/panel.html'))
  ? path.join(PLATFORM_ROOT, 'frontend/panel.html')
  : path.join(ROOT, 'dist/codex/platforms/codex-plugin/frontend/panel.html');
export const VIDEO_PROJECT_PANEL_FILE = fs.existsSync(path.join(PLATFORM_ROOT, 'frontend/panel-video-project.html'))
  ? path.join(PLATFORM_ROOT, 'frontend/panel-video-project.html')
  : path.join(ROOT, 'dist/codex/platforms/codex-plugin/frontend/panel-video-project.html');
export function dataRoot(env = process.env) {
  return path.resolve(env.CODEX_VIDEO_STUDIO_HOME || path.join(env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'video-studio'));
}
export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temporary, file);
}
export function fail(code, message, status = 400) {
  throw Object.assign(new Error(message), { code, status });
}
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function digest(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function safeError(error, secrets = []) {
  let message = String(error?.message || '操作失败');
  for (const secret of secrets) if (secret) message = message.split(secret).join('[redacted]');
  message = message.replace(/https?:\/\/[^\s"'<>]+/gi, '[upstream-url]')
    .replace(/(?:Bearer\s+)[^\s"']+/gi, 'Bearer [redacted]');
  return { code: String(error?.code || 'STUDIO_ERROR'), message: message.slice(0, 1200) };
}
export function inside(root, file) {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel);
}
