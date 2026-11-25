import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, fail } from './util.mjs';

function invoke(action, target, value) {
  if (process.platform !== 'win32') fail('KEYRING_UNAVAILABLE', '此平台请填写密钥环境变量名称；不支持明文保存密钥。');
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts', 'codex', 'credential.ps1')], {
    input: JSON.stringify({ action, target, value }), encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024
  });
  if (result.error || result.status !== 0) fail('KEYRING_ERROR', 'Windows 凭据管理器操作失败；密钥未写入普通文件。');
  return JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
}
export const vault = {
  get: target => invoke('get', target).value,
  set: (target, value) => invoke('set', target, value),
  delete: target => invoke('delete', target)
};
