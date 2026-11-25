import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { ROOT, readJson } from '../../platforms/codex-plugin/server/util.mjs';

const scratch = path.resolve(ROOT, '../_seedance-studio/codex-layout-2026-11-06');
fs.mkdirSync(scratch, { recursive: true });
const home = fs.mkdtempSync(path.join(scratch, 'install-home-'));
const market = path.join(home, 'local-marketplaces/video-studio-local');
const env = { ...process.env, CODEX_HOME: home, CODEX_VIDEO_STUDIO_HOME: path.join(home, 'video-studio') };
function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, env, windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0 || result.error) throw new Error('Installation check command failed: ' + (result.stderr || result.error?.message || result.status));
  return result.stdout;
}
function registeredRoot() {
  const registry = readJson(path.join(market, '.agents/plugins/marketplace.json'));
  return path.resolve(market, registry.plugins.find(plugin => plugin.name === 'video-studio').source.path);
}
run(process.execPath, [path.join(ROOT, 'scripts/codex/install.mjs')]);
const initial = registeredRoot();
fs.mkdirSync(env.CODEX_VIDEO_STUDIO_HOME, { recursive: true });
const sentinel = path.join(env.CODEX_VIDEO_STUDIO_HOME, 'retained-test-data.txt');
fs.writeFileSync(sentinel, 'existing data remains');
const lockHolder = spawn(process.execPath, ['-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'], { cwd: initial, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
await once(lockHolder.stdout, 'data');
try {
  run(process.execPath, [path.join(ROOT, 'scripts/codex/install.mjs'), '--update']);
  const updated = registeredRoot();
  assert.notEqual(updated, initial);
  assert.ok(fs.existsSync(path.join(initial, '.codex-plugin/plugin.json')));
  assert.ok(fs.existsSync(path.join(updated, 'platforms/codex-plugin/frontend/panel.html')));
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'existing data remains');
  const runtime = path.join(updated, 'platforms/codex-plugin/server/mcp.mjs');
  const config = readJson(path.join(updated, '.mcp.json'));
  assert.equal(config.mcpServers.video_studio.args[0], runtime);
  const version = readJson(path.join(updated, '.codex-plugin/plugin.json')).version;
  const cached = readJson(path.join(home, 'plugins/cache/video-studio-local/video-studio', version, '.mcp.json'));
  assert.equal(cached.mcpServers.video_studio.args[0], runtime, 'Codex cache must point to the updated runtime even for same-version updates');
  run(process.execPath, [path.join(ROOT, 'scripts/codex/check-plugin.mjs'), '--codex-home', home]);
  console.log(JSON.stringify({ ok: true, home, checks: ['install generated package', 'update with previous Windows working directory held open', 'refresh same-version Codex cache', 'preserve previous runtime and user data', 'native plugin enable/disable linkage'] }, null, 2));
} finally {
  lockHolder.kill();
  await once(lockHolder, 'exit');
}
