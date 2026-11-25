# dsh-seedance-studio · Seedance 视频创作台

> 更新记录见 [CHANGELOG.md](CHANGELOG.md)；本 README 只放功能与用法。

> DeepSeek Harness（DSH）视频生成专用插件。目标：在**每一个会话**里，智能体都能自主调用视频生成工具；Web GUI 提供对标 BytePlus ModelArk **Lumina 视频页**的创作台；按**会话**保存历史视频，并可基于历史视频**再创作**。

## 功能

- **会话内自主调用**：注册 `seedance_video` 工具（generate / status / wait / history / recreate / cancel / models），智能体可在任意会话直接发起视频生成、查询进度、基于历史再创作；异步任务模型 + 尾帧预览返回。
- **视频创作台**（侧边栏「视频创作」）：文生视频 / 图生视频（首帧）/ 首尾帧 / 全模态参考 / 视频编辑·延长 / 样片(draft)；参考图上传、参考视频 URL、参考音频；模型、分辨率、比例、时长（含智能时长）、生成音频、水印、返回尾帧、seed、固定镜头等参数；按模型能力联动禁用与限流提示。
- **按会话历史**：每个会话一条独立历史（prompt、参数、状态、进度、本地视频/尾帧），重启不丢；页面只读当前会话，可在页头切换会话。
- **基于历史再创作**：一键带入原 prompt/参数；支持从历史视频抽帧作为首帧/参考图，或沿用仍有效的远端视频 URL 作为参考视频；新记录带「改自 #xxxx」来源链。
- **演示模式**：未配置 API Key 时自动 demo（本地示例视频 + 8 秒模拟任务），全链路可体验。
- **双 Provider**：火山方舟 Ark 官方 API，或兼容中转站（relay：ark/openai 协议，支持 metadata/flat/orca 三种请求体风格与模型映射）。
- **中转站模型多选 + 连接测试**：设置页「中转服务（进阶）」可一键「获取模型列表」——用当前填写的中转站地址 + Key 直接拉取模型列表（OpenAI 兼容 `/v1/models`；方舟兼容站点自动尝试 `/api/v3/models` 并回退），成功显示耗时与模型数；在列表中**勾选多个模型**加入「已选模型清单」（带 × 可移除），主面板「模型」下拉只显示这些已选模型；也可选「自定义模型 ID…」手填。
- **前后端分离 / 独立后端**：`node platforms/web/serve.js --port 3000` 可脱离 DSH 独立运行，复用同一套 host 逻辑与 `/api/seedance/*` API，包内自带独立版页面 `platforms/web/public/`（详见下文「独立后端」章节）。
- **CLI 形态（终端 TUI）**：`node platforms/cli/bin.js` 提供交互式终端界面（主菜单 + 生成向导 + 进度）与脚本化子命令（generate/status/wait/history/models/cancel，支持 `--json`），复用同一套 `server/*` 与存储（详见下文「CLI 形态」章节）。
- **国际化（i18n）**：三种形态都内置 zh/en 语言包（中文默认、英文完整），界面文案全部走语言包、不写死在代码里；DSH 前端跟随宿主语言设置实时切换，独立 Web 有语言切换按钮，CLI 支持 `--lang`（详见下文「国际化」章节）。
- **右侧边栏窗口（每个会话独立）**：右侧栏「指南」新增「视频创作」卡片，任意会话点开即可在右侧边栏使用完整创作台（生成 / 历史 / 再创作，与主面板同一份存储），对话与创作并排；窗口状态按会话保留，切换会话各自独立。
- **对话联动闭环**：历史记录可「在对话中打开」（跳回所属会话）或「发送到对话」（把任务摘要发给当前会话的智能体继续分析与优化）；对话里智能体用工具生成后创作台自动同步并高亮新记录；配合工具侧「读尾帧图分析 → recreate 继续优化」，形成「讨论 → 生成 → 分析 → 优化」闭环。

## 工具参数里的本地图片（workspaceImages）

