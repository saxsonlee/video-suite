/**
 * Codex Video Studio - Platform Transport & Host Bridge (v0.2.3)
 * Integrates the unmodified shared SPA (platforms/web/public/index.html) into
 * the opaque sandboxed MCP Ext-Apps iframe.
 */

import { App } from '@modelcontextprotocol/ext-apps';
import { MediaManager } from './media.js';
import { observePanelSize } from './sizing.js';

const PLUGIN_VERSION = '0.2.3';
const TOOL_NAME = 'video_studio_app';
const LS_SESSION = 'seedance.standalone.session';
const LS_LANG = 'seedance.web.lang';

// Verified installed SDK 2.0 semantic variables mapping
const SDK_VAR_MAPPING = {
  '--color-background-primary': '--bg',
  '--color-background-secondary': '--panel',
  '--color-background-tertiary': '--panel-2',
  '--color-border-primary': '--border',
  '--color-text-primary': '--text',
  '--color-text-secondary': '--muted'
};

// --- 1. In-Memory Storage Shim (opaque sandbox has no persistent storage) ---
class MemoryStorage {
  constructor() {
    this._map = new Map();
  }
  getItem(key) {
    const strKey = String(key);
    return this._map.has(strKey) ? this._map.get(strKey) : null;
  }
  setItem(key, value) {
    this._map.set(String(key), String(value));
  }
  removeItem(key) {
    this._map.delete(String(key));
  }
  clear() {
    this._map.clear();
  }
  key(index) {
    const keys = Array.from(this._map.keys());
    return keys[index] !== undefined ? keys[index] : null;
  }
  get length() {
    return this._map.size;
  }
}

const memLocalStorage = new MemoryStorage();
const memSessionStorage = new MemoryStorage();
memLocalStorage.setItem(LS_SESSION, 'default');

try {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    enumerable: true,
    value: memLocalStorage
  });
} catch (_) {
  window.localStorage = memLocalStorage;
}

try {
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    enumerable: true,
    value: memSessionStorage
  });
} catch (_) {
  window.sessionStorage = memSessionStorage;
}

// --- 2. State & Lifecycle Management ---
let app = null;
let mediaManager = null;
let sizingHandle = null;
let currentLifecycleId = 1;
let isBootstrapping = true;
let isPrefsInitialized = false;
const queuedHostMessages = [];

const hostState = {
  connected: false,
  isDisposed: false,
  theme: 'dark',
  lang: 'zh',
  sessionId: 'default',
  pending: null,
  listeners: new Set()
};

let readyResolve = null;
let readyReject = null;
let readyPromise = null;

function createReadyPromise() {
  readyPromise = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  // Guard against unhandled browser error if ready rejects before caller attaches handler
  readyPromise.catch(() => {});
}

createReadyPromise();

let prefsReadyResolve = null;
let prefsReadyReject = null;
let prefsReadyPromise = null;

function createPrefsPromise() {
  prefsReadyPromise = new Promise((resolve, reject) => {
    prefsReadyResolve = resolve;
    prefsReadyReject = reject;
  });
  prefsReadyPromise.catch(() => {});
}

createPrefsPromise();

function emitStateChange() {
  const snapshot = {
    connected: hostState.connected,
    isDisposed: hostState.isDisposed,
    theme: hostState.theme,
    lang: hostState.lang,
    sessionId: hostState.sessionId,
    pending: hostState.pending ? { ...hostState.pending } : null,
    lifecycleId: currentLifecycleId
  };
  for (const fn of hostState.listeners) {
    try { fn(snapshot); } catch (e) { console.error('[SeedanceBridge] Listener error', e); }
  }
}

// --- 3. App Instance Creation & Lifecycle Wiring ---
function createAppInstance(epoch) {
  const instance = new App(
    { name: 'Codex Video Studio', version: PLUGIN_VERSION },
    { availableDisplayModes: ['inline', 'fullscreen'] },
    { autoResize: false }
  );

  instance.onhostcontextchanged = (context) => {
    void (async () => {
    await prefsReadyPromise;
    if (hostState.isDisposed || epoch !== currentLifecycleId) return;
    let themeChanged = false;
    if (context?.theme && ['light', 'dark'].includes(context.theme)) {
      if (hostState.theme !== context.theme) {
        themeChanged = true;
      }
      applyTheme(context.theme, context.styles?.variables);
    } else if (context?.styles?.variables) {
      // Apply styles-only notifications even without theme
      applyTheme(hostState.theme, context.styles.variables);
    }

    if (themeChanged) {
      // Persist theme-only host changes
      rawCallTool('POST', '/api/seedance/ui-state', {
        sessionId: hostState.sessionId,
        theme: hostState.theme,
        lang: hostState.lang
      }).catch(() => {});
      emitStateChange();
    }

    if (context?.locale && typeof context.locale === 'string') {
      const hostLang = context.locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
      if (hostLang !== hostState.lang) {
        await setLanguage(hostLang);
      }
    }
    if (sizingHandle) {
      sizingHandle.refresh();
    }
    })().catch(() => {});
  };

  instance.onclose = () => {
    if (epoch === currentLifecycleId) {
      teardown();
    }
  };

  instance.onteardown = async () => {
    if (epoch === currentLifecycleId) {
      teardown();
    }
    return {};
  };

  return instance;
}

