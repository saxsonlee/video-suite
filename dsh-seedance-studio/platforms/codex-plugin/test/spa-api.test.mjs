import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { startServer } from '../server/http.mjs';
import { callApp, readAppMedia } from '../server/app-bridge.mjs';
import { readJson, sleep } from '../server/util.mjs';

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-shared-spa-'));
  let now = Date.now(); const secrets = new Map();
  const server = await startServer({ root, studioOptions: { env: {}, vault: { get: ref => secrets.get(ref) || '', set: (ref, value) => secrets.set(ref, value), delete: ref => secrets.delete(ref) }, taskOptions: { autoPoll: false, now: () => now } } });
  t.after(async () => { await server.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const api = (method, route, body) => callApp({ method, path: '/api/seedance/' + route, ...(body === undefined ? {} : { body }) }, server);
  async function complete(id) {
    let job;
    for (let i = 0; i < 100; i++) { job = server.studio.job(id); if (job.recordId) break; await sleep(10); }
    assert.ok(job.recordId); now += 15000; await server.studio.tasks.pollNow(job.sessionId, job.recordId);
    return server.studio.job(id);
  }
  return { root, server, api, complete, secrets };
}

test('shared SPA contract loads models/settings/preferences without DSH state or provider calls', async t => {
  const { api, root } = await fixture(t);
  const config = await api('GET', 'config');
  assert.equal(config.value.platform, 'codex'); assert.equal(config.value.demo, true);
  assert.ok(config.value.models.some(m => m.id === config.value.defaultModel));
  assert.equal((await api('GET', 'ui-state')).value.sessionId, 'default');
  await api('POST', 'ui-state', { sessionId: 'shared-session', lang: 'en', theme: 'light' });
  assert.deepEqual((await api('GET', 'ui-state')).value, { sessionId: 'shared-session', lang: 'en', theme: 'light' });
  assert.equal((await api('POST', 'ui-state', { token: 'must-not-store' })).error.code, 'INVALID_UI_STATE');
  assert.equal(JSON.stringify(readJson(path.join(root, 'panel-ui-state.json'))).includes('token'), false);
  assert.equal((await api('GET', 'settings')).value.settings.storageRoot, root);
});

test('shared SPA settings keep keys in the vault, preserve exact routes, and reject ambiguous providers', async t => {
  const { api, root, secrets } = await fixture(t);
  assert.equal((await api('POST', 'settings', { patch: { provider: 'auto' } })).error.code, 'EXPLICIT_PROVIDER_REQUIRED');
  const response = await api('POST', 'settings', { patch: { provider: 'ark', ARK_API_KEY: 'mock-secret', ARK_BASE_URL: 'https://example.invalid/custom', DEFAULT_MODEL: 'fixture-model' } });
  assert.equal(response.ok, true); assert.equal(response.value.settings.arkBaseUrl, 'https://example.invalid/custom');
  assert.equal(response.value.settings.defaultModel, 'fixture-model'); assert.equal(response.value.settings.keys.ark, '••••••••');
  assert.equal(JSON.stringify(response).includes('mock-secret'), false);
  assert.equal(fs.readFileSync(path.join(root, 'settings.json'), 'utf8').includes('mock-secret'), false);
  assert.equal([...secrets.values()][0], 'mock-secret');
  assert.equal((await api('POST', 'settings', { patch: { provider: 'relay' } })).error.code, 'SETTINGS_ROUTE_KEY_REQUIRED');
  assert.equal((await api('POST', 'settings', { patch: { provider: 'ark', RELAY_API_KEY: 'wrong-key' } })).error.code, 'SETTINGS_ROUTE_MISMATCH');
  assert.equal((await api('GET', 'config')).value.models.at(-1).id, 'fixture-model');
});

test('shared SPA retains pending receipts until acknowledgement and recovers without duplicate generation', async t => {
  const { api, server, complete } = await fixture(t);
  const body = { requestId: randomUUID(), confirmed: true, sessionId: 'shared', prompt: 'shared SPA fixture', mode: 'text2video' };
  const first = await api('POST', 'generate', body);
  assert.equal(first.ok, true); assert.equal(first.value.record.id, first.value.job.id);
  assert.equal((await api('GET', 'pending')).value.pending.id, body.requestId);
  assert.equal((await api('POST', 'generate', { ...body, requestId: randomUUID() })).error.code, 'PENDING_CONFLICT');
  const duplicate = await api('POST', 'generate', body);
  assert.equal(duplicate.value.job.id, first.value.job.id); assert.equal(server.studio.history().length, 1);
  assert.equal((await api('GET', 'task?sessionId=wrong&id=' + body.requestId)).error.code, 'JOB_NOT_FOUND');
  assert.equal((await api('GET', 'task?sessionId=shared&id=' + body.requestId)).value.record.requestId, body.requestId);
  assert.equal((await api('POST', 'pending', { action: 'ack', requestId: body.requestId })).value.pending, null);
  await complete(first.value.job.id);
  const history = await api('GET', 'history?sessionId=shared&limit=50');
  assert.equal(history.value.records[0].status, 'succeeded');
  const media = await api('GET', 'media?id=' + first.value.record.id + '&kind=video');
  assert.match(media.value.reference, /^video-studio-media:/);
  assert.ok(!JSON.stringify(media).includes(server.token)); assert.ok(!JSON.stringify(media).includes(server.origin));
  const chunk = await readAppMedia({ reference: media.value.reference, length: 64 }, server);
  assert.equal(chunk.offset, 0); assert.equal(chunk.nextOffset, 64);
  const recreated = await api('POST', 'recreate', { ...body, requestId: randomUUID(), sourceId: first.value.record.id, prompt: 'recreated shared SPA fixture' });
  assert.equal(recreated.ok, true); assert.equal(server.studio.history().length, 2);
  await api('POST', 'pending', { action: 'ack', requestId: recreated.value.job.requestId });
  await complete(recreated.value.job.id);
  assert.equal((await api('POST', 'delete', { sessionId: 'shared', id: first.value.record.id })).error.code, 'CONFIRMATION_REQUIRED');
  assert.equal((await api('POST', 'delete', { sessionId: 'shared', id: first.value.record.id, confirmed: true })).value.removed, true);
  assert.equal(server.studio.history().length, 1);
});

test('shared SPA rejects unknown pending acknowledgement and malformed routes before sending requests', async t => {
  const { api, server } = await fixture(t);
  assert.equal((await api('POST', 'pending', { action: 'ack', requestId: randomUUID() })).error.code, 'JOB_NOT_FOUND');
  const invalid = await api('POST', 'generate', { requestId: randomUUID(), confirmed: true, mode: 'text2video', prompt: '' });
  assert.equal(invalid.ok, false); assert.equal((await api('GET', 'pending')).value.pending, null);
  for (const route of ['//evil.invalid/api/seedance/config', '/api/seedance/config?token=secret', '/api/seedance/history?sessionId=x&sessionId=y', '/api/seedance/../settings', '/api/seedance/media?id=fixture-id&kind=video&path=private', '/api/seedance/config#x']) {
    await assert.rejects(callApp({ method: 'GET', path: route }, server), e => e.code === 'APP_ROUTE_REJECTED');
  }
});
