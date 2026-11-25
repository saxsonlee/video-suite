    // ==========================================================================
    // 设置弹窗（PLAN §5 / §6）
    // ==========================================================================
    function SettingsModal(props) {
      const open = props.open;
      const viewState = React.useState(null);
      const view = viewState[0];
      const setView = viewState[1];
      const loadingState = React.useState(false);
      const loading = loadingState[0];
      const setLoading = loadingState[1];
      const saveState = React.useState('idle');
      const saveStatus = saveState[0];
      const setSaveStatus = saveState[1];
      const errorState = React.useState(null);
      const error = errorState[0];
      const setError = errorState[1];
      const providerState = React.useState('auto');
      const provider = providerState[0];
      const setProvider = providerState[1];
      const demoState = React.useState(false);
      const demo = demoState[0];
      const setDemo = demoState[1];
      const arkBaseState = React.useState('');
      const arkBase = arkBaseState[0];
      const setArkBase = arkBaseState[1];
      const arkKeyState = React.useState('');
      const arkKey = arkKeyState[0];
      const setArkKey = arkKeyState[1];
      const relayBaseState = React.useState('');
      const relayBase = relayBaseState[0];
      const setRelayBase = relayBaseState[1];
      const relayKeyState = React.useState('');
      const relayKey = relayKeyState[0];
      const setRelayKey = relayKeyState[1];
      const relayProtocolState = React.useState('ark');
      const relayProtocol = relayProtocolState[0];
      const setRelayProtocol = relayProtocolState[1];
      // 中转站模型目录（拉取后可作默认模型候选；保存到 settings 供下次打开恢复）
      const relayModelsState = React.useState([]);
      const relayModels = relayModelsState[0];
      const setRelayModels = relayModelsState[1];
      const relayProbeState = React.useState({ status: 'idle' });
      const relayProbe = relayProbeState[0];
      const setRelayProbe = relayProbeState[1];
      const customModelState = React.useState('');
      const customModel = customModelState[0];
      const setCustomModel = customModelState[1];
      const relayFilterState = React.useState('');
      const relayFilter = relayFilterState[0];
      const setRelayFilter = relayFilterState[1];
      // 已选模型清单（多选）：主面板「模型」下拉只显示这些
      const enabledModelsState = React.useState([]);
      const enabledModels = enabledModelsState[0];
      const setEnabledModels = enabledModelsState[1];
      const defaultModelState = React.useState('');
      const defaultModel = defaultModelState[0];
      const setDefaultModel = defaultModelState[1];
      const maskedState = React.useState({});
      const masked = maskedState[0];
      const setMasked = maskedState[1];
      const [advancedOpen, setAdvancedOpen] = React.useState(false);
      React.useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        setLoading(true);
        setError(null);
        api('GET', '/api/seedance/settings').then((result) => {
          if (!alive) return;
          setLoading(false);
          if (!result.ok) {
            setError(humanizeError(result.error));
            return;
          }
          const payload = result.value || {};
          const view = settingsOf(payload);
          setView(view);
          const keys = isPlainObject(view.keys) ? view.keys : {};
          const nextProvider = asStr(view.provider || payload.provider || 'auto') || 'auto';
          setProvider(nextProvider === 'demo' ? 'auto' : nextProvider);
          setDemo(view.demo === true || payload.demo === true || nextProvider === 'demo');
          setArkBase(asStr(view.arkBaseUrl || view.baseURL || ''));
          setRelayBase(asStr(view.relayBaseUrl || ''));
          setRelayProtocol(asStr(view.relayProtocol || 'ark') || 'ark');
          const cachedModels = Array.isArray(view.relayModels)
            ? view.relayModels.map((item) => ({ id: asStr(item && item.id), label: asStr(item && item.label) || asStr(item && item.id) })).filter((item) => item.id)
            : [];
          setRelayModels(cachedModels);
          setEnabledModels(cachedModels);
          setRelayFilter('');
          setRelayProbe({ status: 'idle' });
          const nextDefault = asStr(view.defaultModel || '');
          const builtinIds = ((props.models || []).length ? props.models : FALLBACK_MODELS).map((item) => item.id);
          const relayIds = Array.isArray(view.relayModels) ? view.relayModels.map((item) => asStr(item && item.id)) : [];
          if (nextDefault && builtinIds.indexOf(nextDefault) === -1 && relayIds.indexOf(nextDefault) === -1) {
            setDefaultModel('__custom__');
            setCustomModel(nextDefault);
          } else {
            setDefaultModel(nextDefault);
            setCustomModel('');
          }
          setMasked({
            arkKey: asStr(keys.ark),
            relayKey: asStr(keys.relay),
            hasArkKey: view.hasArkKey === true,
            hasRelayKey: view.hasRelayKey === true,
          });
        });
        return () => { alive = false; };
      }, [open]);
      if (!open) return null;
      // 拉取中转站模型列表（同时验证连通性；用弹窗当前填写值，无需先保存）
      const probeRelay = async () => {
        if (relayProbe.status === 'loading') return;
        setRelayProbe({ status: 'loading' });
        setError(null);
        const result = await api('POST', '/api/seedance/relay/models', {
          baseUrl: relayBase.trim() || undefined,
          protocol: relayProtocol || 'ark',
          apiKey: relayKey.trim() || undefined,
        });
        if (!result.ok) {
          const error = result.error || {};
          const text = asStr(error.message);
          // 宿主仍是旧进程时接口不存在（404 not found）：给出可操作提示，而不是原样抛出
          const stale = asStr(error.code) === 'NOT_FOUND' || /(^|\s)not found(\s|$)/i.test(text);
          setRelayProbe({ status: 'error', message: stale ? translate('settings.relayHostStale') : humanizeError(error) });
          return;
        }
        const value = result.value || {};
        const models = Array.isArray(value.models) ? value.models.map((item) => ({ id: asStr(item && item.id), label: asStr(item && item.label) || asStr(item && item.id) })).filter((item) => item.id) : [];
        setRelayModels(models);
        setRelayProbe({ status: 'ok', latencyMs: asNum(value.latencyMs, 0), endpoint: asStr(value.endpoint) || '' });
      };

      // 勾选/取消勾选一个模型（主面板「模型」下拉只显示已选清单）
      const toggleEnabled = (item) => {
        const id = asStr(item && item.id);
        if (!id) return;
        const label = asStr(item && item.label) || id;
        setEnabledModels((previous) => {
          if (previous.some((entry) => entry.id === id)) return previous.filter((entry) => entry.id !== id);
          return previous.concat([{ id, label }]);
        });
      };

      const save = async () => {
        setSaveStatus('saving');
        setError(null);
        // host 接受 camelCase 别名；密钥留空表示不修改，打码值不会回写
        const patch = { provider: demo ? 'demo' : provider, demo };
        if (arkKey.trim()) patch.arkApiKey = arkKey.trim();
        if (arkBase.trim()) patch.arkBaseUrl = arkBase.trim();
        if (relayBase.trim()) patch.relayBaseUrl = relayBase.trim();
        if (relayKey.trim()) patch.relayApiKey = relayKey.trim();
        if (relayProtocol.trim()) patch.relayProtocol = relayProtocol.trim();
        const modelValue = defaultModel === '__custom__' ? customModel.trim() : defaultModel.trim();
        if (modelValue) patch.defaultModel = modelValue;
        patch.relayModels = enabledModels.length ? JSON.stringify(enabledModels) : '';
        const result = await api('POST', '/api/seedance/settings', patch);
        setSaveStatus('idle');
        if (!result.ok) {
          setError(humanizeError(result.error));
          props.onToast('error', humanizeError(result.error));
          return;
        }
        props.onToast('success', translate('toast.settingsSaved'));
        if (typeof props.onSaved === 'function') props.onSaved();
        props.onClose();
      };
      const builtinModels = (props.models || []).length ? props.models : FALLBACK_MODELS;
      const modelOptions = builtinModels.map((item) => ({ id: item.id, label: item.label }));
      const relayModelIds = enabledModels.map((item) => item.id);
      const currentModelKnown = defaultModel && defaultModel !== '__custom__' && (modelOptions.some((item) => item.id === defaultModel) || relayModelIds.indexOf(defaultModel) !== -1);
      return h(Modal, {
        open: true,
        onClose: props.onClose,
        size: 'sm',
        icon: 'settings',
        title: translate('settings.title'),
        subtitle: translate('settings.subtitle'),
        testid: 'sd-settings-modal',
        hook: 'settings-modal',
        dataAttrs: { 'data-seedance-settings-modal': '' },
        closeTestid: 'sd-settings-close',
        footer: h(React.Fragment, null,
          h('span', { className: 'grow', style: { fontSize: '11px', color: 'var(--sd-text-3)' } }, translate('settings.effectHint')),
          h(IconButton, { icon: 'close', label: translate('action.cancel'), onClick: props.onClose, testid: 'sd-settings-cancel' }, translate('action.cancel')),
          h(IconButton, {
            icon: 'check',
            label: translate('action.saveSettings'),
            variant: 'primary',
            onClick: save,
            disabled: saveStatus === 'saving' || loading,
            testid: 'sd-settings-save',
            hook: 'settings-save',
          }, saveStatus === 'saving' ? translate('common.saving') : translate('action.save')),
        ),
      },
        loading ? h('div', { style: { padding: '24px', display: 'flex', justifyContent: 'center' } }, h(Spinner, { label: translate('settings.loading') }))
          : h('div', { className: 'dsh-sd-settings-grid' },
              error ? h(HintLine, { kind: 'error' }, error) : null,
              h(SwitchRow, {
                label: translate('status.demo'),
                hint: translate('settings.demoHint'),
                checked: demo,
                onChange: setDemo,
                testid: 'sd-settings-demo',
              }),
              h(Field, { label: translate('settings.provider') },
                h('select', {
                  className: 'dsh-sd-select',
                  value: demo ? 'demo' : provider,
                  onChange: (event) => {
                    const next = event.target.value;
                    if (next === 'demo') { setDemo(true); setProvider('auto'); }
                    else { setDemo(false); setProvider(next); }
                  },
                  disabled: demo,
                  'aria-label': translate('settings.providerAria'),
                  'data-testid': 'sd-settings-provider',
                  'data-seedance-settings': 'provider',
                },
                  h('option', { value: 'auto' }, translate('settings.providerAuto')),
                  h('option', { value: 'ark' }, translate('settings.providerArk')),
                  h('option', { value: 'relay' }, translate('settings.providerRelay')),
                  h('option', { value: 'demo' }, translate('settings.providerDemo')),
                ),
              ),
              h(Field, { label: translate('settings.arkKey') },
                h('input', {
                  className: 'dsh-sd-input',
                  type: 'password',
                  value: arkKey,
                  placeholder: masked.arkKey ? translate('settings.savedPrefix', { key: masked.arkKey }) : 'ARK_API_KEY',
                  autoComplete: 'off',
                  onChange: (event) => setArkKey(event.target.value),
                  'aria-label': translate('settings.arkKey'),
                  'data-testid': 'sd-settings-ark-key',
                  'data-seedance-input': 'ark-key',
                }),
              ),
              h(Field, { label: translate('settings.arkBase') },
                h('input', {
                  className: 'dsh-sd-input',
                  type: 'text',
                  value: arkBase,
                  placeholder: 'https://ark.cn-beijing.volces.com',
                  onChange: (event) => setArkBase(event.target.value),
                  'aria-label': translate('settings.arkBase'),
                  'data-testid': 'sd-settings-ark-base',
                }),
              ),
              h(Field, { label: translate('settings.defaultModel') },
                h('select', {
                  className: 'dsh-sd-select',
                  value: defaultModel,
                  onChange: (event) => setDefaultModel(event.target.value),
                  'aria-label': translate('settings.defaultModel'),
                  'data-testid': 'sd-settings-default-model',
                },
                  h('option', { value: '' }, translate('settings.followHost')),
                  h('optgroup', { label: translate('settings.builtinModels') },
                    modelOptions.map((item) => h('option', { key: item.id, value: item.id }, item.label)),
                  ),
                  enabledModels.length ? h('optgroup', { label: translate('settings.relayModelGroup') },
                    enabledModels.map((item) => h('option', { key: 'relay:' + item.id, value: item.id }, item.label || item.id)),
                  ) : null,
                  h('option', { value: '__custom__' }, translate('settings.customModelOption')),
                  defaultModel && !currentModelKnown ? h('option', { key: 'sd-current', value: defaultModel }, defaultModel) : null,
                ),
              ),
              defaultModel === '__custom__' ? h(Field, { label: translate('settings.customModel') },
                h('input', {
                  className: 'dsh-sd-input',
                  type: 'text',
                  value: customModel,
                  placeholder: translate('settings.customModelPlaceholder'),
                  onChange: (event) => setCustomModel(event.target.value),
                  'aria-label': translate('settings.customModel'),
                  'data-testid': 'sd-settings-custom-model',
                }),
              ) : null,
              h('button', {
                type: 'button',
                className: 'dsh-sd-adv-toggle',
                onClick: () => setAdvancedOpen((value) => !value),
                'aria-expanded': advancedOpen,
              }, h(Icon, { name: advancedOpen ? 'chevronDown' : 'chevronRight', size: 13 }), translate('settings.relayAdvanced')),
              advancedOpen ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
                h(Field, { label: translate('settings.relayBase') },
                  h('input', {
                    className: 'dsh-sd-input',
                    type: 'text',
                    value: relayBase,
                    placeholder: 'https://relay.example.com',
                    onChange: (event) => setRelayBase(event.target.value),
                    'aria-label': translate('settings.relayBase'),
                    'data-testid': 'sd-settings-relay-base',
                  }),
                ),
                h(Field, { label: translate('settings.relayKey') },
                  h('input', {
                    className: 'dsh-sd-input',
                    type: 'password',
                    value: relayKey,
                    placeholder: masked.relayKey ? translate('settings.savedPrefix', { key: masked.relayKey }) : 'RELAY_API_KEY',
                    autoComplete: 'off',
                    onChange: (event) => setRelayKey(event.target.value),
                    'aria-label': translate('settings.relayKey'),
                    'data-testid': 'sd-settings-relay-key',
                    'data-seedance-input': 'relay-key',
                  }),
                ),
                h(Field, { label: translate('settings.relayProtocol') },
                  h('select', {
                    className: 'dsh-sd-select',
                    value: relayProtocol,
                    onChange: (event) => setRelayProtocol(event.target.value),
                    'aria-label': translate('settings.relayProtocol'),
                  },
                    h('option', { value: 'ark' }, translate('settings.relayArk')),
                    h('option', { value: 'openai' }, translate('settings.relayOpenai')),
                  ),
                ),
                h('div', { className: 'dsh-sd-settings-inline' },
                  h(IconButton, {
                    icon: 'refresh',
                    label: translate('settings.relayFetch'),
                    title: translate('settings.relayFetchHint'),
                    onClick: probeRelay,
                    disabled: relayProbe.status === 'loading',
                    testid: 'sd-settings-relay-fetch',
                    hook: 'settings-relay-fetch',
                  }, relayProbe.status === 'loading' ? translate('settings.relayFetching') : translate('settings.relayFetch')),
                ),
                relayProbe.status === 'ok'
                  ? h(HintLine, { kind: 'muted' }, translate('settings.relayProbeOk', { ms: relayProbe.latencyMs, count: relayModels.length }))
                  : relayProbe.status === 'error'
                    ? h(HintLine, { kind: 'error' }, translate('settings.relayProbeFail', { message: relayProbe.message || '' }))
                    : null,
                relayModels.length
                  ? h('div', { className: 'dsh-sd-relay-models-wrap', 'data-testid': 'sd-settings-relay-models' },
                      h('div', { className: 'dsh-sd-relay-models-title' }, translate('settings.relayPickTitle')),
                      h('div', { className: 'dsh-sd-relay-models-head' },
                        h('span', { className: 'dsh-sd-relay-models-count' }, translate('settings.relayModelsCount', { count: relayModels.length })),
                        h('input', {
                          className: 'dsh-sd-input dsh-sd-relay-filter',
                          type: 'search',
                          value: relayFilter,
                          placeholder: translate('settings.relayFilterPlaceholder'),
                          onChange: (event) => setRelayFilter(event.target.value),
                          'aria-label': translate('settings.relayFilterPlaceholder'),
                          'data-testid': 'sd-settings-relay-filter',
                        }),
                      ),
                      h('div', { className: 'dsh-sd-relay-models' },
                        relayModels
                          .filter((item) => !relayFilter.trim() || (item.id + ' ' + (item.label || '')).toLowerCase().indexOf(relayFilter.trim().toLowerCase()) !== -1)
                          .map((item) => {
                            const active = enabledModels.some((entry) => entry.id === item.id);
                            return h('button', {
                              key: item.id,
                              type: 'button',
                              className: 'dsh-sd-relay-model',
                              'data-active': active ? 'true' : 'false',
                              'aria-pressed': active,
                              title: item.id,
                              onClick: () => toggleEnabled(item),
                              'data-testid': 'sd-settings-relay-model',
                            }, (active ? '✓ ' : '') + (item.label || item.id));
                          }),
                      ),
                      relayFilter.trim() && !relayModels.some((item) => (item.id + ' ' + (item.label || '')).toLowerCase().indexOf(relayFilter.trim().toLowerCase()) !== -1)
                        ? h('div', { className: 'dsh-sd-relay-models-empty' }, translate('settings.relayModelsEmpty'))
                        : null,
                    )
                  : null,
                h('div', { className: 'dsh-sd-relay-selected', 'data-testid': 'sd-settings-relay-selected' },
                  h('div', { className: 'dsh-sd-relay-selected-title' }, translate('settings.relaySelectedTitle', { count: enabledModels.length })),
                  enabledModels.length
                    ? enabledModels.map((item) => h('div', { className: 'dsh-sd-relay-selected-row', key: item.id },
                        h('span', { className: 'dsh-sd-relay-selected-label', title: item.id }, item.label || item.id),
                        h('button', {
                          type: 'button',
                          className: 'dsh-sd-relay-selected-remove',
                          title: translate('settings.relayRemove'),
                          'aria-label': translate('settings.relayRemove'),
                          onClick: () => toggleEnabled(item),
                          'data-testid': 'sd-settings-relay-remove',
                        }, h(Icon, { name: 'close', size: 13 })),
                      ))
                    : h('div', { className: 'dsh-sd-relay-selected-empty' }, translate('settings.relaySelectedEmpty')),
                ),
              ) : null,
              h('div', { className: 'dsh-sd-settings-note' },
                translate('settings.priorityHint'),
              ),

              view && view.demo && !demo ? h(HintLine, { kind: 'muted' }, asStr(view.demoReason) || translate('settings.demoSaved')) : null,
              view && view.configError ? h(HintLine, { kind: 'error' }, asStr(view.configError)) : null,
              view && Array.isArray(view.warnings) && view.warnings.length
                ? h(HintLine, { kind: 'muted' }, asStr(view.warnings[0]))
                : null,
            ),
      );
    }

