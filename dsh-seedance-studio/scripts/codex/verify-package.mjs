import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Client, StdioClientTransport } from './dependencies.mjs';
import { ROOT, readJson, sleep } from '../../platforms/codex-plugin/server/util.mjs';
import { inlineSharedSpa } from './build-panel.mjs';

export async function verifyCodex(destination) {
  // 验证用的模拟数据目录放系统临时目录，验证结束后清理：
  // 之前放在仓库内（ROOT/../_seedance-studio）会留下 pack-verification-* 垃圾目录。
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-pack-verify-'));
  const dataDir = path.join(scratch, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const client = new Client({ name: 'seedance-codex-pack', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(destination, 'platforms/codex-plugin/server/mcp.mjs')], cwd: destination,
    env: { ...process.env, CODEX_VIDEO_STUDIO_HOME: dataDir, VIDEO_STUDIO_API_KEY: '', VIDEO_STUDIO_IMAGE_API_KEY: '', ARK_API_KEY: '', RELAY_API_KEY: '' }, stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += String(chunk); });
  try {
    const info = readJson(path.join(destination, 'build-info.json'));
    assert.equal(info.layout, 'seedance-platforms-v1');
    const manifest = readJson(path.join(destination, '.codex-plugin/plugin.json'));
    assert.equal(manifest.version, info.version);
    assert.ok(fs.existsSync(path.join(destination, info.panel)));
    assert.equal(info.frontend_layout, 'shared-spa-v1');
    const source = readJson(path.join(destination, 'panel-source.json'));
    const shared = await inlineSharedSpa();
    const panel = fs.readFileSync(path.join(destination, info.panel), 'utf8');
    const digest = text => createHash('sha256').update(text).digest('hex');
    assert.deepEqual(source.sources, shared.sources);
    assert.equal(source.shared_html_sha256, digest(shared.html));
    assert.equal(source.panel_sha256, digest(panel));
    const cleaned = panel
      .replace(/\n<script data-seedance-panel-boot>[\s\S]*?<\/script>/, '')
      .replace(/\n<script data-seedance-locales>[\s\S]*?<\/script>/, '')
      .replace(/\n<script data-seedance-codex-bridge>[\s\S]*?<\/script>/, '');
    assert.equal(cleaned, shared.html, 'shared SPA must remain byte-identical after removal of the injected bridge');
    assert.deepEqual(Object.keys(source.bridge).sort(), ['bridge.js', 'media.js', 'sizing.js', 'video-project-bridge.js']);
    for (const excluded of ['panel', 'src', 'upstream', 'platforms/web', 'platforms/cli', 'platforms/dsh-plugin', 'platforms/codex-plugin/frontend/src', 'node_modules/esbuild', 'node_modules/playwright-core']) assert.equal(fs.existsSync(path.join(destination, excluded)), false, excluded);
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 12);
    const entry = tools.find(tool => tool.name === 'open_video_studio');
    const resource = (await client.readResource({ uri: entry._meta.ui.resourceUri })).contents[0];
    assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
    assert.ok(resource.text.includes('video_studio_app'));
    assert.equal(resource.text, panel);
    const open = await client.callTool({ name: 'open_video_studio', arguments: {} });
    assert.equal(open.structuredContent.version, manifest.version);
    const status = await client.callTool({ name: 'video_studio_status', arguments: {} });
    assert.equal(status.isError, false);
    assert.equal(JSON.parse(status.content[0].text).demo, true);
    return 'Codex 包可用（独立 MCP 握手、8 个聊天工具、2 个面板工具、video_project 编导工具、双面板资源、演示后端）';
  } catch (error) {
    if (stderr) fs.writeFileSync(path.join(dataDir, 'mcp-stderr.log'), stderr);
    throw error;
  } finally {
    await client.close();
    let state = null;
    try { state = readJson(path.join(dataDir, 'runtime.json')); } catch { state = null; }
    if (state?.pid) { try { process.kill(state.pid); } catch {} }
    await sleep(200);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* 清理失败不影响打包 */ }
  }
}
