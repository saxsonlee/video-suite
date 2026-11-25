    // ==========================================================================
    // 右侧边栏：视频创作作为「每个会话」可打开的侧栏窗口
    //
    // 接入方式（DSH ui-sidebar-right 的公开扩展点）：
    //   1. ctx.sidebarRightTabs.register(type) 声明 tab 类型 + guide 卡片（「指南」页入口）
    //   2. ctx.slots.register({ name: 'sidebar.right.pane.tab', key: type.id }, Body) 挂载窗口内容
    // 用户点右侧栏「指南」里的「视频创作」卡片即可在任意会话打开；每会话独立一份，
    // 与主面板共用同一存储（历史/设置一致），窗口体复用 StudioPage（sidebar 布局变体）。
    // ==========================================================================
    const SIDEBAR_TAB_ID = 'dsh-seedance-studio/studio';
    const SIDEBAR_TAB_KIND = 'seedance-studio';

    /** guide 卡片图标（26px 线性「胶片 + 播放」图形；sidebar-right 以 currentColor 着色）。 */
    function SidebarGuideIcon(props) {
      const size = (props && props.size) || 26;
      return h('svg', {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        focusable: 'false',
        'aria-hidden': 'true',
        className: props && props.className,
      },
        h('rect', { x: 3, y: 4.5, width: 18, height: 15, rx: 2.5 }),
        h('path', { d: 'M3 9h18M3 15h18M8 4.5v15M16 4.5v15' }),
        h('path', { d: 'M11.2 11.6v4.8l4.2-2.4-4.2-2.4z', fill: 'currentColor', stroke: 'none' }),
      );
    }

    /** 侧栏 tab 的窗口体：套一层侧栏容器，复用完整创作台（数据与主面板同一套）。 */
    function SidebarStudioBody(props) {
      return h('div', { className: 'dsh-sd-sidebar-host', 'data-variant': 'sidebar' },
        h(StudioPage, { ctx: props.ctx, variant: 'sidebar' }),
      );
    }

    /** 注册右侧边栏 tab 类型与 guide 卡片；宿主没有侧栏服务时静默跳过，不影响主面板。 */
    function registerRightSidebar(ctx, t, safeEffect) {
      const manager = ctx && ctx.sidebarRightTabs;
      if (manager && typeof manager.register === 'function') {
        safeEffect(() => manager.register({
          id: SIDEBAR_TAB_ID,
          kind: SIDEBAR_TAB_KIND,
          title: () => t('sidebar.title'),
          keepMounted: true,
          guide: [{
            id: 'studio',
            order: 15,
            title: () => t('sidebar.guideTitle'),
            description: () => t('sidebar.guideDesc'),
            icon: SidebarGuideIcon,
          }],
        }), 'seedance-studio: right sidebar type');
      }
      safeEffect(() => {
        if (!ctx.slots || typeof ctx.slots.inject !== 'function' || typeof ctx.slots.register !== 'function') return () => {};
        return ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: SIDEBAR_TAB_ID,
          locale: NS,
          inject: () => ({ ctx }),
        }, SidebarStudioBody));
      }, 'seedance-studio: right sidebar body');
    }
