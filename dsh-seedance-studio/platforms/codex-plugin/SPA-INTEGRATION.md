# 共享 SPA · Codex 侧交接（2026-11-06）

对应根目录 HANDOFF-spa-unify.md。Codex 工作写回原版 seedance-studio 工程；没有修改 Lead 的 Web SPA、DSH 插件、公共路由或根目录测试。

## 构建与目录

- 唯一 GUI 源码为 platforms/web/public/index.html 与 i18n.js。
- scripts/codex/build-panel.mjs 原样内联本地脚本/样式，在 head 中插入 Codex 桥，输出 dist/codex/platforms/codex-plugin/frontend/panel.html。
- 源目录 platforms/codex-plugin/frontend/ 只含 bridge.js、media.js、sizing.js。
- panel-source.json 记录所有输入和输出 SHA256。verify-package.mjs 移除桥后，逐字节检查共享 HTML 相等，并实际执行独立 MCP 握手。
- scripts/pack.mjs 的 DSH 包现带 platforms/web/public，以便 Lead 的正式 panel 路由读取；若将来添加 shared/，各平台公共打包也会携带。此时 shared/studio-core.js 尚不存在，Codex 未替 Lead 编造实现。
- 旧 0.2.2 完整前端归档在工程旁 _seedance-studio/codex-spa-unify-2026-11-06/legacy-frontend-0.2.2/。迁移前全量备份位于同目录 before/，可供 Lead 迁入高级功能。归档前逐个验证了五个文件与备份哈希相等。

## 传输契约

现有 SPA 的相对 fetch 请求通过内嵌桥转为 video_studio_app 私有 MCP 工具，不访问 localhost 网站。模型可见工具结果不包含面板设置或媒体正文；私有字段经 _meta 返回。

共享页面后续可以直接使用以下接口，逐步替代兼容钩子：

~~~javascript
await window.SeedanceHost.ready;
const result = await window.SeedanceHost.call(
  'POST', '/api/seedance/project',
  { action: 'get', project: '示例项目' }
);
if (!result.ok) throw new Error(result.error.message);
~~~

call 返回 {ok,value} 或 {ok:false,error,status}，保留后端确认要求。它不会代替业务代码确认生成。现有页面的 fetch 兼容层只在用户点击提交时补齐稳定 requestId 和确认标志。

| 路由 | 方法 | Codex 行为 |
| --- | --- | --- |
| ping / config / settings | GET | 共用模型目录、Codex 独立设置；config 带 platform: codex |
| settings | POST | 接受旧 SPA patch 或 Codex 设置字段；明确 demo/ark/relay，auto 返回错误 |
| history | GET | 按 sessionId 筛选，limit 默认 50、上限 200 |
| task | GET | 用 id（jobId/requestId/recordId）及 sessionId 查询原任务 |
| generate / recreate | POST | 必须 confirmed: true 和稳定 requestId；先持久化 pending 再提交 |
| cancel / delete | POST | id + sessionId；delete 还需 confirmed: true |
| pending | GET / POST | 读取未决提交；ack 仅在找到原回执后清除；clear 需要明确确认 |
| ui-state | GET / POST | 仅保存 sessionId、lang、theme，不保存 token/key |
| media | GET | id + kind=poster/video，返回私有引用，非 HTTP 文件正文 |
| project | POST | 保留既有项目 action、payload 与确认契约 |

同一 requestId 对应同一持久任务；响应丢失后查询原编号。不同编号遇到 pending 返回冲突，不重放收费请求。面板重载后核验原回执并 ack；不能证明已受理时保留未决状态。

SeedanceHost 还提供 getState、on/off('statechange')、setTheme、setLanguage、setSessionId、resolveMedia、requestDisplayMode、reconnect、ackPending 和 clearPending。clearPending 必须传 confirmed: true。宿主关闭后停止调用，显式 reconnect 才重新连接。

媒体用 video-studio-media: 不透明引用，通过 video_studio_media 分片读取并转为 Blob。项目 build-prompt 的 referenceImage 供预览；视频关联继续使用 sketchReference: {project,shot}，由后端检查用户保存的草图参考开关与当前计划。勿把私有引用当公共 URL 发送给上游。

消息保持交接文档形状：iframe 发 sd-panel-ready（theme/lang）；只接受真实父窗口的 sd-panel-host（theme/lang/sessionId）。Codex 额外接收 MCP 宿主主题、locale 和样式变量。桥负责传递上下文，完整主题样式由共享 SPA 实现。

## Lead 接下来需要处理

1. 将正式 panel 路由从测试页替换为共享 SPA；移除 DSH 临时 iframe 测试条。现有全平台打包通过不代表 DSH 正式页面迁移完成。
2. 将原 0.2.2 的项目、人物、全局/逐镜环境、QA、草图参考开关与归档界面合入共享 SPA。后端/聊天工具功能已保留；Codex 环境浏览器脚本测试的是桥接口，不是尚不存在的编辑器。
3. 将 i18n 中“与 DSH 共享存储/设置”“无 Key 自动演示”“auto 推荐”等文案和选项改成按平台能力显示。Codex 实际独立存储、Windows 密钥库、明确 provider，不自动降级演示。
4. 完成浅色主题和窄面板布局。当前共享 header 不换行，430px 下实测横向溢出；Codex 没有注入第二套布局 CSS。
5. 修复共享 modal 的 data-close 冒泡：当前内部控件点击也会命中外层 backdrop。Codex 暂以捕获阶段兼容；Lead 修复后可删除该钩子。
6. 使用同一个语言包刷新动态文字；当前 Codex 兼容层调用共享渲染函数并恢复未保存参数。后续统一实现时可去掉语言按钮兼容钩子。

0.2.3 为共享 SPA 集成候选包。保留已安装 0.2.2，不自动更新或重启桌面应用；待上述共享界面迁移完成再进行整体验收与安装。

## 验证边界

根目录测试与 Codex 后端测试使用隔离数据；浏览器脚本使用真实 MCP Apps AppBridge 和 sandbox="allow-scripts" iframe，并禁止直接网络。截图、测试日志在工程旁 _seedance-studio/codex-spa-unify-2026-11-06/。

需执行 node --test "test/*.test.mjs"、npm run test:codex、npm run test:codex-panel、node scripts/pack.mjs --platform all。共享源内容相等检查、后端/桥测试通过与 DSH 真机迁移验收是不同事项，不能互相替代。未在当前 Codex 桌面实际加载 0.2.3。
