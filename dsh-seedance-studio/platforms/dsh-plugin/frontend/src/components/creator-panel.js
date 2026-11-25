    // ==========================================================================
    // 创作面板（左栏）
    // ==========================================================================
    function CreatorPanel(props) {
      const form = props.form;
      const model = props.model;
      const constraints = props.constraints;
      const disabled = props.disabled;
      const error = props.error;
      return h('section', { className: 'dsh-sd-creator', 'data-seedance-creator': '', 'aria-label': translate('creator.formAria') },
        h('div', { className: 'dsh-sd-creator-head' },
          h('span', { className: 'dsh-sd-creator-head-title' }, translate('creator.panelTitle')),
          props.onCollapse ? h('button', {
            type: 'button',
            className: 'dsh-sd-creator-collapse',
            onClick: props.onCollapse,
            title: translate('creator.collapsePanel'),
            'aria-label': translate('creator.collapsePanel'),
            'data-testid': 'sd-creator-collapse',
          }, h(Icon, { name: 'chevronRight', size: 15 })) : null,
        ),
        h('div', { className: 'dsh-sd-creator-body dsh-sd-scroll', 'data-seedance-creator-scroll': '' },
          props.offline ? h('div', { className: 'dsh-sd-offline', role: 'alert', 'data-testid': 'sd-host-offline' },
            h('div', null, h('b', null, translate('creator.hostOffline')), translate('creator.hostOfflineHint')),
            h('div', { style: { marginTop: '4px' } }, translate('creator.reloadHint'), h('button', { type: 'button', className: 'dsh-sd-linkbtn', onClick: props.onReload, style: { marginLeft: '4px' } }, translate('creator.retry')), '。'),
          ) : null,
          props.demo ? h('div', { className: 'dsh-sd-demo-banner', 'data-seedance-demo-banner': '' },
            h(Icon, { name: 'sparkles', size: 15 }),
            h('span', null, h('b', null, translate('status.demo')), '：' + (props.demoReason || translate('demo.reasonDefault'))),
            h('button', { type: 'button', className: 'dsh-sd-linkbtn dsh-sd-demo-action', onClick: props.onOpenSettings, 'data-testid': 'sd-demo-configure' }, translate('creator.configure')),
          ) : null,
          h('div', { className: 'dsh-sd-section' },
            h('div', { className: 'dsh-sd-section-head' },
              h('span', { className: 'dsh-sd-section-title' }, translate('creator.modesTitle')),
              model ? h('span', { className: 'dsh-sd-section-hint' }, model.label) : null,
            ),
            h('div', { className: 'dsh-sd-modebar', role: 'tablist', 'aria-label': translate('creator.modesTitle') },
              MODES.map((mode) => {
                const supported = constraints.availableModes.indexOf(mode.id) !== -1
                  || (mode.id === 'edit' && (constraints.availableModes.indexOf('edit') !== -1 || constraints.availableModes.indexOf('extend') !== -1));
                const active = form.mode === mode.id;
                const modeText = translate(mode.label);
                return h('button', {
                  key: mode.id,
                  type: 'button',
                  role: 'tab',
                  'aria-selected': active,
                  className: 'dsh-sd-mode',
                  'data-active': active,
                  'data-seedance-mode': mode.id,
                  'data-testid': 'sd-mode-tab',
                  'data-mode': mode.id,
                  disabled: disabled || !supported,
                  title: supported ? modeText : translate('creator.modeUnsupported', { mode: modeText }),
                  onClick: () => { if (!disabled && supported) props.onModeChange(mode.id); },
                }, h(Icon, { name: mode.icon, size: 14 }), modeText);
              }),
            ),
          ),
          h(PromptField, {
            value: form.prompt,
            onChange: props.onPromptChange,
            onSubmit: props.onSubmit,
          }),
          h(MaterialPanel, {
            form,
            model,
            constraints,
            disabled,
            onPatch: props.onPatch,
            onError: props.onToastError,
            onSubModeChange: props.onSubModeChange,
            onPickHistoryVideo: props.onPickHistoryVideo,
          }),
          h(ParamsPanel, {
            form,
            models: props.models,
            model,
            constraints,
            disabled,
            demo: props.demo,
            customModel: form.customModel,
            estimate: props.estimate,
            onPatch: props.onPatch,
            onSelectModel: props.onSelectModel,
            onCustomModelChange: props.onCustomModelChange,
            onToastError: props.onToastError,
          }),
        ),
        h('div', { className: 'dsh-sd-creator-foot' },
          h('button', {
            type: 'button',
            className: 'dsh-sd-generate',
            disabled: disabled || !props.canGenerate || props.generating,
            onClick: props.onSubmit,
            'data-testid': 'sd-generate',
            'data-seedance-generate': '',
            'aria-label': translate('creator.generate'),
            title: props.error || undefined,
          },
            props.generating ? h(Spinner, { label: translate('creator.creating') }) : h(Icon, { name: 'sparkles', size: 17 }),
            props.generating ? translate('creator.creatingDots') : translate('creator.generate'),
          ),
          error ? h('div', { className: 'dsh-sd-error-line', role: 'alert', 'data-testid': 'sd-form-error' }, h(Icon, { name: 'warning', size: 13 }), h('span', null, error)) : null,
          h('div', { className: 'dsh-sd-generate-hint' },
            h('span', { className: 'dsh-sd-kbd-hint' }, h('kbd', null, 'Ctrl'), '+', h('kbd', null, 'Enter'), translate('creator.kbdHint')),
            props.sessionFallback
              ? h('span', { style: { color: 'var(--sd-warn)' } }, translate('creator.sessionHintNone'))
              : !props.sessionId
                ? h('span', { style: { color: 'var(--sd-warn)' } }, translate('creator.sessionHintNoChat'))
                : h('span', null, translate('creator.sessionHintSave')),
          ),
        ),
      );
    }
