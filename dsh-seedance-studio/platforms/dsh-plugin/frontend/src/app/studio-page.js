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
