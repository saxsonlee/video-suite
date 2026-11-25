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
