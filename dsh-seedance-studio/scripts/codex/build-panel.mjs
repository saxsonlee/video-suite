import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from './dependencies.mjs';
import { ROOT, PLATFORM_ROOT } from '../../platforms/codex-plugin/server/util.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Consume the lead-owned SPA without modifying or maintaining another copy.
export async function inlineSharedSpa(source = path.join(ROOT, 'platforms/web/public')) {
  const canonical = await fs.realpath(source), hashes = {};
  async function asset(relative) {
    if (!relative || /[?#\\]/.test(relative) || /^[a-z][a-z\d+.-]*:|^\//i.test(relative)) throw new Error('SPA assets must be local relative paths: ' + relative);
    const target = await fs.realpath(path.resolve(canonical, relative));
    const inside = path.relative(canonical, target);
    if (inside.startsWith('..') || path.isAbsolute(inside)) throw new Error('SPA asset leaves platforms/web/public: ' + relative);
    const bytes = await fs.readFile(target); hashes[inside.replaceAll('\\', '/')] = hash(bytes);
    return bytes.toString('utf8');
  }
  let html = await asset('index.html');
  const scripts = [...html.matchAll(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script\s*>/gi)];
  for (const match of scripts) {
    const text = await asset(match[2]);
    if (/\btype\s*=\s*["']module["']/i.test(match[1] + match[3])) throw new Error('Shared SPA module scripts need an explicit bundling contract; classic scripts are inlined unchanged.');
    const inline = '<script' + match[1] + match[3] + '>' + text.replace(/<\/script/gi, '<\\/script') + '</script>';
    html = html.replace(match[0], () => inline);
  }
  const styles = [...html.matchAll(/<link\b([^>]*?)\bhref\s*=\s*["']([^"']+)["']([^>]*)>/gi)];
  for (const match of styles) {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(match[1] + match[3])) throw new Error('Unsupported shared SPA linked asset: ' + match[2]);
    const css = await asset(match[2]);
    if (/@import\b|url\s*\(\s*(?!["']?data:)/i.test(css)) throw new Error('Shared SPA stylesheet must not load external assets.');
    html = html.replace(match[0], () => '<style>' + css.replace(/<\/style/gi, '<\\/style') + '</style>');
  }
  if (/<(script|link)\b[^>]*(src|href)\s*=/i.test(html)) throw new Error('Shared SPA has unresolved external assets.');
  return { html, sources: hashes };
}

export async function buildPanel(destination) {
  const shared = await inlineSharedSpa();
  const source = path.join(PLATFORM_ROOT, 'frontend');
  const result = await build({
    entryPoints: [path.join(source, 'bridge.js')], bundle: true, write: false,
    platform: 'browser', format: 'iife', target: 'chrome120', minify: true, legalComments: 'inline'
  });
  const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  if (!/<head(?:\s[^>]*)?>/i.test(shared.html)) throw new Error('Shared SPA is missing its head element.');
  const panelBoot = '<script data-seedance-panel-boot>window.__SD_PANEL__ = Object.assign({ platform: "codex", theme: "dark", lang: "zh", sessionId: "default" }, window.__SD_PANEL__ || {});</script>';
  // 动态语言包：内联 locales/ 目录下的全部语言文件（新增语言文件后重建面板即出现）
  let localesBoot = '';
  try {
    const localesDir = path.join(ROOT, 'platforms/web/public/locales');
    const files = (await fs.readdir(localesDir)).filter(name => /\.json$/i.test(name) && name.toLowerCase() !== 'languages.json');
    const locales = [], dictionaries = {};
    for (const file of files) {
      const code = file.replace(/\.json$/i, '');
      dictionaries[code] = JSON.parse(await fs.readFile(path.join(localesDir, file), 'utf8'));
      locales.push(code);
    }
    localesBoot = '<script data-seedance-locales>window.__SD_LOCALES__ = ' + JSON.stringify({ locales, dictionaries }).replace(/<\/script/gi, '<\\/script') + ';</script>';
  } catch (error) { localesBoot = ''; }
  const html = shared.html.replace(/<head(?:\s[^>]*)?>/i, match => match + '\n' + localesBoot + '\n' + panelBoot + '\n<script data-seedance-codex-bridge>' + script + '</script>');
  if (html.includes('__VIDEO_STUDIO_TOKEN__')) throw new Error('Native panel must not contain a service token.');
  const output = path.join(destination, 'platforms/codex-plugin/frontend/panel.html');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, html);
  const bridge = {};
  for (const file of await fs.readdir(source)) if (/\.(?:js|mjs)$/.test(file)) bridge[file] = hash(await fs.readFile(path.join(source, file)));
  await fs.writeFile(path.join(destination, 'panel-source.json'), JSON.stringify({
    layout: 'shared-spa-v1', source: 'platforms/web/public', sources: shared.sources,
    bridge_source: 'platforms/codex-plugin/frontend', bridge, shared_html_sha256: hash(shared.html), panel_sha256: hash(html)
  }, null, 2) + '\n');
  return output;
}

export async function buildVideoProjectPanel(destination) {
  // 视频项目共享 SPA 源：同 workspace 下 video-project 工程（独立插件，零代码依赖，只读取其前端源）
  const spaSource = path.resolve(ROOT, '../video-project/platforms/web/public');
  const shared = await inlineSharedSpa(spaSource);
  const source = path.join(PLATFORM_ROOT, 'frontend');
  const result = await build({
    entryPoints: [path.join(source, 'video-project-bridge.js')], bundle: true, write: false,
    platform: 'browser', format: 'iife', target: 'chrome120', minify: true, legalComments: 'inline'
  });
  const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  if (!/<head(?:\s[^>]*)?>/i.test(shared.html)) throw new Error('Video project SPA is missing its head element.');
  const panelBoot = '<script data-video-project-panel-boot>window.__VP_PANEL__ = Object.assign({ platform: "codex", view: "projects" }, window.__VP_PANEL__ || {});</script>';
  const html = shared.html.replace(/<head(?:\s[^>]*)?>/i, match => match + '\n' + panelBoot + '\n<script data-video-project-bridge>' + script + '</script>');
  const output = path.join(destination, 'platforms/codex-plugin/frontend/panel-video-project.html');
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, html);
  return output;
}