app = createAppInstance(currentLifecycleId);
mediaManager = new MediaManager(app);

// --- 4. Server Tool Invocation & Lifecycle Gating ---
let connectPromise = null;

async function ensureConnected(epoch) {
  const targetEpoch = epoch !== undefined ? epoch : currentLifecycleId;
  if (hostState.isDisposed || targetEpoch !== currentLifecycleId) {
    throw new Error('BRIDGE_DISPOSED');
  }
  if (hostState.connected) return;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      if (!app) throw new Error('BRIDGE_DISPOSED');
      await app.connect(undefined, { timeout: 10000 });
      if (hostState.isDisposed || targetEpoch !== currentLifecycleId) {
        throw new Error('BRIDGE_DISPOSED');
      }
      hostState.connected = true;
      hostState.isDisposed = false;
      if (mediaManager) {
        mediaManager.reset();
      }
      emitStateChange();
    } catch (err) {
      if (targetEpoch === currentLifecycleId) {
        hostState.connected = false;
        emitStateChange();
      }
      throw err;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

async function rawCallTool(method, path, body) {
  const capturedEpoch = currentLifecycleId;
  if (hostState.isDisposed) {
    throw new Error('BRIDGE_DISPOSED');
  }
  await ensureConnected(capturedEpoch);
  if (hostState.isDisposed || capturedEpoch !== currentLifecycleId || !app) {
    throw new Error('BRIDGE_DISPOSED');
  }

  const args = {
    method: (method || 'GET').toUpperCase(),
    path
  };
  if (body !== undefined) {
    args.body = body;
  }

  let res;
  try {
    res = await app.callServerTool(
      { name: TOOL_NAME, arguments: args },
      { timeout: 60000 }
    );
  } catch (err) {
    if (hostState.isDisposed || capturedEpoch !== currentLifecycleId) {
      throw new Error('BRIDGE_DISPOSED');
    }
    const wrapped = new Error(err.message || 'COMMUNICATION_ERROR');
    wrapped.isNetworkOrParse = true;
    throw wrapped;
  }

  if (hostState.isDisposed || capturedEpoch !== currentLifecycleId) {
    throw new Error('BRIDGE_DISPOSED');
  }

  const meta = res?._meta?.video_studio;
  if (!meta || typeof meta !== 'object' || typeof meta.ok !== 'boolean') {
    throw new Error('MALFORMED_TOOL_RESPONSE');
  }
  return meta;
}

async function callTool(method, path, body) {
  const epoch = currentLifecycleId;
  await readyPromise;
  if (hostState.isDisposed || epoch !== currentLifecycleId) throw new Error('BRIDGE_DISPOSED');
  return rawCallTool(method, path, body);
}

// --- 5. Pending Lock & Receipt Verification ---
async function syncPendingWithServer(epoch) {
  const targetEpoch = epoch || currentLifecycleId;
  const res = await rawCallTool('GET', '/api/seedance/pending');
  if (targetEpoch !== currentLifecycleId || hostState.isDisposed) return;
  if (!res || !res.ok) {
    const errMsg = res?.error?.message || 'FAILED_TO_SYNC_PENDING';
    const err = new Error(errMsg);
    err.code = res?.error?.code || 'PENDING_READ_ERROR';
    throw err;
  }
  if (!res.value || !Object.hasOwn(res.value, 'pending')) throw new Error('MALFORMED_PENDING_STATE');
  hostState.pending = res.value?.pending || null;
  emitStateChange();
  return hostState.pending;
}

async function checkAndAcknowledgePending(epoch) {
  const targetEpoch = epoch || currentLifecycleId;
  if (!hostState.pending?.id) return;
  const pendingItem = hostState.pending;
  const pendingId = pendingItem.id;
  const querySession = pendingItem.sessionId || hostState.sessionId;
  try {
    const res = await rawCallTool(
      'GET',
      `/api/seedance/task?sessionId=${encodeURIComponent(querySession)}&id=${encodeURIComponent(pendingId)}`
    );
    if (targetEpoch !== currentLifecycleId || hostState.isDisposed) return;
    if (res && res.ok && res.value && res.value.record) {
      const ackRes = await rawCallTool('POST', '/api/seedance/pending', { action: 'ack', requestId: pendingId });
      if (targetEpoch !== currentLifecycleId || hostState.isDisposed) return;
      if (ackRes && ackRes.ok) {
        hostState.pending = null;
        emitStateChange();
      }
    }
  } catch (_) {}
}

// --- 6. Media Interception & Modal Video Cleanup ---
async function resolveMediaUrl(mediaUrl) {
  const epoch = currentLifecycleId;
  await readyPromise;
  if (hostState.isDisposed || epoch !== currentLifecycleId) throw new Error('BRIDGE_DISPOSED');
  if (!mediaUrl || typeof mediaUrl !== 'string') return '';
  if (mediaUrl.startsWith('blob:') || mediaUrl.startsWith('data:')) return mediaUrl;

  // Accept opaque video-studio-media:<36hex> directly through MediaManager, not treat it as route
  if (mediaManager && mediaManager.isMediaReference(mediaUrl)) {
    return mediaManager.resolve(mediaUrl);
  }

  const res = await callTool('GET', mediaUrl);
  if (!res || !res.ok || !res.value?.reference) {
    throw new Error((res && res.error && res.error.message) || 'MEDIA_REFERENCE_FAILED');
  }
  return mediaManager.resolve(res.value.reference);
}

function resolveMediaInDom(container, lifecycleId) {
  if (!container || !container.querySelectorAll) return;
  const targets = container.querySelectorAll('[data-sd-src], [data-sd-href]');
  targets.forEach((el) => {
    const srcUrl = el.getAttribute('data-sd-src');
    if (srcUrl) {
      resolveMediaUrl(srcUrl).then((blobUrl) => {
        if (hostState.isDisposed || lifecycleId !== currentLifecycleId) return;
        if (!document.contains(el)) return;
        if (el.getAttribute('data-sd-src') !== srcUrl) return;
        el.src = blobUrl;
        el.removeAttribute('data-sd-src');
        if (el.tagName === 'VIDEO') {
          el.load();
        }
      }).catch(() => {
        if (lifecycleId !== currentLifecycleId) return;
        if (el.tagName === 'IMG' && el.onerror) {
          try { el.onerror(); } catch (_) {}
        }
      });
    }

    const hrefUrl = el.getAttribute('data-sd-href');
    if (hrefUrl) {
      resolveMediaUrl(hrefUrl).then((blobUrl) => {
        if (hostState.isDisposed || lifecycleId !== currentLifecycleId) return;
        if (!document.contains(el)) return;
        if (el.getAttribute('data-sd-href') !== hrefUrl) return;
        el.href = blobUrl;
        el.removeAttribute('data-sd-href');
      }).catch(() => {});
    }
  });
}

const originalInnerHtmlDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
if (originalInnerHtmlDesc && originalInnerHtmlDesc.set) {
  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: true,
    enumerable: true,
    get() {
      return originalInnerHtmlDesc.get.call(this);
    },
    set(val) {
      if (typeof val === 'string' && val.includes('/api/seedance/media')) {
        const rewritten = val
          .replace(
            /(<(?:img|video)\b[^>]*?)\bsrc=(['"])(\/api\/seedance\/media[^'"]*)\2/gi,
            '$1src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\'/\x3E" data-sd-src="$3"'
          )
          .replace(
            /(<a\b[^>]*?)\bhref=(['"])(\/api\/seedance\/media[^'"]*)\2/gi,
            '$1href="#" data-sd-href="$3"'
          );
        originalInnerHtmlDesc.set.call(this, rewritten);
        resolveMediaInDom(this, currentLifecycleId);
        return;
      }
      originalInnerHtmlDesc.set.call(this, val);
    }
  });
}

let activeModalVideo = null;
let activeVideoReference = null;

function cleanupDomVideos(root = document) {
  if (!root || !(root instanceof Element)) return;
  const videos = root.querySelectorAll ? Array.from(root.querySelectorAll('video')) : [];
  if (root.tagName === 'VIDEO') videos.push(root);
  for (const v of videos) {
    try {
      v.pause();
      v.removeAttribute('src');
      v.load();
    } catch (_) {}
  }
}

function nodeContainsVideo(node, targetVideo) {
  if (!node || !(node instanceof Element) || !targetVideo) return false;
  return node === targetVideo || (typeof node.contains === 'function' && node.contains(targetVideo));
}

const modalObserver = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const removedNode of mutation.removedNodes) {
      if (removedNode instanceof Element) {
        cleanupDomVideos(removedNode);
        // Clear active only if removed node contains the active player
        if (activeModalVideo && nodeContainsVideo(removedNode, activeModalVideo)) {
          activeModalVideo = null;
          activeVideoReference = null;
          if (mediaManager) {
            mediaManager.setActiveReference(null);
          }
        }
      }
    }
  }
});

