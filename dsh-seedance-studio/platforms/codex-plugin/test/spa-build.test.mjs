import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { inlineSharedSpa } from '../../../scripts/codex/build-panel.mjs';
import { ROOT } from '../server/util.mjs';

test('Codex inline build retains the sole SPA application body and the shared i18n source exactly', async () => {
  const source = path.join(ROOT, 'platforms/web/public');
  const { html, sources } = await inlineSharedSpa(source);
  const original = fs.readFileSync(path.join(source, 'index.html'), 'utf8');
  const application = original.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/)[0];
  assert.ok(html.includes(application));
  assert.ok(html.includes(fs.readFileSync(path.join(source, 'i18n.js'), 'utf8')));
  assert.equal(sources['index.html'], createHash('sha256').update(original).digest('hex'));
  assert.equal(/<script\b[^>]*src=/.test(html), false);
});

test('inline build rejects remote and escaping assets instead of creating a direct-network fallback', async t => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-spa-inliner-'));
  t.after(() => fs.rmSync(source, { recursive: true, force: true }));
  fs.writeFileSync(path.join(source, 'index.html'), '<html><head><script src="https://example.invalid/app.js"></script></head></html>');
  await assert.rejects(inlineSharedSpa(source), /local relative paths/);
  fs.writeFileSync(path.join(source, 'index.html'), '<html><head><script src="../private.js"></script></head></html>');
  await assert.rejects(inlineSharedSpa(source));
});
