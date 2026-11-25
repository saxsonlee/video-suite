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
