# Seedance 模型能力与 UI 参数矩阵

> 事实来源：旧版 API 校准文档（仅源码仓库，不随发布包分发；2026-11-04 依据火山方舟 / BytePlus 官方文档 + 第三方交叉核实整理）。
> 面向实现：**T3（platforms/dsh-plugin/frontend/）** 直接照本文的「§4 UI 控件数据」与「§5 联动规则」搭参数区；**T2（server/models/）** 把 §1–§3 落为运行时模型目录。
> 运行时以宿主 GET /api/seedance/config 返回的 models: ModelInfo[] 为准；本文 §4.10 是 **UI 兜底常量**（config 拉取失败时页面仍可渲染）。
> 价格/限流为 2026-11-04 官方数据，可能调整；页面视为「参考值」，不要写死不可更新的营销文案。

---

## 0. 一页速查（实现先看这里）

| # | 结论 | 影响 |
|---|---|---|
| 1 | 默认模型 **doubao-seedance-2-5-260628**（Seedance 2.5） | 模型下拉默认选中 |
| 2 | 2.5：4–30s 或 **-1（智能时长，默认）**；2.0 系列：4–15s 或 -1；1.0：2–12s（无 -1） | 时长控件按模型切换范围；2.5 默认「智能」 |
| 3 | 2.5 分辨率 480p/720p/1080p；**2.0 独有 4k**（限流极低）；fast/mini 仅 480p/720p；1.0 到 1080p | 2.0 选 4k 时展示警告 |
| 4 | 比例 2.x 默认 **adaptive**；2.5 的**首帧/首尾帧/编辑/延长任务 ratio 只能 adaptive**；1.0 文生视频不支持 adaptive | 模式切换时自动锁定/解锁比例 |
| 5 | **2.5 视频编辑任务 duration 必须 -1**、参考视频须 4–30s | 编辑模式自动锁「智能时长」 |
| 6 | 全模态参考：2.5 最多 **30 图 + 10 视频 + 10 音频**（音频可单独）；2.0 系列 9+3+3（音频必须搭配图/视频） | 素材上传数量按模型限制 |
| 7 | 图生视频：首帧角色 first_frame（可省略 role）；首尾帧 2 张必填 role；参考图每张 reference_image；**首/尾帧与全模态参考不可混用** | 模式互斥，切换要清空不兼容素材 |
| 8 | 视频只能公网 URL 或 asset://，**不支持 base64**；图片/音频支持 dataURL | UI 不接受「上传视频文件」，只给 URL 输入 |
| 9 | 样片 draft **仅 2.5**：Step1 draft=true + **480p**；Step2 用 draft_task id + **1080p** + 可 mov；两步分开计费 | 样片是独立模式与两步操作 |
| 10 | 有声视频 generate_audio **默认 true**（仅 2.5/2.0 支持）；watermark 默认 false | 开关默认值 |
| 11 | 状态枚举固定：queued / running / succeeded / failed / cancelled / expired | 徽标与文案映射固定 |
| 12 | 视频 URL 24h 有效；任务 ID 7 天（Draft 14 天，2026-10-28 后创建）；2.5 URL 下载 ≤100 次 | 历史记录必须落盘，播放走本地 /media |
| 13 | 限流：RPM 企业 600/个人 180，并发 10/3；查询 QPS 20、列表 QPS 1；4k 15/1 | 轮询 3–5s 单实例，勿并发轮询 |
| 14 | 仅成功出片计费；审核失败不计费；Draft 两步分别计费 | 预计费用只是参考 |

---

## 1. 模型目录（2026-11-04 中国大陆区，Ark）

