    // ==========================================================================
    // 从历史视频选择（编辑/延长/参考视频场景）
    // ==========================================================================
    function VideoPickModal(props) {
      const records = (props.records || []).filter((record) => record.status === 'succeeded');
      return h(Modal, {
        open: true,
        onClose: props.onClose,
        size: 'lg',
        icon: 'video',
        title: translate('videoPick.title'),
        subtitle: translate('videoPick.subtitle'),
        testid: 'sd-video-pick',
        closeTestid: 'sd-video-pick-close',
      },
        records.length
          ? h('div', { className: 'dsh-sd-pick-list' },
              records.slice(0, 24).map((record) => h('div', { key: record.id, className: 'dsh-sd-pick-item' },
                h('video', {
                  src: recordVideoSrc(record) + '#t=0.1',
                  preload: 'metadata',
                  muted: true,
                  playsInline: true,
                  tabIndex: -1,
                  'aria-hidden': 'true',
                }),
                h('div', { className: 'cap' }, asStr(record.prompt) || shortId(record.id)),
                h('div', { className: 'row' },
                  h(IconButton, {
                    icon: 'check',
                    label: translate('videoPick.useAria'),
                    variant: 'primary',
                    onClick: () => props.onPick(record),
                    disabled: !asStr(record.remoteVideoUrl),
                    title: asStr(record.remoteVideoUrl) ? translate('videoPick.remoteTitle') : translate('videoPick.noRemote'),
                    testid: 'sd-video-pick-use',
                  }, asStr(record.remoteVideoUrl) ? translate('videoPick.use') : translate('videoPick.expired')),
                ),
              )),
            )
          : h(EmptyState, { title: translate('videoPick.emptyTitle'), description: translate('videoPick.emptyDesc') }),
      );
    }

