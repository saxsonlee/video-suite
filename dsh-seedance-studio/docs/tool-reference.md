# `seedance_video` 工具参考

> 适用版本：dsh-seedance-studio 0.1.x｜契约来源：`PLAN.md` §5 + `platforms/dsh-plugin/tool.js`｜最后更新：2026-11-04

`seedance_video` 是插件注册给智能体的统一工具：**生成 / 查询 / 等待 / 历史 / 再创作 / 取消 / 模型目录**。任务为异步模型，`generate` 秒回 `taskId`，用 `wait` 或 `status` 获取结果。所有记录按会话自动落盘到 `~/.dsh/storages/seedance-studio/`，重启不丢。

## 1. 典型流程

1. `action=generate` 创建任务，拿到 `taskId`（形如 `sd_mw1rgzw2_hxvwqc8s`）；
2. `action=wait` + `taskId` 等待完成（建议 30~120 秒，最大 300 秒）；超时会返回「仍在进行中」，可再次 `wait`；
3. 成功后结果含 `videoPath`（本机绝对路径，可直接再处理/展示）与 `videoUrl`（远端链接，24 小时有效）；
4. `action=history` 随时列出本会话历史；`action=recreate` + `sourceId` 基于历史再创作。

```text
generate(prompt="海边日落，镜头缓慢推进", duration=5)
  → { ok:true, taskId:"sd_...", status:"queued" }
wait(taskId="sd_...", waitSeconds=120)
  → { ok:true, status:"succeeded", videoPath:"C:\Users\...\media\sd_....mp4" }
```

## 2. 参数总表

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `action` | string（必填） | — | `generate` / `status` / `wait` / `history` / `recreate` / `cancel` / `models` |
| `prompt` | string | — | 视频提示词；`generate` 必填。建议写清主体、动作、镜头、风格、光线、场景 |
| `model` | string | `doubao-seedance-2-5-260628` | 模型 ID；用 `action=models` 查全部 6 个模型与默认参数 |
| `mode` | string | 自动推断 | `text2video` / `image2video` / `firstlast` / `reference` / `edit` / `extend` / `draft` / `draft-final` |
| `resolution` | string | 按模型（2.5 为 720p） | `480p` / `720p` / `1080p` / `4k`（4k 仅 2.0 主版本） |
| `ratio` | string | `adaptive` | `adaptive` / `21:9` / `16:9` / `4:3` / `1:1` / `3:4` / `9:16` |
| `duration` | integer | `-1`（自动） | 秒；2.5 为 4~30，2.0 系列 4~15；`-1` 表示智能时长（1.0 pro 不支持） |
| `seed` | integer | `-1` | 随机种子，`-1` 随机 |
| `generateAudio` | boolean | true（2.x） | 是否生成有声视频 |
| `watermark` | boolean | false | 是否加 AI 生成水印 |
| `returnLastFrame` | boolean | true | 是否返回尾帧（宿主默认 true，便于再创作；官方默认 false） |
| `imageUrls` | string[] | — | 公网 http(s) 链接或 `data:image/...;base64`（内联 dataURL 约 ≤2MB/张；数量按模型：2.5 最多 30 张，2.0 系列最多 9 张）。未传 `mode` 时：1 张=首帧（image2video）、2 张=首尾帧（firstlast，按顺序补 role）、≥3 张=参考图（reference）；显式 `mode` 优先 |
| `workspaceImages` | string[] | — | 工作区图片相对路径，宿主读取转 dataURL（适合本地文件；每张同样 ≤2MB） |
| `videoUrl` | string | — | 参考/待编辑视频的 http(s) URL；**不能 base64，也不能用 taskId** |
| `sourceId` | string | — | `recreate` 用：历史记录 id（`sd_...`） |
| `taskId` | string | — | `status` / `wait` / `cancel` 用：记录 id（`sd_...`） |
| `waitSeconds` | integer | 90 | `wait` 最长等待秒数，1~300 |
| `limit` | integer | 20 | `history` 返回条数，1~100 |

## 3. action 说明与返回

### generate

