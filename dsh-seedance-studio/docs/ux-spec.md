# 视频创作 · UX 规格（Lumina 视频页对标）

> 目标页：BytePlus ModelArk Lumina 视频生成页 `https://ai.byteplus.com/lumina/en/model/video?mode=video`（以下简称 Lumina 视频页）。
> 事实来源：① Lumina 页面 SSR 国际化词条（2026-11-04 抓取，证据 `_seedance-studio/qa/_lumina-*.txt`）；② 官方 SEO 描述与视频生成文档；③ 同类产品（即梦/可灵/Vidu）公开交互惯例作为补充；④ 契约 `seedance-studio/PLAN.md`（功能边界以 PLAN 为准）。
> 读者：**T3（ui-dev，主读者）**、T2（host 对齐字段）、QA（验收）。
> 结论：Lumina 视频页为「**左侧创作表单 + 右侧生成历史画廊**」的双栏模型体验页（model experience），创作区自上而下 = 模式选择 → 提示词 → 参考素材 → 参数 → 生成按钮；历史区为卡片网格 + 播放/再创作/下载操作。插件把该结构移植进 DSH 主面板，并用 DSH 主题变量重绘。

---

## 1. 设计目标与原则

1. **沉浸式创作台**：深色、渐变、玻璃拟态、大圆角、留白充足（Lumina 同款质感），但**所有颜色取自 DSH 主题变量**，亮色主题下自动成立。
2. **一屏完成**：不做多步向导。左表单右结果，生成 1 次点击。
3. **状态透明**：任务状态（排队/生成中/成功/失败/取消/超时）永远可见，进度粗粒度但可信。
4. **上下文可见**：始终显示「当前会话」；历史只属于当前会话；再创作有来源标记。
5. **失败可恢复**：错误 toast + 卡片错误态 + 重试入口；宿主未安装/接口 404 时页面降级不白屏。
6. **无障碍与中文优先**：全部 UI 中文（可带英文副标题）；键盘可完成主流程；aria-label 齐全。
7. **可测**：所有关键节点带 `data-seedance-*` / `data-testid` 钩子（见 §9），供 headless E2E 断言。

---

## 2. 信息架构

```
DSH 侧边栏（sidebar.panellist）
  └─ 「视频创作」图标条目（order 10，label 视频创作）
       └─ 主面板（main / key=seedance）—— 全屏页面
            ├─ 页头 PageHeader（标题 / 当前会话 / demo 徽标 / 刷新 / 设置）
            ├─ 左栏 CreationPanel（约 400px，可滚动）
            │    ├─ 模式 Tabs
            │    ├─ 提示词 PromptField
            │    ├─ 参考素材 MaterialPanel
            │    ├─ 参数 ParameterPanel
            │    └─ 生成按钮 GenerateBar
            └─ 右栏 HistoryPanel（flex 1）
                 ├─ 标题 + 计数 + 状态筛选
                 ├─ 队列区（进行中任务，置顶）
                 └─ 历史卡片网格（新→旧）
            └─ 覆盖层：播放器 Modal / 再创作 Modal / 设置 Modal / Toast
```

- 页面不提供路由（不改变 URL），侧边栏点击即切换主面板显示；再次点击同一条目可回到页面。
- 不引入多页面；所有弹窗为页面内 React 条件渲染。
- 会话来源：`ctx.sessions` 当前主视图绑定 sessionId（T3 已验证/降级方案见 §8.4）；切换会话时重新拉 history。

---

## 3. 页面结构与布局

