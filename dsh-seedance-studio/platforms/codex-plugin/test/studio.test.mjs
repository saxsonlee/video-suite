import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createStudio } from '../server/studio.mjs';
import { createSettings } from '../server/settings.mjs';
import { startServer, dispatchTool } from '../server/http.mjs';
import { ROOT, writeJson, digest, sleep } from '../server/util.mjs';

function temp(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-video-test-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root; }
async function fixture(t, options = {}) { const root = temp(t); const studio = await createStudio(root, options); t.after(() => studio.close()); return { root, studio }; }
const shot = { id: 'Shot1', shotType: '中景', camera: '平视', action: '小林走过街角', dialogue: '无', movement: '跟拍', duration: 5, characters: ['小林'], task: '交代人物' };
async function plan(studio) {
  await studio.project({ action: 'create', project: '测试电影' });
  await studio.project({ action: 'save-characters', project: '测试电影', payload: { characters: [{ name: '小林', appearance: '黑色短发，灰风衣' }] } });
  await studio.project({ action: 'save-shots', project: '测试电影', payload: { shots: [shot], baseline: { ratio: '16:9', resolution: '720p', seed: 42 } } });
}
async function until(get, predicate, timeout = 3000) { const end = Date.now() + timeout; let result; do { result = await get(); if (predicate(result)) return result; await sleep(15); } while (Date.now() < end); throw new Error('Timed out: ' + JSON.stringify(result)); }

test('credentials stay in the vault; saved roots and explicit protocol survive reload', t => {
  const root = temp(t), secrets = new Map();
  const vault = { get: ref => secrets.get(ref) || '', set: (ref, value) => secrets.set(ref, value), delete: ref => secrets.delete(ref) };
  const settings = createSettings(root, { vault, env: {} });
  const key = 'secret-do-not-persist-' + randomUUID();
  const result = settings.update({ provider: 'relay', baseUrl: 'https://example.invalid/custom/', protocol: 'openai', model: 'exact-user-model', apiKey: key });
  assert.equal(result.hasKey, true); assert.equal(result.baseUrl, 'https://example.invalid/custom/');
  assert.ok(!JSON.stringify(result).includes(key)); assert.ok(!fs.readFileSync(path.join(root, 'settings.json'), 'utf8').includes(key));
  assert.equal(createSettings(root, { vault, env: {} }).runtime().relay.apiKey, key);
  assert.equal(settings.runtime().relay.protocol, 'openai'); assert.equal(settings.runtime().relay.baseUrl, result.baseUrl);
  settings.update({ apiKey: '' }); assert.equal(settings.runtime().relay.apiKey, key);
  assert.throws(() => settings.update({ protocol: 'guess-from-model' }), /协议/);
  const before = fs.readFileSync(path.join(root, 'settings.json'), 'utf8');
  assert.throws(() => settings.update({ baseUrl: 'https://user:password@example.invalid' }), /凭据/);
  assert.equal(fs.readFileSync(path.join(root, 'settings.json'), 'utf8'), before);
});

test('demo jobs deduplicate concurrently, complete, persist, and return summary-only tools', async t => {
  let now = Date.now(); const root = temp(t);
  const studio = await createStudio(root, { taskOptions: { autoPoll: false, now: () => now } }); t.after(() => studio.close());
  const input = { requestId: randomUUID(), prompt: '一只猫看雨', confirmed: true, params: { duration: 5, resolution: '720p', ratio: '16:9' } };
  const [a, b] = await Promise.all([studio.generate(input), studio.generate(input)]);
  assert.equal(a.id, b.id); assert.equal(studio.history().length, 1);
  const running = await until(() => studio.job(a.id), j => Boolean(j.recordId));
  assert.throws(() => studio.updateSettings({ model: 'another' }), /等待/);
  now += 15000; await studio.tasks.pollNow('default', running.recordId);
  const completed = studio.job(a.id); assert.equal(completed.state, 'completed'); assert.equal(completed.demo, true); assert.ok(fs.existsSync(completed.videoPath));
  assert.equal((await studio.generate(input)).id, a.id);
  await assert.rejects(studio.generate({ ...input, prompt: 'different' }), error => error.code === 'REQUEST_ID_CONFLICT');
  const publicResult = await dispatchTool(studio, 'video_job', { id: a.id }, 'unused');
  assert.equal(publicResult.job.prompt, undefined); assert.equal(publicResult.job.remoteVideoUrl, undefined);
  await studio.close();
  const reloaded = await createStudio(root, { taskOptions: { autoPoll: false } }); t.after(() => reloaded.close());
  assert.equal(reloaded.job(input.requestId).state, 'completed'); assert.equal((await reloaded.generate(input)).id, a.id);
});

