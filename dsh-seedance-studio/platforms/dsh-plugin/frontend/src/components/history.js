    function SkeletonCards() {
      return h('div', { className: 'dsh-sd-skeleton-cards', 'data-testid': 'sd-skeleton', 'aria-label': translate('common.loading') },
        [0, 1, 2, 3].map((index) => h('div', { key: index, className: 'dsh-sd-skeleton' },
          h('div', { className: 'sk-media' }),
          h('div', { className: 'sk-line' }),
          h('div', { className: 'sk-line short' }),
        )),
      );
    }

    function EmptyState(props) {
      return h('div', { className: 'dsh-sd-empty', 'data-testid': 'sd-empty', 'data-seedance-empty': '' },
        h('div', { className: 'dsh-sd-empty-art' }, h(Icon, { name: 'film', size: 42 })),
        h('div', { className: 'dsh-sd-empty-title' }, props.title || translate('history.emptyTitle')),
        h('div', { className: 'dsh-sd-empty-desc' }, props.description || translate('history.emptyDesc')),
        props.demoHint ? h('div', { className: 'dsh-sd-empty-desc', style: { color: 'var(--sd-warn)' } }, props.demoHint) : null,
        props.onAction ? h(IconButton, {
          icon: 'sparkles',
          label: translate('history.fillSample'),
          onClick: props.onAction,
          testid: 'sd-empty-action',
        }, translate('history.fillSample')) : null,
      );
    }

    function HistoryCard(props) {
      const record = props.record;
      const [confirm, setConfirm] = React.useState(null);
      const [videoBroken, setVideoBroken] = React.useState(false);
      const active = recordIsActive(record);
      const succeeded = record.status === 'succeeded';
      const draft = recordIsDraft(record);
      const params = record.params || {};
      const meta = statusMeta(record);
      const prompt = asStr(record.prompt);
      const modelName = modelLabel(props.models, record.model);
      const origin = asStr(record.originId);
      const isDemo = record.provider === 'demo' || record.meta && record.meta.demo === true;
      const duration = params.autoDuration ? translate('common.smartDuration') : fmtDuration(params.duration);
      const resolutions = params.resolution ? asStr(params.resolution) : '';
      const canCancel = record.status === 'queued';
      const canDraftFinal = draft && succeeded && !props.hasFinal && !!asStr(record.remoteTaskId);
      const runningProgress = clampProgress(record.progress !== undefined ? record.progress : meta.progress);
      return h('article', {
        className: 'dsh-sd-card',
        'data-highlight': props.highlight === true,
        'data-seedance-card': '',
        'data-status': record.status,
        'data-record-id': record.id,
        'data-testid': 'sd-history-card',
        'aria-label': translate('history.recordAria', { prompt: prompt ? prompt.slice(0, 24) : record.id }),
      },
        h('div', {
          className: 'dsh-sd-card-media',
          'data-clickable': succeeded,
          role: succeeded ? 'button' : undefined,
          tabIndex: succeeded ? 0 : undefined,
          'aria-label': succeeded ? translate('action.playVideo') : undefined,
          onClick: () => { if (succeeded && typeof props.onPlay === 'function') props.onPlay(record); },
          onKeyDown: (event) => {
            if (succeeded && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              if (typeof props.onPlay === 'function') props.onPlay(record);
            }
          },
        },
          succeeded && !videoBroken
            ? h('video', {
                src: recordVideoSrc(record) + '#t=0.1',
                poster: recordPoster(record) || undefined,
                preload: 'metadata',
                muted: true,
                playsInline: true,
                tabIndex: -1,
                onError: () => setVideoBroken(true),
                'aria-hidden': 'true',
              })
            : null,
          succeeded && videoBroken ? h('div', { className: 'dsh-sd-card-state' }, h(Icon, { name: 'video', size: 26 }), h('span', null, translate('history.clickPlay'))) : null,
          active ? h(React.Fragment, null,
            h('div', { className: 'dsh-sd-card-running-veil' }),
            h('div', { className: 'dsh-sd-card-state' },
              h(Spinner, { label: meta.label }),
              h('span', { 'data-testid': 'sd-card-progress-value' }, meta.label + ' · ' + runningProgress + '%'),
              h('span', { style: { fontSize: '11px', opacity: 0.8 } }, prompt ? prompt.slice(0, 20) : modeLabel(record.mode)),
            ),
            h('div', { className: 'dsh-sd-card-progress' }, h('i', { style: { '--sd-progress': Math.max(6, record.progress || meta.progress) + '%' } })),
          ) : null,
          !succeeded && !active ? h('div', { className: 'dsh-sd-card-state', 'data-tone': 'error' },
            h(Icon, { name: record.status === 'failed' ? 'warning' : 'stop', size: 26 }),
            h('span', null, meta.label),
            record.error && record.error.message ? h('span', { style: { fontSize: '10.5px', maxWidth: '86%', textAlign: 'center' } }, asStr(record.error.message).slice(0, 60)) : null,
          ) : null,
          h('div', { className: 'dsh-sd-card-scrim' }),
          succeeded ? h('button', {
            type: 'button',
            className: 'dsh-sd-card-play',
            'aria-label': translate('action.play'),
            onClick: (event) => { event.stopPropagation(); if (typeof props.onPlay === 'function') props.onPlay(record); },
            'data-testid': 'sd-play',
            'data-seedance-action': 'play',
          }, h(Icon, { name: 'play', size: 18 })) : null,
          h('div', { className: 'dsh-sd-card-badge' }, h(StatusBadge, { record })),
          h('div', { className: 'dsh-sd-card-provider' },
            draft ? h('span', { className: 'dsh-sd-badge', 'data-tone': 'warn', 'data-testid': 'sd-draft-badge' }, translate('badge.draft'))
              : isDemo ? h('span', { className: 'dsh-sd-badge', 'data-tone': 'muted' }, translate('badge.demo'))
              : null,
          ),
        ),
        h('div', { className: 'dsh-sd-card-body' },
          h('div', { className: 'dsh-sd-card-prompt', 'data-empty': !prompt, title: prompt },
            prompt || modeLabel(record.mode) + ' ' + translate('history.noPrompt'),
          ),
          h('div', { className: 'dsh-sd-card-meta' },
            h('span', null, modelName),
            resolutions ? h(React.Fragment, null, h('span', { className: 'sep' }, '·'), h('span', null, resolutions)) : null,
            h('span', { className: 'sep' }, '·'),
            h('span', null, duration),
            h('span', { className: 'sep' }, '·'),
            h('span', { title: record.createdAt ? new Date(record.createdAt).toLocaleString() : '' }, fmtRelative(record.createdAt)),
          ),
          origin ? h('div', { className: 'dsh-sd-card-meta' },
            h('span', { className: 'origin', 'data-testid': 'sd-origin-mark' }, translate('history.origin', { id: shortId(origin) })),
          ) : null,
          props.hasFinal ? h('div', { className: 'dsh-sd-card-meta' },
            h('span', { className: 'dsh-sd-badge', 'data-tone': 'success', 'data-testid': 'sd-draft-final-done' }, translate('badge.draftFinalDone')),
          ) : null,
          h('div', { className: 'dsh-sd-card-actions' },
            succeeded ? h(IconButton, { icon: 'play', label: translate('action.play'), onClick: () => props.onPlay(record), testid: 'sd-card-play', hook: 'card-play' }) : null,
            succeeded ? h(IconButton, { icon: 'recreate', label: translate('action.recreate'), onClick: () => props.onRecreate(record), testid: 'sd-recreate', hook: 'card-recreate' }) : null,
            canDraftFinal ? h(IconButton, { icon: 'draft', label: translate('action.draftFinal'), onClick: () => props.onDraftFinal(record), testid: 'sd-draft-final', hook: 'draft-final', variant: 'primary' }, translate('action.draftFinal')) : null,
            record.status === 'failed' ? h(IconButton, { icon: 'refresh', label: translate('action.retryHint'), variant: 'primary', onClick: () => props.onRecreate(record), testid: 'sd-retry', hook: 'card-retry' }, translate('action.retry')) : null,
            typeof props.onOpenChat === 'function' ? h(IconButton, { icon: 'external', label: translate('action.chatOpen'), onClick: () => props.onOpenChat(record), testid: 'sd-chat-open', hook: 'card-chat-open' }) : null,
            typeof props.onSendToChat === 'function' ? h(IconButton, { icon: 'message', label: translate('action.chatSend'), onClick: () => props.onSendToChat(record), testid: 'sd-chat-send', hook: 'card-chat-send' }) : null,
            h('span', { className: 'grow' }),
            succeeded ? h(IconButton, { icon: 'download', label: translate('action.download'), onClick: () => props.onDownload(record), testid: 'sd-download', hook: 'card-download' }) : null,
            canCancel ? h(IconButton, { icon: 'close', label: translate('action.cancelTask'), onClick: () => setConfirm('cancel'), testid: 'sd-cancel', hook: 'card-cancel' }) : null,
            h(IconButton, { icon: 'trash', label: translate('action.delete'), variant: 'danger', onClick: () => setConfirm('delete'), testid: 'sd-delete', hook: 'card-delete' }),
          ),
        ),
        confirm
          ? h('div', { className: 'dsh-sd-card-confirm', role: 'alertdialog', 'aria-label': confirm === 'delete' ? translate('history.confirmDelete') : translate('history.confirmCancel') },
              h('div', { style: { fontWeight: 600 } }, confirm === 'delete' ? translate('history.deleteQuestion') : translate('history.cancelQuestion')),
              h('div', { style: { fontSize: '11px', color: 'var(--sd-text-3)' } },
                confirm === 'delete' ? translate('history.deleteDesc') : translate('history.cancelDesc')),
              h('div', { className: 'btns' },
                h(IconButton, {
                  icon: 'close',
                  label: translate('history.cancelAction'),
                  onClick: () => setConfirm(null),
                  testid: 'sd-confirm-no',
                }, translate('history.back')),
                h(IconButton, {
                  icon: confirm === 'delete' ? 'trash' : 'stop',
                  label: confirm === 'delete' ? translate('history.confirmDelete') : translate('history.confirmCancel'),
                  variant: confirm === 'delete' ? 'danger' : 'primary',
                  onClick: () => {
                    setConfirm(null);
                    if (confirm === 'delete') props.onDelete(record);
                    else props.onCancel(record);
                  },
                  testid: 'sd-confirm-yes',
                }, translate('history.confirm')),
              ),
            )
          : null,
      );
    }

    function HistoryPanel(props) {
      const records = props.records || [];
      const [filter, setFilter] = React.useState('all');
      const activeRecords = records.filter(recordIsActive);
      const counts = {
        all: records.length,
        active: activeRecords.length,
        done: records.filter((record) => record.status === 'succeeded').length,
        failed: records.filter((record) => record.status === 'failed' || record.status === 'cancelled' || record.status === 'expired').length,
      };
      const filtered = React.useMemo(() => {
        if (filter === 'active') return records.filter(recordIsActive);
        if (filter === 'done') return records.filter((record) => record.status === 'succeeded');
        if (filter === 'failed') return records.filter((record) => record.status === 'failed' || record.status === 'cancelled' || record.status === 'expired');
        return records;
      }, [records, filter]);
      const draftFinalIds = React.useMemo(() => {
        const set = new Set();
        for (const record of records) {
          if (record.originId) set.add(record.originId);
          if (record.meta && record.meta.draftTaskId) set.add(asStr(record.meta.draftTaskId));
        }
        return set;
      }, [records]);
      const loading = props.status === 'loading' || props.status === 'booting';
      const error = props.status === 'error';
      return h('section', { className: 'dsh-sd-gallery', 'data-seedance-history': '', 'aria-label': translate('history.title') },
        h('div', { className: 'dsh-sd-gallery-head' },
          h('div', { className: 'dsh-sd-gallery-title' },
            h('span', { className: 'dsh-sd-live-dot', 'data-idle': activeRecords.length === 0 }),
            translate('history.title'),
            h('span', { className: 'dsh-sd-gallery-count', 'data-testid': 'sd-history-count', 'data-seedance-history-count': records.length },
              translate('history.count', { total: records.length }) + (activeRecords.length ? translate('history.activeSuffix', { active: activeRecords.length }) : '')),
          ),
          h('div', { className: 'dsh-sd-gallery-head-extra' },
            h(IconButton, { icon: 'refresh', label: translate('action.refresh'), onClick: props.onRefresh, disabled: loading, testid: 'sd-refresh', hook: 'history-refresh' }),
          ),
        ),
        h('div', { className: 'dsh-sd-gallery-body dsh-sd-scroll' },
          h('div', { className: 'dsh-sd-gallery-filterline' },
            h(Segmented, {
              value: filter,
              options: [
                { value: 'all', label: translate('history.filterAll', { count: counts.all }) },
                { value: 'active', label: translate('history.filterActive', { count: counts.active }) },
                { value: 'done', label: translate('history.filterDone', { count: counts.done }) },
                { value: 'failed', label: translate('history.filterFailed', { count: counts.failed }) },
              ],
              onChange: setFilter,
              label: translate('history.filterAria'),
              testid: 'sd-filter',
              hook: 'history-filter',
            }),
            error ? h('span', { style: { fontSize: '11px', color: 'var(--sd-error)' }, 'data-testid': 'sd-history-error' }, translate('history.loadError')) : null,
          ),
          activeRecords.length ? h('div', { className: 'dsh-sd-queue', 'data-seedance-queue': '' },
            h('div', { className: 'dsh-sd-queue-title' }, h(Spinner, { label: translate('status.running') }), translate('history.queueTitle', { count: activeRecords.length })),
            h('div', { className: 'dsh-sd-queue-list' },
              activeRecords.map((record) => h('div', { key: record.id, className: 'dsh-sd-queue-item' },
                h(StatusBadge, { record }),
                h('span', { className: 'txt' }, asStr(record.prompt) || modeLabel(record.mode)),
                h('span', { className: 'dsh-sd-queue-percent', 'data-testid': 'sd-queue-progress' }, clampProgress(record.progress !== undefined ? record.progress : statusMeta(record).progress) + '%'),
                h('span', { className: 'bar' }, h('i', { style: { width: Math.max(6, record.progress || statusMeta(record).progress) + '%' } })),
              )),
            ),
          ) : null,
          loading && !records.length ? h(SkeletonCards, null)
            : !filtered.length
              ? h(EmptyState, {
                  title: records.length ? translate('history.emptyFilteredTitle') : translate('history.emptyTitle'),
                  description: records.length ? translate('history.emptyFilteredDesc') : translate('history.emptyDesc'),
                  demoHint: props.demo ? translate('history.demoHint') : null,
                  onAction: records.length ? null : props.onUseTemplate,
                })
              : h('div', { className: 'dsh-sd-cards' },
                  filtered.map((record) => h(HistoryCard, {
                    key: record.id,
                    record,
                    models: props.models,
                    highlight: props.highlightId === record.id,
                    hasFinal: draftFinalIds.has(asStr(record.remoteTaskId) || record.id),
                    onPlay: props.onPlay,
                    onRecreate: props.onRecreate,
                    onDownload: props.onDownload,
                    onDelete: props.onDelete,
                    onCancel: props.onCancel,
                    onDraftFinal: props.onDraftFinal,
                    onOpenChat: props.onOpenChat,
                    onSendToChat: props.onSendToChat,
                  })),
                ),
          records.length ? h('div', { className: 'dsh-sd-material-tip', style: { marginTop: '14px', textAlign: 'center' } },
            translate('history.footer')) : null,
        ),
      );
    }

