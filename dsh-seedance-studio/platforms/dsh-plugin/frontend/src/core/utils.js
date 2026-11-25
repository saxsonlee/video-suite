    // ==========================================================================
    // 基础工具
    // ==========================================================================
    function asStr(value) {
      return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
    }
    function asNum(value, fallback) {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? n : fallback;
    }
    function clampNumber(value, min, max, fallback) {
      const n = asNum(value, NaN);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, n));
    }
    function clampProgress(value) {
      return Math.min(100, Math.max(0, Math.round(asNum(value, 0))));
    }
    function isPlainObject(value) {
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    }
    function normalizeStatus(value) {
      const raw = asStr(value).toLowerCase();
      if (raw === 'success' || raw === 'succeed' || raw === 'succeeded' || raw === 'done' || raw === 'completed' || raw === 'complete') return 'succeeded';
      if (raw === 'error' || raw === 'fail' || raw === 'failed') return 'failed';
      if (raw === 'canceled' || raw === 'cancelled') return 'cancelled';
      if (raw === 'expired') return 'expired';
      if (raw === 'running' || raw === 'processing' || raw === 'generating') return 'running';
      if (raw === 'queued' || raw === 'pending' || raw === 'waiting') return 'queued';
      return raw || 'queued';
    }
    function statusMeta(record) {
      const meta = STATUS_META[record && record.status];
      if (!meta) return { label: (record && record.status) || translate('common.unknown'), tone: 'muted', progress: 0 };
      return { label: translate(meta.label), tone: meta.tone, progress: meta.progress };
    }
    function fmtRelative(ts) {
      const n = asNum(ts, 0);
      if (!n) return '';
      const diff = Date.now() - n;
      if (diff < 45 * 1000) return translate('time.justNow');
      if (diff < 3600 * 1000) return translate('time.minutesAgo', { count: Math.max(1, Math.round(diff / 60000)) });
      if (diff < 86400 * 1000) return translate('time.hoursAgo', { count: Math.round(diff / 3600000) });
      if (diff < 7 * 86400 * 1000) return translate('time.daysAgo', { count: Math.round(diff / 86400000) });
      const d = new Date(n);
      return translate('time.monthDay', { month: d.getMonth() + 1, day: d.getDate() });
    }
    function fmtClock(ts) {
      const d = new Date(asNum(ts, Date.now()));
      const pad = (v) => (v < 10 ? '0' + v : '' + v);
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function fmtDuration(seconds) {
      const n = asNum(seconds, NaN);
      if (!Number.isFinite(n) || n < 0) return translate('common.smartDuration');
      return Math.round(n) + translate('common.seconds');
    }
    function shortId(id) {
      const s = asStr(id);
      if (!s) return '';
      return '#' + (s.length > 10 ? s.slice(-6) : s);
    }
    /** 模型说明文案：优先 i18n noteKey，其次宿主下发的 notes。 */
    function noteKeyForModel(model) {
      const id = asStr(model && model.id);
      if (id.indexOf('-2-5-') !== -1) return 'modelNotes.2-5';
      if (id.indexOf('-2-0-fast-') !== -1) return 'modelNotes.2-0-fast';
      if (id.indexOf('-2-0-mini-') !== -1) return 'modelNotes.2-0-mini';
      if (id.indexOf('-2-0-') !== -1) return 'modelNotes.2-0';
      if (id.indexOf('-1-0-pro-fast-') !== -1) return 'modelNotes.1-0-pro-fast';
      if (id.indexOf('-1-0-pro-') !== -1) return 'modelNotes.1-0-pro';
      return '';
    }
    function modelNote(model) {
      if (!model) return '';
      const noteKey = model.noteKey || noteKeyForModel(model);
      if (noteKey) return translate(noteKey);
      return asStr(model.notes);
    }
    function modeLabel(modeId) {
      const found = MODES.find((mode) => mode.id === modeId);
      return found ? translate(found.label) : (modeId || translate('common.generate'));
    }
    function modelLabel(models, modelId) {
      const found = (models || []).find((model) => model.id === modelId);
      return found ? found.label : (modelId || translate('common.defaultModel'));
    }
    function findModel(models, modelId) {
      return (models || []).find((model) => model && model.id === modelId) || null;
    }
    function clampEnum(value, allowed, fallback) {
      return Array.isArray(allowed) && allowed.length && allowed.indexOf(value) !== -1 ? value : fallback;
    }
    function safeNow() { return Date.now(); }
