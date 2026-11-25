# Seedance Studio — DSH 视频创作插件（设计与接口契约）

> 本文件是团队唯一契约。所有实现以本文件的接口、路径、验收标准为准；如需变更先改本文件并通知 Lead。
> 目标页参考：BytePlus ModelArk Lumina 视频生成页（https://ai.byteplus.com/lumina/en/model/video?mode=video）。
> 既有参考实现：旧版参考项目（上一会话自建的 Seedance API 封装 + Web UI，lib/ark.mjs、lib/relay.mjs、config/models/params 可复用逻辑，但**不要直接依赖包外路径**，需要的代码复制进插件）。该目录已归档（仅源码仓库，不随发布包分发；原目录随后删除，插件运行不依赖它）。

## 1. 交付物

一个可安装的 DSH bundle 插件包：`seedance-studio/`（包名 `dsh-seedance-studio`），安装进 DSH desktop profile 后：

1. **每个会话的智能体都能自主调用** `seedance_video` 工具：文生视频 / 图生视频 / 全模态参考 / 视频编辑·延长 / 样片(draft) / 查询 / 等待 / 历史 / 再创作 / 取消。
2. **Web GUI 侧边栏出现「视频创作」全局面板**：接近 Lumina 的创作台 UI（提示词、参考素材、参数、生成按钮、队列与历史画廊、播放器）。
3. **上下文保存**：视频按**会话（sessionId）**持久化历史记录与媒体文件，重启不丢；页面展示当前对话的历史，可基于历史视频一键「再创作」。
4. 无 API Key 时进入 **demo 模式**（本地模拟任务 + 内置示例视频），全链路可演示。
5. **（v1.1 增量）前后端分离 / 独立后端**：`platforms/web/serve.js` 可脱离 DSH 运行（node:http + 复用 `server/*`），暴露同一套 `/api/seedance/*`；内置独立前端 `platforms/web/public/`；支持 `--token` / `--cors` / `--storage` / `--api-key`。默认与 DSH 插件共享存储。
6. **（v1.2 增量）CLI 形态**：`platforms/cli/` 提供终端 TUI（交互式主菜单 + 生成向导）与脚本化子命令（generate/status/wait/history/models/cancel），复用同一套 `server/*` 与存储，支持 `--json`；`node scripts/pack.mjs --platform dsh|cli|web|all` 打包三种形态产物。
7. **（v1.3 增量）国际化**：三形态各自内置 zh/en 语言包（中文默认、英文完整），UI 文案不硬编码；DSH 前端跟随宿主 locale 实时切换，独立 Web 支持切换按钮，CLI 支持 `--lang` 与环境变量检测。
8. **（v1.4 增量）右侧边栏窗口**：注册 DSH 右侧栏 tab 类型 + 「指南」卡片（`ctx.sidebarRightTabs.register` + `sidebar.right.pane.tab`），使每个会话都能在右侧栏打开完整创作台（与主面板共享存储/历史，窗口状态按会话保留）。
9. **（v1.5 增量）对话联动**：历史记录可跳回所属会话对话（`uiWorkspace.openSession` + 切回 Conversation）；可把记录摘要发送到当前会话（会话作用域 `conversation.send`），由智能体继续 status 核对 / 读尾帧分析 / recreate 优化；轮询同步对话内工具生成的新记录并高亮。

## 2. 包结构

