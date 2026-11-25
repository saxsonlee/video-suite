#!/usr/bin/env node
// 静态校验 seedance-studio 客户端 bundle：格式、导出、依赖白名单、QA 钩子、样式变量。
// 用法：node scripts/check-client-bundle.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.resolve(here, '..', 'platforms', 'dsh-plugin', 'frontend', 'index.js');
const EXPECTED_ID = 'dsh-seedance-studio';
const REQUIRED_EXPORTS = ['apply', 'inject'];
const REQUIRED_SERVICES = ['slots', 'locale', 'layout', 'sessions', 'sidebarRightTabs'];
const ALLOWED_REQUIRES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]);
const REQUIRED_HOOKS = [
  'data-seedance-panel',
  'data-seedance-mode',
  'data-seedance-prompt',
  'data-seedance-generate',
  'data-seedance-card',
  'data-status',
  'data-seedance-history',
  'data-seedance-recreate-modal',
  'data-seedance-settings-modal',
  'data-seedance-player',
  'data-seedance-queue',
  'data-seedance-material',
  'data-seedance-params',
  'card-chat-open',
  'card-chat-send',
];
const REQUIRED_TESTIDS = [
  'sd-prompt',
  'sd-generate',
  'sd-history-card',
  'sd-card-progress-value',
  'sd-queue-progress',
  'sd-recreate',
  'sd-creator-collapse',
  'sd-mode-tab',
  'sd-recreate-modal',
  'sd-settings-modal',
  'sd-player',
  'sd-spa-frame',
  'sd-chat-open',
  'sd-chat-send',
  'sd-settings-custom-model',
  'sd-settings-relay-fetch',
  'sd-settings-relay-models',
  'sd-settings-relay-filter',
  'sd-settings-relay-selected',
  'sd-settings-relay-remove',
];

const failures = [];
const checks = [];
function check(name, fn) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail: detail === undefined ? '' : String(detail) });
  } catch (error) {
    checks.push({ name, ok: false, detail: error && error.message ? error.message : String(error) });
    failures.push(name + ': ' + (error && error.message ? error.message : error));
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

const source = fs.readFileSync(bundlePath, 'utf8');

// 1) 语法可解析
check('syntax: bundle parses as ES script', () => {
  new vm.Script(source, { filename: 'platforms/dsh-plugin/frontend/index.js' });
  return source.length + ' bytes';
});

// 2) bundle 外壳与注册
const registered = [];
const forbiddenRequires = [];
const seenRequires = new Set();
const stubReact = {
  createElement: () => ({}),
  Fragment: Symbol('react.fragment'),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
  useRef: (initial) => ({ current: initial === undefined ? null : initial }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  memo: (fn) => fn,
  forwardRef: (fn) => fn,
};
const stubs = new Map([
  ['react', stubReact],
  ['react/jsx-runtime', { jsx: () => ({}), jsxs: () => ({}), Fragment: stubReact.Fragment }],
  ['react-dom', { createPortal: () => ({}) }],
  ['react-dom/client', { createRoot: () => ({ render: () => {}, unmount: () => {} }) }],
]);
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(spec) { registered.push(spec); },
    },
  },
  console: { log: () => {}, warn: () => {}, error: () => {} },
};
sandbox.globalThis = sandbox;
const context = vm.createContext(sandbox);

check('bundle: single registration with expected id', () => {
  new vm.Script(source, { filename: 'platforms/dsh-plugin/frontend/index.js' }).runInContext(context);
  assert(registered.length === 1, 'expected exactly one __ModuleLoader__.load, got ' + registered.length);
  assert(registered[0].id === EXPECTED_ID, 'unexpected bundle id: ' + registered[0].id);
  assert(typeof registered[0].factory === 'function', 'factory must be a function');
  return EXPECTED_ID;
});