function attachModalObserver() {
  const target = document.body || document.documentElement;
  if (target) {
    try { modalObserver.disconnect(); } catch (_) {}
    modalObserver.observe(target, { childList: true, subtree: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachModalObserver, { once: true });
} else {
  attachModalObserver();
}

// --- 7. Fetch Interception for /api/seedance ---
function makeResponse(payload, status = 200) {
  const bodyStr = JSON.stringify(payload);
  if (typeof Response === 'function') {
    try {
      return new Response(bodyStr, {
        status,
        headers: { 'content-type': 'application/json' }
      });
    } catch (_) {}
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => payload,
    text: async () => bodyStr
  };
}

window.fetch = async function (input, init = {}) {
  const epoch = currentLifecycleId;
  const url = typeof input === 'string' ? input : (input?.url || '');
  if (url.startsWith('/api/seedance') || url.startsWith('/api/')) {
    await readyPromise;
    if (hostState.isDisposed || epoch !== currentLifecycleId) throw new Error('BRIDGE_DISPOSED');

    const method = (init.method || 'GET').toUpperCase();
    let body = init.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) {}
    }

    if (url.startsWith('/api/seedance/media')) {
      try {
        const mediaRes = await rawCallTool('GET', url);
        if (mediaRes.ok && mediaRes.value?.reference) {
          const item = await mediaManager.fetchMedia(mediaRes.value.reference);
          return new Response(item.blob, {
            status: 200,
            headers: { 'content-type': item.mimeType || 'application/octet-stream' }
          });
        }
        return makeResponse(mediaRes, mediaRes.status || 404);
      } catch (err) {
        return makeResponse({ ok: false, error: { message: err.message, code: 'MEDIA_ERROR' } }, 500);
      }
    }

    const currentSession = hostState.sessionId;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      if (['generate', 'recreate', 'cancel', 'delete'].some((act) => url.includes(act))) {
        body = { ...body, sessionId: currentSession };
      }
    }

    let targetUrl = url;
    if (url.startsWith('/api/seedance/history') || url.startsWith('/api/seedance/task')) {
      try {
        const parsed = new URL(url, 'http://codex.invalid');
        parsed.searchParams.set('sessionId', currentSession);
        targetUrl = parsed.pathname + parsed.search;
      } catch (_) {}
    }

    if (method === 'POST' && targetUrl === '/api/seedance/delete') {
      const recordId = body?.id;
      const approvalKey = `${currentSession}:${recordId}:${currentLifecycleId}`;
      if (body?.confirmed !== true) {
        if (!approvedDeletions.has(approvalKey)) {
          return makeResponse({
            ok: false,
            error: { code: 'CONFIRMATION_REQUIRED', message: 'CONFIRMATION_REQUIRED' }
          }, 409);
        }
        approvedDeletions.delete(approvalKey);
        body = { ...body, confirmed: true };
      }
    }

    if (method === 'POST' && (targetUrl === '/api/seedance/generate' || targetUrl === '/api/seedance/recreate')) {
      if (hostState.pending?.id) {
        return makeResponse({
          ok: false,
          error: {
            code: 'PENDING_CONFLICT',
            message: `PENDING_CONFLICT: ${hostState.pending.id}`
          },
          status: 409
        }, 409);
      }

      const requestId = body?.requestId || ('req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
      const confirmed = body?.confirmed !== undefined ? body.confirmed : true;
      const payloadWithId = { ...body, requestId, confirmed };
      hostState.pending = { id: requestId, kind: 'video', sessionId: currentSession, createdAt: Date.now() };
      emitStateChange();

      try {
        const res = await rawCallTool(method, targetUrl, payloadWithId);
        if (res.ok) {
          const ackRes = await rawCallTool('POST', '/api/seedance/pending', { action: 'ack', requestId }).catch(() => null);
          if (ackRes && ackRes.ok) {
            hostState.pending = null;
            emitStateChange();
          }
        } else {
          await syncPendingWithServer().catch(() => {});
        }
        return makeResponse(res, res.status || 200);
      } catch (err) {
        // Unknown submit retains pending. No automatic reconnect/resubmit.
        return makeResponse({
          ok: false,
          error: { code: 'SUBMIT_ERROR', message: err.message },
          status: 500
        }, 500);
      }
    }

    try {
      const res = await rawCallTool(method, targetUrl, body);
      return makeResponse(res, res.status || (res.ok ? 200 : 400));
    } catch (err) {
      return makeResponse({
        ok: false,
        error: { code: 'COMMUNICATION_ERROR', message: err.message },
        status: 503
      }, 503);
    }
  }

  throw new Error('SANDBOX_FETCH_FORBIDDEN: ' + url);
};

