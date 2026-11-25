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
