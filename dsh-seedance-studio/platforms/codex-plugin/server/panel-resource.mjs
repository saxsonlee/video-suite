import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PANEL_FILE, VIDEO_PROJECT_PANEL_FILE } from './util.mjs';

// A content-addressed resource prevents Codex from retaining an older panel after update.
const html = fs.readFileSync(PANEL_FILE, 'utf8');
export const PANEL_URI = 'ui://video-studio/panel-' + createHash('sha256').update(html).digest('hex').slice(0, 16) + '.html';
export const PANEL_MIME = 'text/html;profile=mcp-app';
export const PANEL_META = {
  ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false },
  'openai/widgetHeightHint': 720,
  'openai/widgetMinFrameHeight': 480
};
export function panelResource() { return { uri: PANEL_URI, mimeType: PANEL_MIME, text: html, _meta: PANEL_META }; }

// 视频项目面板（共享 SPA + video-project bridge）
const videoProjectHtml = fs.readFileSync(VIDEO_PROJECT_PANEL_FILE, 'utf8');
export const VIDEO_PROJECT_PANEL_URI = 'ui://video-studio/video-project-' + createHash('sha256').update(videoProjectHtml).digest('hex').slice(0, 16) + '.html';
export function videoProjectPanelResource() { return { uri: VIDEO_PROJECT_PANEL_URI, mimeType: PANEL_MIME, text: videoProjectHtml, _meta: PANEL_META }; }