### 3.1 桌面（≥1100px）线框

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  视频创作  Seedance Studio       当前会话 ···  [演示模式] [刷新] [设置]     │  ← 页头 56px
├───────────────────────────┬─────────────────────────────────────────────────┤
│ 模式: 文生 | 图生 | 首尾帧 | │  历史与队列  12 个   [全部][进行中][已完成][失败]│
│       参考 | 编辑·延长 | 样片│                                                 │
│                           │  ┌────────┐ ┌────────┐ ┌────────┐              │
│ ┌───────────────────────┐ │  │ 视频卡 │ │ 视频卡 │ │ 视频卡 │              │
│ │ 提示词 textarea        │ │  │ 状态   │ │ 状态   │ │ 状态   │              │
│ │ [镜头语言…]  123/500   │ │  │ 进度条 │ │ 进度条 │ │ 进度条 │              │
│ └───────────────────────┘ │  └────────┘ └────────┘ └────────┘              │
│ ┌───────────────────────┐ │                                                 │
│ │ 参考素材（虚线框）      │ │  ┌────────┐ ┌────────┐                        │
│ │ [+] 添加图片/视频/音频  │ │  │ 视频卡 │ │ 视频卡 │                        │
│ └───────────────────────┘ │  └────────┘ └────────┘                        │
│ ┌───────────────────────┐ │                                                 │
│ │ 模型 [2.5 ▾]           │ │   （空态：无历史插画 + 文案）                  │
│ │ 分辨率 [480|720|1080]  │ │                                                 │
│ │ 比例  [▭ 16:9 ▾]       │ │                                                 │
│ │ 时长  [——●——] 5s [智能]│ │                                                 │
│ │ 生成音频 [开] 水印 [关]│ │                                                 │
│ │ 高级 ▾ seed/尾帧/格式  │ │                                                 │
│ │ 预计 ≈¥7.56（参考）    │ │                                                 │
│ └───────────────────────┘ │                                                 │
│ [        生成视频        ] │                                                 │
└───────────────────────────┴─────────────────────────────────────────────────┘
```

- 左栏宽度 `min(420px, 38vw)`，内部 `overflow-y:auto`；右栏 `flex:1; overflow-y:auto`。
- 页头固定不滚动；两栏各自滚动（符合 Lumina 表单/结果独立滚动的体验）。
- 页面容器最大宽度不限（面板全宽），左右内边距 24px，栏间距 24px。

### 3.2 中等宽度（760–1100px）

左右仍双栏，但左栏 360px，历史卡 2 列；参数行可换行。

### 3.3 窄屏（<760px）

单列：页头 → 创作表单（默认展开）→ 历史卡片（1–2 列），生成按钮 **吸底**（`position:sticky; bottom:0`，带毛玻璃背景）。历史卡片操作收进「⋯」菜单。

### 3.4 滚动与层级

- z-index：页面 0 / 吸底条 10 / Toast 100 / Modal 200（遮罩 + 内容）。
- 所有弹窗：点击遮罩关闭（有未提交内容时二次确认「放弃编辑？」）。

---

## 4. 组件清单与规格

### 4.1 页头 PageHeader

| 元素 | 规格 | 数据/交互 |
|---|---|---|
| 标题 | 「视频创作」20px/600 + 英文副标题 `Seedance Studio` 12px tertiary | 无 |
| 当前会话 | 胶囊：图标 + `会话 ····a1b2`（sessionId 后 4 位）；hover 显示完整 id；无会话显示「未绑定会话」（warn 色） | 点击无操作（或刷新历史） |
| demo 徽标 | 「演示模式」小胶囊（warn 色/描边）；tooltip「未配置 API Key，将使用内置示例视频模拟生成」 | config.demo 为 true 时显示 |
| 刷新 | 图标按钮，aria-label「刷新历史」；点击重新拉 config+history，loading 旋转 600ms | 每 2.5s 自动轮询（页面可见时） |
| 设置 | 图标按钮，aria-label「打开设置」 | 打开 SettingsModal |
| 错误提示区 | config 拉取失败时页头下方细条：「未连接到 Seedance 宿主（插件可能未安装或未启用）」+「重试」 | 不阻塞页面骨架 |

### 4.2 模式 Tabs ModeTabs

- 视觉：等宽分段控件（segmented），选中项底色 `--dsw-alias-interactive-bg-active` + 主色文字/下划线；6 个 Tab 两行排列（3×2）或横向滚动。
- 文案：文生视频 / 图生视频 / 首尾帧 / 全模态参考 / 视频编辑·延长 / 样片。
- 行为：切换立即生效（不提交）；切换时按 §4.3 规则清理不兼容素材（图片保留为通用图片，仅角色重映射）；不可用 Tab 禁用 + tooltip。
- `data-seedance-mode="text2video"` 等 6 个钩子。
- **样片模式特殊**：进入后显示「样片说明」条：① 先以 480p 生成预览（约省 70% 成本）；② 满意后一键转正片（1080p）。生成第一版后卡片出现「转正片」按钮。

### 4.3 提示词 PromptField

| 项 | 规格 |
|---|---|
| 控件 | `<textarea rows=5>`，自动增高到 8 行，圆角 12，内边距 12，focus 用 `--dsw-focus-ring-color` |
| placeholder | 文生：「描述你想生成的画面，例如：镜头缓缓推进，雨后霓虹街道，电影感浅景深…」；图生/首尾帧：「描述画面如何运动、镜头与氛围…」；参考：「参考 @image1 的角色，参考 @video1 的运镜…」；编辑：「描述要对视频做的修改，例如：把背景换成雪天…」；延长：「描述要延伸的画面与结尾…」 |
| 计数 | 右下角 `N / 500`（N>500 变 warn 色，软提示不截断）；上空 4 行未超限 |
| 建议 | 下方可折叠「提示词公式」小字：`镜头语言 + 光影 + 主体 + 动作 + 场景 + 氛围 + 风格`（Lumina 同款公式文案） |
| 快捷键 | `Ctrl/Cmd+Enter` 触发生成 |
| 校验 | 空 → 生成按钮禁用 + 输入框下方红字「请输入提示词」（blur 后显示） |
| @ 引用 | v1 仅做提示文案；若实现，输入 `@` 弹出已上传素材列表插入 token（不阻塞主流程） |
| 钩子 | `data-seedance-prompt` |

### 4.4 参考素材 MaterialPanel

按模式渲染不同子区（同一容器内切换）：

**A. 图片（图生/首尾帧/参考/样片）**

- 上传卡：`96×96`，虚线边框 1.5px `--dsw-alias-border-l2`，圆角 8；hover 主色边框；点击/拖拽上传；右下角小 `+`。
- 已上传：缩略图 object-fit:cover；左上角角色徽标（首帧/尾帧/参考图 N）；右上角删除 ×（hover 出现）；点击卡片打开大图预览（Modal 内可「设为首帧」「设为尾帧」「设为参考图」「删除」）。
- 首尾帧模式：固定两个槽位卡片——「首帧」「尾帧」，中间箭头图标；点击各自上传；尾帧可空（留空则退化为图生视频，UI 提示）。
- 参考模式：网格 + 计数「图片 3/30」；上限按钮禁用 tooltip「已达上限（30 张）」。
- 上传限制提示：一行小字「支持 JPG/PNG/WebP，单张 ≤30MB；含真人脸素材可能被拒绝」。
- 读入方式：`FileReader.readAsDataURL`，前端只做 MIME/大小校验；超过 2MB 的 dataURL 在提交时提示「大图建议用 URL」（PLAN：工具侧 ≤2MB）。

**B. 视频（参考/编辑/延长）**

- 单行输入：`类型=url`，placeholder「粘贴视频公网 URL（mp4/mov，4–30s）」；右侧「粘贴」按钮。
- 不支持本地上传：若用户拖入视频文件 → toast「视频不支持本地上传，请提供公网 URL」。
- 已填 URL：显示芯片行（文件名/域名 + 删除），并在编辑/延长模式下显示视频预览 `<video muted preload=metadata>`。
- 校验：URL 必须是 http(s):// 或 asset://；编辑模式非 4–30s 的时长无法在前端检测 → 只做文案提示。

**C. 音频（参考）**

- 上传（wav/mp3，≤15MB）或 URL 输入；展示文件名与「audio」徽标；多段按模型上限计数。

**空态**：整块为虚线大卡（高 120px）：「添加参考素材 / 支持图片、视频链接、音频；也可不添加直接生成」+ 图标；点击或拖拽触发上传（按当前模式默认类型）。

- 钩子：`data-seedance-material`、每张图 `data-seedance-image`、视频输入 `data-seedance-video-url`。

### 4.5 参数面板 ParameterPanel

| 控件 | 形式 | 说明 |
|---|---|---|
| 模型 | 下拉（含副文案两行） | §4.1 of models-ui-matrix；选择后触发联动重算 |
| 分辨率 | 分段按钮（segmented） | 值来自模型；当前分辨率不可用时自动降级到 720p |
| 比例 | 下拉 + 左侧比例示意图标（16:9 ▭ / 9:16 ▯ / 1:1 □ / adaptive ✦） | 锁 adaptive 时显示小锁图标 + tooltip「该任务类型仅支持自适应比例」 |
| 时长 | 滑块（4–30/4–15）+ 数值显示 + 「智能」开关 | 智能开 → 滑块禁用、值显示「智能」，提交 duration:-1；1.0 无智能 |
| 生成音频 | Switch | 默认开；模型不支持时隐藏 |
| 水印 | Switch | 默认关，副文案「右下角显示 AI 生成标识」 |
| 高级（折叠） | `<details>` 风格 | seed（数字输入 + 🎲 随机= -1）、返回尾帧 Switch（默认开？PLAN 默认 false；建议默认 **开** 便于再创作，但契约默认 false——**按契约默认 false**，tooltip 说明开启后可再创作抽帧）、输出格式 mp4/mov（仅 2.5） |
| 预计消耗 | 一行小字 | 「预计 ≈ ¥7.56 · 约 40–90 秒（按 5s/16:9 估算，实际以账单为准）」；demo 显示「演示模式 · 不产生费用」 |
| 校验提示区 | 行内小字/警告条 | 4k 警告、参考音频搭配提示、素材上限提示、编辑模式时长提示 |

- 参数区整体卡片化（`bg-layer-1` + `border-l1` + 圆角 12 + 内边距 16）。
- 钩子：`data-seedance-model`、`data-seedance-resolution`、`data-seedance-ratio`、`data-seedance-duration`、`data-seedance-generate-audio`、`data-seedance-watermark`、`data-seedance-seed`。

### 4.6 生成按钮 GenerateBar

- 主按钮：全宽、高 44px、圆角 12、背景 `--dsw-alias-button-primary-fill`、文字 `--dsw-alias-label-primary-foreground`；hover `--dsw-alias-button-primary-hover`。
- 文案：「生成视频」（loading：「创建任务中…」）；生成成功 toast「任务已创建，排队/生成中」。
- 禁用原因内联展示（按钮上方/下方 12px 字）：无提示词 / 缺少首帧 / 无会话 / 已达到素材上限…。
- 次级按钮（demo 专用）：无。
- 冷却：提交后按钮进入 loading 至 POST 返回（通常 <1s），防止重复提交。
- 钩子：`data-seedance-generate`。

### 4.7 历史与队列 HistoryPanel

- 标题行：「历史与队列」16px/600 + 计数徽标 `12`；右侧状态筛选分段 chips：全部 / 进行中 / 已完成 / 失败（默认全部）；可选「清空失败记录」不做（危险操作）。
- **队列区（进行中）**：单独一行/一片，置顶；卡片带 indeterminate 进度条 + 「排队中/生成中 · N%」；操作仅「取消」（queued 可取消，running 显示 disabled + tooltip「生成中不可取消」）。
- **历史网格**：`grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))`；gap 16；新记录插入动画（淡入 + 轻微上移，`prefers-reduced-motion` 时禁用）。
- 列表来源：`GET /api/seedance/history?sessionId=`（新→旧）。轮询 2.5s（`document.visibilityState==='visible'` 时；隐藏时暂停，恢复时立即刷新一次，避免后台请求）。生成提交成功后立即本地乐观插入一条 queued 记录，然后靠轮询刷新真实进度。
- 排序：进行中在前（按创建时间升序），终态按 createdAt 降序。超过 60 条只渲染前 60 + 「加载更多」（v1 可不做分页，直接全渲染但要虚拟化的备注）。
- 空态：居中插画（内联 SVG 胶片/星星）+ 主文案「还没有生成记录」+ 副文案「在左侧填写提示词，点击「生成视频」开始创作」+（demo 模式）「当前为演示模式，将使用内置示例视频」。
- config/history 请求失败：整块错误态「历史加载失败」+ 重试按钮；不清空已有记录。
- 钩子：`data-seedance-history`、`data-seedance-history-count`、卡片 `data-seedance-card` + `data-status="queued|running|succeeded|failed|cancelled|expired"`。

### 4.8 历史卡片 HistoryCard

```
┌──────────────────────────────┐
│ [封面 16:9 / 渐变占位]  [状态]│
│  ┌ 进度条（进行中/失败隐藏）┐ │
│  │███████░░░░ 62%           │ │
│  └──────────────────────────┘ │
│ 提示词第一行…第二行截断       │
│ [Seedance2.5] [720p] [智能时长]│
│ 2 分钟前 · 改自 #a1b2c3       │
│ [▶ 播放] [↻ 再创作] [⋯]        │
└──────────────────────────────┘
```

| 元素 | 规格 |
|---|---|
| 封面 | `aspect-ratio:16/9`；图片 `object-fit:cover`；无封面时用品牌渐变 + 内联 SVG 图标；hover 显示居中播放按钮遮罩 |
| 状态徽标 | 右上角小胶囊：排队中（灰）/生成中（品牌蓝，带脉冲点）/已完成（绿）/生成失败（红）/已取消（黄）/已超时（黄）；`data-status` |
| 进度 | running：细进度条（3px）+ 百分比文字；queued：indeterminate 动画条 + 「排队中」 |
| 提示词 | 2 行截断（`-webkit-line-clamp:2`），title 完整；demo 记录前加「[演示]」前缀（可选） |
| 参数 chips | 短模型名（2.5/2.0/2.0 Fast/…）、分辨率、时长（-1→「智能时长」）、「有声」（generateAudio 时）；最多 3 个 + 溢出 +N |
| 时间 / 来源 | 相对时间 + originId 时「改自 #xxxxxx」；originId 可点击 → 定位到来源卡片（滚动 + 高亮 1.5s） |
| 操作 | 主操作「播放」（succeeded 有效）；「再创作」（succeeded/failed 均可用，failed 用 prompt+params）；「⋯」菜单：下载、复制提示词、删除（二次确认）；queued 卡片显示「取消」 |
| 失败卡 | 红色左边框 + 错误一行 `error.message` 截断 + 「重试」（用原参数再提交 /generate） |
| 删除 | 二次确认 Modal：「删除这条记录？媒体文件将一并删除且不可恢复。」确认后 POST /delete，乐观移除 |
| 下载 | `<a href="/api/seedance/media?id=..&kind=video" download>`；succeeded 且 files.video 存在时显示 |
| 钩子 | 卡片内：`data-seedance-play`、`data-seedance-recreate`、`data-seedance-cancel`、`data-seedance-delete` |

### 4.9 播放器 Modal PlayerModal

- 布局：遮罩（`--dsw-alias-bg-mask-1` + blur 4px）+ 居中卡片（max-w 960px，黑底视频区，圆角 16）。
- 视频：`<video controls autoplay playsinline src="/api/seedance/media?id=<id>&kind=video">`；宿主未落盘时降级 remoteVideoUrl（如存在）并显示「远端链接可能 24h 后过期」小字。
- 头部：prompt（1 行截断）+ 状态/模型/参数 chips + 关闭 ×。
- 底部操作：下载 / 再创作 / 删除。
- 键盘：Esc 关闭；Space 播放暂停（焦点不在输入时）。
- 加载中：骨架 + 转圈；加载失败：错误态「视频加载失败（可能已被删除或宿主未启动）」+ 重试。
- 钩子：`data-seedance-player`。

### 4.10 再创作 Modal RecreateModal（PLAN §7 核心）

**打开方式**：历史卡片「再创作」/ 播放器内「再创作」。

**字段**：
1. 来源预览：左/上显示来源视频播放器（小窗）+ 来源记录 id/prompt。
2. 参考方式（radio 卡片）：
   - 「**首帧**」：从来源视频抽一帧作为新视频首帧（默认：当前帧；可选 首帧/尾帧/当前帧）。
   - 「**参考图**」：抽帧作为 reference_image（可多张，按模型上限）。
   - 「**参考视频**」：仅当远端 URL 未过期且模型支持参考视频时可选；tooltip「使用来源视频作为参考视频（URL 24h 有效）」。
   - 「**仅继承参数**」：不用素材，只带 prompt/params。
3. 抽帧预览：canvas 200×112 缩略图；帧选择器 3 个按钮（首帧 / 尾帧 / 当前帧）+ 时间轴（`<input type=range>` 同步 `video.currentTime`）；默认尾帧（再创作延续语义），若来源无尾帧 URL 则用 canvas 从当前视频抽「尾帧」。
4. prompt：预填来源 prompt，可编辑（textarea 4 行）。
5. 参数：预填来源 model/params（分辨率/比例/时长/音频/水印），可改（复用 §4.5 控件但简化）。
6. 底部：「取消」+「创建再创作」主按钮。
7. 提交：`POST /api/seedance/recreate {sessionId, sourceId, prompt?, model?, params?, inputs?}`；成功后关闭弹窗、新卡片淡入并高亮、toast「已创建再创作任务」。
8. 失败：弹窗内错误条 + 可重试；401/404 等给出中文解释。
9. 勾选「记住本次选择」不做（v1）。
- 钩子：`data-seedance-recreate-modal`、`data-seedance-frame-btn="first|last|current"`、`data-seedance-recreate-submit`。

**抽帧实现要点**（浏览器）：
- 来源视频 URL：`/api/seedance/media?id=<sourceId>&kind=video`（同源，无需 CORS）。
- `video.addEventListener('loadedmetadata')` 后 `video.currentTime = target`；`seeked` 事件里 `canvas.getContext('2d').drawImage(video, …)`；`canvas.toDataURL('image/jpeg', 0.9)`。
- 尾帧 = `duration - 0.05`；首帧 = 0；当前帧 = 播放器 currentTime。
- 输出 dataURL 超过 ~2MB 时用 canvas 缩放（长边 ≤ 2048）后重试。

### 4.11 设置 Modal SettingsModal

| 项 | 控件/文案 |
|---|---|
| 标题 | 「Seedance 设置」 |
| 说明 | 「API Key 只保存在本机 $DSH_HOME/storages/seedance-studio/settings.json，不会下发到页面。」 |
| Provider | 下拉：自动（auto）/ 火山方舟（ark）/ 中转（relay）/ 演示（demo） |
| Ark Base URL | 输入，placeholder `https://ark.cn-beijing.volces.com` |
| Ark API Key | password 输入；未设置时 placeholder「输入 API Key（ark-…）」；已设置时显示打码值 `ark-****abcd`，留空=不修改 |
| Relay Base URL / Key / Protocol / Style | 折叠「中转设置」内 |
| 默认模型 | 下拉（同 §4.1） |
| 按钮 | 「保存」（POST /settings，成功后 toast 并刷新 config）/「取消」 |
| 保存后 | 若 demo 徽标变化（有 key → 真实模式）刷新页头徽标 |
| 安全 | 输入框 `autocomplete="off"`；不 console.log key；请求体不含打码回填 |
| 钩子 | `data-seedance-settings`、`data-seedance-settings-save`、`data-seedance-api-key` |

