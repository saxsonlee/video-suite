    // ==========================================================================
    // 历史画廊
    // ==========================================================================
    function ToastItem(props) {
      React.useEffect(() => {
        const timer = setTimeout(() => props.onDone(props.toast.id), props.toast.holdMs || 4200);
        return () => clearTimeout(timer);
      }, [props.toast.id, props.toast.holdMs]);
      const kind = props.toast.kind;
      return h('div', {
        className: 'dsh-sd-toast',
        'data-kind': kind,
        role: kind === 'error' ? 'alert' : 'status',
        'data-testid': 'sd-toast',
        'data-seedance-toast': kind,
      },
        h('span', { className: 'dsh-sd-toast-icon' }, h(Icon, {
          name: kind === 'error' ? 'warning' : kind === 'success' ? 'check' : 'info',
          size: 15,
        })),
        h('span', null, props.toast.message),
      );
    }

    function ToastStack(props) {
      if (!props.toasts || !props.toasts.length) return null;
      return h('div', { className: 'dsh-sd-toast-stack', 'aria-live': 'polite' },
        props.toasts.map((toast) => h(ToastItem, { key: toast.id, toast, onDone: props.onDismiss })),
      );
    }

    function Modal(props) {
      React.useEffect(() => {
        if (!props.open) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape' && typeof props.onClose === 'function') props.onClose();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [props.open, props.onClose]);
      if (!props.open) return null;
      return h('div', {
        className: 'dsh-sd-modal-backdrop',
        role: 'presentation',
        onMouseDown: (event) => {
          if (event.target === event.currentTarget && typeof props.onClose === 'function') props.onClose();
        },
      },
        h('div', (() => {
          const attrs = {
            className: 'dsh-sd-modal',
            'data-size': props.size || undefined,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': props.title || translate('overlays.dialog'),
            'data-testid': props.testid || undefined,
            'data-seedance-modal': props.hook || undefined,
          };
          if (props.hook) {
            const hookName = /-modal$/.test(props.hook) ? props.hook : props.hook + '-modal';
            attrs['data-seedance-' + hookName] = '';
          }
          if (props.dataAttrs) Object.assign(attrs, props.dataAttrs);
          return attrs;
        })(),
          props.head || h('div', { className: 'dsh-sd-modal-head' },
            h(Icon, { name: props.icon || 'info', size: 17 }),
            h('div', null,
              h('div', { className: 'dsh-sd-modal-title' }, props.title),
              props.subtitle ? h('div', { className: 'dsh-sd-modal-sub' }, props.subtitle) : null,
            ),
            h(IconButton, { icon: 'close', label: translate('action.close'), onClick: props.onClose, testid: props.closeTestid }),
          ),
          h('div', { className: 'dsh-sd-modal-body' }, props.children),
          props.footer ? h('div', { className: 'dsh-sd-modal-foot' }, props.footer) : null,
        ),
      );
    }