```
seedance-studio/
  package.json          # main / exports['./client'] / dsh.bundle.patch / bin / files
  platforms/            # 四种接入形态；各平台前端源码保留在各自平台目录
    dsh-plugin/         # ① DSH 形态
      plugin.js         #     宿主 Cordis 插件入口：apply(ctx, config)
      tool.js           #     seedance_video 工具定义（defineTool 由 plugin.js 注入）
      frontend/         #     浏览器半侧：src/（按功能分目录：theme/i18n/core/components/app；i18n/dictionaries.js 为 zh/en 字典）+ index.js（构建产物）
      cordis.patch.yml  #     bundle patch：insert 插件行
    cli/                # ② CLI 形态（终端 TUI，已实现）
      bin.js            #     CLI 入口（bin: dsh-seedance-cli）：子命令 + 交互式 TUI
      locale/           #     zh/en 语言包（zh.js / en.js，key 集一致）
      lib/              #     args（参数解析）/ render（终端渲染）/ context（数据层装配）/ tui（交互菜单）
      commands/         #     generate/status/wait/history/models/cancel
    web/                # ③ Web 形态（脱离 DSH 独立运行）
      serve.js          #     CLI 启动入口（bin: dsh-seedance-web）
      http.js           #     node:http 服务（复用 server/*、静态托管 public/）
      public/index.html #     浏览器页面（原生 HTML/JS，无构建；data-i18n 驱动文案）
      public/i18n.js    #     独立版 zh/en 语言包 + 语言检测/切换
    codex-plugin/       # ④ Codex 原生插件（MCP 聊天工具 + 内嵌面板）
      frontend/src/     #     Gemini 前端源码；不在 dist 中维护源码
      server/           #     Codex MCP、私有面板桥接、持久回执、凭据适配
      vendor/video-project/ # 视频项目纯后端快照，不依赖包外路径
      .codex-plugin/    #     Codex 清单源文件；打包放到产物根目录
      skills/           #     Codex 聊天工具行为说明
      test/             #     Codex 集成测试
  server/               # 公共后端逻辑（各形态共用，纯 Node，不依赖任何形态）
    api/                # Seedance API 客户端：errors/status/extract/relay-body/normalize/poll/ark/relay/client/download（index.js 统一导出）
    models/             # 模型目录与请求校验：catalog/validation/query/inputs/request/payload（index.js 统一导出）
    settings/           # 配置解析与用户设置：defaults/paths/values/record/config/view/manager（index.js 统一导出）
    store/              # 会话历史与媒体持久化：record/files/manager（index.js 统一导出）
    tasks/              # 任务管理器：demo/errors/recreate/helpers/manager（index.js 统一导出）
    routes/             # /api/seedance/* Fetch 路由：constants/errors/io/media/manager（index.js 统一导出）
    service.js          # 数据层装配（工具与路由共用）
  media/                # demo 模式示例视频/尾帧
  locale/               # 插件显示元数据（zh/en）
  test/                 # node:test 单测（server/* + dsh-plugin/tool.js + web/http.js + cli）
  scripts/              # 安装/回滚、测试实例验证、bundle 静态检查、多形态打包（pack.mjs）
    codex/              # Codex 专用构建、安装、验证；产物仍由 pack.mjs 统一输出
  dist/                 # dsh/、cli/、web/、codex/；各平台的生成产物，勿手工修改
  docs/                 # 规格与参考文档（含 reference/ 归档）
```

打包：`node scripts/pack.mjs --platform dsh|cli|web|codex|all [--out dist]` —— 按形态裁剪出
`dist/<platform>/`（形态目录 + `server/` + `media/` + 裁剪后的 package.json），保持包内相对路径不变；
打包后自动验证（dsh 结构 / cli `models` / web 页面+ping / codex MCP 工具、内嵌资源与演示后端）。

Codex 平台依赖在 `platforms/codex-plugin/package.json` 中隔离，首次构建用 `npm --prefix platforms/codex-plugin ci` 安装。前端仅从 `platforms/codex-plugin/frontend/src/` 构建，输出到 `dist/codex/platforms/codex-plugin/frontend/panel.html`。Codex 安装器只安装生成的 `dist/codex/`；用户设置、密钥、任务与测试结果不进入产物。原版 DSH、CLI、Web 平台保持各自入口和构建契约。

## 3. DSH 集成点（已逆向确认的事实）

### 3.1 宿主插件
- 入口 `platforms/dsh-plugin/plugin.js` 导出 `apply(ctx, config)`（Cordis 插件），可选 `inject` 数组声明服务依赖。
- 运行时包解析：插件真实路径在工作区，import `@deepseek-ai/*` 需要通过包内 `node_modules/@deepseek-ai/*` junction 指向运行时安装（app.asar/dsh/node_modules），由 spike 任务验证并提供方案。
- 注册工具：
  ```js
  import { defineTool } from '@deepseek-ai/dsh-tools'
  ctx.tools.register(defineTool({ name, description, parameters: {...}, output: { schema, render }, async execute(args, exec) {...} }))
  ```
  `exec.agent.session.id` 取当前会话 id（务必容错；无 agent 时用 "default" 或拒绝）。
