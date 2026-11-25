import path from 'node:path';
import fs from 'node:fs';
import { dataRoot, readJson, sleep } from '../../platforms/codex-plugin/server/util.mjs';
const root = dataRoot(), state = readJson(path.join(root, 'runtime.json'));
if (!state) { console.log('Video Studio is not running.'); process.exit(0); }
if (!Number.isSafeInteger(state.pid) || state.pid <= 0) throw new Error('Invalid local runtime process id');
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(state.origin)) throw new Error('Invalid local runtime descriptor');
function removeOwnState() {
  const lock = path.join(root, 'daemon.lock');
  if (readJson(path.join(root, 'runtime.json'))?.pid === state.pid) fs.rmSync(path.join(root, 'runtime.json'), { force: true });
  if (readJson(path.join(lock, 'owner.json'))?.pid === state.pid) { fs.rmSync(path.join(lock, 'owner.json'), { force: true }); try { fs.rmdirSync(lock); } catch {} }
}
try { process.kill(state.pid, 0); }
catch (error) {
  // A dead daemon cannot answer /api/health. Clear only its own stale records;
  // permission errors and live/unreachable processes must still be verified.
  if (error.code !== 'ESRCH') throw error;
  removeOwnState();
  console.log('Video Studio already exited; cleared its stale runtime records. Data and credentials retained.');
  process.exit(0);
}
const response = await fetch(state.origin + '/api/health', { headers: { 'X-Video-Studio-Token': state.token }, signal: AbortSignal.timeout(2000) });
const health = await response.json();
if (!health.ok || health.name !== 'codex-video-studio' || health.pid !== state.pid || path.resolve(health.root) !== root) throw new Error('Refusing to stop an unverified process');
const jobsResponse = await fetch(state.origin + '/api/jobs', { headers: { 'X-Video-Studio-Token': state.token } });
const jobs = (await jobsResponse.json()).jobs || [];
if (jobs.some(j => j.state === 'submitting' || (j.kind === 'sketch' && j.state === 'running'))) throw new Error('Wait until submission/sketch completes before stopping to preserve its receipt.');
process.kill(state.pid, 'SIGTERM'); await sleep(300);
removeOwnState();
console.log('Stopped the local Video Studio service. Provider tasks with remote IDs resume polling on the next launch. Data and credentials retained.');