- 必填：`prompt`；其余可选。按素材自动推断 `mode`（见 §4）。
- 返回：`taskId`、`status`（通常 `queued`）、`progress`、`model`、`mode`、`provider`、`demo`、`record`（完整 DTO）、`hint`（下一步建议）。
- 提交前会按模型能力校验参数（分辨率/时长/比例/素材数量/模式互斥），非法参数返回 `ok:false` 且不落盘。

### status

- 必填：`taskId`。返回单条记录当前状态：`status` / `progress` / `videoUrl` / `videoPath` / `lastFramePath` / `previewImage` / `record`。

### wait

- 必填：`taskId`；可选 `waitSeconds`（默认 90，最大 300）。
- 轮询到终态（`succeeded` / `failed` / `cancelled` / `expired`）立即返回；超时返回 `meta.waitTimedOut=true`，任务继续后台运行，可再次 `wait`。
- 等待期间**每 10~15 秒**主动查询一次（随机间隔；视频生成通常 30 秒~几分钟，无需秒级轮询）；页面进度仍由后台 3~4 秒轮询刷新。
- **超时保护**：任务运行超过 20 分钟仍未完成（上游可能卡住）会自动标记为失败（`error.code=Timeout`），需要重新生成。可用 `RUNNING_TIMEOUT_MS` 调整（毫秒）。
- 返回：`status` / `progress` / `videoUrl` / `videoPath` / `lastFramePath` / `usage` / `previewImage` / `record`。

### history

- 可选 `limit`（默认 20，最大 100）。返回 `records`（摘要：id/status/progress/prompt/model/mode/provider/createdAt/durationSeconds/videoPath/lastFramePath/error/originId）与 `total`。

### recreate

- 必填：`sourceId`；可选覆盖 `prompt` / `model` / `mode`。
- 宿主继承原 prompt/参数，并**优先复用原视频**（远端 URL 24h 内且模型支持参考视频）→ 否则用**落盘尾帧**续写 → 都没有则纯文生（`plan.warnings` 说明）。
- 返回：`taskId`、`status`、`mode`、`plan`、`record`；新记录含 `originId`。

### cancel

- 必填：`taskId`。仅 `queued` 状态可取消；`running` 会被拒绝并返回错误说明（供应商限制）。

### models

- 无必填参数。返回 `models`（6 个模型 DTO：分辨率/时长/比例/素材上限/能力位）、`defaults`（默认模型与参数）、`capabilities`。

## 4. mode 自动推断与素材要求

| mode | 何时使用 | 素材 | 关键约束 |
|---|---|---|---|
| `text2video` | 纯文本 | 无 | 1.0 文生不接受 ratio=adaptive |
| `image2video` | 1 张图 | 1 图（自动作为首帧） | 工具内联 dataURL 约 ≤2MB/张；HTTP `/generate` 的 dataURL 字段级上限约 30MB |
| `firstlast` | 首帧+尾帧 | 2 图 | 2.5 强制 ratio=adaptive；2.0 系列按所选比例；工具按顺序补 first_frame/last_frame（页面显式 role 优先） |
| `reference` | 参考图/视频/音频 | 图 1~30、视频/音频见模型上限 | 音频在 2.0 系列必须搭配图/视频；**视频不能 base64 / taskId** |
| `edit` | 修改已有视频 | 1 个视频 URL | 必须 URL；2.5 侧 ratio=adaptive + duration=-1 + omni=edit |
| `extend` | 延长已有视频 | 1 个视频 URL | 必须 URL；2.5 侧同上，提示词写清延长内容 |
| `draft` | 样片第 1 步（便宜预览） | 同基础模式 | 2.5 only；resolution 固定 480p |
| `draft-final` | 样片第 2 步转正片 | —（工具未暴露 `draftTaskId`） | **仅页面/HTTP API 可用**；禁止 prompt/素材；1080p；仅 2.5 |

推断规则：无素材→`text2video`；1 图→`image2video`；2 图→`firstlast`；≥3 图→`reference`；传了 `videoUrl`→`reference`（提示词含修改/延长语义时可显式 `edit`/`extend`）；同时传图+视频/音频→`reference`。不确定时显式传 `mode`（显式优先）。

