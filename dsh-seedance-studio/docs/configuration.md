# 配置参考（configuration）

> 适用版本：dsh-seedance-studio 0.1.x｜契约来源：`PLAN.md` §6 + `server/settings/`｜最后更新：2026-11-04

本插件支持三种配置来源，优先级从高到低：

1. **`settings.json`**（页面「设置」写入）：`$DSH_HOME/storages/seedance-studio/settings.json`；
2. **环境变量**（启动 DSH 时生效）：如 `ARK_API_KEY`、`RELAY_BASE_URL`、`DEFAULT_MODEL`；
3. **插件 config**（`dsh` profile 的插件配置对象，键名同 `settings.json`，也接受 camelCase 别名；另支持 `storageRoot` 覆盖存储根目录（调试/测试隔离用）与 `debug`（等价 `DEBUG`））；
4. 代码默认值（最低）。

`$DSH_HOME` 默认 `~/.dsh`（Windows：`C:\Users\<你>\.dsh`），可用 `DSH_HOME` 环境变量覆盖。页面保存设置后**立即生效**，无需重启插件。

## 1. 快速开始

### 方式 A：页面设置（推荐）

打开「视频创作」→ 右上角齿轮 → 填 `方舟 API Key`（Ark 官方）或展开「中转服务（进阶）」填 `Relay Base URL` + `Relay API Key` → 保存。Key 输入框只显示打码值（如 `ark-****abcd`），留空保存表示不修改。

### 方式 B：环境变量（启动 DSH 前设置）

```powershell
$env:ARK_API_KEY = "<your-ark-key>"
$env:DEFAULT_MODEL = "doubao-seedance-2-5-260628"
# 然后重启 DSH（由 Lead/用户执行；本仓库测试请用 verify-web.mjs 的独立 profile）
```
### 方式 C：直接编辑 settings.json

```jsonc
{
  "provider": "auto",
  "ARK_API_KEY": "<your-ark-key>",
  "ARK_BASE_URL": "https://ark.cn-beijing.volces.com",
  "DEFAULT_MODEL": "doubao-seedance-2-5-260628",
  "POLL_INTERVAL_MS": 3000
}
```

文件以 0600 权限原子写入；`ARK_API_KEY` / `RELAY_API_KEY` 读取时只回打码值，不会明文下发浏览器。

## 2. 字段表（settings.json / 环境变量 / 插件 config 通用）

| 键 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `provider` | `auto` / `ark` / `relay` / `demo` | `auto` | 供应商选择；`auto` 按优先级自动判定（见 §3） |
| `ARK_API_KEY` | string | 空 | 火山方舟 API Key（敏感，打码） |
| `ARK_BASE_URL` | string | `https://ark.cn-beijing.volces.com` | Ark API 根地址 |
| `ARK_TASKS_PATH` | string | `/api/v3/contents/generations/tasks` | Ark 任务路径 |
| `RELAY_BASE_URL` | string | 空 | 中转站根地址（必须 http(s)://） |
| `RELAY_API_KEY` | string | 空 | 中转站 Key（敏感，打码） |
| `RELAY_PROTOCOL` | `ark` / `openai` / 空 | 空（自动识别） | 中转协议 |
| `RELAY_CREATE_PATH` | string | 按协议默认 | 创建任务路径，如 `/v1/video/generations` |
| `RELAY_QUERY_PATH` | string | `createPath + '/{id}'` | 查询路径，`{id}` 占位 |
| `RELAY_CANCEL_PATH` | string | 同 query | 取消路径 |
| `RELAY_STYLE` | `metadata` / `flat` / `orca` | `metadata` | 创建请求体风格 |
| `RELAY_MODEL_MAP` | string / object | 空 | 模型名映射，JSON 对象或 `a=b,c=d` 字符串 |
| `RELAY_MODELS` | string（JSON） | 空 | 设置页勾选的「已选模型清单」（`[{id,label}]`，多选）：非空时主面板「模型」下拉只显示这些模型 |
| `RELAY_AUTH_HEADER` | string | `Authorization` | 鉴权头名 |
| `RELAY_AUTH_PREFIX` | string | `Bearer ` | 鉴权前缀（可空串） |
| `DEFAULT_MODEL` | string | `doubao-seedance-2-5-260628` | 默认模型（页面/工具的默认值） |
| `DEMO` | bool / `""` | 空 | `true` 强制演示模式（不调用真实接口） |
| `DEBUG` | bool | false | 输出调试日志（boot.log 含鉴权 URL 等） |
| `RUNNING_TIMEOUT_MS` | 任务运行超时（毫秒），默认 1200000（20 分钟） | 超过后标记失败（Timeout），需重新生成 |
| `POLL_INTERVAL_MS` | int | 3000 | 任务轮询间隔（500~60000） |
| `WAIT_TIMEOUT_MS` | int | 900000 | 后台等待超时（1s~2h） |
| `REQUEST_TIMEOUT_MS` | int | 60000 | 单次 HTTP 请求超时 |
| `DOWNLOAD_TIMEOUT_MS` | int | 180000 | 结果视频下载超时 |
| `MAX_BODY_BYTES` | int | 67108864 | 请求体上限（默认 64MB，1MB~512MB） |
## 3. provider 判定逻辑（`auto` 时）

