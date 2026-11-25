import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT, writeJson, readJson, inside } from '../../platforms/codex-plugin/server/util.mjs';

const args = process.argv.slice(2);
const option = name => { const index = args.indexOf(name); if (index < 0) return undefined; if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(name + ' needs a value'); return args[index + 1]; };
const source = fs.existsSync(path.join(ROOT, '.codex-plugin/plugin.json')) ? ROOT : path.join(ROOT, 'dist/codex');
const codexHome = path.resolve(option('--codex-home') || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'));
const market = path.join(codexHome, 'local-marketplaces/video-studio-local');
const update = args.includes('--update');
const info = readJson(path.join(source, 'build-info.json'));
if (info?.platform !== 'codex' || info.layout !== 'seedance-platforms-v1') throw new Error('先运行 node scripts/pack.mjs --platform codex；安装器只读取生成的 Codex 包。');
if (!/^\d+\.\d+\.\d+$/.test(info.version)) throw new Error('无效的插件版本。');
const id = Date.now() + '-' + randomUUID();
// A running stdio server may hold its Windows working directory open. Install
// each revision into a new directory and switch the marketplace source instead
// of renaming or overwriting the active runtime.
const destination = path.join(market, 'plugins/video-studio-' + info.version + '-' + id);
const registryFile = path.join(market, '.agents/plugins/marketplace.json');
const registry = readJson(registryFile);
if (registry && registry.name !== 'video-studio-local') throw new Error('拒绝修改不属于 Video Studio 的插件市场。');
const previousEntry = registry?.plugins?.find(plugin => plugin.name === 'video-studio');
const previous = path.resolve(market, previousEntry?.source?.source === 'local' ? previousEntry.source.path : './plugins/video-studio');
if (!inside(path.join(market, 'plugins'), previous)) throw new Error('既有插件源不在本地插件目录中。');
if (args.includes('--dry-run')) {
  console.log(JSON.stringify({ source, destination, previous, version: info.version, update, actions: ['verify generated package', 'stage runtime', 'stop verified video daemon', 'copy previous runtime backup', 'switch Codex plugin registration to new runtime'] }, null, 2));
  process.exit(0);
}
if (inside(source, destination) || inside(destination, source)) throw new Error('安装目录不能包含构建目录，或位于构建目录内。');
for (const [relative, expected] of Object.entries(info.files_sha256 || {})) {
  const file = path.resolve(source, relative);
  if (!inside(source, file) || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) throw new Error('生成包校验失败：' + relative);
}
if (!fs.existsSync(path.join(source, 'node_modules/@modelcontextprotocol/sdk/package.json'))) throw new Error('生成包缺少运行时依赖，请重新打包。');
const manifest = readJson(path.join(source, '.codex-plugin/plugin.json'));
if (manifest?.name !== 'video-studio' || manifest.version !== info.version) throw new Error('Codex 插件清单与构建版本不一致。');
fs.mkdirSync(codexHome, { recursive: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });
const canonicalHome = fs.realpathSync(codexHome);
if (!inside(canonicalHome, fs.realpathSync(market)) || !inside(fs.realpathSync(market), fs.realpathSync(path.dirname(destination)))) throw new Error('本地插件目录指向 Codex home 之外，拒绝替换。');
if (fs.existsSync(previous)) {
  if (!update) throw new Error('已安装此插件。使用 --update 会先保留旧版本备份。');
  if (readJson(path.join(previous, '.codex-plugin/plugin.json'))?.name !== 'video-studio' || fs.lstatSync(previous).isSymbolicLink() || !inside(fs.realpathSync(market), fs.realpathSync(previous))) throw new Error('拒绝更新不属于 Video Studio 的目录。');
}
const env = { ...process.env, CODEX_HOME: codexHome, CODEX_VIDEO_STUDIO_HOME: path.join(codexHome, 'video-studio') };
function run(command, argv, cwd) {
  const result = spawnSync(command, argv, { cwd, env, windowsHide: true, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('安装步骤失败：' + path.basename(command) + ' ' + argv.slice(0, 2).join(' ') + '（' + (result.status ?? result.error?.code) + '）');
}
const staging = path.join(market, 'staging/video-studio-' + id);
const backup = path.join(market, 'backups/video-studio-' + id);
fs.mkdirSync(path.dirname(staging), { recursive: true });
fs.mkdirSync(path.dirname(backup), { recursive: true });
for (const parent of [path.dirname(staging), path.dirname(backup)]) if (!inside(fs.realpathSync(market), fs.realpathSync(parent))) throw new Error('安装暂存或备份目录越界。');
fs.cpSync(source, staging, { recursive: true, errorOnExist: true, force: false });
writeJson(path.join(staging, '.mcp.json'), { mcpServers: { video_studio: {
  command: process.execPath, args: [path.join(destination, 'platforms/codex-plugin/server/mcp.mjs')], cwd: destination,
  env: { CODEX_VIDEO_STUDIO_HOME: path.join(codexHome, 'video-studio') },
  env_vars: ['VIDEO_STUDIO_API_KEY', 'VIDEO_STUDIO_IMAGE_API_KEY', 'ARK_API_KEY', 'RELAY_API_KEY', 'VIDEO_PROJECT_FFMPEG', 'FFMPEG_PATH'],
  startup_timeout_sec: 30, tool_timeout_sec: 60
} } });
if (fs.existsSync(previous)) {
  run(process.execPath, [path.join(source, 'scripts/codex/stop.mjs')], source);
  fs.cpSync(previous, backup, { recursive: true, errorOnExist: true, force: false });
  console.log('旧插件备份：' + backup);
}
fs.renameSync(staging, destination);
writeJson(registryFile, {
  ...registry, name: 'video-studio-local', interface: registry?.interface || { displayName: 'Local Video Studio' },
  plugins: [...(registry?.plugins || []).filter(plugin => plugin.name !== 'video-studio'),
    { name: 'video-studio', source: { source: 'local', path: './' + path.relative(market, destination).replaceAll('\\', '/') }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }]
});
run(process.env.CODEX_BIN || 'codex', ['plugin', 'marketplace', 'add', market, '--json'], destination);
run(process.env.CODEX_BIN || 'codex', ['plugin', 'add', 'video-studio@video-studio-local', '--json'], destination);
console.log('已从 ' + source + ' 安装 Video Studio ' + info.version + '。Codex 加载插件后，调用 open_video_studio 打开内嵌面板。');