// --- 8. Modal Bubbling Workaround & Active Media Tracking ---
window.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const modalRoot = document.getElementById('modal-root');
  if (!modalRoot || !modalRoot.contains(target)) return;

  const modal = target.closest('.modal');
  if (modal) {
    const explicitClose = target.closest('button[data-close], [data-close="1"]:not(.backdrop)');
    if (!explicitClose) {
      const backdrop = modalRoot.querySelector('.backdrop[data-close]');
      if (backdrop) {
        backdrop.removeAttribute('data-close');
        backdrop.setAttribute('data-sd-close-paused', '1');
        setTimeout(() => {
          if (backdrop.getAttribute('data-sd-close-paused') === '1') {
            backdrop.setAttribute('data-close', '1');
            backdrop.removeAttribute('data-sd-close-paused');
          }
        }, 0);
      }
    }
  }
}, true);

// Media player tracking: verify same current VIDEO element remains after await before pinning reference
window.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const playBtn = target.closest('button[data-action="play"]');
  if (!playBtn) return;

  const id = playBtn.getAttribute('data-id');
  if (!id) return;

  const capturedEpoch = currentLifecycleId;

  // Allow index.html click listener to execute synchronously so modal & video are inserted
  await Promise.resolve();

  const videoEl = document.querySelector('#modal-root video');
  if (!videoEl) return;
  activeModalVideo = videoEl;

  try {
    const res = await callTool('GET', `/api/seedance/media?id=${encodeURIComponent(id)}&kind=video`);
    if (capturedEpoch !== currentLifecycleId || hostState.isDisposed) return;

    // Verify same current VIDEO element remains after await before pinning reference
    if (activeModalVideo !== videoEl || !document.contains(videoEl)) {
      return;
    }

    if (res && res.ok && res.value?.reference) {
      activeVideoReference = res.value.reference;
      if (mediaManager) {
        mediaManager.setActiveReference(res.value.reference);
      }
    }
  } catch (_) {}
});

