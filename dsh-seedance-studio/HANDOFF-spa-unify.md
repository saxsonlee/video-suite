# HANDOFF · 前端统一（iframe SPA + 平台壳）— 给 Codex 的交接说明

> 本文件是 Lead（DSH 侧）与 Codex 的协作契约。Codex 读完后按「分工」执行对应部分；
> 有冲突以本文件「验收标准」为准。最后更新：2026-11-06。

## 1. 背景与目标

现状：seedance-studio 有 4 份前端重复：DSH 插件（React/h）、Web 独立版（原生单页）、CLI（终端）、Codex 面板（原生 JS，Gemini 交付）。
目标：**GUI 形态收敛为一份 SPA + 各平台壳**；CLI 只共享模型层。改一个功能只改 1 份 UI。

## 2. 已验证的机制（Lead 实测，2026-11-06）

1. **插件路由可返回 HTML**：`ctx.connection.fetch.register` 是「精确路径 + 任意 Response」，bridge 原样写回 status/headers/body（已实测 `GET /api/seedance/panel` → 200 `text/html; charset=utf-8`）。
2. **宿主允许 iframe**：DSH 页面无 CSP / X-Frame-Options / COOP / COEP（测试实例实测）。
3. **iframe 可用标准 DOM**：DSH 插件前端是 React（h=React.createElement），右侧栏宿主包已有 iframe 处理先例。
4. **鉴权同源**：iframe 内请求自动带 cookie；无 cookie 时插件路由 401（已实测）。
5. **限制**：fetch 路由是**精确路径匹配**（`assertFetchRoute` 要求 path 在 `/api` 下），不支持通配；静态资源要么内联单文件 HTML，要么逐个注册固定路径。

## 3. 统一方案

- **SPA 唯一来源**：`platforms/web/public/`（现有 Web 独立版页面，原生 JS，无构建）。
  它是三套 GUI 的唯一 UI 源码；DSH 与 Codex 只做「壳 + 桥」。
- **DSH 形态**：插件路由 `GET /api/seedance/panel?theme=&lang=` 返回 SPA 单文件 HTML；
  插件前端（`platforms/dsh-plugin/frontend/src/app/studio-page.js`）用 `h('iframe')` 承载，主题/语言经 query 传入；宿主↔iframe 用 postMessage。
- **Web 形态**：`platforms/web/serve.js` 继续托管同一份 SPA（同源）。
- **Codex 形态**：`platforms/codex-plugin/frontend/` 的 panel.html **构建时内联同一份 SPA**（MCP Apps iframe 加载），不再单独维护第 4 套 UI。
- **CLI**：不共享 UI；共享 `shared/studio-core.js`（API 客户端 + 轮询状态机 + 格式化，无 DOM）。

契约（先冻结，双方按此对接）：
- 路由：`/api/seedance/panel`（GET，text/html；query: `theme=dark|light`, `lang=zh|en`）。
- iframe→宿主：`parent.postMessage({ type: 'sd-panel-ready', theme, lang }, '*')`。
- 宿主→iframe：`iframe.contentWindow.postMessage({ type: 'sd-panel-host', theme, lang, sessionId }, '*')`。
- 对话桥/深链：后续单独定义消息（`sd-open-chat` / `sd-send-to-chat`），不阻塞本期。

## 4. 分工（文件级 disjoint，别越界）

**Lead（DSH 侧）负责**：
- `server/routes/panel-page.js`、`server/routes/manager.js`（SPA HTML 路由）
- `platforms/dsh-plugin/frontend/src/**`（iframe 壳、postMessage 桥、旧组件迁移）
- `platforms/web/public/**`（SPA 增强：把 Codex 面板的成熟功能合进来）
- `server/routes/panel-page.js` 的测试（`test/*.test.mjs`）

**Codex 负责**：
- `platforms/codex-plugin/**`：panel.html 改成加载同一 SPA（构建内联 `platforms/web/public`），MCP 桥适配
- `scripts/pack.mjs` / `scripts/codex/**`：打包时把 SPA 内联进 `dist/codex/platforms/codex-plugin/frontend/panel.html`
- `dist/codex` 产物与 0.2.x zip 重打；`provenance.json` 更新
- 不修改 `platforms/dsh-plugin/**` 与 `platforms/web/public/**`（Lead 的写域）

## 5. 验收标准

- DSH 侧边栏/主面板显示 iframe SPA（可生成/看历史/设置），主题/语言跟随宿主；
- Web 独立版页面与 DSH 内是**同一份 HTML 产物**（无第 2 份 UI 代码）；
- Codex 面板加载同一 SPA（构建产物内联，无独立前端逻辑）；
- `node --test "test/*.test.mjs"` 全过；`node scripts/pack.mjs --platform all` 通过；
- 无硬编码重复文案：i18n 单一来源。

## 6. 当前状态（Lead 已做，2026-11-06）

- 原型完成：`/api/seedance/panel` 返回测试页（ping 结果 + query 参数 + postMessage），DSH 插件前端顶部已渲染 iframe 测试条（`data-testid="sd-panel-iframe-test"`，临时）。
- 已实测：panel 路由 200 text/html、无 cookie 401、客户端产物含 iframe 代码、142 测试全过。
- 下一步：等用户重启 DSH 确认真机效果 → 再开始正式迁移（Lead 做 SPA 增强，Codex 做 Codex 侧）。

## 7. 风险/注意

- DSH 插件 host 代码变更**需要重启一次桌面应用**；客户端 bundle 变更可通过插件事件流热更新。
- iframe 独立文档：深链/对话桥需要 postMessage 改造（功能保留，工作量在壳层）。
- iframe 内页面与宿主同源（DSH web 服务器），cookie 自动携带，无需额外 token。


---

## 8. 更新（2026-11-06 17:20，Lead）· Codex 设置继承 DSH 配置

用户反馈：Codex 面板设置页是独立存储（空），改 Provider 模式要重新输入 DSH 里已配置的 Key/URL。
修复（Lead 直接修改了 Codex 写域，请 Codex 复核）：

- `platforms/codex-plugin/server/settings.mjs`：新增 `readDshSettings(file)`、`mapDshSettings(dsh)`；
  `createSettings` 新增选项 `dshSettingsFile` 与存储字段 `inheritDsh`（默认 false）；
  `view()/runtime()/secrets()` 在 `inheritDsh === true` 时逐字段回退到 DSH 共享设置（只读，不复制密钥、不写 DSH 文件）。
- `platforms/codex-plugin/server/http.mjs`：`startServer` 接受 `dshSettingsFile`（默认空=不继承）。
- `platforms/codex-plugin/server/daemon.mjs`：生产入口传入 DSH 设置文件路径（$DSH_HOME 或 ~/.dsh）。
- `platforms/codex-plugin/server/spa-api.mjs`：设置视图/更新接受 `inheritDsh`。
- `platforms/web/public/index.html`（Lead 的 SPA 写域）：Codex 平台设置页新增「从 DSH 共享配置继承」开关；
  Codex 下 Provider 选项去掉 auto（Codex 要求显式 provider）。
- 测试：`node --test platforms/codex-plugin/test/*.test.mjs` 33/34 通过（唯一失败是环境缺 ffmpeg）。
- 已重新打包并安装：dist/codex → ~/.codex/local-marketplaces/video-studio-local/（0.2.3）；
  安装脚本最后一条 `codex plugin marketplace` 因本机无 codex CLI 失败，但 marketplace.json 与 config.toml 已指向新版本，重启 Codex 生效。

Codex 复核建议：确认 daemon 启动时继承路径正确；如需把继承改为默认开启，请更新测试并通知 Lead。
