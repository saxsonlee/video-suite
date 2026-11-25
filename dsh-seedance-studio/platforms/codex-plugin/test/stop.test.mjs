import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT, writeJson, readJson } from '../server/util.mjs';

function fixture(t, pid, ownerPid = pid) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-stop-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const runtime = path.join(root, 'runtime.json'), owner = path.join(root, 'daemon.lock/owner.json');
  writeJson(runtime, { pid, origin: 'http://127.0.0.1:1', token: 'fixture-only' });
  writeJson(owner, { pid: ownerPid });
  writeJson(path.join(root, 'settings.json'), { image: { sketchAsReference: true } });
  const run = () => spawnSync(process.execPath, [path.join(ROOT, 'scripts/codex/stop.mjs')], { env: { ...process.env, CODEX_VIDEO_STUDIO_HOME: root }, encoding: 'utf8', windowsHide: true });
  return { root, runtime, owner, run };
}

test('updating after a daemon exits clears its stale descriptor while retaining user data', t => {
  const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8', windowsHide: true });
  assert.equal(dead.status, 0);
  const f = fixture(t, Number(dead.stdout));
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already exited/);
  assert.equal(fs.existsSync(f.runtime), false); assert.equal(fs.existsSync(f.owner), false);
  assert.deepEqual(readJson(path.join(f.root, 'settings.json')), { image: { sketchAsReference: true } });
});

test('stale cleanup keeps another owner and refuses to stop an unverified live process', t => {
  const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8', windowsHide: true });
  const stale = fixture(t, Number(dead.stdout), process.pid);
  assert.equal(stale.run().status, 0);
  assert.equal(fs.existsSync(stale.runtime), false); assert.equal(readJson(stale.owner).pid, process.pid);
  const live = fixture(t, process.pid);
  assert.notEqual(live.run().status, 0);
  assert.equal(readJson(live.runtime).pid, process.pid); assert.equal(readJson(live.owner).pid, process.pid);
});