工具参数 `workspaceImages` 支持两类路径：**相对会话工作目录**的路径，或**本地绝对路径**（例如 dsh-video-project 生成的分镜草图、本地截图）。宿主读取文件转 dataURL，单张 ≤10MB，支持 png/jpg/jpeg/webp/gif。配合 video-project 的「把分镜草图作为生成参考图」开关，可把草图作为 reference 参考图传给生成工具（两个插件互相独立，只通过文件路径协作）。

## 安装方式

**重要：插件/服务端代码（platforms/dsh-plugin/plugin.js、tool.js、server/*）变更不受 HMR 监听，安装或升级后需重启一次 DSH 桌面应用生效；客户端页面代码改 `platforms/dsh-plugin/frontend/src/*.js` 后执行 `node scripts/build-client.mjs` 构建，产物 `platforms/dsh-plugin/frontend/index.js` 会通过插件事件流自动热更新，无需刷新页面。**

### 重新安装 / 安装到其他 profile
使用 DSH 自带的 Node 运行安装脚本（Electron-as-Node 启动 dsh CLI）：

```powershell
$node = '<DSH 安装目录>\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'   # 也可直接用 PATH 里的 node
& $node scripts/install-bundle.mjs --profile desktop --package . --apply --allow-desktop   # 安装（默认 dry-run，--apply 落盘）
& $node scripts/install-bundle.mjs --profile desktop --rollback                          # 回滚最近一次安装
```

### 验证安装（推荐，绝不触碰桌面实例）
```powershell
& $node scripts/verify-web.mjs --package . --port 51998
```
自动：初始化/复用独立测试 profile → 启动 dsh web 测试实例 → token 换 cookie → 断言 `/api/seedance/ping` 200、客户端 boot 图含本插件、bundle 200、boot.log 新行 → 清理退出（PASS 退出码 0）。

## 配置

未配置密钥时自动进入**演示模式**（页面有「演示模式」徽标）。两种配置方式：

1. 页面右上角「设置」：服务提供方（auto/ark/relay/demo）、方舟 API Key、Base URL、默认模型；中转进阶配置（填好 Base URL + Key 后可点「获取模型列表」验证连通；在模型列表里勾选多个模型加入「已选模型清单」，主面板「模型」下拉只显示这些）。保存在 `~/.dsh/storages/seedance-studio/settings.json`，**API Key 只保存在宿主，读回始终打码，不会下发浏览器**。
2. 环境变量（启动 DSH 前设置）：`ARK_API_KEY` / `ARK_BASE_URL` / `RELAY_BASE_URL` / `RELAY_API_KEY` / `RELAY_PROTOCOL` / `RELAY_STYLE` / `DEFAULT_MODEL` 等。

优先级：`settings.json` > 环境变量 > 插件 config > 默认值。完整字段与 provider 判定见 [docs/configuration.md](docs/configuration.md)。

### MiniMax H3（可选，经中转站）

MiniMax 走中转站的视频接口（`POST /videos`，产物 `GET /videos/{id}/content`）。使用方式：

1. 设置里 Provider 选 `relay`，填中转站 Base URL（如 `https://relay.example.com`）与 Key；
2. 默认模型填 `MiniMax-H3`（或点「获取模型列表」后勾选它）；
3. 协议会自动识别为 MiniMax，**不需要手填 RELAY_PROTOCOL**。

能力：4~15 秒、分辨率 `768P`/`2K`、比例 16:9 / 9:16 / 1:1 / 4:3 / 3:4；支持图生视频（首帧图，画面比例由首帧决定）；不支持生成音频、不支持样片（draft）、不支持局部编辑、不返回尾帧。

> 图生视频要求首帧是**可公网访问的图片 URL**（MiniMax 的 `input_reference`）：本地图片/工作区图片转成 data URL 时，上游可能不接受，建议先用图床或把图片放到可访问地址。

计费参考（中转站）：768P ¥0.50/秒，2K ¥0.80/秒；参考图前 5 张免费、第 6 张起 ¥0.20/张。一次 4 秒 768P 约 ¥2.00。
图像模型 `MiniMax-H3-Image` 可用于 video-project 的草图/三视图/场地图（尺寸自动适配 1024x1024 / 1152x2048 / 2048x1152）。

### 默认模型与中转站模型清单（重要）

- **中转站模式下，默认模型会自动对齐到你勾选的模型清单**：
  - 配置里的默认模型如果不在清单里（例如内置的 `doubao-seedance-2-5-260628`），会按「同系列名字」匹配到清单里的对应项（如 `doubao-seedance-2.5`）；匹配不到时用清单首项；
  - 工具调用或主面板生成时 `model` 留空，用的就是清单里的默认模型，不会再用内置的方舟官方 ID。
- 方舟官方模型 ID 规范是 `doubao-<系列>-<版本日期>`（如 `doubao-seedance-2-5-260628`），中转站的模型名通常不带日期（如 `doubao-seedance-2.5`）——两套命名不要混用，插件会按中转站清单自动收敛。

## 使用

- **智能体**：在任意会话直接说「帮我生成一个 5 秒的赛博朋克城市夜景延时视频」，智能体会调用 `seedance_video`（工具参数与返回见 [docs/tool-reference.md](docs/tool-reference.md)）；也可以说「把刚才那个视频再改一版」触发历史再创作。
- **对话式生成**：先和智能体聊创意/分镜/参数（如「我想要一只猫在窗台，暖光，镜头慢推」），聊好后说一句「**可以了，按照上面的内容生成一个视频**」，智能体会从对话上下文提炼描述直接生成，不需要你再重复一遍；生成后继续聊「太暗了，重做一版」「用尾帧再生成下一个镜头」即可迭代。
- **创作前置流程**：真正生成前，智能体会先当「编剧 + 导演 + 角色设计」：定故事/剧情 → 设计出场角色外观（保证多镜头一致）→ 输出**分镜脚本**（镜头号/景别机位/运动/时长/画面内容/音效）与**人物描述**给你确认；确认后才生成（多镜头可按「一镜一条」生成，用上一镜头尾帧做下一镜头首帧保持连贯）。
- **页面**：侧边栏「视频创作」→ 左侧填提示词/参考素材/参数 → 生成；右侧历史画廊查看进度、播放、下载、再创作、取消、删除。支持深链 `?panel=seedance`。
- **右侧边栏（边聊边创作）**：打开任一对话 → 右侧栏「指南」→ 点「视频创作」卡片 → 右侧栏打开创作台；每个会话独立窗口，与主面板共享历史与设置，可边看对话边生成。
- **与左侧对话联动**：历史卡片上的「在对话中打开」跳回该记录所属会话；「发送到对话」把任务 id/提示词/远端链接发给当前会话，智能体自动 status 核对、读尾帧分析，并用 recreate 继续优化——你只需在对话里继续讨论修改方向。
- **Demo 模式**：无需任何密钥即可体验完整流程（约 8 秒出片）。

## 重新生成前必须确认

首次生成可按对话式流程直接做；但只要本次是**修改/优化已有视频**（改提示词、参数、参考图、分镜、种子、模型，或基于上一版重抽），智能体必须先：

1. 逐条列出本次改动点（改了什么、为什么改）；
2. 把新的分镜/人物描述/提示词要点/关键参数发给用户；
3. 等用户明确同意后再调用 `generate` / `recreate`。

连续两次生成之间必须有用户消息，不允许自己连续重抽——视频生成按次计费，不能替用户花钱。

## 生成前确认闸门（硬拦截）

只靠提示词约束不够（模型可能还是直接生成）。插件在工具执行前加了一道**硬闸门**：

- 每次 `generate` / `recreate` 真正执行前，读取**会话里最后一条真实用户消息**；
- 必须包含明确确认词（可以/好的/没问题/确认/生成/开始/按这个/就这么/同意/来吧/做吧/OK…），且不含「先给我看/别生成/先别/等一下」这类拒绝词，才放行；
- 否则直接拒绝本次生成，返回错误提示智能体「先给用户看方案、等用户确认」——**只读操作（status/wait/history/models）不受影响**；
- 用户没开口确认，就一定花不了钱。

关闭方式（不推荐）：插件配置 `confirmGenerate: false`，或环境变量 `DSH_SEEDANCE_CONFIRM=0`。

## 能力探测（给协作插件用）

启动插件时识别「视频编辑」能力（模型目录里 `videoEditing === true` 的模型），写入共享能力文件 `~/.dsh/video-capabilities.json`（环境变量 `VIDEO_CAPABILITIES_FILE` 可改路径）：

```json
{
  "schemaVersion": 2,
  "source": "seedance-studio",
  "updatedAt": "...",
  "videoEdit": { "capable": true, "models": ["..."], "checkedAt": "..." }
}
```

- 本插件只写 `videoEdit`（是否支持「局部修改」），读不到按「不支持」处理；
- 图像生成能力（候选模型、是否启用、用哪个模型）**不在本插件管理**：由使用方自行决定与配置，本插件不替用户选择。

## 可选协作：项目策划 / 编导工作台

本插件可独立使用：只要能提供提示词与参数，就能生成视频。若同一环境里还安装了项目策划类插件（例如独立分发的 **[dsh-video-project](../video-project/README.md)**，工具 `video_project`），智能体会自行编排：先由它补全需求、整理人物卡与分镜、产出提示词，再把提示词交给本插件生成；生成后的分析/版本归档由项目插件自行处理。两者没有代码依赖，可单独安装、单独使用。

## 独立后端（脱离 DSH 运行）

前后端分离：后端可**完全脱离 DSH** 独立运行，复用同一套 `server/*` 业务逻辑，暴露与插件完全相同的 HTTP API；包内自带一个无构建的独立前端页面。

**最简单的打开方式：双击插件目录里的 `start-web.bat`**——自动查找 Node.js 运行时（优先用系统 PATH 里安装的 Node.js 18+，没有才用 DeepSeek Harness 自带的）、启动服务并打开浏览器（http://127.0.0.1:3000/），关闭窗口即停止；历史/设置与 DSH 插件共享。若 3000 端口被占用，按下面手动命令换端口。

**不需要 DSH 也能单独用**：只装了网页版/终端版、没装 DeepSeek Harness 的电脑，只要装好 Node.js 18+（https://nodejs.org/ 下载 LTS 一路下一步）即可；脚本找不到运行时（或版本太旧）会给出明确提示。

**只想分发某一种形态**：把整个 `dsh-seedance-studio` 目录拷走即可（网页版/终端版共用 `server/`），不需要安装 DSH。

```powershell
# 演示模式（无 Key 自动 demo，不调用真实接口、不产生费用）
node platforms/web/serve.js --port 3000
# 打开 http://127.0.0.1:3000/

# 真实生成（方舟直连）
node platforms/web/serve.js --port 3000 --api-key ark-xxxx

# 对外/跨域部署（务必加 token）
node platforms/web/serve.js --host 0.0.0.0 --port 8080 --cors --token my-secret
```

参数：`--port` / `--host` / `--storage` / `--token` / `--cors` / `--api-key` / `--relay-base-url` / `--relay-key` / `--demo` / `--no-static` / `--verbose` / `--lang zh|en`（`--help` 查看全部）。终端输出支持中文/英文（`--lang` 或 `LANG` 环境变量）；页面语言在右上角「EN / 中文」切换。

- **API**：与 DSH 插件完全一致（`/api/seedance/ping|config|history|task|generate|recreate|cancel|delete|settings|media`），契约见 [PLAN.md](PLAN.md) §4；媒体路由支持 Range（`<video>` 可拖动播放）。
- **前端**：`platforms/web/public/index.html`（原生 HTML/JS，无构建）由后端同源托管；加 `--cors` 后也可单独部署任意前端。
- **存储**：默认 `$DSH_HOME/storages/seedance-studio`，与 DSH 插件**共享**同一份历史与设置（两边看到同样的记录）；需要隔离时用 `--storage <dir>`。
- **安全**：默认仅监听 `127.0.0.1`；对外暴露务必启用 `--token`（`Authorization: Bearer <token>` 或 `?token=`），不要把无鉴权服务直接暴露公网。
- 独立后端只提供 HTTP 能力；`seedance_video` 工具注册仅在 DSH 插件内可用。
- 测试：`test/standalone.test.mjs`（4 用例：ping/config/静态页、demo 全链路、token 鉴权、CORS/405）。

## CLI 形态（终端版）

终端形态 `platforms/cli/`（零第三方依赖），复用同一套 `server/*` 数据层与存储（默认 `$DSH_HOME/storages/seedance-studio`，与插件/Web 共享历史与设置）。

**最简单的打开方式：双击插件目录里的 `start-cli.bat`**——自动找到 DSH 运行时并进入终端菜单；退出后回到这个窗口。

```powershell
# 交互式 TUI（主菜单 + 生成向导 + 进度）
node platforms/cli/bin.js

# 命令行模式（脚本/自动化友好，支持 --json）
node platforms/cli/bin.js generate --prompt "海边日落，镜头慢慢推进" --duration 5
node platforms/cli/bin.js generate --prompt "续写" --first-frame ./start.png --last-frame ./end.png
node platforms/cli/bin.js status sd_xxx --json
node platforms/cli/bin.js wait sd_xxx
node platforms/cli/bin.js history --session default
node platforms/cli/bin.js models --json
node platforms/cli/bin.js cancel sd_xxx
```

- 全局参数：`--session` / `--storage` / `--demo` / `--json` / `--no-color` / `--lang zh|en`；`--help` 查看全部。
- 未配置 API Key 时自动演示模式；`--demo` 强制演示（不产生费用）。
- 非法命令退出码 2；运行错误退出码 1。
- 测试：`test/cli.test.mjs`（参数解析 / 渲染 / 上下文 / 生成命令 / 进程冒烟）。

## 国际化（i18n · 动态语言包）

语言包目录：`platforms/web/public/locales/<语言代码>.json`（键集必须一致，含 `lang.name` 自称）。
**新增语言 = 放一个 `<语言代码>.json` 文件，并在 `locales/languages.json` 清单里加上该语言代码**；重启/刷新后，创作台右上角的语言按钮会自动多一个语言。

- 内置语言：`zh`（中文，同时内置兜底）、`en`（English）、`ru`（Русский）；
- 语言切换按钮显示「下一个语言」，点击切换（记忆在 localStorage）；
- DSH 面板/Codex 面板会内联语言包；独立 Web 版直接读取 locales 目录；
- 语言包加载失败时自动回退内置中文（不会白屏）；
- CLI 语言包在 `platforms/cli/locale/`。

## 数据与隐私

- 存储：`~/.dsh/storages/seedance-studio/`（`settings.json`、`sessions/<sessionId>.json`、`media/<recordId>.mp4|.jpg`）。
- 视频生成后落盘本地；远端 URL 仅 24 小时有效，页面与工具均优先使用本地文件。
- API Key 仅在宿主进程内使用；页面、日志、接口响应均不出现明文密钥。
- 卸载：插件管理器禁用/卸载，或 `scripts/install-bundle.mjs --rollback`；历史数据目录可手动删除。

## 目录结构

```
seedance-studio/
  platforms/              # 四种接入形态；平台前端源码都归属各自平台目录
    dsh-plugin/           # ① DSH 形态：plugin.js（宿主入口）/ tool.js（工具定义）
      frontend/           #    └ DSH 前端：src/（theme/i18n/core/components/app 源码；i18n/dictionaries.js 为 zh/en 字典；app/sidebar-tab.js 为右侧栏窗口接入）+ index.js（构建产物，勿手改）
      cordis.patch.yml    #    └ bundle patch（插入插件行）
    cli/                  # ② CLI 形态（终端 TUI：bin.js + lib/ + commands/ + locale/ 语言包）
    web/                  # ③ Web 形态：http.js（HTTP 服务）/ serve.js（启动入口）/ public/index.html（页面）+ public/i18n.js（zh/en 语言包）
    codex-plugin/         # ④ Codex 插件：frontend/src/ 源码、server/ 接入、MCP 清单与 skills/
  server/                 # 公共后端逻辑（按功能分目录：api/models/settings/store/tasks/routes + service.js）
  media/                  # demo 视频与尾帧（演示模式依赖，随包发布）
  locale/                 # 插件包标题/描述文案（宿主插件管理器用，zh/en）
  docs/                   # UX 规格 / 模型矩阵 / 测试计划 / 验收清单 / 工具与配置参考
  test/                   # 单测（node:test，含 Web 形态集成测试与 CLI 测试）
  scripts/                # 安装/回滚、测试实例验证、client bundle 静态检查、多形态打包（pack.mjs）
    codex/                # Codex 构建、安装与 MCP/内嵌面板验证
  dist/                   # 按平台生成的分发产物；不是源码目录，勿手工修改
    dsh/ cli/ web/ codex/ # 每个目录只包含对应平台与它需要的公共代码、资源
```

## 开发与测试

```powershell
$node = '<DSH 安装目录>\resources\runtime\primary-runtime\dependencies\node\bin\node.exe'   # 也可直接用 PATH 里的 node
& $node --test "test/*.test.mjs"     # 123 tests（models/settings/api/store/tasks/tool/routes/demo-chain/service-integration/standalone/cli/i18n/plugin-contract/relay-models/relay-e2e）
& $node scripts/build-client.mjs     # 构建 client bundle（frontend/src/ → frontend/index.js）
& $node scripts/check-client-bundle.mjs   # client bundle 静态校验 + 注册/渲染/i18n/右侧栏/对话联动/中转站设置 冒烟（24 项）
& $node platforms/web/serve.js --port 3000      # 独立后端（脱离 DSH；--help 查看参数）
```

- 契约与架构：[PLAN.md](PLAN.md)
- UX 规格（Lumina 对标）：[docs/ux-spec.md](docs/ux-spec.md)
- 模型能力与 UI 参数矩阵：[docs/models-ui-matrix.md](docs/models-ui-matrix.md)
- 测试计划与验收清单：[docs/test-plan.md](docs/test-plan.md)、[docs/feature-checklist.md](docs/feature-checklist.md)

## 打包（多形态）

```powershell
npm --prefix platforms/codex-plugin ci         # 首次构建 Codex 时安装该平台依赖
$node scripts/pack.mjs --platform all --clean   # 产出 dist/dsh、dist/cli、dist/web、dist/codex 并自动验证
$node scripts/pack.mjs --platform web           # 只打 Web 形态
$node scripts/pack.mjs --platform codex         # 只打 Codex 插件
```

每个产物 = 形态目录 + `server/` + `media/` + 裁剪后的 package.json（相对路径不变）；自动验证：dsh 包结构、CLI `models`、Web 页面+ping、Codex MCP 工具/资源与演示后端。只构建 DSH、CLI 或 Web 时不需要安装 Codex 依赖。

Codex 前端的唯一源码位置是 `platforms/codex-plugin/frontend/src/`。打包将其编译成 `dist/codex/platforms/codex-plugin/frontend/panel.html`，并在该产物根目录生成插件所需的清单、skills、安装入口和运行依赖。安装器只读取 `dist/codex/`，不会把整个源码工程装进插件。开发、验证与安装详见 [Codex 平台说明](platforms/codex-plugin/README.md)。原有三种形态的国际化能力不自动代表新 Codex 面板已经提供相同语言覆盖。

Codex 0.2.2 同步全局与逐镜环境描写、环境连续性警告和验收项，并提供默认关闭的“分镜草图作为构图参考”开关；该偏好与生图服务启用状态独立。前端由 Gemini 交付，后端接入、审查与验证由 Codex 完成。

## 已知边界

- 参考视频：仅支持公网 URL / `asset://`，不接受 base64；v1 的 `reference` 模式不接受 `inputs.video.taskId`（需 URL）。
- 样片转正片（draft-final）在页面/HTTP API 完整支持；工具侧仅第一步 draft 可用（工具未暴露 draftTaskId）。
- 宿主 HTTP 契约细节：`draft-final` 请用顶层 `draftTaskId`（PLAN 旧形状 `inputs.video.draftTaskId` 暂被校验拒绝）；`/generate` 不消费 `sourceId`（显式抽帧再创作走顶层首帧/参考图，无「改自」来源链；auto/参考视频路径走 `/recreate` 有来源链）。
- 费用估算为文档近似价目，仅作参考；真实计费以方舟账单为准。
- 独立后端与 DSH 插件默认共享存储：请勿同时对**同一会话/记录**发起写操作；需要完全隔离时用 `--storage <dir>`。
- 右侧边栏窗口依赖宿主提供 `@deepseek-ai/dsh-client-ui-sidebar-right`（DSH 产品自带）；客户端依赖包见 `package.json` 的 `dsh.client.inject`。