```text
if provider == "demo" 或 DEMO=true        → demo（强制演示，无费用）
else if provider == "ark"                 → ark；缺 ARK_API_KEY 时给出 configError（不自动降级）
else if provider == "relay"               → relay；缺 RELAY_BASE_URL/Key 时给出 configError
else（auto）:
  有 RELAY_BASE_URL                        → relay（即使同时有 ARK_API_KEY 也走 relay；
                                             缺 Key 时 configError，不降级到 demo）
  否则有 ARK_API_KEY                       → ark
  否则                                     → demo（demoReason=未配置 API Key，自动进入演示模式）
```

> 注意：`auto` 下 **relay 优先于 ark**；只要配置了 `RELAY_BASE_URL` 就不会回落到 ark/demo。

- **demo 模式**：使用包内 `media/demo.mp4` + `media/demo-lastframe.jpg`，任务按 2s→running 30%、6s→70%、8s→succeeded 模拟；全流程（历史/媒体/再创作/抽帧）与真实模式一致，不产生费用。
- `GET /api/seedance/config` 返回 `provider` / `demo` / `demoReason` / `providerRequested` / `defaultModel` / `models` / `defaults` / `capabilities` / `settings` / `limits`；其中 **`configError` 位于 `settings` 内**（`settings.configError`），页面据此展示提示。

## 4. 中转站（relay）配置要点

- `RELAY_PROTOCOL`：`ark`（默认 path `/api/v3/contents/generations/tasks`）或 `openai`（`/v1/video/generations`）；留空按 Base URL / 路径自动识别。
- `RELAY_STYLE`：
  - `metadata`（默认，new-api 风格）：顶层 `{model, prompt, image(首帧), duration, seed}`，Seedance 专有参数与 `content` 数组放在 `metadata` 内；
  - `flat`：`ratio/resolution/seed/generate_audio/watermark/return_last_frame/output_format/priority` 等平铺顶层，图片用 `image`（首帧）或 `images` 数组（多图）；
  - `orca`：顶层仍是 `model/prompt`，`content` 与时长放 `metadata`。
  - 说明：没有「顶层 content」形态，字段落点以 host `buildRelayCreateBody` 为准。