// 3) 运行 factory（require 白名单）
let exportsObject = null;
check('factory: loads with only allow-listed platform modules', () => {
  const spec = registered[0];
  exportsObject = spec.factory((name) => {
    seenRequires.add(name);
    if (!ALLOWED_REQUIRES.has(name)) {
      forbiddenRequires.push(name);
      throw new Error('forbidden require: ' + name);
    }
    if (stubs.has(name)) return stubs.get(name);
    if (name === '@deepseek-ai/cordis') return {};
    if (name === 'zod') return { z: { object: () => ({}), string: () => ({}) } };
    if (name === '@tanstack/react-virtual') return { useVirtualizer: () => ({ getVirtualItems: () => [] }) };
    return {};
  });
  assert(exportsObject && typeof exportsObject === 'object', 'factory did not return module.exports');
  return 'requires: ' + [...seenRequires].join(', ');
});

// 4) 导出契约
check('exports: apply() and inject[] present', () => {
  assert(exportsObject, 'factory exports missing');
  for (const key of REQUIRED_EXPORTS) {
    assert(key in exportsObject, 'missing export: ' + key);
  }
  assert(typeof exportsObject.apply === 'function', 'exports.apply must be function');
  assert(Array.isArray(exportsObject.inject), 'exports.inject must be array');
  for (const service of REQUIRED_SERVICES) {
    assert(exportsObject.inject.indexOf(service) !== -1, 'inject missing service: ' + service);
  }
  return exportsObject.inject.join(', ');
});

// 5) apply(ctx) 冒烟：注册 main + sidebar.panellist，不抛错
check('apply: registers main panel and sidebar entry with mock ctx', () => {
  assert(exportsObject, 'factory exports missing');
  const registrations = [];
  const effects = [];
  const rightSidebarTypes = [];
  const mockCtx = {
    effect(fn) { const disposer = fn(); effects.push(disposer); },
    locale: {
      register() {},
      bind() { return (key) => key; },
    },
    slots: {
      inject(name, fn) { fn(); },
      register(spec, component) {
        registrations.push({ spec, component });
        return () => {};
      },
    },
    sidebarRightTabs: { register(definition) { rightSidebarTypes.push(definition); return () => {}; } },
    layout: { selectPanel() {} },
    sessions: {
      list: { getSnapshot() { return { ids: [], byId: {} }; }, subscribe() { return () => {}; } },
      retainInfo() { return { getSnapshot() { return { retainedBy: {} }; } }; },
    },
    get() { return undefined; },
  };
  exportsObject.apply(mockCtx);
  const names = registrations.map((item) => item.spec && item.spec.name);
  assert(names.indexOf('main') !== -1, 'main panel not registered: ' + JSON.stringify(names));
  assert(names.indexOf('sidebar.panellist') !== -1, 'sidebar.panellist not registered: ' + JSON.stringify(names));
  const main = registrations.find((item) => item.spec.name === 'main');
  assert(main.spec.key === 'seedance' || main.spec.key === 'seedance-studio', 'unexpected main panel key: ' + main.spec.key);
  assert(typeof main.component === 'function', 'main panel component missing');
  const sidebar = registrations.find((item) => item.spec.name === 'sidebar.panellist');
  assert(typeof sidebar.spec.label === 'function', 'sidebar label must be function');
  assert(fn2Label(sidebar.spec.label()).length > 0, 'sidebar label empty');
  // 右侧边栏（右栏 tab + guide 卡片）
  assert(names.indexOf('sidebar.right.pane.tab') !== -1, 'right sidebar tab body not registered: ' + JSON.stringify(names));
  assert(rightSidebarTypes.length === 1, 'expected one right-sidebar tab type, got ' + rightSidebarTypes.length);
  const sidebarType = rightSidebarTypes[0];
  assert(sidebarType.id === 'dsh-seedance-studio/studio', 'unexpected tab type id: ' + sidebarType.id);
  assert(sidebarType.kind === 'seedance-studio', 'unexpected tab kind: ' + sidebarType.kind);
  assert(Array.isArray(sidebarType.guide) && sidebarType.guide.length === 1, 'right sidebar guide entry missing');
  assert(sidebarType.guide[0].id === 'studio', 'guide entry id must be studio');
  assert(typeof sidebarType.guide[0].title === 'function' && fn2Label(sidebarType.guide[0].title()).length > 0, 'guide title empty');
  const bodyReg = registrations.find((item) => item.spec.name === 'sidebar.right.pane.tab');
  assert(bodyReg.spec.key === sidebarType.id, 'right sidebar body key mismatch');
  assert(typeof bodyReg.component === 'function', 'right sidebar body component missing');
  return 'main=' + main.spec.key + ', sidebar.id=' + sidebar.spec.id + ', rightbar=' + sidebarType.kind;

  function fn2Label(value) { return typeof value === 'string' ? value : ''; }
});