// --- 9. Non-Native Delete Confirmation Modal Adapter ---
const approvedDeletions = new Set();

window.confirm = function () {
  return false;
};

function showDeleteConfirmModal() {
  return new Promise((resolve) => {
    const modalRoot = document.getElementById('modal-root');
    if (!modalRoot) return resolve(false);

    const I18n = window.SeedanceI18n;
    const T = (key, p) => (I18n && typeof I18n.t === 'function' ? I18n.t(key, p) : key);

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.setAttribute('data-sd-confirm-backdrop', '1');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.maxWidth = '420px';

    const title = document.createElement('h3');
    title.textContent = T('history.delete');

    const bodyText = document.createElement('p');
    bodyText.style.margin = '12px 0 20px';
    bodyText.style.color = 'var(--text)';
    bodyText.style.fontSize = '13px';
    bodyText.textContent = T('confirm.delete');

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '10px';
    actions.style.justifyContent = 'flex-end';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'ghost';
    btnCancel.textContent = T('common.cancel');

    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'danger';
    btnConfirm.textContent = T('history.delete');

    actions.appendChild(btnCancel);
    actions.appendChild(btnConfirm);
    modal.appendChild(title);
    modal.appendChild(bodyText);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    modalRoot.appendChild(backdrop);

    const cleanup = (confirmed) => {
      backdrop.remove();
      window.removeEventListener('keydown', handleKey);
      resolve(confirmed);
    };

    const handleKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
    };
    window.addEventListener('keydown', handleKey);

    btnCancel.onclick = () => cleanup(false);
    btnConfirm.onclick = () => cleanup(true);
    backdrop.onclick = (e) => {
      if (e.target === backdrop) cleanup(false);
    };
  });
}

window.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const deleteBtn = target.closest('button[data-action="delete"]');
  if (!deleteBtn) return;

  const recordId = deleteBtn.getAttribute('data-id');
  if (!recordId) return;

  const capturedSession = hostState.sessionId;
  const capturedEpoch = currentLifecycleId;
  const approvalKey = `${capturedSession}:${recordId}:${capturedEpoch}`;

  if (approvedDeletions.has(approvalKey)) {
    return;
  }

  event.stopPropagation();
  event.stopImmediatePropagation();
  event.preventDefault();

  const confirmed = await showDeleteConfirmModal();
  if (confirmed && capturedEpoch === currentLifecycleId && capturedSession === hostState.sessionId) {
    approvedDeletions.add(approvalKey);
    window.fetch('/api/seedance/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: capturedSession, id: recordId })
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        refreshHistorySafely();
      } else {
        const msg = data?.error?.message || 'DELETE_FAILED';
        if (typeof window.toast === 'function') {
          window.toast(msg, 'err');
        }
      }
    }).catch((err) => {
      if (typeof window.toast === 'function') {
        window.toast(err.message || 'DELETE_FAILED', 'err');
      }
    });
  }
}, true);

// --- 10. Dynamic Renderers & Localization Helper ---
function captureUserFormState() {
  return {
    prompt: document.getElementById('prompt')?.value,
    model: document.getElementById('model')?.value,
    mode: document.getElementById('mode')?.value,
    firstFrameUrl: document.getElementById('firstFrameUrl')?.value,
    lastFrameUrl: document.getElementById('lastFrameUrl')?.value,
    refUrls: document.getElementById('refUrls')?.value,
    resolution: document.getElementById('resolution')?.value,
    ratio: document.getElementById('ratio')?.value,
    duration: document.getElementById('duration')?.value,
    generateAudio: document.getElementById('generateAudio')?.checked,
    watermark: document.getElementById('watermark')?.checked,
    returnLastFrame: document.getElementById('returnLastFrame')?.checked
  };
}