### 4.12 Toast / 错误

- 右上角堆叠（最多 3 条，5s 自动消失，可手动关）；类型：success/warn/error/info；宽度 ≤360px；深色半透明底 + 图标。
- 文案示例：成功「已创建生成任务」/「设置已保存」/「已删除记录」；失败「生成失败：{message}」/「历史加载失败」；警告「视频 URL 已过期，已使用本地副本」。
- 错误统一取响应 `{ok:false,error:{code,message}}` 的 message；无 message 时按错误码映射（models-ui-matrix §6.2）。
- 钩子：`data-seedance-toast`。

### 4.13 骨架屏 / 加载

- 首屏：页头骨架（2 行灰条）+ 左栏 3 个卡片骨架 + 右栏 6 个卡骨架，shimmer 动画（用 `--dsw-alias-label-shimmer` 或纯 CSS 渐变），≤600ms 后内容替换。
- 单条记录加载中不阻塞页面（轮询静默更新）。

---

## 5. 交互流程（端到端）

### 5.1 文生视频（P0）

1. 侧边栏点「视频创作」→ 主面板打开（默认模式=文生视频，模型=2.5）。
2. 输入提示词 → 参数默认（720p / adaptive / 2.5 智能时长 -1；2.0 系列以 `/config.defaults` 为准（宿主默认 5s）/ 有声开 / 水印关）。
3. 点「生成视频」→ POST /generate（sessionId + prompt + model + mode=text2video + params）。
4. 响应 record（queued）→ 本地插入队列卡；toast「已创建生成任务」。
5. 轮询 history：2.5s 后 running 30% → … → succeeded；卡片封面/进度/状态实时变。
6. 成功：卡片显示封面 + 播放；点击播放 → PlayerModal。
7. Demo 模式：2s running 30%，6s running 70%，8s succeeded（PLAN §8）；页面显示演示徽标。

