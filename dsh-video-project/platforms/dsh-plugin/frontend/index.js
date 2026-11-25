window.__ModuleLoader__.load({
  id: 'dsh-video-project',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

    const React = require('react');
    const h = React.createElement;
    const NS = 'videoProject';
    const inject = ['slots', 'locale'];

    const CSS = String.raw`
      .dsh-vp-frame-wrap { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; }
      .dsh-vp-frame-bar { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(255,255,255,.10)); flex: 0 0 auto; font-size: 12px; color: var(--dsw-alias-label-tertiary, #8b93a7); }
      .dsh-vp-frame-bar .spacer { flex: 1; }
      .dsh-vp-frame { flex: 1 1 auto; width: 100%; height: 100%; border: 0; min-height: 0; background: transparent; display: block; }
      .dsh-vp-frame-wrap[data-variant='settings'] .dsh-vp-frame { min-height: 320px; }
    `;

    const DICT_ZH = { panel: '视频项目' };
    const DICT_EN = { panel: 'Video Project' };

    function panelUrl(view) {
      // 每次挂载都带版本号：强制 iframe 重新加载最新面板（避免旧页面/浏览器缓存）
      return '/api/video-project/panel?platform=dsh&view=' + encodeURIComponent(view) + '&v=' + Date.now();
    }

    function FramePane(props) {
      const url = panelUrl(props.view || 'projects');
      return h('div', { className: 'dsh-vp-frame-wrap', 'data-variant': props.view || 'projects' },
        h('div', { className: 'dsh-vp-frame-bar' },
          h('span', null, props.view === 'settings' ? '视频项目 · 草图分镜设置' : '视频项目 · 项目列表与内容'),
          h('span', { className: 'spacer' }),
          h('a', { href: url, target: '_blank', rel: 'noreferrer', style: { color: 'inherit' } }, '新窗口打开')
        ),
        h('iframe', { className: 'dsh-vp-frame', src: url, title: props.view === 'settings' ? '视频项目设置' : '视频项目列表', 'data-dsh-video-project-frame': props.view || 'projects' })
      );
    }

    function ProjectsPage() { return h(FramePane, { view: 'projects' }); }
    function SettingsPage() { return h(FramePane, { view: 'settings' }); }

    function PanelIcon() {
      return h('span', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, color: 'currentColor' } },
        h('svg', { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' },
          h('rect', { x: 3, y: 5, width: 18, height: 14, rx: 3 }),
          h('path', { d: 'M10 9.5v5l4.5-2.5L10 9.5z' })
        )
      );
    }

    function apply(ctx) {
      try {
        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {};
          const el = document.createElement('style');
          el.setAttribute('data-dsh-plugin', 'dsh-video-project');
          el.textContent = CSS;
          document.head.appendChild(el);
          return () => { try { el.remove(); } catch (error) {} };
        }, 'video-project: styles');
      } catch (error) { /* 样式注入失败不影响面板 */ }

      let t = (key) => DICT_ZH[key] || key;
      try {
        ctx.locale.register(NS, { zh: DICT_ZH, en: DICT_EN });
        t = ctx.locale.bind(NS);
      } catch (error) { /* locale 不可用时退回内置文案 */ }

      try {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'video-project',
          order: 20,
          label: () => t('panel'),
          locale: NS
        }, PanelIcon));
      } catch (error) { /* 侧边栏入口失败不影响主面板 */ }

      // 主面板：共享 SPA（项目列表 + 内容展示），iframe 承载
      try {
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'video-project',
          locale: NS
        }, ProjectsPage));
      } catch (error) { /* 主面板注册失败时仅提供工具方式 */ }

      // 设置项放到「设置」界面（iframe 打开 SPA 的设置视图）
      try {
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'video-project',
          order: 30,
          label: () => t('panel'),
          locale: NS
        }, SettingsPage));
      } catch (error) { /* 设置分区注册失败时仅保留工具方式 */ }
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.NS = NS;
    return module.exports;
  }
});
