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
