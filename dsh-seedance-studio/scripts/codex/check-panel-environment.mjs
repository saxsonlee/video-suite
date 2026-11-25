// Verify environment/project contract through the native bridge.
// The shared SPA's project editor is Lead-owned and is not yet migrated.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { chromium } from './dependencies.mjs';
import { ROOT } from '../../platforms/codex-plugin/server/util.mjs';
import { startServer } from '../../platforms/codex-plugin/server/http.mjs';
import { mountNativePanel } from './native-panel-host.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-shared-environment-'));
const sketch = path.join(root, 'fixture-sketch.jpg');
fs.copyFileSync(path.join(ROOT, 'media/demo-lastframe.jpg'), sketch);
const server = await startServer({ root, studioOptions: { env: {}, taskOptions: { autoPoll: false } } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const host = await mountNativePanel(page, server);
  const frame = host.frame;
  const invoke = (route, body) => frame.evaluate(async ({ route, body }) => window.SeedanceHost.call('POST', '/api/seedance/' + route, body), { route, body });
  const project = '共享前端桥环境契约', globalEnvironment = '黄昏，雨后，冷蓝霓虹与暖粉侧光';
  assert.equal((await invoke('project', { action: 'create', project })).ok, true);
  await invoke('project', { action: 'save-characters', project, payload: { characters: [{ name: '小林', appearance: '蓝风衣', notes: '保留' }] } });
  const saved = await invoke('project', { action: 'save-shots', project, payload: { shots: [
    { id: 'Shot1', shotType: '中景', camera: '平视', movement: '跟拍', action: '小林走过街口', environment: '黄昏，冷蓝背景', duration: 5, characters: ['小林'], sketchPath: sketch },
    { id: 'Shot2', action: '小林回头', environment: '夜晚，黑色天空', duration: 5, characters: ['小林'] }
  ], sceneMap: { environment: globalEnvironment, description: '北门在左', objects: ['路灯'] }, baseline: { ratio: '9:16', seed: 42 } } });
  assert.equal(saved.ok, true);
  assert.ok(saved.value.warnings.some(w => w.code === 'ENVIRONMENT_JUMP'));
  await invoke('project', { action: 'confirm-plan', project, confirmed: true });
  const prepared = await invoke('project', { action: 'build-prompt', project, shot: 'Shot1' });
  assert.equal(prepared.ok, true);
  assert.ok(prepared.value.prompt.includes(globalEnvironment));
  assert.ok(prepared.value.prompt.includes('黄昏，冷蓝背景'));
  assert.equal(prepared.value.referenceImage, '');
  const settings = await invoke('settings', { image: { sketchAsReference: true } });
  assert.equal(settings.ok, true);
  const reference = await invoke('project', { action: 'build-prompt', project, shot: 'Shot1' });
  assert.match(reference.value.referenceImage, /^video-studio-media:/);
  const review = await invoke('project', { action: 'review', project, shot: 'Shot1' });
  assert.equal(review.value.checks.find(c => c.key === 'environment').expected, '黄昏，冷蓝背景');
  const reopened = await invoke('project', { action: 'get', project });
  assert.deepEqual(reopened.value.project.shots.sceneMap.objects, ['路灯']);
  assert.equal(reopened.value.project.characters[0].notes, '保留');
  await invoke('project', { action: 'save-shots', project, payload: { ...reopened.value.project.shots, sceneMap: { ...reopened.value.project.shots.sceneMap, environment: '清晨，白雾' } } });
  assert.equal((await invoke('project', { action: 'build-prompt', project, shot: 'Shot1' })).error.code, 'PLAN_NOT_CONFIRMED');
  assert.deepEqual(host.network, []);
  await host.teardown();
  console.log(JSON.stringify({ ok: true, testedSurface: 'native bridge project/environment API', sharedProjectEditor: 'pending Lead migration', checks: ['environment save/reopen/prompt', 'environment warnings and QA', 'metadata preservation', 'plan invalidation', 'independent sketch opt-in/private reference'] }, null, 2));
} finally { await browser.close(); await server.close(); fs.rmSync(root, { recursive: true, force: true }); }