### 5.2 图生视频 / 首尾帧

1. 切「图生视频」→ 素材区出现 1 个首帧上传槽。
2. 上传图片 → 缩略图；提示词描述运动。
3. 生成 → mode=image2video，inputs.images=[{role:'first_frame', dataUrl}]。
4. 首尾帧：两个槽位；只填尾帧时禁止（必须首帧先有）；生成 mode=firstlast、ratio 锁 adaptive。
5. 若选中 1.0 pro fast → 首尾帧 Tab 禁用。

### 5.3 全模态参考

1. 切「全模态参考」→ 素材区变为 图片/视频/音频 三个分组 + 计数（按模型上限）。
2. 上传参考图、粘贴参考视频 URL、上传音频；提示词用 `@image1` 风格描述。
3. 生成 mode=reference；2.0 系列若只有音频 → 按钮禁用并提示。
4. 与首/尾帧素材互斥：切到该模式时提示「参考模式不支持首尾帧，已移除首尾帧设置」（确认对话框可选，v1 直接清空并 toast）。

### 5.4 视频编辑 / 延长

1. 切「视频编辑·延长」→ 子切换：编辑 | 延长（segmented 小控件）。
2. 粘贴视频 URL；提示词描述编辑动作/延长内容。
3. 编辑：ratio 锁 adaptive，时长锁智能（-1），提交 omni_reference_task_type=edit / mode=edit。
4. 延长：提交 mode=extend；提示「请确保提示词说明延长后的画面」。
5. 提示参考视频须 4–30s（2.5）、2–30s（2.0）。