- 注册 HTTP 路由（浏览器同源 fetch 自动带鉴权 cookie）：
  ```js
  ctx.connection.fetch.register({ path: '/api/seedance/history', methods: ['GET'], fetch: (request) => Response.json(...) })
  ```
  路由 path 必须在 `/api/` 下；返回标准 `Response`。媒体路由需支持 Range（206/Content-Range）。
- 宿主插件 config 由 cordis.patch.yml 传入；插件无 Config schema 时也可运行。
- **持久化根目录**：`$DSH_HOME/storages/seedance-studio/`（DSH_HOME 默认 `%USERPROFILE%\.dsh`；通过 `process.env.DSH_HOME` 或 os.homedir()/.dsh 解析，容错）。
  - `settings.json` 用户设置在页面里填写（API Key 等），读回时打码。
  - `sessions/<sessionId>.json` 每会话历史索引（数组）。
  - `media/<recordId>.mp4|.jpg` 下载落盘的媒体。

### 3.2 客户端插件
- `platforms/dsh-plugin/frontend/index.js` 是构建产物（源码：`frontend/src/` 按功能分目录，`node scripts/build-client.mjs` 按脚本内显式顺序清单拼接；单文件契约不变），格式必须为：
  ```js
  window.__ModuleLoader__.load({
    id: 'dsh-seedance-studio',
    factory: (require) => {
      var module = { exports: {} }; var exports = module.exports;
      const React = require('react');
      const jsxRuntime = require('react/jsx-runtime');
      // 可用 require 的共享模块仅限平台表：
      // react, react/jsx-runtime, react-dom, react-dom/client, @deepseek-ai/cordis, zod,
      // @tanstack/react-virtual, @deepseek-ai/dsh-client-store, @deepseek-ai/dsh-client-ui-slots,
      // @deepseek-ai/dsh-client-ui-primitives, @deepseek-ai/dsh-client-ui-dockkit
      const NS = 'seedance';
      const inject = ['slots', 'locale', 'layout', 'sessions', 'sidebarRightTabs'];
      function apply(ctx) { /* 注册页面与侧边栏 */ }
      exports.apply = apply; exports.inject = inject;
      return module.exports;
    }
  });
  ```
- `package.json` 中 `dsh.client = { platform: 'web', inject: [<提供 layout/locale/sessions/sidebarRightTabs 服务的客户端包名>] }`，`exports['./client'] = './platforms/dsh-plugin/frontend/index.js'`；右侧栏提供者包为 `@deepseek-ai/dsh-client-ui-sidebar-right`。
- 右侧栏接入（v1.4）：`ctx.sidebarRightTabs.register({ id: 'dsh-seedance-studio/studio', kind: 'seedance-studio', title, keepMounted: true, guide: [{ id: 'studio', order, title, description, icon }] })` 声明 tab 类型与「指南」卡片；`ctx.slots.register({ name: 'sidebar.right.pane.tab', key: <type.id>, locale: NS, inject: () => ({ ctx }) }, SidebarStudioBody)` 挂载窗口体。用户点指南卡片即 `openTab(kind, { replaceTab: true })`，每会话独立 tab；`StudioPage` 传 `variant='sidebar'` 走侧栏单列布局。
- 对话联动（v1.5，服务运行时惰性获取，不加入 `inject` 以避免强依赖）：跳会话 `ctx.get('uiWorkspace').openSession(sessionId)` + `ctx.layout.selectPanel(null)`（主区切回 Conversation）；发消息 `ctx.get('sessions').scope(sessionId).get('conversation').send(text)`（会话未绑定则先 openSession 再等待重试，最多 2.5s）；消息模板 `chat.continueMessage`（i18n，含任务 id/状态/模式/模型/提示词/远端链接）。
- 注册全局主面板（照抄 dsh-client-ui-plugin-manager 的写法，位于其 `platforms/dsh-plugin/frontend/index.js` 末尾）：
  ```js
  ctx.slots.inject('main', function* () {
    yield ctx.slots.register({ name: 'main', key: 'seedance', locale: NS, inject: () => ({}) }, StudioPage);
  });
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: 'seedance', order: 10, label: () => '视频创作', locale: NS
  }, PanelIcon));
  ```
