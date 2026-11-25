/**
 * Seedance Studio — 前端国际化（动态语言包，无构建，浏览器全局）。
 *
 * 语言包目录：locales/<lang>.json（键集一致，含 lang.name 自称）。
 * 新增语言 = 往目录放一个 <lang>.json 文件 + 在 locales/languages.json 清单里加语言代码；
 * 页面加载时会自动读取语言清单与全部语言包，语言切换按钮自动多一个语言。
 *
 * DSH/Codex 面板（单文件 HTML）由服务端内联注入 window.__SD_LOCALES__ =
 * { locales: [...], dictionaries: { lang: {...} } }，优先使用注入数据；
 * 独立版（静态页）则 fetch locales/languages.json + locales/<lang>.json。
 * 内置中文兜底：加载失败也能正常显示（不会白屏）。
 */
(function (global) {
  'use strict'

  /** 内置中文兜底（与 locales/zh.json 保持一致，用于语言文件缺失/加载失败时）。 */
  var BUILTIN_ZH = {
  "page.title": "Seedance 视频创作台 · 独立版",
  "header.title": "🎬 Seedance 视频创作台",
  "header.modeLoading": "加载中…",
  "header.storageTitle": "独立后端存储目录",
  "header.refresh": "刷新",
  "header.settings": "设置",
  "lang.switch": "EN",
  "form.title": "生成参数",
  "form.cancelRecreate": "取消",
  "form.promptLabel": "提示词",
  "form.promptPlaceholder": "例如：海边日落，镜头缓慢推进，电影感，暖色调",
  "form.model": "模型",
  "form.mode": "创作模式",
  "mode.text2video": "文生视频",
  "mode.image2video": "图生视频（首帧）",
  "mode.firstlast": "首尾帧过渡",
  "mode.reference": "多模态参考",
  "form.firstFrame": "首帧图 URL",
  "form.lastFrame": "尾帧图 URL",
  "form.refUrls": "参考图 URL（每行一个）",
  "form.resolution": "分辨率",
  "form.ratio": "画面比例",
  "form.duration": "时长",
  "form.generateAudio": "生成音频",
  "form.watermark": "AI 水印",
  "form.returnLastFrame": "返回尾帧",
  "form.submit": "开始生成",
  "form.submitRecreate": "再创作",
  "form.videoUrl": "视频 URL（编辑 / 延长用）",
  "form.videoUploadRequired": "编辑 / 延长模式需要填写视频 URL",
  "toast.draftFinalMissing": "该记录缺少远端任务 ID，无法转正式视频",
  "toast.draftFinalCreated": "已提交正式视频生成",
  "history.chatSend": "发送到对话",
  "history.detailTitle": "视频记录详情",
  "history.titleAll": "最近历史（全部会话）",
  "history.promptExpand": "展开全文",
  "history.promptCollapse": "收起",
  "history.detailVideo": "视频预览",
  "form.promptSection": "提示词",
  "form.modelSection": "模型与参数",
  "form.materialSection": "素材（可选）",
  "history.detailPrompt": "提示词",
  "history.detailParams": "参数",
  "history.detailActions": "操作",
  "history.detailCloseHint": "点击任意处关闭",
  "history.detailStatus": "状态",
  "history.detailCreated": "创建时间",
  "history.detailUpdated": "更新时间",
  "history.detailDuration": "时长",
  "history.detailSeed": "种子",
  "history.detailAudio": "生成音频",
  "history.detailLastFrame": "尾帧",
  "history.detailTask": "任务号",
  "history.detailProgress": "进度",
  "history.playVersion": "▶ 播放 {version}",
  "history.playFull": "▶ 播放全片",
  "player.notReady": "播放器未就绪",
  "player.notLoaded": "视频尚未加载完成，请稍后再抓帧",
  "form.draftHint": "样片模式：生成低成本 480p 样片，成功后可在历史卡片「转正式视频」。",
  "form.cameraFixed": "固定镜头",
  "form.seed": "种子（可选）",
  "form.seedPlaceholder": "留空 = 随机",
  "form.capturedFrame": "已抓帧（作为首帧）",
  "form.clearCapturedFrame": "清除",
  "history.draftFinal": "转正式视频",
  "history.copyLink": "复制链接",
  "history.copied": "已复制",
  "player.captureFirst": "抓首帧",
  "player.captureCurrent": "抓当前帧",
  "player.captureLast": "抓尾帧",
  "player.useFrame": "用作首帧",
  "player.recreate": "再创作",
  "player.download": "下载视频",
  "player.frameHint": "抓取视频帧可作为下一版的参考画面（再创作时填入首帧）",
  "form.hint": "独立后端 · 与 DSH 插件共享存储；无 Key 时自动演示模式（不调用真实接口、不产生费用）。",
  "history.title": "本次会话历史",
  "history.empty": "还没有记录 — 在左侧填写参数开始生成。",
  "history.play": "播放",
  "history.download": "下载",
  "history.cancel": "取消",
  "history.recreate": "再创作",
  "history.delete": "删除",
  "recreate.hint": "再创作来源：{id}（可修改提示词/参数）",
  "status.queued": "排队中",
  "status.running": "生成中",
  "status.succeeded": "已成功",
  "status.failed": "失败",
  "status.cancelled": "已取消",
  "status.expired": "已过期",
  "status.unknown": "未知",
  "badge.offline": "未连接",
  "badge.demo": "演示模式",
  "mode.real.ark": "真实模式 · 方舟直连",
  "mode.real.relay": "真实模式 · 中转站",
  "badge.connectFailed": "连接失败",
  "storage.label": "存储: ",
  "toast.created": "已创建生成任务",
  "toast.recreated": "已基于历史视频提交再创作",
  "toast.recreateLoaded": "已带入原视频参数，修改后可再次提交",
  "toast.deleted": "已删除",
  "toast.cancelled": "已取消",
  "toast.refreshed": "已刷新",
  "toast.settingsSaved": "设置已保存",
  "toast.initFailed": "初始化失败：",
  "error.promptRequired": "请输入提示词",
  "player.title": "播放 · {id}",
  "common.close": "关闭",
  "common.cancel": "取消",
  "common.save": "保存",
  "confirm.delete": "删除记录与本地媒体？此操作不可撤销。",
  "settings.title": "设置",
  "settings.provider": "Provider",
  "settings.providerAuto": "自动（推荐）",
  "settings.arkKey": "方舟 API Key（留空保持不变）",
  "settings.arkBase": "方舟 Base URL",
  "settings.relayBase": "中转站 Base URL（可空）",
  "settings.relayKey": "中转站 Key（可空）",
  "settings.defaultModel": "默认模型",
  "settings.relayModelsTitle": "中转站模型清单（主面板「模型」下拉只显示已选；留空显示全部）",
  "settings.relayFetch": "获取模型列表",
  "settings.relayFetching": "正在拉取…",
  "settings.relayFetchOk": "拉取成功：{count} 个模型",
  "settings.relayModelsEmpty": "点击「获取模型列表」拉取中转站可用模型",
  "settings.relaySelected": "已选模型（{count}）",
  "settings.relayNone": "未选择模型（主面板显示全部内置模型）",
  "settings.hint": "设置写入 settings.json（与 DSH 插件共享），Key 打码显示、不会明文回填。",
  "settings.unset": "未配置",
  "duration.auto": "自动（-1）",
  "duration.seconds": "{value} 秒",
  "duration.fallback": "{value} 秒",
  "lang.name": "中文"
}

  var DICTS = { zh: BUILTIN_ZH }
  var current = 'zh'
  var LANGUAGES = ['zh']
  var readyResolve = null
  var ready = new Promise(function (resolve) { readyResolve = resolve })

  function readStorage(name) { try { return global.localStorage ? global.localStorage.getItem(name) : null } catch (e) { return null } }
  function writeStorage(name, value) { try { if (global.localStorage) global.localStorage.setItem(name, String(value)) } catch (e) {} }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return res.json()
    })
  }

  function loadFromInjected() {
    var injected = global.__SD_LOCALES__
    if (!injected || typeof injected !== 'object') return false
    var dicts = injected.dictionaries && typeof injected.dictionaries === 'object' ? injected.dictionaries : null
    if (!dicts) return false
    var codes = Array.isArray(injected.locales) ? injected.locales : Object.keys(dicts)
    var loaded = 0
    codes.forEach(function (code) {
      if (dicts[code] && typeof dicts[code] === 'object') { DICTS[code] = dicts[code]; loaded += 1 }
    })
    return loaded > 0
  }

  function loadFromStatic() {
    return fetchJson('locales/languages.json').then(function (manifest) {
      var codes = manifest && Array.isArray(manifest.locales) ? manifest.locales : []
      if (!codes.length) return null
      return Promise.all(codes.map(function (code) {
        return fetchJson('locales/' + code + '.json').then(function (dict) {
          if (dict && typeof dict === 'object') DICTS[code] = dict
        }).catch(function () { /* 单个语言失败不影响其他 */ })
      }))
    })
  }

  function sortLanguages(codes) {
    var order = ['zh', 'en', 'ru']
    return codes.slice().sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b)
      var va = ia === -1 ? 99 : ia
      var vb = ib === -1 ? 99 : ib
      if (va !== vb) return va - vb
      return String(a).localeCompare(String(b))
    })
  }

  function detectLanguage(langs) {
    var saved = readStorage('seedance.web.lang')
    if (saved && langs.indexOf(saved) !== -1) return saved
    var nav = []
    try {
      if (global.navigator) nav = global.navigator.languages ? Array.prototype.slice.call(global.navigator.languages) : [global.navigator.language || '']
    } catch (e) { nav = [] }
    for (var i = 0; i < nav.length; i++) {
      var code = String(nav[i] || '').slice(0, 2).toLowerCase()
      if (code && langs.indexOf(code) !== -1) return code
    }
    return langs.indexOf('zh') !== -1 ? 'zh' : langs[0] || 'zh'
  }

  function finalizeLocales() {
    LANGUAGES = sortLanguages(Object.keys(DICTS))
    current = detectLanguage(LANGUAGES)
    writeStorage('seedance.web.lang', current)
    apply()
    if (readyResolve) { readyResolve(); readyResolve = null }
  }

  function startLoad() {
    if (loadFromInjected()) { finalizeLocales(); return }
    loadFromStatic().then(finalizeLocales).catch(finalizeLocales)
  }

  function t(key, params) {
    var dict = DICTS[current] || {}
    var text = dict[key] !== undefined ? dict[key] : (BUILTIN_ZH[key] !== undefined ? BUILTIN_ZH[key] : key)
    if (params && typeof params === 'object') {
      text = String(text).replace(/\{(\w+)\}/g, function (_, name) {
        return params[name] === undefined ? '{' + name + '}' : String(params[name])
      })
    }
    return text
  }

  function getLanguage() { return current }

  function setLanguage(lang) {
    if (!DICTS[lang] || lang === current) return
    current = lang
    writeStorage('seedance.web.lang', lang)
    apply()
    try { if (global.location) global.location.reload() } catch (e) { /* 无 location 时忽略 */ }
  }

  function languageName(code) {
    var dict = DICTS[code] || {}
    return dict['lang.name'] || String(code || '').toUpperCase()
  }

  function nextLanguage() {
    var index = LANGUAGES.indexOf(current)
    return LANGUAGES[(index + 1) % LANGUAGES.length] || current
  }

  function apply() {
    if (!global.document || !document.querySelectorAll) return
    var nodes = document.querySelectorAll('[data-i18n]')
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i]
      var key = node.getAttribute('data-i18n')
      if (!key) continue
      var text = t(key)
      if (node.getAttribute('data-i18n-html') === '1') node.innerHTML = text
      else node.textContent = text
    }
    var placeholders = document.querySelectorAll('[data-i18n-placeholder]')
    for (var j = 0; j < placeholders.length; j++) {
      var el = placeholders[j]
      var pk = el.getAttribute('data-i18n-placeholder')
      if (pk) el.setAttribute('placeholder', t(pk))
    }
    var titles = document.querySelectorAll('[data-i18n-title]')
    for (var k = 0; k < titles.length; k++) {
      var item = titles[k]
      var tk = item.getAttribute('data-i18n-title')
      if (tk) item.setAttribute('title', t(tk))
    }
  }

  global.SeedanceI18n = {
    t: t,
    getLanguage: getLanguage,
    setLanguage: setLanguage,
    languageName: languageName,
    nextLanguage: nextLanguage,
    detect: function () { return detectLanguage(LANGUAGES) },
    apply: apply,
    ready: ready,
    get LANGUAGES() { return LANGUAGES.slice() }
  }

  if (global.document) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply)
    else apply()
  }
  startLoad()
})(typeof window !== 'undefined' ? window : globalThis)
