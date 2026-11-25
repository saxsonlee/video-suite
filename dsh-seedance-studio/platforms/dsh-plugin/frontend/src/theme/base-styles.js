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