- 页面通过 `fetch('/api/seedance/...')` 调宿主；轮询刷新（页面可见时 2-3s）。
- 当前会话 id：从客户端 `ctx.sessions`（@deepseek-ai/dsh-api-session-controller 客户端服务）取当前主视图绑定；ui-dev 需验证 API（可参考 dsh-client-ui-session 的 `publishMain` 逻辑：`ctx.sessions.list.getSnapshot()` + `ctx.sessions.retainInfo(id).getSnapshot().retainedBy.mainView > 0`）。
- 样式：手写 CSS 字符串，在 apply 里注入 `<style>`（走 ctx.effect 清理）；尽量使用 DSH 主题 CSS 变量（`--dsw-alias-*`，可参考 dsh-client-ui-plugin-manager/chat 的 CSS）保持原生观感。

## 4. HTTP API（宿主路由，页面与工具共用同一数据层）

统一前缀 `/api/seedance`。成功：`{ ok: true, value: ... }`；失败：`{ ok: false, error: { code, message } }`（HTTP 200/4xx/5xx 均可，前端按 ok 判）。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /config | `{ provider, demo, models: ModelInfo[], defaults, settings: SettingsView, capabilities }` |
| GET | /history?sessionId= | `{ records: Record[] }`（新→旧，含进行中任务） |
| GET | /task?sessionId=&id= | `{ record }` |
| POST | /generate | body `GenerateRequest` → `{ record }` |
| POST | /recreate | `{ sessionId, sourceId, prompt?, model?, params? }` → `{ record }`（以历史视频为源再创作；见 §7） |
| POST | /cancel | `{ sessionId, id }` → `{ record }` |
| POST | /delete | `{ sessionId, id }` → `{ ok:true }`（删记录与本地媒体） |
| GET | /settings | `{ settings: SettingsView }`（key 打码） |
| POST | /settings | body 部分设置 → `{ settings }`（写 settings.json） |
| POST | /relay/models | body `{ baseUrl?, apiKey?, protocol? }` → `{ endpoint, protocol, models: [{id,label}], latencyMs }`（拉取中转站模型列表 / 连通性测试；输入可覆盖已保存配置，结果缓存到 `RELAY_MODELS`） |
| GET | /media?id=&kind=video|lastframe|poster | 媒体字节流，支持 Range/206；id 为记录 id |
| GET | /events?sessionId= | （可选，SSE 进度推送；实现成本高可先轮询） |

### GenerateRequest
```
{
  sessionId: string,          // 必填（页面从当前会话取）
  prompt: string,             // 必填（非空）
  model?: string,             // 默认 models.default
  mode?: 'text2video'|'image2video'|'firstlast'|'reference'|'edit'|'extend'|'draft'|'draft-final',
  params?: { resolution?: '480p'|'720p'|'1080p', ratio?: string, duration?: number|-1, generateAudio?: boolean, seed?: number, watermark?: boolean, cameraFixed?: boolean, returnLastFrame?: boolean },
  inputs?: {
    images?: [{ role: 'first_frame'|'last_frame'|'reference_image', url?: string, dataUrl?: string, workspacePath?: string }],
    video?: { url?: string, taskId?: string, draftTaskId?: string },
    audio?: { dataUrl?: string, url?: string }
  },
  sourceId?: string            // 再创作来源记录 id（可选，等价 recreate 的生成侧）
}
```

### Record（持久化/返回模型）
```
{
  id: 'sd_<timestamp>_<rand>', sessionId, createdAt, updatedAt,
  status: 'queued'|'running'|'succeeded'|'failed'|'cancelled'|'expired',
  progress: number (0-100，粗粒度),
  prompt, model, provider, mode, params: {...}, inputs: {...},  // inputs 中 dataUrl 超 256KB 只存哈希/降级（避免索引过大），本地图片落盘 media/<id>-in<i>.<ext>
  remoteTaskId?: string, remoteVideoUrl?: string, remoteLastFrameUrl?: string,
  files?: { video?: string, lastFrame?: string, poster?: string },  // 相对 media/ 的文件名
  meta?: { width?, height?, duration?, seed?, usage?: {...}, draft?: boolean },
  error?: { code?, message },
  originId?: string,           // 由哪条历史再创作而来
  toolCallId?: string
}
```

## 5. 工具 `seedance_video`（模型自主调用）

