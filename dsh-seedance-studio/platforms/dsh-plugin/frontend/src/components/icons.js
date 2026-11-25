    // ==========================================================================
    // 内联 SVG 图标
    // ==========================================================================
    const ICON_PATHS = {
      film: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }], ['path', { d: 'M3 9h18M3 15h18M8 4v16M16 4v16' }]],
      text: [['path', { d: 'M4 6h16M4 12h11M4 18h14' }]],
      image: [['rect', { x: 3, y: 4, width: 18, height: 16, rx: 2.5 }], ['circle', { cx: 8.5, cy: 9.5, r: 1.6 }], ['path', { d: 'M3 16.5l5-5 4 4 3-2.5 6 4.5' }]],
      frames: [['rect', { x: 3, y: 3, width: 13, height: 13, rx: 2 }], ['rect', { x: 8, y: 8, width: 13, height: 13, rx: 2 }]],
      layers: [['path', { d: 'M12 3l9 5-9 5-9-5 9-5z' }], ['path', { d: 'M3 13l9 5 9-5' }]],
      edit: [['path', { d: 'M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20z' }], ['path', { d: 'M13.5 6.5l4 4' }]],
      extend: [['path', { d: 'M4 12h16M15 7l5 5-5 5' }]],
      draft: [['path', { d: 'M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4L12 3z' }], ['path', { d: 'M18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z' }]],
      play: [['path', { d: 'M8 5.5v13l11-6.5-11-6.5z' }]],
      download: [['path', { d: 'M12 4v11' }], ['path', { d: 'M7.5 10.5L12 15l4.5-4.5' }], ['path', { d: 'M4.5 19.5h15' }]],
      recreate: [['path', { d: 'M4.5 10a7.5 7.5 0 0 1 13-3.5L20 9' }], ['path', { d: 'M20 4v5h-5' }], ['path', { d: 'M19.5 14a7.5 7.5 0 0 1-13 3.5L4 15' }], ['path', { d: 'M4 20v-5h5' }]],
      settings: [['circle', { cx: 12, cy: 12, r: 3.2 }], ['path', { d: 'M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6' }]],
      refresh: [['path', { d: 'M20 11a8 8 0 1 0-2.3 6.7' }], ['path', { d: 'M20 4.5V11h-6.5' }]],
      close: [['path', { d: 'M6 6l12 12M18 6L6 18' }]],
      check: [['path', { d: 'M4.5 12.5l5 5 10-11' }]],
      warning: [['path', { d: 'M12 4l9 16H3l9-16z' }], ['path', { d: 'M12 9.5v4.5M12 17.2v.3' }]],
      info: [['circle', { cx: 12, cy: 12, r: 8.6 }], ['path', { d: 'M12 11v5.2M12 7.8v.3' }]],
      plus: [['path', { d: 'M12 5v14M5 12h14' }]],
      trash: [['path', { d: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13' }], ['path', { d: 'M10 10.5v6M14 10.5v6' }]],
      copy: [['rect', { x: 8.5, y: 8.5, width: 12, height: 12, rx: 2 }], ['path', { d: 'M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5' }]],
      external: [['path', { d: 'M13 5h6v6' }], ['path', { d: 'M19 5l-8 8' }], ['path', { d: 'M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4' }]],
      clock: [['circle', { cx: 12, cy: 12, r: 8.6 }], ['path', { d: 'M12 7.5V12l3.2 2' }]],
      upload: [['path', { d: 'M12 16V5M7.5 9.5L12 5l4.5 4.5' }], ['path', { d: 'M4.5 19.5h15' }]],
      video: [['rect', { x: 3, y: 6, width: 12.5, height: 12, rx: 2.5 }], ['path', { d: 'M15.5 10.5l5-2.8v8.6l-5-2.8v-3z' }]],
      audio: [['path', { d: 'M9 18V6l9-2v12' }], ['circle', { cx: 6.5, cy: 18, r: 2.5 }], ['circle', { cx: 15.5, cy: 16, r: 2.5 }]],
      dots: [['circle', { cx: 6, cy: 12, r: 1.5 }], ['circle', { cx: 12, cy: 12, r: 1.5 }], ['circle', { cx: 18, cy: 12, r: 1.5 }]],
      chevronDown: [['path', { d: 'M6 9.5l6 6 6-6' }]],
      chevronRight: [['path', { d: 'M9.5 6l6 6-6 6' }]],
      sparkles: [['path', { d: 'M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6L12 4z' }], ['path', { d: 'M18.5 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z' }]],
      stop: [['circle', { cx: 12, cy: 12, r: 8.6 }], ['path', { d: 'M9 9h6v6H9z' }]],
      zoom: [['circle', { cx: 11, cy: 11, r: 6.5 }], ['path', { d: 'M16 16l4.5 4.5' }]],
      framesPick: [['rect', { x: 3.5, y: 4, width: 17, height: 16, rx: 2 }], ['path', { d: 'M3.5 15l4.5-4.5 4 4 3-3 5.5 5' }]],
      message: [['path', { d: 'M4.5 5.5h15v10h-9.5l-3.5 3v-3h-2v-10z' }]],
    };

    function Icon(props) {
      const size = props.size || 16;
      const items = ICON_PATHS[props.name] || [];
      const children = items.map((item, index) => h(item[0], Object.assign({ key: index }, item[1])));
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: props.strokeWidth || 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        className: props.className,
        style: props.style,
      }, children);
    }

