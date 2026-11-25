# Seedance Studio — 功能验收清单（feature checklist）

> 维护：ux-qa｜更新：2026-11-04T06:57:27.975Z｜状态：✅ 通过 / 🟡 部分（有说明）/ ⏳ 待人工 / ❌ 失败（无）

## A. 需求 1：插件注册工具，模型可自主调用 `seedance_video`

| # | 验收点 | 状态 | 证据 |
|---|---|---|---|
| A1 | 工具注册（名称/中文 description/参数 schema：7 action、8 mode、素材与参数） | ✅ | `test/tool.test.mjs`（12 用例）；boot.log「tool registered: seedance_video」 |
| A2 | generate 秒回 `{taskId, status:'queued', hint}`，不阻塞 | ✅ | tool.test；L3 P0-2 |
| A3 | wait 轮询至终态/超时（默认 90s 最大 300s），响应 `exec.signal` | ✅ | tool.test「wait…exec.signal 透传」 |
| A4 | history/status/recreate/cancel/models 各 action 可用 | ✅ | tool.test 对应用例；L3 P0-3/P0-6/P0-7 |
| A5 | 单会话历史自动保存（sessionId 来自 exec.agent.session，缺失回落 default） | ✅ | tool.test「exec 缺失→default」；store 按会话分文件 |
| A6 | 输出统一 DTO + render 文本 + 尾帧 image block | ✅ | tool.test「render」「projectContent」 |
| A7 | demo 模式下工具全流程可用 | ✅ | demo-chain.test 全链路；L3 全流程走 demo |

## B. 需求 2：DSH Web 插件面板 + 会话上下文保存

| # | 验收点 | 状态 | 证据 |
|---|---|---|---|
| B1 | client bundle 格式正确（`__ModuleLoader__`/id/factory/exports/inject） | ✅ | `check-client-bundle.mjs --strict` PASS |
| B2 | 注册 main(key=seedance) + sidebar.panellist(id=seedance,label 视频创作) | ✅ | 同上（label=视频创作）；L4 E2 |
| B3 | 页面真实渲染、无 console error | ✅ | L4 E1/E12（console 0 条） |
| B4 | 按当前会话显示历史、可切换会话 | ✅ | L4 E5/E11；L3 P0-11 会话隔离 |
| B5 | 生成 demo 视频（2s 30%/6s 70%/8s succeeded） | ✅ | L4 E5/E6；tasks.test 时间线 |
| B6 | 刷新/重启后历史持久化 | ✅ | L4 E11（reload 后 4 卡）；tasks.test 恢复未完成任务 |
| B7 | 设置页填 API Key、读回打码 | ✅ | settings.test；L4 E10（type=password、DOM 无明文）；L3 P0-1b |

## C. 需求 3：根据历史视频再创作

| # | 验收点 | 状态 | 证据 |
|---|---|---|---|
| C1 | 再创作决策：远端视频>本地尾帧>纯文生 + warning | ✅ | tasks.test 4 用例；precheck T2 |
| C2 | 新记录带 `originId`，卡片标「改自 #xxx」 | ✅ | L3 P0-6；L4 E8/E9（截图 06/08） |
| C3 | 客户端抽帧（首帧/当前帧/尾帧）→ canvas dataURL → 首帧/参考图 | ✅ | L4 E8（sd-recreate-capture-last）；截图 07 |
| C4 | 参考视频模式复用远端 URL（24h 内） | ✅ | precheck T2；recreate 弹窗「参考视频」选项（演示记录无远端 URL 时置灰并提示） |

## D. Demo 模式

| # | 验收点 | 状态 | 证据 |
|---|---|---|---|
| D1 | 无 key 自动 demo；`provider:demo` 强制 | ✅ | settings.test；L3 P0-1（demo=true, demoReason 有值） |
| D2 | 时间线 2s/6s/8s + 包内示例视频/尾帧 | ✅ | tasks.test + precheck T1；L3 P0-4 落盘 files |
| D3 | 页面明确标注「演示模式（未配置 API Key）」 | ✅ | L4 E3 + 截图 01/04（横幅+胶囊） |
| D4 | 失败态可测（`__seedance_demo_fail__`） | ✅ | tasks.test「demo 失败关键词→failed」；失败卡片 UI 留人工复核（P3） |

## E. Lumina 对标（视觉/交互/文案）

| # | 验收点 | 状态 | 证据 |
|---|---|---|---|
| E1 | 布局：页头 + 左侧创作栏 + 右侧历史画廊（窄屏单列） | ✅ | 截图 01/04/10；窄屏 800/520 复核 PASS（_seedance-studio/qa/narrow-review/，见 QA-REPORT §4.4） |
| E2 | 交互：模式 Tab、参数、高级折叠、费用估算、生成按钮状态机 | ✅ | 截图 01/04；DOM 钩子 data-seedance-cost/advanced/mode |
| E3 | 状态卡：queued/running/进度/succeeded/failed/cancelled/expired | ✅ | 截图 04（进行中+已完成）；L4 E6 状态流转；失败态 L2 覆盖 |
| E4 | 中文文案全量、错误可读、demo 说明 | ✅ | 截图全部为中文；错误由 humanizeError 映射 |
| E5 | 样式走 DSH 主题变量、无硬编码暗色 | ✅ | 静态检查 PASS；浅色主题截图原生观感 |

## F. 工程与安全

| # | 验收点 | 状态 | 证据 |
|---|---|---|---|
| F1 | 测试 profile 安装（不改 desktop profile）+ HMR 生效 | ✅ | T1 verify-web-summary；bootGraph rev 自动更新 |
| F2 | 桌面应用稳定（51483 未受影响、未重启） | ✅ | 全程未触碰桌面应用 |
| F3 | 安全 S1–S10 | ✅ | QA-REPORT §5 + security-runtime.json（15 PASS） |
| F4 | 旧版参考实现已归档（仅源码仓库，不随发布包分发；原目录可安全删除） | ✅ | SHA1 校验一致，插件运行不依赖 |
| F5 | 可回滚（install-bundle --rollback / 文档） | ✅ | scripts/install-bundle.mjs 支持 --rollback |

> 统计：✅ 32 / 🟡 0 / ⏳ 0 / ❌ 0（2026-11-04 更新，逐条见上表）。

> 工具参数说明见 `docs/tool-reference.md`；配置见 `docs/configuration.md`；详细结论与证据见 `_seedance-studio/qa/QA-REPORT.md`；测试方案见 `docs/test-plan.md`；UX 规格见 `docs/ux-spec.md`；参数矩阵见 `docs/models-ui-matrix.md`。
