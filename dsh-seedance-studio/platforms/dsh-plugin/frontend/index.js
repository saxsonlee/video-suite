window.__ModuleLoader__.load({
  id: 'dsh-seedance-studio',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');
    const NS = 'seedance';
    const PANEL_ID = 'seedance';
    /** 平台注入的服务：slots/locale/layout/sessions/sidebarRightTabs 见 PLAN §3.2；uiSession 通过 ctx.get 可选获取。 */
    const inject = ['slots', 'locale', 'layout', 'sessions', 'sidebarRightTabs'];

    const h = React.createElement;
    const D = React.Fragment;

    // ==========================================================================
    // 主题样式（全部基于 DSH --dsw-* 主题变量，兼容暗色/亮色）
    // ==========================================================================
    const CSS = String.raw`
      .dsh-sd-root {
        --sd-accent: var(--dsw-alias-brand-primary, #4f7cff);
        --sd-accent-2: var(--dsw-alias-state-business-primary, #a855f7);
        --sd-success: var(--dsw-alias-state-success-primary, #22c55e);
        --sd-error: var(--dsw-alias-state-error-primary, #ef4444);
        --sd-warn: var(--dsw-alias-state-warn-primary, #f59e0b);
        --sd-bg: var(--dsw-alias-bg-base, #101116);
        --sd-layer-1: var(--dsw-alias-bg-layer-1, #171922);
        --sd-layer-2: var(--dsw-alias-bg-layer-2, #1d202a);
        --sd-layer-3: var(--dsw-alias-bg-layer-3, #242834);
        --sd-border-1: var(--dsw-alias-border-l1, rgba(255, 255, 255, 0.08));
        --sd-border-2: var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.14));
        --sd-text-1: var(--dsw-alias-label-primary, #f4f6fb);
        --sd-text-2: var(--dsw-alias-label-secondary, #b8bece);
        --sd-text-3: var(--dsw-alias-label-tertiary, #8b93a7);
        --sd-hover: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, 0.08));
        --sd-radius-lg: var(--dsw-radius-lg, 12px);
        --sd-radius-xl: var(--dsw-radius-xl, 18px);
        --sd-radius-md: var(--dsw-radius-md, 8px);
        --sd-radius-sm: var(--dsw-radius-sm, 6px);
        --sd-font: var(--dsw-font-family, system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif);
        --sd-mono: var(--dsw-font-mono, ui-monospace, 'Cascadia Code', Consolas, monospace);
        --sd-shadow: var(--dsw-shadow-lv2, 0 12px 32px rgba(0, 0, 0, 0.28));
        color-scheme: light dark;
        position: relative;
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        color: var(--sd-text-1);
        font-family: var(--sd-font);
        font-size: 13px;
        line-height: 1.55;
        background:
          radial-gradient(1100px 560px at 6% -12%, color-mix(in srgb, var(--sd-accent) 17%, transparent), transparent 62%),
          radial-gradient(900px 520px at 102% -6%, color-mix(in srgb, var(--sd-accent-2) 13%, transparent), transparent 58%),
          var(--sd-bg);
        isolation: isolate;
      }
      .dsh-sd-root * { box-sizing: border-box; }
      .dsh-sd-root button { font-family: inherit; }
      .dsh-sd-root ::selection { background: color-mix(in srgb, var(--sd-accent) 42%, transparent); }

      .dsh-sd-header {
        flex: none;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 22px 12px;
        border-bottom: 1px solid var(--sd-border-1);
        background: color-mix(in srgb, var(--sd-bg) 74%, transparent);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        z-index: 3;
      }
      .dsh-sd-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .dsh-sd-brand-mark {
        width: 34px; height: 34px; flex: none; border-radius: 11px;
        display: grid; place-items: center; color: #fff;
        background: linear-gradient(140deg, var(--sd-accent), var(--sd-accent-2));
        box-shadow: 0 6px 18px color-mix(in srgb, var(--sd-accent) 36%, transparent);
      }
      .dsh-sd-brand-text { min-width: 0; }
      .dsh-sd-brand-title { font-size: 15px; font-weight: 650; letter-spacing: 0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dsh-sd-brand-sub { font-size: 11px; color: var(--sd-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .dsh-sd-header-spacer { flex: 1 1 auto; }
      .dsh-sd-header-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .dsh-sd-status-pill {
        display: inline-flex; align-items: center; gap: 6px;
        height: 28px; padding: 0 10px; border-radius: 999px;
        font-size: 12px; line-height: 1; white-space: nowrap;
        border: 1px solid var(--sd-border-1);
        background: var(--sd-layer-1); color: var(--sd-text-2);
      }
      .dsh-sd-status-pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sd-warn); }
      .dsh-sd-status-pill[data-tone='demo'] { color: var(--sd-warn); border-color: color-mix(in srgb, var(--sd-warn) 42%, transparent); background: color-mix(in srgb, var(--sd-warn) 12%, transparent); }
      .dsh-sd-status-pill[data-tone='live'] { color: var(--sd-success); border-color: color-mix(in srgb, var(--sd-success) 38%, transparent); background: color-mix(in srgb, var(--sd-success) 10%, transparent); }
      .dsh-sd-status-pill[data-tone='live'] .dot { background: var(--sd-success); }
      .dsh-sd-status-pill[data-tone='offline'] { color: var(--sd-error); border-color: color-mix(in srgb, var(--sd-error) 38%, transparent); background: color-mix(in srgb, var(--sd-error) 10%, transparent); }
      .dsh-sd-status-pill[data-tone='offline'] .dot { background: var(--sd-error); }

      .dsh-sd-iconbtn {
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        height: 30px; min-width: 30px; padding: 0 9px;
        border-radius: var(--sd-radius-md);
        border: 1px solid var(--sd-border-1);
        background: var(--sd-layer-1);
        color: var(--sd-text-2);
        cursor: pointer; font-size: 12px;
        transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
      }
      .dsh-sd-iconbtn:hover { background: var(--sd-hover); color: var(--sd-text-1); border-color: var(--sd-border-2); }
      .dsh-sd-iconbtn:active { transform: scale(0.97); }
      .dsh-sd-iconbtn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--sd-accent)); outline-offset: 1px; }
      .dsh-sd-iconbtn:disabled { opacity: 0.45; cursor: not-allowed; }
      .dsh-sd-iconbtn[data-variant='primary'] {
        border: none; color: #fff;
        background: linear-gradient(135deg, var(--sd-accent), var(--sd-accent-2));
      }
      .dsh-sd-iconbtn[data-variant='danger'] { color: var(--sd-error); }
      .dsh-sd-iconbtn[data-variant='ghost'] { background: transparent; border-color: transparent; }
      .dsh-sd-iconbtn[data-variant='ghost']:hover { background: var(--sd-hover); }

      .dsh-sd-select, .dsh-sd-input, .dsh-sd-textarea {
        width: 100%;
        color: var(--sd-text-1);
        background: color-mix(in srgb, var(--sd-layer-2) 88%, transparent);
        border: 1px solid var(--sd-border-1);
        border-radius: var(--sd-radius-md);
        font-family: inherit;
        font-size: 13px;
        padding: 8px 10px;
        outline: none;
        transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
      }
      .dsh-sd-select:hover, .dsh-sd-input:hover, .dsh-sd-textarea:hover { border-color: var(--sd-border-2); }
      .dsh-sd-select:focus, .dsh-sd-input:focus, .dsh-sd-textarea:focus {
        border-color: color-mix(in srgb, var(--sd-accent) 66%, var(--sd-border-2));
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--sd-accent) 16%, transparent);
      }
      .dsh-sd-select { height: 34px; padding: 0 28px 0 10px; appearance: none; cursor: pointer;
        background-image: linear-gradient(45deg, transparent 50%, var(--sd-text-3) 50%), linear-gradient(135deg, var(--sd-text-3) 50%, transparent 50%);
        background-position: calc(100% - 15px) 14px, calc(100% - 10px) 14px;
        background-size: 5px 5px, 5px 5px;
        background-repeat: no-repeat;
      }
      .dsh-sd-textarea { resize: none; line-height: 1.6; min-height: 96px; padding: 11px 12px; }
      .dsh-sd-input[type='number'] { -moz-appearance: textfield; }
      .dsh-sd-input[type='number']::-webkit-outer-spin-button,
      .dsh-sd-input[type='number']::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

      .dsh-sd-layout {
        flex: 1 1 auto;
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(360px, 440px) minmax(0, 1fr);
        gap: 18px;
        padding: 18px 22px 22px;
        overflow: hidden;
      }
      .dsh-sd-scroll { overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin;
        scrollbar-color: var(--dsw-alias-scrollbar-bg-l2, rgba(255,255,255,0.16)) transparent; }
      .dsh-sd-scroll::-webkit-scrollbar { width: 9px; height: 9px; }
      .dsh-sd-scroll::-webkit-scrollbar-thumb { background: var(--dsw-alias-scrollbar-bg-l2, rgba(255,255,255,0.16)); border-radius: 999px; border: 2px solid transparent; background-clip: padding-box; }
      .dsh-sd-scroll::-webkit-scrollbar-thumb:hover { background: var(--dsw-alias-scrollbar-hover-l2, rgba(255,255,255,0.28)); background-clip: padding-box; border: 2px solid transparent; }
      .dsh-sd-scroll::-webkit-scrollbar-track { background: transparent; }

      .dsh-sd-creator {
        min-height: 0;
        display: flex; flex-direction: column;
        border-radius: var(--sd-radius-xl);
        border: 1px solid var(--sd-border-1);
        background: color-mix(in srgb, var(--sd-layer-1) 86%, transparent);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        box-shadow: var(--sd-shadow);
        overflow: hidden;
      }
      .dsh-sd-creator-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px 0; }
.dsh-sd-creator-head-title { flex: 1 1 auto; font-size: 12px; font-weight: 650; color: var(--sd-text-2); letter-spacing: 0.3px; }
.dsh-sd-creator-collapse { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: 1px solid var(--sd-border-1); border-radius: 6px; background: transparent; color: var(--sd-text-2); cursor: pointer; }
.dsh-sd-creator-collapse:hover { background: var(--sd-hover); color: var(--sd-text-1); }
.dsh-sd-creator-collapse svg { transform: rotate(180deg); }
.dsh-sd-creator-expand { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 40px; padding: 12px 0; border: 1px solid var(--sd-border-1); border-radius: var(--sd-radius-xl); background: color-mix(in srgb, var(--sd-layer-1) 86%, transparent); color: var(--sd-text-2); cursor: pointer; align-self: start; }
.dsh-sd-creator-expand:hover { color: var(--sd-text-1); background: var(--sd-hover); }
.dsh-sd-creator-expand span { writing-mode: vertical-rl; letter-spacing: 2px; font-size: 11px; }
.dsh-sd-layout[data-creator-collapsed='true'] { grid-template-columns: 40px minmax(0, 1fr); }
.dsh-sd-creator-body { flex: 1 1 auto; min-height: 0; padding: 16px 16px 8px; }
      .dsh-sd-creator-foot {
        flex: none; padding: 12px 16px 16px;
        border-top: 1px solid var(--sd-border-1);
        background: color-mix(in srgb, var(--sd-layer-2) 66%, transparent);
      }

      .dsh-sd-section { margin-bottom: 16px; }
      .dsh-sd-section:last-child { margin-bottom: 4px; }
      .dsh-sd-section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
      .dsh-sd-section-title { font-size: 12px; font-weight: 650; color: var(--sd-text-2); letter-spacing: 0.3px; }
      .dsh-sd-section-hint { font-size: 11px; color: var(--sd-text-3); }
      .dsh-sd-section-extra { margin-left: auto; display: flex; align-items: center; gap: 6px; }

      /* 窄面板（侧边栏）下 6 个模式放不下一行：自动换行，保证每个模式都完整可见 */
      .dsh-sd-modebar { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: var(--sd-radius-lg);
        background: color-mix(in srgb, var(--sd-layer-3) 76%, transparent); border: 1px solid var(--sd-border-1);
        overflow: visible;
      }
      .dsh-sd-mode {
        flex: 1 1 auto; min-width: 0; white-space: nowrap;
        display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        height: 30px; padding: 0 10px; border-radius: calc(var(--sd-radius-lg) - 3px);
        border: 1px solid transparent; background: transparent; color: var(--sd-text-3);
        font-size: 12px; font-weight: 550; cursor: pointer;
        transition: all 0.16s ease;
      }
      .dsh-sd-mode:hover { color: var(--sd-text-1); background: var(--sd-hover); }
      .dsh-sd-mode[data-active='true'] {
        color: #fff;
        background: linear-gradient(135deg, color-mix(in srgb, var(--sd-accent) 88%, #fff), color-mix(in srgb, var(--sd-accent-2) 80%, #fff));
        box-shadow: 0 4px 14px color-mix(in srgb, var(--sd-accent) 30%, transparent);
      }
      .dsh-sd-mode:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--sd-accent)); outline-offset: 1px; }

      .dsh-sd-prompt-wrap { position: relative; }
      .dsh-sd-prompt {
        width: 100%; min-height: 108px; max-height: 260px; resize: vertical;
        border-radius: var(--sd-radius-lg); border: 1px solid var(--sd-border-1);
        background: color-mix(in srgb, var(--sd-layer-2) 82%, transparent);
        color: var(--sd-text-1); font-size: 13px; line-height: 1.65; padding: 11px 12px 30px;
        outline: none; font-family: inherit;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .dsh-sd-prompt:focus { border-color: color-mix(in srgb, var(--sd-accent) 60%, var(--sd-border-2)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sd-accent) 14%, transparent); }
      .dsh-sd-prompt::placeholder { color: var(--sd-text-3); }
      .dsh-sd-prompt-count { position: absolute; right: 10px; bottom: 7px; font-size: 11px; color: var(--sd-text-3); pointer-events: none; }
      .dsh-sd-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .dsh-sd-chip {
        border: 1px solid var(--sd-border-1); border-radius: 999px;
        background: color-mix(in srgb, var(--sd-layer-2) 72%, transparent);
        color: var(--sd-text-3); font-size: 11px; padding: 4px 10px; cursor: pointer;
        transition: all 0.15s ease;
      }
      .dsh-sd-chip:hover { color: var(--sd-text-1); border-color: var(--sd-border-2); background: var(--sd-hover); }
      .dsh-sd-chip:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--sd-accent)); outline-offset: 1px; }

      .dsh-sd-dropgrid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
      .dsh-sd-drop {
        position: relative; border: 1px dashed var(--sd-border-2); border-radius: var(--sd-radius-lg);
        background: color-mix(in srgb, var(--sd-layer-2) 56%, transparent);
        color: var(--sd-text-3); min-height: 92px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;
        cursor: pointer; text-align: center; padding: 8px; font-size: 11px; line-height: 1.35;
        transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
        overflow: hidden;
      }
      .dsh-sd-drop:hover, .dsh-sd-drop[data-drag='true'] { border-color: color-mix(in srgb, var(--sd-accent) 62%, var(--sd-border-2)); background: color-mix(in srgb, var(--sd-accent) 10%, transparent); color: var(--sd-text-2); }
      .dsh-sd-drop[data-filled='true'] { border-style: solid; padding: 0; }
      .dsh-sd-drop img { width: 100%; height: 100%; object-fit: cover; display: block; min-height: 92px; }
      .dsh-sd-drop .dsh-sd-drop-remove {
        position: absolute; top: 5px; right: 5px; width: 20px; height: 20px;
        display: grid; place-items: center; border-radius: 50%;
        background: rgba(0, 0, 0, 0.58); color: #fff; border: none; cursor: pointer;
        opacity: 0; transition: opacity 0.15s ease;
      }
      .dsh-sd-drop:hover .dsh-sd-drop-remove, .dsh-sd-drop:focus-within .dsh-sd-drop-remove { opacity: 1; }
      .dsh-sd-drop .dsh-sd-drop-role {
        position: absolute; left: 5px; bottom: 5px; max-width: calc(100% - 10px);
        font-size: 10px; padding: 1px 6px; border-radius: 999px;
        background: rgba(0, 0, 0, 0.55); color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .dsh-sd-drop input[type='file'] { display: none; }
      .dsh-sd-drop-note { font-size: 10px; color: var(--sd-text-3); margin-top: 6px; }

      .dsh-sd-rows { display: flex; flex-direction: column; gap: 9px; }
      .dsh-sd-row { display: flex; align-items: center; gap: 8px; }
      .dsh-sd-row-label { flex: none; width: 58px; font-size: 12px; color: var(--sd-text-3); }
      .dsh-sd-row-main { flex: 1 1 auto; min-width: 0; }

      .dsh-sd-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
      .dsh-sd-field-label { font-size: 11px; color: var(--sd-text-3); display: flex; align-items: center; gap: 5px; }
      .dsh-sd-params { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
      .dsh-sd-params .span2 { grid-column: span 2; }

      .dsh-sd-seg { display: inline-flex; padding: 3px; gap: 2px; border-radius: var(--sd-radius-md);
        background: color-mix(in srgb, var(--sd-layer-3) 72%, transparent); border: 1px solid var(--sd-border-1); width: 100%; }
      .dsh-sd-seg button {
        flex: 1 1 0; height: 26px; border: none; border-radius: calc(var(--sd-radius-md) - 2px);
        background: transparent; color: var(--sd-text-3); font-size: 11.5px; cursor: pointer; white-space: nowrap;
        transition: all 0.14s ease;
      }
      .dsh-sd-seg button:hover { color: var(--sd-text-1); }
      .dsh-sd-seg button[data-active='true'] { background: var(--sd-layer-1); color: var(--sd-text-1); box-shadow: 0 1px 4px rgba(0,0,0,0.18); font-weight: 600; }
      .dsh-sd-seg button:disabled { opacity: 0.4; cursor: not-allowed; }
      .dsh-sd-seg button:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--sd-accent)); outline-offset: 0; }
      .dsh-sd-seg[data-size='sm'] button { height: 22px; font-size: 11px; }

      .dsh-sd-switchrow { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 5px 0; }
      .dsh-sd-switchrow-label { font-size: 12px; color: var(--sd-text-2); display: flex; align-items: center; gap: 6px; }
      .dsh-sd-switchrow-label small { color: var(--sd-text-3); font-size: 10.5px; }
      .dsh-sd-switch {
        position: relative; flex: none; width: 34px; height: 19px; border-radius: 999px;
        border: 1px solid var(--sd-border-2); background: color-mix(in srgb, var(--sd-layer-3) 82%, transparent);
        cursor: pointer; padding: 0; transition: background 0.16s ease, border-color 0.16s ease;
      }
      .dsh-sd-switch::after {
        content: ''; position: absolute; top: 2px; left: 2px; width: 13px; height: 13px; border-radius: 50%;
        background: var(--sd-text-3); transition: transform 0.16s ease, background 0.16s ease;
      }
      .dsh-sd-switch[data-on='true'] { background: color-mix(in srgb, var(--sd-accent) 74%, transparent); border-color: color-mix(in srgb, var(--sd-accent) 80%, transparent); }
      .dsh-sd-switch[data-on='true']::after { transform: translateX(15px); background: #fff; }
      .dsh-sd-switch:disabled { opacity: 0.45; cursor: not-allowed; }
      .dsh-sd-switch:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--sd-accent)); outline-offset: 2px; }

      .dsh-sd-range { width: 100%; accent-color: var(--sd-accent); height: 22px; cursor: pointer; }
      .dsh-sd-duration { display: flex; align-items: center; gap: 8px; }
      .dsh-sd-duration .dsh-sd-input { width: 64px; text-align: center; height: 30px; padding: 0 6px; flex: none; }
      .dsh-sd-duration-unit { font-size: 11px; color: var(--sd-text-3); flex: none; }
      .dsh-sd-inline-check { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--sd-text-3); cursor: pointer; }
      .dsh-sd-inline-check input { accent-color: var(--sd-accent); }

      .dsh-sd-demo-banner {
        display: flex; align-items: center; gap: 9px;
        margin: 0 0 12px; padding: 9px 11px;
        border-radius: var(--sd-radius-lg);
        border: 1px solid color-mix(in srgb, var(--sd-warn) 30%, transparent);
        background: linear-gradient(120deg, color-mix(in srgb, var(--sd-warn) 13%, transparent), color-mix(in srgb, var(--sd-accent) 9%, transparent));
        font-size: 12px; color: var(--sd-text-2);
      }
      .dsh-sd-demo-banner b { color: var(--sd-warn); font-weight: 650; }
      .dsh-sd-demo-banner .dsh-sd-demo-action { margin-left: auto; flex: none; }

      .dsh-sd-offline {
        margin: 0 0 12px; padding: 12px 13px; border-radius: var(--sd-radius-lg);
        border: 1px solid color-mix(in srgb, var(--sd-error) 36%, transparent);
        background: color-mix(in srgb, var(--sd-error) 10%, transparent);
        color: var(--sd-text-2); font-size: 12px;
      }
      .dsh-sd-offline b { color: var(--sd-error); }
      .dsh-sd-offline code { font-family: var(--sd-mono); font-size: 11px; color: var(--sd-text-3); }

      .dsh-sd-generate {
        width: 100%; height: 42px; border: none; border-radius: var(--sd-radius-lg);
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        color: #fff; font-size: 14px; font-weight: 650; letter-spacing: 0.3px; cursor: pointer;
        background: linear-gradient(135deg, var(--sd-accent), var(--sd-accent-2));
        box-shadow: 0 10px 24px color-mix(in srgb, var(--sd-accent) 32%, transparent);
        transition: filter 0.16s ease, transform 0.12s ease, opacity 0.16s ease;
      }
      .dsh-sd-generate:hover:not(:disabled) { filter: brightness(1.07); }
      .dsh-sd-generate:active:not(:disabled) { transform: translateY(1px); }
      .dsh-sd-generate:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
      .dsh-sd-generate:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--sd-accent)); outline-offset: 2px; }
      .dsh-sd-generate-hint { margin-top: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--sd-text-3); flex-wrap: wrap; }
      .dsh-sd-generate-hint kbd {
        font-family: var(--sd-mono); font-size: 10px; padding: 1px 5px; border-radius: 4px;
        border: 1px solid var(--sd-border-1); background: var(--sd-layer-2); color: var(--sd-text-3);
      }
      .dsh-sd-error-line { margin-top: 8px; font-size: 12px; color: var(--sd-error); display: flex; align-items: center; gap: 6px; }

      .dsh-sd-gallery {
        min-height: 0; display: flex; flex-direction: column;
        border-radius: var(--sd-radius-xl);
        border: 1px solid var(--sd-border-1);
        background: color-mix(in srgb, var(--sd-layer-1) 66%, transparent);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        overflow: hidden;
      }
      .dsh-sd-gallery-head { flex: none; display: flex; align-items: center; gap: 12px; padding: 13px 16px 11px; border-bottom: 1px solid var(--sd-border-1); flex-wrap: wrap; }
      .dsh-sd-gallery-title { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 650; }
      .dsh-sd-gallery-count { font-size: 11px; color: var(--sd-text-3); font-weight: 400; }
      .dsh-sd-gallery-head-extra { margin-left: auto; display: flex; align-items: center; gap: 8px; }
      .dsh-sd-gallery-body { flex: 1 1 auto; min-height: 0; padding: 14px 16px 18px; }
      .dsh-sd-gallery-filterline { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
      .dsh-sd-gallery-filterline .dsh-sd-seg { width: auto; }
      .dsh-sd-gallery-filterline .dsh-sd-seg button { padding: 0 12px; }

      .dsh-sd-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(238px, 1fr)); gap: 13px; align-content: start; }
      .dsh-sd-card {
        position: relative; display: flex; flex-direction: column;
        border-radius: var(--sd-radius-lg);
        border: 1px solid var(--sd-border-1);
        background: color-mix(in srgb, var(--sd-layer-2) 82%, transparent);
        overflow: hidden;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        animation: sd-card-in 0.32s ease both;
      }
      .dsh-sd-card:hover { transform: translateY(-2px); border-color: var(--sd-border-2); box-shadow: 0 12px 26px rgba(0, 0, 0, 0.24); }
      .dsh-sd-card[data-highlight='true'] { border-color: color-mix(in srgb, var(--sd-accent) 72%, transparent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--sd-accent) 34%, transparent), 0 14px 30px color-mix(in srgb, var(--sd-accent) 18%, transparent); }
      @keyframes sd-card-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      .dsh-sd-card-media { position: relative; aspect-ratio: 16 / 9; background: linear-gradient(135deg, var(--sd-layer-3), var(--sd-layer-2)); overflow: hidden; }
      .dsh-sd-card-media video, .dsh-sd-card-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .dsh-sd-card-media[data-clickable='true'] { cursor: pointer; }
      .dsh-sd-card-media[data-clickable='true']:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--sd-accent)); outline-offset: -2px; }
      .dsh-sd-card-scrim {
        position: absolute; inset: 0; pointer-events: none;
        background: linear-gradient(to top, var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.5)), transparent 42%);
        opacity: 0.9;
      }
      .dsh-sd-card-play {
        position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
        width: 42px; height: 42px; border-radius: 50%; border: none; cursor: pointer;
        display: grid; place-items: center; color: #fff;
        background: rgba(10, 12, 18, 0.45); backdrop-filter: blur(6px);
        border: 1px solid rgba(255, 255, 255, 0.24);
        opacity: 0; transition: opacity 0.18s ease, background 0.18s ease;
      }
      .dsh-sd-card:hover .dsh-sd-card-play, .dsh-sd-card-play:focus-visible { opacity: 1; }
      .dsh-sd-card-play:hover { background: color-mix(in srgb, var(--sd-accent) 72%, rgba(10, 12, 18, 0.5)); }
      .dsh-sd-card-badge { position: absolute; top: 8px; left: 8px; z-index: 2; }
      .dsh-sd-card-provider { position: absolute; top: 8px; right: 8px; z-index: 2; }
      .dsh-sd-card-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255, 255, 255, 0.12); overflow: hidden; }
      .dsh-sd-card-progress i {
        display: block; height: 100%; width: var(--sd-progress, 20%);
        background: linear-gradient(90deg, var(--sd-accent), var(--sd-accent-2));
        transition: width 0.5s ease;
      }
      .dsh-sd-card-running-veil {
        position: absolute; inset: 0;
        background: linear-gradient(110deg, transparent 20%, color-mix(in srgb, var(--sd-accent) 16%, transparent) 40%, transparent 60%);
        background-size: 220% 100%;
        animation: sd-shimmer 1.8s linear infinite;
      }
      @keyframes sd-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }
      .dsh-sd-card-state { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 6px; color: var(--sd-text-3); font-size: 12px; }
      .dsh-sd-card-state[data-tone='error'] { color: var(--sd-error); }
      .dsh-sd-card-body { display: flex; flex-direction: column; gap: 7px; padding: 10px 11px 11px; }
      .dsh-sd-card-prompt {
        font-size: 12.5px; line-height: 1.5; color: var(--sd-text-1);
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        min-height: 37px; word-break: break-word;
      }
      .dsh-sd-card-prompt[data-empty='true'] { color: var(--sd-text-3); font-style: italic; }
      .dsh-sd-card-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 10.5px; color: var(--sd-text-3); }
      .dsh-sd-card-meta .sep { opacity: 0.5; }
      .dsh-sd-card-meta .origin { color: color-mix(in srgb, var(--sd-accent) 78%, var(--sd-text-2)); }
      .dsh-sd-card-actions { display: flex; align-items: center; gap: 4px; padding-top: 1px; }
      .dsh-sd-card-actions .grow { flex: 1 1 auto; }
      .dsh-sd-card-actions .dsh-sd-iconbtn { height: 26px; min-width: 26px; padding: 0 6px; font-size: 11px; }
      .dsh-sd-card-confirm {
        position: absolute; inset: 0; z-index: 4; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
        background: color-mix(in srgb, var(--sd-bg) 76%, transparent); backdrop-filter: blur(4px);
        font-size: 12px; color: var(--sd-text-1); text-align: center; padding: 12px;
      }
      .dsh-sd-card-confirm .btns { display: flex; gap: 8px; }

      .dsh-sd-badge {
        display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px;
        border-radius: 999px; font-size: 10.5px; line-height: 1; white-space: nowrap;
        border: 1px solid transparent; backdrop-filter: blur(4px);
      }
      .dsh-sd-badge[data-tone='info'] { color: color-mix(in srgb, var(--sd-accent) 82%, #fff); background: color-mix(in srgb, var(--sd-accent) 20%, rgba(0,0,0,0.4)); border-color: color-mix(in srgb, var(--sd-accent) 30%, transparent); }
      .dsh-sd-badge[data-tone='success'] { color: #eafff2; background: color-mix(in srgb, var(--sd-success) 62%, rgba(0,0,0,0.3)); border-color: color-mix(in srgb, var(--sd-success) 50%, transparent); }
      .dsh-sd-badge[data-tone='error'] { color: #ffe9e9; background: color-mix(in srgb, var(--sd-error) 62%, rgba(0,0,0,0.3)); border-color: color-mix(in srgb, var(--sd-error) 46%, transparent); }
      .dsh-sd-badge[data-tone='warn'] { color: #2a1a00; background: color-mix(in srgb, var(--sd-warn) 78%, rgba(255,255,255,0.2)); border-color: color-mix(in srgb, var(--sd-warn) 48%, transparent); }
      .dsh-sd-badge[data-tone='muted'] { color: var(--sd-text-2); background: rgba(0, 0, 0, 0.42); border-color: var(--sd-border-2); }
      .dsh-sd-badge[data-tone='plain'] { color: var(--sd-text-2); background: var(--sd-layer-2); border-color: var(--sd-border-1); }

      .dsh-sd-spinner { width: 15px; height: 15px; border-radius: 50%; border: 2px solid currentColor; border-top-color: transparent; animation: sd-spin 0.8s linear infinite; flex: none; }
      @keyframes sd-spin { to { transform: rotate(360deg); } }
      .dsh-sd-pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--sd-accent); animation: sd-pulse 1.2s ease-in-out infinite; }
      @keyframes sd-pulse { 0%, 100% { opacity: 0.35; transform: scale(0.85); } 50% { opacity: 1; transform: scale(1.08); } }

      .dsh-sd-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 46px 20px; text-align: center; color: var(--sd-text-3); }
      .dsh-sd-empty-art { width: 96px; height: 96px; border-radius: 28px; display: grid; place-items: center;
        background: radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--sd-accent) 26%, transparent), transparent 70%),
                    linear-gradient(140deg, var(--sd-layer-2), var(--sd-layer-3));
        border: 1px solid var(--sd-border-1); color: color-mix(in srgb, var(--sd-accent) 70%, var(--sd-text-2));
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
      }
      .dsh-sd-empty-title { font-size: 14px; font-weight: 600; color: var(--sd-text-2); }
      .dsh-sd-empty-desc { font-size: 12px; max-width: 360px; line-height: 1.7; }
      .dsh-sd-empty .dsh-sd-iconbtn { margin-top: 4px; }
      .dsh-sd-skeleton-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(238px, 1fr)); gap: 13px; }
      .dsh-sd-skeleton { border-radius: var(--sd-radius-lg); border: 1px solid var(--sd-border-1); overflow: hidden; background: var(--sd-layer-2); }
      .dsh-sd-skeleton .sk-media { aspect-ratio: 16 / 9; background: var(--dsw-alias-bg-skeleton, var(--sd-layer-3)); animation: sd-skeleton 1.4s ease-in-out infinite; }
      .dsh-sd-skeleton .sk-line { height: 10px; margin: 10px 11px; border-radius: 5px; background: var(--dsw-alias-bg-skeleton, var(--sd-layer-3)); animation: sd-skeleton 1.4s ease-in-out infinite; }
      .dsh-sd-skeleton .sk-line.short { width: 46%; margin-top: 0; margin-bottom: 14px; }
      @keyframes sd-skeleton { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.95; } }

      .dsh-sd-modal-backdrop {
        position: fixed; inset: 0; z-index: 60;
        background: rgba(4, 6, 10, 0.62); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        display: flex; align-items: center; justify-content: center; padding: 24px;
        animation: sd-fade 0.18s ease both;
      }
      @keyframes sd-fade { from { opacity: 0; } to { opacity: 1; } }
      .dsh-sd-modal {
        display: flex; flex-direction: column;
        width: min(880px, 100%); max-height: min(86vh, 860px);
        border-radius: var(--sd-radius-xl);
        border: 1px solid var(--sd-border-2);
        background: color-mix(in srgb, var(--sd-layer-1) 96%, var(--sd-bg));
        box-shadow: 0 32px 90px rgba(0, 0, 0, 0.55);
        overflow: hidden;
        animation: sd-pop 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
      }
      @keyframes sd-pop { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: none; } }
      .dsh-sd-modal[data-size='sm'] { width: min(560px, 100%); }
      .dsh-sd-modal[data-size='lg'] { width: min(980px, 100%); }
      .dsh-sd-modal-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--sd-border-1); }
      .dsh-sd-modal-title { font-size: 14px; font-weight: 650; }
      .dsh-sd-modal-sub { font-size: 11px; color: var(--sd-text-3); }
      .dsh-sd-modal-head .dsh-sd-iconbtn { margin-left: auto; }
      .dsh-sd-modal-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 16px; }
      .dsh-sd-modal-foot { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--sd-border-1); background: color-mix(in srgb, var(--sd-layer-2) 62%, transparent); }
      .dsh-sd-modal-foot .grow { flex: 1 1 auto; }

      .dsh-sd-player-grid { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 14px; }
      .dsh-sd-player-stage { min-width: 0; border-radius: var(--sd-radius-lg); overflow: hidden; background: #000; border: 1px solid var(--sd-border-1); }
      .dsh-sd-player-stage video { width: 100%; max-height: 54vh; display: block; background: #000; }
      .dsh-sd-player-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
      .dsh-sd-frame-preview { border-radius: var(--sd-radius-md); overflow: hidden; border: 1px solid var(--sd-border-1); background: var(--sd-layer-2); min-height: 84px; display: grid; place-items: center; color: var(--sd-text-3); font-size: 11px; }
      .dsh-sd-frame-preview img { width: 100%; display: block; }
      .dsh-sd-player-meta { font-size: 11.5px; color: var(--sd-text-3); line-height: 1.7; word-break: break-word; }
      .dsh-sd-player-meta b { color: var(--sd-text-2); font-weight: 550; }

      .dsh-sd-toast-stack { position: fixed; top: 64px; right: 20px; z-index: 90; align-items: flex-end; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
      .dsh-sd-toast {
        pointer-events: auto;
        display: flex; align-items: center; gap: 8px;
        max-width: min(520px, calc(100vw - 48px));
        padding: 9px 14px; border-radius: 999px;
        border: 1px solid var(--sd-border-2);
        background: color-mix(in srgb, var(--sd-layer-1) 96%, var(--sd-bg));
        color: var(--sd-text-1); font-size: 12.5px;
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.4);
        animation: sd-toast-in 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
      }
      @keyframes sd-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      .dsh-sd-toast[data-kind='error'] { border-color: color-mix(in srgb, var(--sd-error) 52%, transparent); }
      .dsh-sd-toast[data-kind='error'] .dsh-sd-toast-icon { color: var(--sd-error); }
      .dsh-sd-toast[data-kind='success'] .dsh-sd-toast-icon { color: var(--sd-success); }
      .dsh-sd-toast-icon { display: inline-flex; flex: none; }

      .dsh-sd-detail-row { display: grid; grid-template-columns: 92px minmax(0, 1fr); gap: 10px; align-items: start; padding: 8px 0; border-bottom: 1px dashed var(--sd-border-1); font-size: 12px; }
      .dsh-sd-detail-row:last-child { border-bottom: none; }
      .dsh-sd-detail-row .k { color: var(--sd-text-3); }
      .dsh-sd-detail-row .v { color: var(--sd-text-1); word-break: break-word; }
      .dsh-sd-pre { font-family: var(--sd-mono); font-size: 11px; color: var(--sd-text-2); background: var(--sd-layer-2); border-radius: var(--sd-radius-sm); padding: 8px 10px; overflow: auto; max-height: 160px; white-space: pre-wrap; word-break: break-all; }

      .dsh-sd-settings-grid { display: flex; flex-direction: column; gap: 12px; }
      .dsh-sd-settings-note { font-size: 11px; color: var(--sd-text-3); line-height: 1.7; }
      .dsh-sd-settings-note-title { font-size: 11.5px; font-weight: 650; color: var(--sd-text-2); margin-bottom: 2px; }
      .dsh-sd-settings-note-line { white-space: pre-line; }
      .dsh-sd-settings-inline { display: flex; justify-content: flex-end; gap: 8px; }
      .dsh-sd-relay-models-wrap { display: flex; flex-direction: column; gap: 6px; }
      .dsh-sd-relay-models-title { font-size: 11px; color: var(--sd-text-3); line-height: 1.6; }
      .dsh-sd-relay-selected { display: flex; flex-direction: column; gap: 4px; }
      .dsh-sd-relay-selected-title { font-size: 11px; color: var(--sd-text-3); }
      .dsh-sd-relay-selected-row { display: flex; align-items: center; gap: 8px; border: 1px solid var(--sd-border-1); background: var(--sd-layer-1); border-radius: 8px; padding: 4px 6px 4px 10px; }
      .dsh-sd-relay-selected-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--sd-text-1); }
      .dsh-sd-relay-selected-remove { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; border-radius: 6px; background: transparent; color: var(--sd-text-3); cursor: pointer; }
      .dsh-sd-relay-selected-remove:hover { background: var(--sd-hover); color: var(--sd-text-1); }
      .dsh-sd-relay-selected-empty { font-size: 11px; color: var(--sd-text-3); }
      .dsh-sd-relay-models-head { display: flex; align-items: center; gap: 8px; }
      .dsh-sd-relay-models-count { flex: none; font-size: 11px; color: var(--sd-text-3); }
      .dsh-sd-relay-filter { flex: 1 1 auto; min-width: 0; height: 26px; font-size: 11.5px; }
      .dsh-sd-relay-models { display: flex; flex-wrap: wrap; gap: 6px; max-height: 180px; overflow-y: auto; padding: 2px; }
      .dsh-sd-relay-models-empty { font-size: 11px; color: var(--sd-text-3); padding: 4px 2px; }
      .dsh-sd-relay-model {
        border: 1px solid var(--sd-border-1); background: var(--sd-layer-1); color: var(--sd-text-2);
        border-radius: 999px; padding: 4px 10px; font-size: 11.5px; line-height: 1.4; cursor: pointer;
        max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .dsh-sd-relay-model:hover { background: var(--sd-hover); color: var(--sd-text-1); }
      .dsh-sd-relay-model[data-active='true'] {
        border-color: color-mix(in srgb, var(--sd-accent) 60%, transparent);
        color: var(--sd-accent); background: color-mix(in srgb, var(--sd-accent) 14%, transparent);
      }
      .dsh-sd-settings-note code { font-family: var(--sd-mono); }

      .dsh-sd-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

      @media (max-width: 1080px) {
        .dsh-sd-layout { grid-template-columns: minmax(320px, 400px) minmax(0, 1fr); gap: 14px; padding: 14px; }
      }
      @media (max-width: 880px) {
        .dsh-sd-layout { grid-template-columns: minmax(0, 1fr); overflow-y: auto; display: block; }
        .dsh-sd-creator { margin-bottom: 14px; }
        .dsh-sd-creator-body { max-height: none; }
        .dsh-sd-gallery { min-height: 420px; }
        .dsh-sd-header { padding: 12px 14px; }
        .dsh-sd-header-tools .label { display: none; }
        .dsh-sd-player-grid { grid-template-columns: minmax(0, 1fr); }
      }
      @media (max-width: 560px) {
        .dsh-sd-params { grid-template-columns: 1fr; }
        .dsh-sd-params .span2 { grid-column: span 1; }
        .dsh-sd-cards { grid-template-columns: minmax(0, 1fr); }
        .dsh-sd-brand-sub { display: none; }
      }
      /* ── 右侧边栏变体（每个会话一个窗口）：窄栏内单列排布，创作在上、历史在下 ── */
      .dsh-sd-sidebar-host { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
      .dsh-sd-sidebar-host > .dsh-sd-root { flex: 1 1 auto; min-height: 0; }

      /* 侧栏窗口：root 自身是唯一滚动容器（header sticky 常驻），避免任何嵌套滚动吞掉滚轮 */
      .dsh-sd-root[data-variant='sidebar'] {
        overflow-y: auto; overflow-x: hidden;
        overscroll-behavior: contain;
        scrollbar-width: thin;
        scrollbar-color: var(--dsw-alias-scrollbar-bg-l2, rgba(255,255,255,0.16)) transparent;
      }
      .dsh-sd-root[data-variant='sidebar']::-webkit-scrollbar { width: 9px; height: 9px; }
      .dsh-sd-root[data-variant='sidebar']::-webkit-scrollbar-thumb {
        background: var(--dsw-alias-scrollbar-bg-l2, rgba(255,255,255,0.16));
        border-radius: 999px; border: 2px solid transparent; background-clip: padding-box;
      }
      .dsh-sd-root[data-variant='sidebar']::-webkit-scrollbar-thumb:hover { background: var(--dsw-alias-scrollbar-hover-l2, rgba(255,255,255,0.28)); background-clip: padding-box; }
      .dsh-sd-root[data-variant='sidebar']::-webkit-scrollbar-track { background: transparent; }

      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-header {
        position: sticky; top: 0;
        padding: 10px 14px 9px; gap: 8px; flex-wrap: wrap;
        background: color-mix(in srgb, var(--sd-bg) 92%, transparent);
      }
      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-brand-sub { display: none; }
      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-session-label { display: none; }
      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-session-select { max-width: 190px; }
      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-status-pill { max-width: 46%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-layout {
        flex: none;
        display: flex; flex-direction: column;
        gap: 12px; padding: 12px 14px 14px;
        overflow: visible;
      }
      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-creator { flex: none; }
      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-creator-body { max-height: none; }
      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-creator-expand { flex-direction: row; width: auto; padding: 6px 12px; gap: 6px; align-self: stretch; }
      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-creator-expand span { writing-mode: horizontal-tb; letter-spacing: 0; }
      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-gallery { flex: none; min-height: 0; max-height: none; }
      .dsh-sd-root[data-variant='sidebar'] .dsh-sd-gallery-body { overflow: visible; max-height: none; }

      @media (prefers-reduced-motion: reduce) {
        .dsh-sd-root *, .dsh-sd-root *::before, .dsh-sd-root *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
      }
    `;


    // ==========================================================================
    // 文案字典（全站界面文案；zh 与 en 的 key 集必须一致）
    //
    // 使用：translate(key, params) —— 优先走宿主 locale（ctx.locale.bind(NS)），
    // 宿主不可用时用内置 zh 字典兜底；语言切换由宿主 locale 实时生效。
    // ==========================================================================
    const DICT_ZH = {
      // ---- 面板 / 品牌 ----
      panel: '视频创作',
      title: 'Seedance 创作台',
      subtitle: '文生视频 · 图生视频 · 参考生成',
      'brand.subtitle': 'Seedance Studio · 文生视频 / 图生视频 / 首尾帧 / 参考生视频 / 编辑延长 / 样片',

      // ---- 右侧边栏（每个会话可打开的创作窗口）----
      'sidebar.title': '视频创作',
      'sidebar.guideTitle': '视频创作',
      'sidebar.guideDesc': '生成视频、再创作与查看历史作品',

      // ---- 通用 ----
      'common.loading': '加载中',
      'common.processing': '处理中',
      'common.saving': '保存中…',
      'common.creating': '创建中…',
      'common.capturing': '抽帧中',
      'common.smart': '智能',
      'common.smartDuration': '智能时长',
      'common.seconds': ' 秒',
      'common.unknown': '未知',
      'common.none': '（无）',
      'common.optional': '可选',
      'common.byMode': '按模式提供',
      'common.generate': '生成',
      'common.defaultModel': '默认模型',
      'common.firstFrame': '首帧',
      'common.currentFrame': '当前帧',
      'common.lastFrame': '尾帧',

      // ---- 状态 ----
      'status.queued': '排队中',
      'status.running': '生成中',
      'status.succeeded': '已完成',
      'status.failed': '生成失败',
      'status.cancelled': '已取消',
      'status.expired': '已超时',
      'status.demo': '演示模式',
      'status.connectedPrefix': '已连接宿主：',
      'status.connectedWith': '已连接 · ',

      // ---- 动作 ----
      'action.play': '播放',
      'action.playVideo': '播放视频',
      'action.recreate': '再创作',
      'action.draftFinal': '转正片',
      'action.retry': '重试',
      'action.retryHint': '重试（继承原参数）',
      'action.download': '下载',
    'action.chatOpen': '在对话中打开',
    'action.chatSend': '发送到对话',
    'chat.continueMessage': '请继续分析并优化这条视频任务。\n任务：{id}（{status}；{mode}；{model}）\n提示词：{prompt}\n远端视频：{video}\n请先调用 seedance_video 的 status（taskId: {id}）核对任务、参数与本地文件路径；可读取尾帧图（lastFramePath）分析画面；需要修改时用 seedance_video 的 recreate（sourceId: {id}）基于该视频生成新版本，并先说明你的分析结论与优化方案。',
      'action.downloadVideo': '下载视频',
      'action.cancel': '取消',
      'action.cancelTask': '取消任务',
      'action.delete': '删除',
      'action.close': '关闭',
      'action.refresh': '刷新历史',
      'action.reload': '重新加载配置与历史',
      'action.settings': '设置',
      'action.newUi': '新版界面',
      'action.newUiHint': '用共享 SPA 面板打开（实验）',
      'action.backClassic': '回到经典界面',
      'action.save': '保存',
      'action.saveSettings': '保存设置',
      'action.captureFirst': '截取首帧',
      'action.captureCurrent': '截取当前帧',
      'action.captureLast': '截取尾帧',
      'action.copyLink': '复制视频链接',
      'action.copyLinkShort': '复制链接',
      'action.createRecreate': '创建再创作任务',
      'action.createRecreateShort': '创建再创作',

      // ---- 徽标 ----
      'badge.draft': '样片',
      'badge.demo': '演示',
      'badge.draftFinalDone': '已转正片',

      // ---- 会话 ----
      'session.label': '会话',
      'session.selectTitle': '选择绑定的会话（历史记录按会话隔离）',
      'session.selectAria': '选择会话',
      'session.auto': '自动 · {title}',
      'session.autoDefault': '自动 · 默认会话（default）',

      // ---- 服务提供方 ----
      'provider.ark': '方舟 Ark',
      'provider.relay': '中转 Relay',
      'provider.demo': '演示',
      'provider.auto': '自动',

      // ---- 演示模式 ----
      'demo.reasonDefault': '未配置 API Key，将使用内置示例视频模拟生成',
      'demo.reasonHostOffline': '宿主未连接（/api/seedance 404）',

      // ---- 生成表单 ----
      'creator.formAria': '视频创作表单',
      'creator.hostOffline': '宿主未连接',
      'creator.hostOfflineHint': ' · 未检测到 Seedance 宿主插件，页面以降级模式渲染。',
      'creator.reloadHint': '请确认插件已安装并启用，然后',
      'creator.retry': '重试',
      'creator.configure': '去配置',
      'creator.modesTitle': '创作模式',
    'creator.panelTitle': '创作面板',
    'creator.collapsePanel': '收起创作面板',
    'creator.expandPanel': '展开创作面板',
    'creator.expandPanelShort': '展开创作',
      'creator.modeUnsupported': '当前模型不支持「{mode}」',
      'creator.generate': '生成视频',
      'creator.creating': '创建任务中',
      'creator.creatingDots': '创建任务中…',
      'creator.kbdHint': ' 快速生成',
      'creator.sessionHintNone': '未检测到当前会话 · 记录将保存到 default',
      'creator.sessionHintNoChat': '开始一个对话后即可生成',
      'creator.sessionHintSave': '按会话保存历史 · 自动轮询任务状态',

      // ---- 模式 ----
      'mode.text2video': '文生视频',
      'mode.image2video': '图生视频',
      'mode.firstlast': '首尾帧',
      'mode.reference': '全模态参考',
      'mode.edit': '视频编辑·延长',
      'mode.extend': '视频延长',
      'mode.draft': '样片',
      'mode.draftFinal': '样片转正片',

      // ---- 提示词输入 ----
      'inputs.label': '提示词',
      'inputs.hint': '镜头语言 + 光影 + 主体 + 动作 + 场景 + 风格',
      'inputs.placeholder': '描述你想生成的画面…（Ctrl + Enter 生成）',
      'inputs.aria': '提示词',
      'inputs.tooLong': '提示词较长（{count} 字），建议精炼到 500 字以内效果更佳',
      'inputs.imageReadError': '图片读取失败',
      'inputs.audioReadError': '音频读取失败',
      'inputs.remove': '移除',
      'inputs.uploadAudio': '上传音频',
      'inputs.removeAudio': '移除音频',

      // ---- 参考素材 ----
      'material.tip': '图片上传后转为 dataURL（≤30MB/张）；视频只支持公网 URL；素材含真人脸可能被上游拒绝。',
      'material.addFirst': '添加首帧',
      'material.addFirstImage': '添加首帧图片',
      'material.firstRole': '首帧',
      'material.addLast': '添加尾帧',
      'material.lastRole': '尾帧',
      'material.video': '视频',
      'material.videoPlaceholder': '粘贴 mp4/mov 公网链接（如 https://…/clip.mp4）',
      'material.videoAria': '参考视频 URL',
      'material.fromHistory': '从历史视频选择 →',
      'material.draftTip': '样片模式：先以 480p 快速预览效果，满意后可一键转正片',
      'material.textTip': '文生视频无需参考素材，直接描述画面即可',
      'material.refImage': '参考图 {index}',
      'material.addRef': '添加参考图',
      'material.audioNote20': '2.0 系列：参考音频必须搭配图片或视频使用',
      'material.edit': '编辑视频',
      'material.extend': '延长视频',
      'material.editOrExtend': '编辑或延长',
      'material.extendTip': '延长：提示词写清要延长/续写的内容与目标时长（2.5 输出时长由模型决定）',
      'material.editTip': '编辑：用提示词描述要修改的内容（2.5 编辑任务比例锁自适应、时长锁智能）',
      'material.sectionTitle': '参考素材',
      'material.sectionHint': '参考素材说明',

      // ---- 参数面板 ----
      'params.title': '参数',
      'params.deprecated': '（即将下线）',
      'params.customModelOption': '自定义模型 / 接入点…',
      'params.model': '模型',
      'params.modelAria': '模型',
      'params.customModelPlaceholder': '模型 ID 或推理接入点 ID（ep- 开头）',
      'params.customModelAria': '自定义模型 ID',
      'params.resolution': '分辨率',
      'params.ratio': '比例',
      'params.ratioLockedTip': '该模式下比例固定为自适应',
      'params.ratioLocked': '自适应（锁定）',
      'params.ratioAria': '画面比例',
      'params.duration': '时长',
      'params.durationAria': '视频时长（秒）',
      'params.durationSecondsAria': '视频时长秒数',
      'params.autoDurationTip': '由模型自动决定时长',
      'params.smartHint': '智能时长：由模型自动决定（{min}–{max} 秒）',
      'params.audio': '生成音频',
      'params.audioOn': '有声视频',
      'params.audioOff': '模型不支持',
      'params.watermark': 'AI 水印',
      'params.watermarkHint': '默认关闭',
      'params.lastFrame': '返回尾帧',
      'params.lastFrameHint': '再创作素材',
      'params.advanced': '高级设置',
      'params.seed': '随机种子（留空随机）',
      'params.seedPlaceholder': '随机',
      'params.seedAria': '随机种子',
      'params.randomSeed': '随机生成种子',
      'params.camera': '镜头',
      'params.fixedCamera': '固定镜头',
      'params.resolution4k': '4k 生成限流极低（RPM 15 / 并发 1），可能排队较久',
      'params.demoNoCost': '演示模式 · 不产生费用',
      'params.estimatePrefix': '参考预估 ',
      'params.estimateSuffix': ' · 按 16:9 / 5s 基准，实际以账单为准',
      'params.estimateUnavailable': '预计费用暂不可估算（以账单为准）',
      'params.adaptiveRatio': '自适应比例',

      // ---- 历史与队列 ----
      'history.emptyTitle': '还没有生成记录',
      'history.emptyDesc': '在左侧填写提示词，点击「生成视频」开始创作',
      'history.fillSample': '填入示例提示词',
      'history.recordAria': '视频记录 {prompt}',
      'history.clickPlay': '点击播放或下载',
      'history.noPrompt': '（无提示词）',
      'history.origin': '改自 {id}',
      'history.confirmDelete': '确认删除',
      'history.confirmCancel': '确认取消',
      'history.deleteQuestion': '删除这条记录？',
      'history.cancelQuestion': '取消生成任务？',
      'history.deleteDesc': '媒体文件将一并删除且不可恢复。',
      'history.cancelDesc': '仅排队中的任务可以取消。',
      'history.cancelAction': '取消操作',
      'history.back': '返回',
      'history.confirm': '确认',
      'history.title': '历史与队列',
      'history.count': '{total} 个',
      'history.activeSuffix': ' · {active} 生成中',
      'history.filterAll': '全部 {count}',
      'history.filterActive': '进行中 {count}',
      'history.filterDone': '已完成 {count}',
      'history.filterFailed': '失败 {count}',
      'history.filterAria': '历史筛选',
      'history.loadError': '历史加载失败',
      'history.queueTitle': '进行中的任务 · {count}',
      'history.emptyFilteredTitle': '该筛选下没有记录',
      'history.emptyFilteredDesc': '切换到「全部」查看其他记录',
      'history.demoHint': '当前为演示模式，将使用内置示例视频',
      'history.footer': '任务记录按当前会话保存于本机 · 视频 URL 约 24 小时有效，播放下载走本地副本',

      // ---- 播放器 ----
      'player.title': '播放 · {title}',
      'player.urlTtl': '视频地址约 24 小时有效，推荐下载保存',
      'player.notPlayable': '视频暂不可播放（可能未下载或链接过期）',
      'player.progressAria': '视频进度',
      'player.framePreview': '截取帧预览',
      'player.pickFrame': '截取一帧作为再创作素材',
      'player.useFrame': '用此帧再创作',
      'player.promptLabel': '提示词：',
      'player.paramsLabel': '参数：',
      'player.taskLabel': '任务：',
      'player.errorLabel': '错误：',
      'player.captureSuccess': '已截取{frame}',

      // ---- 再创作 ----
      'recreate.wayAuto': '智能沿用（推荐）',
      'recreate.wayAutoDesc': '服务端自动选择远端视频/尾帧/重新生成',
      'recreate.wayFirst': '抽帧 · 首帧',
      'recreate.wayFirstDesc': '把截取的一帧作为首帧',
      'recreate.wayRef': '抽帧 · 参考图',
      'recreate.wayRefDesc': '把截取的一帧作为参考图',
      'recreate.wayVideo': '参考视频',
      'recreate.remoteFresh': '沿用来源远端视频 URL',
      'recreate.remoteStale': '来源无可用远端 URL（或已超 24h）',
      'recreate.needFrame': '请先截取一帧作为素材',
      'recreate.title': '再创作 · {title}',
      'recreate.subtitle': '来源 {id} · {model} · {time}',
      'recreate.autoNote': '将调用 /api/seedance/recreate（服务端自动选择远端视频或尾帧）',
      'recreate.generateNote': '将以来源视频素材调用 /api/seedance/generate（sourceId 标记来源）',
      'recreate.pickFrame': '在视频上选择一帧，作为「首帧」或「参考图」素材',
      'recreate.sectionRef': '参考方式',
      'recreate.sectionPrompt': '提示词',
      'recreate.promptAria': '再创作提示词',
      'recreate.sectionParams': '参数',
      'recreate.modelAria': '再创作模型',
      'recreate.resolutionAria': '再创作分辨率',
      'recreate.ratioAria': '再创作比例',
      'recreate.durationAria': '再创作时长',
      'recreate.unavailable': '不可用：{desc}',

      // ---- 设置 ----
      'settings.title': 'Seedance 设置',
      'settings.subtitle': 'API Key 只保存在本机，不会下发到页面',
      'settings.effectHint': '保存后立即生效',
      'settings.loading': '读取设置',
      'settings.demoHint': '不调用真实接口',
      'settings.provider': '服务提供方',
      'settings.providerAria': '服务提供方',
      'settings.providerAuto': '自动（有 Key 用 Ark，否则演示）',
      'settings.providerArk': '火山方舟 Ark 官方',
      'settings.providerRelay': '中转服务 Relay',
      'settings.providerDemo': '强制演示模式',
      'settings.arkKey': '方舟 API Key',
      'settings.savedPrefix': '已保存：{key}（留空不修改）',
      'settings.arkBase': '方舟 Base URL（可选）',
      'settings.defaultModel': '默认模型',
      'settings.followHost': '跟随宿主默认',
    'settings.builtinModels': '内置模型',
    'settings.relayModelGroup': '中转站模型',
    'settings.customModelOption': '自定义模型 ID…',
    'settings.customModel': '自定义模型 ID',
    'settings.customModelPlaceholder': '输入模型 / 接入点 ID',
    'settings.relayFetch': '获取模型列表',
    'settings.relayFetching': '连接中…',
    'settings.relayFetchHint': '同时检测中转站连通性',
    'settings.relayPickTitle': '勾选要显示的模型（主面板「模型」下拉只显示已选）',
    'settings.relayFilterPlaceholder': '过滤模型（如 seedance）',
    'settings.relayModelsCount': '共 {count} 个模型，点击勾选',
    'settings.relayModelsEmpty': '没有匹配的模型',
    'settings.relaySelectedTitle': '已选模型（{count}）',
    'settings.relaySelectedEmpty': '还没有勾选：点击上方模型即可加入',
    'settings.relayRemove': '移除',
    'settings.relayHostStale': '宿主接口未加载：请完全退出并重启桌面应用后再试',
    'settings.relayProbeOk': '连接正常 · {ms} ms · 共 {count} 个模型',
    'settings.relayProbeFail': '连接失败：{message}',
      'settings.relayAdvanced': '中转服务（进阶）',
      'settings.relayBase': '中转 Base URL',
      'settings.relayKey': '中转 API Key',
      'settings.relayProtocol': '中转协议',
      'settings.relayArk': 'Ark 兼容协议',
      'settings.relayOpenai': 'OpenAI 兼容协议',
      'settings.priorityHint': '配置优先级：settings.json > 环境变量 > 插件 config；API Key 读回始终打码。',
      'settings.demoSaved': '当前宿主运行在演示模式（未检测到可用 API Key）',

      // ---- 历史视频选择 ----
      'videoPick.title': '从历史视频选择',
      'videoPick.subtitle': '选择一条已完成的记录，把它的远端视频 URL 填入参考视频',
      'videoPick.useAria': '使用这个视频',
      'videoPick.remoteTitle': '使用远端视频 URL',
      'videoPick.noRemote': '该记录没有可用的远端 URL（约 24 小时后过期）',
      'videoPick.use': '使用',
      'videoPick.expired': 'URL 过期',
      'videoPick.emptyTitle': '还没有可用的历史视频',
      'videoPick.emptyDesc': '先生成一条视频，或直接粘贴公网视频链接',

      // ---- 对话框 ----
      'overlays.dialog': '对话框',

      // ---- 提示消息 ----
      'toast.hostOfflineCreate': '宿主未连接，无法创建任务',
      'toast.createdDemo': '任务已创建（演示模式）',
      'toast.created': '任务已创建',
    'toast.chatSent': '已发送到对话，智能体会继续分析与优化',
    'toast.chatFailed': '发送到对话失败，请稍后重试',
    'toast.chatUnavailable': '无法打开对话（宿主会话导航不可用）',
      'toast.downloading': '开始下载视频…',
      'toast.downloadStarted': '已开始下载',
      'toast.downloadFailed': '下载失败，可在播放器中右键另存',
      'toast.hostOffline': '宿主未连接',
      'toast.deleted': '记录已删除',
      'toast.cancelRequested': '已请求取消任务',
      'toast.selectSession': '请先选择会话',
      'toast.recreateCreated': '再创作任务已创建',
      'toast.draftFinalMissing': '该样片缺少远端任务 ID，无法转正片',
      'toast.draftFinalCreated': '转正片任务已创建（1080p）',
      'toast.noRemoteVideo': '该记录没有可用的远端视频 URL（约 24 小时过期）',
      'toast.refVideoFilled': '已填入参考视频 URL',
      'toast.captureFailed': '抽帧失败',
      'toast.settingsSaved': '设置已保存',
      'toast.copySuccess': '视频链接已复制',
      'toast.copyFailed': '复制失败',

      // ---- 错误（宿主错误映射） ----
      'errors.apiKeyInvalid': 'API Key 无效或未配置，请在设置中检查',
      'errors.modelNotOpen': '该模型尚未开通，请到方舟控制台开通管理页开通',
      'errors.modelNotFound': '模型 ID 不存在，请检查模型名或接入点',
      'errors.paramConstraint': '参数与任务类型不兼容（如首尾帧/编辑任务需自适应比例、编辑需智能时长）',
      'errors.sensitive': '输入内容未通过审核，请修改提示词或素材',
      'errors.privacy': '不支持直接上传含真人脸的素材，请使用授权素材或平台产物',
      'errors.policy': '素材可能涉及版权限制，请更换素材',
      'errors.rateLimit': '请求过于频繁或并发已满，请稍后重试（新任务会自动排队）',
      'errors.overdue': '账户欠费或额度不足，请充值/调整额度后重试',
      'errors.internal': '服务暂时不可用，请稍后重试',
      'errors.requestFailed': '请求失败，请稍后重试',
      'errors.requestFailedCode': '请求失败：{code}',

      // ---- 文件处理 ----
      'file.readFailed': '读取文件失败',
      'file.compressUnavailable': '当前环境无法压缩图片',
      'file.parseFailed': '图片解析失败',
      'file.noFile': '未选择文件',
      'file.imageTooLarge': '图片超过 30MB 限制：{name}',
      'file.audioTooLarge': '音频超过 30MB 限制：{name}',
      'file.playerNotReady': '播放器未就绪',
      'file.videoNotLoaded': '视频尚未加载完成，请稍后再试',
      'file.captureFailed': '抽帧失败',
      'file.tainted': '视频跨域，无法在浏览器内抽帧；可改用「服务端智能再创作」或远端参考视频',

      // ---- 表单校验 ----
      'form.needSession': '开始一个对话后即可生成（或在页头选择会话）',
      'form.promptRequired': '请输入提示词',
      'form.promptTooLong': '提示词过长（最多 {max} 字）',
      'form.chooseModel': '请选择模型',
      'form.modeUnsupported': '当前模型不支持「{mode}」模式',
      'form.image2videoNeedsFirst': '图生视频需要上传一张首帧图片',
      'form.firstlastNeedsFirst': '首尾帧模式至少需要一张首帧图片',
      'form.referenceNeedsMaterial': '请至少添加一张参考图、一段参考视频或音频',
      'form.tooManyRefs': '参考图超过上限（{max} 张）',
      'form.noVideoRef': '当前模型不支持参考视频',
      'form.noAudioRef': '当前模型不支持音频参考',
      'form.audio20NeedsMedia': '2.0 系列参考音频需搭配图片或视频',
      'form.editNeedsVideo': '视频编辑/延长需要参考视频（公网 URL 或历史视频）',
      'form.videoUrlScheme': '参考视频必须是 http(s) 链接或 asset 素材 ID（API 不支持视频 base64）',
      'form.videoUrlTooLong': '参考视频链接过长',
      'form.noDraft': '样片模式仅 Seedance 2.5 支持',

      // ---- 时间 ----
      'time.justNow': '刚刚',
      'time.minutesAgo': '{count} 分钟前',
      'time.hoursAgo': '{count} 小时前',
      'time.daysAgo': '{count} 天前',
      'time.monthDay': '{month} 月 {day} 日',

      // ---- 宿主 HTTP ----
      'http.fetchUnavailable': 'fetch 不可用',
      'http.hostConnect': '无法连接宿主服务：{message}',
      'http.emptyResponse': '宿主返回了空响应',
      'http.notInstalled': '宿主接口尚未安装（404）',
      'http.requestFailed': '请求失败（HTTP {status}）',

      // ---- 参数面板补充（比例 / 时长选项） ----
      'ratio.adaptive': '自适应',
      'ratio.horizontal': '16:9 横屏',
      'ratio.vertical': '9:16 竖屏',
      'ratio.square': '1:1 方形',
      'ratio.widescreen': '21:9 宽银幕',

      // ---- 示例提示词 ----
      'template.cinematic.label': '电影感航拍',
      'template.cinematic.text': '电影感航拍镜头，清晨薄雾中的山谷，镜头平稳向前推进，远处阳光穿过云层，氛围宁静治愈，高细节，4K',
      'template.product.label': '产品广告',
      'template.product.text': '高端香水产品广告，黑色大理石台面上缓慢旋转的香水瓶，柔和的轮廓光，水珠折射细节，浅景深，慢动作',
      'template.portrait.label': '人物特写',
      'template.portrait.text': '人物特写，年轻亚洲女性在咖啡店窗边微笑，自然光从侧面打来，温暖的色调，浅景深，镜头缓慢推近',
      'template.ink.label': '国风动画',
      'template.ink.text': '国风水墨动画，群山在云雾中若隐若现，一只白鹤飞过瀑布，镜头缓慢横移，水墨笔触，意境悠远',

      // ---- 模型说明 ----
      'modelNotes.2-5': '最新旗舰：4~30 秒、最高 1080p、全模态参考、样片 draft、mp4/mov；默认智能时长。',
      'modelNotes.2-0': '支持 4k、全模态参考、有声视频；4~15 秒。',
      'modelNotes.2-0-fast': '2.0 高性价比快速版：480p/720p、全模态参考、有声视频；4~15 秒。',
      'modelNotes.2-0-mini': '2.0 系列轻量版：480p/720p、全模态参考、有声视频；4~15 秒。',
      'modelNotes.1-0-pro': '1.0 专业版：720p/1080p、文生视频/图生视频/首尾帧；5/10 秒。',
      'modelNotes.1-0-pro-fast': '1.0 快速版：720p、文生视频/图生视频；5/10 秒。',
    };

    const DICT_EN = {
      // ---- panel / brand ----
      panel: 'Video Studio',
      title: 'Seedance Studio',
      subtitle: 'Text to video · Image to video · References',
      'brand.subtitle': 'Seedance Studio · Text to video / Image to video / First-last frame / Multimodal reference / Edit-extend / Draft',

      // ---- Right sidebar (a per-session studio window) ----
      'sidebar.title': 'Video Studio',
      'sidebar.guideTitle': 'Video Studio',
      'sidebar.guideDesc': 'Generate videos, remix, and browse history',

      // ---- common ----
      'common.loading': 'Loading',
      'common.processing': 'Processing',
      'common.saving': 'Saving…',
      'common.creating': 'Creating…',
      'common.capturing': 'Capturing',
      'common.smart': 'Smart',
      'common.smartDuration': 'Smart duration',
      'common.seconds': 's',
      'common.unknown': 'Unknown',
      'common.none': '(none)',
      'common.optional': 'Optional',
      'common.byMode': 'By mode',
      'common.generate': 'Generate',
      'common.defaultModel': 'Default model',
      'common.firstFrame': 'First frame',
      'common.currentFrame': 'Current frame',
      'common.lastFrame': 'Last frame',

      // ---- status ----
      'status.queued': 'Queued',
      'status.running': 'Running',
      'status.succeeded': 'Succeeded',
      'status.failed': 'Failed',
      'status.cancelled': 'Cancelled',
      'status.expired': 'Expired',
      'status.demo': 'Demo mode',
      'status.connectedPrefix': 'Connected to host: ',
      'status.connectedWith': 'Connected · ',

      // ---- actions ----
      'action.play': 'Play',
      'action.playVideo': 'Play video',
      'action.recreate': 'Recreate',
      'action.draftFinal': 'Finalize',
      'action.retry': 'Retry',
      'action.retryHint': 'Retry (inherit parameters)',
      'action.download': 'Download',
    'action.chatOpen': 'Open chat',
    'action.chatSend': 'Send to chat',
    'chat.continueMessage': 'Continue analyzing and improving this video task.\nTask: {id} ({status}; {mode}; {model})\nPrompt: {prompt}\nRemote video: {video}\nFirst call seedance_video with action=status (taskId: {id}) to verify the task, parameters, and local file paths; you may read the last-frame image (lastFramePath) to analyze the visuals. To modify it, call seedance_video recreate (sourceId: {id}) to generate a new version, and explain your analysis and optimization plan first.',
      'action.downloadVideo': 'Download video',
      'action.cancel': 'Cancel',
      'action.cancelTask': 'Cancel task',
      'action.delete': 'Delete',
      'action.close': 'Close',
      'action.refresh': 'Refresh history',
      'action.reload': 'Reload config and history',
      'action.settings': 'Settings',
      'action.newUi': 'New UI',
      'action.newUiHint': 'Open the shared SPA panel (experimental)',
      'action.backClassic': 'Back to classic',
      'action.save': 'Save',
      'action.saveSettings': 'Save settings',
      'action.captureFirst': 'Capture first frame',
      'action.captureCurrent': 'Capture current frame',
      'action.captureLast': 'Capture last frame',
      'action.copyLink': 'Copy video link',
      'action.copyLinkShort': 'Copy link',
      'action.createRecreate': 'Create recreation task',
      'action.createRecreateShort': 'Create recreation',

      // ---- badges ----
      'badge.draft': 'Draft',
      'badge.demo': 'Demo',
      'badge.draftFinalDone': 'Finalized',

      // ---- session ----
      'session.label': 'Session',
      'session.selectTitle': 'Choose the bound session (history is isolated per session)',
      'session.selectAria': 'Choose session',
      'session.auto': 'Auto · {title}',
      'session.autoDefault': 'Auto · default session (default)',

      // ---- provider ----
      'provider.ark': 'Ark',
      'provider.relay': 'Relay',
      'provider.demo': 'Demo',
      'provider.auto': 'Auto',

      // ---- demo ----
      'demo.reasonDefault': 'No API key configured; using the built-in sample video to simulate generation',
      'demo.reasonHostOffline': 'Host not connected (/api/seedance 404)',

      // ---- creator ----
      'creator.formAria': 'Video creation form',
      'creator.hostOffline': 'Host not connected',
      'creator.hostOfflineHint': ' · Seedance host plugin not detected; rendering in degraded mode.',
      'creator.reloadHint': 'Make sure the plugin is installed and enabled, then',
      'creator.retry': 'retry',
      'creator.configure': 'Configure',
      'creator.modesTitle': 'Creation mode',
    'creator.panelTitle': 'Creator',
    'creator.collapsePanel': 'Collapse creator panel',
    'creator.expandPanel': 'Expand creator panel',
    'creator.expandPanelShort': 'Expand',
      'creator.modeUnsupported': 'The current model does not support "{mode}"',
      'creator.generate': 'Generate video',
      'creator.creating': 'Creating task',
      'creator.creatingDots': 'Creating task…',
      'creator.kbdHint': ' to generate',
      'creator.sessionHintNone': 'No active session · records will be saved to default',
      'creator.sessionHintNoChat': 'Start a conversation to generate',
      'creator.sessionHintSave': 'History is saved per session · task status polls automatically',

      // ---- modes ----
      'mode.text2video': 'Text to video',
      'mode.image2video': 'Image to video',
      'mode.firstlast': 'First/last frame',
      'mode.reference': 'Multimodal reference',
      'mode.edit': 'Video edit · extend',
      'mode.extend': 'Video extend',
      'mode.draft': 'Draft',
      'mode.draftFinal': 'Draft to final',

      // ---- prompt inputs ----
      'inputs.label': 'Prompt',
      'inputs.hint': 'Camera · lighting · subject · action · scene · style',
      'inputs.placeholder': 'Describe the video you want…（Ctrl + Enter to generate）',
      'inputs.aria': 'Prompt',
      'inputs.tooLong': 'Prompt is long ({count} chars); consider trimming below 500 chars for better results',
      'inputs.imageReadError': 'Failed to read image',
      'inputs.audioReadError': 'Failed to read audio',
      'inputs.remove': 'Remove',
      'inputs.uploadAudio': 'Upload audio',
      'inputs.removeAudio': 'Remove audio',

      // ---- material ----
      'material.tip': 'Images are converted to data URLs after upload (≤30MB each); videos must be public URLs; content with real human faces may be rejected upstream.',
      'material.addFirst': 'Add first frame',
      'material.addFirstImage': 'Add first frame image',
      'material.firstRole': 'First frame',
      'material.addLast': 'Add last frame',
      'material.lastRole': 'Last frame',
      'material.video': 'Video',
      'material.videoPlaceholder': 'Paste a public mp4/mov link (e.g. https://…/clip.mp4)',
      'material.videoAria': 'Reference video URL',
      'material.fromHistory': 'Pick from history →',
      'material.draftTip': 'Draft mode: preview at 480p first, then finalize to 1080p in one click',
      'material.textTip': 'Text to video needs no references; just describe the scene',
      'material.refImage': 'Reference image {index}',
      'material.addRef': 'Add reference image',
      'material.audioNote20': '2.0 series: reference audio must be combined with images or video',
      'material.edit': 'Edit video',
      'material.extend': 'Extend video',
      'material.editOrExtend': 'Edit or extend',
      'material.extendTip': 'Extend: state what to extend/continue and the target duration in the prompt (2.5 output length is model-decided)',
      'material.editTip': 'Edit: describe the changes in the prompt (2.5 edit tasks lock ratio to adaptive and duration to smart)',
      'material.sectionTitle': 'References',
      'material.sectionHint': 'Reference summary',

      // ---- params ----
      'params.title': 'Parameters',
      'params.deprecated': ' (deprecated)',
      'params.customModelOption': 'Custom model / endpoint…',
      'params.model': 'Model',
      'params.modelAria': 'Model',
      'params.customModelPlaceholder': 'Model ID or inference endpoint ID (starting with ep-)',
      'params.customModelAria': 'Custom model ID',
      'params.resolution': 'Resolution',
      'params.ratio': 'Ratio',
      'params.ratioLockedTip': 'Ratio is locked to adaptive in this mode',
      'params.ratioLocked': 'Adaptive (locked)',
      'params.ratioAria': 'Aspect ratio',
      'params.duration': 'Duration',
      'params.durationAria': 'Video duration (seconds)',
      'params.durationSecondsAria': 'Video duration in seconds',
      'params.autoDurationTip': 'Duration is decided by the model',
      'params.smartHint': 'Smart duration: model-decided ({min}–{max} seconds)',
      'params.audio': 'Generate audio',
      'params.audioOn': 'Audio enabled',
      'params.audioOff': 'Not supported',
      'params.watermark': 'AI watermark',
      'params.watermarkHint': 'Off by default',
      'params.lastFrame': 'Return last frame',
      'params.lastFrameHint': 'Recreation material',
      'params.advanced': 'Advanced settings',
      'params.seed': 'Random seed (empty = random)',
      'params.seedPlaceholder': 'Random',
      'params.seedAria': 'Random seed',
      'params.randomSeed': 'Randomize seed',
      'params.camera': 'Camera',
      'params.fixedCamera': 'Fixed camera',
      'params.resolution4k': '4k generation is heavily rate-limited (RPM 15 / concurrency 1); expect longer queues',
      'params.demoNoCost': 'Demo mode · no cost',
      'params.estimatePrefix': 'Estimated ',
      'params.estimateSuffix': ' · based on 16:9 / 5s; actual billing may differ',
      'params.estimateUnavailable': 'Cost estimate unavailable (see your bill)',
      'params.adaptiveRatio': 'Adaptive ratio',

      // ---- history ----
      'history.emptyTitle': 'No generations yet',
      'history.emptyDesc': 'Fill in a prompt on the left and click "Generate video"',
      'history.fillSample': 'Insert a sample prompt',
      'history.recordAria': 'Video record {prompt}',
      'history.clickPlay': 'Click to play or download',
      'history.noPrompt': '(no prompt)',
      'history.origin': 'From {id}',
      'history.confirmDelete': 'Confirm delete',
      'history.confirmCancel': 'Confirm cancel',
      'history.deleteQuestion': 'Delete this record?',
      'history.cancelQuestion': 'Cancel the generation task?',
      'history.deleteDesc': 'Media files will be deleted too and cannot be recovered.',
      'history.cancelDesc': 'Only queued tasks can be cancelled.',
      'history.cancelAction': 'Cancel action',
      'history.back': 'Back',
      'history.confirm': 'Confirm',
      'history.title': 'History & queue',
      'history.count': '{total} total',
      'history.activeSuffix': ' · {active} generating',
      'history.filterAll': 'All {count}',
      'history.filterActive': 'Active {count}',
      'history.filterDone': 'Done {count}',
      'history.filterFailed': 'Failed {count}',
      'history.filterAria': 'History filter',
      'history.loadError': 'Failed to load history',
      'history.queueTitle': 'Active tasks · {count}',
      'history.emptyFilteredTitle': 'No records for this filter',
      'history.emptyFilteredDesc': 'Switch to "All" to see other records',
      'history.demoHint': 'Currently in demo mode; a built-in sample video is used',
      'history.footer': 'Records are saved per session on this machine · video URLs are valid ~24h; playback and download use local copies',

      // ---- player ----
      'player.title': 'Player · {title}',
      'player.urlTtl': 'Video URLs are valid for ~24h; download to keep a copy',
      'player.notPlayable': 'Video is not playable right now (not downloaded yet or link expired)',
      'player.progressAria': 'Video progress',
      'player.framePreview': 'Captured frame preview',
      'player.pickFrame': 'Capture a frame as recreation material',
      'player.useFrame': 'Recreate from this frame',
      'player.promptLabel': 'Prompt: ',
      'player.paramsLabel': 'Parameters: ',
      'player.taskLabel': 'Task: ',
      'player.errorLabel': 'Error: ',
      'player.captureSuccess': 'Captured {frame}',

      // ---- recreate ----
      'recreate.wayAuto': 'Smart reuse (recommended)',
      'recreate.wayAutoDesc': 'Server automatically picks remote video/last frame or regenerates',
      'recreate.wayFirst': 'Frame · first frame',
      'recreate.wayFirstDesc': 'Use the captured frame as first frame',
      'recreate.wayRef': 'Frame · reference image',
      'recreate.wayRefDesc': 'Use the captured frame as reference image',
      'recreate.wayVideo': 'Reference video',
      'recreate.remoteFresh': 'Reuse the source remote video URL',
      'recreate.remoteStale': 'Source has no usable remote URL (or older than 24h)',
      'recreate.needFrame': 'Capture a frame as material first',
      'recreate.title': 'Recreate · {title}',
      'recreate.subtitle': 'Source {id} · {model} · {time}',
      'recreate.autoNote': 'Calls /api/seedance/recreate (server picks remote video or last frame)',
      'recreate.generateNote': 'Calls /api/seedance/generate with source video material (sourceId marks the origin)',
      'recreate.pickFrame': 'Pick a frame from the video as "first frame" or "reference image" material',
      'recreate.sectionRef': 'Reference method',
      'recreate.sectionPrompt': 'Prompt',
      'recreate.promptAria': 'Recreation prompt',
      'recreate.sectionParams': 'Parameters',
      'recreate.modelAria': 'Recreation model',
      'recreate.resolutionAria': 'Recreation resolution',
      'recreate.ratioAria': 'Recreation ratio',
      'recreate.durationAria': 'Recreation duration',
      'recreate.unavailable': 'Unavailable: {desc}',

      // ---- settings ----
      'settings.title': 'Seedance settings',
      'settings.subtitle': 'API keys are stored locally and never sent to the page',
      'settings.effectHint': 'Takes effect immediately after saving',
      'settings.loading': 'Loading settings',
      'settings.demoHint': 'No real API calls',
      'settings.provider': 'Provider',
      'settings.providerAria': 'Provider',
      'settings.providerAuto': 'Auto (Ark when key present, otherwise demo)',
      'settings.providerArk': 'Volcengine Ark official',
      'settings.providerRelay': 'Relay service',
      'settings.providerDemo': 'Force demo mode',
      'settings.arkKey': 'Ark API key',
      'settings.savedPrefix': 'Saved: {key} (leave empty to keep)',
      'settings.arkBase': 'Ark base URL (optional)',
      'settings.defaultModel': 'Default model',
      'settings.followHost': 'Follow host default',
    'settings.builtinModels': 'Built-in models',
    'settings.relayModelGroup': 'Relay models',
    'settings.customModelOption': 'Custom model ID…',
    'settings.customModel': 'Custom model ID',
    'settings.customModelPlaceholder': 'Model / endpoint ID',
    'settings.relayFetch': 'Fetch models',
    'settings.relayFetching': 'Connecting…',
    'settings.relayFetchHint': 'Also checks relay connectivity',
    'settings.relayPickTitle': 'Pick models to show in the Model dropdown',
    'settings.relayFilterPlaceholder': 'Filter models (e.g. seedance)',
    'settings.relayModelsCount': '{count} models · click to toggle',
    'settings.relayModelsEmpty': 'No matching models',
    'settings.relaySelectedTitle': 'Selected models ({count})',
    'settings.relaySelectedEmpty': 'No models selected — click models above',
    'settings.relayRemove': 'Remove',
    'settings.relayHostStale': 'Host API not loaded: fully restart the desktop app and retry',
    'settings.relayProbeOk': 'Connected · {ms} ms · {count} models',
    'settings.relayProbeFail': 'Connection failed: {message}',
      'settings.relayAdvanced': 'Relay service (advanced)',
      'settings.relayBase': 'Relay base URL',
      'settings.relayKey': 'Relay API key',
      'settings.relayProtocol': 'Relay protocol',
      'settings.relayArk': 'Ark-compatible',
      'settings.relayOpenai': 'OpenAI-compatible',
      'settings.priorityHint': 'Priority: settings.json > environment variables > plugin config; keys are always masked when read back.',
      'settings.demoSaved': 'The host is running in demo mode (no usable API key detected)',

      // ---- video pick ----
      'videoPick.title': 'Pick from history videos',
      'videoPick.subtitle': 'Pick a completed record and fill its remote video URL into the reference video',
      'videoPick.useAria': 'Use this video',
      'videoPick.remoteTitle': 'Use remote video URL',
      'videoPick.noRemote': 'This record has no usable remote URL (expires after ~24h)',
      'videoPick.use': 'Use',
      'videoPick.expired': 'URL expired',
      'videoPick.emptyTitle': 'No history videos available',
      'videoPick.emptyDesc': 'Generate a video first, or paste a public video link',

      // ---- overlays ----
      'overlays.dialog': 'Dialog',

      // ---- toasts ----
      'toast.hostOfflineCreate': 'Host not connected; cannot create tasks',
      'toast.createdDemo': 'Task created (demo mode)',
      'toast.created': 'Task created',
    'toast.chatSent': 'Sent to chat; the agent will continue analysis and optimization',
    'toast.chatFailed': 'Failed to send to chat; please retry later',
    'toast.chatUnavailable': 'Cannot open chat (host session navigation unavailable)',
      'toast.downloading': 'Starting download…',
      'toast.downloadStarted': 'Download started',
      'toast.downloadFailed': 'Download failed; right-click in the player to save',
      'toast.hostOffline': 'Host not connected',
      'toast.deleted': 'Record deleted',
      'toast.cancelRequested': 'Cancel requested',
      'toast.selectSession': 'Select a session first',
      'toast.recreateCreated': 'Recreation task created',
      'toast.draftFinalMissing': 'This draft has no remote task ID; cannot finalize',
      'toast.draftFinalCreated': 'Finalize task created (1080p)',
      'toast.noRemoteVideo': 'This record has no usable remote video URL (expires after ~24h)',
      'toast.refVideoFilled': 'Reference video URL filled in',
      'toast.captureFailed': 'Frame capture failed',
      'toast.settingsSaved': 'Settings saved',
      'toast.copySuccess': 'Video link copied',
      'toast.copyFailed': 'Copy failed',

      // ---- errors ----
      'errors.apiKeyInvalid': 'Invalid or missing API key; check settings',
      'errors.modelNotOpen': 'The model is not enabled yet; enable it in the Ark console',
      'errors.modelNotFound': 'Model ID not found; check the model name or endpoint',
      'errors.paramConstraint': 'Parameters are incompatible with this task type (e.g. first/last frame or edit tasks need adaptive ratio; edit needs smart duration)',
      'errors.sensitive': 'Input failed moderation; revise the prompt or material',
      'errors.privacy': 'Real human faces cannot be uploaded directly; use authorized material or platform outputs',
      'errors.policy': 'Material may have copyright restrictions; replace it',
      'errors.rateLimit': 'Too many requests or concurrency is full; try again later (new tasks queue automatically)',
      'errors.overdue': 'Account is overdue or quota is insufficient; top up or adjust quota and retry',
      'errors.internal': 'Service temporarily unavailable; try again later',
      'errors.requestFailed': 'Request failed; try again later',
      'errors.requestFailedCode': 'Request failed: {code}',

      // ---- files ----
      'file.readFailed': 'Failed to read the file',
      'file.compressUnavailable': 'Image compression is unavailable in this environment',
      'file.parseFailed': 'Failed to parse the image',
      'file.noFile': 'No file selected',
      'file.imageTooLarge': 'Image exceeds the 30MB limit: {name}',
      'file.audioTooLarge': 'Audio exceeds the 30MB limit: {name}',
      'file.playerNotReady': 'Player not ready',
      'file.videoNotLoaded': 'Video has not loaded yet; try again later',
      'file.captureFailed': 'Frame capture failed',
      'file.tainted': 'Video is cross-origin; cannot capture frames in the browser. Use server-side smart recreation or a remote reference video',

      // ---- form validation ----
      'form.needSession': 'Start a conversation to generate (or choose a session in the header)',
      'form.promptRequired': 'Please enter a prompt',
      'form.promptTooLong': 'Prompt is too long (max {max} chars)',
      'form.chooseModel': 'Please choose a model',
      'form.modeUnsupported': 'The current model does not support "{mode}" mode',
      'form.image2videoNeedsFirst': 'Image to video requires a first frame image',
      'form.firstlastNeedsFirst': 'First/last frame mode requires at least a first frame image',
      'form.referenceNeedsMaterial': 'Add at least one reference image, reference video or audio',
      'form.tooManyRefs': 'Too many reference images (max {max})',
      'form.noVideoRef': 'The current model does not support reference video',
      'form.noAudioRef': 'The current model does not support audio reference',
      'form.audio20NeedsMedia': '2.0 series reference audio must be combined with images or video',
      'form.editNeedsVideo': 'Video edit/extend requires a reference video (public URL or history video)',
      'form.videoUrlScheme': 'Reference video must be an http(s) link or asset ID (video base64 is not supported)',
      'form.videoUrlTooLong': 'Reference video URL is too long',
      'form.noDraft': 'Draft mode is only supported by Seedance 2.5',

      // ---- time ----
      'time.justNow': 'just now',
      'time.minutesAgo': '{count} min ago',
      'time.hoursAgo': '{count} h ago',
      'time.daysAgo': '{count} d ago',
      'time.monthDay': '{month}/{day}',

      // ---- host http ----
      'http.fetchUnavailable': 'fetch is unavailable',
      'http.hostConnect': 'Cannot connect to host service: {message}',
      'http.emptyResponse': 'Host returned an empty response',
      'http.notInstalled': 'Host API is not installed (404)',
      'http.requestFailed': 'Request failed (HTTP {status})',

      // ---- ratio options ----
      'ratio.adaptive': 'Adaptive',
      'ratio.horizontal': '16:9 landscape',
      'ratio.vertical': '9:16 portrait',
      'ratio.square': '1:1 square',
      'ratio.widescreen': '21:9 widescreen',

      // ---- prompt templates ----
      'template.cinematic.label': 'Cinematic aerial',
      'template.cinematic.text': 'Cinematic aerial shot, a misty valley at dawn, the camera pushes forward steadily, sunlight breaking through clouds in the distance, calm and healing mood, high detail, 4K',
      'template.product.label': 'Product ad',
      'template.product.text': 'High-end perfume commercial, a perfume bottle rotating slowly on a black marble surface, soft rim light, water droplet refraction, shallow depth of field, slow motion',
      'template.portrait.label': 'Portrait close-up',
      'template.portrait.text': 'Portrait close-up, a young Asian woman smiling by a café window, natural side light, warm tones, shallow depth of field, slow push-in',
      'template.ink.label': 'Ink animation',
      'template.ink.text': 'Chinese ink-wash animation, mountains emerging from mist, a white crane flying over a waterfall, slow pan, ink brush strokes, serene mood',

      // ---- model notes ----
      'modelNotes.2-5': 'Latest flagship: 4–30s, up to 1080p, multimodal references, draft, mp4/mov; smart duration by default.',
      'modelNotes.2-0': 'Supports 4k, multimodal references, audio; 4–15s.',
      'modelNotes.2-0-fast': '2.0 cost-effective fast variant: 480p/720p, multimodal references, audio; 4–15s.',
      'modelNotes.2-0-mini': '2.0 lightweight variant: 480p/720p, multimodal references, audio; 4–15s.',
      'modelNotes.1-0-pro': '1.0 pro: 720p/1080p, text/image/first-last frame; 5/10s.',
      'modelNotes.1-0-pro-fast': '1.0 fast: 720p, text/image to video; 5/10s.',
    };

    // --------------------------------------------------------------------------
    // 翻译：优先宿主 locale（ctx.locale.bind(NS)），否则用内置 zh 字典兜底。
    // 语言切换由宿主 locale 实时生效；开发/测试环境（无宿主）保持中文。
    // --------------------------------------------------------------------------
    let __boundTranslate = null;

    function installTranslator(fn) {
      __boundTranslate = typeof fn === 'function' ? fn : null;
    }

    function formatTemplate(text, params) {
      if (!params) return String(text);
      return String(text).replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])));
    }

    function translate(key, params) {
      if (__boundTranslate) {
        try {
          const value = __boundTranslate(key);
          if (value !== undefined && value !== null && typeof value === 'string') return params ? formatTemplate(value, params) : value;
        } catch (error) { /* 宿主 locale 异常时退回内置字典 */ }
      }
      const fallbackZh = DICT_ZH[key] !== undefined ? DICT_ZH[key] : (DICT_EN[key] !== undefined ? DICT_EN[key] : key);
      return params ? formatTemplate(fallbackZh, params) : fallbackZh;
    }

    // --------------------------------------------------------------------------
    // 测试辅助：两套字典 key 集一致性校验（build/check 脚本可用）
    // --------------------------------------------------------------------------
    function dictionaryKeyDiff() {
      const zhKeys = Object.keys(DICT_ZH);
      const enKeys = Object.keys(DICT_EN);
      return {
        missingEn: zhKeys.filter((key) => !(key in DICT_EN)),
        missingZh: enKeys.filter((key) => !(key in DICT_ZH)),
      };
    }
    // ==========================================================================
    // 常量
    // ==========================================================================
    const MAX_PROMPT_CHARS = 20000;
    const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
    const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
    const HISTORY_POLL_MS = 2500;
    /** 示例提示词（label/text 为 i18n key，渲染时 translate()）。 */
    const PROMPT_TEMPLATES = [
      { label: 'template.cinematic.label', text: 'template.cinematic.text' },
      { label: 'template.product.label', text: 'template.product.text' },
      { label: 'template.portrait.label', text: 'template.portrait.text' },
      { label: 'template.ink.label', text: 'template.ink.text' },
    ];
    /** 创作模式（label 为 i18n key）。 */
    const MODES = [
      { id: 'text2video', label: 'mode.text2video', icon: 'text', needs: 'none' },
      { id: 'image2video', label: 'mode.image2video', icon: 'image', needs: 'first' },
      { id: 'firstlast', label: 'mode.firstlast', icon: 'frames', needs: 'firstlast' },
      { id: 'reference', label: 'mode.reference', icon: 'layers', needs: 'reference' },
      { id: 'edit', label: 'mode.edit', icon: 'edit', needs: 'video' },
      { id: 'draft', label: 'mode.draft', icon: 'draft', needs: 'none' },
    ];
    /** 模式短标签（i18n key）。 */
    const MODE_LABELS = {
      text2video: 'mode.text2video', image2video: 'mode.image2video', firstlast: 'mode.firstlast', reference: 'mode.reference',
      edit: 'mode.edit', extend: 'mode.extend', draft: 'mode.draft', 'draft-final': 'mode.draftFinal',
    };
    /** 参考估算价格表（元；按 16:9 / 5s 基准，实际以账单为准；仅用于 UI 提示）。 */
    const COST_TABLE = {
      'doubao-seedance-2-5-260628': { '480p': 3.36, '720p': 7.56, '1080p': 18.71 },
      'doubao-seedance-2-0-260128': { '480p': 2.31, '720p': 4.97, '1080p': 12.39, '4k': 25.27 },
      'doubao-seedance-2-0-fast-260128': { '480p': 1.86, '720p': 4.00 },
      'doubao-seedance-2-0-mini-260615': { '480p': 1.16, '720p': 2.48 },
    };
    /** 任务状态元信息（label 为 i18n key）。 */
    const STATUS_META = {
      queued: { label: 'status.queued', tone: 'info', progress: 8 },
      running: { label: 'status.running', tone: 'info', progress: 52 },
      succeeded: { label: 'status.succeeded', tone: 'success', progress: 100 },
      failed: { label: 'status.failed', tone: 'error', progress: 100 },
      cancelled: { label: 'status.cancelled', tone: 'muted', progress: 0 },
      expired: { label: 'status.expired', tone: 'warn', progress: 100 },
    };
    /** 画面比例选项（label 为 i18n key）。 */
    const RATIO_OPTIONS = [
      { value: 'adaptive', label: 'ratio.adaptive' },
      { value: '16:9', label: 'ratio.horizontal' },
      { value: '9:16', label: 'ratio.vertical' },
      { value: '1:1', label: 'ratio.square' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4' },
      { value: '21:9', label: 'ratio.widescreen' },
    ];

    /** 内置模型目录（与 /api/seedance/config 对齐；宿主未就绪时的兜底）。 */
    const FALLBACK_MODELS = [
      {
        id: 'doubao-seedance-2-5-260628', label: 'Seedance 2.5', family: '2.5',
        durations: [4, 30], autoDuration: true, defaultDuration: -1,
        defaultResolution: '720p', defaultRatio: 'adaptive',
        resolutions: ['480p', '720p', '1080p'],
        ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
        audio: true, audioAlone: true, firstFrame: true, lastFrame: true, references: true,
        draft: true, cameraFixed: false, outputFormats: ['mp4', 'mov'], omniReference: true,
        maxImages: 30, maxVideos: 10, maxAudios: 10, deprecated: false,
        noteKey: 'modelNotes.2-5',
      },
      {
        id: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0', family: '2.0',
        durations: [4, 15], autoDuration: true, defaultDuration: 5,
        defaultResolution: '720p', defaultRatio: 'adaptive',
        resolutions: ['480p', '720p', '1080p', '4k'],
        ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
        audio: true, audioAlone: false, firstFrame: true, lastFrame: true, references: true,
        draft: false, cameraFixed: false, outputFormats: ['mp4'], omniReference: false,
        maxImages: 9, maxVideos: 3, maxAudios: 3, deprecated: false,
        noteKey: 'modelNotes.2-0',
      },
      {
        id: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast', family: '2.0',
        durations: [4, 15], autoDuration: true, defaultDuration: 5,
        defaultResolution: '720p', defaultRatio: 'adaptive',
        resolutions: ['480p', '720p'],
        ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
        audio: true, audioAlone: false, firstFrame: true, lastFrame: true, references: true,
        draft: false, cameraFixed: false, outputFormats: ['mp4'], omniReference: false,
        maxImages: 9, maxVideos: 3, maxAudios: 3, deprecated: false,
        noteKey: 'modelNotes.2-0-fast',
      },
      {
        id: 'doubao-seedance-2-0-mini-260615', label: 'Seedance 2.0 Mini', family: '2.0',
        durations: [4, 15], autoDuration: true, defaultDuration: 5,
        defaultResolution: '720p', defaultRatio: 'adaptive',
        resolutions: ['480p', '720p'],
        ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
        audio: true, audioAlone: false, firstFrame: true, lastFrame: true, references: true,
        draft: false, cameraFixed: false, outputFormats: ['mp4'], omniReference: false,
        maxImages: 9, maxVideos: 3, maxAudios: 3, deprecated: false,
        noteKey: 'modelNotes.2-0-mini',
      },
    ];
    const FALLBACK_DEFAULTS = {
      defaultModel: 'doubao-seedance-2-5-260628',
      defaultDuration: -1,
      defaultRatio: 'adaptive',
      defaultResolution: '720p',
    };
    const FALLBACK_CONFIG = {
      provider: 'unknown',
      demo: true,
      models: FALLBACK_MODELS,
      defaults: FALLBACK_DEFAULTS,
      settings: {},
      capabilities: {},
    };

    /** 模块级内存（面板切换后仍保留草稿与会话选择；不写 localStorage 以免密钥/图片入库）。 */
    const MEMORY = { form: null, manualSessionId: '' };
    // ==========================================================================
    // 基础工具
    // ==========================================================================
    function asStr(value) {
      return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
    }
    function asNum(value, fallback) {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? n : fallback;
    }
    function clampNumber(value, min, max, fallback) {
      const n = asNum(value, NaN);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    }
    function clampProgress(value) {
      return Math.min(100, Math.max(0, Math.round(asNum(value, 0))));
    }
    function isPlainObject(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    }
    function normalizeStatus(value) {
      const raw = asStr(value).toLowerCase();
      if (raw === 'success' || raw === 'succeed' || raw === 'succeeded' || raw === 'done' || raw === 'completed' || raw === 'complete') return 'succeeded';
      if (raw === 'error' || raw === 'fail' || raw === 'failed') return 'failed';
      if (raw === 'canceled' || raw === 'cancelled') return 'cancelled';
      if (raw === 'expired') return 'expired';
      if (raw === 'running' || raw === 'processing' || raw === 'generating') return 'running';
      if (raw === 'queued' || raw === 'pending' || raw === 'waiting') return 'queued';
      return raw || 'queued';
    }
    function statusMeta(record) {
      const meta = STATUS_META[record && record.status];
      if (!meta) return { label: (record && record.status) || translate('common.unknown'), tone: 'muted', progress: 0 };
      return { label: translate(meta.label), tone: meta.tone, progress: meta.progress };
    }
    function fmtRelative(ts) {
      const n = asNum(ts, 0);
      if (!n) return '';
      const diff = Date.now() - n;
      if (diff < 45 * 1000) return translate('time.justNow');
      if (diff < 3600 * 1000) return translate('time.minutesAgo', { count: Math.max(1, Math.round(diff / 60000)) });
      if (diff < 86400 * 1000) return translate('time.hoursAgo', { count: Math.round(diff / 3600000) });
      if (diff < 7 * 86400 * 1000) return translate('time.daysAgo', { count: Math.round(diff / 86400000) });
      const d = new Date(n);
      return translate('time.monthDay', { month: d.getMonth() + 1, day: d.getDate() });
    }
    function fmtClock(ts) {
      const d = new Date(asNum(ts, Date.now()));
      const pad = (v) => (v < 10 ? '0' + v : '' + v);
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function fmtDuration(seconds) {
      const n = asNum(seconds, NaN);
      if (!Number.isFinite(n) || n < 0) return translate('common.smartDuration');
      return Math.round(n) + translate('common.seconds');
    }
    function shortId(id) {
      const s = asStr(id);
      if (!s) return '';
      return '#' + (s.length > 10 ? s.slice(-6) : s);
    }
    /** 模型说明文案：优先 i18n noteKey，其次宿主下发的 notes。 */
    function noteKeyForModel(model) {
      const id = asStr(model && model.id);
      if (id.indexOf('-2-5-') !== -1) return 'modelNotes.2-5';
      if (id.indexOf('-2-0-fast-') !== -1) return 'modelNotes.2-0-fast';
      if (id.indexOf('-2-0-mini-') !== -1) return 'modelNotes.2-0-mini';
      if (id.indexOf('-2-0-') !== -1) return 'modelNotes.2-0';
      if (id.indexOf('-1-0-pro-fast-') !== -1) return 'modelNotes.1-0-pro-fast';
      if (id.indexOf('-1-0-pro-') !== -1) return 'modelNotes.1-0-pro';
      return '';
    }
    function modelNote(model) {
      if (!model) return '';
      const noteKey = model.noteKey || noteKeyForModel(model);
      if (noteKey) return translate(noteKey);
      return asStr(model.notes);
    }
    function modeLabel(modeId) {
      const found = MODES.find((mode) => mode.id === modeId);
      return found ? translate(found.label) : (modeId || translate('common.generate'));
    }
    function modelLabel(models, modelId) {
      const found = (models || []).find((model) => model.id === modelId);
      return found ? found.label : (modelId || translate('common.defaultModel'));
    }
    function findModel(models, modelId) {
      return (models || []).find((model) => model && model.id === modelId) || null;
    }
    function clampEnum(value, allowed, fallback) {
      return Array.isArray(allowed) && allowed.length && allowed.indexOf(value) !== -1 ? value : fallback;
    }
    function safeNow() { return Date.now(); }
    // ==========================================================================
    // HTTP API 封装（所有数据访问统一走这里；宿主未安装时静默降级）
    // ==========================================================================
    async function api(method, path, body) {
      const init = {
        method: method || 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      };
      if (body !== undefined) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      let response;
      try {
        if (typeof fetch !== 'function') throw new Error(translate('http.fetchUnavailable'));
        response = await fetch(path, init);
      } catch (error) {
        return {
          ok: false,
          offline: true,
          error: { code: 'network_error', message: translate('http.hostConnect', { message: error && error.message ? error.message : String(error) }) },
        };
      }
      let payload = null;
      const contentType = response.headers && response.headers.get ? (response.headers.get('content-type') || '') : '';
      try {
        if (contentType.indexOf('application/json') !== -1) {
          payload = await response.json();
        } else {
          const text = await response.text();
          try { payload = JSON.parse(text); } catch (parseError) {
            payload = { ok: false, error: { code: 'bad_response', message: text ? text.slice(0, 300) : translate('http.emptyResponse') } };
          }
        }
      } catch (readError) {
        payload = null;
      }
      if (payload && typeof payload.ok === 'boolean') {
        payload.status = response.status;
        return payload;
      }
      if (response.status === 404) {
        return {
          ok: false,
          offline: true,
          status: 404,
          error: { code: 'not_installed', message: translate('http.notInstalled') },
        };
      }
      if (!response.ok) {
        const message = payload && payload.error && payload.error.message
          ? payload.error.message
          : translate('http.requestFailed', { status: response.status });
        return { ok: false, status: response.status, error: { code: 'http_' + response.status, message } };
      }
      return { ok: true, status: response.status, value: payload };
    }

    function mediaUrl(recordOrId, kind) {
      const id = typeof recordOrId === 'string' ? recordOrId : (recordOrId && recordOrId.id);
      return '/api/seedance/media?id=' + encodeURIComponent(asStr(id)) + '&kind=' + encodeURIComponent(kind || 'video');
    }

    function copyText(text) {
      const value = asStr(text);
      if (!value) return Promise.resolve(false);
      try {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(value).then(() => true, () => false);
        }
      } catch (error) { /* fallthrough */ }
      try {
        const area = document.createElement('textarea');
        area.value = value;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand && document.execCommand('copy');
        area.remove();
        return Promise.resolve(!!ok);
      } catch (error) {
        return Promise.resolve(false);
      }
    }

    function downloadFile(url, filename) {
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        if (filename) anchor.download = filename;
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } catch (error) { /* ignore */ }
    }
    // ==========================================================================
    // 数据归一化：/config /history /record
    // ==========================================================================
    function deriveModes(source) {
      const family = asStr(source.family);
      const list = ['text2video'];
      if (source.firstFrame !== false || source.references === true) list.push('image2video');
      if (source.lastFrame !== false) list.push('firstlast');
      if (source.references === true) list.push('reference', 'edit', 'extend');
      if (family === '2.5' || source.draft === true) list.push('draft');
      return list;
    }

    function normalizeModel(raw) {
      if (!isPlainObject(raw)) return null;
      const capabilities = isPlainObject(raw.capabilities) ? raw.capabilities : {};
      const source = Object.assign({}, capabilities, raw);
      const id = asStr(source.id || source.model || source.name).trim();
      if (!id) return null;
      const range = Array.isArray(source.durations) && source.durations.length >= 2
        ? [asNum(source.durations[0], 4), asNum(source.durations[1], 15)]
        : [asNum(source.minDuration, 4), asNum(source.maxDuration, 15)];
      const resolutions = Array.isArray(source.resolutions) && source.resolutions.length
        ? source.resolutions.map(asStr).filter(Boolean)
        : ['480p', '720p'];
      const ratios = Array.isArray(source.ratios) && source.ratios.length
        ? source.ratios.map(asStr).filter(Boolean)
        : RATIO_OPTIONS.map((option) => option.value);
      const outputFormats = Array.isArray(source.outputFormats) && source.outputFormats.length
        ? source.outputFormats.map(asStr).filter(Boolean)
        : ['mp4'];
      const family = asStr(source.family) || '';
      const defaultResolution = clampEnum(asStr(source.defaultResolution || source.default_resolution),
        resolutions, resolutions.indexOf('720p') !== -1 ? '720p' : resolutions[0]);
      const defaultRatio = clampEnum(asStr(source.defaultRatio || source.default_ratio),
        ratios, ratios.indexOf('adaptive') !== -1 ? 'adaptive' : ratios[0]);
      const modes = Array.isArray(source.modes) && source.modes.length
        ? source.modes.map(asStr).filter(Boolean)
        : deriveModes({ family, firstFrame: source.firstFrame, lastFrame: source.lastFrame, references: source.references, draft: source.draft });
      return {
        id,
        label: asStr(source.label || source.title || source.labelZh) || id,
        family,
        durations: [Math.min(range[0], range[1]), Math.max(range[0], range[1])],
        autoDuration: source.autoDuration === true || source.auto_duration === true,
        defaultDuration: asNum(source.defaultDuration !== undefined ? source.defaultDuration : source.default_duration,
          source.autoDuration === true || source.auto_duration === true ? -1 : 5),
        defaultResolution,
        defaultRatio,
        resolutions,
        ratios,
        audio: source.audio !== false,
        audioAlone: source.audioAlone === true || source.audio_alone === true,
        firstFrame: source.firstFrame !== false,
        lastFrame: source.lastFrame !== false,
        references: source.references !== false && (family === '2.5' || family === '2.0' || source.references === true),
        draft: source.draft === true || family === '2.5',
        frames: source.frames === true,
        cameraFixed: source.cameraFixed === true || source.camera_fixed === true,
        flex: source.flex === true,
        outputFormats,
        omniReference: source.omniReference === true || source.omni_reference === true || family === '2.5',
        tools: source.tools === true,
        priority: source.priority === true,
        maxImages: Math.max(0, asNum(source.maxImages !== undefined ? source.maxImages : source.max_images, family === '2.5' ? 30 : 9)),
        maxVideos: Math.max(0, asNum(source.maxVideos !== undefined ? source.maxVideos : source.max_videos, family === '2.5' ? 10 : 3)),
        maxAudios: Math.max(0, asNum(source.maxAudios !== undefined ? source.maxAudios : source.max_audios, family === '2.5' ? 10 : 3)),
        deprecated: source.deprecated === true,
        notes: asStr(source.notes),
        modes,
        raw,
      };
    }

    function normalizeModels(list) {
      if (!Array.isArray(list)) return [];
      const models = [];
      for (const item of list) {
        const model = normalizeModel(item);
        if (model) models.push(model);
      }
      return models;
    }

    /** 设置页勾选的模型清单 → [{id,label}]（容错、去重）。 */
    function normalizeModelChoices(list) {
      if (!Array.isArray(list)) return [];
      const out = [];
      for (const item of list) {
        const id = asStr(item && item.id);
        if (!id || out.some((entry) => entry.id === id)) continue;
        out.push({ id, label: asStr(item && item.label) || id });
      }
      return out;
    }

    function normalizeConfig(payload) {
      const raw = isPlainObject(payload) ? payload : {};
      let models = normalizeModels(raw.models);
      if (!models.length) models = FALLBACK_MODELS.map((model) => normalizeModel(model)).filter(Boolean);
      const rawDefaults = isPlainObject(raw.defaults) ? raw.defaults : {};
      const settings = isPlainObject(raw.settings) ? raw.settings : {};
      const provider = asStr(raw.provider || settings.provider || 'unknown').toLowerCase() || 'unknown';
      const demo = raw.demo === true || provider === 'demo' || (provider === 'unknown' && !asStr(settings.ARK_API_KEY || settings.arkApiKey || settings.RELAY_API_KEY || settings.relayApiKey));
      const defaults = {
        defaultModel: asStr(rawDefaults.defaultModel || raw.defaultModel || settings.DEFAULT_MODEL || settings.defaultModel) || FALLBACK_DEFAULTS.defaultModel,
        enabledModels: normalizeModelChoices(rawDefaults.enabledModels),
        defaultDuration: asNum(rawDefaults.defaultDuration !== undefined ? rawDefaults.defaultDuration : raw.defaultDuration, FALLBACK_DEFAULTS.defaultDuration),
        defaultRatio: asStr(rawDefaults.defaultRatio || raw.defaultRatio) || FALLBACK_DEFAULTS.defaultRatio,
        defaultResolution: asStr(rawDefaults.defaultResolution || raw.defaultResolution) || FALLBACK_DEFAULTS.defaultResolution,
      };
      return {
        provider,
        demo,
        demoReason: asStr(raw.demoReason || settings.demoReason),
        defaultModel: defaults.defaultModel,
        models,
        defaults,
        settings,
        capabilities: isPlainObject(raw.capabilities) ? raw.capabilities : {},
        limits: isPlainObject(raw.limits) ? raw.limits : {},
      };
    }

    function normalizeRecord(raw) {
      if (!isPlainObject(raw) || !raw.id) return null;
      const status = normalizeStatus(raw.status);
      const params = isPlainObject(raw.params) ? raw.params : {};
      const files = isPlainObject(raw.files) ? raw.files : {};
      const meta = isPlainObject(raw.meta) ? raw.meta : {};
      const error = isPlainObject(raw.error) ? raw.error : undefined;
      return {
        id: asStr(raw.id),
        sessionId: asStr(raw.sessionId || raw.session_id),
        createdAt: asNum(raw.createdAt !== undefined ? raw.createdAt : raw.created_at, 0),
        updatedAt: asNum(raw.updatedAt !== undefined ? raw.updatedAt : raw.updated_at, 0),
        status,
        progress: raw.progress !== undefined ? clampProgress(raw.progress) : statusMeta({ status }).progress,
        prompt: asStr(raw.prompt),
        model: asStr(raw.model),
        provider: asStr(raw.provider),
        mode: asStr(raw.mode) || 'text2video',
        params,
        inputs: isPlainObject(raw.inputs) ? raw.inputs : {},
        remoteTaskId: asStr(raw.remoteTaskId || raw.remote_task_id),
        remoteVideoUrl: asStr(raw.remoteVideoUrl || raw.remote_video_url),
        remoteLastFrameUrl: asStr(raw.remoteLastFrameUrl || raw.remote_last_frame_url),
        files,
        meta,
        error,
        originId: asStr(raw.originId || raw.origin_id),
        toolCallId: asStr(raw.toolCallId || raw.tool_call_id),
      };
    }

    function normalizeHistory(payload) {
      const source = isPlainObject(payload) && Array.isArray(payload.records)
        ? payload.records
        : Array.isArray(payload) ? payload : [];
      const records = [];
      for (const item of source) {
        const record = normalizeRecord(item);
        if (record) records.push(record);
      }
      return records;
    }

    function settingsOf(payload) {
      if (isPlainObject(payload) && isPlainObject(payload.settings)) return payload.settings;
      return isPlainObject(payload) ? payload : {};
    }
    function readSetting(settings, keys) {
      const source = isPlainObject(settings) ? settings : {};
      for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && value !== '') {
          if (typeof value === 'boolean') return value;
          return asStr(value);
        }
      }
      return '';
    }

    // ==========================================================================
    // 媒体 / 文件处理
    // ==========================================================================
    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        try {
          const reader = new FileReader();
          reader.onload = () => resolve(asStr(reader.result));
          reader.onerror = () => reject(reader.error || new Error(translate('file.readFailed')));
          reader.readAsDataURL(file);
        } catch (error) {
          reject(error);
        }
      });
    }

    function downscaleImage(dataUrl, maxDimension, quality) {
      return new Promise((resolve, reject) => {
        if (typeof document === 'undefined' || typeof Image === 'undefined') {
          reject(new Error(translate('file.compressUnavailable')));
          return;
        }
        const image = new Image();
        image.onload = () => {
          try {
            const width = image.naturalWidth || image.width;
            const height = image.naturalHeight || image.height;
            const scale = Math.min(1, maxDimension / Math.max(width, height));
            if (scale >= 1) { resolve(dataUrl); return; }
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality || 0.9));
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = () => reject(new Error(translate('file.parseFailed')));
        image.src = dataUrl;
      });
    }

    async function imageFileToAsset(file) {
      if (!file) throw new Error(translate('file.noFile'));
      if (file.size > MAX_IMAGE_BYTES) throw new Error(translate('file.imageTooLarge', { name: file.name }));
      const dataUrl = await readFileAsDataUrl(file);
      let finalUrl = dataUrl;
      // 超过 ~1.6MB 或超大分辨率时压缩，避免请求体过大（host 也会对 dataUrl 做降级）
      if (dataUrl.length > 1.6 * 1024 * 1024) {
        try { finalUrl = await downscaleImage(dataUrl, 1600, 0.9); } catch (error) { finalUrl = dataUrl; }
      }
      return {
        id: 'img_' + safeNow() + '_' + Math.random().toString(36).slice(2, 7),
        dataUrl: finalUrl,
        name: asStr(file.name) || 'image',
        size: file.size,
      };
    }

    async function audioFileToAsset(file) {
      if (!file) throw new Error(translate('file.noFile'));
      if (file.size > MAX_AUDIO_BYTES) throw new Error(translate('file.audioTooLarge', { name: file.name }));
      const dataUrl = await readFileAsDataUrl(file);
      return { id: 'audio_' + safeNow(), dataUrl, name: asStr(file.name) || 'audio', size: file.size };
    }

    function seekVideo(video, time) {
      return new Promise((resolve) => {
        if (!video) { resolve(false); return; }
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          try { video.removeEventListener('seeked', finish); } catch (error) { /* ignore */ }
          resolve(true);
        };
        try { video.addEventListener('seeked', finish, { once: true }); } catch (error) { /* ignore */ }
        setTimeout(finish, 2500);
        try { video.currentTime = Math.max(0, time); } catch (error) { finish(); }
      });
    }

    async function captureVideoFrame(video, time) {
      if (!video) throw new Error(translate('file.playerNotReady'));
      if (time !== undefined) await seekVideo(video, time);
      try {
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        if (!width || !height) throw new Error(translate('file.videoNotLoaded'));
        const scale = Math.min(1, 1280 / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.9);
      } catch (error) {
        const message = error && error.message ? error.message : translate('file.captureFailed');
        if (/tainted|Security/i.test(message)) throw new Error(translate('file.tainted'));
        throw new Error(message);
      }
    }
    // ==========================================================================
    // 表单模型：默认参数、模型能力约束、GenerateRequest 构造
    // ==========================================================================
    function makeParams(model, defaults, overrides) {
      const safeDefaults = defaults || FALLBACK_DEFAULTS;
      const base = {
        resolution: (model && model.defaultResolution) || safeDefaults.defaultResolution || '720p',
        ratio: (model && model.defaultRatio) || safeDefaults.defaultRatio || 'adaptive',
        duration: model && model.autoDuration ? -1 : asNum(model && model.defaultDuration, asNum(safeDefaults.defaultDuration, 5)),
        autoDuration: !!(model && model.autoDuration),
        generateAudio: !!(model && model.audio),
        seed: '',
        watermark: false,
        returnLastFrame: !!(model && model.family === '2.5'),
        cameraFixed: false,
        priority: '',
        outputFormat: (model && model.outputFormats && model.outputFormats[0]) || 'mp4',
        draft: false,
        omniType: 'auto',
      };
      const merged = Object.assign(base, overrides || {});
      for (const key of Object.keys(merged)) {
        if (merged[key] === undefined) delete merged[key];
      }
      return merged;
    }

    /** 设置页勾选的「已选模型清单」→ [{id,label}]（容错、去重）。 */
    function enabledModelChoices(defaults) {
      const list = defaults && Array.isArray(defaults.enabledModels) ? defaults.enabledModels : [];
      const out = [];
      for (const item of list) {
        const id = asStr(item && item.id);
        if (!id || out.some((entry) => entry.id === id)) continue;
        out.push({ id, label: asStr(item && item.label) || id });
      }
      return out;
    }

    function createEmptyForm(models, defaults) {
      const safeModels = Array.isArray(models) && models.length ? models : FALLBACK_MODELS;
      const enabled = enabledModelChoices(defaults);
      const defaultModelId = asStr(defaults && defaults.defaultModel);
      // 已选模型清单非空时：默认模型优先用清单内的配置，不在清单则用清单首项（主面板下拉只显示清单）
      const preferredId = enabled.length
        ? (enabled.some((item) => item.id === defaultModelId) ? defaultModelId : enabled[0].id)
        : defaultModelId;
      const knownDefault = findModel(safeModels, preferredId);
      const model = knownDefault || safeModels[0];
      const customDefault = !knownDefault && preferredId ? preferredId : '';
      return {
        mode: 'text2video',
        prompt: '',
        modelId: knownDefault ? knownDefault.id : customDefault ? '__custom__' : (model ? model.id : FALLBACK_DEFAULTS.defaultModel),
        customModel: customDefault,
        params: makeParams(model, defaults || FALLBACK_DEFAULTS, null),
        assets: { first: null, last: null, refs: [], videoUrl: '', audio: null },
      };
    }

    /** 模型/参数联动约束：切换模型或配置刷新后收敛到合法值。 */
    function sanitizeForm(form, models, defaults) {
      const safeModels = Array.isArray(models) && models.length ? models : FALLBACK_MODELS;
      const current = form && typeof form === 'object' ? form : createEmptyForm(safeModels, defaults);
      const enabled = enabledModelChoices(defaults);
      const currentCustom = asStr(current.customModel);
      let model = findModel(safeModels, current.modelId) || findModel(safeModels, defaults && defaults.defaultModel) || safeModels[0];
      let modelId = model ? model.id : current.modelId;
      // 已选模型清单非空时：不在清单里的旧选择收敛到清单首项（下拉只显示清单模型）
      if (enabled.length && !currentCustom && !enabled.some((item) => item.id === modelId)) {
        model = findModel(safeModels, enabled[0].id) || model;
        modelId = enabled[0].id;
      }
      const nextParams = makeParams(model, defaults, current.params);
      const modelResolutions = model && Array.isArray(model.resolutions) && model.resolutions.length ? model.resolutions : null;
      const modelRatios = model && Array.isArray(model.ratios) && model.ratios.length ? model.ratios : null;
      const modelOutputFormats = model && Array.isArray(model.outputFormats) && model.outputFormats.length ? model.outputFormats : ['mp4'];
      const modelDurations = model && Array.isArray(model.durations) && model.durations.length ? model.durations : [4, 15];
      nextParams.resolution = clampEnum(nextParams.resolution, modelResolutions,
        (model && model.defaultResolution) || FALLBACK_DEFAULTS.defaultResolution);
      nextParams.ratio = clampEnum(nextParams.ratio, modelRatios,
        (model && model.defaultRatio) || FALLBACK_DEFAULTS.defaultRatio);
      if (!model || !model.audio) nextParams.generateAudio = false;
      if (!model || !model.cameraFixed) nextParams.cameraFixed = false;
      if (!model || !model.draft) nextParams.draft = false;
      if (!model || !model.omniReference) nextParams.omniType = 'auto';
      if (modelOutputFormats.indexOf(nextParams.outputFormat) === -1) {
        nextParams.outputFormat = modelOutputFormats[0] || 'mp4';
      }
      const durationRange = modelDurations;
      if (nextParams.autoDuration && model && model.autoDuration) {
        nextParams.duration = -1;
      } else {
        nextParams.autoDuration = false;
        nextParams.duration = Math.round(clampNumber(nextParams.duration, durationRange[0], durationRange[1],
          asNum(model && model.defaultDuration, 5)));
      }
      const currentAssets = isPlainObject(current.assets) ? current.assets : {};
      const assets = {
        first: currentAssets.first || null,
        last: currentAssets.last || null,
        refs: Array.isArray(currentAssets.refs) ? currentAssets.refs : [],
        videoUrl: asStr(currentAssets.videoUrl),
        audio: currentAssets.audio || null,
      };
      if (model && model.maxImages > 0) assets.refs = assets.refs.slice(0, model.maxImages);
      return Object.assign({}, current, { modelId, params: nextParams, assets });
    }

    /** 生成侧校验（返回错误文案，null 表示通过）。 */
    function validateForm(form, sessionId, models) {
      if (!sessionId) return translate('form.needSession');
      if (!form || !asStr(form.prompt).trim()) return translate('form.promptRequired');
      if (asStr(form.prompt).length > MAX_PROMPT_CHARS) return translate('form.promptTooLong', { max: MAX_PROMPT_CHARS });
      const customModel = asStr(form.customModel).trim();
      const model = findModel(models, form.modelId) || (customModel ? FALLBACK_MODELS[0] : null);
      if (!model) return customModel ? null : translate('form.chooseModel');
      const tab = form.mode || 'text2video';
      const subMode = tab === 'edit' ? (form.subMode === 'extend' ? 'extend' : 'edit') : tab;
      const constraints = deriveConstraints(model, subMode);
      const allowed = tab === 'edit'
        ? constraints.availableModes.indexOf('edit') !== -1 || constraints.availableModes.indexOf('extend') !== -1
        : constraints.availableModes.indexOf(tab) !== -1;
      if (!allowed) return translate('form.modeUnsupported', { mode: modeLabel(tab) });
      const assets = form.assets || {};
      if (tab === 'image2video' && !assets.first) return translate('form.image2videoNeedsFirst');
      if (tab === 'firstlast' && !assets.first) return translate('form.firstlastNeedsFirst');
      if (tab === 'reference') {
        const refs = (assets.refs || []).filter((item) => item && item.dataUrl);
        const hasVideo = !!asStr(assets.videoUrl).trim();
        const hasAudio = !!(assets.audio && assets.audio.dataUrl);
        if (!refs.length && !hasVideo && !hasAudio) return translate('form.referenceNeedsMaterial');
        if (refs.length > constraints.maxImages) return translate('form.tooManyRefs', { max: constraints.maxImages });
        if (hasVideo && !constraints.canReferenceVideo) return translate('form.noVideoRef');
        if (hasAudio && !constraints.showAudio) return translate('form.noAudioRef');
        if (model.family === '2.0' && hasAudio && !refs.length && !hasVideo) {
          return translate('form.audio20NeedsMedia');
        }
      }
      if (tab === 'edit' || tab === 'extend' || (tab === 'edit' && form.subMode === 'extend')) {
        const url = asStr(assets.videoUrl).trim();
        if (!url) return translate('form.editNeedsVideo');
        if (!/^https?:\/\//i.test(url) && !/^asset:\/\//i.test(url)) return translate('form.videoUrlScheme');
        if (url.length > 4096) return translate('form.videoUrlTooLong');
        if (!constraints.canReferenceVideo) return translate('form.noVideoRef');
      }
      if (tab === 'draft' && !constraints.showDraft) return translate('form.noDraft');
      return null;
    }

    /** 当前模式下的联动约束（UI 控件禁用/锁定规则，见 models-ui-matrix.md §4.4）。 */
    function deriveConstraints(model, mode) {
      const safeModel = model || FALLBACK_MODELS[0];
      const modes = Array.isArray(safeModel.modes) && safeModel.modes.length
        ? safeModel.modes.slice()
        : deriveModes(safeModel.raw || safeModel);
      const isEditFamily = mode === 'edit' || mode === 'extend';
      const lockRatio = mode === 'firstlast' || isEditFamily;
      const lockDuration = mode === 'edit' && safeModel.family === '2.5';
      const draftMode = mode === 'draft';
      const resolutions = draftMode ? ['480p'] : (safeModel.resolutions || ['480p', '720p']).slice();
      let ratios = (safeModel.ratios || ['adaptive']).slice();
      if (lockRatio) ratios = ['adaptive'];
      if (safeModel.family === '1.0' && mode === 'text2video') ratios = ratios.filter((item) => item !== 'adaptive');
      return {
        modes,
        availableModes: modes.slice(),
        ratios,
        resolutions,
        lockRatio,
        lockDuration,
        draftMode,
        showAudio: safeModel.audio === true,
        showDraft: modes.indexOf('draft') !== -1,
        showOutputFormat: (safeModel.outputFormats || []).length > 1,
        maxImages: safeModel.maxImages || 0,
        maxVideos: safeModel.maxVideos || 0,
        maxAudios: safeModel.maxAudios || 0,
        canReferenceVideo: (safeModel.maxVideos || 0) > 0,
      };
    }

    /** 模式或模型变化后收敛参数（比例锁 adaptive、编辑锁智能时长、样片锁 480p 等）。 */
    function applyModeConstraints(form, models) {
      const model = findModel(models, form.modelId) || FALLBACK_MODELS[0];
      const mode = form.mode === 'edit' ? 'edit' : form.mode;
      const constraints = deriveConstraints(model, mode);
      const params = Object.assign({}, form.params);
      params.resolution = clampEnum(params.resolution, constraints.resolutions,
        constraints.resolutions.indexOf('720p') !== -1 ? '720p' : constraints.resolutions[0]);
      params.ratio = clampEnum(params.ratio, constraints.ratios, constraints.ratios[0] || 'adaptive');
      if (constraints.lockRatio) params.ratio = 'adaptive';
      if (constraints.lockDuration) { params.duration = -1; params.autoDuration = true; }
      if (!constraints.showAudio) params.generateAudio = false;
      if (constraints.draftMode) params.resolution = '480p';
      if (!constraints.showOutputFormat) params.outputFormat = 'mp4';
      const next = Object.assign({}, form, { params });
      if (form.mode === 'edit') {
        if (constraints.availableModes.indexOf('edit') === -1 && constraints.availableModes.indexOf('extend') === -1) {
          next.mode = 'text2video';
        }
      } else if (constraints.availableModes.indexOf(form.mode) === -1) {
        next.mode = 'text2video';
      }
      return next;
    }

    function estimateCost(model, params) {
      const table = COST_TABLE[model && model.id];
      if (!table) return null;
      const resolution = params && params.resolution;
      const base = table[resolution];
      if (!base) return null;
      const duration = params.autoDuration ? 5 : asNum(params.duration, 5);
      return base * (duration / 5);
    }

    /** 把 UI 表单转换为 PLAN §4 的 GenerateRequest。 */
    function buildGenerateRequest(form, models, sessionId) {
      const model = findModel(models, form.modelId);
      const p = form.params || {};
      const tab = form.mode || 'text2video';
      const subMode = tab === 'edit' ? (form.subMode === 'extend' ? 'extend' : 'edit') : tab;
      const constraints = deriveConstraints(model, subMode);
      const params = {
        resolution: tab === 'draft' ? '480p' : clampEnum(p.resolution, constraints.resolutions,
          constraints.resolutions.indexOf('720p') !== -1 ? '720p' : constraints.resolutions[0]),
        ratio: constraints.lockRatio ? 'adaptive' : clampEnum(p.ratio, constraints.ratios, 'adaptive'),
        duration: constraints.lockDuration ? -1 : (p.autoDuration ? -1 : Math.round(asNum(p.duration, 5))),
        generateAudio: !!p.generateAudio && constraints.showAudio,
        watermark: !!p.watermark,
        returnLastFrame: !!p.returnLastFrame,
      };
      if (p.seed !== '' && p.seed !== null && p.seed !== undefined) {
        const seed = Math.trunc(asNum(p.seed, -1));
        if (seed >= 0) params.seed = seed;
      }
      const assets = form.assets || {};
      const images = [];
      const inputs = {};
      if (tab === 'image2video' && assets.first) {
        images.push({ role: 'first_frame', dataUrl: assets.first.dataUrl });
      } else if (tab === 'firstlast') {
        if (assets.first) images.push({ role: 'first_frame', dataUrl: assets.first.dataUrl });
        if (assets.last) images.push({ role: 'last_frame', dataUrl: assets.last.dataUrl });
      } else if (tab === 'reference' || tab === 'draft') {
        for (const item of assets.refs || []) {
          if (item && item.dataUrl) images.push({ role: 'reference_image', dataUrl: item.dataUrl });
        }
      }
      if (images.length) inputs.images = images;
      const videoUrl = asStr(assets.videoUrl).trim();
      if (videoUrl && (tab === 'reference' || tab === 'edit' || tab === 'extend')) {
        inputs.video = { url: videoUrl };
      }
      if (assets.audio && assets.audio.dataUrl && tab === 'reference') inputs.audio = { dataUrl: assets.audio.dataUrl };
      const mode = tab === 'draft' ? 'draft' : subMode;
      const body = {
        sessionId: asStr(sessionId),
        prompt: asStr(form.prompt).trim(),
        model: form.customModel && asStr(form.customModel).trim() ? asStr(form.customModel).trim() : form.modelId,
        mode,
        params,
        inputs,
      };
      return body;
    }

    /** 样片转正片（PLAN §4 draft-final：draftTaskId + 1080p，禁止 prompt/素材）。 */
    function buildDraftFinalRequest(draftRecord, sessionId) {
      if (!draftRecord) return null;
      // 必须是远端样片任务 ID（sd_ 本地记录 id 不是有效 draftTaskId）
      const draftTaskId = asStr(draftRecord.remoteTaskId).trim();
      if (!draftTaskId) return null;
      const sourceParams = draftRecord.params || {};
      const params = { resolution: '1080p' };
      if (typeof sourceParams.watermark === 'boolean') params.watermark = sourceParams.watermark;
      if (asStr(sourceParams.outputFormat) === 'mov' || asStr(sourceParams.outputFormat) === 'mp4') {
        params.outputFormat = asStr(sourceParams.outputFormat);
      }
      return {
        sessionId: asStr(sessionId),
        model: asStr(draftRecord.model),
        mode: 'draft-final',
        draftTaskId,
        params,
      };
    }

    // ==========================================================================
    // 当前会话（优先 ctx.uiSession.current，其次 ctx.sessions.list 主视图/最近会话）
    // ==========================================================================
    function readUiSessionId(uiSession) {
      try {
        if (!uiSession || !uiSession.current || typeof uiSession.current.getSnapshot !== 'function') return undefined;
        const snapshot = uiSession.current.getSnapshot();
        const key = snapshot && snapshot.key;
        return typeof key === 'string' && key ? key : undefined;
      } catch (error) {
        return undefined;
      }
    }

    function readSessionRows(sessions) {
      const rows = [];
      if (!sessions || !sessions.list || typeof sessions.list.getSnapshot !== 'function') return rows;
      try {
        const snapshot = sessions.list.getSnapshot();
        const byId = snapshot && snapshot.byId ? snapshot.byId : {};
        const ids = Array.isArray(snapshot && snapshot.ids) ? snapshot.ids : Object.keys(byId);
        for (const id of ids) {
          const row = byId[id];
          if (!row) continue;
          const retainedBy = row.retainedBy || {};
          rows.push({
            id: asStr(id),
            title: asStr(row.displayTitle || row.title || id),
            updatedAt: asNum(row.updatedAt, 0),
            running: row.running === true,
            blank: row.blank === true,
            mainView: asNum(retainedBy.mainView, 0) > 0,
            subagent: row.origin === 'subagent',
            parentId: asStr(row.parentId),
          });
        }
      } catch (error) { /* ignore */ }
      rows.sort((left, right) => right.updatedAt - left.updatedAt);
      return rows;
    }

    function computeSessionState(ctx) {
      const sessions = ctx && ctx.sessions ? ctx.sessions : undefined;
      let uiSession;
      try { uiSession = ctx && typeof ctx.get === 'function' ? ctx.get('uiSession') : undefined; } catch (error) { uiSession = undefined; }
      const rows = readSessionRows(sessions);
      const fromUiSession = readUiSessionId(uiSession);
      let autoId = fromUiSession;
      if (!autoId) {
        const mainRow = rows.find((row) => row.mainView);
        const latestRow = rows.find((row) => !row.subagent && !row.blank) || rows.find((row) => !row.subagent);
        autoId = (mainRow && mainRow.id) || (latestRow && latestRow.id) || '';
      }
      return { sessionId: autoId || '', rows, bound: !!fromUiSession };
    }

    function sameSessionState(left, right) {
      if (left.sessionId !== right.sessionId || left.bound !== right.bound) return false;
      if (left.rows.length !== right.rows.length) return false;
      for (let index = 0; index < left.rows.length; index += 1) {
        const a = left.rows[index];
        const b = right.rows[index];
        if (a.id !== b.id || a.updatedAt !== b.updatedAt || a.running !== b.running || a.mainView !== b.mainView || a.title !== b.title || a.blank !== b.blank) return false;
      }
      return true;
    }

    function useCurrentSession(ctx) {
      const [state, setState] = React.useState(() => computeSessionState(ctx));
      React.useEffect(() => {
        let alive = true;
        const disposers = [];
        let uiSession;
        try { uiSession = ctx && typeof ctx.get === 'function' ? ctx.get('uiSession') : undefined; } catch (error) { uiSession = undefined; }
        const recompute = () => {
          if (!alive) return;
          try {
            const next = computeSessionState(ctx);
            setState((previous) => (sameSessionState(previous, next) ? previous : next));
          } catch (error) {
            console.warn('[seedance] failed to read session list:', error);
          }
        };
        try {
          if (uiSession && uiSession.current && typeof uiSession.current.subscribe === 'function') {
            disposers.push(uiSession.current.subscribe(recompute));
          }
        } catch (error) { /* ignore */ }
        try {
          if (ctx && ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.subscribe === 'function') {
            disposers.push(ctx.sessions.list.subscribe(recompute));
          }
        } catch (error) { /* ignore */ }
        recompute();
        // 兜底轮询：个别环境下 retainInfo 变化不触发 list 订阅时也能跟上主视图切换
        const timer = setInterval(recompute, 3000);
        return () => {
          alive = false;
          clearInterval(timer);
          for (const dispose of disposers) {
            try { if (typeof dispose === 'function') dispose(); } catch (error) { /* ignore */ }
          }
        };
      }, [ctx]);
      return state;
    }

    // ==========================================================================
    // Deep link：?panel=seedance / ?seedance=1 / #seedance
    // ==========================================================================
    function matchesSeedanceDeepLink(locationLike) {
      try {
        const source = locationLike || (typeof location !== 'undefined' ? location : null);
        if (!source) return false;
        const href = asStr(source.href || source);
        let url;
        try { url = new URL(href, 'http://localhost'); } catch (error) { return false; }
        const panel = url.searchParams.get('panel');
        if (panel === PANEL_ID) return true;
        const flag = url.searchParams.get('seedance');
        if (flag === '1' || flag === 'true' || flag === '') return true;
        const hash = asStr(url.hash).replace(/^#\/?/, '').toLowerCase();
        if (hash === PANEL_ID || hash === 'video' || hash === 'seedance-studio') return true;
        if (hash.indexOf(PANEL_ID + '?') === 0 || hash.indexOf(PANEL_ID + '/') === 0) return true;
        return false;
      } catch (error) {
        return false;
      }
    }

    function openFromDeepLink(ctx) {
      let matched = false;
      try { matched = matchesSeedanceDeepLink(); } catch (error) { matched = false; }
      if (!matched) return;
      if (!ctx || !ctx.layout || typeof ctx.layout.selectPanel !== 'function') return;
      let attempts = 0;
      const attempt = () => {
        attempts += 1;
        try {
          ctx.layout.selectPanel(PANEL_ID);
          return;
        } catch (error) {
          // main 面板注册可能晚于 apply；重试有限次
          if (attempts < 8) setTimeout(attempt, Math.min(2000, 150 * attempts * attempts));
        }
      };
      setTimeout(attempt, 0);
    }

    /** Error code → localized hint (models-ui-matrix.md §6.2). */
    function humanizeError(error) {
      const code = asStr(error && error.code);
      const message = asStr(error && error.message);
      const table = [
        [{ pattern: /Authentication|InvalidApiKey|Unauthorized/i }, 'errors.apiKeyInvalid'],
        [{ pattern: /ServiceNotOpen|ModelNotOpen/i }, 'errors.modelNotOpen'],
        [{ pattern: /InvalidEndpointOrModel|ModelNotFound/i }, 'errors.modelNotFound'],
        [{ pattern: /TaskTypeConstraint|InvalidParameter/i }, 'errors.paramConstraint'],
        [{ pattern: /SensitiveContent/i }, 'errors.sensitive'],
        [{ pattern: /PrivacyInformation/i }, 'errors.privacy'],
        [{ pattern: /PolicyViolation/i }, 'errors.policy'],
        [{ pattern: /RateLimit|ConcurrentRequests|RequestBurst/i }, 'errors.rateLimit'],
        [{ pattern: /AccountOverdue|QuotaExceeded/i }, 'errors.overdue'],
        [{ pattern: /InternalService|InternalServer|5\d\d/i }, 'errors.internal'],
      ];
      for (const [matcher, textKey] of table) if (matcher.pattern.test(code)) return message || translate(textKey);
      return message || (code ? translate('errors.requestFailedCode', { code }) : translate('errors.requestFailed'));
    }

    function recordIsActive(record) {
      return !!record && (record.status === 'queued' || record.status === 'running');
    }
    function recordIsDraft(record) {
      if (!record) return false;
      const params = record.params || {};
      const meta = record.meta || {};
      return record.mode === 'draft' || params.draft === true || meta.draft === true;
    }
    function recordCanPlay(record) {
      if (!record || record.status !== 'succeeded') return false;
      return !!(record.files && (record.files.video || record.files.poster)) || !!record.remoteVideoUrl || true;
    }
    function recordPoster(record) {
      if (!record) return '';
      const files = record.files || {};
      return files.poster ? mediaUrl(record.id, 'poster') : '';
    }
    function recordVideoSrc(record) {
      if (!record) return '';
      const files = record.files || {};
      if (files.video) return mediaUrl(record.id, 'video');
      return record.remoteVideoUrl || mediaUrl(record.id, 'video');
    }
    // ==========================================================================
    // Toast
    // ==========================================================================
    function useToasts() {
      const [toasts, setToasts] = React.useState([]);
      const push = React.useCallback((kind, message, holdMs) => {
        const text = asStr(message);
        if (!text) return;
        const id = 'sd_toast_' + safeNow() + '_' + Math.random().toString(36).slice(2, 7);
        setToasts((previous) => previous.concat([{ id, kind: kind || 'info', message: text, holdMs: asNum(holdMs, 4200) }]).slice(-4));
      }, []);
      const dismiss = React.useCallback((id) => {
        setToasts((previous) => previous.filter((toast) => toast.id !== id));
      }, []);
      return {
        toasts,
        dismiss,
        push,
        success: (message) => push('success', message),
        error: (message) => push('error', message),
        info: (message) => push('info', message),
      };
    }

    // ==========================================================================
    // 语言订阅：宿主 locale 切换时触发重渲染（translate() 本身实时读取宿主字典）
    // ==========================================================================
    function useLocaleVersion(ctx) {
      const [version, setVersion] = React.useState(0);
      React.useEffect(() => {
        const locale = ctx && ctx.locale;
        if (!locale || typeof locale.subscribe !== 'function') return undefined;
        let disposed = false;
        let unsubscribe = null;
        try {
          unsubscribe = locale.subscribe(() => {
            if (!disposed) setVersion((value) => value + 1);
          });
        } catch (error) { /* 宿主不支持订阅时保持静态 */ }
        return () => {
          disposed = true;
          if (typeof unsubscribe === 'function') {
            try { unsubscribe(); } catch (error) { /* ignore */ }
          }
        };
      }, [ctx]);
      return version;
    }
    // ==========================================================================
    // 对话联动：跳到会话 / 把视频记录发送给左侧对话里的智能体继续分析优化
    // ==========================================================================
    function resolveChatService(ctx, name) {
      try { return ctx && typeof ctx.get === 'function' ? ctx.get(name) : undefined; } catch (error) { return undefined; }
    }

    /** 切到指定会话的对话视图（左侧会话列表联动）；成功返回 true。 */
    function openSessionChat(ctx, sessionId) {
      const target = asStr(sessionId);
      if (!target) return false;
      let opened = false;
      try {
        const workspace = resolveChatService(ctx, 'uiWorkspace');
        if (workspace && typeof workspace.openSession === 'function') {
          workspace.openSession(target);
          opened = true;
        }
      } catch (error) { /* ignore */ }
      try {
        const layout = (ctx && ctx.layout) || resolveChatService(ctx, 'layout');
        if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(null);
      } catch (error) { /* ignore */ }
      return opened;
    }

    /** 会话作用域里的 conversation 服务（用于把消息发进对话）。 */
    function conversationFor(ctx, sessionId) {
      const target = asStr(sessionId);
      if (target) {
        try {
          const sessions = resolveChatService(ctx, 'sessions');
          if (sessions && typeof sessions.scope === 'function') {
            const scoped = sessions.scope(target);
            if (scoped && typeof scoped.get === 'function') {
              const conversation = scoped.get('conversation');
              if (conversation && typeof conversation.send === 'function') return conversation;
            }
          }
        } catch (error) { /* ignore */ }
      }
      const fallback = resolveChatService(ctx, 'conversation');
      return fallback && typeof fallback.send === 'function' ? fallback : null;
    }

    /** 等待会话绑定出现（openSession 是异步的；最多等 timeoutMs）。 */
    async function waitConversation(ctx, sessionId, timeoutMs) {
      const deadline = safeNow() + Math.max(0, timeoutMs || 0);
      let conversation = conversationFor(ctx, sessionId);
      while (!conversation && safeNow() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        conversation = conversationFor(ctx, sessionId);
      }
      return conversation;
    }

    /** 一条视频记录发给智能体的「继续分析并优化」消息（含任务 id 与关键参数）。 */
    function buildRecordChatMessage(record) {
      const item = record || {};
      return translate('chat.continueMessage', {
        id: asStr(item.id) || '-',
        status: asStr(item.status) || '-',
        mode: asStr(item.mode) || '-',
        model: asStr(item.model) || '-',
        prompt: asStr(item.prompt) || '-',
        video: asStr(item.remoteVideoUrl) || '-',
      });
    }

    /** 把记录摘要发送到指定会话的对话（会话未打开时先打开再重试一次）。 */
    async function sendRecordToChat(ctx, sessionId, record) {
      const target = asStr(sessionId) || asStr(record && record.sessionId);
      if (!target) throw new Error('seedance chat: no target session');
      const text = buildRecordChatMessage(record);
      let conversation = conversationFor(ctx, target);
      if (conversation) {
        try { await conversation.send(text); return true; } catch (error) { /* 会话未绑定：打开后重试 */ }
      }
      openSessionChat(ctx, target);
      conversation = await waitConversation(ctx, target, 2500);
      if (!conversation) throw new Error('seedance chat: conversation unavailable');
      await conversation.send(text);
      return true;
    }

    // ==========================================================================
    // 样式补充（组件所需样式；主样式见 CSS）
    // ==========================================================================
    const CSS_EXTRA = String.raw`
      .dsh-sd-header { min-height: 56px; }
      .dsh-sd-gallery-head .dsh-sd-gallery-title .dsh-sd-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sd-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sd-success) 18%, transparent); }
      .dsh-sd-gallery-head .dsh-sd-gallery-title .dsh-sd-live-dot[data-idle='true'] { background: var(--sd-text-3); box-shadow: none; }
      .dsh-sd-queue { margin-bottom: 14px; padding: 10px 12px; border-radius: var(--sd-radius-lg); border: 1px solid var(--sd-border-1); background: color-mix(in srgb, var(--sd-layer-2) 62%, transparent); }
      .dsh-sd-queue-percent { flex: none; font-size: 10.5px; font-variant-numeric: tabular-nums; color: var(--sd-text-2); margin-left: 6px; }
.dsh-sd-queue-title { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--sd-text-2); margin-bottom: 8px; }
      .dsh-sd-queue-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
      .dsh-sd-queue-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--sd-radius-md); background: color-mix(in srgb, var(--sd-layer-1) 82%, transparent); border: 1px solid var(--sd-border-1); min-width: 0; }
      .dsh-sd-queue-item .bar { flex: 1 1 auto; height: 4px; border-radius: 999px; background: var(--sd-layer-3); overflow: hidden; min-width: 40px; }
      .dsh-sd-queue-item .bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--sd-accent), var(--sd-accent-2)); transition: width 0.5s ease; }
      .dsh-sd-queue-item .txt { font-size: 11px; color: var(--sd-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 42%; }
      .dsh-sd-submodes { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
      .dsh-sd-warnline { margin-top: 7px; display: flex; align-items: flex-start; gap: 6px; font-size: 11px; line-height: 1.55; color: var(--sd-warn); }
      .dsh-sd-warnline[data-kind='error'] { color: var(--sd-error); }
      .dsh-sd-warnline[data-kind='muted'] { color: var(--sd-text-3); }
      .dsh-sd-material-empty { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: var(--sd-radius-lg); border: 1px dashed var(--sd-border-2); color: var(--sd-text-3); font-size: 12px; background: color-mix(in srgb, var(--sd-layer-2) 40%, transparent); }
      .dsh-sd-material-empty .grow { flex: 1 1 auto; }
      .dsh-sd-material-tip { margin-top: 7px; font-size: 10.5px; line-height: 1.55; color: var(--sd-text-3); }
      .dsh-sd-custom-model { margin-top: 7px; }
      .dsh-sd-duration-line { display: flex; align-items: center; gap: 8px; }
      .dsh-sd-duration-line .dsh-sd-range { flex: 1 1 auto; }
      .dsh-sd-adv-toggle { display: inline-flex; align-items: center; gap: 6px; border: none; background: transparent; color: var(--sd-text-3); cursor: pointer; font-size: 11.5px; padding: 2px 0; }
      .dsh-sd-adv-toggle:hover { color: var(--sd-text-1); }
      .dsh-sd-adv-toggle:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--sd-accent)); outline-offset: 2px; border-radius: 4px; }
      .dsh-sd-adv { margin-top: 8px; padding: 10px 11px; border-radius: var(--sd-radius-lg); border: 1px solid var(--sd-border-1); background: color-mix(in srgb, var(--sd-layer-2) 48%, transparent); display: flex; flex-direction: column; gap: 9px; }
      .dsh-sd-adv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
      .dsh-sd-seed-line { display: flex; gap: 6px; }
      .dsh-sd-seed-line .dsh-sd-input { flex: 1 1 auto; }
      .dsh-sd-seed-line .dsh-sd-iconbtn { flex: none; }
      .dsh-sd-cost { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; padding-top: 9px; border-top: 1px dashed var(--sd-border-1); font-size: 11px; color: var(--sd-text-3); flex-wrap: wrap; }
      .dsh-sd-cost b { color: var(--sd-text-2); font-weight: 600; }
      .dsh-sd-cost .demo { color: var(--sd-warn); }
      .dsh-sd-card-draft-actions { display: flex; gap: 4px; margin-top: 1px; }
      .dsh-sd-card-draft-actions .dsh-sd-iconbtn { height: 26px; font-size: 11px; }
      .dsh-sd-way-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .dsh-sd-way { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 9px 11px; border-radius: var(--sd-radius-md); border: 1px solid var(--sd-border-1); background: color-mix(in srgb, var(--sd-layer-2) 62%, transparent); color: var(--sd-text-2); cursor: pointer; font-size: 12px; transition: all 0.15s ease; }
      .dsh-sd-way:hover { border-color: var(--sd-border-2); background: var(--sd-hover); }
      .dsh-sd-way small { color: var(--sd-text-3); font-size: 10.5px; }
      .dsh-sd-way[data-active='true'] { border-color: color-mix(in srgb, var(--sd-accent) 66%, transparent); background: color-mix(in srgb, var(--sd-accent) 12%, transparent); color: var(--sd-text-1); }
      .dsh-sd-way[data-active='true'] small { color: color-mix(in srgb, var(--sd-accent) 60%, var(--sd-text-2)); }
      .dsh-sd-way:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--sd-accent)); outline-offset: 1px; }
      .dsh-sd-frame-tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .dsh-sd-frame-timeline { display: flex; align-items: center; gap: 8px; }
      .dsh-sd-frame-timeline .dsh-sd-range { flex: 1 1 auto; }
      .dsh-sd-split { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 14px; }
      .dsh-sd-pick-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
      .dsh-sd-pick-item { border-radius: var(--sd-radius-md); border: 1px solid var(--sd-border-1); overflow: hidden; background: var(--sd-layer-2); }
      .dsh-sd-pick-item video, .dsh-sd-pick-item img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; background: var(--sd-bg); }
      .dsh-sd-pick-item .cap { padding: 7px 9px; font-size: 11px; color: var(--sd-text-3); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .dsh-sd-pick-item .row { display: flex; padding: 0 9px 8px; }
      .dsh-sd-pick-item .dsh-sd-iconbtn { height: 24px; font-size: 11px; width: 100%; }
      .dsh-sd-kbd-hint { display: inline-flex; align-items: center; gap: 4px; }
      .dsh-sd-steps { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--sd-text-3); }
      .dsh-sd-linkbtn { border: none; background: transparent; color: color-mix(in srgb, var(--sd-accent) 78%, var(--sd-text-2)); cursor: pointer; font-size: 12px; padding: 0; }
      .dsh-sd-linkbtn:hover { text-decoration: underline; }
      .dsh-sd-linkbtn:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--sd-accent)); outline-offset: 2px; border-radius: 4px; }
      .dsh-sd-section-tight { margin-bottom: 11px; }
    `;

    // ==========================================================================
    // 内联 SVG 图标
    // ==========================================================================
    const ICON_PATHS = {
      film: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }], ['path', { d: 'M3 9h18M3 15h18M8 4v16M16 4v16' }]],
      text: [['path', { d: 'M4 6h16M4 12h11M4 18h14' }]],
      image: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }], ['circle', { cx: 8.5, cy: 9.5, r: 1.6 }], ['path', { d: 'M3 16.5l5-5 4 4 3-2.5 6 4.5' }]],
      frames: [['rect', { x: 3, y: 3, width: 13, height: 13, rx: 2 }], ['rect', { x: 8, y: 8, width: 13, height: 13, rx: 2 }]],
      layers: [['path', { d: 'M12 3l9 5-9 5-9-5 9-5z' }], ['path', { d: 'M3 13l9 5 9-5' }]],
      edit: [['path', { d: 'M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z' }], ['path', { d: 'M13.5 6.5l4 4' }]],
      extend: [['path', { d: 'M4 12h16M15 7l5 5-5 5' }]],
      draft: [['path', { d: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z' }], ['path', { d: 'M18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z' }]],
      play: [['path', { d: 'M8 5.5v13l11-6.5-11-6.5z' }]],
      download: [['path', { d: 'M12 4v11' }], ['path', { d: 'M7.5 10.5L12 15l4.5-4.5' }], ['path', { d: 'M4.5 19.5h15' }]],
      recreate: [['path', { d: 'M4.5 10a7.5 7.5 0 0 1 13-3.5L20 9' }], ['path', { d: 'M20 4v5h-5' }], ['path', { d: 'M19.5 14a7.5 7.5 0 0 1-13 3.5L4 15' }], ['path', { d: 'M4 20v-5h5' }]],
      settings: [['circle', { cx: 12, cy: 12, r: 3.2 }], ['path', { d: 'M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6' }]],
      refresh: [['path', { d: 'M20 11a8 8 0 1 0-2.3 6.7' }], ['path', { d: 'M20 4.5V11h-6.5' }]],
      close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
      check: [['path', { d: 'M4.5 12.5l5 5 10-11' }]],
      warning: [['path', { d: 'M12 4l9 16H3l9-16z' }], ['path', { d: 'M12 9.5v4.5M12 17.2v.3' }]],
      info: [['circle', { cx: 12, cy: 12, r: 8.6 }], ['path', { d: 'M12 11v5.2M12 7.8v.3' }]],
      plus: [['path', { d: 'M12 5v14M5 12h14' }]],
      trash: [['path', { d: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13' }], ['path', { d: 'M10 10.5v6M14 10.5v6' }]],
      copy: [['rect', { x: 8.5, y: 8.5, width: 12, height: 12, rx: 2 }], ['path', { d: 'M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5' }]],
      external: [['path', { d: 'M13 5h6v6' }], ['path', { d: 'M19 5l-8 8' }], ['path', { d: 'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4' }]],
      clock: [['circle', { cx: 12, cy: 12, r: 8.6 }], ['path', { d: 'M12 7.5V12l3.2 2' }]],
      upload: [['path', { d: 'M12 16V5M7.5 9.5L12 5l4.5 4.5' }], ['path', { d: 'M4.5 19.5h15' }]],
      video: [['rect', { x: 3, y: 6, width: 12.5, height: 12, rx: 2.5 }], ['path', { d: 'M15.5 10.5l5-2.8v8.6l-5-2.8v-3z' }]],
      audio: [['path', { d: 'M9 18V6l9-2v12' }], ['circle', { cx: 6.5, cy: 18, r: 2.5 }], ['circle', { cx: 15.5, cy: 16, r: 2.5 }]],
      dots: [['circle', { cx: 6, cy: 12, r: 1.5 }], ['circle', { cx: 12, cy: 12, r: 1.5 }], ['circle', { cx: 18, cy: 12, r: 1.5 }]],
      chevronDown: [['path', { d: 'M6 9.5l6 6 6-6' }]],
      chevronRight: [['path', { d: 'M9.5 6l6 6-6 6' }]],
      sparkles: [['path', { d: 'M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z' }], ['path', { d: 'M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z' }]],
      stop: [['circle', { cx: 12, cy: 12, r: 8.6 }], ['path', { d: 'M9 9h6v6H9z' }]],
      zoom: [['circle', { cx: 11, cy: 11, r: 6.5 }], ['path', { d: 'M16 16l4.5 4.5' }]],
      framesPick: [['rect', { x: 3.5, y: 4, width: 17, height: 16, rx: 2 }], ['path', { d: 'M3.5 15l4.5-4.5 4 4 3-3 5.5 5' }]],
      message: [['path', { d: 'M4.5 5.5h15v10h-9.5l-3.5 3v-3h-2v-10z' }]],
    };

    function Icon(props) {
      const size = props.size || 16;
      const items = ICON_PATHS[props.name] || [];
      const children = items.map((item, index) => h(item[0], Object.assign({ key: index }, item[1])));
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: props.strokeWidth || 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        className: props.className,
        style: props.style,
      }, children);
    }

    // ==========================================================================
    // 基础控件
    // ==========================================================================
    function Spinner(props) {
      return h('span', { className: 'dsh-sd-spinner', role: 'status', 'aria-label': props && props.label ? props.label : translate('common.loading') });
    }

    function Badge(props) {
      return h('span', {
        className: 'dsh-sd-badge' + (props.className ? ' ' + props.className : ''),
        'data-tone': props.tone || 'plain',
        title: props.title,
      }, props.icon ? h(Icon, { name: props.icon, size: 11 }) : null, props.children);
    }

    function StatusBadge(props) {
      const record = props.record;
      const meta = statusMeta(record);
      const active = record && (record.status === 'queued' || record.status === 'running');
      return h('span', {
        className: 'dsh-sd-badge',
        'data-tone': meta.tone,
        'data-status': meta.label,
      }, active ? h('span', { className: 'dsh-sd-pulse-dot' }) : null, meta.label);
    }

    function IconButton(props) {
      return h('button', {
        type: 'button',
        className: 'dsh-sd-iconbtn',
        title: props.title || props.label,
        'aria-label': props.label || props.title,
        onClick: props.onClick,
        disabled: props.disabled === true,
        'data-variant': props.variant || undefined,
        'data-testid': props.testid || undefined,
        'data-seedance-action': props.hook || undefined,
        style: props.style,
      }, props.icon ? h(Icon, { name: props.icon, size: props.iconSize || 15 }) : null, props.children || null);
    }

    function Switch(props) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': props.checked === true,
        'aria-label': props.ariaLabel || props.label,
        className: 'dsh-sd-switch',
        'data-on': props.checked === true,
        disabled: props.disabled === true,
        onClick: () => { if (!props.disabled && typeof props.onChange === 'function') props.onChange(!props.checked); },
        'data-testid': props.testid || undefined,
        'data-seedance-toggle': props.hook || undefined,
      });
    }

    function SwitchRow(props) {
      return h('div', { className: 'dsh-sd-switchrow' },
        h('span', { className: 'dsh-sd-switchrow-label' }, props.label, props.hint ? h('small', null, props.hint) : null),
        h(Switch, {
          checked: props.checked,
          onChange: props.onChange,
          disabled: props.disabled,
          ariaLabel: props.label,
          testid: props.testid,
          hook: props.hook,
        }),
      );
    }

    function Segmented(props) {
      const options = props.options || [];
      return h('div', {
        className: 'dsh-sd-seg' + (props.className ? ' ' + props.className : ''),
        'data-size': props.size || undefined,
        role: 'group',
        'aria-label': props.label,
      }, options.map((option) => h('button', {
        key: option.value,
        type: 'button',
        'data-active': option.value === props.value,
        disabled: props.disabled === true || option.disabled === true,
        title: option.title,
        onClick: () => { if (typeof props.onChange === 'function') props.onChange(option.value); },
        'data-testid': props.testid ? props.testid + '-' + option.value : undefined,
        'data-seedance-control': props.hook || undefined,
        'data-value': option.value,
      }, option.label)));
    }

    function Field(props) {
      return h('div', {
        className: 'dsh-sd-field' + (props.className ? ' ' + props.className : ''),
        style: props.span2 ? { gridColumn: 'span 2' } : undefined,
      },
        h('span', { className: 'dsh-sd-field-label' }, props.label, props.hint ? h('span', { className: 'dsh-sd-section-hint' }, props.hint) : null),
        props.children,
      );
    }

    function HintLine(props) {
      if (!props.children) return null;
      return h('div', { className: 'dsh-sd-warnline', 'data-kind': props.kind || 'muted', role: props.role || undefined },
        props.kind === 'error' ? h(Icon, { name: 'warning', size: 13 }) : null,
        h('span', null, props.children),
      );
    }

    // ==========================================================================
    // 提示词
    // ==========================================================================
    function PromptField(props) {
      const value = asStr(props.value);
      const tooLong = value.length > 500;
      return h('div', { className: 'dsh-sd-section' },
        h('div', { className: 'dsh-sd-section-head' },
          h('span', { className: 'dsh-sd-section-title' }, translate('inputs.label')),
          h('span', { className: 'dsh-sd-section-hint' }, translate('inputs.hint')),
        ),
        h('div', { className: 'dsh-sd-prompt-wrap' },
          h('textarea', {
            className: 'dsh-sd-prompt',
            value,
            placeholder: translate('inputs.placeholder'),
            maxLength: MAX_PROMPT_CHARS,
            onChange: (event) => props.onChange(event.target.value),
            onKeyDown: (event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                if (typeof props.onSubmit === 'function') props.onSubmit();
              }
            },
            'aria-label': translate('inputs.aria'),
            'data-testid': 'sd-prompt',
            'data-seedance-prompt': '',
          }),
          h('span', { className: 'dsh-sd-prompt-count', 'data-testid': 'sd-prompt-count', style: tooLong ? { color: 'var(--sd-warn)' } : undefined }, value.length + ' / ' + MAX_PROMPT_CHARS),
        ),
        tooLong ? h(HintLine, { kind: 'muted' }, translate('inputs.tooLong', { count: value.length })) : null,
        h('div', { className: 'dsh-sd-chips' },
          PROMPT_TEMPLATES.map((template) => h('button', {
            key: template.label,
            type: 'button',
            className: 'dsh-sd-chip',
            onClick: () => props.onChange(translate(template.text)),
            'data-testid': 'sd-prompt-template',
          }, translate(template.label))),
        ),
      );
    }

    // ==========================================================================
    // 图片 / 音频上传控件
    // ==========================================================================
    function ImageDrop(props) {
      const inputRef = React.useRef(null);
      const dragState = React.useState(false);
      const busyState = React.useState(false);
      const drag = dragState[0];
      const setDrag = dragState[1];
      const busy = busyState[0];
      const setBusy = busyState[1];
      const value = props.value || null;
      const handleFiles = async (files) => {
        const file = files && files[0];
        if (!file) return;
        setBusy(true);
        try {
          const asset = await imageFileToAsset(file);
          if (typeof props.onChange === 'function') props.onChange(asset);
        } catch (error) {
          if (typeof props.onError === 'function') props.onError(error && error.message ? error.message : translate('inputs.imageReadError'));
        } finally {
          setBusy(false);
        }
      };
      return h('div', {
        className: 'dsh-sd-drop',
        'data-filled': !!value,
        'data-drag': drag,
        'data-testid': props.testid || 'sd-upload',
        'data-seedance-upload': props.hook || undefined,
        role: 'button',
        tabIndex: 0,
        'aria-label': props.label,
        onClick: () => { if (!props.disabled && inputRef.current) inputRef.current.click(); },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!props.disabled && inputRef.current) inputRef.current.click();
          }
        },
        onDragOver: (event) => { event.preventDefault(); if (!props.disabled) setDrag(true); },
        onDragLeave: () => setDrag(false),
        onDrop: (event) => {
          event.preventDefault();
          setDrag(false);
          if (!props.disabled) handleFiles(event.dataTransfer && event.dataTransfer.files);
        },
      },
        h('input', {
          ref: inputRef,
          type: 'file',
          accept: 'image/*',
          onChange: (event) => {
            handleFiles(event.target.files);
            try { event.target.value = ''; } catch (error) { /* ignore */ }
          },
          disabled: props.disabled,
        }),
        busy ? h(Spinner, { label: translate('common.processing') }) : value
          ? h(React.Fragment, null,
              h('img', { src: value.dataUrl, alt: props.label }),
              h('span', { className: 'dsh-sd-drop-role' }, props.roleLabel || props.label),
              h('button', {
                type: 'button',
                className: 'dsh-sd-drop-remove',
                'aria-label': translate('inputs.remove') + ' ' + props.label,
                onClick: (event) => {
                  event.stopPropagation();
                  if (typeof props.onChange === 'function') props.onChange(null);
                },
              }, h(Icon, { name: 'close', size: 11 })),
            )
          : h(React.Fragment, null,
              h(Icon, { name: props.icon || 'upload', size: 18 }),
              h('span', null, props.label),
              props.hint ? h('span', { style: { fontSize: '10px', opacity: 0.8 } }, props.hint) : null,
            ),
      );
    }

    function AudioDrop(props) {
      const inputRef = React.useRef(null);
      const busyState = React.useState(false);
      const busy = busyState[0];
      const setBusy = busyState[1];
      const value = props.value || null;
      const handleFiles = async (files) => {
        const file = files && files[0];
        if (!file) return;
        setBusy(true);
        try {
          const asset = await audioFileToAsset(file);
          if (typeof props.onChange === 'function') props.onChange(asset);
        } catch (error) {
          if (typeof props.onError === 'function') props.onError(error && error.message ? error.message : translate('inputs.audioReadError'));
        } finally {
          setBusy(false);
        }
      };
      return h('div', {
        className: 'dsh-sd-drop',
        'data-filled': !!value,
        role: 'button',
        tabIndex: 0,
        'aria-label': translate('inputs.uploadAudio'),
        'data-testid': 'sd-upload-audio',
        'data-seedance-upload': 'audio',
        onClick: () => { if (!props.disabled && inputRef.current) inputRef.current.click(); },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!props.disabled && inputRef.current) inputRef.current.click();
          }
        },
      },
        h('input', {
          ref: inputRef,
          type: 'file',
          accept: 'audio/*',
          onChange: (event) => {
            handleFiles(event.target.files);
            try { event.target.value = ''; } catch (error) { /* ignore */ }
          },
          disabled: props.disabled,
        }),
        busy ? h(Spinner, { label: translate('common.processing') }) : value
          ? h(React.Fragment, null,
              h(Icon, { name: 'audio', size: 20 }),
              h('span', { style: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, value.name),
              h('button', {
                type: 'button',
                className: 'dsh-sd-drop-remove',
                'aria-label': translate('inputs.removeAudio'),
                onClick: (event) => {
                  event.stopPropagation();
                  if (typeof props.onChange === 'function') props.onChange(null);
                },
              }, h(Icon, { name: 'close', size: 11 })),
            )
          : h(React.Fragment, null, h(Icon, { name: 'audio', size: 18 }), h('span', null, translate('inputs.uploadAudio')), h('span', { style: { fontSize: '10px', opacity: 0.8 } }, 'wav / mp3')),
      );
    }
    // ==========================================================================
    // 参考素材面板（按模式变化）
    // ==========================================================================
    function MaterialPanel(props) {
      const form = props.form;
      const model = props.model;
      const constraints = props.constraints;
      const assets = form.assets || {};
      const patchAssets = (patch) => props.onPatch({ assets: Object.assign({}, assets, patch) });
      const mode = form.mode;
      const tip = h('div', { className: 'dsh-sd-material-tip' }, translate('material.tip'));

      const firstSlot = h(ImageDrop, {
        value: assets.first,
        onChange: (asset) => patchAssets({ first: asset }),
        label: mode === 'firstlast' ? translate('material.addFirst') : translate('material.addFirstImage'),
        roleLabel: translate('material.firstRole'),
        icon: 'image',
        disabled: props.disabled,
        testid: 'sd-upload-first',
        hook: 'first-frame',
        onError: props.onError,
      });

      const lastSlot = h(ImageDrop, {
        value: assets.last,
        onChange: (asset) => patchAssets({ last: asset }),
        label: translate('material.addLast'),
        roleLabel: translate('material.lastRole'),
        icon: 'image',
        disabled: props.disabled,
        testid: 'sd-upload-last',
        hook: 'last-frame',
        onError: props.onError,
      });

      const videoRow = (showPick) => h('div', { className: 'dsh-sd-rows' },
        h('div', { className: 'dsh-sd-row' },
          h('span', { className: 'dsh-sd-row-label' }, translate('material.video')),
          h('div', { className: 'dsh-sd-row-main' },
            h('input', {
              className: 'dsh-sd-input',
              type: 'text',
              value: assets.videoUrl || '',
              placeholder: translate('material.videoPlaceholder'),
              onChange: (event) => patchAssets({ videoUrl: event.target.value }),
              disabled: props.disabled,
              'aria-label': translate('material.videoAria'),
              'data-testid': 'sd-video-url',
              'data-seedance-input': 'video-url',
            }),
          ),
        ),
        showPick ? h('div', { className: 'dsh-sd-row' },
          h('span', { className: 'dsh-sd-row-label' }, ''),
          h('div', { className: 'dsh-sd-row-main' },
            h('button', { type: 'button', className: 'dsh-sd-linkbtn', onClick: () => props.onPickHistoryVideo(), 'data-testid': 'sd-video-from-history' }, translate('material.fromHistory')),
          ),
        ) : null,
      );

      let body = null;
      if (mode === 'text2video' || mode === 'draft') {
        body = h('div', { className: 'dsh-sd-material-empty' },
          h(Icon, { name: mode === 'draft' ? 'draft' : 'sparkles', size: 16 }),
          h('span', { className: 'grow' }, mode === 'draft' ? translate('material.draftTip') : translate('material.textTip')),
        );
      } else if (mode === 'image2video') {
        body = h('div', { className: 'dsh-sd-dropgrid' }, h('div', { style: { gridColumn: 'span 2' } }, firstSlot));
      } else if (mode === 'firstlast') {
        body = h('div', { className: 'dsh-sd-dropgrid' }, h('div', null, firstSlot), h('div', null, lastSlot));
      } else if (mode === 'reference') {
        const maxImages = Math.max(1, constraints.maxImages || model.maxImages || 9);
        const refs = assets.refs || [];
        body = h(React.Fragment, null,
          h('div', { className: 'dsh-sd-dropgrid' },
            refs.map((item, index) => h(ImageDrop, {
              key: item.id || index,
              value: item,
              onChange: (asset) => {
                const next = refs.slice();
                if (asset) next[index] = asset;
                else next.splice(index, 1);
                patchAssets({ refs: next });
              },
              label: translate('material.refImage', { index: index + 1 }),
              roleLabel: translate('material.refImage', { index: index + 1 }),
              icon: 'image',
              disabled: props.disabled,
              testid: 'sd-upload-ref-' + index,
              hook: 'reference-image',
              onError: props.onError,
            })),
            refs.length < maxImages ? h('div', null, h(ImageDrop, {
              value: null,
              onChange: (asset) => patchAssets({ refs: refs.concat([asset]) }),
              label: translate('material.addRef'),
              hint: refs.length + ' / ' + maxImages,
              icon: 'plus',
              disabled: props.disabled,
              testid: 'sd-upload-ref-add',
              hook: 'reference-image-add',
              onError: props.onError,
            })) : null,
          ),
          h('div', { style: { height: '9px' } }),
          videoRow(true),
          h('div', { style: { height: '9px' } }),
          h('div', { className: 'dsh-sd-dropgrid' }, h('div', null, h(AudioDrop, {
            value: assets.audio,
            onChange: (asset) => patchAssets({ audio: asset }),
            disabled: props.disabled,
            onError: props.onError,
          }))),
          model && model.family === '2.0' ? h(HintLine, { kind: 'muted' }, translate('material.audioNote20')) : null,
        );
      } else if (mode === 'edit') {
        const subMode = form.subMode === 'extend' ? 'extend' : 'edit';
        body = h(React.Fragment, null,
          h('div', { className: 'dsh-sd-submodes' }, h(Segmented, {
            value: subMode,
            options: [{ value: 'edit', label: translate('material.edit') }, { value: 'extend', label: translate('material.extend') }],
            onChange: (next) => props.onSubModeChange(next),
            label: translate('material.editOrExtend'),
            size: 'sm',
            testid: 'sd-edit-submode',
            hook: 'edit-submode',
          })),
          h('div', { style: { height: '9px' } }),
          videoRow(true),
          h(HintLine, { kind: 'muted' }, subMode === 'extend'
            ? translate('material.extendTip')
            : translate('material.editTip')),
        );
      }
      return h('div', { className: 'dsh-sd-section', 'data-seedance-material': mode },
        h('div', { className: 'dsh-sd-section-head' },
          h('span', { className: 'dsh-sd-section-title' }, translate('material.sectionTitle')),
          h('span', { className: 'dsh-sd-section-hint' }, mode === 'text2video' || mode === 'draft' ? translate('common.optional') : translate('common.byMode')),
        ),
        body,
        tip,
      );
    }
    // ==========================================================================
    // 参数面板
    // ==========================================================================
    function ParamsPanel(props) {
      const form = props.form;
      const models = props.models;
      const model = props.model;
      const constraints = props.constraints;
      const params = form.params;
      const advancedState = React.useState(false);
      const advancedOpen = advancedState[0];
      const setAdvancedOpen = advancedState[1];
      const custom = props.customModel || '';
      const patchParams = (patch) => props.onPatch({ params: Object.assign({}, params, patch) });
      const modelOptions = (models || []).map((item) => ({
        value: item.id,
        label: item.label + (item.deprecated ? translate('params.deprecated') : ''),
      }));
      modelOptions.push({ value: '__custom__', label: translate('params.customModelOption') });
      const modelSelectValue = modelOptions.some((option) => option.value === form.modelId) && !custom ? form.modelId : '__custom__';
      const showCustom = modelSelectValue === '__custom__' || !!custom;
      const durationValue = params.autoDuration ? (model && model.autoDuration ? -1 : asNum(model && model.defaultDuration, 5)) : asNum(params.duration, 5);
      const minDuration = model ? model.durations[0] : 4;
      const maxDuration = model ? model.durations[1] : 15;
      const estimate = props.estimate;
      const audioSupported = constraints.showAudio;
      const resolutionOptions = (constraints.resolutions || []).map((value) => ({ value, label: value }));
      const ratioOptions = RATIO_OPTIONS.filter((option) => (constraints.ratios || []).indexOf(option.value) !== -1);
      const showRatioLocked = constraints.lockRatio && (constraints.ratios || []).length <= 1;

      return h('div', { className: 'dsh-sd-section', 'data-seedance-params': '' },
        h('div', { className: 'dsh-sd-section-head' },
          h('span', { className: 'dsh-sd-section-title' }, translate('params.title')),
          props.demo ? h('span', { className: 'dsh-sd-section-hint', style: { color: 'var(--sd-warn)' } }, translate('status.demo')) : null,
        ),
        h('div', { className: 'dsh-sd-rows' },
          h(Field, { label: translate('params.model') },
            h('select', {
              className: 'dsh-sd-select',
              value: modelSelectValue,
              onChange: (event) => props.onSelectModel(event.target.value),
              disabled: props.disabled,
              'aria-label': translate('params.modelAria'),
              'data-testid': 'sd-model',
              'data-seedance-control': 'model',
            }, modelOptions.map((option) => h('option', { key: option.value, value: option.value }, option.label))),
            showCustom ? h('div', { className: 'dsh-sd-custom-model' },
              h('input', {
                className: 'dsh-sd-input',
                type: 'text',
                value: custom,
                placeholder: translate('params.customModelPlaceholder'),
                onChange: (event) => props.onCustomModelChange(event.target.value),
                disabled: props.disabled,
                'aria-label': translate('params.customModelAria'),
                'data-testid': 'sd-custom-model',
              }),
            ) : null,
            model && (model.noteKey || model.notes) ? h('div', { className: 'dsh-sd-material-tip' }, modelNote(model)) : null,
          ),
          h('div', { className: 'dsh-sd-params' },
            h(Field, { label: translate('params.resolution') },
              h(Segmented, {
                value: params.resolution,
                options: resolutionOptions,
                onChange: (value) => patchParams({ resolution: value }),
                disabled: props.disabled || constraints.draftMode,
                label: translate('params.resolution'),
                testid: 'sd-resolution',
                hook: 'resolution',
              }),
            ),
            h(Field, { label: translate('params.ratio') },
              showRatioLocked
                ? h('div', { className: 'dsh-sd-input', style: { display: 'flex', alignItems: 'center', height: '34px', color: 'var(--sd-text-3)', cursor: 'not-allowed' }, title: translate('params.ratioLockedTip'), 'data-testid': 'sd-ratio-locked' }, translate('params.ratioLocked'))
                : h('select', {
                    className: 'dsh-sd-select',
                    value: params.ratio,
                    onChange: (event) => patchParams({ ratio: event.target.value }),
                    disabled: props.disabled,
                    'aria-label': translate('params.ratioAria'),
                    'data-testid': 'sd-ratio',
                    'data-seedance-control': 'ratio',
                  }, ratioOptions.map((option) => h('option', { key: option.value, value: option.value }, translate(option.label)))),
            ),
            h(Field, { label: translate('params.duration'), span2: true },
              h('div', { className: 'dsh-sd-duration-line' },
                h('input', {
                  className: 'dsh-sd-range',
                  type: 'range',
                  min: minDuration,
                  max: maxDuration,
                  step: 1,
                  value: Math.min(maxDuration, Math.max(minDuration, durationValue < 0 ? minDuration : durationValue)),
                  onChange: (event) => patchParams({ duration: Math.round(asNum(event.target.value, minDuration)), autoDuration: false }),
                  disabled: props.disabled || (model && model.autoDuration && params.autoDuration) || constraints.lockDuration,
                  'aria-label': translate('params.durationAria'),
                  'data-testid': 'sd-duration',
                  'data-seedance-control': 'duration',
                }),
                h('input', {
                  className: 'dsh-sd-input',
                  type: 'number',
                  min: minDuration,
                  max: maxDuration,
                  step: 1,
                  value: params.autoDuration ? -1 : durationValue,
                  onChange: (event) => {
                    const raw = event.target.value;
                    if (raw === '' || raw === '-') { patchParams({ duration: raw, autoDuration: false }); return; }
                    const number = Math.round(asNum(raw, minDuration));
                    patchParams({ duration: Math.min(maxDuration, Math.max(minDuration, number)), autoDuration: false });
                  },
                  disabled: props.disabled || (model && model.autoDuration && params.autoDuration) || constraints.lockDuration,
                  'aria-label': translate('params.durationSecondsAria'),
                }),
                h('span', { className: 'dsh-sd-duration-unit' }, translate('common.seconds')),
                (model && model.autoDuration) ? h('label', { className: 'dsh-sd-inline-check', title: translate('params.autoDurationTip') },
                  h('input', {
                    type: 'checkbox',
                    checked: params.autoDuration === true,
                    onChange: (event) => patchParams({ autoDuration: event.target.checked, duration: event.target.checked ? -1 : asNum(model.defaultDuration, minDuration) }),
                    disabled: props.disabled || constraints.lockDuration,
                    'data-testid': 'sd-auto-duration',
                    'data-seedance-control': 'auto-duration',
                  }),
                  translate('common.smart'),
                ) : null,
              ),
              (params.autoDuration || constraints.lockDuration) ? h(HintLine, { kind: 'muted' }, translate('params.smartHint', { min: minDuration, max: maxDuration })) : null,
            ),
            h(SwitchRow, {
              label: translate('params.audio'),
              hint: audioSupported ? translate('params.audioOn') : translate('params.audioOff'),
              checked: params.generateAudio === true && audioSupported,
              onChange: (value) => patchParams({ generateAudio: value }),
              disabled: props.disabled || !audioSupported,
              testid: 'sd-generate-audio',
              hook: 'generate-audio',
            }),
            h(SwitchRow, {
              label: translate('params.watermark'),
              hint: translate('params.watermarkHint'),
              checked: params.watermark === true,
              onChange: (value) => patchParams({ watermark: value }),
              disabled: props.disabled,
              testid: 'sd-watermark',
              hook: 'watermark',
            }),
            h(SwitchRow, {
              label: translate('params.lastFrame'),
              hint: translate('params.lastFrameHint'),
              checked: params.returnLastFrame === true,
              onChange: (value) => patchParams({ returnLastFrame: value }),
              disabled: props.disabled,
              testid: 'sd-return-lastframe',
              hook: 'return-last-frame',
            }),
          ),
          h('button', {
            type: 'button',
            className: 'dsh-sd-adv-toggle',
            onClick: () => setAdvancedOpen((value) => !value),
            'aria-expanded': advancedOpen,
            'data-testid': 'sd-advanced-toggle',
          }, h(Icon, { name: advancedOpen ? 'chevronDown' : 'chevronRight', size: 13 }), translate('params.advanced')),
          advancedOpen ? h('div', { className: 'dsh-sd-adv', 'data-seedance-advanced': '' },
            h('div', { className: 'dsh-sd-adv-grid' },
              h(Field, { label: translate('params.seed') },
                h('div', { className: 'dsh-sd-seed-line' },
                  h('input', {
                    className: 'dsh-sd-input',
                    type: 'number',
                    min: 0,
                    step: 1,
                    value: params.seed === '' || params.seed === undefined ? '' : params.seed,
                    placeholder: translate('params.seedPlaceholder'),
                    onChange: (event) => patchParams({ seed: event.target.value }),
                    disabled: props.disabled,
                    'aria-label': translate('params.seedAria'),
                    'data-testid': 'sd-seed',
                    'data-seedance-control': 'seed',
                  }),
                  h(IconButton, {
                    icon: 'refresh',
                    label: translate('params.randomSeed'),
                    onClick: () => patchParams({ seed: Math.floor(Math.random() * 2147483647) }),
                    testid: 'sd-seed-random',
                    hook: 'seed-random',
                  }),
                ),
              ),
              (model && model.cameraFixed) ? h(Field, { label: translate('params.camera') },
                h(SwitchRow, {
                  label: translate('params.fixedCamera'),
                  checked: params.cameraFixed === true,
                  onChange: (value) => patchParams({ cameraFixed: value }),
                  disabled: props.disabled,
                  testid: 'sd-camera-fixed',
                }),
              ) : null,
            ),
          ) : null,
          params.resolution === '4k' ? h(HintLine, { kind: 'muted' }, translate('params.resolution4k')) : null,
          h('div', { className: 'dsh-sd-cost', 'data-seedance-cost': '' },
            h('span', null,
              props.demo
                ? h('span', { className: 'demo' }, translate('params.demoNoCost'))
                : estimate
                  ? h(React.Fragment, null, translate('params.estimatePrefix'), h('b', null, '≈ ¥' + estimate.toFixed(2)), translate('params.estimateSuffix'))
                  : translate('params.estimateUnavailable'),
            ),
            h('span', null, params.autoDuration ? translate('common.smartDuration') : fmtDuration(params.duration), ' · ', params.resolution, ' · ', params.ratio === 'adaptive' ? translate('params.adaptiveRatio') : params.ratio),
          ),
        ),
      );
    }

    // ==========================================================================
    // 创作面板（左栏）
    // ==========================================================================
    function CreatorPanel(props) {
      const form = props.form;
      const model = props.model;
      const constraints = props.constraints;
      const disabled = props.disabled;
      const error = props.error;
      return h('section', { className: 'dsh-sd-creator', 'data-seedance-creator': '', 'aria-label': translate('creator.formAria') },
        h('div', { className: 'dsh-sd-creator-head' },
          h('span', { className: 'dsh-sd-creator-head-title' }, translate('creator.panelTitle')),
          props.onCollapse ? h('button', {
            type: 'button',
            className: 'dsh-sd-creator-collapse',
            onClick: props.onCollapse,
            title: translate('creator.collapsePanel'),
            'aria-label': translate('creator.collapsePanel'),
            'data-testid': 'sd-creator-collapse',
          }, h(Icon, { name: 'chevronRight', size: 15 })) : null,
        ),
        h('div', { className: 'dsh-sd-creator-body dsh-sd-scroll', 'data-seedance-creator-scroll': '' },
          props.offline ? h('div', { className: 'dsh-sd-offline', role: 'alert', 'data-testid': 'sd-host-offline' },
            h('div', null, h('b', null, translate('creator.hostOffline')), translate('creator.hostOfflineHint')),
            h('div', { style: { marginTop: '4px' } }, translate('creator.reloadHint'), h('button', { type: 'button', className: 'dsh-sd-linkbtn', onClick: props.onReload, style: { marginLeft: '4px' } }, translate('creator.retry')), '。'),
          ) : null,
          props.demo ? h('div', { className: 'dsh-sd-demo-banner', 'data-seedance-demo-banner': '' },
            h(Icon, { name: 'sparkles', size: 15 }),
            h('span', null, h('b', null, translate('status.demo')), '：' + (props.demoReason || translate('demo.reasonDefault'))),
            h('button', { type: 'button', className: 'dsh-sd-linkbtn dsh-sd-demo-action', onClick: props.onOpenSettings, 'data-testid': 'sd-demo-configure' }, translate('creator.configure')),
          ) : null,
          h('div', { className: 'dsh-sd-section' },
            h('div', { className: 'dsh-sd-section-head' },
              h('span', { className: 'dsh-sd-section-title' }, translate('creator.modesTitle')),
              model ? h('span', { className: 'dsh-sd-section-hint' }, model.label) : null,
            ),
            h('div', { className: 'dsh-sd-modebar', role: 'tablist', 'aria-label': translate('creator.modesTitle') },
              MODES.map((mode) => {
                const supported = constraints.availableModes.indexOf(mode.id) !== -1
                  || (mode.id === 'edit' && (constraints.availableModes.indexOf('edit') !== -1 || constraints.availableModes.indexOf('extend') !== -1));
                const active = form.mode === mode.id;
                const modeText = translate(mode.label);
                return h('button', {
                  key: mode.id,
                  type: 'button',
                  role: 'tab',
                  'aria-selected': active,
                  className: 'dsh-sd-mode',
                  'data-active': active,
                  'data-seedance-mode': mode.id,
                  'data-testid': 'sd-mode-tab',
                  'data-mode': mode.id,
                  disabled: disabled || !supported,
                  title: supported ? modeText : translate('creator.modeUnsupported', { mode: modeText }),
                  onClick: () => { if (!disabled && supported) props.onModeChange(mode.id); },
                }, h(Icon, { name: mode.icon, size: 14 }), modeText);
              }),
            ),
          ),
          h(PromptField, {
            value: form.prompt,
            onChange: props.onPromptChange,
            onSubmit: props.onSubmit,
          }),
          h(MaterialPanel, {
            form,
            model,
            constraints,
            disabled,
            onPatch: props.onPatch,
            onError: props.onToastError,
            onSubModeChange: props.onSubModeChange,
            onPickHistoryVideo: props.onPickHistoryVideo,
          }),
          h(ParamsPanel, {
            form,
            models: props.models,
            model,
            constraints,
            disabled,
            demo: props.demo,
            customModel: form.customModel,
            estimate: props.estimate,
            onPatch: props.onPatch,
            onSelectModel: props.onSelectModel,
            onCustomModelChange: props.onCustomModelChange,
            onToastError: props.onToastError,
          }),
        ),
        h('div', { className: 'dsh-sd-creator-foot' },
          h('button', {
            type: 'button',
            className: 'dsh-sd-generate',
            disabled: disabled || !props.canGenerate || props.generating,
            onClick: props.onSubmit,
            'data-testid': 'sd-generate',
            'data-seedance-generate': '',
            'aria-label': translate('creator.generate'),
            title: props.error || undefined,
          },
            props.generating ? h(Spinner, { label: translate('creator.creating') }) : h(Icon, { name: 'sparkles', size: 17 }),
            props.generating ? translate('creator.creatingDots') : translate('creator.generate'),
          ),
          error ? h('div', { className: 'dsh-sd-error-line', role: 'alert', 'data-testid': 'sd-form-error' }, h(Icon, { name: 'warning', size: 13 }), h('span', null, error)) : null,
          h('div', { className: 'dsh-sd-generate-hint' },
            h('span', { className: 'dsh-sd-kbd-hint' }, h('kbd', null, 'Ctrl'), '+', h('kbd', null, 'Enter'), translate('creator.kbdHint')),
            props.sessionFallback
              ? h('span', { style: { color: 'var(--sd-warn)' } }, translate('creator.sessionHintNone'))
              : !props.sessionId
                ? h('span', { style: { color: 'var(--sd-warn)' } }, translate('creator.sessionHintNoChat'))
                : h('span', null, translate('creator.sessionHintSave')),
          ),
        ),
      );
    }
    // ==========================================================================
    // 历史画廊
    // ==========================================================================
    function ToastItem(props) {
      React.useEffect(() => {
        const timer = setTimeout(() => props.onDone(props.toast.id), props.toast.holdMs || 4200);
        return () => clearTimeout(timer);
      }, [props.toast.id, props.toast.holdMs]);
      const kind = props.toast.kind;
      return h('div', {
        className: 'dsh-sd-toast',
        'data-kind': kind,
        role: kind === 'error' ? 'alert' : 'status',
        'data-testid': 'sd-toast',
        'data-seedance-toast': kind,
      },
        h('span', { className: 'dsh-sd-toast-icon' }, h(Icon, {
          name: kind === 'error' ? 'warning' : kind === 'success' ? 'check' : 'info',
          size: 15,
        })),
        h('span', null, props.toast.message),
      );
    }

    function ToastStack(props) {
      if (!props.toasts || !props.toasts.length) return null;
      return h('div', { className: 'dsh-sd-toast-stack', 'aria-live': 'polite' },
        props.toasts.map((toast) => h(ToastItem, { key: toast.id, toast, onDone: props.onDismiss })),
      );
    }

    function Modal(props) {
      React.useEffect(() => {
        if (!props.open) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape' && typeof props.onClose === 'function') props.onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [props.open, props.onClose]);
      if (!props.open) return null;
      return h('div', {
        className: 'dsh-sd-modal-backdrop',
        role: 'presentation',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && typeof props.onClose === 'function') props.onClose();
        },
      },
        h('div', (() => {
          const attrs = {
            className: 'dsh-sd-modal',
            'data-size': props.size || undefined,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': props.title || translate('overlays.dialog'),
            'data-testid': props.testid || undefined,
            'data-seedance-modal': props.hook || undefined,
          };
          if (props.hook) {
            const hookName = /-modal$/.test(props.hook) ? props.hook : props.hook + '-modal';
            attrs['data-seedance-' + hookName] = '';
          }
          if (props.dataAttrs) Object.assign(attrs, props.dataAttrs);
          return attrs;
        })(),
          props.head || h('div', { className: 'dsh-sd-modal-head' },
            h(Icon, { name: props.icon || 'info', size: 17 }),
            h('div', null,
              h('div', { className: 'dsh-sd-modal-title' }, props.title),
              props.subtitle ? h('div', { className: 'dsh-sd-modal-sub' }, props.subtitle) : null,
            ),
            h(IconButton, { icon: 'close', label: translate('action.close'), onClick: props.onClose, testid: props.closeTestid }),
          ),
          h('div', { className: 'dsh-sd-modal-body' }, props.children),
          props.footer ? h('div', { className: 'dsh-sd-modal-foot' }, props.footer) : null,
        ),
      );
    }

    function SkeletonCards() {
      return h('div', { className: 'dsh-sd-skeleton-cards', 'data-testid': 'sd-skeleton', 'aria-label': translate('common.loading') },
        [0, 1, 2, 3].map((index) => h('div', { key: index, className: 'dsh-sd-skeleton' },
          h('div', { className: 'sk-media' }),
          h('div', { className: 'sk-line' }),
          h('div', { className: 'sk-line short' }),
        )),
      );
    }

    function EmptyState(props) {
      return h('div', { className: 'dsh-sd-empty', 'data-testid': 'sd-empty', 'data-seedance-empty': '' },
        h('div', { className: 'dsh-sd-empty-art' }, h(Icon, { name: 'film', size: 42 })),
        h('div', { className: 'dsh-sd-empty-title' }, props.title || translate('history.emptyTitle')),
        h('div', { className: 'dsh-sd-empty-desc' }, props.description || translate('history.emptyDesc')),
        props.demoHint ? h('div', { className: 'dsh-sd-empty-desc', style: { color: 'var(--sd-warn)' } }, props.demoHint) : null,
        props.onAction ? h(IconButton, {
          icon: 'sparkles',
          label: translate('history.fillSample'),
          onClick: props.onAction,
          testid: 'sd-empty-action',
        }, translate('history.fillSample')) : null,
      );
    }

    function HistoryCard(props) {
      const record = props.record;
      const [confirm, setConfirm] = React.useState(null);
      const [videoBroken, setVideoBroken] = React.useState(false);
      const active = recordIsActive(record);
      const succeeded = record.status === 'succeeded';
      const draft = recordIsDraft(record);
      const params = record.params || {};
      const meta = statusMeta(record);
      const prompt = asStr(record.prompt);
      const modelName = modelLabel(props.models, record.model);
      const origin = asStr(record.originId);
      const isDemo = record.provider === 'demo' || record.meta && record.meta.demo === true;
      const duration = params.autoDuration ? translate('common.smartDuration') : fmtDuration(params.duration);
      const resolutions = params.resolution ? asStr(params.resolution) : '';
      const canCancel = record.status === 'queued';
      const canDraftFinal = draft && succeeded && !props.hasFinal && !!asStr(record.remoteTaskId);
      const runningProgress = clampProgress(record.progress !== undefined ? record.progress : meta.progress);
      return h('article', {
        className: 'dsh-sd-card',
        'data-highlight': props.highlight === true,
        'data-seedance-card': '',
        'data-status': record.status,
        'data-record-id': record.id,
        'data-testid': 'sd-history-card',
        'aria-label': translate('history.recordAria', { prompt: prompt ? prompt.slice(0, 24) : record.id }),
      },
        h('div', {
          className: 'dsh-sd-card-media',
          'data-clickable': succeeded,
          role: succeeded ? 'button' : undefined,
          tabIndex: succeeded ? 0 : undefined,
          'aria-label': succeeded ? translate('action.playVideo') : undefined,
          onClick: () => { if (succeeded && typeof props.onPlay === 'function') props.onPlay(record); },
          onKeyDown: (event) => {
            if (succeeded && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              if (typeof props.onPlay === 'function') props.onPlay(record);
            }
          },
        },
          succeeded && !videoBroken
            ? h('video', {
                src: recordVideoSrc(record) + '#t=0.1',
                poster: recordPoster(record) || undefined,
                preload: 'metadata',
                muted: true,
                playsInline: true,
                tabIndex: -1,
                onError: () => setVideoBroken(true),
                'aria-hidden': 'true',
              })
            : null,
          succeeded && videoBroken ? h('div', { className: 'dsh-sd-card-state' }, h(Icon, { name: 'video', size: 26 }), h('span', null, translate('history.clickPlay'))) : null,
          active ? h(React.Fragment, null,
            h('div', { className: 'dsh-sd-card-running-veil' }),
            h('div', { className: 'dsh-sd-card-state' },
              h(Spinner, { label: meta.label }),
              h('span', { 'data-testid': 'sd-card-progress-value' }, meta.label + ' · ' + runningProgress + '%'),
              h('span', { style: { fontSize: '11px', opacity: 0.8 } }, prompt ? prompt.slice(0, 20) : modeLabel(record.mode)),
            ),
            h('div', { className: 'dsh-sd-card-progress' }, h('i', { style: { '--sd-progress': Math.max(6, record.progress || meta.progress) + '%' } })),
          ) : null,
          !succeeded && !active ? h('div', { className: 'dsh-sd-card-state', 'data-tone': 'error' },
            h(Icon, { name: record.status === 'failed' ? 'warning' : 'stop', size: 26 }),
            h('span', null, meta.label),
            record.error && record.error.message ? h('span', { style: { fontSize: '10.5px', maxWidth: '86%', textAlign: 'center' } }, asStr(record.error.message).slice(0, 60)) : null,
          ) : null,
          h('div', { className: 'dsh-sd-card-scrim' }),
          succeeded ? h('button', {
            type: 'button',
            className: 'dsh-sd-card-play',
            'aria-label': translate('action.play'),
            onClick: (event) => { event.stopPropagation(); if (typeof props.onPlay === 'function') props.onPlay(record); },
            'data-testid': 'sd-play',
            'data-seedance-action': 'play',
          }, h(Icon, { name: 'play', size: 18 })) : null,
          h('div', { className: 'dsh-sd-card-badge' }, h(StatusBadge, { record })),
          h('div', { className: 'dsh-sd-card-provider' },
            draft ? h('span', { className: 'dsh-sd-badge', 'data-tone': 'warn', 'data-testid': 'sd-draft-badge' }, translate('badge.draft'))
              : isDemo ? h('span', { className: 'dsh-sd-badge', 'data-tone': 'muted' }, translate('badge.demo'))
              : null,
          ),
        ),
        h('div', { className: 'dsh-sd-card-body' },
          h('div', { className: 'dsh-sd-card-prompt', 'data-empty': !prompt, title: prompt },
            prompt || modeLabel(record.mode) + ' ' + translate('history.noPrompt'),
          ),
          h('div', { className: 'dsh-sd-card-meta' },
            h('span', null, modelName),
            resolutions ? h(React.Fragment, null, h('span', { className: 'sep' }, '·'), h('span', null, resolutions)) : null,
            h('span', { className: 'sep' }, '·'),
            h('span', null, duration),
            h('span', { className: 'sep' }, '·'),
            h('span', { title: record.createdAt ? new Date(record.createdAt).toLocaleString() : '' }, fmtRelative(record.createdAt)),
          ),
          origin ? h('div', { className: 'dsh-sd-card-meta' },
            h('span', { className: 'origin', 'data-testid': 'sd-origin-mark' }, translate('history.origin', { id: shortId(origin) })),
          ) : null,
          props.hasFinal ? h('div', { className: 'dsh-sd-card-meta' },
            h('span', { className: 'dsh-sd-badge', 'data-tone': 'success', 'data-testid': 'sd-draft-final-done' }, translate('badge.draftFinalDone')),
          ) : null,
          h('div', { className: 'dsh-sd-card-actions' },
            succeeded ? h(IconButton, { icon: 'play', label: translate('action.play'), onClick: () => props.onPlay(record), testid: 'sd-card-play', hook: 'card-play' }) : null,
            succeeded ? h(IconButton, { icon: 'recreate', label: translate('action.recreate'), onClick: () => props.onRecreate(record), testid: 'sd-recreate', hook: 'card-recreate' }) : null,
            canDraftFinal ? h(IconButton, { icon: 'draft', label: translate('action.draftFinal'), onClick: () => props.onDraftFinal(record), testid: 'sd-draft-final', hook: 'draft-final', variant: 'primary' }, translate('action.draftFinal')) : null,
            record.status === 'failed' ? h(IconButton, { icon: 'refresh', label: translate('action.retryHint'), variant: 'primary', onClick: () => props.onRecreate(record), testid: 'sd-retry', hook: 'card-retry' }, translate('action.retry')) : null,
            typeof props.onOpenChat === 'function' ? h(IconButton, { icon: 'external', label: translate('action.chatOpen'), onClick: () => props.onOpenChat(record), testid: 'sd-chat-open', hook: 'card-chat-open' }) : null,
            typeof props.onSendToChat === 'function' ? h(IconButton, { icon: 'message', label: translate('action.chatSend'), onClick: () => props.onSendToChat(record), testid: 'sd-chat-send', hook: 'card-chat-send' }) : null,
            h('span', { className: 'grow' }),
            succeeded ? h(IconButton, { icon: 'download', label: translate('action.download'), onClick: () => props.onDownload(record), testid: 'sd-download', hook: 'card-download' }) : null,
            canCancel ? h(IconButton, { icon: 'close', label: translate('action.cancelTask'), onClick: () => setConfirm('cancel'), testid: 'sd-cancel', hook: 'card-cancel' }) : null,
            h(IconButton, { icon: 'trash', label: translate('action.delete'), variant: 'danger', onClick: () => setConfirm('delete'), testid: 'sd-delete', hook: 'card-delete' }),
          ),
        ),
        confirm
          ? h('div', { className: 'dsh-sd-card-confirm', role: 'alertdialog', 'aria-label': confirm === 'delete' ? translate('history.confirmDelete') : translate('history.confirmCancel') },
              h('div', { style: { fontWeight: 600 } }, confirm === 'delete' ? translate('history.deleteQuestion') : translate('history.cancelQuestion')),
              h('div', { style: { fontSize: '11px', color: 'var(--sd-text-3)' } },
                confirm === 'delete' ? translate('history.deleteDesc') : translate('history.cancelDesc')),
              h('div', { className: 'btns' },
                h(IconButton, {
                  icon: 'close',
                  label: translate('history.cancelAction'),
                  onClick: () => setConfirm(null),
                  testid: 'sd-confirm-no',
                }, translate('history.back')),
                h(IconButton, {
                  icon: confirm === 'delete' ? 'trash' : 'stop',
                  label: confirm === 'delete' ? translate('history.confirmDelete') : translate('history.confirmCancel'),
                  variant: confirm === 'delete' ? 'danger' : 'primary',
                  onClick: () => {
                    setConfirm(null);
                    if (confirm === 'delete') props.onDelete(record);
                    else props.onCancel(record);
                  },
                  testid: 'sd-confirm-yes',
                }, translate('history.confirm')),
              ),
            )
          : null,
      );
    }

    function HistoryPanel(props) {
      const records = props.records || [];
      const [filter, setFilter] = React.useState('all');
      const activeRecords = records.filter(recordIsActive);
      const counts = {
        all: records.length,
        active: activeRecords.length,
        done: records.filter((record) => record.status === 'succeeded').length,
        failed: records.filter((record) => record.status === 'failed' || record.status === 'cancelled' || record.status === 'expired').length,
      };
      const filtered = React.useMemo(() => {
        if (filter === 'active') return records.filter(recordIsActive);
        if (filter === 'done') return records.filter((record) => record.status === 'succeeded');
        if (filter === 'failed') return records.filter((record) => record.status === 'failed' || record.status === 'cancelled' || record.status === 'expired');
        return records;
      }, [records, filter]);
      const draftFinalIds = React.useMemo(() => {
        const set = new Set();
        for (const record of records) {
          if (record.originId) set.add(record.originId);
          if (record.meta && record.meta.draftTaskId) set.add(asStr(record.meta.draftTaskId));
        }
        return set;
      }, [records]);
      const loading = props.status === 'loading' || props.status === 'booting';
      const error = props.status === 'error';
      return h('section', { className: 'dsh-sd-gallery', 'data-seedance-history': '', 'aria-label': translate('history.title') },
        h('div', { className: 'dsh-sd-gallery-head' },
          h('div', { className: 'dsh-sd-gallery-title' },
            h('span', { className: 'dsh-sd-live-dot', 'data-idle': activeRecords.length === 0 }),
            translate('history.title'),
            h('span', { className: 'dsh-sd-gallery-count', 'data-testid': 'sd-history-count', 'data-seedance-history-count': records.length },
              translate('history.count', { total: records.length }) + (activeRecords.length ? translate('history.activeSuffix', { active: activeRecords.length }) : '')),
          ),
          h('div', { className: 'dsh-sd-gallery-head-extra' },
            h(IconButton, { icon: 'refresh', label: translate('action.refresh'), onClick: props.onRefresh, disabled: loading, testid: 'sd-refresh', hook: 'history-refresh' }),
          ),
        ),
        h('div', { className: 'dsh-sd-gallery-body dsh-sd-scroll' },
          h('div', { className: 'dsh-sd-gallery-filterline' },
            h(Segmented, {
              value: filter,
              options: [
                { value: 'all', label: translate('history.filterAll', { count: counts.all }) },
                { value: 'active', label: translate('history.filterActive', { count: counts.active }) },
                { value: 'done', label: translate('history.filterDone', { count: counts.done }) },
                { value: 'failed', label: translate('history.filterFailed', { count: counts.failed }) },
              ],
              onChange: setFilter,
              label: translate('history.filterAria'),
              testid: 'sd-filter',
              hook: 'history-filter',
            }),
            error ? h('span', { style: { fontSize: '11px', color: 'var(--sd-error)' }, 'data-testid': 'sd-history-error' }, translate('history.loadError')) : null,
          ),
          activeRecords.length ? h('div', { className: 'dsh-sd-queue', 'data-seedance-queue': '' },
            h('div', { className: 'dsh-sd-queue-title' }, h(Spinner, { label: translate('status.running') }), translate('history.queueTitle', { count: activeRecords.length })),
            h('div', { className: 'dsh-sd-queue-list' },
              activeRecords.map((record) => h('div', { key: record.id, className: 'dsh-sd-queue-item' },
                h(StatusBadge, { record }),
                h('span', { className: 'txt' }, asStr(record.prompt) || modeLabel(record.mode)),
                h('span', { className: 'dsh-sd-queue-percent', 'data-testid': 'sd-queue-progress' }, clampProgress(record.progress !== undefined ? record.progress : statusMeta(record).progress) + '%'),
                h('span', { className: 'bar' }, h('i', { style: { width: Math.max(6, record.progress || statusMeta(record).progress) + '%' } })),
              )),
            ),
          ) : null,
          loading && !records.length ? h(SkeletonCards, null)
            : !filtered.length
              ? h(EmptyState, {
                  title: records.length ? translate('history.emptyFilteredTitle') : translate('history.emptyTitle'),
                  description: records.length ? translate('history.emptyFilteredDesc') : translate('history.emptyDesc'),
                  demoHint: props.demo ? translate('history.demoHint') : null,
                  onAction: records.length ? null : props.onUseTemplate,
                })
              : h('div', { className: 'dsh-sd-cards' },
                  filtered.map((record) => h(HistoryCard, {
                    key: record.id,
                    record,
                    models: props.models,
                    highlight: props.highlightId === record.id,
                    hasFinal: draftFinalIds.has(asStr(record.remoteTaskId) || record.id),
                    onPlay: props.onPlay,
                    onRecreate: props.onRecreate,
                    onDownload: props.onDownload,
                    onDelete: props.onDelete,
                    onCancel: props.onCancel,
                    onDraftFinal: props.onDraftFinal,
                    onOpenChat: props.onOpenChat,
                    onSendToChat: props.onSendToChat,
                  })),
                ),
          records.length ? h('div', { className: 'dsh-sd-material-tip', style: { marginTop: '14px', textAlign: 'center' } },
            translate('history.footer')) : null,
        ),
      );
    }

    // ==========================================================================
    // 播放器弹窗
    // ==========================================================================
    function PlayerModal(props) {
      const record = props.record;
      const videoRef = React.useRef(null);
      const frameState = React.useState(null);
      const frameDataUrl = frameState[0];
      const setFrameDataUrl = frameState[1];
      const timeState = React.useState(0);
      const currentTime = timeState[0];
      const setCurrentTime = timeState[1];
      const durationState = React.useState(0);
      const duration = durationState[0];
      const setDuration = durationState[1];
      const brokenState = React.useState(false);
      const broken = brokenState[0];
      const setBroken = brokenState[1];
      const busyState = React.useState(false);
      const busy = busyState[0];
      const setBusy = busyState[1];
      if (!record) return null;
      const capture = async (which) => {
        setBusy(true);
        try {
          let time = 0;
          const video = videoRef.current;
          if (which === 'current') time = video ? video.currentTime : 0;
          else if (which === 'last') time = Math.max(0, (duration || (video && video.duration) || 0) - 0.12);
          const dataUrl = await captureVideoFrame(video, time);
          setFrameDataUrl(dataUrl);
          props.onToast('success', translate('player.captureSuccess', { frame: which === 'last' ? translate('common.lastFrame') : which === 'first' ? translate('common.firstFrame') : translate('common.currentFrame') }));
        } catch (error) {
          props.onToast('error', error && error.message ? error.message : translate('toast.captureFailed'));
        } finally {
          setBusy(false);
        }
      };
      const meta = record.params || {};
      return h(Modal, {
        open: true,
        onClose: props.onClose,
        size: 'lg',
        icon: 'video',
        title: translate('player.title', { title: asStr(record.prompt) ? asStr(record.prompt).slice(0, 30) : shortId(record.id) }),
        subtitle: modelLabel(props.models, record.model) + ' · ' + modeLabel(record.mode) + ' · ' + fmtRelative(record.createdAt),
        testid: 'sd-player',
        hook: 'player',
        dataAttrs: { 'data-seedance-player': '' },
        closeTestid: 'sd-player-close',
        footer: h(React.Fragment, null,
          h('span', { className: 'grow', style: { fontSize: '11px', color: 'var(--sd-text-3)' } }, translate('player.urlTtl')),
          h(IconButton, { icon: 'download', label: translate('action.downloadVideo'), onClick: () => props.onDownload(record), testid: 'sd-player-download', hook: 'player-download' }, translate('action.download')),
          h(IconButton, { icon: 'recreate', label: translate('action.recreate'), variant: 'primary', onClick: () => props.onRecreate(record, frameDataUrl ? { frameDataUrl } : null), testid: 'sd-player-recreate', hook: 'player-recreate' }, translate('action.recreate')),
        ),
      },
        h('div', { className: 'dsh-sd-player-grid' },
          h('div', null,
            h('div', { className: 'dsh-sd-player-stage' },
              broken
                ? h('div', { className: 'dsh-sd-card-state', style: { aspectRatio: '16 / 9' } }, h(Icon, { name: 'warning', size: 30 }), h('span', null, translate('player.notPlayable')))
                : h('video', {
                    ref: videoRef,
                    src: recordVideoSrc(record),
                    controls: true,
                    autoPlay: true,
                    playsInline: true,
                    poster: recordPoster(record) || undefined,
                    onError: () => setBroken(true),
                    onLoadedMetadata: (event) => {
                      const video = event.currentTarget;
                      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
                    },
                    onTimeUpdate: (event) => setCurrentTime(event.currentTarget.currentTime || 0),
                    'data-testid': 'sd-player-video',
                    'data-seedance-player-video': '',
                  }),
            ),
            h('div', { className: 'dsh-sd-frame-timeline', style: { marginTop: '10px' } },
              h('input', {
                className: 'dsh-sd-range',
                type: 'range',
                min: 0,
                max: Math.max(0.1, duration || 1),
                step: 0.05,
                value: Math.min(currentTime, duration || 1),
                onChange: (event) => {
                  const next = asNum(event.target.value, 0);
                  setCurrentTime(next);
                  if (videoRef.current) videoRef.current.currentTime = next;
                },
                disabled: broken || !duration,
                'aria-label': translate('player.progressAria'),
              }),
              h('span', { style: { fontSize: '11px', color: 'var(--sd-text-3)', minWidth: '76px', textAlign: 'right' } },
                (duration ? currentTime.toFixed(1) + ' / ' + duration.toFixed(1) + 's' : '--')),
            ),
          ),
          h('div', { className: 'dsh-sd-player-side' },
            h('div', { className: 'dsh-sd-frame-tools' },
              h(IconButton, { icon: 'framesPick', label: translate('action.captureFirst'), onClick: () => capture('first'), disabled: busy || broken, testid: 'sd-capture-first' }, translate('common.firstFrame')),
              h(IconButton, { icon: 'framesPick', label: translate('action.captureCurrent'), onClick: () => capture('current'), disabled: busy || broken, testid: 'sd-capture-current' }, translate('common.currentFrame')),
              h(IconButton, { icon: 'framesPick', label: translate('action.captureLast'), onClick: () => capture('last'), disabled: busy || broken, testid: 'sd-capture-last' }, translate('common.lastFrame')),
            ),
            h('div', { className: 'dsh-sd-frame-preview', 'data-testid': 'sd-frame-preview' },
              busy ? h(Spinner, { label: translate('common.capturing') })
                : frameDataUrl ? h('img', { src: frameDataUrl, alt: translate('player.framePreview') })
                : translate('player.pickFrame'),
            ),
            frameDataUrl ? h(IconButton, {
              icon: 'recreate',
              label: translate('player.useFrame'),
              variant: 'primary',
              onClick: () => props.onRecreate(record, { frameDataUrl }),
              testid: 'sd-use-frame',
              hook: 'use-frame',
            }, translate('player.useFrame')) : null,
            h('div', { className: 'dsh-sd-player-meta' },
              h('div', null, h('b', null, translate('player.promptLabel')), asStr(record.prompt) || translate('common.none')),
              h('div', null, h('b', null, translate('player.paramsLabel')), (meta.resolution || '-') + ' · ' + (meta.ratio || '-') + ' · ' + (meta.autoDuration ? translate('common.smartDuration') : fmtDuration(meta.duration))),
              h('div', null, h('b', null, translate('player.taskLabel')), h('code', { style: { fontFamily: 'var(--sd-mono)', fontSize: '10.5px' } }, asStr(record.remoteTaskId) || record.id)),
              record.error && record.error.message ? h('div', { style: { color: 'var(--sd-error)' } }, h('b', null, translate('player.errorLabel')), asStr(record.error.message)) : null,
            ),
            h(IconButton, {
              icon: 'copy',
              label: translate('action.copyLink'),
              onClick: () => {
                copyText(mediaUrl(record.id, 'video')).then((ok) => props.onToast(ok ? 'success' : 'error', ok ? translate('toast.copySuccess') : translate('toast.copyFailed')));
              },
              testid: 'sd-copy-link',
            }, translate('action.copyLinkShort')),
          ),
        ),
      );
    }

    // ==========================================================================
    // 再创作弹窗（PLAN §7：抽帧 → 首帧/参考图；或参考视频 / 仅继承参数）
    // ==========================================================================
    function RecreateModal(props) {
      const record = props.record;
      const models = Array.isArray(props.models) && props.models.length ? props.models : FALLBACK_MODELS;
      const sourceModel = findModel(models, record.model) || models[0];
      const sourceParams = record.params || {};
      const initialFrame = props.initialFrame && props.initialFrame.frameDataUrl;
      const state = {
        prompt: React.useState(asStr(record.prompt)),
        way: React.useState(initialFrame ? 'first' : 'auto'),
        frame: React.useState(initialFrame || null),
        modelId: React.useState(sourceModel.id),
        resolution: React.useState(clampEnum(asStr(sourceParams.resolution), sourceModel.resolutions, sourceModel.defaultResolution)),
        ratio: React.useState(clampEnum(asStr(sourceParams.ratio), sourceModel.ratios, sourceModel.defaultRatio)),
        autoDuration: React.useState(sourceParams.autoDuration === true && sourceModel.autoDuration),
        duration: React.useState(asNum(sourceParams.duration, asNum(sourceModel.defaultDuration, 5))),
        generateAudio: React.useState(sourceParams.generateAudio === true && sourceModel.audio),
        watermark: React.useState(sourceParams.watermark === true),
      };
      const prompt = state.prompt[0];
      const setPrompt = state.prompt[1];
      const way = state.way[0];
      const setWay = state.way[1];
      const frame = state.frame[0];
      const setFrame = state.frame[1];
      const modelId = state.modelId[0];
      const setModelId = state.modelId[1];
      const resolution = state.resolution[0];
      const setResolution = state.resolution[1];
      const ratio = state.ratio[0];
      const setRatio = state.ratio[1];
      const autoDuration = state.autoDuration[0];
      const setAutoDuration = state.autoDuration[1];
      const duration = state.duration[0];
      const setDuration = state.duration[1];
      const generateAudio = state.generateAudio[0];
      const setGenerateAudio = state.generateAudio[1];
      const watermark = state.watermark[0];
      const setWatermark = state.watermark[1];
      const videoRef = React.useRef(null);
      const busyState = React.useState(false);
      const busy = busyState[0];
      const setBusy = busyState[1];
      const timeState = React.useState(0);
      const setTime = timeState[1];
      const durationVideoState = React.useState(0);
      const durationVideo = durationVideoState[0];
      const setDurationVideo = durationVideoState[1];
      const [error, setError] = React.useState(null);
      const model = findModel(models, modelId) || sourceModel;
      const remoteUrl = asStr(record.remoteVideoUrl);
      const sourceAge = safeNow() - asNum(record.updatedAt || record.createdAt, 0);
      const remoteFresh = !!remoteUrl && sourceAge >= 0 && sourceAge < 24 * 60 * 60 * 1000;
      const wayOptions = [
        { id: 'auto', title: translate('recreate.wayAuto'), desc: translate('recreate.wayAutoDesc'), enabled: true },
        { id: 'first', title: translate('recreate.wayFirst'), desc: translate('recreate.wayFirstDesc'), enabled: !!frame },
        { id: 'ref', title: translate('recreate.wayRef'), desc: translate('recreate.wayRefDesc'), enabled: !!frame },
        { id: 'video', title: translate('recreate.wayVideo'), desc: remoteFresh ? translate('recreate.remoteFresh') : translate('recreate.remoteStale'), enabled: !!remoteUrl && remoteFresh },
      ];
      const capture = async (which) => {
        setBusy(true);
        try {
          let time = 0;
          if (which === 'current') time = videoRef.current ? videoRef.current.currentTime : 0;
          else if (which === 'last') time = Math.max(0, (durationVideo || (videoRef.current && videoRef.current.duration) || 0) - 0.12);
          const dataUrl = await captureVideoFrame(videoRef.current, time);
          setFrame(dataUrl);
          setError(null);
        } catch (captureError) {
          setError(captureError && captureError.message ? captureError.message : translate('toast.captureFailed'));
        } finally {
          setBusy(false);
        }
      };
      const submit = () => {
        const textValue = asStr(prompt).trim();
        if (!textValue) { setError(translate('form.promptRequired')); return; }
        if ((way === 'first' || way === 'ref') && !frame) { setError(translate('recreate.needFrame')); return; }
        const params = {
          resolution: clampEnum(resolution, model.resolutions, model.defaultResolution),
          ratio: clampEnum(ratio, model.ratios, model.defaultRatio),
          duration: autoDuration ? -1 : Math.round(clampNumber(duration, model.durations[0], model.durations[1], 5)),
          generateAudio: !!generateAudio && model.audio,
          watermark: !!watermark,
          returnLastFrame: true,
        };
        if (way === 'first') {
          props.onSubmit({
            kind: 'generate',
            body: {
              sessionId: props.sessionId,
              prompt: textValue,
              model: model.id,
              mode: 'image2video',
              params,
              inputs: { images: [{ role: 'first_frame', dataUrl: frame }] },
              sourceId: record.id,
            },
          });
        } else if (way === 'ref') {
          props.onSubmit({
            kind: 'generate',
            body: {
              sessionId: props.sessionId,
              prompt: textValue,
              model: model.id,
              mode: 'reference',
              params: Object.assign({}, params, { duration: autoDuration ? -1 : params.duration }),
              inputs: { images: [{ role: 'reference_image', dataUrl: frame }] },
              sourceId: record.id,
            },
          });
        } else if (way === 'video') {
          // 走 /recreate + mode=reference：宿主复用远端视频并写入 originId（卡片显示「改自 #xxxx」）
          props.onSubmit({
            kind: 'recreate',
            body: {
              sessionId: props.sessionId,
              sourceId: record.id,
              prompt: textValue,
              model: model.id,
              mode: 'reference',
              params,
            },
          });
        } else {
          props.onSubmit({
            kind: 'recreate',
            body: {
              sessionId: props.sessionId,
              sourceId: record.id,
              prompt: textValue,
              model: model.id,
              params,
            },
          });
        }
      };
      const resolutionOptions = (model.resolutions || []).map((value) => ({ value, label: value }));
      const ratioOptions = RATIO_OPTIONS.filter((option) => (model.ratios || []).indexOf(option.value) !== -1);
      return h(Modal, {
        open: true,
        onClose: props.onClose,
        size: 'lg',
        icon: 'recreate',
        title: translate('recreate.title', { title: asStr(record.prompt) ? asStr(record.prompt).slice(0, 28) : shortId(record.id) }),
        subtitle: translate('recreate.subtitle', { id: shortId(record.id), model: modelLabel(models, record.model), time: fmtRelative(record.createdAt) }),
        testid: 'sd-recreate-modal',
        hook: 'recreate-modal',
        dataAttrs: { 'data-seedance-recreate-modal': '' },
        closeTestid: 'sd-recreate-close',
        footer: h(React.Fragment, null,
          h('span', { className: 'grow', style: { fontSize: '11px', color: 'var(--sd-text-3)' } },
            way === 'auto' ? translate('recreate.autoNote') : translate('recreate.generateNote')),
          h(IconButton, { icon: 'close', label: translate('action.cancel'), onClick: props.onClose, testid: 'sd-recreate-cancel' }, translate('action.cancel')),
          h(IconButton, {
            icon: 'sparkles',
            label: translate('action.createRecreate'),
            variant: 'primary',
            onClick: submit,
            disabled: props.submitting === true,
            testid: 'sd-recreate-submit',
            hook: 'recreate-submit',
          }, props.submitting ? translate('common.creating') : translate('action.createRecreateShort')),
        ),
      },
        h('div', { className: 'dsh-sd-split' },
          h('div', null,
            h('div', { className: 'dsh-sd-player-stage' },
              h('video', {
                ref: videoRef,
                src: recordVideoSrc(record),
                controls: true,
                playsInline: true,
                preload: 'metadata',
                poster: recordPoster(record) || undefined,
                onLoadedMetadata: (event) => {
                  const media = event.currentTarget;
                  setDurationVideo(Number.isFinite(media.duration) ? media.duration : 0);
                },
                onTimeUpdate: (event) => setTime(event.currentTarget.currentTime || 0),
                'data-testid': 'sd-recreate-video',
              }),
            ),
            h('div', { className: 'dsh-sd-frame-tools', style: { marginTop: '9px' } },
              h(IconButton, { icon: 'framesPick', label: translate('action.captureFirst'), onClick: () => capture('first'), disabled: busy, testid: 'sd-recreate-capture-first' }, translate('common.firstFrame')),
              h(IconButton, { icon: 'framesPick', label: translate('action.captureCurrent'), onClick: () => capture('current'), disabled: busy, testid: 'sd-recreate-capture-current' }, translate('common.currentFrame')),
              h(IconButton, { icon: 'framesPick', label: translate('action.captureLast'), onClick: () => capture('last'), disabled: busy, testid: 'sd-recreate-capture-last' }, translate('common.lastFrame')),
            ),
            h('div', { className: 'dsh-sd-frame-preview', style: { marginTop: '9px' }, 'data-testid': 'sd-recreate-frame' },
              busy ? h(Spinner, { label: translate('common.capturing') })
                : frame ? h('img', { src: frame, alt: translate('player.framePreview') })
                : translate('recreate.pickFrame'),
            ),
            error ? h(HintLine, { kind: 'error' }, error) : null,
          ),
          h('div', null,
            h('div', { className: 'dsh-sd-section dsh-sd-section-tight' },
              h('div', { className: 'dsh-sd-section-head' }, h('span', { className: 'dsh-sd-section-title' }, translate('recreate.sectionRef'))),
              h('div', { className: 'dsh-sd-way-grid' },
                wayOptions.map((option) => h('button', {
                  key: option.id,
                  type: 'button',
                  className: 'dsh-sd-way',
                  'data-active': way === option.id,
                  disabled: !option.enabled,
                  title: option.enabled ? option.desc : translate('recreate.unavailable', { desc: option.desc }),
                  onClick: () => { if (option.enabled) setWay(option.id); },
                  'data-testid': 'sd-recreate-way-' + option.id,
                  'data-seedance-recreate-way': option.id,
                }, h('span', null, option.title), h('small', null, option.desc))),
              ),
            ),
            h('div', { className: 'dsh-sd-section dsh-sd-section-tight' },
              h('div', { className: 'dsh-sd-section-head' }, h('span', { className: 'dsh-sd-section-title' }, translate('recreate.sectionPrompt'))),
              h('textarea', {
                className: 'dsh-sd-prompt',
                style: { minHeight: '78px' },
                value: prompt,
                maxLength: MAX_PROMPT_CHARS,
                onChange: (event) => setPrompt(event.target.value),
                'aria-label': translate('recreate.promptAria'),
                'data-testid': 'sd-recreate-prompt',
              }),
              h('span', { className: 'dsh-sd-prompt-count' }, asStr(prompt).length + ' / ' + MAX_PROMPT_CHARS),
            ),
            h('div', { className: 'dsh-sd-section dsh-sd-section-tight' },
              h('div', { className: 'dsh-sd-section-head' }, h('span', { className: 'dsh-sd-section-title' }, translate('recreate.sectionParams'))),
              h('div', { className: 'dsh-sd-rows' },
                h(Field, { label: translate('params.model') },
                  h('select', {
                    className: 'dsh-sd-select',
                    value: modelId,
                    onChange: (event) => {
                      const nextId = event.target.value;
                      setModelId(nextId);
                      const nextModel = findModel(models, nextId) || sourceModel;
                      setResolution(clampEnum(resolution, nextModel.resolutions, nextModel.defaultResolution));
                      setRatio(clampEnum(ratio, nextModel.ratios, nextModel.defaultRatio));
                    },
                    'aria-label': translate('recreate.modelAria'),
                    'data-testid': 'sd-recreate-model',
                  }, models.map((item) => h('option', { key: item.id, value: item.id }, item.label))),
                ),
                h('div', { className: 'dsh-sd-params' },
                  h(Field, { label: translate('params.resolution') }, h(Segmented, {
                    value: resolution,
                    options: resolutionOptions,
                    onChange: setResolution,
                    label: translate('recreate.resolutionAria'),
                  })),
                  h(Field, { label: translate('params.ratio') }, h('select', {
                    className: 'dsh-sd-select',
                    value: ratio,
                    onChange: (event) => setRatio(event.target.value),
                    'aria-label': translate('recreate.ratioAria'),
                  }, ratioOptions.map((option) => h('option', { key: option.value, value: option.value }, translate(option.label))))),
                  h(Field, { label: translate('params.duration') },
                    h('div', { className: 'dsh-sd-duration-line' },
                      h('input', {
                        className: 'dsh-sd-range',
                        type: 'range',
                        min: model.durations[0],
                        max: model.durations[1],
                        step: 1,
                        value: autoDuration ? model.durations[0] : Math.min(model.durations[1], Math.max(model.durations[0], asNum(duration, 5))),
                        onChange: (event) => { setAutoDuration(false); setDuration(asNum(event.target.value, 5)); },
                        disabled: autoDuration,
                        'aria-label': translate('recreate.durationAria'),
                      }),
                      h('span', { style: { fontSize: '11px', color: 'var(--sd-text-3)' } }, autoDuration ? translate('common.smart') : fmtDuration(duration)),
                      model.autoDuration ? h('label', { className: 'dsh-sd-inline-check' },
                        h('input', {
                          type: 'checkbox',
                          checked: autoDuration,
                          onChange: (event) => setAutoDuration(event.target.checked),
                        }), translate('common.smart')) : null,
                    ),
                  ),
                ),
                h(SwitchRow, {
                  label: translate('params.audio'),
                  checked: generateAudio && model.audio,
                  onChange: setGenerateAudio,
                  disabled: !model.audio,
                  testid: 'sd-recreate-audio',
                }),
                h(SwitchRow, {
                  label: translate('params.watermark'),
                  checked: watermark,
                  onChange: setWatermark,
                  testid: 'sd-recreate-watermark',
                }),
              ),
            ),
          ),
        ),
      );
    }

    // ==========================================================================
    // 从历史视频选择（编辑/延长/参考视频场景）
    // ==========================================================================
    function VideoPickModal(props) {
      const records = (props.records || []).filter((record) => record.status === 'succeeded');
      return h(Modal, {
        open: true,
        onClose: props.onClose,
        size: 'lg',
        icon: 'video',
        title: translate('videoPick.title'),
        subtitle: translate('videoPick.subtitle'),
        testid: 'sd-video-pick',
        closeTestid: 'sd-video-pick-close',
      },
        records.length
          ? h('div', { className: 'dsh-sd-pick-list' },
              records.slice(0, 24).map((record) => h('div', { key: record.id, className: 'dsh-sd-pick-item' },
                h('video', {
                  src: recordVideoSrc(record) + '#t=0.1',
                  preload: 'metadata',
                  muted: true,
                  playsInline: true,
                  tabIndex: -1,
                  'aria-hidden': 'true',
                }),
                h('div', { className: 'cap' }, asStr(record.prompt) || shortId(record.id)),
                h('div', { className: 'row' },
                  h(IconButton, {
                    icon: 'check',
                    label: translate('videoPick.useAria'),
                    variant: 'primary',
                    onClick: () => props.onPick(record),
                    disabled: !asStr(record.remoteVideoUrl),
                    title: asStr(record.remoteVideoUrl) ? translate('videoPick.remoteTitle') : translate('videoPick.noRemote'),
                    testid: 'sd-video-pick-use',
                  }, asStr(record.remoteVideoUrl) ? translate('videoPick.use') : translate('videoPick.expired')),
                ),
              )),
            )
          : h(EmptyState, { title: translate('videoPick.emptyTitle'), description: translate('videoPick.emptyDesc') }),
      );
    }

    // ==========================================================================
    // 设置弹窗（PLAN §5 / §6）
    // ==========================================================================
    function SettingsModal(props) {
      const open = props.open;
      const viewState = React.useState(null);
      const view = viewState[0];
      const setView = viewState[1];
      const loadingState = React.useState(false);
      const loading = loadingState[0];
      const setLoading = loadingState[1];
      const saveState = React.useState('idle');
      const saveStatus = saveState[0];
      const setSaveStatus = saveState[1];
      const errorState = React.useState(null);
      const error = errorState[0];
      const setError = errorState[1];
      const providerState = React.useState('auto');
      const provider = providerState[0];
      const setProvider = providerState[1];
      const demoState = React.useState(false);
      const demo = demoState[0];
      const setDemo = demoState[1];
      const arkBaseState = React.useState('');
      const arkBase = arkBaseState[0];
      const setArkBase = arkBaseState[1];
      const arkKeyState = React.useState('');
      const arkKey = arkKeyState[0];
      const setArkKey = arkKeyState[1];
      const relayBaseState = React.useState('');
      const relayBase = relayBaseState[0];
      const setRelayBase = relayBaseState[1];
      const relayKeyState = React.useState('');
      const relayKey = relayKeyState[0];
      const setRelayKey = relayKeyState[1];
      const relayProtocolState = React.useState('ark');
      const relayProtocol = relayProtocolState[0];
      const setRelayProtocol = relayProtocolState[1];
      // 中转站模型目录（拉取后可作默认模型候选；保存到 settings 供下次打开恢复）
      const relayModelsState = React.useState([]);
      const relayModels = relayModelsState[0];
      const setRelayModels = relayModelsState[1];
      const relayProbeState = React.useState({ status: 'idle' });
      const relayProbe = relayProbeState[0];
      const setRelayProbe = relayProbeState[1];
      const customModelState = React.useState('');
      const customModel = customModelState[0];
      const setCustomModel = customModelState[1];
      const relayFilterState = React.useState('');
      const relayFilter = relayFilterState[0];
      const setRelayFilter = relayFilterState[1];
      // 已选模型清单（多选）：主面板「模型」下拉只显示这些
      const enabledModelsState = React.useState([]);
      const enabledModels = enabledModelsState[0];
      const setEnabledModels = enabledModelsState[1];
      const defaultModelState = React.useState('');
      const defaultModel = defaultModelState[0];
      const setDefaultModel = defaultModelState[1];
      const maskedState = React.useState({});
      const masked = maskedState[0];
      const setMasked = maskedState[1];
      const [advancedOpen, setAdvancedOpen] = React.useState(false);
      React.useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        setLoading(true);
        setError(null);
        api('GET', '/api/seedance/settings').then((result) => {
          if (!alive) return;
          setLoading(false);
          if (!result.ok) {
            setError(humanizeError(result.error));
            return;
          }
          const payload = result.value || {};
          const view = settingsOf(payload);
          setView(view);
          const keys = isPlainObject(view.keys) ? view.keys : {};
          const nextProvider = asStr(view.provider || payload.provider || 'auto') || 'auto';
          setProvider(nextProvider === 'demo' ? 'auto' : nextProvider);
          setDemo(view.demo === true || payload.demo === true || nextProvider === 'demo');
          setArkBase(asStr(view.arkBaseUrl || view.baseURL || ''));
          setRelayBase(asStr(view.relayBaseUrl || ''));
          setRelayProtocol(asStr(view.relayProtocol || 'ark') || 'ark');
          const cachedModels = Array.isArray(view.relayModels)
            ? view.relayModels.map((item) => ({ id: asStr(item && item.id), label: asStr(item && item.label) || asStr(item && item.id) })).filter((item) => item.id)
            : [];
          setRelayModels(cachedModels);
          setEnabledModels(cachedModels);
          setRelayFilter('');
          setRelayProbe({ status: 'idle' });
          const nextDefault = asStr(view.defaultModel || '');
          const builtinIds = ((props.models || []).length ? props.models : FALLBACK_MODELS).map((item) => item.id);
          const relayIds = Array.isArray(view.relayModels) ? view.relayModels.map((item) => asStr(item && item.id)) : [];
          if (nextDefault && builtinIds.indexOf(nextDefault) === -1 && relayIds.indexOf(nextDefault) === -1) {
            setDefaultModel('__custom__');
            setCustomModel(nextDefault);
          } else {
            setDefaultModel(nextDefault);
            setCustomModel('');
          }
          setMasked({
            arkKey: asStr(keys.ark),
            relayKey: asStr(keys.relay),
            hasArkKey: view.hasArkKey === true,
            hasRelayKey: view.hasRelayKey === true,
          });
        });
        return () => { alive = false; };
      }, [open]);
      if (!open) return null;
      // 拉取中转站模型列表（同时验证连通性；用弹窗当前填写值，无需先保存）
      const probeRelay = async () => {
        if (relayProbe.status === 'loading') return;
        setRelayProbe({ status: 'loading' });
        setError(null);
        const result = await api('POST', '/api/seedance/relay/models', {
          baseUrl: relayBase.trim() || undefined,
          protocol: relayProtocol || 'ark',
          apiKey: relayKey.trim() || undefined,
        });
        if (!result.ok) {
          const error = result.error || {};
          const text = asStr(error.message);
          // 宿主仍是旧进程时接口不存在（404 not found）：给出可操作提示，而不是原样抛出
          const stale = asStr(error.code) === 'NOT_FOUND' || /(^|\s)not found(\s|$)/i.test(text);
          setRelayProbe({ status: 'error', message: stale ? translate('settings.relayHostStale') : humanizeError(error) });
          return;
        }
        const value = result.value || {};
        const models = Array.isArray(value.models) ? value.models.map((item) => ({ id: asStr(item && item.id), label: asStr(item && item.label) || asStr(item && item.id) })).filter((item) => item.id) : [];
        setRelayModels(models);
        setRelayProbe({ status: 'ok', latencyMs: asNum(value.latencyMs, 0), endpoint: asStr(value.endpoint) || '' });
      };

      // 勾选/取消勾选一个模型（主面板「模型」下拉只显示已选清单）
      const toggleEnabled = (item) => {
        const id = asStr(item && item.id);
        if (!id) return;
        const label = asStr(item && item.label) || id;
        setEnabledModels((previous) => {
          if (previous.some((entry) => entry.id === id)) return previous.filter((entry) => entry.id !== id);
          return previous.concat([{ id, label }]);
        });
      };

      const save = async () => {
        setSaveStatus('saving');
        setError(null);
        // host 接受 camelCase 别名；密钥留空表示不修改，打码值不会回写
        const patch = { provider: demo ? 'demo' : provider, demo };
        if (arkKey.trim()) patch.arkApiKey = arkKey.trim();
        if (arkBase.trim()) patch.arkBaseUrl = arkBase.trim();
        if (relayBase.trim()) patch.relayBaseUrl = relayBase.trim();
        if (relayKey.trim()) patch.relayApiKey = relayKey.trim();
        if (relayProtocol.trim()) patch.relayProtocol = relayProtocol.trim();
        const modelValue = defaultModel === '__custom__' ? customModel.trim() : defaultModel.trim();
        if (modelValue) patch.defaultModel = modelValue;
        patch.relayModels = enabledModels.length ? JSON.stringify(enabledModels) : '';
        const result = await api('POST', '/api/seedance/settings', patch);
        setSaveStatus('idle');
        if (!result.ok) {
          setError(humanizeError(result.error));
          props.onToast('error', humanizeError(result.error));
          return;
        }
        props.onToast('success', translate('toast.settingsSaved'));
        if (typeof props.onSaved === 'function') props.onSaved();
        props.onClose();
      };
      const builtinModels = (props.models || []).length ? props.models : FALLBACK_MODELS;
      const modelOptions = builtinModels.map((item) => ({ id: item.id, label: item.label }));
      const relayModelIds = enabledModels.map((item) => item.id);
      const currentModelKnown = defaultModel && defaultModel !== '__custom__' && (modelOptions.some((item) => item.id === defaultModel) || relayModelIds.indexOf(defaultModel) !== -1);
      return h(Modal, {
        open: true,
        onClose: props.onClose,
        size: 'sm',
        icon: 'settings',
        title: translate('settings.title'),
        subtitle: translate('settings.subtitle'),
        testid: 'sd-settings-modal',
        hook: 'settings-modal',
        dataAttrs: { 'data-seedance-settings-modal': '' },
        closeTestid: 'sd-settings-close',
        footer: h(React.Fragment, null,
          h('span', { className: 'grow', style: { fontSize: '11px', color: 'var(--sd-text-3)' } }, translate('settings.effectHint')),
          h(IconButton, { icon: 'close', label: translate('action.cancel'), onClick: props.onClose, testid: 'sd-settings-cancel' }, translate('action.cancel')),
          h(IconButton, {
            icon: 'check',
            label: translate('action.saveSettings'),
            variant: 'primary',
            onClick: save,
            disabled: saveStatus === 'saving' || loading,
            testid: 'sd-settings-save',
            hook: 'settings-save',
          }, saveStatus === 'saving' ? translate('common.saving') : translate('action.save')),
        ),
      },
        loading ? h('div', { style: { padding: '24px', display: 'flex', justifyContent: 'center' } }, h(Spinner, { label: translate('settings.loading') }))
          : h('div', { className: 'dsh-sd-settings-grid' },
              error ? h(HintLine, { kind: 'error' }, error) : null,
              h(SwitchRow, {
                label: translate('status.demo'),
                hint: translate('settings.demoHint'),
                checked: demo,
                onChange: setDemo,
                testid: 'sd-settings-demo',
              }),
              h(Field, { label: translate('settings.provider') },
                h('select', {
                  className: 'dsh-sd-select',
                  value: demo ? 'demo' : provider,
                  onChange: (event) => {
                    const next = event.target.value;
                    if (next === 'demo') { setDemo(true); setProvider('auto'); }
                    else { setDemo(false); setProvider(next); }
                  },
                  disabled: demo,
                  'aria-label': translate('settings.providerAria'),
                  'data-testid': 'sd-settings-provider',
                  'data-seedance-settings': 'provider',
                },
                  h('option', { value: 'auto' }, translate('settings.providerAuto')),
                  h('option', { value: 'ark' }, translate('settings.providerArk')),
                  h('option', { value: 'relay' }, translate('settings.providerRelay')),
                  h('option', { value: 'demo' }, translate('settings.providerDemo')),
                ),
              ),
              h(Field, { label: translate('settings.arkKey') },
                h('input', {
                  className: 'dsh-sd-input',
                  type: 'password',
                  value: arkKey,
                  placeholder: masked.arkKey ? translate('settings.savedPrefix', { key: masked.arkKey }) : 'ARK_API_KEY',
                  autoComplete: 'off',
                  onChange: (event) => setArkKey(event.target.value),
                  'aria-label': translate('settings.arkKey'),
                  'data-testid': 'sd-settings-ark-key',
                  'data-seedance-input': 'ark-key',
                }),
              ),
              h(Field, { label: translate('settings.arkBase') },
                h('input', {
                  className: 'dsh-sd-input',
                  type: 'text',
                  value: arkBase,
                  placeholder: 'https://ark.cn-beijing.volces.com',
                  onChange: (event) => setArkBase(event.target.value),
                  'aria-label': translate('settings.arkBase'),
                  'data-testid': 'sd-settings-ark-base',
                }),
              ),
              h(Field, { label: translate('settings.defaultModel') },
                h('select', {
                  className: 'dsh-sd-select',
                  value: defaultModel,
                  onChange: (event) => setDefaultModel(event.target.value),
                  'aria-label': translate('settings.defaultModel'),
                  'data-testid': 'sd-settings-default-model',
                },
                  h('option', { value: '' }, translate('settings.followHost')),
                  h('optgroup', { label: translate('settings.builtinModels') },
                    modelOptions.map((item) => h('option', { key: item.id, value: item.id }, item.label)),
                  ),
                  enabledModels.length ? h('optgroup', { label: translate('settings.relayModelGroup') },
                    enabledModels.map((item) => h('option', { key: 'relay:' + item.id, value: item.id }, item.label || item.id)),
                  ) : null,
                  h('option', { value: '__custom__' }, translate('settings.customModelOption')),
                  defaultModel && !currentModelKnown ? h('option', { key: 'sd-current', value: defaultModel }, defaultModel) : null,
                ),
              ),
              defaultModel === '__custom__' ? h(Field, { label: translate('settings.customModel') },
                h('input', {
                  className: 'dsh-sd-input',
                  type: 'text',
                  value: customModel,
                  placeholder: translate('settings.customModelPlaceholder'),
                  onChange: (event) => setCustomModel(event.target.value),
                  'aria-label': translate('settings.customModel'),
                  'data-testid': 'sd-settings-custom-model',
                }),
              ) : null,
              h('button', {
                type: 'button',
                className: 'dsh-sd-adv-toggle',
                onClick: () => setAdvancedOpen((value) => !value),
                'aria-expanded': advancedOpen,
              }, h(Icon, { name: advancedOpen ? 'chevronDown' : 'chevronRight', size: 13 }), translate('settings.relayAdvanced')),
              advancedOpen ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
                h(Field, { label: translate('settings.relayBase') },
                  h('input', {
                    className: 'dsh-sd-input',
                    type: 'text',
                    value: relayBase,
                    placeholder: 'https://relay.example.com',
                    onChange: (event) => setRelayBase(event.target.value),
                    'aria-label': translate('settings.relayBase'),
                    'data-testid': 'sd-settings-relay-base',
                  }),
                ),
                h(Field, { label: translate('settings.relayKey') },
                  h('input', {
                    className: 'dsh-sd-input',
                    type: 'password',
                    value: relayKey,
                    placeholder: masked.relayKey ? translate('settings.savedPrefix', { key: masked.relayKey }) : 'RELAY_API_KEY',
                    autoComplete: 'off',
                    onChange: (event) => setRelayKey(event.target.value),
                    'aria-label': translate('settings.relayKey'),
                    'data-testid': 'sd-settings-relay-key',
                    'data-seedance-input': 'relay-key',
                  }),
                ),
                h(Field, { label: translate('settings.relayProtocol') },
                  h('select', {
                    className: 'dsh-sd-select',
                    value: relayProtocol,
                    onChange: (event) => setRelayProtocol(event.target.value),
                    'aria-label': translate('settings.relayProtocol'),
                  },
                    h('option', { value: 'ark' }, translate('settings.relayArk')),
                    h('option', { value: 'openai' }, translate('settings.relayOpenai')),
                  ),
                ),
                h('div', { className: 'dsh-sd-settings-inline' },
                  h(IconButton, {
                    icon: 'refresh',
                    label: translate('settings.relayFetch'),
                    title: translate('settings.relayFetchHint'),
                    onClick: probeRelay,
                    disabled: relayProbe.status === 'loading',
                    testid: 'sd-settings-relay-fetch',
                    hook: 'settings-relay-fetch',
                  }, relayProbe.status === 'loading' ? translate('settings.relayFetching') : translate('settings.relayFetch')),
                ),
                relayProbe.status === 'ok'
                  ? h(HintLine, { kind: 'muted' }, translate('settings.relayProbeOk', { ms: relayProbe.latencyMs, count: relayModels.length }))
                  : relayProbe.status === 'error'
                    ? h(HintLine, { kind: 'error' }, translate('settings.relayProbeFail', { message: relayProbe.message || '' }))
                    : null,
                relayModels.length
                  ? h('div', { className: 'dsh-sd-relay-models-wrap', 'data-testid': 'sd-settings-relay-models' },
                      h('div', { className: 'dsh-sd-relay-models-title' }, translate('settings.relayPickTitle')),
                      h('div', { className: 'dsh-sd-relay-models-head' },
                        h('span', { className: 'dsh-sd-relay-models-count' }, translate('settings.relayModelsCount', { count: relayModels.length })),
                        h('input', {
                          className: 'dsh-sd-input dsh-sd-relay-filter',
                          type: 'search',
                          value: relayFilter,
                          placeholder: translate('settings.relayFilterPlaceholder'),
                          onChange: (event) => setRelayFilter(event.target.value),
                          'aria-label': translate('settings.relayFilterPlaceholder'),
                          'data-testid': 'sd-settings-relay-filter',
                        }),
                      ),
                      h('div', { className: 'dsh-sd-relay-models' },
                        relayModels
                          .filter((item) => !relayFilter.trim() || (item.id + ' ' + (item.label || '')).toLowerCase().indexOf(relayFilter.trim().toLowerCase()) !== -1)
                          .map((item) => {
                            const active = enabledModels.some((entry) => entry.id === item.id);
                            return h('button', {
                              key: item.id,
                              type: 'button',
                              className: 'dsh-sd-relay-model',
                              'data-active': active ? 'true' : 'false',
                              'aria-pressed': active,
                              title: item.id,
                              onClick: () => toggleEnabled(item),
                              'data-testid': 'sd-settings-relay-model',
                            }, (active ? '✓ ' : '') + (item.label || item.id));
                          }),
                      ),
                      relayFilter.trim() && !relayModels.some((item) => (item.id + ' ' + (item.label || '')).toLowerCase().indexOf(relayFilter.trim().toLowerCase()) !== -1)
                        ? h('div', { className: 'dsh-sd-relay-models-empty' }, translate('settings.relayModelsEmpty'))
                        : null,
                    )
                  : null,
                h('div', { className: 'dsh-sd-relay-selected', 'data-testid': 'sd-settings-relay-selected' },
                  h('div', { className: 'dsh-sd-relay-selected-title' }, translate('settings.relaySelectedTitle', { count: enabledModels.length })),
                  enabledModels.length
                    ? enabledModels.map((item) => h('div', { className: 'dsh-sd-relay-selected-row', key: item.id },
                        h('span', { className: 'dsh-sd-relay-selected-label', title: item.id }, item.label || item.id),
                        h('button', {
                          type: 'button',
                          className: 'dsh-sd-relay-selected-remove',
                          title: translate('settings.relayRemove'),
                          'aria-label': translate('settings.relayRemove'),
                          onClick: () => toggleEnabled(item),
                          'data-testid': 'sd-settings-relay-remove',
                        }, h(Icon, { name: 'close', size: 13 })),
                      ))
                    : h('div', { className: 'dsh-sd-relay-selected-empty' }, translate('settings.relaySelectedEmpty')),
                ),
              ) : null,
              h('div', { className: 'dsh-sd-settings-note' },
                translate('settings.priorityHint'),
              ),

              view && view.demo && !demo ? h(HintLine, { kind: 'muted' }, asStr(view.demoReason) || translate('settings.demoSaved')) : null,
              view && view.configError ? h(HintLine, { kind: 'error' }, asStr(view.configError)) : null,
              view && Array.isArray(view.warnings) && view.warnings.length
                ? h(HintLine, { kind: 'muted' }, asStr(view.warnings[0]))
                : null,
            ),
      );
    }

    // ==========================================================================
    // 页面补充样式
    // ==========================================================================
    const CSS_EXTRA_UI = String.raw`
      .dsh-sd-header-tools { display: flex; align-items: center; gap: 8px; }
      .dsh-sd-session-label { font-size: 11px; color: var(--sd-text-3); white-space: nowrap; }
      .dsh-sd-session-select { max-width: 210px; height: 30px; font-size: 11.5px; }
      .dsh-sd-status-pill .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: 0.9; }
      .dsh-sd-card-meta .origin { color: color-mix(in srgb, var(--sd-accent) 72%, var(--sd-text-2)); }
      .dsh-sd-player-meta b { color: var(--sd-text-2); font-weight: 600; }
      .dsh-sd-empty .dsh-sd-iconbtn { margin-top: 14px; }
      .dsh-sd-modal .dsh-sd-prompt-count { display: block; text-align: right; margin-top: 4px; }
      .dsh-sd-settings-grid { display: flex; flex-direction: column; gap: 11px; }
      .dsh-sd-settings-grid .dsh-sd-warnline { grid-column: 1 / -1; }
      .dsh-sd-recreate-preview { border-radius: var(--sd-radius-md); overflow: hidden; border: 1px solid var(--sd-border-1); }
      .dsh-sd-history-session { font-size: 10.5px; color: var(--sd-text-3); }
    `;

    // ==========================================================================
    // 侧边栏图标
    // ==========================================================================
    function PanelIcon(props) {
      return h('span', { className: 'dsh-sd-sidebar-icon', 'aria-hidden': 'true', role: 'img' }, h(Icon, { name: 'film', size: 19 }));
    }

    // ==========================================================================
    // 主面板 / 右侧边栏窗口：iframe 承载共享 SPA（唯一界面，不再内置经典渲染）
    //
    // SPA 源：platforms/web/public/index.html（Web 独立版 / DSH 面板 / Codex 面板共用）。
    // 插件路由 /api/seedance/panel 返回单文件 SPA，并按 query 注入 theme/lang/session。
    // ==========================================================================
    function StudioPage(props) {
      const ctx = props && props.ctx ? props.ctx : props;
      const panelVariant = props && props.variant === 'sidebar' ? 'sidebar' : undefined;
      useLocaleVersion(ctx);
      const session = useCurrentSession(ctx);
      const sessionId = (session && session.sessionId) || 'default';
      const hostLang = (() => {
        try {
          const snapshot = ctx && ctx.locale && typeof ctx.locale.getSnapshot === 'function' ? ctx.locale.getSnapshot() : null;
          return snapshot && snapshot.active === 'en' ? 'en' : 'zh';
        } catch (error) { return 'zh'; }
      })();
      // 主面板（全局工作台）不绑定会话 → SPA 显示「全部/最近历史」；右侧会话窗口绑定当前会话
      const panelSrc = '/api/seedance/panel?platform=dsh&theme=dark&lang=' + hostLang
        + (panelVariant ? '&variant=sidebar&session=' + encodeURIComponent(sessionId) : '') + '&v=' + Date.now();
      // SPA（iframe）→ 宿主：对话联动（发送到对话 / 在对话中打开）
      React.useEffect(() => {
        const onHostMessage = (event) => {
          const data = event && event.data;
          if (!data || typeof data !== 'object') return;
          if (data.type === 'sd-send-to-chat' && data.record) {
            try { sendRecordToChat(ctx, sessionId, data.record); } catch (error) { /* 宿主不支持对话时不阻塞 */ }
          } else if (data.type === 'sd-open-chat') {
            try { openSessionChat(ctx, (data.record && data.record.sessionId) || sessionId); } catch (error) { /* ignore */ }
          }
        };
        window.addEventListener('message', onHostMessage);
        return () => window.removeEventListener('message', onHostMessage);
      }, [ctx, sessionId]);
      return h('div', {
        className: 'dsh-sd-root dsh-sd-spa-shell',
        'data-seedance-panel': 'seedance',
        'data-testid': 'sd-spa-shell',
        'data-variant': panelVariant,
        style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
      },
        h('iframe', {
          className: 'dsh-sd-spa-frame',
          'data-testid': 'sd-spa-frame',
          title: translate('panel'),
          src: panelSrc,
          style: { flex: '1 1 auto', width: '100%', border: '0', minHeight: '0', background: 'transparent' },
        }),
      );
    }
    // ==========================================================================
    // 右侧边栏：视频创作作为「每个会话」可打开的侧栏窗口
    //
    // 接入方式（DSH ui-sidebar-right 的公开扩展点）：
    //   1. ctx.sidebarRightTabs.register(type) 声明 tab 类型 + guide 卡片（「指南」页入口）
    //   2. ctx.slots.register({ name: 'sidebar.right.pane.tab', key: type.id }, Body) 挂载窗口内容
    // 用户点右侧栏「指南」里的「视频创作」卡片即可在任意会话打开；每会话独立一份，
    // 与主面板共用同一存储（历史/设置一致），窗口体复用 StudioPage（sidebar 布局变体）。
    // ==========================================================================
    const SIDEBAR_TAB_ID = 'dsh-seedance-studio/studio';
    const SIDEBAR_TAB_KIND = 'seedance-studio';

    /** guide 卡片图标（26px 线性「胶片 + 播放」图形；sidebar-right 以 currentColor 着色）。 */
    function SidebarGuideIcon(props) {
      const size = (props && props.size) || 26;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        focusable: 'false',
        'aria-hidden': 'true',
        className: props && props.className,
      },
        h('rect', { x: 3, y: 4.5, width: 18, height: 15, rx: 2.5 }),
        h('path', { d: 'M3 9h18M3 15h18M8 4.5v15M16 4.5v15' }),
        h('path', { d: 'M11.2 11.6v4.8l4.2-2.4-4.2-2.4z', fill: 'currentColor', stroke: 'none' }),
      );
    }

    /** 侧栏 tab 的窗口体：套一层侧栏容器，复用完整创作台（数据与主面板同一套）。 */
    function SidebarStudioBody(props) {
      return h('div', { className: 'dsh-sd-sidebar-host', 'data-variant': 'sidebar' },
        h(StudioPage, { ctx: props.ctx, variant: 'sidebar' }),
      );
    }

    /** 注册右侧边栏 tab 类型与 guide 卡片；宿主没有侧栏服务时静默跳过，不影响主面板。 */
    function registerRightSidebar(ctx, t, safeEffect) {
      const manager = ctx && ctx.sidebarRightTabs;
      if (manager && typeof manager.register === 'function') {
        safeEffect(() => manager.register({
          id: SIDEBAR_TAB_ID,
          kind: SIDEBAR_TAB_KIND,
          title: () => t('sidebar.title'),
          keepMounted: true,
          guide: [{
            id: 'studio',
            order: 15,
            title: () => t('sidebar.guideTitle'),
            description: () => t('sidebar.guideDesc'),
            icon: SidebarGuideIcon,
          }],
        }), 'seedance-studio: right sidebar type');
      }
      safeEffect(() => {
        if (!ctx.slots || typeof ctx.slots.inject !== 'function' || typeof ctx.slots.register !== 'function') return () => {};
        return ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: SIDEBAR_TAB_ID,
          locale: NS,
          inject: () => ({ ctx }),
        }, SidebarStudioBody));
      }, 'seedance-studio: right sidebar body');
    }
    // ==========================================================================
    // 插件注册
    // ==========================================================================
    function apply(ctx) {
      const safeEffect = (fn, label) => {
        try { ctx.effect(fn, label); } catch (error) { console.warn('[seedance] effect failed:', label, error); }
      };
      // 样式注入（随插件卸载清理）
      safeEffect(() => {
        if (typeof document === 'undefined') return () => {};
        const el = document.createElement('style');
        el.setAttribute('data-dsh-plugin', 'dsh-seedance-studio');
        el.setAttribute('data-dsh-seedance-styles', '');
        el.textContent = CSS + CSS_EXTRA + CSS_EXTRA_UI;
        document.head.appendChild(el);
        return () => { try { el.remove(); } catch (_error) {} };
      }, 'seedance-studio: styles');

      // 文案字典（侧边栏标题），中英文 key 集一致
      safeEffect(() => ctx.locale.register(NS, { zh: DICT_ZH, en: DICT_EN }), 'seedance-studio: dictionaries');
      let t = (key) => DICT_ZH[key] || key;
      try { t = ctx.locale.bind(NS); } catch (error) { /* locale 不可用时退回内置文案 */ }
      try { installTranslator(t); } catch (error) { /* 宿主 locale 不可用时用内置字典 */ }

      // 主面板：页面组件通过 inject 拿到插件 ctx（用于 ctx.sessions / uiSession / landscape API）
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ ctx })
      }, StudioPage));

      // 侧边栏入口「视频创作」
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 10,
        label: () => t('panel'),
        locale: NS
      }, PanelIcon));

      // 右侧边栏：每个会话可打开的「视频创作」窗口（guide 卡片 + tab body）
      registerRightSidebar(ctx, t, safeEffect);

      // Deep link：?panel=seedance / #seedance 直接打开创作台（等待 main 面板注册完成）
      openFromDeepLink(ctx);
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.NS = NS;
    exports.PANEL_ID = PANEL_ID;

    // 仅测试环境暴露内部组件，供 scripts/check-client-bundle.mjs 做无 React 渲染冒烟；
    // 生产路径（无 window.__SEEDANCE_TEST__）不会挂载这些字段。
    if (typeof window !== 'undefined' && window.__SEEDANCE_TEST__ === true) {
      exports.__test = {
        StudioPage,
        SidebarStudioBody,
        SidebarGuideIcon,
        PanelIcon,
        HistoryCard,
        HistoryPanel,
        PlayerModal,
        RecreateModal,
        SettingsModal,
        VideoPickModal,
        buildGenerateRequest,
        buildDraftFinalRequest,
        validateForm,
        deriveConstraints,
        applyModeConstraints,
        createEmptyForm,
        makeParams,
        sanitizeForm,
        normalizeConfig,
        normalizeHistory,
        normalizeRecord,
        MODES,
        PROMPT_TEMPLATES,
        FALLBACK_MODELS,
        FALLBACK_DEFAULTS,
      };
    }
    return module.exports;
  }
});