function restoreUserFormState(saved) {
  if (!saved) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };
  const setCheck = (id, val) => {
    const el = document.getElementById(id);
    if (el && typeof val === 'boolean') el.checked = val;
  };
  setVal('prompt', saved.prompt);
  setVal('model', saved.model);
  setVal('mode', saved.mode);
  setVal('firstFrameUrl', saved.firstFrameUrl);
  setVal('lastFrameUrl', saved.lastFrameUrl);
  setVal('refUrls', saved.refUrls);
  setVal('resolution', saved.resolution);
  setVal('ratio', saved.ratio);
  setVal('duration', saved.duration);
  setCheck('generateAudio', saved.generateAudio);
  setCheck('watermark', saved.watermark);
  setCheck('returnLastFrame', saved.returnLastFrame);
}

function rerenderDynamicUI() {
  const saved = captureUserFormState();

  if (typeof window.renderModeBadge === 'function') {
    try { window.renderModeBadge(); } catch (_) {}
  }
  if (typeof window.renderParamOptions === 'function') {
    try { window.renderParamOptions(); } catch (_) {}
  }
  restoreUserFormState(saved);
  if (typeof window.updateModeFields === 'function') {
    try { window.updateModeFields(); } catch (_) {}
  }
  if (typeof window.renderHistory === 'function') {
    try { window.renderHistory(); } catch (_) {}
  }
  if (typeof window.updateRecreateHint === 'function') {
    try { window.updateRecreateHint(); } catch (_) {}
  }
}

function refreshHistorySafely() {
  if (typeof window.loadHistory === 'function') {
    window.loadHistory().catch(() => {});
  } else {
    const btnRefresh = document.getElementById('btnRefresh');
    if (btnRefresh) btnRefresh.click();
  }
}

window.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const btnLang = target.closest('#btnLang');
  if (!btnLang) return;

  event.stopPropagation();
  event.stopImmediatePropagation();
  event.preventDefault();

  const I18n = window.SeedanceI18n;
  if (!I18n) return;
  const nextLang = I18n.getLanguage() === 'zh' ? 'en' : 'zh';
  void setLanguage(nextLang).catch(() => {});
}, true);

// --- 11. Theme & Language Functions ---
function applyTheme(theme, variables = null) {
  if (theme && ['light', 'dark'].includes(theme)) {
    hostState.theme = theme;
    document.documentElement.setAttribute('data-theme', hostState.theme);
    document.documentElement.style.colorScheme = hostState.theme;
  }

  if (variables && typeof variables === 'object') {
    for (const [key, value] of Object.entries(variables)) {
      if (typeof value !== 'string') continue;
      if (key.startsWith('--')) {
        document.documentElement.style.setProperty(key, value);
        const mappedKey = SDK_VAR_MAPPING[key];
        if (mappedKey) {
          document.documentElement.style.setProperty(mappedKey, value);
        }
      }
    }
  }
}

async function setTheme(theme) {
  if (!['light', 'dark'].includes(theme)) return;
  const epoch = currentLifecycleId;
  await prefsReadyPromise;
  if (hostState.isDisposed || epoch !== currentLifecycleId) return;
  applyTheme(theme);
  emitStateChange();
  return rawCallTool('POST', '/api/seedance/ui-state', {
    sessionId: hostState.sessionId,
    theme: hostState.theme,
    lang: hostState.lang
  }).catch(() => {});
}

async function setLanguage(lang) {
  if (!['zh', 'en'].includes(lang)) return;
  const epoch = currentLifecycleId;
  await prefsReadyPromise;
  if (hostState.isDisposed || epoch !== currentLifecycleId) return;
  hostState.lang = lang;
  memLocalStorage.setItem(LS_LANG, lang);
  if (window.SeedanceI18n) {
    window.SeedanceI18n.setLanguage(lang);
  }
  rerenderDynamicUI();
  postReadyMessage();
  emitStateChange();
  return rawCallTool('POST', '/api/seedance/ui-state', {
    sessionId: hostState.sessionId,
    theme: hostState.theme,
    lang: hostState.lang
  }).catch(() => {});
}

async function setSessionId(newSessionId) {
  if (!newSessionId || typeof newSessionId !== 'string') return;
  const epoch = currentLifecycleId;
  await prefsReadyPromise;
  if (hostState.isDisposed || epoch !== currentLifecycleId) return;
  if (newSessionId === hostState.sessionId) return;
  hostState.sessionId = newSessionId;
  memLocalStorage.setItem(LS_SESSION, newSessionId);
  if (window.state) {
    window.state.sessionId = newSessionId;
  }
  refreshHistorySafely();
  emitStateChange();
  return rawCallTool('POST', '/api/seedance/ui-state', {
    sessionId: hostState.sessionId,
    theme: hostState.theme,
    lang: hostState.lang
  }).catch(() => {});
}

