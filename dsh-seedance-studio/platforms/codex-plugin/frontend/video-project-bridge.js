/**
 * Codex Video Project - 平台桥（v0.2.3）
 * 把视频项目共享 SPA 的 /api/video-project/* 请求转发到宿主 MCP App 工具，
 * 再由 codex 插件后端转发到本地 video-project API（独立存储）。
 */
import { App } from '@modelcontextprotocol/ext-apps';

const app = new App(
  { name: 'Codex Video Project', version: '0.2.3' },
  { availableDisplayModes: ['inline', 'fullscreen'] },
  { autoResize: false }
);

let connectPromise = null;
async function connectWithRetry(attempt = 0) {
  try {
    await app.connect();
    return;
  } catch (error) {
    if (attempt >= 3) throw error;
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    return connectWithRetry(attempt + 1);
  }
}
async function ensureConnect() {
  if (!connectPromise) {
    connectPromise = connectWithRetry()
      .then(() => applyTheme(app.getHostContext ? app.getHostContext() : null))
      .catch((error) => {
        console.error('[VideoProjectBridge] connect failed', error);
        // 连接失败时清空缓存，下次请求重试
        connectPromise = null;
        throw error;
      });
  }
  return connectPromise;
}

function applyTheme(context) {
  try {
    const theme = context && context.theme;
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
  } catch (error) { /* 主题不可用时用默认深色 */ }
}

async function callTool(method, path, body) {
  const result = await app.callServerTool({ name: 'video_project_app', arguments: { method, path, body } }, { timeout: 60000 });
  const contents = result && Array.isArray(result.content) ? result.content : [];
  const text = contents.find((item) => item && item.type === 'text' && typeof item.text === 'string');
  if (!text) throw new Error('视频项目服务没有返回结果');
  const parsed = JSON.parse(text.text);
  if (parsed && parsed.ok === false) {
    const message = parsed.error && parsed.error.message ? parsed.error.message : '视频项目请求失败';
    throw new Error(message);
  }
  return parsed;
}

const originalFetch = window.fetch.bind(window);
window.fetch = async function (input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (url.startsWith('/api/video-project')) {
    try {
      await ensureConnect();
      const method = String(init.method || 'GET').toUpperCase();
      let body;
      if (typeof init.body === 'string' && init.body) {
        try { body = JSON.parse(init.body); } catch (error) { body = undefined; }
      }
      const data = await callTool(method, url, body);
      return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, error: { code: 'BRIDGE_ERROR', message: error && error.message ? error.message : String(error) } }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
  }
  return originalFetch(input, init);
};

app.onhostcontextchanged = (context) => {
  if (context && context.theme) applyTheme(context.theme);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { ensureConnect(); });
} else {
  ensureConnect();
}
