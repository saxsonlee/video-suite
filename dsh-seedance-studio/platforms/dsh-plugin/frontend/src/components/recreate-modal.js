    // ==========================================================================
    // 再创作弹窗（PLAN §7：抽帧 → 首帧/参考图；或参考视频 / 仅继承参数）
    // ==========================================================================
    function RecreateModal(props) {
      const record = props.record;
      const models = Array.isArray(props.models) && props.models.length ? props.models : FALLBACK_MODELS;
      const sourceModel = findModel(models, record.model) || models[0];
      const sourceParams = record.params || {};
      const initialFrame = props.initialFrame && props.initialFrame.frameDataUrl;
      const state = {
        prompt: React.useState(asStr(record.prompt)),
        way: React.useState(initialFrame ? 'first' : 'auto'),
        frame: React.useState(initialFrame || null),
        modelId: React.useState(sourceModel.id),
        resolution: React.useState(clampEnum(asStr(sourceParams.resolution), sourceModel.resolutions, sourceModel.defaultResolution)),
        ratio: React.useState(clampEnum(asStr(sourceParams.ratio), sourceModel.ratios, sourceModel.defaultRatio)),
        autoDuration: React.useState(sourceParams.autoDuration === true && sourceModel.autoDuration),
        duration: React.useState(asNum(sourceParams.duration, asNum(sourceModel.defaultDuration, 5))),
        generateAudio: React.useState(sourceParams.generateAudio === true && sourceModel.audio),
        watermark: React.useState(sourceParams.watermark === true),
      };
      const prompt = state.prompt[0];
      const setPrompt = state.prompt[1];
      const way = state.way[0];
      const setWay = state.way[1];
      const frame = state.frame[0];
      const setFrame = state.frame[1];
      const modelId = state.modelId[0];
      const setModelId = state.modelId[1];
      const resolution = state.resolution[0];
      const setResolution = state.resolution[1];
      const ratio = state.ratio[0];
      const setRatio = state.ratio[1];
      const autoDuration = state.autoDuration[0];
      const setAutoDuration = state.autoDuration[1];
      const duration = state.duration[0];
      const setDuration = state.duration[1];
      const generateAudio = state.generateAudio[0];
      const setGenerateAudio = state.generateAudio[1];
      const watermark = state.watermark[0];
      const setWatermark = state.watermark[1];
      const videoRef = React.useRef(null);
      const busyState = React.useState(false);
      const busy = busyState[0];
      const setBusy = busyState[1];
      const timeState = React.useState(0);
      const setTime = timeState[1];
      const durationVideoState = React.useState(0);
      const durationVideo = durationVideoState[0];
      const setDurationVideo = durationVideoState[1];
      const [error, setError] = React.useState(null);
      const model = findModel(models, modelId) || sourceModel;
      const remoteUrl = asStr(record.remoteVideoUrl);
      const sourceAge = safeNow() - asNum(record.updatedAt || record.createdAt, 0);
      const remoteFresh = !!remoteUrl && sourceAge >= 0 && sourceAge < 24 * 60 * 60 * 1000;
      const wayOptions = [
        { id: 'auto', title: translate('recreate.wayAuto'), desc: translate('recreate.wayAutoDesc'), enabled: true },
        { id: 'first', title: translate('recreate.wayFirst'), desc: translate('recreate.wayFirstDesc'), enabled: !!frame },
        { id: 'ref', title: translate('recreate.wayRef'), desc: translate('recreate.wayRefDesc'), enabled: !!frame },
        { id: 'video', title: translate('recreate.wayVideo'), desc: remoteFresh ? translate('recreate.remoteFresh') : translate('recreate.remoteStale'), enabled: !!remoteUrl && remoteFresh },
      ];
      const capture = async (which) => {
        setBusy(true);
        try {
          let time = 0;
          if (which === 'current') time = videoRef.current ? videoRef.current.currentTime : 0;
          else if (which === 'last') time = Math.max(0, (durationVideo || (videoRef.current && videoRef.current.duration) || 0) - 0.12);
          const dataUrl = await captureVideoFrame(videoRef.current, time);
          setFrame(dataUrl);
          setError(null);
        } catch (captureError) {
          setError(captureError && captureError.message ? captureError.message : translate('toast.captureFailed'));
        } finally {
          setBusy(false);
        }
      };
      const submit = () => {
        const textValue = asStr(prompt).trim();
        if (!textValue) { setError(translate('form.promptRequired')); return; }
        if ((way === 'first' || way === 'ref') && !frame) { setError(translate('recreate.needFrame')); return; }
        const params = {
          resolution: clampEnum(resolution, model.resolutions, model.defaultResolution),
          ratio: clampEnum(ratio, model.ratios, model.defaultRatio),
          duration: autoDuration ? -1 : Math.round(clampNumber(duration, model.durations[0], model.durations[1], 5)),
          generateAudio: !!generateAudio && model.audio,
          watermark: !!watermark,
          returnLastFrame: true,
        };
        if (way === 'first') {
          props.onSubmit({
            kind: 'generate',
            body: {
              sessionId: props.sessionId,
              prompt: textValue,
              model: model.id,
              mode: 'image2video',
              params,
              inputs: { images: [{ role: 'first_frame', dataUrl: frame }] },
              sourceId: record.id,
            },
          });
        } else if (way === 'ref') {
          props.onSubmit({
            kind: 'generate',
            body: {
              sessionId: props.sessionId,
              prompt: textValue,
              model: model.id,
              mode: 'reference',
              params: Object.assign({}, params, { duration: autoDuration ? -1 : params.duration }),
              inputs: { images: [{ role: 'reference_image', dataUrl: frame }] },
              sourceId: record.id,
            },
          });
        } else if (way === 'video') {
          // 走 /recreate + mode=reference：宿主复用远端视频并写入 originId（卡片显示「改自 #xxxx」）
          props.onSubmit({
            kind: 'recreate',
            body: {
              sessionId: props.sessionId,
              sourceId: record.id,
              prompt: textValue,
              model: model.id,
              mode: 'reference',
              params,
            },
          });
        } else {
          props.onSubmit({
            kind: 'recreate',
            body: {
              sessionId: props.sessionId,
              sourceId: record.id,
              prompt: textValue,
              model: model.id,
              params,
            },
          });
        }
      };
      const resolutionOptions = (model.resolutions || []).map((value) => ({ value, label: value }));
      const ratioOptions = RATIO_OPTIONS.filter((option) => (model.ratios || []).indexOf(option.value) !== -1);
      return h(Modal, {
        open: true,
        onClose: props.onClose,
        size: 'lg',
        icon: 'recreate',
        title: translate('recreate.title', { title: asStr(record.prompt) ? asStr(record.prompt).slice(0, 28) : shortId(record.id) }),
        subtitle: translate('recreate.subtitle', { id: shortId(record.id), model: modelLabel(models, record.model), time: fmtRelative(record.createdAt) }),
        testid: 'sd-recreate-modal',
        hook: 'recreate-modal',
        dataAttrs: { 'data-seedance-recreate-modal': '' },
        closeTestid: 'sd-recreate-close',
        footer: h(React.Fragment, null,
          h('span', { className: 'grow', style: { fontSize: '11px', color: 'var(--sd-text-3)' } },
            way === 'auto' ? translate('recreate.autoNote') : translate('recreate.generateNote')),
          h(IconButton, { icon: 'close', label: translate('action.cancel'), onClick: props.onClose, testid: 'sd-recreate-cancel' }, translate('action.cancel')),
          h(IconButton, {
            icon: 'sparkles',
            label: translate('action.createRecreate'),
            variant: 'primary',
            onClick: submit,
            disabled: props.submitting === true,
            testid: 'sd-recreate-submit',
            hook: 'recreate-submit',
          }, props.submitting ? translate('common.creating') : translate('action.createRecreateShort')),
        ),
      },
        h('div', { className: 'dsh-sd-split' },
          h('div', null,
            h('div', { className: 'dsh-sd-player-stage' },
              h('video', {
                ref: videoRef,
                src: recordVideoSrc(record),
                controls: true,
                playsInline: true,
                preload: 'metadata',
                poster: recordPoster(record) || undefined,
                onLoadedMetadata: (event) => {
                  const media = event.currentTarget;
                  setDurationVideo(Number.isFinite(media.duration) ? media.duration : 0);
                },
                onTimeUpdate: (event) => setTime(event.currentTarget.currentTime || 0),
                'data-testid': 'sd-recreate-video',
              }),
            ),
            h('div', { className: 'dsh-sd-frame-tools', style: { marginTop: '9px' } },
              h(IconButton, { icon: 'framesPick', label: translate('action.captureFirst'), onClick: () => capture('first'), disabled: busy, testid: 'sd-recreate-capture-first' }, translate('common.firstFrame')),
              h(IconButton, { icon: 'framesPick', label: translate('action.captureCurrent'), onClick: () => capture('current'), disabled: busy, testid: 'sd-recreate-capture-current' }, translate('common.currentFrame')),
              h(IconButton, { icon: 'framesPick', label: translate('action.captureLast'), onClick: () => capture('last'), disabled: busy, testid: 'sd-recreate-capture-last' }, translate('common.lastFrame')),
            ),
            h('div', { className: 'dsh-sd-frame-preview', style: { marginTop: '9px' }, 'data-testid': 'sd-recreate-frame' },
              busy ? h(Spinner, { label: translate('common.capturing') })
                : frame ? h('img', { src: frame, alt: translate('player.framePreview') })
                : translate('recreate.pickFrame'),
            ),
            error ? h(HintLine, { kind: 'error' }, error) : null,
          ),
          h('div', null,
            h('div', { className: 'dsh-sd-section dsh-sd-section-tight' },
              h('div', { className: 'dsh-sd-section-head' }, h('span', { className: 'dsh-sd-section-title' }, translate('recreate.sectionRef'))),
              h('div', { className: 'dsh-sd-way-grid' },
                wayOptions.map((option) => h('button', {
                  key: option.id,
                  type: 'button',
                  className: 'dsh-sd-way',
                  'data-active': way === option.id,
                  disabled: !option.enabled,
                  title: option.enabled ? option.desc : translate('recreate.unavailable', { desc: option.desc }),
                  onClick: () => { if (option.enabled) setWay(option.id); },
                  'data-testid': 'sd-recreate-way-' + option.id,
                  'data-seedance-recreate-way': option.id,
                }, h('span', null, option.title), h('small', null, option.desc))),
              ),
            ),
            h('div', { className: 'dsh-sd-section dsh-sd-section-tight' },
              h('div', { className: 'dsh-sd-section-head' }, h('span', { className: 'dsh-sd-section-title' }, translate('recreate.sectionPrompt'))),
              h('textarea', {
                className: 'dsh-sd-prompt',
                style: { minHeight: '78px' },
                value: prompt,
                maxLength: MAX_PROMPT_CHARS,
                onChange: (event) => setPrompt(event.target.value),
                'aria-label': translate('recreate.promptAria'),
                'data-testid': 'sd-recreate-prompt',
              }),
              h('span', { className: 'dsh-sd-prompt-count' }, asStr(prompt).length + ' / ' + MAX_PROMPT_CHARS),
            ),
            h('div', { className: 'dsh-sd-section dsh-sd-section-tight' },
              h('div', { className: 'dsh-sd-section-head' }, h('span', { className: 'dsh-sd-section-title' }, translate('recreate.sectionParams'))),
              h('div', { className: 'dsh-sd-rows' },
                h(Field, { label: translate('params.model') },
                  h('select', {
                    className: 'dsh-sd-select',
                    value: modelId,
                    onChange: (event) => {
                      const nextId = event.target.value;
                      setModelId(nextId);
                      const nextModel = findModel(models, nextId) || sourceModel;
                      setResolution(clampEnum(resolution, nextModel.resolutions, nextModel.defaultResolution));
                      setRatio(clampEnum(ratio, nextModel.ratios, nextModel.defaultRatio));
                    },
                    'aria-label': translate('recreate.modelAria'),
                    'data-testid': 'sd-recreate-model',
                  }, models.map((item) => h('option', { key: item.id, value: item.id }, item.label))),
                ),
                h('div', { className: 'dsh-sd-params' },
                  h(Field, { label: translate('params.resolution') }, h(Segmented, {
                    value: resolution,
                    options: resolutionOptions,
                    onChange: setResolution,
                    label: translate('recreate.resolutionAria'),
                  })),
                  h(Field, { label: translate('params.ratio') }, h('select', {
                    className: 'dsh-sd-select',
                    value: ratio,
                    onChange: (event) => setRatio(event.target.value),
                    'aria-label': translate('recreate.ratioAria'),
                  }, ratioOptions.map((option) => h('option', { key: option.value, value: option.value }, translate(option.label))))),
                  h(Field, { label: translate('params.duration') },
                    h('div', { className: 'dsh-sd-duration-line' },
                      h('input', {
                        className: 'dsh-sd-range',
                        type: 'range',
                        min: model.durations[0],
                        max: model.durations[1],
                        step: 1,
                        value: autoDuration ? model.durations[0] : Math.min(model.durations[1], Math.max(model.durations[0], asNum(duration, 5))),
                        onChange: (event) => { setAutoDuration(false); setDuration(asNum(event.target.value, 5)); },
                        disabled: autoDuration,
                        'aria-label': translate('recreate.durationAria'),
                      }),
                      h('span', { style: { fontSize: '11px', color: 'var(--sd-text-3)' } }, autoDuration ? translate('common.smart') : fmtDuration(duration)),
                      model.autoDuration ? h('label', { className: 'dsh-sd-inline-check' },
                        h('input', {
                          type: 'checkbox',
                          checked: autoDuration,
                          onChange: (event) => setAutoDuration(event.target.checked),
                        }), translate('common.smart')) : null,
                    ),
                  ),
                ),
                h(SwitchRow, {
                  label: translate('params.audio'),
                  checked: generateAudio && model.audio,
                  onChange: setGenerateAudio,
                  disabled: !model.audio,
                  testid: 'sd-recreate-audio',
                }),
                h(SwitchRow, {
                  label: translate('params.watermark'),
                  checked: watermark,
                  onChange: setWatermark,
                  testid: 'sd-recreate-watermark',
                }),
              ),
            ),
          ),
        ),
      );
    }

