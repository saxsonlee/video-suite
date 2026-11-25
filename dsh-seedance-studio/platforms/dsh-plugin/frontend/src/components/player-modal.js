    // ==========================================================================
    // 播放器弹窗
    // ==========================================================================
    function PlayerModal(props) {
      const record = props.record;
      const videoRef = React.useRef(null);
      const frameState = React.useState(null);
      const frameDataUrl = frameState[0];
      const setFrameDataUrl = frameState[1];
      const timeState = React.useState(0);
      const currentTime = timeState[0];
      const setCurrentTime = timeState[1];
      const durationState = React.useState(0);
      const duration = durationState[0];
      const setDuration = durationState[1];
      const brokenState = React.useState(false);
      const broken = brokenState[0];
      const setBroken = brokenState[1];
      const busyState = React.useState(false);
      const busy = busyState[0];
      const setBusy = busyState[1];
      if (!record) return null;
      const capture = async (which) => {
        setBusy(true);
        try {
          let time = 0;
          const video = videoRef.current;
          if (which === 'current') time = video ? video.currentTime : 0;
          else if (which === 'last') time = Math.max(0, (duration || (video && video.duration) || 0) - 0.12);
          const dataUrl = await captureVideoFrame(video, time);
          setFrameDataUrl(dataUrl);
          props.onToast('success', translate('player.captureSuccess', { frame: which === 'last' ? translate('common.lastFrame') : which === 'first' ? translate('common.firstFrame') : translate('common.currentFrame') }));
        } catch (error) {
          props.onToast('error', error && error.message ? error.message : translate('toast.captureFailed'));
        } finally {
          setBusy(false);
        }
      };
      const meta = record.params || {};
      return h(Modal, {
        open: true,
        onClose: props.onClose,
        size: 'lg',
        icon: 'video',
        title: translate('player.title', { title: asStr(record.prompt) ? asStr(record.prompt).slice(0, 30) : shortId(record.id) }),
        subtitle: modelLabel(props.models, record.model) + ' · ' + modeLabel(record.mode) + ' · ' + fmtRelative(record.createdAt),
        testid: 'sd-player',
        hook: 'player',
        dataAttrs: { 'data-seedance-player': '' },
        closeTestid: 'sd-player-close',
        footer: h(React.Fragment, null,
          h('span', { className: 'grow', style: { fontSize: '11px', color: 'var(--sd-text-3)' } }, translate('player.urlTtl')),
          h(IconButton, { icon: 'download', label: translate('action.downloadVideo'), onClick: () => props.onDownload(record), testid: 'sd-player-download', hook: 'player-download' }, translate('action.download')),
          h(IconButton, { icon: 'recreate', label: translate('action.recreate'), variant: 'primary', onClick: () => props.onRecreate(record, frameDataUrl ? { frameDataUrl } : null), testid: 'sd-player-recreate', hook: 'player-recreate' }, translate('action.recreate')),
        ),
      },
        h('div', { className: 'dsh-sd-player-grid' },
          h('div', null,
            h('div', { className: 'dsh-sd-player-stage' },
              broken
                ? h('div', { className: 'dsh-sd-card-state', style: { aspectRatio: '16 / 9' } }, h(Icon, { name: 'warning', size: 30 }), h('span', null, translate('player.notPlayable')))
                : h('video', {
                    ref: videoRef,
                    src: recordVideoSrc(record),
                    controls: true,
                    autoPlay: true,
                    playsInline: true,
                    poster: recordPoster(record) || undefined,
                    onError: () => setBroken(true),
                    onLoadedMetadata: (event) => {
                      const video = event.currentTarget;
                      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
                    },
                    onTimeUpdate: (event) => setCurrentTime(event.currentTarget.currentTime || 0),
                    'data-testid': 'sd-player-video',
                    'data-seedance-player-video': '',
                  }),
            ),
            h('div', { className: 'dsh-sd-frame-timeline', style: { marginTop: '10px' } },
              h('input', {
                className: 'dsh-sd-range',
                type: 'range',
                min: 0,
                max: Math.max(0.1, duration || 1),
                step: 0.05,
                value: Math.min(currentTime, duration || 1),
                onChange: (event) => {
                  const next = asNum(event.target.value, 0);
                  setCurrentTime(next);
                  if (videoRef.current) videoRef.current.currentTime = next;
                },
                disabled: broken || !duration,
                'aria-label': translate('player.progressAria'),
              }),
              h('span', { style: { fontSize: '11px', color: 'var(--sd-text-3)', minWidth: '76px', textAlign: 'right' } },
                (duration ? currentTime.toFixed(1) + ' / ' + duration.toFixed(1) + 's' : '--')),
            ),
          ),
          h('div', { className: 'dsh-sd-player-side' },
            h('div', { className: 'dsh-sd-frame-tools' },
              h(IconButton, { icon: 'framesPick', label: translate('action.captureFirst'), onClick: () => capture('first'), disabled: busy || broken, testid: 'sd-capture-first' }, translate('common.firstFrame')),
              h(IconButton, { icon: 'framesPick', label: translate('action.captureCurrent'), onClick: () => capture('current'), disabled: busy || broken, testid: 'sd-capture-current' }, translate('common.currentFrame')),
              h(IconButton, { icon: 'framesPick', label: translate('action.captureLast'), onClick: () => capture('last'), disabled: busy || broken, testid: 'sd-capture-last' }, translate('common.lastFrame')),
            ),
            h('div', { className: 'dsh-sd-frame-preview', 'data-testid': 'sd-frame-preview' },
              busy ? h(Spinner, { label: translate('common.capturing') })
                : frameDataUrl ? h('img', { src: frameDataUrl, alt: translate('player.framePreview') })
                : translate('player.pickFrame'),
            ),
            frameDataUrl ? h(IconButton, {
              icon: 'recreate',
              label: translate('player.useFrame'),
              variant: 'primary',
              onClick: () => props.onRecreate(record, { frameDataUrl }),
              testid: 'sd-use-frame',
              hook: 'use-frame',
            }, translate('player.useFrame')) : null,
            h('div', { className: 'dsh-sd-player-meta' },
              h('div', null, h('b', null, translate('player.promptLabel')), asStr(record.prompt) || translate('common.none')),
              h('div', null, h('b', null, translate('player.paramsLabel')), (meta.resolution || '-') + ' · ' + (meta.ratio || '-') + ' · ' + (meta.autoDuration ? translate('common.smartDuration') : fmtDuration(meta.duration))),
              h('div', null, h('b', null, translate('player.taskLabel')), h('code', { style: { fontFamily: 'var(--sd-mono)', fontSize: '10.5px' } }, asStr(record.remoteTaskId) || record.id)),
              record.error && record.error.message ? h('div', { style: { color: 'var(--sd-error)' } }, h('b', null, translate('player.errorLabel')), asStr(record.error.message)) : null,
            ),
            h(IconButton, {
              icon: 'copy',
              label: translate('action.copyLink'),
              onClick: () => {
                copyText(mediaUrl(record.id, 'video')).then((ok) => props.onToast(ok ? 'success' : 'error', ok ? translate('toast.copySuccess') : translate('toast.copyFailed')));
              },
              testid: 'sd-copy-link',
            }, translate('action.copyLinkShort')),
          ),
        ),
      );
    }

