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

