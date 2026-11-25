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

