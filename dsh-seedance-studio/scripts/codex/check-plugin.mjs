import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const index = process.argv.indexOf('--codex-home');
const env = index >= 0 ? { ...process.env, CODEX_HOME: process.argv[index + 1] } : process.env;
function list(enabled) {
  const result = spawnSync(process.env.CODEX_BIN || 'codex', ['-c', 'plugins.video-studio@video-studio-local.enabled=' + enabled, 'mcp', 'list', '--json'], { env, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error('Codex MCP inspection failed: ' + result.status);
  return JSON.parse(result.stdout);
}
const enabled = list(true), disabled = list(false), enabledAgain = list(true);
assert.equal(enabled.filter(s => s.name === 'video_studio' && s.enabled).length, 1);
assert.equal(disabled.filter(s => s.name === 'video_studio').length, 0);
assert.deepEqual(enabled, enabledAgain);
assert.deepEqual(enabled.filter(s => s.name !== 'video_studio'), disabled.filter(s => s.name !== 'video_studio'));
console.log('PASS: native Codex plugin enable/disable/enable controls exactly one video_studio MCP server; other plugins unchanged.');