// 6) 依赖白名单
check('requires: no forbidden platform modules', () => {
  assert(forbiddenRequires.length === 0, 'forbidden requires: ' + forbiddenRequires.join(', '));
  assert(seenRequires.has('react'), 'react is required by the bundle');
  const unknown = [...seenRequires].filter((name) => !ALLOWED_REQUIRES.has(name));
  assert(unknown.length === 0, 'unknown requires: ' + unknown.join(', '));
  return [...seenRequires].join(', ');
});

// 7) QA 钩子 / testid 稳定性
check('hooks: required data-seedance-* attributes present', () => {
  const missing = REQUIRED_HOOKS.filter((hook) => source.indexOf(hook) === -1);
  assert(missing.length === 0, 'missing hooks: ' + missing.join(', '));
  return REQUIRED_HOOKS.length + ' hooks';
});
check('testids: stable data-testid attributes present', () => {
  const missing = REQUIRED_TESTIDS.filter((id) => source.indexOf("'" + id + "'") === -1 && source.indexOf('"' + id + '"') === -1);
  assert(missing.length === 0, 'missing testids: ' + missing.join(', '));
  return REQUIRED_TESTIDS.length + ' testids';
});
check('chat bridge: session jump + send-to-chat code present', () => {
  for (const needle of ['function openSessionChat', 'function sendRecordToChat', 'chat.continueMessage', "'uiWorkspace'", "'conversation'"]) {
    assert(source.indexOf(needle) !== -1, 'missing chat bridge code: ' + needle);
  }
  return 'chat bridge wired';
});
check('relay: settings wires model probe + custom model', () => {
  for (const needle of ["'/api/seedance/relay/models'", 'sd-settings-relay-fetch', 'sd-settings-relay-selected', 'sd-settings-relay-remove', 'settings.relaySelectedTitle', '__custom__']) {
    assert(source.indexOf(needle) !== -1, 'missing relay settings code: ' + needle);
  }
  return 'relay settings wired';
});

check('hooks: no random/volatile data-testid suffixes', () => {
  const matches = source.match(/data-testid['"]?\s*:\s*[^,\n]*\bMath\.random/g);
  assert(!matches, 'data-testid must not include randomness');
  return 'ok';
});

// 8) 样式：仅用 DSH 主题变量 + 无遗留硬编码大色块
check('css: uses DSH theme variables (--dsw-*)', () => {
  const count = (source.match(/--dsw-[a-z0-9-]+/g) || []).length;
  assert(count >= 20, 'expected >= 20 --dsw-* variable references, got ' + count);
  return count + ' var refs';
});
check('css: no dark hardcoded page background', () => {
  const bad = ['#0d0d12', '#111119', '#0a0a0f', 'background: #000000'].filter((needle) => source.indexOf(needle) !== -1);
  assert(bad.length === 0, 'hardcoded theme colors found: ' + bad.join(', '));
  return 'ok';
});
check('css: sidebar window scrolls (root overflow-y + sticky header)', () => {
  assert(source.includes("dsh-sd-root[data-variant='sidebar']"), 'missing sidebar variant rule');
  assert(/dsh-sd-root\[data-variant='sidebar'\][\s\S]{0,400}?overflow-y:\s*auto/.test(source), 'sidebar root is not a scroll container');
  assert(/dsh-sd-root\[data-variant='sidebar'\] \.dsh-sd-header[\s\S]{0,200}?position:\s*sticky/.test(source), 'sidebar header is not sticky');
  assert(source.includes('.dsh-sd-root[data-variant=\'sidebar\'] .dsh-sd-gallery-body { overflow: visible; max-height: none; }'), 'gallery still nested-scrolls in sidebar');
  return 'sidebar scroll ok';
});

check('css: mode tabs wrap so every mode stays visible', () => {
  assert(/\.dsh-sd-modebar[^}]*flex-wrap:\s*wrap/.test(source), 'modebar should flex-wrap (all modes visible)');
  assert(/\.dsh-sd-mode\b[^}]*flex:\s*1 1 auto/.test(source), 'mode buttons should shrink/wrap');
  return 'ok';
});