一个统一工具，action 枚举（PTC 模式下由 run_code 程序调用）：
```
parameters: {
  action: 'generate'|'status'|'wait'|'history'|'recreate'|'cancel'|'models'   (required)
  prompt?, model?, mode?, resolution?, ratio?, duration?, seed?, generateAudio?,
  imageUrls?: string[],        // 参考图公网 URL 或 data:image/...（≤2MB）
  workspaceImages?: string[],  // 工作区图片路径（相对 cwd），host 读文件转 dataURL
  videoUrl?, sourceId?, taskId?, waitSeconds? (默认 90，最大 300), limit?
}
```
- generate：创建任务后立即返回 `{taskId, status:'queued', hint:'用 action=wait 等待完成'}`（不要阻塞太久）。
- wait：轮询等待至终态或超时；返回 record（含 `files.video` 本地绝对路径 + `remoteVideoUrl`）。
- history：返回当前会话最近记录摘要（id/status/prompt/model/时间/时长）。
- recreate：`sourceId` 指历史记录；生成参考素材：优先用远端视频 URL（若未过期/演示可用），否则使用落盘尾帧图 dataURL；同时继承原 prompt/params（可被参数覆盖）。
- 输出 schema 用统一 DTO；`render` 返回文本（含本地文件路径、状态、视频 URL、耗时/计费），有尾帧图时附 image content block。
- 工具 description 需写清：何时用、demo 模式、任务异步（建议 wait 30-120s）、单会话历史自动保存、如何再创作；中文描述（模型侧）。
- 工具执行耗时：generate 秒回；wait 最多 300s 且需响应 `exec.signal` 取消。

## 6. 配置与安全

