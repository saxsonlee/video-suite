import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, PLATFORM_ROOT, readJson, writeJson, inside } from '../../platforms/codex-plugin/server/util.mjs';
import { VERSION } from '../../platforms/codex-plugin/server/version.mjs';
import { buildPanel, buildVideoProjectPanel } from './build-panel.mjs';

export async function packCodex(destination) {
  const pkg = readJson(path.join(PLATFORM_ROOT, 'package.json'));
  const manifest = readJson(path.join(PLATFORM_ROOT, '.codex-plugin/plugin.json'));
  if (pkg.version !== VERSION || manifest.version !== VERSION) throw new Error('Codex version fields disagree.');
  // Write the package identity first so an interrupted build remains a recognized
  // generated directory that the next pack invocation can safely replace.
  writeJson(path.join(destination, 'package.json'), {
    name: pkg.name, version: VERSION, private: true, type: 'module', description: pkg.description,
    engines: pkg.engines, scripts: { start: 'node platforms/codex-plugin/server/mcp.mjs' }, dependencies: pkg.dependencies
  });
  const copy = (source, relative) => {
    const target = path.join(destination, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, filter: file => !/[\\/](node_modules|\.git)([\\/]|$)/.test(path.relative(source, file)) });
  };
  for (const relative of ['server', 'media']) copy(path.join(ROOT, relative), relative);
  if (fs.existsSync(path.join(ROOT, 'shared'))) copy(path.join(ROOT, 'shared'), 'shared');
  for (const relative of ['server', 'vendor']) copy(path.join(PLATFORM_ROOT, relative), 'platforms/codex-plugin/' + relative);
  for (const relative of ['.codex-plugin', '.mcp.json', 'skills', 'README.md', 'SPA-INTEGRATION.md', 'provenance.json']) copy(path.join(PLATFORM_ROOT, relative), relative);
  for (const file of ['install.mjs', 'stop.mjs', 'credential.ps1']) copy(path.join(ROOT, 'scripts/codex', file), 'scripts/codex/' + file);
  const lock = readJson(path.join(PLATFORM_ROOT, 'package-lock.json'));
  delete lock.packages[''].devDependencies;
  for (const [relative, entry] of Object.entries(lock.packages)) {
    if (!relative) continue;
    if (entry.dev) { delete lock.packages[relative]; continue; }
    if (!relative.startsWith('node_modules/') || !inside(path.join(PLATFORM_ROOT, 'node_modules'), path.join(PLATFORM_ROOT, relative))) throw new Error('Invalid dependency path in lockfile.');
    const source = path.join(PLATFORM_ROOT, relative), target = path.join(destination, relative);
    if (!fs.existsSync(source)) throw new Error('缺少 Codex 依赖；先执行 npm --prefix platforms/codex-plugin ci。');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, filter: file => !path.relative(source, file).split(path.sep).includes('node_modules') });
  }
  writeJson(path.join(destination, 'package-lock.json'), lock);
  const panel = await buildPanel(destination);
  await buildVideoProjectPanel(destination);
  const hashes = {};
  function scan(dir, prefix = '') {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (item.name === 'node_modules') continue;
      const key = prefix ? prefix + '/' + item.name : item.name;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) scan(full, key);
      else if (item.isFile()) hashes[key] = createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  }
  fs.writeFileSync(path.join(destination, 'install.cmd'), '@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nnode scripts\\codex\\install.mjs %*\r\nexit /b %errorlevel%\r\n');
  scan(destination);
  writeJson(path.join(destination, 'build-info.json'), {
    platform: 'codex', layout: 'seedance-platforms-v1', version: VERSION,
    source: 'platforms/codex-plugin', frontend_source: 'platforms/web/public', frontend_layout: 'shared-spa-v1', generated_by: 'node scripts/pack.mjs --platform codex',
    panel: path.relative(destination, panel).replaceAll('\\', '/'), files_sha256: hashes
  });
}
