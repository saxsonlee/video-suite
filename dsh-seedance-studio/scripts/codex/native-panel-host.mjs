// Verification fixture only: exercise the real MCP Apps bridge in an opaque iframe.
import fs from 'node:fs';
import path from 'node:path';
import { build } from './dependencies.mjs';
import { PLATFORM_ROOT, PANEL_FILE, safeError } from '../../platforms/codex-plugin/server/util.mjs';
import { callApp, readAppMedia } from '../../platforms/codex-plugin/server/app-bridge.mjs';
import { VERSION } from '../../platforms/codex-plugin/server/version.mjs';

export async function mountNativePanel(page, runtime, hooks = {}) {
  const bundle = await build({ stdin: { contents: "export {AppBridge, PostMessageTransport} from '@modelcontextprotocol/ext-apps/app-bridge';", resolveDir: PLATFORM_ROOT }, bundle: true, format: 'iife', globalName: 'NativeTestHost', write: false });
  const html = fs.readFileSync(PANEL_FILE, 'utf8');
  const calls = [], network = [], waiting = [];
  const hostUrl = 'https://video-studio-test.invalid/';
  await page.route('**/*', route => {
    if (route.request().isNavigationRequest() && route.request().url() === hostUrl) return route.fulfill({ contentType: 'text/html', body: '<style>body{margin:0}iframe{border:0;width:100%;height:100vh}</style><iframe id="native-panel" sandbox="allow-scripts"></iframe>' });
    network.push(route.request().url()); return route.abort();
  });
  await page.exposeFunction('nativeCallTool', async params => {
    await hooks.beforeCall?.(params);
    const key = params.name === 'video_studio_app' ? 'video_studio' : params.name === 'video_studio_media' ? 'video_studio_media' : null;
    if (!key) throw new Error('Unexpected app tool: ' + params.name);
    let data;
    try { data = await (key === 'video_studio' ? callApp : readAppMedia)(params.arguments, runtime); }
    catch (error) { data = { ok: false, error: safeError(error), status: error.status || 400 }; }
    const result = { content: [], _meta: { [key]: data }, isError: data.ok === false };
    calls.push(params);
    for (const waiter of [...waiting]) if (waiter.predicate(params, data)) { waiting.splice(waiting.indexOf(waiter), 1); clearTimeout(waiter.timer); waiter.resolve({ params, data }); }
    await hooks.afterCall?.(params, result);
    return result;
  });
  await page.goto(hostUrl);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  async function reload() {
    await page.evaluate(async ({ html, hostContext, version, initialHostMessage }) => {
      if (window.nativeBridge) { try { await window.nativeBridge.teardownResource({}); } catch {} await window.nativeBridge.close(); }
      const iframe = document.querySelector('#native-panel');
      const bridge = new window.NativeTestHost.AppBridge(null, { name: 'video-studio-test-host', version: '1' }, { serverTools: {} }, {
        hostContext: { theme: 'dark', displayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'], containerDimensions: { width: innerWidth, maxHeight: innerHeight }, ...hostContext }
      });
      window.nativeSizes = []; window.nativeModes = [];
      bridge.oncalltool = params => window.nativeCallTool(params);
      bridge.onsizechange = params => { window.nativeSizes.push(params); };
      bridge.onrequestdisplaymode = async ({ mode }) => {
        window.nativeModes.push(mode); bridge.setHostContext({ displayMode: mode }); return { mode };
      };
      bridge.oninitialized = () => {
        if (initialHostMessage) iframe.contentWindow.postMessage({ type: 'sd-panel-host', ...initialHostMessage }, '*');
        return bridge.sendToolResult({ content: [{ type: 'text', text: 'Video Studio' }], structuredContent: { ok: true, panel: 'video-studio', version, protocolVersion: 1 } });
      };
      await bridge.connect(new window.NativeTestHost.PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
      window.nativeBridge = bridge;
      // Match the app resource's empty network allowlist; the host supplies inline assets.
      iframe.srcdoc = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data: blob:; media-src blob: data:; connect-src \'none\';">');
    }, { html, hostContext: hooks.hostContext || {}, version: VERSION, initialHostMessage: hooks.initialHostMessage || null });
    const frame = await (await page.$('#native-panel')).contentFrame();
    if (hooks.waitForReady === false) {
      await frame.waitForFunction(() => window.SeedanceHost, null, { timeout: 20000 });
      return frame;
    }
    await frame.waitForFunction(() => document.querySelector('#model')?.value && window.SeedanceHost?.getState().connected, null, { timeout: 20000 });
    await frame.evaluate(() => window.SeedanceHost.ready);
    return frame;
  }
  const frame = await reload();
  return {
    frame, calls, network, reload,
    waitForCall(predicate) { return new Promise((resolve, reject) => {
      const item = { predicate, resolve, timer: setTimeout(() => { waiting.splice(waiting.indexOf(item), 1); reject(new Error('Expected native app operation did not complete')); }, 15000) };
      waiting.push(item);
    }); },
    async teardown() { await page.evaluate(async () => { await window.nativeBridge.teardownResource({}); await window.nativeBridge.close(); }); }
  };
}
