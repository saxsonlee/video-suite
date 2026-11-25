/**
 * Codex 视频工作室 - 视口与尺寸自适应报告模块
 * 按照 ext-apps 规范向宿主发送 sendSizeChanged，并限制高度上限以避免高度无限膨胀。
 */
const dimension = (value) => Number.isFinite(value) && value > 0 && value <= 32768 ? value : null;

export function panelSize(context, viewport, contentHeight, { minHeight = 560 } = {}) {
  const bounds = context?.containerDimensions ?? {};
  const width = dimension(bounds.width) ?? dimension(bounds.maxWidth) ?? viewport.width;
  const height = dimension(bounds.height) ??
    Math.min(Math.max(minHeight, contentHeight), dimension(bounds.maxHeight) ?? 1000);
  return { width: Math.floor(width), height: Math.ceil(height) };
}

export function observePanelSize(app, content, options = {}) {
  let disposed = false;
  let frame = 0;
  let previous = "";
  let force = false;

  function schedule(resend = false) {
    force ||= resend;
    if (disposed || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (disposed) return;
      const size = panelSize(app.getHostContext(), {
        width: window.innerWidth,
        height: window.innerHeight
      }, Math.ceil(content.getBoundingClientRect().height), options);
      const key = JSON.stringify(size);
      const changed = force || key !== previous;
      force = false;
      if (!changed) return;
      previous = key;
      void app.sendSizeChanged(size).catch(() => { previous = ""; });
    });
  }

  const observer = new ResizeObserver(() => schedule());
  observer.observe(content);
  const resize = () => schedule();
  window.addEventListener("resize", resize);
  schedule(true);
  const retry = setTimeout(() => schedule(true), 250);

  return {
    refresh: () => schedule(true),
    dispose() {
      disposed = true;
      clearTimeout(retry);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    }
  };
}
