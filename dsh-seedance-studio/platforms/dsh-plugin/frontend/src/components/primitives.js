    // ==========================================================================
    // 基础控件
    // ==========================================================================
    function Spinner(props) {
      return h('span', { className: 'dsh-sd-spinner', role: 'status', 'aria-label': props && props.label ? props.label : translate('common.loading') });
    }

    function Badge(props) {
      return h('span', {
        className: 'dsh-sd-badge' + (props.className ? ' ' + props.className : ''),
        'data-tone': props.tone || 'plain',
        title: props.title,
      }, props.icon ? h(Icon, { name: props.icon, size: 11 }) : null, props.children);
    }

    function StatusBadge(props) {
      const record = props.record;
      const meta = statusMeta(record);
      const active = record && (record.status === 'queued' || record.status === 'running');
      return h('span', {
        className: 'dsh-sd-badge',
        'data-tone': meta.tone,
        'data-status': meta.label,
      }, active ? h('span', { className: 'dsh-sd-pulse-dot' }) : null, meta.label);
    }

    function IconButton(props) {
      return h('button', {
        type: 'button',
        className: 'dsh-sd-iconbtn',
        title: props.title || props.label,
        'aria-label': props.label || props.title,
        onClick: props.onClick,
        disabled: props.disabled === true,
        'data-variant': props.variant || undefined,
        'data-testid': props.testid || undefined,
        'data-seedance-action': props.hook || undefined,
        style: props.style,
      }, props.icon ? h(Icon, { name: props.icon, size: props.iconSize || 15 }) : null, props.children || null);
    }

    function Switch(props) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': props.checked === true,
        'aria-label': props.ariaLabel || props.label,
        className: 'dsh-sd-switch',
        'data-on': props.checked === true,
        disabled: props.disabled === true,
        onClick: () => { if (!props.disabled && typeof props.onChange === 'function') props.onChange(!props.checked); },
        'data-testid': props.testid || undefined,
        'data-seedance-toggle': props.hook || undefined,
      });
    }

    function SwitchRow(props) {
      return h('div', { className: 'dsh-sd-switchrow' },
        h('span', { className: 'dsh-sd-switchrow-label' }, props.label, props.hint ? h('small', null, props.hint) : null),
        h(Switch, {
          checked: props.checked,
          onChange: props.onChange,
          disabled: props.disabled,
          ariaLabel: props.label,
          testid: props.testid,
          hook: props.hook,
        }),
      );
    }

    function Segmented(props) {
      const options = props.options || [];
      return h('div', {
        className: 'dsh-sd-seg' + (props.className ? ' ' + props.className : ''),
        'data-size': props.size || undefined,
        role: 'group',
        'aria-label': props.label,
      }, options.map((option) => h('button', {
        key: option.value,
        type: 'button',
        'data-active': option.value === props.value,
        disabled: props.disabled === true || option.disabled === true,
        title: option.title,
        onClick: () => { if (typeof props.onChange === 'function') props.onChange(option.value); },
        'data-testid': props.testid ? props.testid + '-' + option.value : undefined,
        'data-seedance-control': props.hook || undefined,
        'data-value': option.value,
      }, option.label)));
    }

    function Field(props) {
      return h('div', {
        className: 'dsh-sd-field' + (props.className ? ' ' + props.className : ''),
        style: props.span2 ? { gridColumn: 'span 2' } : undefined,
      },
        h('span', { className: 'dsh-sd-field-label' }, props.label, props.hint ? h('span', { className: 'dsh-sd-section-hint' }, props.hint) : null),
        props.children,
      );
    }

    function HintLine(props) {
      if (!props.children) return null;
      return h('div', { className: 'dsh-sd-warnline', 'data-kind': props.kind || 'muted', role: props.role || undefined },
        props.kind === 'error' ? h(Icon, { name: 'warning', size: 13 }) : null,
        h('span', null, props.children),
      );
    }

