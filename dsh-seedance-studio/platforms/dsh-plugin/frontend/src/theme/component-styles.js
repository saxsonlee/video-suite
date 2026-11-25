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