check('persistence: no localStorage / sessionStorage of form data', () => {
  assert(!/localStorage\./.test(source), 'localStorage usage found');
  assert(!/sessionStorage\./.test(source), 'sessionStorage usage found');
  return 'ok';
});

// 9) 中英文案字典
check('i18n: locale dictionaries registered in apply', () => {
  assert(/locale\.register\(NS/.test(source) || /locale\.register\(/.test(source), 'locale.register missing');
  assert(source.indexOf('DICT_ZH') !== -1 && source.indexOf('DICT_EN') !== -1, 'dictionaries missing from bundle');
  assert(source.indexOf('installTranslator') !== -1, 'installTranslator missing from bundle');
  return 'ok';
});

// 加载 frontend 源字典（供 i18n 校验用；build 脚本保证 src 与 bundle 同步）
function loadFrontendDict() {
  const dictPath = path.resolve(here, '..', 'platforms', 'dsh-plugin', 'frontend', 'src', 'i18n', 'dictionaries.js');
  const code = fs.readFileSync(dictPath, 'utf8');
  return new Function(code + '\nreturn { DICT_ZH, DICT_EN, dictionaryKeyDiff };')();
}

check('i18n: zh/en dictionaries have identical key sets', () => {
  const dict = loadFrontendDict();
  const diff = dict.dictionaryKeyDiff();
  assert(diff.missingEn.length === 0, 'missing en keys: ' + diff.missingEn.slice(0, 5).join(','));
  assert(diff.missingZh.length === 0, 'missing zh keys: ' + diff.missingZh.slice(0, 5).join(','));
  const count = Object.keys(dict.DICT_ZH).length;
  assert(count >= 300, 'too few dictionary keys: ' + count);
  return count + ' keys';
});

// 10) 无 React 渲染冒烟：迷你 hook 运行器渲染 StudioPage / 卡片 / 弹窗，捕获渲染期引用错误
function createMiniReact() {
  const Fragment = Symbol('mini.fragment');
  const stack = [];
  function current() { return stack.length ? stack[stack.length - 1] : null; }
  function hookSlot(create) {
    const instance = current();
    if (!instance) return create ? create() : undefined;
    const index = instance.index++;
    if (!(index in instance.hooks)) instance.hooks[index] = create ? create() : undefined;
    return instance.hooks[index];
  }
  function createElement(type, config, ...children) {
    const props = Object.assign({}, config || {});
    if (children.length === 1) props.children = children[0];
    else if (children.length > 1) props.children = children;
    return { type, props };
  }
  const React = {
    Fragment,
    createElement,
    useState(initial) {
      const value = hookSlot(() => (typeof initial === 'function' ? initial() : initial));
      return [value, () => {}];
    },
    useEffect() { const instance = current(); if (instance) instance.index += 1; },
    useRef(initial) {
      return hookSlot(() => ({ current: initial === undefined ? null : initial }));
    },
    useMemo(fn) { return hookSlot(() => fn()); },
    useCallback(fn) { hookSlot(() => fn); return fn; },
    memo(fn) { return fn; },
    forwardRef(fn) { return fn; },
  };
  function render(element, stats) {
    stats.count += 1;
    if (element === null || element === undefined || typeof element === 'boolean') return;
    if (typeof element === 'string' || typeof element === 'number') { stats.text += 1; if (stats.texts) stats.texts.push(String(element)); return; }
    if (Array.isArray(element)) { for (const item of element) render(item, stats); return; }
    const type = element.type;
    const props = element.props || {};
    if (type === Fragment) { render(props.children, stats); return; }
    if (typeof type === 'function') {
      stats.components += 1;
      stack.push({ hooks: [], index: 0 });
      let output;
      try { output = type(props); } finally { stack.pop(); }
      render(output, stats);
      return;
    }
    if (typeof type === 'string') { render(props.children, stats); return; }
  }
  return { React, Fragment, createElement, render, stackDepth: () => stack.length };
}

function makeMockCtx() {
  return {
    effect() {},
    locale: { register() {}, bind() { return (key) => key; } },
    slots: { inject(name, fn) { try { fn(); } catch (error) { /* noop */ } }, register() { return () => {}; } },
    sidebarRightTabs: { register() { return () => {}; } },
    layout: { selectPanel() {} },
    sessions: {
      list: { getSnapshot() { return { ids: [], byId: {} }; }, subscribe() { return () => {}; } },
      retainInfo() { return { getSnapshot() { return { retainedBy: {} }; } }; },
    },
    get() { return undefined; },
  };
}

const noop = () => {};
const toast = () => {};

check('form: enabled model picklist steers default model + choices', () => {
  sandbox.window.__SEEDANCE_TEST__ = true;
  const testExports = registered[0].factory((name) => (name === 'react' ? createMiniReact().React : {}));
  const t = testExports.__test;
  const models = t.FALLBACK_MODELS;
  const defaults = {
    defaultModel: 'doubao-seedance-2-5-260628',
    enabledModels: [{ id: 'relay-model-a', label: 'Relay A' }, { id: 'doubao-seedance-2.5', label: 'Seedance 2.5 relay' }],
  };
  const formModels = defaults.enabledModels.map((item) => {
    const known = models.find((model) => model.id === item.id);
    return known || Object.assign({}, models[0], { id: item.id, label: item.label, deprecated: false });
  });
  // 默认模型在清单里 → 保留（清单第二项）
  const kept = t.createEmptyForm(formModels, Object.assign({}, defaults, { defaultModel: 'doubao-seedance-2.5' }));
  assert(kept.modelId === 'doubao-seedance-2.5', 'default model in picklist should be kept, got ' + kept.modelId);
  // 默认模型不在清单 → 用清单首项
  const fallback = t.createEmptyForm(formModels, defaults);
  assert(fallback.modelId === 'relay-model-a', 'default outside picklist should fall back to first enabled model, got ' + fallback.modelId);
  // 旧选择不在清单 → 收敛到清单首项
  const stale = t.sanitizeForm({ mode: 'text2video', prompt: '', modelId: 'doubao-seedance-1-0-pro-250528', customModel: '', params: kept.params, assets: kept.assets }, formModels, defaults);
  assert(stale.modelId === 'relay-model-a', 'stale model selection should converge to picklist, got ' + stale.modelId);
  // 清单为空 → 内置默认不变
  const plain = t.createEmptyForm(models, { defaultModel: 'doubao-seedance-2-5-260628' });
  assert(plain.modelId === 'doubao-seedance-2-5-260628', 'empty picklist must not change built-in default, got ' + plain.modelId);
  // normalizeConfig 保留清单（服务端 /config defaults.enabledModels）
  const cfg = t.normalizeConfig({ models, defaults: { enabledModels: [{ id: 'relay-model-a', label: 'Relay A' }] } });
  assert(JSON.stringify(cfg.defaults.enabledModels) === JSON.stringify([{ id: 'relay-model-a', label: 'Relay A' }]), 'normalizeConfig should keep enabledModels: ' + JSON.stringify(cfg.defaults.enabledModels));
  return 'enabled picklist ok';
});

check('render: StudioPage renders iframe shell pointing at shared SPA', () => {
  assert(registered.length === 1, 'bundle registration missing');
  sandbox.window.__SEEDANCE_TEST__ = true;
  const mini = createMiniReact();
  const testExports = registered[0].factory((name) => {
    if (name === 'react') return mini.React;
    return {};
  });
  assert(testExports && testExports.__test, '__test internals missing (test hook not activated)');
  const t = testExports.__test;
  const stats = { count: 0, components: 0, text: 0 };
  mini.render(mini.createElement(t.StudioPage, { ctx: makeMockCtx() }), stats);
  assert(stats.count >= 1, 'StudioPage rendered nothing');
  assert(source.includes('/api/seedance/panel'), 'shared SPA route missing');
  assert(source.includes('dsh-sd-spa-frame'), 'iframe shell missing');
  return stats.count + ' nodes (iframe shell)';
});

check('render: right sidebar studio window renders iframe shell', () => {
  const testExports = registered[0].factory((name) => (name === 'react' ? createMiniReact().React : {}));
  const t = testExports.__test;
  assert(t && typeof t.SidebarStudioBody === 'function', 'SidebarStudioBody not exported');
  const mini = createMiniReact();
  const stats = { count: 0, components: 0, text: 0 };
  mini.render(mini.createElement(t.SidebarStudioBody, { ctx: makeMockCtx() }), stats);
  assert(stats.count >= 1, 'sidebar studio window rendered nothing');
  return stats.count + ' nodes (iframe shell)';
});

check('render: history cards in every status + draft marker', () => {
  const testExports = registered[0].factory((name) => (name === 'react' ? createMiniReact().React : {}));
  const t = testExports.__test;
  const mini = createMiniReact();
  const models = t.FALLBACK_MODELS;
  const createdAt = Date.now() - 3 * 60 * 1000;
  const base = {
    id: 'sd_1700000000000_abcd', sessionId: 's1', createdAt, updatedAt: createdAt,
    prompt: '测试提示词：山谷航拍', model: 'doubao-seedance-2-5-260628', provider: 'demo', mode: 'text2video',
    params: { resolution: '720p', ratio: 'adaptive', duration: -1, autoDuration: true, generateAudio: true },
    inputs: { images: [], video: null, audio: null }, files: { video: 'v.mp4', poster: 'p.jpg' }, meta: {}, progress: 100,
  };
  let total = 0;
  for (const status of ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired']) {
    const stats = { count: 0, components: 0, text: 0 };
    mini.render(mini.createElement(t.HistoryCard, {
      record: Object.assign({}, base, { status }), models, highlight: false, hasFinal: false,
      onPlay: noop, onRecreate: noop, onDownload: noop, onDelete: noop, onCancel: noop, onDraftFinal: noop,
      onOpenChat: noop, onSendToChat: noop,
    }), stats);
    assert(stats.count > 15, 'card status ' + status + ' rendered too few nodes');
    total += stats.count;
  }
  // 样片 + 来源标记
  const draftStats = { count: 0, components: 0, text: 0 };
  mini.render(mini.createElement(t.HistoryCard, {
    record: Object.assign({}, base, { status: 'succeeded', mode: 'draft', originId: 'sd_1699999999999_orig', remoteTaskId: 'cgt-draft-1' }),
    models, hasFinal: false, onPlay: noop, onRecreate: noop, onDownload: noop, onDelete: noop, onCancel: noop, onDraftFinal: noop,
    onOpenChat: noop, onSendToChat: noop,
  }), draftStats);
  assert(draftStats.count > 15, 'draft card rendered too few nodes');
  total += draftStats.count;
  // 历史面板（含队列/空态/filter）
  const panelStats = { count: 0, components: 0, text: 0 };
  mini.render(mini.createElement(t.HistoryPanel, {
    records: [base, Object.assign({}, base, { id: 'sd_1700000000001_beef', status: 'running', progress: 40 })],
    status: 'ready', demo: true, models, highlightId: base.id,
    onRefresh: noop, onPlay: noop, onRecreate: noop, onDownload: noop, onDelete: noop, onCancel: noop, onDraftFinal: noop, onUseTemplate: noop,
    onOpenChat: noop, onSendToChat: noop,
  }), panelStats);
  assert(panelStats.count > 80, 'history panel rendered too few nodes');
  return total + panelStats.count + ' nodes total';
});

check('render: player / recreate / settings / video-pick modals render', () => {
  const testExports = registered[0].factory((name) => (name === 'react' ? createMiniReact().React : {}));
  const t = testExports.__test;
  const mini = createMiniReact();
  const models = t.FALLBACK_MODELS;
  const record = {
    id: 'sd_1700000000000_abcd', sessionId: 's1', createdAt: Date.now() - 60000, updatedAt: Date.now() - 30000,
    prompt: '来源视频提示词', model: 'doubao-seedance-2-5-260628', provider: 'demo', mode: 'text2video', status: 'succeeded',
    params: { resolution: '1080p', ratio: 'adaptive', duration: -1, autoDuration: true, generateAudio: true },
    inputs: { images: [], video: null, audio: null }, files: { video: 'v.mp4', poster: 'p.jpg' }, meta: {},
    remoteTaskId: 'cgt-task-1', remoteVideoUrl: 'https://example.com/v.mp4', progress: 100,
  };
  const results = [];
  for (const [name, element] of [
    ['player', mini.createElement(t.PlayerModal, { record, models, onClose: noop, onRecreate: noop, onDownload: noop, onToast: toast })],
    ['recreate', mini.createElement(t.RecreateModal, { record, models, sessionId: 's1', initialFrame: { frameDataUrl: 'data:image/jpeg;base64,AAAA' }, submitting: false, onClose: noop, onSubmit: noop })],
    ['settings', mini.createElement(t.SettingsModal, { open: true, models, demo: true, onClose: noop, onSaved: noop, onToast: toast })],
    ['videoPick', mini.createElement(t.VideoPickModal, { records: [record], onPick: noop, onClose: noop })],
    ['panelIcon', mini.createElement(t.PanelIcon, {})],
  ]) {
    const stats = { count: 0, components: 0, text: 0 };
    mini.render(element, stats);
    assert(stats.count > 5, name + ' rendered too few nodes');
    results.push(name + '=' + stats.count);
  }
  return results.join(', ');
});

check('i18n: English locale renders without Chinese UI text', () => {
  const dict = loadFrontendDict();
  const mini = createMiniReact();
  const testExports = registered[0].factory((name) => (name === 'react' ? mini.React : {}));
  assert(testExports && testExports.__test, '__test internals missing (test hook not activated)');
  const ctx = Object.assign(makeMockCtx(), {
    effect(fn) {
      const dispose = fn();
      return typeof dispose === 'function' ? dispose : undefined;
    },
    locale: {
      register() {},
      bind() { return (key) => (dict.DICT_EN[key] === undefined ? key : dict.DICT_EN[key]); },
    },
  });
  testExports.apply(ctx);
  const t = testExports.__test;
  const stats = { count: 0, components: 0, text: 0, texts: [] };
  mini.render(mini.createElement(t.StudioPage, { ctx }), stats);
  const chinese = stats.texts.filter((text) => /[\u4e00-\u9fa5]/.test(text));
  assert(chinese.length === 0, 'English render contains Chinese: ' + chinese.slice(0, 5).join(' | '));
  // iframe 壳本身没有文本节点：用仍保留的 HistoryPanel 空状态补充英文渲染检查
  const extra = { count: 0, components: 0, text: 0, texts: [] };
  mini.render(mini.createElement(t.HistoryPanel, { records: [], status: 'ready', demo: true, models: t.FALLBACK_MODELS }), extra);
  const extraChinese = extra.texts.filter((text) => /[\u4e00-\u9fa5]/.test(text));
  assert(extraChinese.length === 0, 'English HistoryPanel has Chinese: ' + extraChinese.slice(0, 5).join(' | '));
  assert(extra.texts.some((text) => /[A-Za-z]/.test(text)), 'English render has no latin text');
  return (stats.texts.length + extra.texts.length) + ' text nodes';
});

check('test hook: __test not exported outside test mode', () => {
  sandbox.window.__SEEDANCE_TEST__ = false;
  const mini = createMiniReact();
  const prodExports = registered[0].factory((name) => (name === 'react' ? mini.React : {}));
  assert(prodExports && typeof prodExports.apply === 'function', 'apply missing in prod mode');
  assert(prodExports.__test === undefined, '__test must not be exported in production');
  return 'ok';
});

// 输出
console.log('seedance-studio client bundle check');
console.log('  bundle: ' + path.relative(process.cwd(), bundlePath));
for (const item of checks) {
  console.log((item.ok ? '  PASS  ' : '  FAIL  ') + item.name + (item.detail ? '  [' + item.detail + ']' : ''));
}
if (failures.length) {
  console.error('\n' + failures.length + ' check(s) failed');
  process.exitCode = 1;
} else {
  console.log('\nAll ' + checks.length + ' checks passed.');
}
