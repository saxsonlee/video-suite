# Seedance Studio · Codex 平台

这是原版 seedance-studio 工程的 Codex 接入：聊天工具与内嵌 MCP App 面板。按 HANDOFF-spa-unify.md，GUI 唯一源码是 platforms/web/public/；Codex 平台只保留桥接、媒体传输、尺寸适配和独立运行后端。

## 目录与构建

- platforms/web/public/：Lead 维护的共享 HTML、样式、应用代码和 i18n。
- platforms/codex-plugin/frontend/：Gemini 交付的 bridge.js，以及复用的 media.js、sizing.js；不包含第二套业务页面。
- platforms/codex-plugin/server/：Codex 的 MCP、SPA API、凭据及任务适配。
- platforms/codex-plugin/vendor/video-project/：原有项目管理后端快照。
- scripts/codex/：构建、安装、验证及 ZIP 打包脚本。
- dist/codex/：自动生成的可安装 Codex 插件。

在源码根目录执行：

~~~powershell
npm --prefix platforms/codex-plugin ci
node scripts/pack.mjs --platform all
node --test "test/*.test.mjs"
npm run test:codex
npm run test:codex-panel
python scripts/codex/package.py
~~~

构建原样内联共享 SPA 的本地脚本和样式，再注入 MCP 桥；生成页面在 dist/codex/platforms/codex-plugin/frontend/panel.html。panel-source.json 记录共享文件、桥接文件和产物哈希；构建验证会移除注入桥并与原样内联的共享页面逐字节比较。改共享界面后重新构建即可，勿修改 dist。

分平台源码保留在 platforms 内。安装包只包含运行依赖和内联页面，不携带原版 Web 服务、另一套前端或测试目录。运行时仍是 Codex 内嵌插件，面板请求经私有 MCP 工具传递，没有浏览器直连后端接口。

## 当前状态

Codex 平台共享同一份 SPA（生成、历史、播放、视频设置），项目/人物/环境/草图/版本管理等后端与聊天工具均已接通。设置与存储独立于 DSH（Codex 侧使用独立 provider 与 Windows 凭据管理器）。更新记录见 [CHANGELOG.md](../../CHANGELOG.md)。



## 验证与安装

浏览器脚本使用本机 Chrome 的真实 MCP Apps 桥与 sandbox="allow-scripts" 的不透明 iframe。仅使用演示媒体、本地模拟服务及隔离数据目录，不触发真实付费生成。环境脚本验证共享桥的项目 API，不把尚未迁移的环境编辑器算作 UI 验收通过。截图/日志在工程旁 _seedance-studio/codex-spa-unify-2026-11-06/。模拟宿主验证不等同于已经在当前 Codex 桌面插件窗口实测。

待共享界面验收完成，解压 Codex ZIP 后执行 install.cmd，更新使用 install.cmd --update。从源码执行 node scripts/codex/install.mjs --update 也只读取 dist/codex。安装器会备份旧版、切换注册路径，不关闭 Codex。历史与项目仍在 $CODEX_HOME/video-studio；重新加载插件后说“打开视频工作台”。

真实视频和分镜草图需明确配置模型、连接和独立凭据并授权生成。密钥写入 Windows 凭据管理器，不进入源码、安装包或模型可见返回值。稳定 requestId、持久任务回执和未决提交核验用于断线恢复。抽帧使用系统 FFmpeg 或 VIDEO_PROJECT_FFMPEG。

## 来源和分工

共享页面来源于 Lead 所属的 platforms/web/public，Codex 不改写其 HTML、应用逻辑或字典。Gemini UI 角色以 review 模式编写 Codex 薄桥，Codex 审查、集成并验证。provenance.json 保留前代来源、当前桥接回执和哈希；构建时 panel-source.json 记录实际共享源码哈希。

vendor/video-project 最初来自 dsh-video-plugins-2026-11-05.zip，0.2.2 同步原版 video-project 的项目、环境提示词、草图与 QA 逻辑，并适配 Codex 独立设置。本次 SPA 统一未改变这些后端功能，运行不依赖包外原版路径。