### 5.5 样片（draft）两步

1. 切「样片」→ 说明条 + 分辨率固定 480p。
2. 生成 → mode=draft、draft:true；成功后卡片带「样片」徽标 + 「转正片」按钮。
3. 点「转正片」→ 打开确认弹窗（分辨率 1080p、可选 mov/水印）→ POST /generate（mode=draft-final，draftTaskId=来源任务 id）。
4. 转正片生成中，样片卡片显示「已转正片」关联；正片成功后显示「改自样片 #xxxx」。
5. 样片过期（任务 id 过期/不存在）→ 按钮禁用 + tooltip「样片已过期，请重新生成样片」。

### 5.6 再创作（P0，PLAN §7）

1. 历史卡片点「再创作」→ RecreateModal，带入来源 prompt/params，默认选「尾帧 → 首帧」。
2. 用户可切换 首帧/参考图/参考视频/仅继承参数；可改 prompt/参数。
3. 提交 → POST /recreate；新卡片带「改自 #来源」；来源卡片可点击高亮。
4. 工具侧 recreate（模型自主调用）同样写入 originId（PLAN §7.4），页面能显示来源链。

### 5.7 取消 / 删除 / 重试

- 取消：仅 queued 显示；点击 → POST /cancel → 卡片变已取消；running 不显示取消（tooltip 说明）。
- 删除：⋯→删除 → 二次确认 → POST /delete → 移除卡片；进行中记录删除时先取消（host 语义，UI 提示）。
- 重试：失败卡片「重试」→ 复用原 prompt/model/params 再 POST /generate（记录新的 originId=原记录？v1 不设 originId，单纯重试）。

### 5.8 会话切换

- ctx.sessions 变化 → 重新拉当前 sessionId → 清空本地历史缓存 → loading → 新历史。
- 无会话：页头「未绑定会话」+ 历史空态「开始一个对话后即可生成」；表单可填但生成禁用。

---

## 6. 状态机

### 6.1 页面级状态

| 状态 | 触发 | UI |
|---|---|---|
| booting | 首次挂载 | 骨架屏 |
| ready | config+history 成功 | 正常 |
| config-failed | /config 失败（404/网络） | 页头错误条 + 用兜底模型渲染 + 生成按钮禁用（无法确认宿主） |
| no-session | sessionId 为空 | 页头 warn + 生成禁用 |
| demo | config.demo | 页头演示徽标 + 参数区提示；生成流程正常 |
| polling | 页面可见且有进行中任务 | 2.5s 轮询（有任务时）/ 5s 空闲轮询；隐藏暂停 |
| offline | fetch 连续失败 3 次 | 页头「连接断开」+ 自动重试（指数退避 2/4/8s，上限 30s） |

### 6.2 记录级状态（与 PLAN §4 status 一致）

`queued → running → succeeded | failed | cancelled | expired`（终态不再变）。UI 映射见 models-ui-matrix §6.1。

### 6.3 表单校验状态

- 实时校验（输入后 300ms 防抖）：prompt 非空、素材满足模式要求、参数在模型范围内。
- 提交前再校验一次；错误显示在字段下方 + 生成按钮禁用原因。

---

## 7. 文案表（中文，可直接粘贴）

### 7.1 页头 / 通用

| key | 文案 |
|---|---|
| title | 视频创作 |
| subtitle | Seedance Studio |
| session | 当前会话 |
| noSession | 未绑定会话 |
| demoBadge | 演示模式 |
| demoHint | 未配置 API Key，将使用内置示例视频模拟生成 |
| refresh | 刷新 |
| settings | 设置 |
| hostError | 未连接到 Seedance 宿主（插件可能未安装或未启用） |
| retry | 重试 |
| loading | 加载中… |

### 7.2 表单

