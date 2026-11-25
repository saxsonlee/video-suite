/**
 * dsh-seedance-studio — /api/seedance/panel 面板页面路由。
 *
 * 正式实现：返回「共享 SPA」（platforms/web/public/index.html + i18n.js 内联），
 * 供 DSH 插件前端以 iframe 承载；Web 独立版与 Codex 面板使用同一份 SPA 源。
 *
 * 调试：?debug=1 返回最小测试页（iframe 机制自检用）。
 *
 * 纯 Node 模块（不 import DSH 运行时），可被 node --test 直接调用。
 * @module dsh-seedance-studio/server/routes/panel-page
 */
import fs from 'node:fs'
import { readLocales } from '../locales.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 面板页面路径（与 manager.js 注册的路由一致）。 */
export const PANEL_PATH = '/api/seedance/panel'

const HERE = path.dirname(fileURLToPath(import.meta.url))
/** 包根：server/routes/panel-page.js → 包根（含 platforms/、server/）。 */
const PACKAGE_ROOT = path.resolve(HERE, '..', '..')
const WEB_PUBLIC = path.join(PACKAGE_ROOT, 'platforms', 'web', 'public')

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 规范化宿主参数（非法值回退默认）。 */
export function normalizePanelOptions(options) {
  const source = options && typeof options === 'object' ? options : {}
  const theme = source.theme === 'light' ? 'light' : 'dark'
  const lang = source.lang === 'en' ? 'en' : 'zh'
  const platform = source.platform === 'codex' ? 'codex' : 'dsh'
  // 空字符串表示「不绑定会话」（主面板显示全部/最近历史）；显式传 'default' 才绑定默认会话
  const sessionId = typeof source.sessionId === 'string' ? source.sessionId.slice(0, 200) : ''
  return { theme, lang, platform, sessionId }
}

/**
 * 生成共享 SPA 面板 HTML（内联 i18n.js、注入宿主参数）。
 *
 * @param {object} [options] - { theme, lang, platform, sessionId }
 * @returns {string} 单文件 HTML
 */
export function buildSpaPanelPage(options) {
  const opts = normalizePanelOptions(options)
  const htmlPath = path.join(WEB_PUBLIC, 'index.html')
  const i18nPath = path.join(WEB_PUBLIC, 'i18n.js')
  const html = fs.readFileSync(htmlPath, 'utf8')
  const i18n = fs.readFileSync(i18nPath, 'utf8')
  const inlineI18n = i18n.replace(/<\/script/gi, '<\\/script')
  const boot = '<script>window.__SD_PANEL__ = ' + JSON.stringify(opts) + ';</script>'
  // 动态语言包：内联全部语言（新增语言文件后重启即出现在语言切换里）
  let localesBoot = ''
  try {
    const locales = readLocales()
    localesBoot = '<script>window.__SD_LOCALES__ = ' + JSON.stringify(locales).replace(/<\/script/gi, '<\\/script') + ';</script>'
  } catch (error) { localesBoot = '' }
  let page = html.replace('<script src="i18n.js"></script>', '<script>\n' + inlineI18n + '\n</script>')
  page = page.replace('<head>', '<head>\n' + localesBoot + '\n' + boot)
  if (!page.includes('__SD_PANEL__')) throw new Error('panel 页面注入失败：未找到宿主参数注入点')
  return page
}

/**
 * 最小测试页（?debug=1 时使用）：展示 ping 结果、宿主参数与 postMessage。
 *
 * @param {object} [options]
 * @returns {string} 单文件 HTML
 */
export function buildPanelPage(options) {
  const opts = normalizePanelOptions(options)
  const isDark = opts.theme === 'dark'
  const text = opts.lang === 'en'
    ? {
        title: 'Seedance panel · iframe prototype',
        subtitle: 'This page is served by the plugin route /api/seedance/panel and rendered inside an iframe in the DSH plugin UI.',
        ping: 'Calling /api/seedance/ping…',
        pingOk: 'ping OK',
        pingFail: 'ping failed',
        params: 'Query params',
        note: 'If you can read this inside the DSH sidebar, the iframe hosting path works.',
      }
    : {
        title: 'Seedance 面板 · iframe 原型',
        subtitle: '本页面由插件路由 /api/seedance/panel 提供，渲染在 DSH 插件界面的 iframe 里。',
        ping: '正在调用 /api/seedance/ping…',
        pingOk: 'ping 正常',
        pingFail: 'ping 失败',
        params: 'URL 参数',
        note: '如果你能在 DSH 侧边栏里看到这段文字，说明 iframe 托管方案可行。',
      }
  const bg = isDark ? '#111418' : '#f5f6f8'
  const fg = isDark ? '#e8eaed' : '#1f2328'
  const muted = isDark ? '#9aa0a6' : '#5f6368'
  const card = isDark ? '#1b2026' : '#ffffff'
  const border = isDark ? '#2d333b' : '#d8dce2'
  const accent = isDark ? '#d78b52' : '#b5651d'
  return [
    '<!doctype html>',
    '<html lang="' + opts.lang + '">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>' + escapeHtml(text.title) + '</title>',
    '<style>',
    '*{box-sizing:border-box}',
    'html,body{margin:0;height:100%;background:' + bg + ';color:' + fg + ';font:13px/1.5 "Segoe UI",system-ui,-apple-system,"Microsoft YaHei",sans-serif}',
    '.wrap{display:flex;height:100%;gap:10px;padding:10px;align-items:stretch}',
    '.card{flex:1;min-width:0;background:' + card + ';border:1px solid ' + border + ';border-radius:10px;padding:10px 12px;overflow:auto}',
    'h1{font-size:14px;margin:0 0 4px;color:' + accent + '}',
    'p{margin:4px 0;color:' + muted + '}',
    'code{background:' + (isDark ? '#2a3038' : '#eef0f3') + ';padding:1px 5px;border-radius:4px;font-size:12px}',
    '.ok{color:#3fb950;font-weight:600}.bad{color:#f85149;font-weight:600}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="wrap">',
    '<div class="card">',
    '<h1>' + escapeHtml(text.title) + '</h1>',
    '<p>' + escapeHtml(text.subtitle) + '</p>',
    '<p>' + escapeHtml(text.params) + '：<code>theme=' + escapeHtml(opts.theme) + '</code> <code>lang=' + escapeHtml(opts.lang) + '</code></p>',
    '<p id="ping">' + escapeHtml(text.ping) + '</p>',
    '<p>' + escapeHtml(text.note) + '</p>',
    '</div>',
    '</div>',
    '<script>',
    '(function () {',
    '  var el = document.getElementById("ping");',
    '  function report(ok, detail) {',
    '    el.className = ok ? "ok" : "bad";',
    '    el.textContent = (ok ? "' + escapeHtml(text.pingOk) + '" : "' + escapeHtml(text.pingFail) + '") + (detail ? " · " + detail : "");',
    '  }',
    '  fetch(location.origin + "/api/seedance/ping", { credentials: "same-origin" })',
    '    .then(function (r) { return r.json(); })',
    '    .then(function (v) { report(v && v.ok === true, v && v.value ? String(v.value.time || "") : ""); })',
    '    .catch(function (e) { report(false, e && e.message ? e.message : "fetch error"); });',
    '  try { parent.postMessage({ type: "sd-panel-ready", theme: "' + escapeHtml(opts.theme) + '", lang: "' + escapeHtml(opts.lang) + '" }, "*"); } catch (e) {}',
    '})();',
    '</script>',
    '</body>',
    '</html>',
  ].join('\n')
}
