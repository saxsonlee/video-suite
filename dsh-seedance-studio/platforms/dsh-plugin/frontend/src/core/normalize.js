    // ==========================================================================
    // 数据归一化：/config /history /record
    // ==========================================================================
    function deriveModes(source) {
      const family = asStr(source.family);
      const list = ['text2video'];
      if (source.firstFrame !== false || source.references === true) list.push('image2video');
      if (source.lastFrame !== false) list.push('firstlast');
      if (source.references === true) list.push('reference', 'edit', 'extend');
      if (family === '2.5' || source.draft === true) list.push('draft');
      return list;
    }

    function normalizeModel(raw) {
      if (!isPlainObject(raw)) return null;
      const capabilities = isPlainObject(raw.capabilities) ? raw.capabilities : {};
      const source = Object.assign({}, capabilities, raw);
      const id = asStr(source.id || source.model || source.name).trim();
      if (!id) return null;
      const range = Array.isArray(source.durations) && source.durations.length >= 2
        ? [asNum(source.durations[0], 4), asNum(source.durations[1], 15)]
        : [asNum(source.minDuration, 4), asNum(source.maxDuration, 15)];
      const resolutions = Array.isArray(source.resolutions) && source.resolutions.length
        ? source.resolutions.map(asStr).filter(Boolean)
        : ['480p', '720p'];
      const ratios = Array.isArray(source.ratios) && source.ratios.length
        ? source.ratios.map(asStr).filter(Boolean)
        : RATIO_OPTIONS.map((option) => option.value);
      const outputFormats = Array.isArray(source.outputFormats) && source.outputFormats.length
        ? source.outputFormats.map(asStr).filter(Boolean)
        : ['mp4'];
      const family = asStr(source.family) || '';
      const defaultResolution = clampEnum(asStr(source.defaultResolution || source.default_resolution),
        resolutions, resolutions.indexOf('720p') !== -1 ? '720p' : resolutions[0]);
      const defaultRatio = clampEnum(asStr(source.defaultRatio || source.default_ratio),
        ratios, ratios.indexOf('adaptive') !== -1 ? 'adaptive' : ratios[0]);
      const modes = Array.isArray(source.modes) && source.modes.length
        ? source.modes.map(asStr).filter(Boolean)
        : deriveModes({ family, firstFrame: source.firstFrame, lastFrame: source.lastFrame, references: source.references, draft: source.draft });
      return {
        id,
        label: asStr(source.label || source.title || source.labelZh) || id,
        family,
        durations: [Math.min(range[0], range[1]), Math.max(range[0], range[1])],
        autoDuration: source.autoDuration === true || source.auto_duration === true,
        defaultDuration: asNum(source.defaultDuration !== undefined ? source.defaultDuration : source.default_duration,
          source.autoDuration === true || source.auto_duration === true ? -1 : 5),
        defaultResolution,
        defaultRatio,
        resolutions,
        ratios,
        audio: source.audio !== false,
        audioAlone: source.audioAlone === true || source.audio_alone === true,
        firstFrame: source.firstFrame !== false,
        lastFrame: source.lastFrame !== false,
        references: source.references !== false && (family === '2.5' || family === '2.0' || source.references === true),
        draft: source.draft === true || family === '2.5',
        frames: source.frames === true,
        cameraFixed: source.cameraFixed === true || source.camera_fixed === true,
        flex: source.flex === true,
        outputFormats,
        omniReference: source.omniReference === true || source.omni_reference === true || family === '2.5',
        tools: source.tools === true,
        priority: source.priority === true,
        maxImages: Math.max(0, asNum(source.maxImages !== undefined ? source.maxImages : source.max_images, family === '2.5' ? 30 : 9)),
        maxVideos: Math.max(0, asNum(source.maxVideos !== undefined ? source.maxVideos : source.max_videos, family === '2.5' ? 10 : 3)),
        maxAudios: Math.max(0, asNum(source.maxAudios !== undefined ? source.maxAudios : source.max_audios, family === '2.5' ? 10 : 3)),
        deprecated: source.deprecated === true,
        notes: asStr(source.notes),
        modes,
        raw,
      };
    }

    function normalizeModels(list) {
      if (!Array.isArray(list)) return [];
      const models = [];
      for (const item of list) {
        const model = normalizeModel(item);
        if (model) models.push(model);
      }
      return models;
    }

    /** 设置页勾选的模型清单 → [{id,label}]（容错、去重）。 */
    function normalizeModelChoices(list) {
      if (!Array.isArray(list)) return [];
      const out = [];
      for (const item of list) {
        const id = asStr(item && item.id);
        if (!id || out.some((entry) => entry.id === id)) continue;
        out.push({ id, label: asStr(item && item.label) || id });
      }
      return out;
    }

    function normalizeConfig(payload) {
      const raw = isPlainObject(payload) ? payload : {};
      let models = normalizeModels(raw.models);
      if (!models.length) models = FALLBACK_MODELS.map((model) => normalizeModel(model)).filter(Boolean);
      const rawDefaults = isPlainObject(raw.defaults) ? raw.defaults : {};
      const settings = isPlainObject(raw.settings) ? raw.settings : {};
      const provider = asStr(raw.provider || settings.provider || 'unknown').toLowerCase() || 'unknown';
      const demo = raw.demo === true || provider === 'demo' || (provider === 'unknown' && !asStr(settings.ARK_API_KEY || settings.arkApiKey || settings.RELAY_API_KEY || settings.relayApiKey));
      const defaults = {
        defaultModel: asStr(rawDefaults.defaultModel || raw.defaultModel || settings.DEFAULT_MODEL || settings.defaultModel) || FALLBACK_DEFAULTS.defaultModel,
        enabledModels: normalizeModelChoices(rawDefaults.enabledModels),
        defaultDuration: asNum(rawDefaults.defaultDuration !== undefined ? rawDefaults.defaultDuration : raw.defaultDuration, FALLBACK_DEFAULTS.defaultDuration),
        defaultRatio: asStr(rawDefaults.defaultRatio || raw.defaultRatio) || FALLBACK_DEFAULTS.defaultRatio,
        defaultResolution: asStr(rawDefaults.defaultResolution || raw.defaultResolution) || FALLBACK_DEFAULTS.defaultResolution,
      };
      return {
        provider,
        demo,
        demoReason: asStr(raw.demoReason || settings.demoReason),
        defaultModel: defaults.defaultModel,
        models,
        defaults,
        settings,
        capabilities: isPlainObject(raw.capabilities) ? raw.capabilities : {},
        limits: isPlainObject(raw.limits) ? raw.limits : {},
      };
    }

    function normalizeRecord(raw) {
      if (!isPlainObject(raw) || !raw.id) return null;
      const status = normalizeStatus(raw.status);
      const params = isPlainObject(raw.params) ? raw.params : {};
      const files = isPlainObject(raw.files) ? raw.files : {};
      const meta = isPlainObject(raw.meta) ? raw.meta : {};
      const error = isPlainObject(raw.error) ? raw.error : undefined;
      return {
        id: asStr(raw.id),
        sessionId: asStr(raw.sessionId || raw.session_id),
        createdAt: asNum(raw.createdAt !== undefined ? raw.createdAt : raw.created_at, 0),
        updatedAt: asNum(raw.updatedAt !== undefined ? raw.updatedAt : raw.updated_at, 0),
        status,
        progress: raw.progress !== undefined ? clampProgress(raw.progress) : statusMeta({ status }).progress,
        prompt: asStr(raw.prompt),
        model: asStr(raw.model),
        provider: asStr(raw.provider),
        mode: asStr(raw.mode) || 'text2video',
        params,
        inputs: isPlainObject(raw.inputs) ? raw.inputs : {},
        remoteTaskId: asStr(raw.remoteTaskId || raw.remote_task_id),
        remoteVideoUrl: asStr(raw.remoteVideoUrl || raw.remote_video_url),
        remoteLastFrameUrl: asStr(raw.remoteLastFrameUrl || raw.remote_last_frame_url),
        files,
        meta,
        error,
        originId: asStr(raw.originId || raw.origin_id),
        toolCallId: asStr(raw.toolCallId || raw.tool_call_id),
      };
    }

    function normalizeHistory(payload) {
      const source = isPlainObject(payload) && Array.isArray(payload.records)
        ? payload.records
        : Array.isArray(payload) ? payload : [];
      const records = [];
      for (const item of source) {
        const record = normalizeRecord(item);
        if (record) records.push(record);
      }
      return records;
    }

    function settingsOf(payload) {
      if (isPlainObject(payload) && isPlainObject(payload.settings)) return payload.settings;
      return isPlainObject(payload) ? payload : {};
    }
    function readSetting(settings, keys) {
      const source = isPlainObject(settings) ? settings : {};
      for (const key of keys) {
        const value = source[key];
        if (value !== undefined && value !== null && value !== '') {
          if (typeof value === 'boolean') return value;
          return asStr(value);
        }
      }
      return '';
    }