| key | 文案 |
|---|---|
| mode.text2video | 文生视频 |
| mode.image2video | 图生视频 |
| mode.firstlast | 首尾帧 |
| mode.reference | 全模态参考 |
| mode.edit | 视频编辑·延长 |
| mode.draft | 样片 |
| promptLabel | 提示词 |
| promptPlaceholder | 描述你想生成的画面… |
| promptHint | 提示词公式：镜头语言 + 光影 + 主体 + 动作 + 场景 + 氛围 + 风格 |
| promptRequired | 请输入提示词 |
| materialTitle | 参考素材 |
| materialEmpty | 添加参考素材 |
| materialHint | 支持图片、视频链接、音频；也可不添加直接生成 |
| uploadImage | 上传图片 |
| addFirstFrame | 添加首帧 |
| addLastFrame | 添加尾帧 |
| addReference | 添加参考图 |
| videoUrl | 视频公网 URL |
| videoUrlPlaceholder | 粘贴 mp4/mov 公网链接（4–30 秒） |
| videoNotLocal | 视频不支持本地上传，请提供公网 URL |
| audioUpload | 上传音频 |
| paramTitle | 参数 |
| model | 模型 |
| resolution | 分辨率 |
| ratio | 比例 |
| ratioAdaptive | 自适应 |
| duration | 时长 |
| durationSmart | 智能 |
| durationSmartHint | 由模型自动决定（4–30 秒） |
| generateAudio | 生成音频 |
| watermark | 水印 |
| advanced | 高级设置 |
| seed | 随机种子 |
| seedRandom | 随机 |
| returnLastFrame | 返回尾帧 |
| outputFormat | 输出格式 |
| estimate | 预计 ≈ ¥{cost} · 约 {time} 秒（按 5s/16:9 估算，实际以账单为准） |
| estimateDemo | 演示模式 · 不产生费用 |
| generate | 生成视频 |
| generating | 创建任务中… |
| noSessionHint | 开始一个对话后即可生成 |

### 7.3 历史

| key | 文案 |
|---|---|
| historyTitle | 历史与队列 |
| historyCount | {n} 个 |
| filterAll | 全部 |
| filterActive | 进行中 |
| filterDone | 已完成 |
| filterFailed | 失败 |
| emptyTitle | 还没有生成记录 |
| emptyHint | 在左侧填写提示词，点击「生成视频」开始创作 |
| emptyDemoHint | 当前为演示模式，将使用内置示例视频 |
| statusQueued | 排队中 |
| statusRunning | 生成中 |
| statusSucceeded | 已完成 |
| statusFailed | 生成失败 |
| statusCancelled | 已取消 |
| statusExpired | 已超时 |
| originFrom | 改自 #{id} |
| draftBadge | 样片 |
| actionPlay | 播放 |
| actionRecreate | 再创作 |
| actionDownload | 下载 |
| actionDelete | 删除 |
| actionCancel | 取消 |
| actionRetry | 重试 |
| deleteConfirmTitle | 删除这条记录？ |
| deleteConfirmBody | 媒体文件将一并删除且不可恢复。 |
| cancelConfirmTitle | 取消生成任务？ |
| cancelConfirmBody | 仅排队中的任务可以取消。 |
| historyFailed | 历史加载失败 |
| urlExpired | 原始视频链接已过期，已使用本地副本 |

### 7.4 再创作

| key | 文案 |
|---|---|
| recreateTitle | 再创作 |
| recreateSource | 来源视频 |
| recreateWay | 参考方式 |
| wayFirstFrame | 首帧 |
| wayReferenceImage | 参考图 |
| wayReferenceVideo | 参考视频 |
| wayInheritOnly | 仅继承参数 |
| framePick | 选择帧 |
| frameFirst | 首帧 |
| frameLast | 尾帧 |
| frameCurrent | 当前帧 |
| recreatePrompt | 提示词 |
| recreateSubmit | 创建再创作 |
| recreateSuccess | 已创建再创作任务 |

### 7.5 设置

| key | 文案 |
|---|---|
| settingsTitle | Seedance 设置 |
| settingsHint | API Key 只保存在本机，不会下发到页面。 |
| provider | 服务提供方 |
| providerAuto | 自动 |
| providerArk | 火山方舟 |
| providerRelay | 中转服务 |
| providerDemo | 演示模式 |
| arkBaseUrl | Ark Base URL |
| arkApiKey | Ark API Key |
| relaySection | 中转设置 |
| defaultModel | 默认模型 |
| save | 保存 |
| cancel | 取消 |
| saved | 设置已保存 |
| saveFailed | 设置保存失败 |

### 7.6 错误 / toast

| key | 文案 |
|---|---|
| createFailed | 创建任务失败：{message} |
| generateSuccess | 已创建生成任务 |
| deleteSuccess | 已删除记录 |
| cancelSuccess | 已取消任务 |
| cancelFailed | 取消失败：{message} |
| deleteFailed | 删除失败：{message} |
| networkError | 网络错误，请稍后重试 |
| videoLoadFailed | 视频加载失败（可能已被删除或宿主未启动） |

---

## 8. 视觉 tokens 与样式规范

### 8.1 颜色（全部用 DSH 变量，禁止写死颜色）

| 用途 | token |
|---|---|
| 页面背景 | `--dsw-alias-bg-base` |
| 卡片背景 | `--dsw-alias-bg-layer-1`（次级 `--dsw-alias-bg-layer-2`，浮层 `--dsw-alias-bg-layer-3`） |
| 边框 | `--dsw-alias-border-l1`（卡片）、`--dsw-alias-border-l2`（输入/虚线） |
| 主文字 | `--dsw-alias-label-primary` |
| 次文字 | `--dsw-alias-label-secondary` |
| 弱文字/说明 | `--dsw-alias-label-tertiary`、`--dsw-alias-label-caption` |
| 品牌/主按钮 | `--dsw-alias-brand-primary`、`--dsw-alias-button-primary-fill`、`--dsw-alias-button-primary-hover`、`--dsw-alias-label-primary-foreground` |
| hover/选中 | `--dsw-alias-interactive-bg-hover` / `--dsw-alias-interactive-bg-active` |
| 成功/警告/错误/信息 | `--dsw-alias-state-success-primary` / `--dsw-alias-state-warn-primary` / `--dsw-alias-state-error-primary` / `--dsw-alias-state-business-primary` |
| 危险操作 | `--dsw-alias-interactive-bg-hover-danger` + `--dsw-alias-label-error` |
| 遮罩 | `--dsw-alias-bg-mask-1` |
| 焦点环 | `--dsw-focus-ring-color` + `--dsw-focus-ring-width` |
| 阴影 | `--dsw-elevation-soft` / `--dsw-elevation-panel` / `--dsw-elevation-prominent` |
| 圆角 | `--dsw-radius-sm` / `--dsw-radius-md` / `--dsw-radius-lg` / `--dsw-radius-panel` |
| 字体 | `--dsw-font-family`；字号/行高用固定 px 与 1.5 行高 |

