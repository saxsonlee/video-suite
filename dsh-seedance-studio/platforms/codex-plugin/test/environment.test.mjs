import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createStudio } from '../server/studio.mjs';
import { createSettings } from '../server/settings.mjs';
import { ROOT, sleep } from '../server/util.mjs';
import { buildSketchPrompt } from '../vendor/video-project/server/imagegen.js';

const project = '环境同步测试';
const globalEnvironment = '黄昏，雨后街道，霓虹灯冷蓝与暖粉，湿路面反光';
const shot = { id: 'Shot1', shotType: '全景', camera: '平视', movement: '跟拍', duration: 5, action: '小林经过街口', purpose: '交代地点', characters: ['小林'], scene: '十字路口', lighting: '暖粉侧光', environment: '黄昏，雨停，冷蓝背景与暖粉侧光' };
async function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-environment-'));
  const studio = await createStudio(root, { taskOptions: { autoPoll: false }, ...options });
  t.after(async () => { await studio.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, studio };
}
async function plan(studio, shots = [shot], sceneMap = { environment: globalEnvironment, description: '北门在左，机位朝北', objects: ['路灯'], notes: '保持位置' }) {
  await studio.project({ action: 'create', project });
  await studio.project({ action: 'save-characters', project, payload: { characters: [{ name: '小林', appearance: '黑短发、蓝风衣' }] } });
  return studio.project({ action: 'save-shots', project, payload: { shots, sceneMap, baseline: { ratio: '9:16', seed: 42 } } });
}
async function confirm(studio) { await studio.project({ action: 'confirm-plan', project, confirmed: true }); }
async function until(operation, predicate) {
  const end = Date.now() + 4000;
  while (Date.now() < end) { const value = await operation(); if (predicate(value)) return value; await sleep(10); }
  throw new Error('Timed out waiting for fixture operation');
}
test('environment survives save/reopen, reaches video and sketch prompts, and appears in review', async t => {
  const { studio } = await fixture(t);
  const saved = await plan(studio);
  assert.equal(saved.project.shots.shots[0].environment, shot.environment);
  assert.equal(saved.project.shots.sceneMap.environment, globalEnvironment);
  assert.deepEqual(saved.project.shots.sceneMap.objects, ['路灯']);
  await confirm(studio);
  const prepared = await studio.project({ action: 'build-prompt', project, shot: 'Shot1' });
  assert.ok(prepared.prompt.includes(globalEnvironment));
  assert.ok(prepared.prompt.includes(shot.environment));
  assert.match(prepared.prompt, /不得从黄昏变成夜晚/);
  const raw = await studio.projects.getProject(project);
  const sketch = buildSketchPrompt(raw.shots[0], raw);
  assert.ok(sketch.includes(globalEnvironment) && sketch.includes(shot.environment));
  const review = await studio.project({ action: 'review', project, shot: 'Shot1' });
  assert.equal(review.checks.find(item => item.key === 'environment').expected, shot.environment);
  const detail = (await studio.project({ action: 'get', project })).project;
  await studio.project({ action: 'save-shots', project, payload: { ...detail.shots, sceneMap: { ...detail.shots.sceneMap, environment: '清晨，雾气，柔和白光' } } });
  await assert.rejects(studio.project({ action: 'build-prompt', project, shot: 'Shot1' }), e => e.code === 'PLAN_NOT_CONFIRMED');
});
test('missing and conflicting environments warn; legacy scene/light and global fallback remain usable', async t => {
  const { studio } = await fixture(t);
  const saved = await plan(studio, [shot, { ...shot, id: 'Shot2', environment: '夜晚，黑色天空，路灯亮起' }]);
  assert.ok(saved.warnings.some(warning => warning.code === 'ENVIRONMENT_JUMP'));
  const legacy = { ...shot, environment: undefined };
  const updated = await studio.project({ action: 'save-shots', project, payload: { shots: [legacy] } });
  assert.ok(updated.warnings.some(warning => warning.code === 'NO_SHOT_ENVIRONMENT'));
  await confirm(studio);
  const prepared = await studio.project({ action: 'build-prompt', project, shot: 'Shot1' });
  assert.ok(prepared.prompt.includes('十字路口；暖粉侧光'));
  const globalOnly = await studio.project({ action: 'save-shots', project, payload: { shots: [{ ...legacy, scene: '', lighting: '' }] } });
  assert.ok(globalOnly.warnings.some(w => w.code === 'MISSING_ENVIRONMENT'));
  assert.ok(!globalOnly.warnings.some(w => w.code === 'NO_ENVIRONMENT'));
  const review = await studio.project({ action: 'review', project, shot: 'Shot1' });
  assert.equal(review.checks.find(item => item.key === 'environment').expected, globalEnvironment);
});
test('sketch reference preference defaults off, persists independently, and rejects non-boolean values', async t => {
  const { root, studio } = await fixture(t);
  assert.equal(studio.settings.view().image.sketchAsReference, false);
  studio.updateSettings({ image: { sketchAsReference: true } });
  assert.equal(studio.settings.view().image.enabled, false);
  assert.equal(studio.settings.view().image.model, '');
  assert.equal(createSettings(root).view().image.sketchAsReference, true);
  assert.throws(() => studio.updateSettings({ image: { sketchAsReference: 'false' } }), e => e.code === 'INVALID_SETTINGS');
  studio.updateSettings({ image: { sketchAsReference: false } });
  assert.equal(createSettings(root).view().image.sketchAsReference, false);
});
test('selected sketch becomes a reference image only with the saved opt-in, and keeps request-id deduplication', async t => {
  let creates = 0, payload;
  const { studio } = await fixture(t, { env: { TEST_KEY: 'fixture-only' }, taskOptions: { autoPoll: false, createClient: () => ({ createTask: async body => { creates++; payload = body; return { id: 'fixture-video' }; } }) } });
  const sample = path.join(ROOT, 'media/demo-lastframe.jpg');
  await plan(studio, [{ ...shot, sketchPath: sample }]); await confirm(studio);
  assert.equal((await studio.project({ action: 'build-prompt', project, shot: 'Shot1' })).referenceImage, '');
  const input = { confirmed: true, requestId: randomUUID(), prompt: globalEnvironment, mode: 'reference', sketchReference: { project, shot: 'Shot1' } };
  await assert.rejects(studio.generate(input), e => e.code === 'SKETCH_REFERENCE_DISABLED');
  studio.updateSettings({ provider: 'ark', model: 'doubao-seedance-2-5-260628', keyEnv: 'TEST_KEY', image: { sketchAsReference: true } });
  assert.equal((await studio.project({ action: 'build-prompt', project, shot: 'Shot1' })).referenceImage, sample);
  await assert.rejects(studio.generate({ ...input, mode: 'text2video' }), e => e.code === 'SKETCH_REFERENCE_MODE');
  const one = await studio.generate(input), two = await studio.generate(input);
  assert.equal(one.id, two.id);
  await until(() => studio.job(one.id), result => !!result.recordId);
  assert.equal(creates, 1);
  const image = payload.content.find(item => item.type === 'image_url');
  assert.equal(image.role, 'reference_image');
  assert.match(image.image_url.url, /^data:image\/jpeg;base64,/);
});
test('missing sketch and stale opt-in are rejected before a video submission', async t => {
  const { studio } = await fixture(t);
  await plan(studio, [{ ...shot, sketchPath: path.join(os.tmpdir(), randomUUID() + '.png') }]); await confirm(studio);
  studio.updateSettings({ image: { sketchAsReference: true } });
  const prepared = await studio.project({ action: 'build-prompt', project, shot: 'Shot1' });
  assert.equal(prepared.referenceImage, ''); assert.ok(prepared.checks.some(line => line.includes('没有可读取的草图')));
  const input = { confirmed: true, requestId: randomUUID(), prompt: 'fixture', mode: 'reference', sketchReference: { project, shot: 'Shot1' } };
  await assert.rejects(studio.generate(input), e => e.code === 'SKETCH_REFERENCE_MISSING');
  studio.updateSettings({ image: { sketchAsReference: false } });
  await assert.rejects(studio.generate(input), e => e.code === 'SKETCH_REFERENCE_DISABLED');
  assert.equal(studio.history().length, 0);
});
async function imageProvider(t, onRequest) {
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', chunk => raw += chunk); req.on('end', () => onRequest(JSON.parse(raw), () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ b64_json: fs.readFileSync(path.join(ROOT, 'media/demo-lastframe.jpg')).toString('base64') }] }));
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return 'http://127.0.0.1:' + server.address().port;
}
test('completed sketch is linked to the confirmed shot and offered on the next prompt build', async t => {
  let requests = 0;
  const address = await imageProvider(t, (body, reply) => { requests++; assert.ok(body.prompt.includes(globalEnvironment)); reply(); });
  const { studio } = await fixture(t, { env: { IMAGE_KEY: 'fixture-only' } });
  await plan(studio); await confirm(studio);
  studio.updateSettings({ image: { enabled: true, sketchAsReference: true, model: 'fixture-image', baseUrl: address, keyEnv: 'IMAGE_KEY' } });
  const input = { action: 'sketch', project, shot: 'Shot1', confirmed: true, requestId: randomUUID() };
  const first = await studio.project(input); assert.equal((await studio.project(input)).job.id, first.job.id);
  const done = await until(() => studio.job(first.job.id), value => value.state === 'completed' || value.state === 'failed');
  assert.equal(done.state, 'completed'); assert.equal(requests, 1);
  assert.equal(done.images[0].attachedToShot, true);
  const prepared = await studio.project({ action: 'build-prompt', project, shot: 'Shot1' });
  assert.equal(prepared.referenceImage, done.images[0].path);
  assert.equal(prepared.project.shots.planConfirmed, true);
});
test('a sketch finishing after storyboard edits cannot attach to the changed plan', async t => {
  let release, observed;
  const requested = new Promise(resolve => { observed = resolve; });
  const address = await imageProvider(t, (body, reply) => { release = reply; observed(); });
  const { studio } = await fixture(t, { env: { IMAGE_KEY: 'fixture-only' } });
  await plan(studio); await confirm(studio);
  studio.updateSettings({ image: { enabled: true, sketchAsReference: true, model: 'fixture-image', baseUrl: address, keyEnv: 'IMAGE_KEY' } });
  const receipt = await studio.project({ action: 'sketch', project, shot: 'Shot1', confirmed: true, requestId: randomUUID() });
  await requested;
  await studio.project({ action: 'save-shots', project, payload: { shots: [{ ...shot, environment: '清晨，白雾，柔光' }] } });
  release();
  const done = await until(() => studio.job(receipt.job.id), result => result.state === 'completed');
  assert.equal(done.images[0].attachedToShot, false); assert.ok(fs.existsSync(done.images[0].path));
  assert.match(done.warning, /分镜或人物卡已修改/);
  const detail = (await studio.project({ action: 'get', project })).project;
  assert.equal(detail.shots.shots[0].sketchPath, ''); assert.equal(detail.shots.planConfirmed, false);
});
