    // ==========================================================================
    // 提示词
    // ==========================================================================
    function PromptField(props) {
      const value = asStr(props.value);
      const tooLong = value.length > 500;
      return h('div', { className: 'dsh-sd-section' },
        h('div', { className: 'dsh-sd-section-head' },
          h('span', { className: 'dsh-sd-section-title' }, translate('inputs.label')),
          h('span', { className: 'dsh-sd-section-hint' }, translate('inputs.hint')),
        ),
        h('div', { className: 'dsh-sd-prompt-wrap' },
          h('textarea', {
            className: 'dsh-sd-prompt',
            value,
            placeholder: translate('inputs.placeholder'),
            maxLength: MAX_PROMPT_CHARS,
            onChange: (event) => props.onChange(event.target.value),
            onKeyDown: (event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                if (typeof props.onSubmit === 'function') props.onSubmit();
              }
            },
            'aria-label': translate('inputs.aria'),
            'data-testid': 'sd-prompt',
            'data-seedance-prompt': '',
          }),
          h('span', { className: 'dsh-sd-prompt-count', 'data-testid': 'sd-prompt-count', style: tooLong ? { color: 'var(--sd-warn)' } : undefined }, value.length + ' / ' + MAX_PROMPT_CHARS),
        ),
        tooLong ? h(HintLine, { kind: 'muted' }, translate('inputs.tooLong', { count: value.length })) : null,
        h('div', { className: 'dsh-sd-chips' },
          PROMPT_TEMPLATES.map((template) => h('button', {
            key: template.label,
            type: 'button',
            className: 'dsh-sd-chip',
            onClick: () => props.onChange(translate(template.text)),
            'data-testid': 'sd-prompt-template',
          }, translate(template.label))),
        ),
      );
    }

    // ==========================================================================
    // 图片 / 音频上传控件
    // ==========================================================================
    function ImageDrop(props) {
      const inputRef = React.useRef(null);
      const dragState = React.useState(false);
      const busyState = React.useState(false);
      const drag = dragState[0];
      const setDrag = dragState[1];
      const busy = busyState[0];
      const setBusy = busyState[1];
      const value = props.value || null;
      const handleFiles = async (files) => {
        const file = files && files[0];
        if (!file) return;
        setBusy(true);
        try {
          const asset = await imageFileToAsset(file);
          if (typeof props.onChange === 'function') props.onChange(asset);
        } catch (error) {
          if (typeof props.onError === 'function') props.onError(error && error.message ? error.message : translate('inputs.imageReadError'));
        } finally {
          setBusy(false);
        }
      };
      return h('div', {
        className: 'dsh-sd-drop',
        'data-filled': !!value,
        'data-drag': drag,
        'data-testid': props.testid || 'sd-upload',
        'data-seedance-upload': props.hook || undefined,
        role: 'button',
        tabIndex: 0,
        'aria-label': props.label,
        onClick: () => { if (!props.disabled && inputRef.current) inputRef.current.click(); },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!props.disabled && inputRef.current) inputRef.current.click();
          }
        },
        onDragOver: (event) => { event.preventDefault(); if (!props.disabled) setDrag(true); },
        onDragLeave: () => setDrag(false),
        onDrop: (event) => {
          event.preventDefault();
          setDrag(false);
          if (!props.disabled) handleFiles(event.dataTransfer && event.dataTransfer.files);
        },
      },
        h('input', {
          ref: inputRef,
          type: 'file',
          accept: 'image/*',
          onChange: (event) => {
            handleFiles(event.target.files);
            try { event.target.value = ''; } catch (error) { /* ignore */ }
          },
          disabled: props.disabled,
        }),
        busy ? h(Spinner, { label: translate('common.processing') }) : value
          ? h(React.Fragment, null,
              h('img', { src: value.dataUrl, alt: props.label }),
              h('span', { className: 'dsh-sd-drop-role' }, props.roleLabel || props.label),
              h('button', {
                type: 'button',
                className: 'dsh-sd-drop-remove',
                'aria-label': translate('inputs.remove') + ' ' + props.label,
                onClick: (event) => {
                  event.stopPropagation();
                  if (typeof props.onChange === 'function') props.onChange(null);
                },
              }, h(Icon, { name: 'close', size: 11 })),
            )
          : h(React.Fragment, null,
              h(Icon, { name: props.icon || 'upload', size: 18 }),
              h('span', null, props.label),
              props.hint ? h('span', { style: { fontSize: '10px', opacity: 0.8 } }, props.hint) : null,
            ),
      );
    }

    function AudioDrop(props) {
      const inputRef = React.useRef(null);
      const busyState = React.useState(false);
      const busy = busyState[0];
      const setBusy = busyState[1];
      const value = props.value || null;
      const handleFiles = async (files) => {
        const file = files && files[0];
        if (!file) return;
        setBusy(true);
        try {
          const asset = await audioFileToAsset(file);
          if (typeof props.onChange === 'function') props.onChange(asset);
        } catch (error) {
          if (typeof props.onError === 'function') props.onError(error && error.message ? error.message : translate('inputs.audioReadError'));
        } finally {
          setBusy(false);
        }
      };
      return h('div', {
        className: 'dsh-sd-drop',
        'data-filled': !!value,
        role: 'button',
        tabIndex: 0,
        'aria-label': translate('inputs.uploadAudio'),
        'data-testid': 'sd-upload-audio',
        'data-seedance-upload': 'audio',
        onClick: () => { if (!props.disabled && inputRef.current) inputRef.current.click(); },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!props.disabled && inputRef.current) inputRef.current.click();
          }
        },
      },
        h('input', {
          ref: inputRef,
          type: 'file',
          accept: 'audio/*',
          onChange: (event) => {
            handleFiles(event.target.files);
            try { event.target.value = ''; } catch (error) { /* ignore */ }
          },
          disabled: props.disabled,
        }),
        busy ? h(Spinner, { label: translate('common.processing') }) : value
          ? h(React.Fragment, null,
              h(Icon, { name: 'audio', size: 20 }),
              h('span', { style: { maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, value.name),
              h('button', {
                type: 'button',
                className: 'dsh-sd-drop-remove',
                'aria-label': translate('inputs.removeAudio'),
                onClick: (event) => {
                  event.stopPropagation();
                  if (typeof props.onChange === 'function') props.onChange(null);
                },
              }, h(Icon, { name: 'close', size: 11 })),
            )
          : h(React.Fragment, null, h(Icon, { name: 'audio', size: 18 }), h('span', null, translate('inputs.uploadAudio')), h('span', { style: { fontSize: '10px', opacity: 0.8 } }, 'wav / mp3')),
      );
    }
