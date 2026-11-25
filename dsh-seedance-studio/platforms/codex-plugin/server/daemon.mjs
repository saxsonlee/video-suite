import fs from 'node:fs';
import path from 'node:path';
import { dataRoot, readJson, writeJson } from './util.mjs';
import os from 'node:os';
import { startServer } from './http.mjs';

/** 同机 DSH 插件共享的设置文件（Codex 面板未配置时继承，不复制密钥）。 */
function dshSettingsFile() {
  const home = process.env.DSH_HOME ? String(process.env.DSH_HOME) : path.join(os.homedir(), '.dsh');
  return path.join(home, 'storages', 'seedance-studio', 'settings.json');
}

const root = dataRoot(); fs.mkdirSync(root, { recursive: true });
const lock = path.join(root, 'daemon.lock');
try {
  fs.mkdirSync(lock);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  // 锁已存在：检查持有者是否还活着；已死则清理残留锁后继续启动（避免死锁导致服务永远起不来）
  const owner = readJson(path.join(lock, 'owner.json'));
  let alive = false;
  if (owner && owner.pid) {
    try { process.kill(owner.pid, 0); alive = true; } catch { alive = false; }
  }
  if (alive) process.exit(0);
  try {
    fs.rmSync(path.join(lock, 'owner.json'), { force: true });
    fs.rmdirSync(lock);
  } catch (cleanupError) {
    // 清理失败（权限等）时不阻塞：交给后续 EEXIST 行为
  }
  try { fs.mkdirSync(lock); } catch (retryError) { if (retryError.code === 'EEXIST') process.exit(0); throw retryError; }
}
writeJson(path.join(lock, 'owner.json'), { pid: process.pid, createdAt: Date.now() });
let instance;
function removeOwnState() {
  if (readJson(path.join(root, 'runtime.json'))?.pid === process.pid) fs.rmSync(path.join(root, 'runtime.json'), { force: true });
  if (readJson(path.join(lock, 'owner.json'))?.pid === process.pid) { fs.rmSync(path.join(lock, 'owner.json'), { force: true }); fs.rmdirSync(lock); }
}
try {
  instance = await startServer({ root, dshSettingsFile: dshSettingsFile() });
  writeJson(path.join(root, 'runtime.json'), { pid: process.pid, origin: instance.origin, token: instance.token, startedAt: Date.now() });
} catch (error) {
  removeOwnState(); process.stderr.write('Video Studio startup failed: ' + String(error.code || error.name) + '\n'); process.exit(1);
}
let stopping = false;
async function shutdown() { if (stopping) return; stopping = true; await instance.close(); removeOwnState(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