> `draft`（样片第 1 步）可用：工具传 `mode:"draft"`，宿主固定 480p 并返回 7 天内有效的 draft 任务 id；第 2 步转正片（`draft-final`）需在页面「样片」卡片点「转正片」，或直接调用 HTTP `POST /api/seedance/generate` 传 `draftTaskId`。

## 5. 结果如何处理

- **本地文件优先**：`videoPath` 是本机绝对路径，可直接用于后续分析/剪辑/发送；`videoUrl` 是上游链接，**24 小时过期**，需要长期使用请下载保存。
- **尾帧预览**：`status`/`wait` 结果在未超时且存在落盘尾帧时，附带 `previewImage`（attachment 引用）并渲染为 image content block；仅当当前模型声明支持图片输入时附加（与官方 read_image 一致），不影响 `record`。
- **页面同步**：智能体生成的记录会出现在「视频创作」页面对应会话的历史画廊（同一份存储），进度自动刷新。
- **记录 id**：所有记录 id 形如 `sd_<时间戳>_<随机>`，工具与页面通用；删除记录会同时删除本地媒体文件。
- **draft 时效**：样片任务 id 官方有效期 7 天（宿主不校验，以供应商为准）。

## 6. 错误与重试

- 失败统一返回 `{ ok:false, action, message, error:{ code, message } }`，不会抛异常给模型；常见 `code`：
  - `ValidationError`：参数非法（分辨率、时长、素材数量、模式互斥、缺 role 等）→ 按 message 修正参数后重试（不再产生 RangeError）；
  - `InvalidTaskId` / `TaskError`：记录不存在/状态不允许（如取消 running 任务）→ 先 `history` 确认；
  - `ApiError`（含 `status`）：上游 4xx/5xx → 401 检查 Key、429 限流退避重试、5xx 稍后重试；
  - `ApiTimeoutError`：上游超时 → 用 `status` 查实际状态，避免重复提交；
  - `ConfigError`：未配置 Key → 当前会进入 demo 模式（无费用）；真实模式请先配置。
- `wait` 超时不是错误：`ok` 仍为 true，`record.meta.waitTimedOut=true`，再次 `wait` 即可。
- 建议：`generate` 失败后不要盲目改 prompt 重试；先看 `error.message`（中文可读）。

## 7. 安全与限制

- 工具结果与页面均不会出现明文 API Key；Key 只存在宿主侧 `settings.json`。
- 视频参考只接受公网 URL / 素材 ID（`asset://`），不支持 base64、不支持 `inputs.video.taskId`；图片支持 dataURL（≤2MB/张）。
- 请求体上限 64MB；`imageUrls` 数量按模型（2.5 ≤30 张，2.0 系列 ≤9 张）；`prompt` 上限 20000 字符。
- 工具内联 dataURL 约 ≤2MB/张（`MAX_INLINE_IMAGE_CHARS`≈2.8M 字符）；HTTP `/generate` 的 dataURL 字段上限约 30MB；`workspaceImages` 由宿主读文件，受同量级上限约束。
- demo 模式：无 Key 时自动启用，8 秒模拟成功并用包内示例视频落盘，全流程（含再创作/历史/媒体）与真实模式一致，不产生费用。

## 8. 示例

```jsonc
// 文生视频（自动时长）
{ "action": "generate", "prompt": "赛博朋克城市夜景延时，霓虹灯反射在湿滑街道", "duration": -1 }

// 首尾帧
{ "action": "generate", "prompt": "镜头从白天推进到夜晚", "imageUrls": ["https://a/start.jpg", "https://a/end.jpg"], "mode": "firstlast" }

// 等待 + 再创作
{ "action": "wait", "taskId": "sd_mw1rgzw2_hxvwqc8s", "waitSeconds": 120 }
{ "action": "recreate", "sourceId": "sd_mw1rgzw2_hxvwqc8s", "prompt": "同一场景，改为夜晚" }
```

> 页面操作与工具调用共用同一套契约：页面左侧参数 ↔ 工具参数、页面历史 ↔ `history`、页面「再创作」 ↔ `recreate`。完整 HTTP 契约见 `PLAN.md` §4；模型能力矩阵见 `docs/models-ui-matrix.md`。
