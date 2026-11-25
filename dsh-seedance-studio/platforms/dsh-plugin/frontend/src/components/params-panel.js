    // ==========================================================================
    // 参数面板
    // ==========================================================================
    function ParamsPanel(props) {
      const form = props.form;
      const models = props.models;
      const model = props.model;
      const constraints = props.constraints;
      const params = form.params;
      const advancedState = React.useState(false);
      const advancedOpen = advancedState[0];
      const setAdvancedOpen = advancedState[1];
      const custom = props.customModel || '';
      const patchParams = (patch) => props.onPatch({ params: Object.assign({}, params, patch) });
      const modelOptions = (models || []).map((item) => ({
        value: item.id,
        label: item.label + (item.deprecated ? translate('params.deprecated') : ''),
      }));
      modelOptions.push({ value: '__custom__', label: translate('params.customModelOption') });
      const modelSelectValue = modelOptions.some((option) => option.value === form.modelId) && !custom ? form.modelId : '__custom__';
      const showCustom = modelSelectValue === '__custom__' || !!custom;
      const durationValue = params.autoDuration ? (model && model.autoDuration ? -1 : asNum(model && model.defaultDuration, 5)) : asNum(params.duration, 5);
      const minDuration = model ? model.durations[0] : 4;
      const maxDuration = model ? model.durations[1] : 15;
      const estimate = props.estimate;
      const audioSupported = constraints.showAudio;
      const resolutionOptions = (constraints.resolutions || []).map((value) => ({ value, label: value }));
      const ratioOptions = RATIO_OPTIONS.filter((option) => (constraints.ratios || []).indexOf(option.value) !== -1);
      const showRatioLocked = constraints.lockRatio && (constraints.ratios || []).length <= 1;

      return h('div', { className: 'dsh-sd-section', 'data-seedance-params': '' },
        h('div', { className: 'dsh-sd-section-head' },
          h('span', { className: 'dsh-sd-section-title' }, translate('params.title')),
          props.demo ? h('span', { className: 'dsh-sd-section-hint', style: { color: 'var(--sd-warn)' } }, translate('status.demo')) : null,
        ),
        h('div', { className: 'dsh-sd-rows' },
          h(Field, { label: translate('params.model') },
            h('select', {
              className: 'dsh-sd-select',
              value: modelSelectValue,
              onChange: (event) => props.onSelectModel(event.target.value),
              disabled: props.disabled,
              'aria-label': translate('params.modelAria'),
              'data-testid': 'sd-model',
              'data-seedance-control': 'model',
            }, modelOptions.map((option) => h('option', { key: option.value, value: option.value }, option.label))),
            showCustom ? h('div', { className: 'dsh-sd-custom-model' },
              h('input', {
                className: 'dsh-sd-input',
                type: 'text',
                value: custom,
                placeholder: translate('params.customModelPlaceholder'),
                onChange: (event) => props.onCustomModelChange(event.target.value),
                disabled: props.disabled,
                'aria-label': translate('params.customModelAria'),
                'data-testid': 'sd-custom-model',
              }),
            ) : null,
            model && (model.noteKey || model.notes) ? h('div', { className: 'dsh-sd-material-tip' }, modelNote(model)) : null,
          ),
          h('div', { className: 'dsh-sd-params' },
            h(Field, { label: translate('params.resolution') },
              h(Segmented, {
                value: params.resolution,
                options: resolutionOptions,
                onChange: (value) => patchParams({ resolution: value }),
                disabled: props.disabled || constraints.draftMode,
                label: translate('params.resolution'),
                testid: 'sd-resolution',
                hook: 'resolution',
              }),
            ),
            h(Field, { label: translate('params.ratio') },
              showRatioLocked
                ? h('div', { className: 'dsh-sd-input', style: { display: 'flex', alignItems: 'center', height: '34px', color: 'var(--sd-text-3)', cursor: 'not-allowed' }, title: translate('params.ratioLockedTip'), 'data-testid': 'sd-ratio-locked' }, translate('params.ratioLocked'))
                : h('select', {
                    className: 'dsh-sd-select',
                    value: params.ratio,
                    onChange: (event) => patchParams({ ratio: event.target.value }),
                    disabled: props.disabled,
                    'aria-label': translate('params.ratioAria'),
                    'data-testid': 'sd-ratio',
                    'data-seedance-control': 'ratio',
                  }, ratioOptions.map((option) => h('option', { key: option.value, value: option.value }, translate(option.label)))),
            ),
            h(Field, { label: translate('params.duration'), span2: true },
              h('div', { className: 'dsh-sd-duration-line' },
                h('input', {
                  className: 'dsh-sd-range',
                  type: 'range',
                  min: minDuration,
                  max: maxDuration,
                  step: 1,
                  value: Math.min(maxDuration, Math.max(minDuration, durationValue < 0 ? minDuration : durationValue)),
                  onChange: (event) => patchParams({ duration: Math.round(asNum(event.target.value, minDuration)), autoDuration: false }),
                  disabled: props.disabled || (model && model.autoDuration && params.autoDuration) || constraints.lockDuration,
                  'aria-label': translate('params.durationAria'),
                  'data-testid': 'sd-duration',
                  'data-seedance-control': 'duration',
                }),
                h('input', {
                  className: 'dsh-sd-input',
                  type: 'number',
                  min: minDuration,
                  max: maxDuration,
                  step: 1,
                  value: params.autoDuration ? -1 : durationValue,
                  onChange: (event) => {
                    const raw = event.target.value;
                    if (raw === '' || raw === '-') { patchParams({ duration: raw, autoDuration: false }); return; }
                    const number = Math.round(asNum(raw, minDuration));
                    patchParams({ duration: Math.min(maxDuration, Math.max(minDuration, number)), autoDuration: false });
                  },
                  disabled: props.disabled || (model && model.autoDuration && params.autoDuration) || constraints.lockDuration,
                  'aria-label': translate('params.durationSecondsAria'),
                }),
                h('span', { className: 'dsh-sd-duration-unit' }, translate('common.seconds')),
                (model && model.autoDuration) ? h('label', { className: 'dsh-sd-inline-check', title: translate('params.autoDurationTip') },
                  h('input', {
                    type: 'checkbox',
                    checked: params.autoDuration === true,
                    onChange: (event) => patchParams({ autoDuration: event.target.checked, duration: event.target.checked ? -1 : asNum(model.defaultDuration, minDuration) }),
                    disabled: props.disabled || constraints.lockDuration,
                    'data-testid': 'sd-auto-duration',
                    'data-seedance-control': 'auto-duration',
                  }),
                  translate('common.smart'),
                ) : null,
              ),
              (params.autoDuration || constraints.lockDuration) ? h(HintLine, { kind: 'muted' }, translate('params.smartHint', { min: minDuration, max: maxDuration })) : null,
            ),
            h(SwitchRow, {
              label: translate('params.audio'),
              hint: audioSupported ? translate('params.audioOn') : translate('params.audioOff'),
              checked: params.generateAudio === true && audioSupported,
              onChange: (value) => patchParams({ generateAudio: value }),
              disabled: props.disabled || !audioSupported,
              testid: 'sd-generate-audio',
              hook: 'generate-audio',
            }),
            h(SwitchRow, {
              label: translate('params.watermark'),
              hint: translate('params.watermarkHint'),
              checked: params.watermark === true,
              onChange: (value) => patchParams({ watermark: value }),
              disabled: props.disabled,
              testid: 'sd-watermark',
              hook: 'watermark',
            }),
            h(SwitchRow, {
              label: translate('params.lastFrame'),
              hint: translate('params.lastFrameHint'),
              checked: params.returnLastFrame === true,
              onChange: (value) => patchParams({ returnLastFrame: value }),
              disabled: props.disabled,
              testid: 'sd-return-lastframe',
              hook: 'return-last-frame',
            }),
          ),
          h('button', {
            type: 'button',
            className: 'dsh-sd-adv-toggle',
            onClick: () => setAdvancedOpen((value) => !value),
            'aria-expanded': advancedOpen,
            'data-testid': 'sd-advanced-toggle',
          }, h(Icon, { name: advancedOpen ? 'chevronDown' : 'chevronRight', size: 13 }), translate('params.advanced')),
          advancedOpen ? h('div', { className: 'dsh-sd-adv', 'data-seedance-advanced': '' },
            h('div', { className: 'dsh-sd-adv-grid' },
              h(Field, { label: translate('params.seed') },
                h('div', { className: 'dsh-sd-seed-line' },
                  h('input', {
                    className: 'dsh-sd-input',
                    type: 'number',
                    min: 0,
                    step: 1,
                    value: params.seed === '' || params.seed === undefined ? '' : params.seed,
                    placeholder: translate('params.seedPlaceholder'),
                    onChange: (event) => patchParams({ seed: event.target.value }),
                    disabled: props.disabled,
                    'aria-label': translate('params.seedAria'),
                    'data-testid': 'sd-seed',
                    'data-seedance-control': 'seed',
                  }),
                  h(IconButton, {
                    icon: 'refresh',
                    label: translate('params.randomSeed'),
                    onClick: () => patchParams({ seed: Math.floor(Math.random() * 2147483647) }),
                    testid: 'sd-seed-random',
                    hook: 'seed-random',
                  }),
                ),
              ),
              (model && model.cameraFixed) ? h(Field, { label: translate('params.camera') },
                h(SwitchRow, {
                  label: translate('params.fixedCamera'),
                  checked: params.cameraFixed === true,
                  onChange: (value) => patchParams({ cameraFixed: value }),
                  disabled: props.disabled,
                  testid: 'sd-camera-fixed',
                }),
              ) : null,
            ),
          ) : null,
          params.resolution === '4k' ? h(HintLine, { kind: 'muted' }, translate('params.resolution4k')) : null,
          h('div', { className: 'dsh-sd-cost', 'data-seedance-cost': '' },
            h('span', null,
              props.demo
                ? h('span', { className: 'demo' }, translate('params.demoNoCost'))
                : estimate
                  ? h(React.Fragment, null, translate('params.estimatePrefix'), h('b', null, '≈ ¥' + estimate.toFixed(2)), translate('params.estimateSuffix'))
                  : translate('params.estimateUnavailable'),
            ),
            h('span', null, params.autoDuration ? translate('common.smartDuration') : fmtDuration(params.duration), ' · ', params.resolution, ' · ', params.ratio === 'adaptive' ? translate('params.adaptiveRatio') : params.ratio),
          ),
        ),
      );
    }

