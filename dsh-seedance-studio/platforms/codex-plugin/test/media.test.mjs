import test from 'node:test';
import assert from 'node:assert/strict';
import { MediaManager } from '../frontend/media.js';

const reference = 'video-studio-media:' + 'a'.repeat(36);
const chunk = overrides => ({ _meta: { video_studio_media: { ok: true, reference, mimeType: 'video/mp4', total: 3, offset: 0, nextOffset: 3, data: 'YWJj', eof: true, ...overrides } } });

test('native media verifies completeness and deduplicates concurrent readers', async () => {
  let calls = 0;
  const manager = new MediaManager({ async callServerTool() { calls++; return chunk(); } });
  const [a, b] = await Promise.all([manager.fetchMedia(reference), manager.fetchMedia(reference)]);
  assert.equal(a.objectUrl, b.objectUrl); assert.equal(calls, 1);
  assert.equal(await a.blob.text(), 'abc'); manager.revokeAll();
  for (const value of [{ nextOffset: 0 }, { total: 4 }, { eof: false }, { offset: 1 }, { reference: reference + 'b' }, { nextOffset: 2 }, { data: '!!' }, { total: 300 * 1024 * 1024 }, { total: NaN }, { total: Infinity }, { nextOffset: 1.5 }]) {
    const bad = new MediaManager({ async callServerTool() { return chunk(value); } });
    await assert.rejects(bad.fetchMedia(reference)); assert.equal(bad.cache.size, 0); bad.revokeAll();
  }
});

test('media cache bounds total retained bytes and preserves the active preview', async () => {
  const manager = new MediaManager({ async callServerTool(params) { return chunk({ reference: params.arguments.reference }); } }, { maxTotalBytes: 6 });
  const second = 'video-studio-media:' + 'b'.repeat(36), third = 'video-studio-media:' + 'c'.repeat(36);
  await manager.fetchMedia(reference); manager.setActiveReference(reference);
  await manager.fetchMedia(second); await manager.fetchMedia(third);
  assert.equal(manager.totalCachedBytes, 6); assert.ok(manager.cache.has(reference)); assert.ok(!manager.cache.has(second));
  manager.revokeAll(); assert.equal(manager.totalCachedBytes, 0);
});

test('native media teardown prevents late blob creation and rejects further work', async () => {
  let resolve;
  const manager = new MediaManager({ callServerTool() { return new Promise(done => { resolve = done; }); } });
  const task = manager.fetchMedia(reference);
  manager.revokeAll(); resolve(chunk());
  await assert.rejects(task); assert.equal(manager.cache.size, 0);
  await assert.rejects(manager.fetchMedia(reference));
});
