import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertPackDestination } from '../../../scripts/pack-paths.mjs';

test('pack output protects source paths, existing unrelated folders and junctions', t => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-pack-paths-'));
  const root = path.join(scratch, 'source'); fs.mkdirSync(root);
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  assert.equal(assertPackDestination(root, path.join(root, 'dist'), 'codex'), path.join(root, 'dist/codex'));
  assert.throws(() => assertPackDestination(root, root, 'codex'), /源码/);
  assert.throws(() => assertPackDestination(root, path.join(root, 'platforms'), 'web'), /源码/);
  assert.throws(() => assertPackDestination(root, scratch, 'codex'), /源码/);
  const out = path.join(scratch, 'output'); fs.mkdirSync(path.join(out, 'web'), { recursive: true });
  fs.writeFileSync(path.join(out, 'web/precious.txt'), 'retain');
  assert.throws(() => assertPackDestination(root, out, 'web'), /非本项目/);
  assert.equal(fs.readFileSync(path.join(out, 'web/precious.txt'), 'utf8'), 'retain');
  const outside = path.join(scratch, 'outside'); fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(out, 'codex'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => assertPackDestination(root, out, 'codex'), /越过/);
});