test('workspace image requests retain the original idempotency fingerprint', async t => {
  const { studio } = await fixture(t, { taskOptions: { autoPoll: false } });
  const input = { requestId: randomUUID(), confirmed: true, prompt: '图中的场景缓慢移动', mode: 'image2video', workspaceImages: [path.join(ROOT, 'media', 'demo-lastframe.jpg')] };
  const a = await studio.generate(input), b = await studio.generate(input); assert.equal(a.id, b.id);
});

test('unknown in-flight submissions survive restart without replay', async t => {
  const root = temp(t), input = { requestId: randomUUID(), prompt: 'prompt', confirmed: true };
  const job = { id: 'job_' + randomUUID(), requestId: input.requestId, hash: digest(input), kind: 'video', state: 'submitting', sessionId: 'default', createdAt: Date.now(), updatedAt: Date.now() };
  writeJson(path.join(root, 'jobs', job.id + '.json'), job);
  const studio = await createStudio(root); t.after(() => studio.close());
  assert.equal(studio.job(job.id).state, 'interrupted'); assert.equal((await studio.generate(input)).id, job.id);
  assert.equal(studio.store.listRecords('default').length, 0);
});

test('real mode fails clearly when unconfigured, and does not fall back to demo', async t => {
  const { studio } = await fixture(t);
  studio.updateSettings({ provider: 'relay', protocol: 'openai', baseUrl: 'https://example.invalid', model: 'user-model' });
  await assert.rejects(studio.generate({ requestId: randomUUID(), prompt: 'test', confirmed: true }), error => error.code === 'CONFIG_ERROR');
  assert.equal(studio.history().length, 0);
  await assert.rejects(studio.generate({ requestId: randomUUID(), prompt: 'test' }), error => error.code === 'CONFIRMATION_REQUIRED');
});

test('project plan confirmation resets after edits, then prompt and version archives work', async t => {
  const { studio } = await fixture(t); await plan(studio);
  await assert.rejects(studio.project({ action: 'build-prompt', project: '测试电影', shot: 'Shot1' }), error => error.code === 'PLAN_NOT_CONFIRMED');
  await assert.rejects(studio.project({ action: 'confirm-plan', project: '测试电影' }), error => error.code === 'CONFIRMATION_REQUIRED');
  await studio.project({ action: 'confirm-plan', project: '测试电影', confirmed: true });
  const prompt = await studio.project({ action: 'build-prompt', project: '测试电影', shot: 'Shot1' });
  assert.ok(prompt.prompt.includes('小林')); assert.equal(prompt.project.shots.planConfirmed, true);
  const sourcePath = path.join(ROOT, 'media', 'demo.mp4');
  const first = await studio.project({ action: 'save-version', project: '测试电影', shot: 'Shot1', sourcePath });
  const second = await studio.project({ action: 'save-version', project: '测试电影', shot: 'Shot1', sourcePath });
  assert.notEqual(first.version, second.version); assert.ok(fs.existsSync(second.path));
  const full = await studio.project({ action: 'full-video', project: '测试电影', sourcePath }); assert.ok(fs.existsSync(full.path));
  await studio.project({ action: 'save-characters', project: '测试电影', payload: { characters: [{ name: '小林', appearance: '白风衣' }] } });
  await assert.rejects(studio.project({ action: 'build-prompt', project: '测试电影', shot: 'Shot1' }), error => error.code === 'PLAN_NOT_CONFIRMED');
  await assert.rejects(studio.project({ action: 'delete', project: '测试电影' }), error => error.code === 'CONFIRMATION_REQUIRED');
  await assert.rejects(studio.project({ action: 'create', project: '../escape' }));
});