- 优先级（高→低）：`storages/seedance-studio/settings.json` > 环境变量 > 插件 config > 默认。
- 支持字段：`provider`(auto|ark|relay|demo)、`ARK_API_KEY`、`ARK_BASE_URL`(默认 https://ark.cn-beijing.volces.com)、`RELAY_BASE_URL`、`RELAY_API_KEY`、`RELAY_PROTOCOL`(ark|openai)、`RELAY_CREATE_PATH`、`RELAY_STYLE`(metadata|flat|orca)、`RELAY_MODEL_MAP`、`RELAY_MODELS`(设置页勾选的已选模型清单，主要控制主面板「模型」下拉)、`DEFAULT_MODEL`(默认 doubao-seedance-2-5-260628)、`DEMO`。
- 无任何可用 key 且未显式 provider=ark/relay 时自动 demo。
- API Key 不得下发到浏览器；/settings 读回打码（如 `ark-****abcd`）。settings.json 写入时尽力设 0600。
- 参考代码：旧版参考归档（仅源码仓库，不随发布包分发）中的 models/params/ark/relay/config；其 API 校准文档是 API 事实来源（2026-11-04 抓取）。

## 7. 「根据历史视频再创作」的语义（关键需求）

1. 页面历史卡片点「再创作」→ 左侧表单带入原 prompt、model、params，并标记来源视频（缩略图）。
2. 用户可在来源视频上**选一帧**（播放器当前帧/首帧/尾帧）作为参考图（客户端 canvas 抽帧 → dataURL），选择「作为首帧 / 参考图」。
3. 若历史记录远端视频 URL 仍有效（<24h 且未删除）且模型支持，可选择「参考视频」模式，直接使用远端 URL 作为 reference_video（不能 base64）。
4. 工具 recreate 在无客户端交互时：继承原 prompt/params + 尾帧图（last_frame_url 落盘）作为 first_frame/reference_image，创建新任务；返回时带 `originId`。
5. 页面显示"再创作"链：sourceId → 新记录，卡片标「改自 #xxxx」。

## 8. Demo 模式

- 无 key 自动 demo；也支持 settings 强制 `provider: demo`。
- 生成：创建记录 queued → 2s running(30%) → 6s running(70%) → 8s succeeded，文件复制 `media/demo.mp4` 与 `media/demo-lastframe.jpg`；params/meta 模拟合理值。
- demo 模式 UI 明确标注"演示模式（未配置 API Key）"并可点开设置填写。

## 9. 验收标准

1. spike：在独立测试 profile 上启动 `dsh web`，安装本插件后，宿主工具与 client bundle 均被加载（证据：标记文件/日志/boot graph 检查 + `/plugins` 路由请求），且不改动 desktop profile。
2. host：纯 Node 单测通过（api normalize、params 构造、store 原子读写、tasks 状态机、recreate 决策）；demo 全链路 curl 可跑。
3. ui：bundle 产物语法可解析、格式正确；页面在测试实例中真实渲染（spike/Lead 验证）；无 console 报错；CSS 用 DSH 变量；界面文案走语言包（中文默认、en 完整，无硬编码中文 UI 文案）。
4. 集成：desktop profile 安装后（HMR 或用户重启），GUI 侧边栏出现「视频创作」，页面可生成 demo 视频、按会话显示历史、可再创作；工具在会话中可见（`tools` 列表含 seedance_video）。
5. 右侧栏：任一对话的右侧栏「指南」出现「视频创作」卡片，点开可在右栏生成/查看历史/再创作；窗口按会话保留，切换会话互不串台；`dsh.client.inject` 含 `@deepseek-ai/dsh-client-ui-sidebar-right`、bundle `inject` 含 `sidebarRightTabs`（`check-client-bundle` 22 项校验）。
6. 联动：历史卡片可跳回会话、可把记录摘要发送到当前对话（智能体继续 status 分析 / 读尾帧 / recreate 优化）；对话内工具生成的新记录在创作台自动出现并高亮（轮询 2.5s）。
7. 旧版参考实现已归档（SHA1 校验一致；仅源码仓库，不随发布包分发）；桌面应用不崩溃、可回滚（提供卸载脚本/说明）。

## 10. 国际化（v1.3）

- 三种形态的语言包各自独立（客户端 bundle 为普通脚本拼接，不能 import JSON）：
  - DSH 前端：`platforms/dsh-plugin/frontend/src/i18n/dictionaries.js`（`DICT_ZH`/`DICT_EN`，构建时拼进 bundle）
  - CLI：`platforms/cli/locale/{zh,en}.js`（ESM default export）
  - 独立 Web：`platforms/web/public/i18n.js`（浏览器全局 `window.SeedanceI18n`）
  - 根 `locale/{zh,en}.json`：插件包标题/描述（宿主插件管理器）
- key 约定：`<域>.<语义>`（`status.*`、`form.*`、`history.*`、`action.*`、`settings.*`、`errors.*` 等）；zh/en key 集必须完全一致，值不得为空。
- 语言检测/切换：
  - DSH 前端：`ctx.locale.register(NS, {zh, en})` + `ctx.locale.bind(NS)`；`translate()` 优先宿主字典（实时切换），宿主不可用时内置 zh 兜底；语言在 设置 → 通用 中切换。
  - Web：`localStorage['seedance.web.lang']` → `navigator.language` → zh；`#btnLang` 切换并写回 localStorage。
  - CLI：`--lang` → `LC_ALL`/`LC_MESSAGES`/`LANG` → zh；`setLanguage/t` 由 `lib/i18n.js` 提供。
- 服务端消息（工具错误、HTTP `error.message`、离线摘要/报告）是**数据**而非 UI 文案，保持中文，不下发语言包。
- 校验：`test/i18n.test.mjs`（三形态 key 集一致、英文无中文残留、静态页无硬编码 UI 文案、wordless key 覆盖）+ `scripts/check-client-bundle.mjs`（`locale.register`、key 集一致、英文渲染不含中文）。

## 11. 协作约束

- 桌面应用正在运行、且当前会话跑在其中：**禁止重启/关闭桌面应用**，禁止修改 desktop profile（安装步骤只在 Lead 确认后由 Lead 执行；spike 仅可用独立测试 profile）。
- 每个队友只写自己任务声明的作用域；跨作用域先提计划给 Lead。
- 所有验证脚本放 `scripts/` 或 `_seedance-studio/spike/`，产物/日志放 `_seedance-studio/`（不进最终包）。
- 运行时工具：
  - Node：DSH 安装目录下的 `resources/runtime/primary-runtime/dependencies/node/bin/node.exe`（在 PATH 外时用绝对路径调用）
  - pnpm：DSH 安装目录下的 `resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs`（用 Node 执行）
  - dsh CLI 入口：`D:\\DeepSeek\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js`
  - DSH 安装根：`D:\\DeepSeek\\resources\\app.asar\\dsh`
  - 桌面 profile：`%USERPROFILE%\\.dsh\\profiles\\desktop`
- 桌面 GUI HTTP 需鉴权（cookie/token），spike 需解决测试实例鉴权（独立 `dsh web` 启动会打印带 token 的 URL）。
