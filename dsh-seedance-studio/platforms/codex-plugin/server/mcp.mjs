import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ListResourcesRequestSchema, ReadResourceRequestSchema, ListResourceTemplatesRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS } from './tools.mjs';
import { rpc } from './launcher.mjs';
import { safeError } from './util.mjs';
import { callApp, readAppMedia } from './app-bridge.mjs';
import { PANEL_URI, PANEL_MIME, PANEL_META, panelResource, VIDEO_PROJECT_PANEL_URI, videoProjectPanelResource } from './panel-resource.mjs';
import { VERSION } from './version.mjs';

const appTool = (name, description, properties, required, readOnly = false) => ({
  name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false },
  _meta: { ui: { visibility: ['app'] } },
  annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: readOnly, openWorldHint: !readOnly }
});
const APP_TOOLS = [
  appTool('video_studio_app', 'Private panel operations. Settings and task details are returned exclusively in app metadata.', {
    method: { type: 'string', enum: ['GET', 'POST'] }, path: { type: 'string' }, body: { type: 'object', additionalProperties: true }
  }, ['method', 'path']),
  appTool('video_project_app', 'Private video project panel operations (project list, detail, edits). Returned exclusively in app metadata.', {
    method: { type: 'string', enum: ['GET', 'POST'] }, path: { type: 'string' }, body: { type: 'object', additionalProperties: true }
  }, ['method', 'path']),
  appTool('video_studio_media', 'Read one bounded local preview chunk for the embedded panel, exclusively in app metadata.', {
    reference: { type: 'string', pattern: '^video-studio-media:[a-f0-9]{36}$' }, offset: { type: 'integer', minimum: 0 }, length: { type: 'integer', minimum: 1, maximum: 524288 }
  }, ['reference'], true)
];
const publicTools = TOOLS.map(tool => tool.name === 'open_video_studio' ? {
  ...tool, title: 'Video Studio',
  _meta: { ui: { resourceUri: PANEL_URI, visibility: ['model', 'app'] }, 'openai/ui': { entrypoints: [{ type: 'thread' }, { type: 'global' }] } }
} : tool).concat([{
  name: 'open_video_project',
  title: 'Video Project',
  description: 'Open the Video Project (编导工作台) panel: project list, characters, areas, acts, storyboard and review. Use for planning/editing a video project.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  _meta: { ui: { resourceUri: VIDEO_PROJECT_PANEL_URI, visibility: ['model', 'app'] }, 'openai/ui': { entrypoints: [{ type: 'thread' }, { type: 'global' }] } },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
}]);
const server = new Server({ name: 'codex-video-studio', version: VERSION }, { capabilities: { tools: {}, resources: {} }, instructions: 'Video Studio is a native Codex plugin with two embedded MCP Apps. Call open_video_studio to render the generation panel, and open_video_project to render the Video Project (编导工作台) panel directly in Codex. Do not open a localhost browser tab. The two app-only tools return private metadata for the UI; do not call them to read settings, prompts or media into model context. Do not submit paid generation without user authorization. Use stable requestId and query existing receipts after disconnects. Credentials and connections are configured inside the panel.' });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...publicTools, ...APP_TOOLS] }));
server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [
    { uri: PANEL_URI, name: 'video_studio_panel', title: 'Video Studio', mimeType: PANEL_MIME, _meta: PANEL_META },
    { uri: VIDEO_PROJECT_PANEL_URI, name: 'video_project_panel', title: 'Video Project', mimeType: PANEL_MIME, _meta: PANEL_META }
  ] }));
server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: [] }));
server.setRequestHandler(ReadResourceRequestSchema, async request => {
  if (request.params.uri === PANEL_URI) return { contents: [panelResource()] };
  if (request.params.uri === VIDEO_PROJECT_PANEL_URI) return { contents: [videoProjectPanelResource()] };
  throw new Error('Unknown UI resource');
});
server.setRequestHandler(CallToolRequestSchema, async request => {
  const name = request.params.name, args = request.params.arguments || {};
  const privateKey = name === 'video_studio_app' ? 'video_studio' : name === 'video_studio_media' ? 'video_studio_media' : null;
  let result;
  try {
    if (name === 'open_video_studio') result = { ok: true, panel: 'video-studio', version: VERSION, protocolVersion: 1 };
    else if (name === 'open_video_project') result = { ok: true, panel: 'video-project', version: VERSION, protocolVersion: 1 };
    else if (name === 'video_project_app') result = await callApp(args);
    else if (name === 'video_studio_app') result = await callApp(args);
    else if (name === 'video_studio_media') result = await readAppMedia(args);
    else {
      if (!TOOLS.some(t => t.name === name)) throw Object.assign(new Error('Unknown tool'), { code: 'UNKNOWN_TOOL' });
      result = await rpc(name, args);
    }
  } catch (error) { result = { ok: false, error: safeError(error), status: error.status || 400 }; }
  if (privateKey) return { content: [], _meta: { [privateKey]: result }, isError: result.ok === false };
  return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: result.ok === false };
});
await server.connect(new StdioServerTransport());
