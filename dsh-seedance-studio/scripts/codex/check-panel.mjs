import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { chromium } from './dependencies.mjs';
import { ROOT, sleep } from '../../platforms/codex-plugin/server/util.mjs';
import { startServer } from '../../platforms/codex-plugin/server/http.mjs';
import { mountNativePanel } from './native-panel-host.mjs';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-shared-panel-'));
const out = path.resolve(ROOT, '../_seedance-studio/codex-spa-unify-2026-11-06/screens');
fs.mkdirSync(out, { recursive: true });
const server = await startServer({ root: temporary, studioOptions: { env: {} } });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  const host = await mountNativePanel(page, server, { hostContext: { locale: 'zh-CN' } });
  const frame = host.frame;
  assert.match(await frame.locator('#modeBadge').textContent(), /演示模式/);
  await frame.locator('#prompt').fill('雨后黄昏街道，固定镜头，冷蓝霓虹');
  await frame.locator('#btnSubmit').click();
  await frame.locator('[data-action="play"]').first().waitFor({ timeout: 20000 });
  await frame.waitForFunction(() => document.querySelector('#history img')?.naturalWidth > 0);
  await frame.locator('[data-action="play"]').first().click();
  await frame.waitForFunction(() => document.querySelector('#modal-root video')?.readyState >= 2);
  assert.match(await frame.locator('video').evaluate(v => v.currentSrc), /^blob:/);
  assert.match(await frame.locator('#history a[download]').getAttribute('href'), /^blob:/);
  await frame.locator('#modal-root button[data-close]').click();
  await frame.locator('#btnSettings').click();
  // 宿主参数注入：Codex 平台标识（决定是否显示 DSH 继承开关）
  assert.equal(await frame.evaluate(() => (window.__SD_PANEL__ || {}).platform), 'codex');
  assert.equal(await frame.locator('#setInheritDsh').count(), 1, 'Codex 平台设置页应显示 DSH 继承开关');
  await frame.locator('#setInheritDsh').check();
  // Provider 自定义下拉：展开、选择、不关闭弹窗
  await frame.locator('#setProviderBtn').click();
  await frame.locator('#setProviderList .sd-select-option').first().waitFor({ timeout: 3000 });
  assert.equal(await frame.evaluate(() => getComputedStyle(document.querySelector('#setProviderList')).display !== 'none'), true, 'Provider 下拉应展开');
  await frame.locator('#setProviderList .sd-select-option[data-value="demo"]').click();
  assert.equal(await frame.evaluate(() => document.querySelector('#setProvider').value), 'demo');
  assert.equal(await frame.locator('#setProviderBtn').count(), 1, '选择 Provider 后弹窗不应关闭');
  await frame.locator('#setDefaultModel').fill('shared-spa-model-fixture');
  const saved = host.waitForCall(p => p.arguments?.path === '/api/seedance/settings' && p.arguments.method === 'POST');
  await frame.locator('#btnSaveSettings').click(); await saved;
  await frame.waitForFunction(() => !document.querySelector('#setDefaultModel'));
  assert.equal(server.studio.settings.view().model, 'shared-spa-model-fixture');
  assert.equal(server.studio.settings.view().inheritDsh, true);
  await frame.locator('#prompt').fill('unsaved input survives locale changes');
  await frame.locator('#ratio').selectOption('9:16');
  await frame.locator('#btnLang').click();
  await frame.waitForFunction(() => document.documentElement.lang === 'en');
  assert.equal(await frame.locator('#prompt').inputValue(), 'unsaved input survives locale changes');
  assert.equal(await frame.locator('#ratio').inputValue(), '9:16');
  assert.equal(await frame.locator('#modeBadge').textContent(), 'Demo mode');
  assert.match(await frame.locator('#duration').textContent(), /s/);
  await frame.evaluate(() => window.SeedanceHost.requestDisplayMode('fullscreen'));
  assert.deepEqual(await page.evaluate(() => window.nativeModes), ['fullscreen']);
  await page.screenshot({ path: path.join(out, 'shared-spa-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 430, height: 932 });
  await page.screenshot({ path: path.join(out, 'shared-spa-narrow.png'), fullPage: true });
  const narrowLayout = await frame.evaluate(() => ({ width: innerWidth, contentWidth: document.documentElement.scrollWidth }));
  // The unmodified shared SPA currently has a non-wrapping header and narrow
  // overflow. Record this Lead-owned migration issue instead of adding shell CSS.
  assert.deepEqual(host.network, []);
  await host.teardown();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, sharedSpa: true, embeddedMcpApp: true, checks: ['demo submit', 'private poster/video/download', 'settings save', 'locale with unsaved input', 'display mode'], narrowLayout, knownSharedSpaIssues: narrowLayout.contentWidth > narrowLayout.width + 1 ? ['Lead-owned shared header/layout overflows at narrow widths'] : [], directNetworkRequests: 0, screenshotDirectory: out }, null, 2));
} finally {
  await browser.close(); await server.close(); await sleep(100);
  fs.rmSync(temporary, { recursive: true, force: true });
}