| 模型 ID | 显示名 | 族 | 时长范围 | 分辨率 | 参考素材上限 | 备注 |
|---|---|---|---|---|---|---|
| **doubao-seedance-2-5-260628** | Seedance 2.5 | 2.5 | 4–30s / -1 | 480p/720p/1080p（1080p 10bit） | 30 图 + 10 视频 + 10 音频 | 最新旗舰；全模态、编辑/延长、draft、mp4/mov、tools、priority |
| doubao-seedance-2-0-260128 | Seedance 2.0 | 2.0 | 4–15s / -1 | 480p/720p/1080p/**4k**（4k 10bit） | 9 图 + 3 视频 + 3 音频 | 4k 限流极低（RPM 15/并发 1） |
| doubao-seedance-2-0-fast-260128 | Seedance 2.0 Fast | 2.0 | 4–15s / -1 | 480p/720p | 9 图 + 3 视频 + 3 音频 | 高性价比快速版 |
| doubao-seedance-2-0-mini-260615 | Seedance 2.0 Mini | 2.0 | 4–15s / -1 | 480p/720p | 9 图 + 3 视频 + 3 音频 | 2.0 系列最便宜 |
| doubao-seedance-1-0-pro-250528 | Seedance 1.0 Pro | 1.0 | 2–12s（无 -1，可用 frames） | 480p/720p/1080p | 2 图 | **2026-11-24 关停**；frames/camera_fixed/flex |
| doubao-seedance-1-0-pro-fast-251015 | Seedance 1.0 Pro Fast | 1.0 | 2–12s | 480p/720p/1080p | 1 图 | **2026-11-24 关停**；仅首帧、无尾帧 |

- BytePlus 国际版模型 ID 前缀：2.5/2.0 系列为 dreamina-（如 dreamina-seedance-2-5-260628），1.0 为 seedance-；请求/响应 schema 一致，仅 baseURL + model ID + 币种不同。
- 国内已下线（不要出现在 UI）：1.5 pro、1.0 lite t2v/i2v。1.0 pro/pro fast 建议仍列出但标「即将下线」（host 目录带 deprecated: true）。
- 允许自定义模型 / Endpoint ID（ep- 开头）：模型下拉需支持「自定义…」输入。

---

## 2. 能力矩阵（官方口径）

| 能力 | 2.5 | 2.0 | 2.0 fast | 2.0 mini | 1.0 pro | 1.0 pro fast |
|---|---|---|---|---|---|---|
| 文生视频 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 首帧生视频（image2video） | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| 首尾帧生视频（firstlast） | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| 参考图 reference_image | ✓ ≤30 | ✓ ≤9 | ✓ ≤9 | ✓ ≤9 | ✗ | ✗ |
| 参考视频 reference_video | ✓ ≤10 | ✓ ≤3 | ✓ ≤3 | ✓ ≤3 | ✗ | ✗ |
| 参考音频 reference_audio | ✓ ≤10（可单独） | ✓ ≤3（需搭配图/视频） | ✓ ≤3（需搭配） | ✓ ≤3（需搭配） | ✗ | ✗ |
| 视频编辑 / 延长 | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| 有声视频 generate_audio | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| 样片 draft | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 返回尾帧 return_last_frame | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| output_format=mov | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| frames（25+4n, 29–289） | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| camera_fixed | ✗（勿下发） | ✗ | ✗ | ✗ | ✓ | ✓ |
| service_tier=flex（离线半价） | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| tools（web_search） | ✓（仅纯文本） | ✓ | ✓ | ✓ | ✗ | ✗ |
| priority 0–9 | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| 比例自适应 adaptive | ✓ | ✓ | ✓ | ✓ | 仅图生（文生不支持） | 仅图生 |

> 插件 v1 的 UI **不暴露** frames / camera_fixed / flex / priority / tools / service_tier（PLAN 契约未要求），但 host 参数层要能透传且不报错；模型显示名后可加「即将下线」标签。

---

## 3. 参数约束细则（host 校验 + UI 提示共用）

### 3.1 分辨率

| 模型族 | 枚举 | 默认 | 备注 |
|---|---|---|---|
| 2.5 | 480p 720p 1080p | 720p | 1080p 为 10bit；4k 不支持 |
| 2.0 | 480p 720p 1080p 4k | 720p | 4k 仅 2.0 主版本；展示「4k 限流极低：RPM 15、并发 1」 |
| 2.0 fast / mini | 480p 720p | 720p | — |
| 1.0 pro / pro fast | 480p 720p 1080p | 720p（官方文档 1.0 默认 1080p） | 已近下线 |
| draft Step1 | 固定 480p | 480p | 其它分辨率报错 |
| draft Step2（成片） | **必须 1080p** | 1080p | — |

### 3.2 比例 ratio

- 全枚举：adaptive 21:9 16:9 4:3 1:1 3:4 9:16
- 默认：2.5/2.0 为 adaptive。
- **强制 adaptive**：2.5 的 firstlast（首尾帧）、edit（视频编辑）、extend（视频延长）任务；2.0 系列编辑/延长建议同样锁 adaptive 更稳。
- 1.0 pro/pro fast 的**文生视频不支持 adaptive**；图生视频可 adaptive 或指定（UI 对 1.0 文生隐藏 adaptive）。
- 1.0 pro fast 不支持 firstlast。
- 比例对应像素（2.5 官方表）：16:9 1080p=1920×1080、9:16=1080×1920、1:1=1080×1080；2.0 4k 16:9=3840×2160。UI 只用比例图标 + 文案即可。

### 3.3 时长 duration

| 模型族 | 数值范围 | 智能时长 -1 | 约束 |
|---|---|---|---|
| 2.5 | 4–30 整数 | ✓（默认 -1） | edit 模式**必须 -1**；extend 建议 -1 或目标时长 |
| 2.0 / fast / mini | 4–15 整数 | ✓（**默认值官方未明写**；宿主采用 5s，UI 以 `/config.defaults.defaultDuration` 为准） | — |
| 1.0 pro / pro fast | 2–12 整数 | ✗ | 显示固定整数；frames 可替代（v1 UI 不暴露） |
| draft Step1 | 4–30（2.5） | ✓ | Step2 **禁止再传 duration** |

- 时长控件建议：**滑块 + 数字步进 + 「智能」开关**；智能开启时发送 duration: -1，滑块禁用并显示「由模型自动决定（4–30s）」。
- 编辑/延长：输入视频 4–30s（2.5 编辑），输出时长由模型决定（duration=-1）。

### 3.4 其他参数

| 字段（API） | UI 控件 | 默认 | 支持 | 说明 |
|---|---|---|---|---|
| generate_audio | 开关 | **true** | 2.5/2.0 系列 | 关闭输出无声视频；1.0 无此开关 |
| watermark | 开关（默认关） | false | 全部 | 打开后右下角「AI 生成」水印 |
| output_format | 下拉 mp4/mov | mp4 | 仅 2.5 | mov（H.264+yuv444p+PCM）部分播放器不兼容，选 mov 时提示 |
| seed | 数字输入 + 随机按钮 | -1 | 文档仅 1.0 明确，2.x 实测透传 | -1=随机；同 seed 只保证相似 |
| return_last_frame | 开关 | false | 全部 | 开启才有尾帧图（再创作素材） |
| omni_reference_task_type | 模式隐含 | auto | 2.5 | 编辑模式传 edit、延长传 extend，其余 auto/不传 |
| draft | 样片模式隐含 | false | 2.5 | Step1 true；Step2 用 draft_task |

### 3.5 输入素材规格

| 素材 | 格式 | 尺寸/时长 | 数量（2.5 / 2.0 系列） | 大小 | UI |
|---|---|---|---|---|---|
| 图片 | jpeg/png/webp/bmp/tiff/gif（2.0+ 还支持 heic/heif） | 宽高比 [0.4,2.5]，边长 [300,6000]px | 首帧 1；首尾帧 2；参考 1–30 / 1–9 | 单张 <30MB | 上传 → dataURL；缩略图 + 角色标签 |
| 视频 | mp4/mov（H.264/AVC、H.265/HEVC；音频 AAC/MP3，mov 另支持 PCM） | 分辨率 480p–4k；fps [24,60]；宽高比 [0.4,2.5]；边长 [300,6000]；总像素 [407696,8295044]；**2.5 单个 2–30s（编辑 4–30s）、最多 10 个、总时长 ≤30s；2.0 单个 2–15s、最多 3 个、总时长 ≤15s** | 同左 | 单个 ≤200MB | **只能填公网 URL / asset ID**（不支持 base64、不支持本地上传） |
| 音频 | wav/mp3 | **2.5 单个 2–30s、最多 10 段、总时长 ≤30s；2.0 单个 2–15s、最多 3 段、总时长 ≤15s** | 同左 | 单个 ≤15MB | 上传 → dataURL 或填 URL |
| 整个请求体 | — | — | ≤ 64MB | 大文件不要 base64，优先公网 URL |

- **内容合规**：2.5/2.0 不支持直接上传含真人人脸的参考素材（会被 PrivacyInformation 拒绝）；素材区放一行提示。
- 全模态参考的 @ 引用：提示词可用 @image1、@video1、@audio1（Lumina 同款；插件 v1 可先只做文案提示）。

### 3.6 模式 → 请求语义（host 构造 content 的依据）

| UI 模式 | mode 枚举 | content 组成 | 关键约束 |
|---|---|---|---|
| 文生视频 | text2video | text | 无素材 |
| 图生视频 | image2video | text + image(first_frame，role 可省略) | 1 张图 |
| 首尾帧 | firstlast | text + image(first_frame) + image(last_frame) | 2 张图、role 必填、首尾可同图；比例强制 adaptive；宽高比不一致以首帧为主 |
| 全模态参考 | reference | text + images(reference_image)×N + video(reference_video) + audio(reference_audio) | 与首/尾帧互斥；2.0 系列音频必须搭配图/视频；2.5 音频可单独 |
| 视频编辑 | edit | text + video(reference_video) | 2.5：omni_reference_task_type=edit、ratio=adaptive、duration=-1、参考视频 4–30s |
| 视频延长 | extend | text + video(reference_video) | 2.5：omni_reference_task_type=extend、ratio=adaptive；提示词写清延长内容/目标时长 |
| 样片（第 1 步） | draft | 同基础模式 + draft:true | 2.5 only；resolution 只能 480p |
| 样片转正片（第 2 步） | draft-final | draft_task:{id}（禁止 prompt/素材） | 2.5 only；resolution=1080p；禁止 duration/ratio/seed/generate_audio/omni_reference_task_type |

> PLAN §4 的 mode 枚举正是这 8 个值（text2video|image2video|firstlast|reference|edit|extend|draft|draft-final）。UI 的「模式 Tab」可合并成 6 个（文生 / 图生 / 首尾帧 / 参考 / 编辑·延长 / 样片），提交时映射为上述 mode。

### 3.7 再创作映射（PLAN §7，UI 与 host 对齐）

| 来源可用性 | 再创作输入 |
|---|---|
| 远端 video_url 仍有效（<24h、未删除、模型支持参考视频） | reference_video（公网 URL，不能 base64）或客户端抽帧图 |
| 远端 URL 已过期，但有落盘尾帧图 | 尾帧图 dataURL 作 first_frame 或 reference_image |
| 有落盘视频、无尾帧 | 客户端 canvas 从本地 /api/seedance/media?id=&kind=video 抽当前帧/首帧/尾帧 → dataURL |
| 都没有 | 仅继承 prompt/params（originId 仍记录） |

- 页面必须显示「改自 #xxxx」来源标记。
- 抽帧注意：同源 /api 视频不需要 crossOrigin；video.currentTime seek 后 drawImage；抽帧图控制在 2MB 内（jpeg quality 0.9，必要时长边 ≤4096）。

### 3.8 宿主侧硬限制补充（2026-11-04 与 host-dev 对齐，UI 提示需与之一致）

- **参考视频不能通过 taskId 引用**：host 规定 `reference` 模式只接受 `http(s) URL` 或 `asset://` 素材 ID；传 `inputs.video.taskId` 会被 400 拒绝（提示改用 URL/素材 ID）。UI 的「从历史视频选择」只回填 `remoteVideoUrl`。
- **视频编辑/延长必须提供视频 URL**（同样不接受 taskId；不接受 base64）。
- **样片转正片（draft-final）**：只允许 `resolution=1080p`（可省略）、`watermark`、`outputFormat`；禁止 prompt/图片/视频/音频/duration/ratio/seed/generateAudio/omni 类型；draftTaskId 必填且来自 Step1。
- **1.0 系列**（pro / pro fast）：不支持 draft、edit、extend、reference；不支持 4k（4k 仅 2.0 主版本）；1.0 pro fast 无尾帧；1.0 文生视频不接受 ratio=adaptive（需具体比例）。
- **媒体接口**：`GET /api/seedance/media?id=<sd_...>&kind=video|lastframe|poster` 只认记录 id + kind（不带 sessionId，媒体按记录 id 解析）；Range 单段，越界 416。
- **会话 id**：`sessionId` 必填、非空、≤200 字符、禁止控制字符与 `<>:"\\/|?*`；插件在拿不到会话时回落 `default`。
- **工具尾帧预览**：`seedance_video` 结果中的尾帧 image content block 仅在「当前模型声明支持图片输入」时附加（与官方 read_image 的 gate 一致）；现有 2.x/1.0 模型均接受图片，纯文本模型会静默跳过，不影响工具返回的记录数据。

---

## 4. UI 控件数据（T3 直接可用）

> 本节是「模型能力 → 控件」的单一映射表。推荐做法：/config 成功时用返回的 models 覆盖；失败/未安装宿主时用 §4.10 常量兜底渲染。

### 4.1 模型下拉

| 字段 | 值 |
|---|---|
| 控件 | select 或自定义下拉 |
| 选项 label | Seedance 2.5 / Seedance 2.0 / Seedance 2.0 Fast / Seedance 2.0 Mini / Seedance 1.0 Pro（即将下线）/ Seedance 1.0 Pro Fast（即将下线） |
| 副文案 | 2.5：「最新旗舰 · 30s · 全模态」；2.0：「4–15s · 4k」；fast：「高性价比」；mini：「轻量省钱」 |
| 默认 | doubao-seedance-2-5-260628 |
| 自定义 | 末尾「自定义模型 ID…」→ 文本输入（支持 ep- 接入点） |

### 4.2 模式 Tab（可用性按模型）

| Tab | 图标语义 | 需要素材 | 可用模型 |
|---|---|---|---|
| 文生视频 | 文字→胶片 | 无 | 全部 |
| 图生视频 | 图片→胶片 | 1 张首帧 | 全部 |
| 首尾帧 | 首帧+尾帧 | 2 张图 | 2.5/2.0/2.0 fast/2.0 mini/1.0 pro（1.0 pro fast ✗） |
| 全模态参考 | 图片+视频+音频 | ≥1 素材 | 2.5/2.0/2.0 fast/2.0 mini |
| 视频编辑·延长 | 剪刀/延长线 | 1 个视频 URL | 2.5/2.0/2.0 fast/2.0 mini |
| 样片（草稿） | 闪电 | 同文生/图生 | 仅 2.5 |

- 不可用 Tab：禁用（灰色 + tooltip「当前模型不支持该模式」）；切换模型时若当前模式不可用 → 自动回退「文生视频」并 toast 提示。
- 模式切换后：清空与新模式不兼容的素材（首/尾帧 ↔ 参考素材互斥；编辑/延长只保留 1 个参考视频）。

### 4.3 参数控件可用性矩阵（行=控件，列=模型族）

| 控件 | 2.5 | 2.0 | 2.0fast/mini | 1.0 |
|---|---|---|---|---|
| 分辨率 select | 3 档 | 4 档（含 4k 警告） | 2 档 | 3 档 |
| 比例 select | 7 项；firstlast/edit/extend 锁 adaptive | 同左（2.0 编辑建议也锁） | 同左 | 6 项（文生去 adaptive） |
| 时长 | 4–30 + 智能 | 4–15 + 智能 | 4–15 + 智能 | 2–12 固定（无智能） |
| 生成音频 | ✓ 默认开 | ✓ 默认开 | ✓ 默认开 | 隐藏 |
| 输出格式 | mp4/mov | 隐藏（mp4） | 隐藏 | 隐藏 |
| 尾帧 | ✓ | ✓ | ✓ | ✓ |
| 种子 | 高级区 | 高级区 | 高级区 | 高级区 |
| 水印 | ✓ 默认关 | ✓ | ✓ | ✓ |
| 样片开关 | ✓（仅 draft 模式） | 隐藏 | 隐藏 | 隐藏 |

### 4.4 联动禁用规则（实现成 deriveConstraints(model, mode) 函数）

1. mode 为 firstlast / edit / extend 且能力支持 → ratioOptions = ['adaptive']，ratio 值强制 'adaptive'。
2. mode === 'edit' 且 model.family === '2.5' → duration = -1，时长控件禁用并显示「编辑任务由模型决定时长」。
3. mode === 'draft' → resolution 仅 480p；mode === 'draft-final' → resolution=1080p、其余参数全禁用、隐藏 prompt 与素材区、展示来源 draft 卡片。
4. model.audio === false → 隐藏/禁用「生成音频」。
5. model.draft === false → 隐藏「样片」模式。
6. model.references === false → 禁用「全模态参考」；model.lastFrame === false → 禁用「首尾帧」。
7. model.maxVideos === 0 → 禁用编辑/延长。
8. resolution === '4k'（2.0 主版本）→ 显示黄色警告「4k 生成限流极低（RPM 15 / 并发 1），可能排队较久」。
9. 素材数量达到上限 → 上传按钮禁用并显示「已上传 N/M」；总时长超限提示（见 §3.5）。
10. mode === 'reference' 且模型族为 2.0 系列 → 只传音频没有图/视频时，生成按钮禁用并提示「2.0 系列参考音频需搭配图片或视频」。
11. 无会话（sessionId 为空）→ 生成按钮禁用 + 提示「开始一个对话后即可生成」。
12. config.demo === true → 页面显示「演示模式（未配置 API Key）」徽标，生成仍可用（本地模拟）。

### 4.5 生成按钮状态机

| 状态 | 条件 | 表现 |
|---|---|---|
| idle | 表单有效 | 主按钮可点，文案「生成视频」+ 预计费用 |
| invalid | prompt 空 / 必填素材缺失 / 无会话 | 禁用 + 行内原因（不弹窗） |
| submitting | POST /generate 进行中 | loading spinner + 「创建任务中…」+ 全表单只读 |
| queued/running 存在 | 有进行中任务 | 仍可创建新任务（按钮冷却 1s 防重复） |
| error | 创建失败 | 按钮恢复 + toast 错误码中文解释 |

### 4.6 素材控件规格

| 控件 | 规格 |
|---|---|
| 图片上传 | 卡片网格（每张约 96×96、圆角 8）+ 上传占位卡（虚线框 + 「+ 上传图片」）；支持拖拽整区高亮；支持多选；显示角色徽标（首帧/尾帧/参考图）；hover 显示删除 × 与「设为首帧/尾帧/参考图」 |
| 视频引用 | 单行输入框「视频公网 URL」+ 粘贴提示；显示 URL 合法性与「不支持本地视频文件」提示；编辑/延长模式最多 1 个（2.5 参考模式最多 10 个，v1 可先 1 个 + 列表） |
| 音频 | 上传按钮或 URL 输入，展示文件名/时长；参考模式下按模型上限 |
| 空态 | 虚线上传区 + 主文案「添加参考素材」+ 副文案「支持 图片 / 视频链接 / 音频，最多 N 个」 |
| 校验文案 | 见 §6.2 错误文案表 |

### 4.7 历史/队列卡片数据映射（Record → 卡片）

| 卡片元素 | 数据来源 | 说明 |
|---|---|---|
| 封面 | /media?id=&kind=poster 或 lastFrame，或 video preload=metadata 首帧 | 无封面用渐变占位 + 图标 |
| 状态徽标 | record.status | 见 §6.1 文案/颜色映射 |
| 进度条 | record.progress（0–100） | queued 显示 indeterminate 动画；running 显示百分比 |
| prompt | record.prompt | 2 行截断 + title 完整 |
| 参数 chips | record.model 短名、params.resolution、params.duration === -1 ? '智能时长' : duration+'s' | 最多 3 个 chip |
| 时间 | createdAt | 相对时间（「刚刚 / N 分钟前 / HH:mm」），hover 显示绝对时间 |
| 来源 | originId | 有则显示「改自 #xxxx」（id 后 6 位） |
| 操作 | 播放 / 下载 / 再创作 / 删除 / 取消（仅 queued） | 播放打开播放器弹窗；下载走 /media 链接 download |
| 错误 | record.error.message | 失败卡片：红色边框 + 错误文案 + 「重试」（用原参数再提交） |

### 4.8 预计费用/时长提示（可选但推荐，Lumina 同款「Cost estimate (for reference only)」）

- token 估算公式：tokens ≈ (输入视频时长 + 输出时长) × 宽 × 高 × 24 / 1024。
- 官方 16:9、5s、无输入视频的参考价（元）：2.5 480p≈3.36 / 720p≈7.56 / 1080p≈18.71；2.0 480p≈2.31 / 720p≈4.97 / 1080p≈12.39 / 4k≈25.27；fast 480p≈1.86 / 720p≈4.00；mini 480p≈1.16 / 720p≈2.48。
- UI 展示统一「预计消耗 ≈ ¥X.XX（按 5s / 16:9 估算，实际以账单为准）」；时长非 5s 按比例线性缩放（duration=-1 用 5s 兜底并标「智能时长」）。
- demo 模式不显示费用，改成「演示模式 · 不产生费用」。

### 4.9 限流/时效（UI 侧提示）

- 429 提示：「请求过于频繁（RPM/并发超限），请稍后重试」。细分：RPM →「触发每分钟请求上限」；并发 →「并发任务已满，新任务会排队」；突发 →「流量突增被系统保护，请稍后」。
- 队列估算文案（Lumina 同款）：「预计排队 {time}（{n} 个任务）」——插件 v1 无全局队列数据，可省略或显示自身进行中任务数。
- 历史卡片视频 URL 过期（>24h）：「原始视频链接已过期，本地副本可用」；有落盘文件优先本地。

### 4.10 UI 兜底常量（可直接复制进 frontend/src/03-constants.js；正常以 /config.models 为准）

> 注：2.0 系列 `defaultDuration` 官方文档未明写默认值，宿主取 5s；2.5 为 -1（智能时长）。UI 渲染以 `/config.defaults` / 各模型的 `defaultDuration` 为准，兜底常量仅用于 config 不可用时的降级。

```js
// 仅当 /api/seedance/config 不可用（宿主未安装/网络失败）时使用；正常以 config.models 为准。
var MODEL_UI_FALLBACK = [
  { id: 'doubao-seedance-2-5-260628', label: 'Seedance 2.5', family: '2.5',
    durations: [4, 30], autoDuration: true, defaultDuration: -1,
    resolutions: ['480p', '720p', '1080p'],
    ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    audio: true, audioAlone: true, firstFrame: true, lastFrame: true,
    references: true, draft: true, frames: false, cameraFixed: false, flex: false,
    outputFormats: ['mp4', 'mov'], tools: true, priority: true,
    maxImages: 30, maxVideos: 10, maxAudios: 10,
    modes: ['text2video', 'image2video', 'firstlast', 'reference', 'edit', 'extend', 'draft'] },
  { id: 'doubao-seedance-2-0-260128', label: 'Seedance 2.0', family: '2.0',
    durations: [4, 15], autoDuration: true, defaultDuration: 5, // 2.0 默认值官方未明写（宿主取 5；可用 /config 覆盖）
    resolutions: ['480p', '720p', '1080p', '4k'],
    ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    audio: true, audioAlone: false, firstFrame: true, lastFrame: true,
    references: true, draft: false, frames: false, cameraFixed: false, flex: false,
    outputFormats: ['mp4'], tools: true, priority: true,
    maxImages: 9, maxVideos: 3, maxAudios: 3,
    modes: ['text2video', 'image2video', 'firstlast', 'reference', 'edit', 'extend'] },
  { id: 'doubao-seedance-2-0-fast-260128', label: 'Seedance 2.0 Fast', family: '2.0',
    durations: [4, 15], autoDuration: true, defaultDuration: 5, // 2.0 默认值官方未明写（宿主取 5；可用 /config 覆盖）
    resolutions: ['480p', '720p'],
    ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    audio: true, audioAlone: false, firstFrame: true, lastFrame: true,
    references: true, draft: false, frames: false, cameraFixed: false, flex: false,
    outputFormats: ['mp4'], tools: true, priority: true,
    maxImages: 9, maxVideos: 3, maxAudios: 3,
    modes: ['text2video', 'image2video', 'firstlast', 'reference', 'edit', 'extend'] },
  { id: 'doubao-seedance-2-0-mini-260615', label: 'Seedance 2.0 Mini', family: '2.0',
    durations: [4, 15], autoDuration: true, defaultDuration: 5, // 2.0 默认值官方未明写（宿主取 5；可用 /config 覆盖）
    resolutions: ['480p', '720p'],
    ratios: ['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    audio: true, audioAlone: false, firstFrame: true, lastFrame: true,
    references: true, draft: false, frames: false, cameraFixed: false, flex: false,
    outputFormats: ['mp4'], tools: true, priority: true,
    maxImages: 9, maxVideos: 3, maxAudios: 3,
    modes: ['text2video', 'image2video', 'firstlast', 'reference', 'edit', 'extend'] },
  { id: 'doubao-seedance-1-0-pro-250528', label: 'Seedance 1.0 Pro（即将下线）', family: '1.0',
    durations: [2, 12], autoDuration: false, defaultDuration: 5,
    resolutions: ['480p', '720p', '1080p'],
    ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'],
    audio: false, audioAlone: false, firstFrame: true, lastFrame: true,
    references: false, draft: false, frames: true, cameraFixed: true, flex: true,
    outputFormats: ['mp4'], tools: false, priority: false,
    maxImages: 2, maxVideos: 0, maxAudios: 0, deprecated: true,
    modes: ['text2video', 'image2video', 'firstlast'] },
  { id: 'doubao-seedance-1-0-pro-fast-251015', label: 'Seedance 1.0 Pro Fast（即将下线）', family: '1.0',
    durations: [2, 12], autoDuration: false, defaultDuration: 5,
    resolutions: ['480p', '720p', '1080p'],
    ratios: ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'adaptive'],
    audio: false, audioAlone: false, firstFrame: true, lastFrame: false,
    references: false, draft: false, frames: true, cameraFixed: true, flex: true,
    outputFormats: ['mp4'], tools: false, priority: false,
    maxImages: 1, maxVideos: 0, maxAudios: 0, deprecated: true,
    modes: ['text2video', 'image2video'] }
];

// 文生视频时 1.0 系列不支持 adaptive：deriveConstraints 里过滤。
var MODE_LABELS = {
  text2video: '文生视频', image2video: '图生视频', firstlast: '首尾帧',
  reference: '全模态参考', edit: '视频编辑', extend: '视频延长',
  draft: '样片', 'draft-final': '样片转正片'
};
```

---

## 5. mode × 参数约束速查（校验函数即查此表）

| mode | 必填 | ratio | duration | 可用素材 | 备注 |
|---|---|---|---|---|---|
| text2video | prompt | 全部（1.0 去 adaptive） | 按模型 | 无 | — |
| image2video | prompt + 1 图 | 全部（可 adaptive） | 按模型 | first_frame ×1 | role 可省略，host 建议显式传 first_frame |
| firstlast | prompt + 2 图 | **adaptive** | 按模型（2.5 建议 -1） | first_frame + last_frame | 1.0 pro fast 不支持 |
| reference | prompt + ≥1 素材 | adaptive 或具体 | 按模型（2.5 建议 -1） | ref_image×N / ref_video×N / ref_audio×N | 不能与首/尾帧混用；2.0 音频需搭配 |
| edit | prompt + video | **adaptive** | **-1（2.5 强制）** | reference_video ×1 | 2.5 传 omni_reference_task_type=edit；参考视频 4–30s |
| extend | prompt + video | **adaptive** | -1 或目标时长 | reference_video ×1 | 2.5 传 omni_reference_task_type=extend |
| draft | 材料同基础模式 | 按模型 | 4–30 | 同基础模式 | 2.5 only；resolution 固定 480p |
| draft-final | draftTaskId | —（禁止） | —（禁止） | draft_task | 2.5 only；resolution=1080p；禁止 prompt/素材 |

---

## 6. 状态与错误（UI 文案映射）

### 6.1 任务状态

| status | 中文文案 | 颜色 token | 进度条 |
|---|---|---|---|
| queued | 排队中 | --dsw-alias-state-idle-primary / 灰 | indeterminate 条纹 |
| running | 生成中 | --dsw-alias-state-business-primary / 品牌蓝 | 百分比 |
| succeeded | 已完成 | --dsw-alias-state-success-primary / 绿 | 100% |
| failed | 生成失败 | --dsw-alias-state-error-primary / 红 | 隐藏 |
| cancelled | 已取消 | --dsw-alias-state-warn-primary / 黄 | 隐藏 |
| expired | 已超时 | --dsw-alias-state-warn-primary / 黄 | 隐藏 |

### 6.2 HTTP/任务错误 → 中文提示（client 展示 error.message；host 已映射则直接展示）

| 场景 | error.code 示例 | 建议文案 |
|---|---|---|
| Key 无效/缺失 | AuthenticationError | 「API Key 无效或未配置，请在设置中检查」 |
| 模型未开通 | ModelNotOpen / OperationDenied.ServiceNotOpen | 「该模型尚未开通，请到方舟控制台开通管理页开通」 |
| 模型不存在 | InvalidEndpointOrModel.NotFound | 「模型 ID 不存在，请检查模型名或接入点」 |
| 参数与模式不兼容 | InvalidParameter.TaskTypeConstraint | 「参数与任务类型不兼容（如首尾帧/编辑任务需 adaptive 比例、编辑需智能时长）」 |
| 敏感内容 | SensitiveContentDetected / Input*SensitiveContentDetected | 「输入内容未通过审核，请修改提示词或素材」 |
| 真人脸 | *.PrivacyInformation | 「不支持直接上传含真人脸的素材，请使用授权素材或平台产物」 |
| 版权 | *.PolicyViolation | 「素材可能涉及版权限制，请更换素材」 |
| HTTP 429 | *RateLimitExceeded / *ConcurrentRequestsLimitExceeded / RequestBurstTooFast | 「请求过于频繁或并发已满，请稍后重试（新任务会自动排队）」 |
| 账户欠费/额度 | AccountOverdueError / QuotaExceeded | 「账户欠费或额度不足，请充值/调整额度后重试」 |
| 服务错误 | InternalServiceError / 5xx | 「服务暂时不可用，请稍后重试」 |
| 任务失败（异步） | error.code 原值 | 直接展示 record.error.message，副文案给建议 |

### 6.3 时效与限制（展示用）

- 任务 ID 7 天（Draft 任务 ID：2026-10-28 10:00 UTC+8 之后创建为 14 天）；视频/尾帧 URL 24h；2.5 视频 URL 下载 ≤100 次；cancelled 记录 24h 自动删除；execution_expires_after 默认 48h（超时 → expired）。
- 限流：模型维度 RPM 企业 600 / 个人 180，并发 10/3；**2.0 4k：RPM 15、并发 1**；查询接口 QPS 20（多任务共用一个轮询器）、列表 QPS 1、取消 QPS 20。
- 计费：仅成功出片收费；审核失败不收费；Draft 两步分别计费；按 token 计费（usage.completion_tokens 对账）。

---

## 7. 参数校验清单（host 侧建议，T2 自测对照）

1. prompt 非空（trim 后 ≥1 字符；官方建议中文 ≤500 字，UI 只做软提示不硬截断）。
2. model 在目录内或 ep- 自定义；未知模型不 crash，按 2.5 能力兜底并记 warning。
3. resolution ∈ 模型 resolutions；ratio ∈ 模型 ratios；duration ∈ [min,max] 或 -1（模型支持时）。
4. mode ∈ 8 枚举；firstlast 仅模型支持时；draft/draft-final 仅 2.5。
5. 素材数量 ≤ 模型上限；图片 dataURL 建议 ≤2MB（工具 imageUrls 限 ≤2MB）；HTTP 请求体 ≤ 路由限制；视频 URL 必须 http(s)/asset://，**拒绝 data:video**；音频 data:audio/* 允许。
6. 2.5 编辑：ratio=adaptive、duration=-1、omni_reference_task_type=edit；延长同理 extend。
7. 首/尾帧与全模态参考互斥校验（同时出现返回 400 明确错误）。
8. 2.0 系列参考音频需搭配图/视频。
9. 1.0 文生视频不允许 adaptive；1.0 pro fast 不允许 last_frame。
10. 非法输入返回 {ok:false, error:{code,message}}，message 为中文可展示文案；不得泄漏 API Key / 上游响应敏感头。

---

## 8. 调研备注（Lumina 对标用的官方原文，非本插件契约）

- Lumina 视频页实际控件文案（从页面 SSR i18n 抓取，2026-11-04）：Text To Video、First Frame、Reference material、Aspect Ratio、Resolution、Duration:、smart time（智能时长）、Watermark、Reference video、Video Editing、Extend Video、Draft mode、Start generating、Estimated queue ...、Cost estimate (for reference only):、No history yet、History、Generated Result、Download video、Creation mode / Director mode、Model experience、The video generation task has been created、Generation failed, please try again、The regeneration is not supported more than 24 hours later。
- 说明：Lumina 页面需登录，无法抓取渲染后 DOM；以上为页面 SSR 数据中的国际化词条 + SEO 描述（lumina_seo_model_experience_video_description：text prompts / images / references → cinematic clips, ads, social videos, story content），作为交互与文案对标参考，插件功能以 seedance-studio/PLAN.md 为准。
- 证据文件（调研原始抓取，仅内部留档）：_seedance-studio/qa/_lumina-ssr.json、_lumina-i18n-*.txt。
