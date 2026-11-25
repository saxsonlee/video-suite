    // ==========================================================================
    // 表单模型：默认参数、模型能力约束、GenerateRequest 构造
    // ==========================================================================
    function makeParams(model, defaults, overrides) {
      const safeDefaults = defaults || FALLBACK_DEFAULTS;
      const base = {
        resolution: (model && model.defaultResolution) || safeDefaults.defaultResolution || '720p',
        ratio: (model && model.defaultRatio) || safeDefaults.defaultRatio || 'adaptive',
        duration: model && model.autoDuration ? -1 : asNum(model && model.defaultDuration, asNum(safeDefaults.defaultDuration, 5)),
        autoDuration: !!(model && model.autoDuration),
        generateAudio: !!(model && model.audio),
        seed: '',
        watermark: false,
        returnLastFrame: !!(model && model.family === '2.5'),
        cameraFixed: false,
        priority: '',
        outputFormat: (model && model.outputFormats && model.outputFormats[0]) || 'mp4',
        draft: false,
        omniType: 'auto',
      };
      const merged = Object.assign(base, overrides || {});
      for (const key of Object.keys(merged)) {
        if (merged[key] === undefined) delete merged[key];
      }
      return merged;
    }

    /** 设置页勾选的「已选模型清单」→ [{id,label}]（容错、去重）。 */
    function enabledModelChoices(defaults) {
      const list = defaults && Array.isArray(defaults.enabledModels) ? defaults.enabledModels : [];
      const out = [];
      for (const item of list) {
        const id = asStr(item && item.id);
        if (!id || out.some((entry) => entry.id === id)) continue;
        out.push({ id, label: asStr(item && item.label) || id });
      }
      return out;
    }

    function createEmptyForm(models, defaults) {
      const safeModels = Array.isArray(models) && models.length ? models : FALLBACK_MODELS;
      const enabled = enabledModelChoices(defaults);
      const defaultModelId = asStr(defaults && defaults.defaultModel);
      // 已选模型清单非空时：默认模型优先用清单内的配置，不在清单则用清单首项（主面板下拉只显示清单）
      const preferredId = enabled.length
        ? (enabled.some((item) => item.id === defaultModelId) ? defaultModelId : enabled[0].id)
        : defaultModelId;
      const knownDefault = findModel(safeModels, preferredId);
      const model = knownDefault || safeModels[0];
      const customDefault = !knownDefault && preferredId ? preferredId : '';
      return {
        mode: 'text2video',
        prompt: '',
        modelId: knownDefault ? knownDefault.id : customDefault ? '__custom__' : (model ? model.id : FALLBACK_DEFAULTS.defaultModel),
        customModel: customDefault,
        params: makeParams(model, defaults || FALLBACK_DEFAULTS, null),
        assets: { first: null, last: null, refs: [], videoUrl: '', audio: null },
      };
    }

    /** 模型/参数联动约束：切换模型或配置刷新后收敛到合法值。 */
    function sanitizeForm(form, models, defaults) {
      const safeModels = Array.isArray(models) && models.length ? models : FALLBACK_MODELS;
      const current = form && typeof form === 'object' ? form : createEmptyForm(safeModels, defaults);
      const enabled = enabledModelChoices(defaults);
      const currentCustom = asStr(current.customModel);
      let model = findModel(safeModels, current.modelId) || findModel(safeModels, defaults && defaults.defaultModel) || safeModels[0];
      let modelId = model ? model.id : current.modelId;
      // 已选模型清单非空时：不在清单里的旧选择收敛到清单首项（下拉只显示清单模型）
      if (enabled.length && !currentCustom && !enabled.some((item) => item.id === modelId)) {
        model = findModel(safeModels, enabled[0].id) || model;
        modelId = enabled[0].id;
      }
      const nextParams = makeParams(model, defaults, current.params);
      const modelResolutions = model && Array.isArray(model.resolutions) && model.resolutions.length ? model.resolutions : null;
      const modelRatios = model && Array.isArray(model.ratios) && model.ratios.length ? model.ratios : null;
      const modelOutputFormats = model && Array.isArray(model.outputFormats) && model.outputFormats.length ? model.outputFormats : ['mp4'];
      const modelDurations = model && Array.isArray(model.durations) && model.durations.length ? model.durations : [4, 15];
      nextParams.resolution = clampEnum(nextParams.resolution, modelResolutions,
        (model && model.defaultResolution) || FALLBACK_DEFAULTS.defaultResolution);
      nextParams.ratio = clampEnum(nextParams.ratio, modelRatios,
        (model && model.defaultRatio) || FALLBACK_DEFAULTS.defaultRatio);
      if (!model || !model.audio) nextParams.generateAudio = false;
      if (!model || !model.cameraFixed) nextParams.cameraFixed = false;
      if (!model || !model.draft) nextParams.draft = false;
      if (!model || !model.omniReference) nextParams.omniType = 'auto';
      if (modelOutputFormats.indexOf(nextParams.outputFormat) === -1) {
        nextParams.outputFormat = modelOutputFormats[0] || 'mp4';
      }
      const durationRange = modelDurations;
      if (nextParams.autoDuration && model && model.autoDuration) {
        nextParams.duration = -1;
      } else {
        nextParams.autoDuration = false;
        nextParams.duration = Math.round(clampNumber(nextParams.duration, durationRange[0], durationRange[1],
          asNum(model && model.defaultDuration, 5)));
      }
      const currentAssets = isPlainObject(current.assets) ? current.assets : {};
      const assets = {
        first: currentAssets.first || null,
        last: currentAssets.last || null,
        refs: Array.isArray(currentAssets.refs) ? currentAssets.refs : [],
        videoUrl: asStr(currentAssets.videoUrl),
        audio: currentAssets.audio || null,
      };
      if (model && model.maxImages > 0) assets.refs = assets.refs.slice(0, model.maxImages);
      return Object.assign({}, current, { modelId, params: nextParams, assets });
    }

    /** 生成侧校验（返回错误文案，null 表示通过）。 */
    function validateForm(form, sessionId, models) {
      if (!sessionId) return translate('form.needSession');
      if (!form || !asStr(form.prompt).trim()) return translate('form.promptRequired');
      if (asStr(form.prompt).length > MAX_PROMPT_CHARS) return translate('form.promptTooLong', { max: MAX_PROMPT_CHARS });
      const customModel = asStr(form.customModel).trim();
      const model = findModel(models, form.modelId) || (customModel ? FALLBACK_MODELS[0] : null);
      if (!model) return customModel ? null : translate('form.chooseModel');
      const tab = form.mode || 'text2video';
      const subMode = tab === 'edit' ? (form.subMode === 'extend' ? 'extend' : 'edit') : tab;
      const constraints = deriveConstraints(model, subMode);
      const allowed = tab === 'edit'
        ? constraints.availableModes.indexOf('edit') !== -1 || constraints.availableModes.indexOf('extend') !== -1
        : constraints.availableModes.indexOf(tab) !== -1;
      if (!allowed) return translate('form.modeUnsupported', { mode: modeLabel(tab) });
      const assets = form.assets || {};
      if (tab === 'image2video' && !assets.first) return translate('form.image2videoNeedsFirst');
      if (tab === 'firstlast' && !assets.first) return translate('form.firstlastNeedsFirst');
      if (tab === 'reference') {
        const refs = (assets.refs || []).filter((item) => item && item.dataUrl);
        const hasVideo = !!asStr(assets.videoUrl).trim();
        const hasAudio = !!(assets.audio && assets.audio.dataUrl);
        if (!refs.length && !hasVideo && !hasAudio) return translate('form.referenceNeedsMaterial');
        if (refs.length > constraints.maxImages) return translate('form.tooManyRefs', { max: constraints.maxImages });
        if (hasVideo && !constraints.canReferenceVideo) return translate('form.noVideoRef');
        if (hasAudio && !constraints.showAudio) return translate('form.noAudioRef');
        if (model.family === '2.0' && hasAudio && !refs.length && !hasVideo) {
          return translate('form.audio20NeedsMedia');
        }
      }
      if (tab === 'edit' || tab === 'extend' || (tab === 'edit' && form.subMode === 'extend')) {
        const url = asStr(assets.videoUrl).trim();
        if (!url) return translate('form.editNeedsVideo');
        if (!/^https?:\/\//i.test(url) && !/^asset:\/\//i.test(url)) return translate('form.videoUrlScheme');
        if (url.length > 4096) return translate('form.videoUrlTooLong');
        if (!constraints.canReferenceVideo) return translate('form.noVideoRef');
      }
      if (tab === 'draft' && !constraints.showDraft) return translate('form.noDraft');
      return null;
    }

    /** 当前模式下的联动约束（UI 控件禁用/锁定规则，见 models-ui-matrix.md §4.4）。 */
    function deriveConstraints(model, mode) {
      const safeModel = model || FALLBACK_MODELS[0];
      const modes = Array.isArray(safeModel.modes) && safeModel.modes.length
        ? safeModel.modes.slice()
        : deriveModes(safeModel.raw || safeModel);
      const isEditFamily = mode === 'edit' || mode === 'extend';
      const lockRatio = mode === 'firstlast' || isEditFamily;
      const lockDuration = mode === 'edit' && safeModel.family === '2.5';
      const draftMode = mode === 'draft';
      const resolutions = draftMode ? ['480p'] : (safeModel.resolutions || ['480p', '720p']).slice();
      let ratios = (safeModel.ratios || ['adaptive']).slice();
      if (lockRatio) ratios = ['adaptive'];
      if (safeModel.family === '1.0' && mode === 'text2video') ratios = ratios.filter((item) => item !== 'adaptive');
      return {
        modes,
        availableModes: modes.slice(),
        ratios,
        resolutions,
        lockRatio,
        lockDuration,
        draftMode,
        showAudio: safeModel.audio === true,
        showDraft: modes.indexOf('draft') !== -1,
        showOutputFormat: (safeModel.outputFormats || []).length > 1,
        maxImages: safeModel.maxImages || 0,
        maxVideos: safeModel.maxVideos || 0,
        maxAudios: safeModel.maxAudios || 0,
        canReferenceVideo: (safeModel.maxVideos || 0) > 0,
      };
    }

    /** 模式或模型变化后收敛参数（比例锁 adaptive、编辑锁智能时长、样片锁 480p 等）。 */
    function applyModeConstraints(form, models) {
      const model = findModel(models, form.modelId) || FALLBACK_MODELS[0];
      const mode = form.mode === 'edit' ? 'edit' : form.mode;
      const constraints = deriveConstraints(model, mode);
      const params = Object.assign({}, form.params);
      params.resolution = clampEnum(params.resolution, constraints.resolutions,
        constraints.resolutions.indexOf('720p') !== -1 ? '720p' : constraints.resolutions[0]);
      params.ratio = clampEnum(params.ratio, constraints.ratios, constraints.ratios[0] || 'adaptive');
      if (constraints.lockRatio) params.ratio = 'adaptive';
      if (constraints.lockDuration) { params.duration = -1; params.autoDuration = true; }
      if (!constraints.showAudio) params.generateAudio = false;
      if (constraints.draftMode) params.resolution = '480p';
      if (!constraints.showOutputFormat) params.outputFormat = 'mp4';
      const next = Object.assign({}, form, { params });
      if (form.mode === 'edit') {
        if (constraints.availableModes.indexOf('edit') === -1 && constraints.availableModes.indexOf('extend') === -1) {
          next.mode = 'text2video';
        }
      } else if (constraints.availableModes.indexOf(form.mode) === -1) {
        next.mode = 'text2video';
      }
      return next;
    }

    function estimateCost(model, params) {
      const table = COST_TABLE[model && model.id];
      if (!table) return null;
      const resolution = params && params.resolution;
      const base = table[resolution];
      if (!base) return null;
      const duration = params.autoDuration ? 5 : asNum(params.duration, 5);
      return base * (duration / 5);
    }

    /** 把 UI 表单转换为 PLAN §4 的 GenerateRequest。 */
    function buildGenerateRequest(form, models, sessionId) {
      const model = findModel(models, form.modelId);
      const p = form.params || {};
      const tab = form.mode || 'text2video';
      const subMode = tab === 'edit' ? (form.subMode === 'extend' ? 'extend' : 'edit') : tab;
      const constraints = deriveConstraints(model, subMode);
      const params = {
        resolution: tab === 'draft' ? '480p' : clampEnum(p.resolution, constraints.resolutions,
          constraints.resolutions.indexOf('720p') !== -1 ? '720p' : constraints.resolutions[0]),
        ratio: constraints.lockRatio ? 'adaptive' : clampEnum(p.ratio, constraints.ratios, 'adaptive'),
        duration: constraints.lockDuration ? -1 : (p.autoDuration ? -1 : Math.round(asNum(p.duration, 5))),
        generateAudio: !!p.generateAudio && constraints.showAudio,
        watermark: !!p.watermark,
        returnLastFrame: !!p.returnLastFrame,
      };
      if (p.seed !== '' && p.seed !== null && p.seed !== undefined) {
        const seed = Math.trunc(asNum(p.seed, -1));
        if (seed >= 0) params.seed = seed;
      }
      const assets = form.assets || {};
      const images = [];
      const inputs = {};
      if (tab === 'image2video' && assets.first) {
        images.push({ role: 'first_frame', dataUrl: assets.first.dataUrl });
      } else if (tab === 'firstlast') {
        if (assets.first) images.push({ role: 'first_frame', dataUrl: assets.first.dataUrl });
        if (assets.last) images.push({ role: 'last_frame', dataUrl: assets.last.dataUrl });
      } else if (tab === 'reference' || tab === 'draft') {
        for (const item of assets.refs || []) {
          if (item && item.dataUrl) images.push({ role: 'reference_image', dataUrl: item.dataUrl });
        }
      }
      if (images.length) inputs.images = images;
      const videoUrl = asStr(assets.videoUrl).trim();
      if (videoUrl && (tab === 'reference' || tab === 'edit' || tab === 'extend')) {
        inputs.video = { url: videoUrl };
      }
      if (assets.audio && assets.audio.dataUrl && tab === 'reference') inputs.audio = { dataUrl: assets.audio.dataUrl };
      const mode = tab === 'draft' ? 'draft' : subMode;
      const body = {
        sessionId: asStr(sessionId),
        prompt: asStr(form.prompt).trim(),
        model: form.customModel && asStr(form.customModel).trim() ? asStr(form.customModel).trim() : form.modelId,
        mode,
        params,
        inputs,
      };
      return body;
    }

    /** 样片转正片（PLAN §4 draft-final：draftTaskId + 1080p，禁止 prompt/素材）。 */
    function buildDraftFinalRequest(draftRecord, sessionId) {
      if (!draftRecord) return null;
      // 必须是远端样片任务 ID（sd_ 本地记录 id 不是有效 draftTaskId）
      const draftTaskId = asStr(draftRecord.remoteTaskId).trim();
      if (!draftTaskId) return null;
      const sourceParams = draftRecord.params || {};
      const params = { resolution: '1080p' };
      if (typeof sourceParams.watermark === 'boolean') params.watermark = sourceParams.watermark;
      if (asStr(sourceParams.outputFormat) === 'mov' || asStr(sourceParams.outputFormat) === 'mp4') {
        params.outputFormat = asStr(sourceParams.outputFormat);
      }
      return {
        sessionId: asStr(sessionId),
        model: asStr(draftRecord.model),
        mode: 'draft-final',
        draftTaskId,
        params,
      };
    }