function postReadyMessage() {
  if (hostState.isDisposed) return;
  try {
    if (window.parent && window.parent !== window) {
      // Exact { type, theme, lang }; sessionId is incoming sd-panel-host only
      window.parent.postMessage(
        Object.freeze({
          type: 'sd-panel-ready',
          theme: hostState.theme,
          lang: hostState.lang
        }),
        '*'
      );
    }
  } catch (_) {}
}

function handleHostMessage(data) {
  if (hostState.isDisposed) return;
  let changed = false;
  if (data.theme && ['light', 'dark'].includes(data.theme)) {
    applyTheme(data.theme);
    changed = true;
  }
  if (data.lang && ['zh', 'en'].includes(data.lang)) {
    hostState.lang = data.lang;
    memLocalStorage.setItem(LS_LANG, data.lang);
    if (window.SeedanceI18n) {
      window.SeedanceI18n.setLanguage(data.lang);
    }
    rerenderDynamicUI();
    postReadyMessage();
    changed = true;
  }
  if (data.sessionId && typeof data.sessionId === 'string') {
    if (hostState.sessionId !== data.sessionId) {
      hostState.sessionId = data.sessionId;
      memLocalStorage.setItem(LS_SESSION, data.sessionId);
      if (window.state) {
        window.state.sessionId = data.sessionId;
      }
      refreshHistorySafely();
      changed = true;
    }
  }
  if (changed) {
    emitStateChange();
    rawCallTool('POST', '/api/seedance/ui-state', {
      sessionId: hostState.sessionId,
      theme: hostState.theme,
      lang: hostState.lang
    }).catch(() => {});
  }
}

window.addEventListener('message', (event) => {
  if (hostState.isDisposed) return;
  // Parent-only validation
  if (event.source !== window.parent || window.parent === window) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'sd-panel-host') {
    if (!isPrefsInitialized) {
      // Queue parent sd-panel-host overrides arriving during boot
      queuedHostMessages.push(data);
      return;
    }
    handleHostMessage(data);
  }
});

// --- 12. Ext-Apps Lifecycle Management ---
function teardown() {
  if (isBootstrapping) readyReject?.(new Error('BRIDGE_DISPOSED'));
  if (!isPrefsInitialized) prefsReadyReject?.(new Error('BRIDGE_DISPOSED'));
  hostState.isDisposed = true;
  hostState.connected = false;
  connectPromise = null;
  approvedDeletions.clear();
  currentLifecycleId += 1;

  try {
    modalObserver.disconnect();
  } catch (_) {}

  cleanupDomVideos(document.body || document.documentElement);
  activeModalVideo = null;
  activeVideoReference = null;

  if (sizingHandle) {
    try { sizingHandle.dispose(); } catch (_) {}
    sizingHandle = null;
  }
  if (mediaManager) {
    try { mediaManager.revokeAll(); } catch (_) {}
  }
  emitStateChange();
}

window.addEventListener('pagehide', () => {
  teardown();
  if (app) {
    void app.close();
  }
}, { once: true });

// --- 13. Public window.SeedanceHost API ---
async function reconnect() {
  // Close existing App BEFORE creating new lifecycle/connecting
  if (app) {
    const oldApp = app;
    app = null;
    try {
      await oldApp.close();
    } catch (_) {}
  }
  teardown();

  currentLifecycleId += 1;
  const newEpoch = currentLifecycleId;
  hostState.isDisposed = false;
  hostState.connected = false;
  isBootstrapping = true;
  isPrefsInitialized = false;
  queuedHostMessages.length = 0;

  createPrefsPromise();
  createReadyPromise();

  app = createAppInstance(newEpoch);
  mediaManager = new MediaManager(app);

  return bootstrap(newEpoch);
}

window.SeedanceHost = {
  version: PLUGIN_VERSION,
  get app() {
    return app;
  },
  get mediaManager() {
    return mediaManager;
  },
  get ready() {
    return readyPromise;
  },
  getState() {
    return {
      connected: hostState.connected,
      isDisposed: hostState.isDisposed,
      theme: hostState.theme,
      lang: hostState.lang,
      sessionId: hostState.sessionId,
      pending: hostState.pending ? { ...hostState.pending } : null,
      lifecycleId: currentLifecycleId
    };
  },
  on(event, handler) {
    if (event === 'statechange' && typeof handler === 'function') {
      hostState.listeners.add(handler);
    }
  },
  off(event, handler) {
    if (event === 'statechange') {
      hostState.listeners.delete(handler);
    }
  },
  call: callTool,
  resolveMedia: resolveMediaUrl,
  setTheme,
  setLanguage,
  setSessionId,
  async requestDisplayMode(mode) {
    if (!app) throw new Error('BRIDGE_DISPOSED');
    return app.requestDisplayMode({ mode });
  },
  reconnect,
  async ackPending(requestId) {
    await readyPromise;
    const res = await rawCallTool('POST', '/api/seedance/pending', { action: 'ack', requestId });
    if (res && res.ok) {
      hostState.pending = null;
      emitStateChange();
    }
    return res;
  },
  async clearPending(options = {}) {
    await readyPromise;
    if (options.confirmed !== true) {
      throw new Error('CONFIRMATION_REQUIRED');
    }
    const requestId = hostState.pending?.id;
    const res = await rawCallTool('POST', '/api/seedance/pending', { action: 'clear', requestId, confirmed: true });
    if (res && res.ok) {
      hostState.pending = null;
      emitStateChange();
    }
    return res;
  }
};

