    // ==========================================================================
    // 参考素材面板（按模式变化）
    // ==========================================================================
    function MaterialPanel(props) {
      const form = props.form;
      const model = props.model;
      const constraints = props.constraints;
      const assets = form.assets || {};
      const patchAssets = (patch) => props.onPatch({ assets: Object.assign({}, assets, patch) });
      const mode = form.mode;
      const tip = h('div', { className: 'dsh-sd-material-tip' }, translate('material.tip'));

      const firstSlot = h(ImageDrop, {
        value: assets.first,
        onChange: (asset) => patchAssets({ first: asset }),
        label: mode === 'firstlast' ? translate('material.addFirst') : translate('material.addFirstImage'),
        roleLabel: translate('material.firstRole'),
        icon: 'image',
        disabled: props.disabled,
        testid: 'sd-upload-first',
        hook: 'first-frame',
        onError: props.onError,
      });

      const lastSlot = h(ImageDrop, {
        value: assets.last,
        onChange: (asset) => patchAssets({ last: asset }),
        label: translate('material.addLast'),
        roleLabel: translate('material.lastRole'),
        icon: 'image',
        disabled: props.disabled,
        testid: 'sd-upload-last',
        hook: 'last-frame',
        onError: props.onError,
      });

      const videoRow = (showPick) => h('div', { className: 'dsh-sd-rows' },
        h('div', { className: 'dsh-sd-row' },
          h('span', { className: 'dsh-sd-row-label' }, translate('material.video')),
          h('div', { className: 'dsh-sd-row-main' },
            h('input', {
              className: 'dsh-sd-input',
              type: 'text',
              value: assets.videoUrl || '',
              placeholder: translate('material.videoPlaceholder'),
              onChange: (event) => patchAssets({ videoUrl: event.target.value }),
              disabled: props.disabled,
              'aria-label': translate('material.videoAria'),
              'data-testid': 'sd-video-url',
              'data-seedance-input': 'video-url',
            }),
          ),
        ),
        showPick ? h('div', { className: 'dsh-sd-row' },
          h('span', { className: 'dsh-sd-row-label' }, ''),
          h('div', { className: 'dsh-sd-row-main' },
            h('button', { type: 'button', className: 'dsh-sd-linkbtn', onClick: () => props.onPickHistoryVideo(), 'data-testid': 'sd-video-from-history' }, translate('material.fromHistory')),
          ),
        ) : null,
      );

      let body = null;
      if (mode === 'text2video' || mode === 'draft') {
        body = h('div', { className: 'dsh-sd-material-empty' },
          h(Icon, { name: mode === 'draft' ? 'draft' : 'sparkles', size: 16 }),
          h('span', { className: 'grow' }, mode === 'draft' ? translate('material.draftTip') : translate('material.textTip')),
        );
      } else if (mode === 'image2video') {
        body = h('div', { className: 'dsh-sd-dropgrid' }, h('div', { style: { gridColumn: 'span 2' } }, firstSlot));
      } else if (mode === 'firstlast') {
        body = h('div', { className: 'dsh-sd-dropgrid' }, h('div', null, firstSlot), h('div', null, lastSlot));
      } else if (mode === 'reference') {
        const maxImages = Math.max(1, constraints.maxImages || model.maxImages || 9);
        const refs = assets.refs || [];
        body = h(React.Fragment, null,
          h('div', { className: 'dsh-sd-dropgrid' },
            refs.map((item, index) => h(ImageDrop, {
              key: item.id || index,
              value: item,
              onChange: (asset) => {
                const next = refs.slice();
                if (asset) next[index] = asset;
                else next.splice(index, 1);
                patchAssets({ refs: next });
              },
              label: translate('material.refImage', { index: index + 1 }),
              roleLabel: translate('material.refImage', { index: index + 1 }),
              icon: 'image',
              disabled: props.disabled,
              testid: 'sd-upload-ref-' + index,
              hook: 'reference-image',
              onError: props.onError,
            })),
            refs.length < maxImages ? h('div', null, h(ImageDrop, {
              value: null,
              onChange: (asset) => patchAssets({ refs: refs.concat([asset]) }),
              label: translate('material.addRef'),
              hint: refs.length + ' / ' + maxImages,
              icon: 'plus',
              disabled: props.disabled,
              testid: 'sd-upload-ref-add',
              hook: 'reference-image-add',
              onError: props.onError,
            })) : null,
          ),
          h('div', { style: { height: '9px' } }),
          videoRow(true),
          h('div', { style: { height: '9px' } }),
          h('div', { className: 'dsh-sd-dropgrid' }, h('div', null, h(AudioDrop, {
            value: assets.audio,
            onChange: (asset) => patchAssets({ audio: asset }),
            disabled: props.disabled,
            onError: props.onError,
          }))),
          model && model.family === '2.0' ? h(HintLine, { kind: 'muted' }, translate('material.audioNote20')) : null,
        );
      } else if (mode === 'edit') {
        const subMode = form.subMode === 'extend' ? 'extend' : 'edit';
        body = h(React.Fragment, null,
          h('div', { className: 'dsh-sd-submodes' }, h(Segmented, {
            value: subMode,
            options: [{ value: 'edit', label: translate('material.edit') }, { value: 'extend', label: translate('material.extend') }],
            onChange: (next) => props.onSubModeChange(next),
            label: translate('material.editOrExtend'),
            size: 'sm',
            testid: 'sd-edit-submode',
            hook: 'edit-submode',
          })),
          h('div', { style: { height: '9px' } }),
          videoRow(true),
          h(HintLine, { kind: 'muted' }, subMode === 'extend'
            ? translate('material.extendTip')
            : translate('material.editTip')),
        );
      }
      return h('div', { className: 'dsh-sd-section', 'data-seedance-material': mode },
        h('div', { className: 'dsh-sd-section-head' },
          h('span', { className: 'dsh-sd-section-title' }, translate('material.sectionTitle')),
          h('span', { className: 'dsh-sd-section-hint' }, mode === 'text2video' || mode === 'draft' ? translate('common.optional') : translate('common.byMode')),
        ),
        body,
        tip,
      );
    }
