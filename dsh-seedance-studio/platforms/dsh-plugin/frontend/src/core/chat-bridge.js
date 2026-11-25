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