test('frame extraction processes the bundled real video with ffmpeg', async t => {
  const { studio } = await fixture(t); await plan(studio);
  const result = await studio.project({ action: 'analyze', project: '测试电影', shot: 'Shot1', payload: { videoPath: path.join(ROOT, 'media', 'demo.mp4'), count: 3 } });
  assert.equal(result.mode, 'frames'); assert.equal(result.frames.length, 3);
  for (const frame of result.frames) assert.ok(fs.existsSync(frame.path || frame));
  assert.ok(Array.isArray(result.checklist));
});

test('HTTP auth, cross-origin rejection, range video playback, and no secret exposure', async t => {
  const root = temp(t); let now = Date.now();
  const instance = await startServer({ root, studioOptions: { taskOptions: { autoPoll: false, now: () => now } } }); t.after(() => instance.close());
  const headers = { 'X-Video-Studio-Token': instance.token };
  assert.equal((await fetch(instance.origin + '/api/state')).status, 401);
  assert.equal((await fetch(instance.origin + '/api/state', { headers: { ...headers, Origin: 'https://attacker.invalid' } })).status, 403);
  const state = await (await fetch(instance.origin + '/api/state', { headers })).json(); assert.equal(state.settings.provider, 'demo');
  const job = await instance.studio.generate({ requestId: randomUUID(), confirmed: true, prompt: '测试' });
  const running = await until(() => instance.studio.job(job.id), j => !!j.recordId);
  now += 15000; await instance.studio.tasks.pollNow('default', running.recordId);
  const jobs = await (await fetch(instance.origin + '/api/jobs', { headers })).json();
  const mediaUrl = jobs.jobs[0].videoUrl; assert.ok(mediaUrl.startsWith('/media/'));
  const range = await fetch(instance.origin + mediaUrl, { headers: { Range: 'bytes=0-31' } }); assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 32);
  const suffix = await fetch(instance.origin + mediaUrl, { headers: { Range: 'bytes=-16' } }); assert.equal(suffix.status, 206); assert.equal((await suffix.arrayBuffer()).byteLength, 16);
  assert.equal((await fetch(instance.origin + mediaUrl, { headers: { Range: 'bytes=999999999-' } })).status, 416);
  assert.equal((await fetch(instance.origin + '/api/settings', { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await fetch(instance.origin + '/src/settings.mjs', { headers })).status, 404);
});

test('mock provider receives one real video submission; route and protocol remain exact', async t => {
  let creates = 0, now = Date.now(); const { studio } = await fixture(t, {
    env: { TEST_VIDEO_KEY: 'mock-only-key' }, taskOptions: { autoPoll: false, now: () => now, createClient: cfg => {
      assert.equal(cfg.relay.protocol, 'openai'); assert.equal(cfg.defaultModel, 'my-exact-model');
      return { createTask: async payload => { creates++; assert.equal(payload.model, 'my-exact-model'); return { id: 'remote-1' }; }, getTask: async () => ({ id: 'remote-1', status: 'succeeded', videoUrl: 'https://mock.invalid/video.mp4' }) };
    }, downloadImpl: async (url, destination) => fs.copyFileSync(path.join(ROOT, 'media', 'demo.mp4'), destination) }
  });
  studio.updateSettings({ provider: 'relay', protocol: 'openai', model: 'my-exact-model', baseUrl: 'https://mock.invalid', keyEnv: 'TEST_VIDEO_KEY' });
  const input = { requestId: randomUUID(), prompt: '测试真实协议的模拟接口', confirmed: true };
  const a = await studio.generate(input); await studio.generate(input);
  const running = await until(() => studio.job(a.id), j => !!j.recordId);
  await studio.tasks.pollNow('default', running.recordId);
  assert.equal(creates, 1); assert.equal(studio.job(a.id).state, 'completed'); assert.equal(studio.job(a.id).demo, false);
  assert.ok(!JSON.stringify(studio.history()).includes('mock-only-key'));
});

test('paid sketch uses one explicit image route and a durable receipt', async t => {
  let calls = 0; const provider = http.createServer((req, res) => {
    if (req.url !== '/v1/images/generations') { res.writeHead(404); res.end(); return; }
    calls++; let data = ''; req.on('data', chunk => data += chunk); req.on('end', () => {
      assert.equal(JSON.parse(data).model, 'explicit-image-model');
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [{ b64_json: fs.readFileSync(path.join(ROOT, 'media', 'demo-lastframe.jpg')).toString('base64') }] }));
    });
  });
  await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve)); t.after(() => { provider.closeAllConnections(); provider.close(); });
  const { studio } = await fixture(t, { env: { TEST_IMAGE_KEY: 'image-test-key' } }); await plan(studio);
  await studio.project({ action: 'confirm-plan', project: '测试电影', confirmed: true });
  studio.updateSettings({ image: { enabled: true, model: 'explicit-image-model', baseUrl: 'http://127.0.0.1:' + provider.address().port + '/v1', keyEnv: 'TEST_IMAGE_KEY' } });
  const input = { action: 'sketch', project: '测试电影', shot: 'Shot1', confirmed: true, requestId: randomUUID() };
  const a = await studio.project(input), b = await studio.project(input); assert.equal(a.job.id, b.job.id);
  const complete = await until(() => studio.job(a.job.id), j => j.state === 'completed'); assert.equal(calls, 1); assert.ok(fs.existsSync(complete.images[0].path));
  await assert.rejects(studio.project({ ...input, requestId: randomUUID(), confirmed: false }), error => error.code === 'CONFIRMATION_REQUIRED');
});