- **限制**：`flat` 风格不携带 `content` / `metadata`（`content` 与 `draft_task` 节点会丢失），因此 **relay + flat 与 `draft-final`（样片转正片）组合不可用**；需要 draft-final 时请用 Ark 直连或 `metadata`/`orca` 风格的 relay。
- `RELAY_MODEL_MAP`：把官方模型 ID 映射到中转站的模型名，例如 `{"doubao-seedance-2-5-260628":"seedance-2.5"}`，或字符串 `doubao-seedance-2-5-260628=seedance-2.5`。
- 自定义头：`RELAY_AUTH_HEADER`（默认 `Authorization`）+ `RELAY_AUTH_PREFIX`（默认 `Bearer `，可设为空串）。
- **模型列表 / 连接测试 / 多选**：设置页「中转服务（进阶）」的「获取模型列表」按钮调用 `POST /api/seedance/relay/models`，用弹窗里**当前填写**的 Base URL / Key / 协议请求（无需先保存）：`openai` 协议先试 `GET /v1/models`，`ark` 协议先试 `GET /api/v3/models`，失败自动回退其余候选端点；超时/鉴权/非模型列表会给出逐端点原因。成功返回 `{ endpoint, protocol, models, latencyMs }`；在列表中**勾选**需要的模型（带过滤框），已选模型进入「已选模型清单」（可 × 移除）并保存到 `RELAY_MODELS` —— 之后主面板「模型」下拉只显示清单中的模型；也可选「自定义模型 ID…」手填。

## 5. 安全与隐私

- API Key **只在宿主侧**使用与存储；`GET /config`、`GET /settings` 只返回打码值（`ark-****abcd`），页面输入框占位符显示「已保存：ark-****abcd（留空不修改）」。
- 保存打码值/空 Key 会被忽略，不会把打码字符串写回 `settings.json`。
- `settings.json` 以 0600 权限、临时文件 + rename 原子写入；损坏 JSON 会回退默认值并保留文件（不崩溃）。
- 插件日志（`$DSH_HOME/storages/seedance-studio/boot.log`）不打印 Key 明文；`DEBUG` 仅输出鉴权 URL 与路由信息。
- 历史与媒体保存在 `$DSH_HOME/storages/seedance-studio/`（`sessions/`、`media/`、`settings.json`），页面只读当前会话。

## 6. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面显示「演示模式」 | 未检测到 Key / `DEMO=true` | 填 Key（页面设置或 env）后保存即可，无需重启；或保持 demo 体验 |
| `configError: provider=ark 但未配置 ARK_API_KEY` | `provider` 显式 ark 但无 Key | 补 Key 或改回 `auto` |
| `中转站模型列表获取失败（已尝试 N 个端点）` | Base URL/Key 错误，或站点不提供 `/models` 接口 / 返回非模型列表 | 核对地址与 Key、切换协议；仍失败可在「默认模型」选「自定义模型 ID…」手填 |
| `configError: 已选择中转站模式（provider=relay），但未配置 RELAY_BASE_URL` / `RELAY_BASE_URL 必须以 http(s):// 开头` | relay 配置不完整 | 补 `RELAY_BASE_URL`（含协议）与 Key；或改回 `auto` 走 Ark |
| 401 / 鉴权失败 | Key 错误或过期 | 重新填写 Key；确认 `ARK_BASE_URL` 与 Key 区域一致 |
| 429 限流 | 上游 RPM/并发限制（如 4k 极低） | 降低频率/分辨率；稍后重试；`POLL_INTERVAL_MS` 调大 |
| 任务一直 queued/running | 上游排队或超时 | `seedance_video` 用 `status`/`wait` 查询；`WAIT_TIMEOUT_MS` 可调大 |
| 视频 24h 后打不开 | 远端 URL 过期 | 记录已落盘本地（`videoPath`/页面下载），使用本地副本 |
| 设置保存后没变化 | 读取优先级：settings.json > env > config | 页面保存即写 settings.json，会覆盖 env；如被 env 固定可移除 env 后重启 |

## 7. 相关文档

- HTTP API 契约：`PLAN.md` §4；工具参数：`docs/tool-reference.md`；模型能力矩阵：`docs/models-ui-matrix.md`；测试环境：`docs/test-plan.md` §5。
