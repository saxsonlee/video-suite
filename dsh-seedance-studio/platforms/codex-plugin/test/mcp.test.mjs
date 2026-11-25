import test from 'node:test';
import { VERSION } from '../server/version.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ROOT, PLATFORM_ROOT, readJson, sleep } from '../server/util.mjs';

test('MCP stdio handshake, tool discovery and actual tool calls', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-video-mcp-'));
  const client = new Client({ name: 'video-studio-verification', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(PLATFORM_ROOT, 'server', 'mcp.mjs')], env: { ...process.env, CODEX_VIDEO_STUDIO_HOME: root }, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools.filter(tool => tool._meta?.ui?.visibility?.length !== 1).length, 8);
    const appTools = tools.tools.filter(tool => tool._meta?.ui?.visibility?.[0] === 'app');
    assert.deepEqual(appTools.map(tool => tool.name).sort(), ['video_studio_app', 'video_studio_media']);
    const entry = tools.tools.find(tool => tool.name === 'open_video_studio');
    const uri = entry._meta.ui.resourceUri;
    assert.match(uri, /^ui:\/\/video-studio\/panel-[a-f0-9]{16}\.html$/);
    assert.deepEqual(entry._meta['openai/ui'].entrypoints, [{ type: 'thread' }, { type: 'global' }]);
    const resources = await client.listResources(); assert.equal(resources.resources[0].uri, uri);
    const resource = (await client.readResource({ uri })).contents[0];
    assert.equal(resource.mimeType, 'text/html;profile=mcp-app');
    assert.deepEqual(resource._meta.ui.csp, { connectDomains: [], resourceDomains: [] });
    assert.ok(resource.text.includes('video_studio_app'));
    assert.ok(!resource.text.includes('__VIDEO_STUDIO_TOKEN__'));
    assert.ok(!/<script\b[^>]*src=/.test(resource.text));
    const response = await client.callTool({ name: 'video_studio_status', arguments: {} });
    const status = JSON.parse(response.content[0].text); assert.equal(status.ok, true); assert.equal(status.demo, true); assert.equal(status.dataDir, root);
    const create = await client.callTool({ name: 'video_project', arguments: { action: 'create', project: 'MCP测试' } }); assert.equal(create.isError, false);
    const list = await client.callTool({ name: 'video_project', arguments: { action: 'list' } }); assert.equal(JSON.parse(list.content[0].text).projects.length, 1);
    const open = await client.callTool({ name: 'open_video_studio', arguments: {} });
    assert.deepEqual(open.structuredContent, { ok: true, panel: 'video-studio', version: VERSION, protocolVersion: 1 });
    const privateState = await client.callTool({ name: 'video_studio_app', arguments: { method: 'GET', path: '/api/state' } });
    assert.deepEqual(privateState.content, []); assert.equal(privateState.structuredContent, undefined);
    assert.equal(privateState._meta.video_studio.settings.provider, 'demo');
    assert.ok(!JSON.stringify(privateState._meta).includes('token='));
    const rejected = await client.callTool({ name: 'video_studio_app', arguments: { method: 'GET', path: 'https://invalid.example/' } });
    assert.equal(rejected.isError, true); assert.deepEqual(rejected.content, []);
    assert.equal(rejected._meta.video_studio.error.code, 'APP_ROUTE_REJECTED');
    const refused = await client.callTool({ name: 'video_generate', arguments: { requestId: 'unconfirmed-request', prompt: 'test', confirmed: false } }); assert.equal(refused.isError, true);
  } finally {
    await client.close();
    const state = readJson(path.join(root, 'runtime.json')); if (state?.pid) { try { process.kill(state.pid); } catch {} }
    await sleep(200); fs.rmSync(root, { recursive: true, force: true });
  }
});
