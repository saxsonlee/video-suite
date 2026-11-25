import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { startServer } from '../server/http.mjs';
import { callApp, readAppMedia, MEDIA_CHUNK_BYTES, MEDIA_LIMIT_BYTES } from '../server/app-bridge.mjs';
import { ROOT, sleep } from '../server/util.mjs';

test('embedded app operations keep media private and serve exact bounded chunks without browser URLs', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-native-app-'));
  let now = Date.now();
  const server = await startServer({ root, studioOptions: { taskOptions: { autoPoll: false, now: () => now } } });
  t.after(async () => { await server.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const state = await callApp({ method: 'GET', path: '/api/state' }, server);
  assert.equal(state.settings.provider, 'demo');
  const requestId = randomUUID();
  const pending = await callApp({ method: 'POST', path: '/api/panel-pending', body: { action: 'set', requestId, kind: 'video' } }, server);
  assert.equal(pending.pending.id, requestId);
  assert.equal((await callApp({ method: 'GET', path: '/api/state' }, server)).pending.id, requestId);
  const conflict = await callApp({ method: 'POST', path: '/api/panel-pending', body: { action: 'clear', requestId: 'wrong-request-id' } }, server);
  assert.equal(conflict.status, 409);
  const generated = await callApp({ method: 'POST', path: '/api/generate', body: { requestId, confirmed: true, prompt: 'native demo' } }, server);
  let running;
  for (let i = 0; i < 100; i++) { running = server.studio.job(generated.job.id); if (running.recordId) break; await sleep(25); }
  assert.ok(running.recordId); now += 15000; await server.studio.tasks.pollNow('default', running.recordId);
  const job = (await callApp({ method: 'GET', path: '/api/jobs/' + requestId }, server)).job;
  assert.match(job.videoUrl, /^video-studio-media:[a-f0-9]{36}$/);
  assert.ok(!JSON.stringify(job).includes(server.token));
  assert.ok(!JSON.stringify(job).includes(server.origin));
  const chunks = []; let offset = 0;
  while (true) {
    const chunk = await readAppMedia({ reference: job.videoUrl, offset, length: 70000 }, server);
    assert.equal(chunk.mimeType, 'video/mp4'); assert.equal(chunk.offset, offset);
    const bytes = Buffer.from(chunk.data, 'base64'); assert.ok(bytes.length <= 70000);
    assert.equal(chunk.nextOffset - offset, bytes.length); chunks.push(bytes); offset = chunk.nextOffset;
    if (chunk.eof) { assert.equal(offset, chunk.total); break; }
  }
  const original = fs.readFileSync(path.join(ROOT, 'media', 'demo.mp4'));
  assert.deepEqual(Buffer.concat(chunks), original);
  for (const url of [job.videoUrl, 'blob:null/fake']) {
    const rejected = await callApp({ method: 'POST', path: '/api/generate', body: { requestId: randomUUID(), confirmed: true, prompt: 'invalid local media', inputs: { images: [{ url }] } } }, server);
    assert.equal(rejected.error.code, 'LOCAL_MEDIA_REFERENCE'); assert.equal(server.studio.history().length, 1);
  }
  for (const bad of [
    { reference: '../settings.json' }, { reference: job.videoUrl, offset: -1 },
    { reference: job.videoUrl, length: MEDIA_CHUNK_BYTES + 1 }, { reference: job.videoUrl, offset: 0.5 }
  ]) await assert.rejects(readAppMedia(bad, server), error => error.code === 'INVALID_MEDIA_REQUEST');
  await assert.rejects(readAppMedia({ reference: job.videoUrl, offset: MEDIA_LIMIT_BYTES }, server), error => error.code === 'MEDIA_TOO_LARGE');
  for (const invalid of ['//example.com/api/state', 'http://127.0.0.1/api/state', '/rpc', '/api/state?token=secret', '/api/jobs/../settings', '/api/jobs/%2e%2e%2fsettings']) {
    await assert.rejects(callApp({ method: 'GET', path: invalid }, server), error => error.code === 'APP_ROUTE_REJECTED');
  }
  assert.equal((await callApp({ method: 'POST', path: '/api/panel-pending', body: { action: 'clear', requestId } }, server)).pending, null);
  assert.equal((await fetch(server.url)).status, 404, 'the daemon no longer hosts a user-facing website');
});
