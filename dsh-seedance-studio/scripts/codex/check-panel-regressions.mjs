import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { chromium } from './dependencies.mjs';
import { readJson, sleep } from '../../platforms/codex-plugin/server/util.mjs';
import { startServer } from '../../platforms/codex-plugin/server/http.mjs';
import { callApp } from '../../platforms/codex-plugin/server/app-bridge.mjs';
import { mountNativePanel } from './native-panel-host.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-shared-regression-'));
let now = Date.now(), loseResponse = false, submittedBody;
const server = await startServer({ root, studioOptions: { env: {}, taskOptions: { autoPoll: false, now: () => now } } });
await callApp({ method: 'POST', path: '/api/seedance/ui-state', body: { sessionId: 'restored-session', lang: 'en', theme: 'light' } }, server);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const host = await mountNativePanel(page, server, { async beforeCall(params) {
    // Make initialization ordering deterministic even when the local backend is fast.
    if (['/api/seedance/ui-state', '/api/seedance/pending'].includes(params.arguments?.path) && params.arguments.method === 'GET') await sleep(250);
  }, afterCall(params) {
    if (loseResponse && params.arguments?.path === '/api/seedance/generate') {
      submittedBody = params.arguments.body; throw new Error('Fixture: accepted submission response lost');
    }
  } });
  let frame = host.frame;
  assert.equal(await frame.evaluate(() => location.origin), 'null', 'real opaque origin');
  assert.equal(await frame.evaluate(() => window.SeedanceHost.getState().sessionId), 'restored-session');
  assert.equal(await frame.evaluate(() => window.SeedanceI18n.getLanguage()), 'en');
  assert.equal(host.calls.find(p => p.name === 'video_studio_app').arguments.path, '/api/seedance/ui-state');
  await frame.locator('#btnRefresh').click();
  assert.equal(host.calls.filter(p => p.arguments?.path?.startsWith('/api/seedance/history')).every(p => new URL(p.arguments.path, 'http://fixture').searchParams.get('sessionId') === 'restored-session'), true);
  const invalid = await frame.evaluate(async () => (await fetch('/api/seedance/generate', { method: 'POST', body: JSON.stringify({ prompt: '', requestId: 'invalid-shared-fixture', confirmed: true, mode: 'text2video' }) })).json());
  assert.equal(invalid.ok, false);
  assert.equal(await frame.evaluate(() => window.SeedanceHost.getState().pending), null);
  loseResponse = true;
  await frame.locator('#prompt').fill('recover original accepted task');
  await frame.locator('#btnSubmit').click();
  await frame.waitForFunction(() => window.SeedanceHost.getState().pending?.id);
  for (let i = 0; !submittedBody && i < 100; i++) await sleep(20);
  assert.ok(submittedBody); assert.equal(submittedBody.sessionId, 'restored-session');
  assert.equal(server.studio.history().length, 1);
  assert.equal(readJson(path.join(root, 'panel-pending.json')).id, submittedBody.requestId);
  await frame.locator('#btnSubmit').click();
  assert.equal(server.studio.history().length, 1);
  loseResponse = false;
  frame = await host.reload();
  assert.equal(await frame.evaluate(() => window.SeedanceHost.getState().pending), null);
  assert.equal(readJson(path.join(root, 'panel-pending.json')), null);
  assert.equal(host.calls.filter(p => p.arguments?.path === '/api/seedance/generate' && p.arguments.body?.prompt).length, 1);
  let job = server.studio.job(submittedBody.requestId);
  for (let i = 0; !job.recordId && i < 100; i++) { await sleep(20); job = server.studio.job(job.id); }
  now += 15000; await server.studio.tasks.pollNow(job.sessionId, job.recordId);
  await frame.locator('#btnRefresh').click();
  await frame.locator('[data-action="play"]').waitFor();
  await frame.locator('[data-action="delete"]').click();
  await frame.locator('[data-sd-confirm-backdrop] button.ghost').click();
  assert.equal(server.studio.history().length, 1);
  assert.equal(host.calls.filter(p => p.arguments?.path === '/api/seedance/delete').length, 0);
  await frame.locator('[data-action="delete"]').click();
  const removed = host.waitForCall(p => p.arguments?.path === '/api/seedance/delete');
  await frame.locator('[data-sd-confirm-backdrop] button.danger').click(); await removed;
  assert.equal(server.studio.history().length, 0);
  assert.equal(host.calls.find(p => p.arguments?.path === '/api/seedance/delete').arguments.body.confirmed, true);
  assert.deepEqual(errors, []); assert.deepEqual(host.network, []);
  await host.teardown();
  console.log(JSON.stringify({ ok: true, checks: ['saved language/session before requests', 'validation unlocks', 'lost response preserves stable id', 'reload acknowledges original without resubmission', 'cancelled deletion sends no request', 'confirmed deletion'], errors }, null, 2));
} finally { await browser.close(); await server.close(); fs.rmSync(root, { recursive: true, force: true }); }
