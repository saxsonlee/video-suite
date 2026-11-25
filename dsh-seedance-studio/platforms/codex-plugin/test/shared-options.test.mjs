import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../../../server/store/index.js';
import { createTaskManager, defaultDemoMedia } from '../../../server/tasks/index.js';
import { createHostService } from '../../../server/service.js';
import { mergeSettings, resolveConfig } from '../../../server/settings/index.js';
import { ROOT } from '../server/util.mjs';

function harness(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-platform-options-'));
  const store = createStore({ root }); store.init();
  let now = 1700000000000;
  const getConfig = options.getConfig || (() => resolveConfig(mergeSettings({ env: {} })));
  const tasks = createTaskManager({ store, getConfig, now: () => now++, autoPoll: false, demoMedia: defaultDemoMedia(ROOT), ...options });
  const service = createHostService({ ctx: {}, store, tasks, settings: { getConfig } });
  t.after(() => { tasks.stop(); fs.rmSync(root, { recursive: true, force: true }); });
  return { store, tasks, service, advance: delta => { now += delta; } };
}

test('shared recreate preserves a caller receipt through the service without platform-specific fields', async t => {
  const { tasks, service, store, advance } = harness(t);
  const source = await tasks.createRecord('options', { prompt: 'source' });
  advance(9000);
  await tasks.runPollSession('options', source.id);
  const result = await service.recreate('options', source.id, { prompt: 'continue' }, { toolCallId: 'stable-recreate-request', originId: 'must-not-replace-source' });
  const record = result.record;
  assert.equal(record.originId, source.id);
  assert.equal(record.toolCallId, 'stable-recreate-request');
  assert.equal(store.getRecord('options', record.id).toolCallId, record.toolCallId);
  assert.ok(!JSON.stringify(record.meta.request).includes('stable-recreate-request'));
});

test('shared client cache rebuilds when route protocol or create path changes', async t => {
  const config = resolveConfig(mergeSettings({ env: { ARK_API_KEY: 'test-placeholder-not-a-real-key' } }));
  config.relay = { baseUrl: 'https://invalid.example', apiKey: 'test-placeholder', style: 'ark', createPath: '/first' };
  const snapshots = [];
  const { tasks } = harness(t, { getConfig: () => config, createClient: current => {
    const snapshot = { ...current.relay }; snapshots.push(snapshot);
    return { createTask: async () => ({ id: 'remote-' + snapshots.length }), getTask: async () => ({ status: 'running' }) };
  } });
  await tasks.createRecord('cache', { prompt: 'first' });
  await tasks.createRecord('cache', { prompt: 'same connection' });
  assert.equal(snapshots.length, 1);
  config.relay.createPath = '/second';
  await tasks.createRecord('cache', { prompt: 'new path' });
  config.relay.style = 'openai';
  await tasks.createRecord('cache', { prompt: 'new protocol' });
  assert.deepEqual(snapshots.map(item => [item.createPath, item.style]), [['/first', 'ark'], ['/second', 'ark'], ['/second', 'openai']]);
});