test('Ark and relay adapters send and poll actual HTTP requests against a local fixture', async t => {
  let base, posts = 0; const requests = [];
  const remote = http.createServer((req, res) => {
    requests.push({ method: req.method, path: req.url });
    if (req.url === '/video.mp4') { res.writeHead(200, { 'Content-Type': 'video/mp4' }); res.end(fs.readFileSync(path.join(ROOT, 'media', 'demo.mp4'))); return; }
    assert.equal(req.headers.authorization, 'Bearer wire-test-key');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      let body = ''; req.on('data', c => body += c); req.on('end', () => { const payload = JSON.parse(body); assert.equal(payload.model, 'explicit-wire-model'); posts++; res.end(JSON.stringify({ id: 'remote-wire-task' })); }); return;
    }
    if (req.url.endsWith('/models')) { res.end(JSON.stringify({ data: [{ id: 'explicit-wire-model' }] })); return; }
    res.end(JSON.stringify({ id: 'remote-wire-task', status: 'succeeded', content: { video_url: base + '/video.mp4' }, video_url: base + '/video.mp4' }));
  });
  await new Promise(resolve => remote.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + remote.address().port;
  t.after(() => { remote.closeAllConnections(); remote.close(); });
  for (const provider of ['ark', 'relay']) {
    const { studio } = await fixture(t, { env: { WIRE_KEY: 'wire-test-key' }, taskOptions: { autoPoll: false } });
    studio.updateSettings({ provider, baseUrl: base, protocol: provider === 'relay' ? 'openai' : 'ark', model: 'explicit-wire-model', keyEnv: 'WIRE_KEY' });
    const catalog = await studio.catalog(); assert.equal(catalog.items[0].id, 'explicit-wire-model');
    const job = await studio.generate({ requestId: randomUUID(), confirmed: true, prompt: 'mock wire test' });
    const running = await until(() => studio.job(job.id), j => !!j.recordId);
    await studio.tasks.pollNow('default', running.recordId);
    const done = studio.job(job.id); assert.equal(done.state, 'completed'); assert.ok(fs.statSync(done.videoPath).size > 1000);
  }
  assert.equal(posts, 2);
  assert.ok(requests.some(r => r.method === 'POST' && r.path === '/api/v3/contents/generations/tasks'));
  assert.ok(requests.some(r => r.method === 'POST' && r.path === '/v1/video/generations'));
  assert.ok(requests.some(r => r.method === 'GET' && r.path === '/api/v3/contents/generations/tasks/remote-wire-task'));
  assert.ok(requests.some(r => r.method === 'GET' && r.path === '/v1/video/generations/remote-wire-task'));
});
