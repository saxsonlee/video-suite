import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, PLATFORM_ROOT, dataRoot, readJson, sleep, fail } from './util.mjs';

export async function ensureDaemon(root = dataRoot()) {
  fs.mkdirSync(root, { recursive: true });
  const runtimeFile = path.join(root, 'runtime.json');
  async function health() {
    const state = readJson(runtimeFile);
    if (!state?.origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(state.origin)) return null;
    try {
      const r = await fetch(state.origin + '/api/health', { headers: { 'X-Video-Studio-Token': state.token }, signal: AbortSignal.timeout(800) });
      const data = await r.json();
      if (data.ok && data.name === 'codex-video-studio' && data.pid === state.pid && path.resolve(data.root) === path.resolve(root)) return state;
    } catch {} return null;
  }
  const live = await health(); if (live) return live;
  const lock = path.join(root, 'daemon.lock');
  if (fs.existsSync(lock)) {
    const owner = readJson(path.join(lock, 'owner.json'));
    let alive = false; if (owner?.pid) { try { process.kill(owner.pid, 0); alive = true; } catch {} }
    if (!alive && Date.now() - fs.statSync(lock).mtimeMs > 5000) {
      fs.rmSync(path.join(lock, 'owner.json'), { force: true });
      try { fs.rmdirSync(lock); } catch {}
    }
  }
  const child = spawn(process.execPath, [path.join(PLATFORM_ROOT, 'server', 'daemon.mjs')], { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, CODEX_VIDEO_STUDIO_HOME: root } });
  let spawnError; child.on('error', error => { spawnError = error; }); child.unref();
  const end = Date.now() + 25000;
  while (Date.now() < end) { if (spawnError) throw spawnError; const state = await health(); if (state) return state; await sleep(200); }
  fail('DAEMON_START_FAILED', '本地视频服务未能启动。检查 Node.js 和数据目录；不要重复提交生成任务。');
}
export async function rpc(name, args = {}) {
  const runtime = await ensureDaemon();
  let response;
  try {
    response = await fetch(runtime.origin + '/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Video-Studio-Token': runtime.token }, body: JSON.stringify({ name, arguments: args }), signal: AbortSignal.timeout(55000) });
  } catch { fail('LOCAL_CONNECTION_LOST', '本地连接中断。若已提交生成，请用 video_job 按原 requestId 查询；不会自动重发。', 503); }
  return response.json();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--panel')) {
  process.stdout.write('Video Studio is a native Codex plugin. In Codex, say: 打开视频工作台\nCall open_video_studio to open its embedded panel. Reload plugins after installation.\n');
}