**沉浸式质感做法**（不写死颜色）：
- 页面顶部加一条 `linear-gradient(120deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent), transparent 60%)` 氛围光；亮色主题下同样可用（低透明度）。
- 元素浮起用 `box-shadow: var(--dsw-elevation-soft)`；玻璃拟态用 `background: var(--dsw-alias-bg-layer-2); backdrop-filter: blur(12px);`（菜单/吸底条/弹窗头部）。
- 禁止使用 `#0d0d12` 等硬编码深色：亮色主题会崩。
- **兜底**：`var(--dsw-radius-md, 8px)` 等提供 fallback，宿主早年版本缺变量时不至于无圆角。

### 8.2 间距 / 尺寸

- 间距刻度：4 / 8 / 12 / 16 / 24 / 32（只用这些）。
- 左栏卡片内边距 16；卡片间距 16；页面内边距 24；页头高 56。
- 输入高 36；分段按钮高 32；主按钮高 44；图标 16（小）/ 18（中）/ 20（大）。
- 卡片圆角 12；弹窗 16；缩略图 8；胶囊 999。

### 8.3 字体层级

| 层级 | 规格 |
|---|---|
| 页面标题 | 20px / 600 |
| 区块标题 | 16px / 600 |
| 正文/输入 | 13px / 400 |
| 辅助/标签 | 12px / 400，label-secondary |
| 数字/徽标 | 11–12px / 500 |

### 8.4 图标

- 全部内联 SVG（stroke=currentColor，viewBox 0 0 16 16 或 24 24，stroke-width 1.5），不引入图标库。
- 需要：胶片（侧边栏）、加号、上传、播放、暂停、下载、删除、取消（×）、刷新、设置（齿轮）、智能（闪电）、首帧（▮|）、尾帧（|▮）、参考图、视频、音频、箭头、更多（⋯）、锁、警告、成功对勾。
- 侧边栏图标尺寸 16，与 DSH 其他 panel 图标观感一致。

### 8.5 动效

- 卡片入场：opacity 0→1 + translateY(4px→0)，180ms ease-out；`@media (prefers-reduced-motion: reduce)` 时全部关闭。
- 进度条：width transition 300ms；indeterminate 用 CSS keyframes 1.6s。
- Loading 旋转 1s linear infinite。
- 不要用大幅位移/弹跳；保持「专业工具」感。

---

## 9. 可测试性钩子（T3 已实现；headless E2E / 回归契约）

> 2026-11-04 与 ui-dev 实现对齐后的**最终方案**：容器/列表类用 `data-seedance-*` 属性，通用按钮用 `data-seedance-action="<hook>"`，弹窗用 `data-seedance-modal`（Modal 内部也会写 `data-seedance-<hook>`），表单控件用 `data-seedance-control="<name>"` / `data-seedance-input="<name>"`，并大量提供 `data-testid="sd-*"`。`_seedance-studio/qa/check-client-bundle.mjs --strict` 校验下列 23 个容器钩子；E2E 使用 `.dsh-sd-*`/testid 补充定位。

| 钩子 | 位置 | 断言用途 |
|---|---|---|
| `data-seedance-panel` | 页面根容器 | 页面已渲染 |
| `data-seedance-demo-badge` | 页头 demo 徽标 | 演示模式断言 |
| `data-seedance-session-select` | 页头会话选择器 | 会话切换 |
| `data-seedance-mode` | 模式 Tab（`data-testid="sd-mode-tab"`，`data-mode`） | 切换模式 |
| `data-seedance-prompt` | 提示词 textarea（`sd-prompt`） | 输入 |
| `data-seedance-material` | 素材区容器 | 上传/视频/音频 |
| `data-seedance-upload` | 上传按钮 | 选图 |
| `data-seedance-input="video-url"` | 视频 URL 输入 | 编辑/参考模式 |
| `data-seedance-control="model"` / `"ratio"` / `"duration"` 等 | 参数控件 | 参数断言 |
| `data-seedance-toggle` | 开关行 | 有声/水印/尾帧 |
| `data-seedance-advanced` | 高级参数折叠 | 展开断言 |
| `data-seedance-cost` | 费用估算 | 费用断言 |
| `data-seedance-generate` | 生成按钮（`sd-generate`） | 点击生成 |
| `data-seedance-history` / `data-seedance-history-count` | 历史容器/计数 | 列表存在 |
| `data-seedance-queue` | 进行中队列 | 状态汇总 |
| `data-seedance-empty` | 空状态 | 空态断言 |
| `data-seedance-card` + `data-status` + `data-record-id` | 历史卡片 | 状态流转/精确定位 |
| `data-seedance-action="card-play" / "card-recreate" / "card-download" / "card-cancel" / "card-delete"` | 卡片操作按钮 | 操作断言（Play/Recreate 等） |
| `data-seedance-modal` | 通用弹窗容器（`data-testid="sd-*"`） | 弹窗存在 |
| `data-seedance-player-modal` / `data-seedance-player-video` | 播放器弹窗/视频元素 | 播放断言 |
| `data-seedance-action="use-frame"` | 播放器「用此帧再创作」 | 抽帧链路 |
| `data-seedance-recreate-modal` | 再创作弹窗 | 再创作链路 |
| `data-seedance-recreate-way` | 再创作方式选择 | 首帧/参考图/参考视频 |
| `data-testid="sd-recreate-capture-first/current/last"` | 抽帧按钮 | canvas 抽帧 |
| `data-seedance-action="recreate-submit"` | 再创作提交 | 提交 |
| `data-seedance-action="settings"` / `data-seedance-settings-modal` | 设置入口/弹窗 | 设置断言 |
| `data-seedance-action="settings-save"` | 设置保存 | 保存断言 |
| `data-testid="sd-settings-ark-key"`（`type="password"`） | Key 输入 | 打码断言 |
| `data-testid="sd-toast"`（容器 `.dsh-sd-toast-stack`） | Toast | 提示断言 |
| `aria-label` | 所有图标按钮 | 可访问性 |

> 侧边栏条目的可测性：DSH 侧边栏 panel 按钮由宿主渲染，label「视频创作」可通过 DOM 文本查询；插件另提供 `?panel=seedance` deep link（`openFromDeepLink`）供 E2E 直达。