// --- 14. Auto-bootstrap on DOM ready ---
async function bootstrap(epoch) {
  const currentEpoch = epoch || currentLifecycleId;
  try {
    await ensureConnected(currentEpoch);
    if (currentEpoch !== currentLifecycleId || hostState.isDisposed) return;

    const sizeTarget = document.body || document.documentElement;
    if (sizeTarget && app) {
      sizingHandle = observePanelSize(app, sizeTarget, { minHeight: 600 });
    }
    attachModalObserver();

    // 1. Read existing preferences first without writing defaults
    const stateRes = await rawCallTool('GET', '/api/seedance/ui-state');
    if (currentEpoch !== currentLifecycleId || hostState.isDisposed) return;

    if (!stateRes || !stateRes.ok) {
      const errMsg = stateRes?.error?.message || 'FAILED_TO_LOAD_UI_STATE';
      const err = new Error(errMsg);
      err.code = stateRes?.error?.code || 'UI_STATE_ERROR';
      throw err;
    }
    if (!stateRes.value || typeof stateRes.value.sessionId !== 'string' ||
        !['zh', 'en'].includes(stateRes.value.lang) ||
        !['light', 'dark'].includes(stateRes.value.theme)) throw new Error('MALFORMED_UI_STATE');

    if (stateRes.value) {
      const val = stateRes.value;
      if (val.sessionId) {
        hostState.sessionId = val.sessionId;
        memLocalStorage.setItem(LS_SESSION, val.sessionId);
        if (window.state) window.state.sessionId = val.sessionId;
      }
      if (val.theme && ['light', 'dark'].includes(val.theme)) {
        hostState.theme = val.theme;
      }
      if (val.lang && ['zh', 'en'].includes(val.lang)) {
        hostState.lang = val.lang;
        memLocalStorage.setItem(LS_LANG, val.lang);
      }
    }

    // 2. Host context takes precedence over saved preferences
    const ctx = app.getHostContext ? app.getHostContext() : null;
    let themeOnlyChange = false;
    if (ctx?.theme && ['light', 'dark'].includes(ctx.theme)) {
      if (hostState.theme !== ctx.theme) {
        themeOnlyChange = true;
      }
      hostState.theme = ctx.theme;
    }
    if (ctx?.locale && typeof ctx.locale === 'string') {
      const hostLang = ctx.locale.toLowerCase().startsWith('zh') ? 'zh' : 'en';
      hostState.lang = hostLang;
      memLocalStorage.setItem(LS_LANG, hostLang);
    }

    applyTheme(hostState.theme, ctx?.styles?.variables);
    if (window.SeedanceI18n) {
      window.SeedanceI18n.setLanguage(hostState.lang);
    }

    if (themeOnlyChange) {
      rawCallTool('POST', '/api/seedance/ui-state', {
        sessionId: hostState.sessionId,
        theme: hostState.theme,
        lang: hostState.lang
      }).catch(() => {});
    }

    // Mark preferences initialized and drain any queued parent overrides
    isPrefsInitialized = true;
    if (prefsReadyResolve) {
      prefsReadyResolve();
    }

    while (queuedHostMessages.length > 0) {
      const msg = queuedHostMessages.shift();
      handleHostMessage(msg);
    }

    // 3. Read pending before ready resolves (failure rejects readiness)
    await syncPendingWithServer(currentEpoch);
    if (currentEpoch !== currentLifecycleId || hostState.isDisposed) return;

    // 4. Check and acknowledge pending if completed
    await checkAndAcknowledgePending(currentEpoch);
    if (currentEpoch !== currentLifecycleId || hostState.isDisposed) return;

    rerenderDynamicUI();
    postReadyMessage();

    isBootstrapping = false;
    if (readyResolve) readyResolve();
  } catch (err) {
    if (currentEpoch !== currentLifecycleId) return;
    isBootstrapping = false;
    if (prefsReadyReject) prefsReadyReject(err);
    if (readyReject) readyReject(err);
    console.warn('[SeedanceBridge] Bootstrap failure:', err.message);
    throw err;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void bootstrap(currentLifecycleId).catch(() => {}); }, { once: true });
} else {
  void bootstrap(currentLifecycleId).catch(() => {});
}