---

## 10. 可访问性要点

1. 全部图标按钮有 `aria-label`；纯装饰 SVG `aria-hidden="true"`。
2. 弹窗用 `role="dialog" aria-modal="true"` + 打开时焦点移入（首个可交互元素），Esc 关闭；关闭后焦点回到触发按钮。
3. Tab 顺序 = 视觉顺序；模式 segmented 用 `role="tablist"`/`role="tab"` + `aria-selected`。
4. 开关用 `role="switch" aria-checked`；分段分辨率用 `aria-pressed`。
5. 文本对比度：正文 ≥4.5:1（label-primary/secondary 在主题中已保证）；不要用 tertiary 承载关键信息。
6. 表单错误用 `aria-describedby` 关联到字段；错误用颜色 + 文案双通道。
7. 焦点环：`outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color); outline-offset: 2px`，不要移除 outline。
8. 动画遵守 `prefers-reduced-motion`。
9. 视频播放器 `controls` 原生可访问；再创作弹窗的帧选择按钮为真实 button。
10. 空态/加载用 `aria-live="polite"` 播报「已加载 N 条记录 / 生成失败」等关键状态（Toast 容器 `role="status"`）。

---

## 11. 实现约束（frontend/src 与 bundle 产物）

1. 单文件、手写 `window.__ModuleLoader__.load({ id:'dsh-seedance-studio', factory:(require)=>{...} })`；`exports.apply`、`exports.inject`。
2. 只 require 平台允许模块（react、react/jsx-runtime 等，见 PLAN §3.2）；不 import 其他包。
3. 注册：
   - `ctx.slots.inject('main', function*(){ yield ctx.slots.register({name:'main', key:'seedance', locale:NS}, StudioPage) })`
   - `ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name:'sidebar.panellist', id:'seedance', order:10, label:()=>'视频创作', locale:NS}, PanelIcon))`
   - CSS 通过 `ctx.effect` 注入 `<style data-dsh-seedance>` 并在清理时移除。
4. 数据访问统一封装：`api(method, path, body)` → `fetch('/api/seedance'+path, {headers:{'content-type':'application/json'}, body})`；解析 `{ok,value,error}`；ok:false 抛 `ApiError{code,message}`。
5. 轮询器：单 interval（2.5s 有进行中 / 5s 空闲），页面隐藏暂停（`visibilitychange`）；组件卸载清理。
6. 会话绑定：优先 `ctx.sessions`（参考 dsh-client-ui-session 的 publishMain 逻辑），失败降级：`ctx.sessions.list.getSnapshot()` 里 retainedBy.mainView>0 的第一个；仍失败 → 页面顶部显示「会话绑定失败」+ 允许手输 sessionId（localStorage 记忆）。
7. **不渲染 API Key**；settings 回填使用打码值，用户不改则不提交该字段。
8. 宿主接口字段严格按 PLAN §4（Record/GenerateRequest 字段名 camelCase）。
9. 文件读写都在宿主；客户端只做 dataURL/URL。
10. 组件拆分建议（同文件内函数）：StudioPage、PageHeader、ModeTabs、PromptField、MaterialPanel、ParameterPanel、GenerateBar、HistoryPanel、HistoryCard、PlayerModal、RecreateModal、SettingsModal、ToastHost、EmptyState、Skeleton、Icon*。
11. 无顶层副作用（除注册 factory）；不访问 window 之外的全局；不写 localStorage 敏感信息（sessionId 可）。
12. 渲染性能：历史 >60 条时只渲染最新 60；轮询 diff 更新（按 id map），避免整树重渲染造成输入框失焦。

---

## 12. 验收清单（ui-dev 自检 / QA 对照）

- [ ] 侧边栏出现「视频创作」图标条目，点击打开主面板（页面有 `data-seedance-panel`）。
- [ ] 页面在暗色/亮色主题下均正常（无硬编码颜色；截图对比）。
- [ ] 6 个模式 Tab 可按模型可用性禁用/切换；切换清理不兼容素材。
- [ ] 文生视频全流程：输入 → 生成 → 队列卡进度 → 成功卡 → 播放弹窗可播。
- [ ] 图生视频/首尾帧：上传图、角色徽标、首/尾帧校验。
- [ ] 参考模式上限按模型（2.5 30/10/10，2.0 9/3/3），2.0 只传音频被拦截。
- [ ] 编辑模式 ratio 锁 adaptive、时长锁智能；4k 警告出现。
- [ ] 历史按会话隔离；切换会话刷新；空态文案正确。
- [ ] 再创作链路：抽帧（首/尾/当前）、提交、新卡「改自 #」、来源高亮。
- [ ] 样片模式：480p 限制、转正片按钮、draft-final 提交流程。
- [ ] 设置弹窗：Key 打码回填、保存后 config 刷新、demo 徽标切换。
- [ ] 错误处理：宿主 404/网络失败不白屏；toast 中文错误。
- [ ] 轮询在页面隐藏时暂停；恢复立即刷新。
- [ ] 键盘：Ctrl/Cmd+Enter 生成；Esc 关弹窗；Tab 顺序合理；焦点环可见。
- [ ] `node --check` 通过；无 console 报错（E2E 时收集 console）。
- [ ] 所有 `data-seedance-*` 钩子齐全（见 §9）。
- [ ] 页面文案全部中文（英文副标题除外）。

---

## 附：与 Lumina 的差异说明（避免照抄过头）

| Lumina 有 | 插件 v1 | 原因 |
|---|---|---|
| Credits/套餐/订阅/充值 | 不显示费用与计费后台，仅参考估算 | 插件用自有 API Key（按量计费），无 Lumina 账户体系 |
| Creation mode / Director mode（时间线多镜头） | 不实现 Director 时间线 | 超出 PLAN §4 契约（单任务提交） |
| 灵感广场/模板/App 市场 | 不实现 | 非需求 |
| 一键提示词优化（AI 改写） | 不实现（可留 TODO） | 需要额外 LLM 调用，非契约 |
| 多语言 UI | 全部中文（可英文副标题） | 团队/用户中文为主 |
| 参考视频 base64 | 只接受 URL | API 事实：视频不支持 base64 |
| 队列预估「预计排队 xx」 | 可选/省略 | 插件无全局队列数据 |
