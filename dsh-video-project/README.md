# dsh-video-project（视频项目 · 编导工作台）

> 更新记录见 [CHANGELOG.md](CHANGELOG.md)；本 README 只放功能与用法。

独立 DSH 插件：负责视频创作的**前后两端**——

- **生成前**：把不完整的用户需求补全成「角色卡 + 分镜脚本」，组装生成提示词；
- **生成后**：用 ffmpeg 抽帧分析画面与需求的出入，给出改进建议，并按镜头管理多版本与全片。

本插件**不调用视频模型、不依赖任何视频生成插件**。视频生成交给会话中可用的生成工具（例如环境里还装了 `dsh-seedance-studio` 时，由它的 `seedance_video` 生成）。

## 三种安装组合都能用

| 装了什么 | 能做什么 |
|---|---|
| 只装本插件 | 需求补全 → 人物卡/分镜 → 分析任意本地视频（没有生成能力） |
| 只装视频生成插件 | 直接生成视频（不需要本插件） |
| 两个都装 | 完整闭环：补全 → 分镜 → 生成 → 分析 → 改分镜 → 再生成 |

两个插件没有代码依赖、互相不点名，由智能体根据会话里实际可用的工具来编排。

## 能力

### 1. `guide` 需求补全（表格）

用户往往只有一句话需求。`action=guide payload={"request":"用户原话"}` 返回一张表：

- 用户已给的（时长/比例/风格/角色/场景/光线…）→ 直接填入；
- 没给的 → 给**建议默认值**（可直接采用）；
- 缺关键信息（如角色外观）→ 标为缺失。

智能体把表格展示给用户逐项确认/修改，再写人物卡和分镜。**不要求用户自己想全需求。**

### 2. 人物卡（基础身份 identity + 形象变体 looks + 三视图 views）

一个人物分两层写，解决「每幕出场不同、同一人物随剧情换形象」：

**① 基础身份 `identity`（全片恒定，不能变——观众靠这些认出是同一人）**

| 栏位 | 字段 | 要点 |
|---|---|---|
| 年龄 | `identity.age` | 成人/少年/老人…，可写具体岁数 |
| 长相 | `identity.face` | 脸型/五官/肤色（换装、受伤都不变） |
| 发型根基 | `identity.hairBase` | 发长/发色根基（具体造型放 look） |
| 体型 | `identity.body` | 高矮胖瘦/比例 |
| 标志性特征 | `identity.signature` | 疤痕/纹身/耳饰/道具，辨认角色的关键 |

**② 形象变体 `looks[]`（可多套，随剧情换装/受伤/伪装）**

| 字段 | 要点 |
|---|---|
| `id` / `name` | 如 `dock`「码头工人装」、`hurt`「受伤后」 |
| `hair` / `costume` | 本套形象的发型/服装（覆盖基础发型根基） |
| `description` | 本套形象整体描述 |
| `views.front/side/back` | **三视图**：正面/侧面/背面（同一套形象的三视图，跨镜头一致） |
| `referenceImages` | 可选：人物参考图本地绝对路径（照片/生成的三视图） |

保存时自查：三视图不完整、缺少形象变体会给 `warnings`（提示补全，不硬拦）。
兼容旧格式：只传 `appearance` 整段描述 / 旧字段（age/face/hair/costume/body/signature）也能用——会自动转成「默认形象」。

### 2.5 区域设定（世界地图）与幕（Act）

**区域 `areas[]`（项目级，设定集）**：一个区域只定义一次，多幕/多镜头引用，保证空间/标志物/光线连贯：

| 字段 | 要点 |
|---|---|
| `id` / `name` | 如 `dock`「码头」 |
| `description` | 地点与氛围（黄昏海港、木栈道…） |
| `layout` | **空间布局**：入口/中心/标志物位置关系（镜头方向与连贯性靠它） |
| `landmarks` | 标志物列表（系船柱、锈铁锚…，同一区域的镜头要认得出来） |
| `lighting` | 区域光线/色调 |
| `props` | 贯穿道具（铜哨、渔网…） |
| `mapPath` | 可选：区域地图草图（俯视线稿）路径 |

**幕 `acts[]`（叙事单位）**：一幕 = 一个情绪段落 + 本幕出场人物 + 所在区域 + 报幕 + 分镜组：

| 字段 | 要点 |
|---|---|
| `id` / `name` | 如 `act1`「第一幕·归港」 |
| `purpose` / `mood` | 本幕目的、情绪基调 |
| `areaId` | 本幕所在区域（引用 areas 的 id） |
| `cast` | **本幕出场人物**：`[{name, lookId}]`（只列本幕出场的；同一人物不同幕可引用不同 look） |
| `titleCard` | 报幕：`{text, style}`（幕标题卡文字/样式） |

**规则**：每幕只注入本幕出场人物（不出场的不写进提示词）；同一人物换形象 = 引用不同 look（脸/体型/身份不变）；同一区域所有镜头空间/标志物/光源一致。

### 3. 分镜（7 栏表，含环境）

先有文字脚本（说什么），再拆分镜（怎么拍）。分镜每个镜头按 7 栏写：

| 栏位 | 字段 | 要点 |
|---|---|---|
| 镜号 | `id` | Shot1、Shot2…（拍和剪时好对号） |
| 景别 | `shotType` | 远景/全景/中景/近景/特写；相邻镜头要远近交替，别整条同一景别 |
| 画面内容 | `action` | 一句话写清拍什么、人在干嘛（动作细节/表情/关键道具/环境/构图） |
| 台词/字幕 | `dialogue` / `subtitle` | 台词按镜头拆开；屏幕字幕单独写 |
| 运镜/机位 | `movement` / `camera` | 固定/推/拉/摇/移/跟拍（大白话）；新手优先固定 |
| 时长 | `duration` | 先估每镜 3~8 秒，全片总时长加一遍（建议 ≤60 秒） |
| 环境 | `environment` | **时间 + 天气/氛围 + 光线 + 色彩基调**（如「黄昏，雨后街道，霓虹灯冷蓝+暖粉，湿路面反光」）；全片必须统一，否则生成后黄昏会变夜晚 |

补充字段：`scene`（场景）、`lighting`（光线/色调）、`transition`（转场）、`sound`（音效/音乐）、`characters`（出场角色，兼容旧字段）、`notes`（备注）。

**归属字段（多幕结构）**：`actId`（归属幕）、`areaId`（所在区域，缺省用幕的区域）、`cast`（镜头级出场人物 `[{name,lookId}]`，覆盖幕级 cast）、`kind`（`shot` 普通镜头 / `title` 报幕镜头 / `transition` 转场镜头）。

**环境一致性（重要）**：`environment` 是每镜必写栏位——生成提示词会注入「全片环境 + 本镜环境」并加硬约束「不得从黄昏变成夜晚、不得改变霓虹灯/路灯等光源」。项目级另写 `sceneMap.environment`（全片环境设定），所有镜头共用；镜头级没写时回退用 `scene + lighting`（兼容旧分镜）。保存时自查：缺环境、相邻镜头时间冲突（黄昏 vs 夜晚）、全片无环境都会给出 warnings。

**延伸栏位（防跳轴 / 省成本）**：

| 栏位 | 字段 | 要点 |
|---|---|---|
| 节拍 | `beat` | 剧本里某件事改变的时刻，编号分组（1、2、3…） |
| 镜头任务 | `purpose` | 一句话写「观众从这个镜头学到/看到什么」；两个镜头任务重复就删一个 |
| 画面方向 | `screenDirection` | 左→右 / 右→左 / 朝向镜头 / 背对镜头 / 静止；相邻镜头方向变化检查 180 度法则 |
| 视线 | `eyeline` | 人物看向画面左/右/镜头；下一镜要接上 |
| 风险 | `risk` | `high` = 最难/最不确定的镜头，先单独测试它，再批量做其他镜头 |

**场景地图（sceneMap）**：项目级，从上方写地点/物件/人物站位/相机位/视线/画面方向 + `environment`（全片环境：时间/天气/光线/色彩基调）（`save-shots` payload 里传）。AI 不会记住场景，地图是检查镜头 4 是否还和镜头 1 匹配的唯一依据。

**保存后自动自查（`warnings`）**：

- 相邻镜头景别相同 → 提示错开；
- 一个镜头塞多个动作 → 提示拆镜头；
- 台词过长 / 有台词但画面为空 → 提示按镜头拆；
- 缺少空镜/环境镜头 → 提示补一个交代环境的镜头；
- 缺环境描写 / 相邻镜头时间是「黄昏 vs 夜晚」等冲突 / 全片没有环境设定 → 提示统一环境；
- 全片总时长超 60 秒 → 提示先删减；
- 缺少景别/运镜/时长/画面内容 → 逐项提示；
- 缺少镜头任务 / 两个镜头任务重复 → 提示补任务或删/合并镜头；
- 相邻镜头画面方向相反（左→右 vs 右→左）→ 提示检查跳轴（180 度法则）；
- 有镜头标记 `risk: high` → 提示先单独测试高风险镜头，再批量生成；
- 分镜没有归属幕（项目有 acts 时）→ 提示写 `actId`；
- 分镜引用的幕/区域不存在、出场人物不在人物卡、形象 lookId 不存在 → 提示先保存对应设定；
- 人物三视图不完整 / 缺少形象变体 → 提示补全（跨镜头人物更稳）。

`build-prompt` 时也会把全片级自查问题并入 `checks`。分镜改动随时记录（`shot-change`）。

### 4. `build-prompt` 生成提示词

把「设定集（人物/区域/风格）+ 本幕 + 分镜 + 项目基线（model/resolution/ratio/seed/styleCard）」组装成提示词与参数，并返回输入检查（缺什么先补）。注入规则：

- **本幕**：幕标题/目的/情绪/报幕文案；
- **区域**：所在区域的空间布局/标志物/光线/贯穿道具 + 硬约束「同一区域空间关系/标志物/光源不得改变」；
- **人物**：只注入本幕出场人物（`cast`）的「基础身份 + 当前形象 look + 三视图」+ 硬约束「脸/体型/身份不变，只允许按本幕形象改服装/状态」；
- **环境**：全片环境 + 本镜环境 + 环境一致性硬约束。

若用户在设置里开启了「草图作参考图」且该镜头已有草图，返回结果额外带 `referenceImage`（草图本地绝对路径），生成时作为生成工具的 reference 参考图参数传入；未开启则不带。

保存新人物卡/区域/幕/分镜都会把「用户已确认」状态重置，需要重新 `confirm-plan`。

### 5. `analyze` 生成后分析（抽帧 + 对比）

1. `action=analyze project=<名> shot=<Shot1> payload={"videoPath":"<本地视频>"}`
   → 用 ffmpeg 均匀抽帧到 `Video/<Shot>/review-frames/`，返回帧图片路径 + 检查清单（从人物卡/分镜生成）；
2. 智能体逐帧看图，把每项结论回填：
   `payload={"observed":[{"key":"character:阿澈","pass":false,"note":"第3帧是黑色短发"}]}`
   → 返回差异清单（严重/一般/轻微）、改进建议、修订后的分镜草稿，并写入 review 记录。

### 6. 验收（7 栏逐项打勾，含环境）

生成后不只看「像不像」，按 7 栏逐项验收：

1. `action=review project=<名> shot=<Shot1>`（不带 checks）→ 返回验收表（景别/机位、画面内容、台词/字幕、运镜、时长、人物卡一致性、**环境/时间**、衔接，每项带「对照值」；人物一致性按「本幕出场人物 + 当前形象 look/三视图」对照，环境按「本镜环境 + 所在区域设定」对照）；
2. 逐栏看视频打勾：`payload={"version":"V0.1","checks":[{"key":"shotType","pass":true},{"key":"action","pass":false,"note":"没有奔跑"}]}` → 全部通过才 `passed=true`，不通过的栏自动写进 issues；
3. 通过后再 `save-version` 锁定版本；不通过按 issues 改分镜/换参数重生成。

兼容旧式：只传 `{"pass":true,"issues":[...]}` 也可以（不逐栏）。

### 6.5 调整策略（同一镜头怎么改）

验收/分析不通过时，先判断用哪种方式调整，方案确认后再动手：

| 策略 | 字段值 | 适用 | 成本 |
|---|---|---|---|
| 局部改 | `local-edit` | 只有局部问题（台词/字幕/时长/光线/小物件），且当前模型支持编辑视频 | 较低 |
| 整条重做 | `regenerate` | 角色/构图/运镜/景别/衔接等核心栏不通过 | 最高 |
| 保留前段 | `keep-frames` | 前段已认可、问题集中在后半段，从某秒之后重新生成 | 中等 |

- `review` 提交 checks 后自动返回 `strategy`（type / keepUntil / reason）；`analyze` 报告也会返回；
- 保留时间点：优先用用户对话里说的「前 X 秒」，否则按抽帧命中的问题帧估算；
- `save-version` 时把 `strategy` 一起传，版本 `meta.json` 会记下这一版是哪种方式来的；
- **编辑视频能力怎么判断**（两条路径，互不依赖）：
  1. 生成插件（如 dsh-seedance-studio）探测模型列表，把结果写入共享能力文件 `~/.dsh/video-capabilities.json`；
  2. 本插件固定配置优先：环境变量 `VIDEO_EDIT_CAPABLE=true|false`，或 `~/.dsh/video-project/config.json` 的 `videoEditCapable`；
  3. 都读不到 → 按「不支持」，不会误用局部改。

### 7. 版本与全片

- `save-version`：生成结果归档为 `Video/<Shot>/V0.1/video.mp4`（重复生成自动 V0.2…）；
- `review`：验收记录（通过/不通过 + 问题清单）；
- `full-video`：保存全片到 `Video/FullVideo/`。

### 7.5 确认流程（硬性，由插件代码强制）

「用户已确认分镜/人物卡」不是靠模型自觉，而是插件里保存的状态，未确认时相关动作直接拒绝执行：

1. `save-shots` / `save-characters` 每次保存都会把确认状态**重置为未确认**（内容变了，旧确认作废）；
2. 把分镜/人物卡展示给用户，用户明确确认后调用 `action=confirm-plan project=<名>` 记录确认；
3. **未确认时** `build-prompt` 和 `sketch` 直接返回 `PLAN_NOT_CONFIRMED`（拒绝执行，不是提醒）——先确认再出提示词/画草图；
4. 再次修改分镜/人物卡 → 自动回到未确认，必须重新确认；
5. 画草图另有**费用确认闸门**（见下），两道闸门都过才执行。

### 8. `sketch` 草图分镜（单镜头确认，可选，默认关闭）

分镜定稿后、生成视频前，如果用户对某个镜头的**相机位置/景别**拿不准（用户不会画画时很常见），只为这一个镜头画一张**黑白铅笔线稿草图**给用户确认——不整片批量画。草图默认只用于确认构图、**不参与视频生成**；如果你在设置面板开启「把分镜草图作为生成参考图」，出提示词时（`build-prompt`）会额外返回该镜头草图路径 `referenceImage`，生成时由智能体把它作为 **reference 参考图**传给生成工具（两个插件仍独立：本插件只返回本地绝对路径，不调用任何生成插件）。

**默认关闭，并且不自动替你选模型**：必须在设置面板里手动「启用草图分镜」并「选择图像模型」；没启用或没选模型时，工具返回 `IMAGE_GEN_UNAVAILABLE` 或 `IMAGE_GEN_UNCONFIGURED`，不会自行改画。

#### 接口优先：生成分镜内容用现成接口（兜底：拦截脚本画图）

**告诉智能体接口就够**：工具的说明开头直接列出「生成分镜内容的现成接口」——分镜文字用 `save-shots`、分镜草图用 `sketch`、提示词用 `build-prompt`、验收分析用 `review/analyze`，调用即生成，不需要自己写代码。智能体按说明调用即可，不会去写脚本画图。

兜底闸门（防模型不按说明走）：分镜草图只能由本插件调用**用户在设置里选定的图像模型**生成。若智能体仍尝试写 Python/JS 脚本（PIL、matplotlib、canvas 等）画分镜图，`tools/pre-execute` 闸门会**直接拒绝执行**并提示正确做法（先 `save-shots` + `confirm-plan`，用户同意后用 `action=sketch`）：

- 纯文字分镜表、Markdown、普通 HTML 排版**不受影响**（只要不调用绘图库画图）；
- 可通过环境变量 `DSH_VIDEO_PROJECT_BLOCK_SCRIPT_DRAW=0` 或插件配置 `blockScriptDrawing: false` 关闭（默认开启）。

#### 设置面板（侧边栏「视频项目」→ 草图分镜设置）

- 开关：启用/关闭草图分镜；
- 开关：把分镜草图作为生成参考图（默认关闭；开启后 build-prompt 返回 referenceImage 草图绝对路径，生成时作 reference 参考图）；
- 图像模型：从候选清单下拉选择（不会自动替你选）；
- 「刷新候选模型」：读取中转站 `/v1/models` 并只列出图像生成模型（只读，不产生费用；打开面板时也会自动拉一次）；
- 接口配置：中转站地址、API Key（默认复用 dsh-seedance-studio 的设置；Key 保存后界面不显示明文）；
- 保存后立即生效（重启桌面应用也会保留）。

也可以直接编辑 `~/.dsh/video-project/config.json`：

```json
{ "sketchAsReference": false, "imageGen": { "enabled": true, "model": "gpt-image-2.5", "baseUrl": "https://...", "apiKey": "..." } }
```

#### 画草图的流程

**输入只用已保存的分镜脚本**：草图提示词只由「分镜 7 栏字段（含环境）+ 人物卡外观 + 项目风格」拼接，**不接受调用方附加的自由文本**（防止智能体临时加内容/改画面）——想改画面就改分镜（`save-shots`）后重新确认再画。

**按分镜 id 每个镜头一张图**（不把多个镜头画进一张图）：

0. **分镜必须先经用户确认**（`action=confirm-plan`），否则 `sketch` 返回 `PLAN_NOT_CONFIRMED`；
1. 智能体先问用户「要不要画草图」（画图按次计费，必须先得到同意）——插件有**硬闸门**：最后一条用户消息没有明确同意/主动要求画图时，`sketch` 会被直接拦截（返回错误，不是提醒）；
2. `action=sketch project=<名> shot=<Shot3>` → 只画 Shot3 这一张（存 `Storyboards/Shot3-<标签>.png`（如 `Shot3-特写.png`））；
   `action=sketch project=<名>`（不传 shot）→ 按分镜顺序给**每个镜头各画一张**（每镜头一次请求、各自一个文件）；
3. 工具返回 `images`（每张的镜头 id + 本地路径）；智能体把图片逐张展示给用户；
4. 用户说可以 → 用这版分镜生成视频；说哪里不对 → 改分镜（`save-shots`）→ 用户确认（`confirm-plan`）→ 重画对应镜头；
5. 没启用/没选模型时工具返回明确提示，引导用户去设置面板，不自行画图。

**输出尺寸跟随项目声明**：草图尺寸不是写死的，按 `baseline` 声明的 `resolution` + `ratio` 算视频尺寸（如 9:16 + 720p → 720x1280；16:9 + 1080p → 1920x1080）；只有 gpt-image / dall-e 系列只支持固定尺寸，才按比例就近映射（竖 1024x1536 / 横 1536x1024 / 方 1024x1024）。

#### 设置来源与优先级

设置项（enabled/model/baseUrl/apiKey）读取优先级：

1. 环境变量（进阶）：`VIDEO_IMAGE_CAPABLE=1` + `VIDEO_IMAGE_MODEL` + 可选 `VIDEO_IMAGE_BASE_URL` / `VIDEO_IMAGE_API_KEY`；
2. `~/.dsh/video-project/config.json` 的 `imageGen`（设置面板写入的就是这里）；
3. 接口地址/Key 缺省时回退：共享能力文件 `~/.dsh/video-capabilities.json` 的 `imageGeneration.baseUrl`（由生成插件探测写入，只读）+ 已安装的 dsh-seedance-studio 的中转站设置。

> 生成插件启动时**不会**自动探测图像模型；候选模型只在你打开面板/点「刷新候选模型」时由 video-project 主动读取，且不会自动启用、不会自动选模型。

#### 设置接口（面板使用，也可脚本调用）

插件注册了三条路由：`GET /api/video-project/settings`、`POST /api/video-project/settings`、`GET /api/video-project/models`（读取中转站图像模型候选）。

## 独立性与协作（重要）

两个插件（视频项目 / 视频创作）**互相独立、可单独安装使用**：没有代码依赖、没有互相 import。

当「视频项目」已安装时，它会让视频生成**优先走编导流程**（这也是为什么装了它以后生成更规范）：
- 判定依据是**项目状态**（存储里存在「已确认（confirm-plan）」的项目就放行；没有已确认项目才会拦截并提示先建项目/人物卡/分镜）。这样即使工具调用经由 run_code 内层执行、没记入会话事件，也不会误判；
- 用户明确说「跳过项目 / 直接生成 / 不用项目」时放行；
- 关闭该行为：设置环境变量 `DSH_VIDEO_PROJECT_REQUIRE_PLAN=0`（或插件 config `requirePlan: false`）；
- 只装视频创作插件（不装本插件）时，生成完全不受影响。

### 人物三视图出图（可选，按次计费）

三视图 `views` 是**文字描述**；需要图片参考时：

1. **自动出图（勾选后默认出图）**：设置页勾选「人物三视图自动出图」→ 之后保存人物卡（save-characters）会默认用图像模型生成三视图图片（正/侧/背并排一张，写入该形象的 `referenceImages`；失败只给 warning，不影响保存）。勾选即授权按次计费。
2. **手动出图**：`action=character-sheet payload={"charName":"阿海","lookId":"dock"}`（需用户确认费用；图像模型由设置面板选择）。
3. 图片保存在项目 `Look/<人物>/` 目录；面板可预览（DSH 面板），Codex 面板显示路径。
4. 前提：设置里启用图像生成并选择模型（或由 dsh-seedance-studio 提供中转站地址/Key）；没有可用能力时自动出图只给 warning。

### 区域/场地设定图（可选，按次计费）

1. **自动出图（勾选后默认出图）**：设置页勾选「区域/场地自动出图」→ 之后保存区域设定（save-areas）会默认生成场地设定图（一张场景概念图：空间布局/标志物/光线/贯穿道具），写入该区域的 `mapPath`；失败只给 warning，不影响保存。勾选即授权按次计费。
2. **手动出图**：`action=area-sheet payload={"areaId":"dock"}`（需用户确认费用；图像模型由设置面板选择）。
3. 图片保存在项目 `Area/<区域>/` 目录；面板详情可预览。

## 面板（项目列表 / 内容查看 / 设置）

插件主面板是**共享 SPA**（原生前端，源在 `platforms/web/public/index.html`），通过插件路由 `GET /api/video-project/panel` 提供，DSH 面板用 iframe 承载：

- **侧边栏「视频项目」→ 主面板**：项目列表（人物/镜头/版本/全片/更新时间）→ 点开项目查看：
  - 概览：风格、保存位置、确认状态、固定参数、全片环境、内容统计；
  - 设定集：人物卡（基础身份 + 形象变体 + 三视图）、区域设定（布局/标志物/光线/道具）；
  - 幕：每幕目的/情绪/区域/出场人物/报幕 + 本幕分镜数；
  - 分镜：按幕分组展示 7 栏（含环境/出场人物）；
  - 视频：每镜头版本数与最近验收、全片状态。
- **设置界面 → 视频项目**：草图分镜开关/图像模型/接口配置（与主面板同一 SPA 的 `?view=settings` 视图）。
- **面板可直接编辑**（保存后自动刷新生效）：
  - 概览：风格、创作参数（画面比例/风格卡；模型/分辨率/种子由生成工具端决定）、全片环境、场景地图；
  - 设定集：人物卡（基础身份 + 每个形象变体 + 三视图 + 参考图）、区域（可添加/编辑）；
  - 幕：标题/目的/情绪/区域/出场人物（名字:形象id）/报幕（可添加/编辑）；
  - 分镜：每个镜头的幕/区域/景别/机位/运镜/时长/环境/画面/台词/字幕/音效/转场/出场人物；
  - 保存会重置「已确认」状态——改完需要让智能体重新 `confirm-plan` 才能出提示词。
- 也可以在会话里让智能体用 `video_project` 工具批量编辑（save-characters / save-areas / save-acts / save-shots）。

## 落盘结构

```
<保存位置>/projects/<VideoName>/
├── Charactor/<角色>.json            人物卡（identity 基础身份 + looks 形象变体/三视图）
├── Shots/mainShots.json             设定集（areas 区域 + acts 幕）+ 分镜脚本（actId/areaId/cast）+ 项目基线
├── Shots/changeInfo.jsonl           修改记录（人物/区域/幕/分镜/确认）
├── Storyboards/<ShotN>-<标签>.png 单镜头草图（确认机位/景别用；开启「草图作参考图」后可作 reference 参考图）
└── Video/
    ├── Shot1/
    │   ├── V0.1/video.mp4           该版本视频
    │   ├── V0.1/meta.json           提示词/模型/参数/任务 id
    │   ├── review-frames/           分析用抽帧
    │   ├── review.jsonl             验收/分析记录
    │   └── ChangeInfo.jsonl
    ├── Shot2/
    └── FullVideo/video.mp4 + meta.json
```

## 保存位置（本插件自己管理）

- 默认：`<DSH_HOME>/storages/video-project/projects`；
- 查看/修改：`action=location`（修改示例 `payload={"storageRoot":"D:\\我的视频项目"}`），改后**重启桌面应用**生效；
- 旧项目不会自动迁移：需要时把旧 `projects` 文件夹整体移到新位置；
- 优先级：插件配置 `config.storageRoot`（profile 的 `cordis.patch.yml`）> 设置文件 `<默认存储目录>/settings.json` > 默认目录。

## ffmpeg（分析抽帧用）

查找顺序：环境变量 `VIDEO_PROJECT_FFMPEG` / `FFMPEG_PATH` → `vendor/ffmpeg/ffmpeg(.exe)` → 系统 PATH。

没有 ffmpeg 时二选一：

1. 运行 `node scripts/fetch-ffmpeg.mjs`（默认下载 release essentials，约 110MB；`--url` 可指定固定版本直链）；
2. 分发包直接带上 `vendor/ffmpeg/ffmpeg(.exe)`（不必最新版，稳定可用即可）。

## 工具

工具名 `video_project`，action：

`create | list | get | delete | guide | save-characters | save-areas | save-acts | save-shots | shot-change | build-prompt | sketch | save-version | review | analyze | full-video | location`

参数：`project`、`shot`、`payload`（JSON 字符串）、`sourcePath`、`taskId`、`detail`。

`save-characters` payload 示例：`{"characters":[{"name":"阿海","identity":{"face":"国字脸、左眉疤"},"looks":[{"id":"dock","name":"码头工人装","costume":"灰蓝渔夫外套","views":{"front":"…","side":"…","back":"…"}}]}]}`。

`save-areas` payload 示例：`{"areas":[{"id":"dock","name":"码头","description":"黄昏海港","layout":"入口在南、栈道向北","landmarks":["系船柱"],"lighting":"黄昏暖橙侧光","props":["铜哨"]}]}`。

`save-acts` payload 示例：`{"acts":[{"id":"act1","name":"第一幕·归港","purpose":"阿海回港","mood":"克制","areaId":"dock","cast":[{"name":"阿海","lookId":"dock"}],"titleCard":{"text":"第一幕 归港"}}]}`。

`save-shots` 镜头可带 `actId/areaId/cast/kind`；不传 areas/acts 时保留项目已有设定。

`sketch` 的 payload：`{"note":"用户对画面的补充要求（可选）","model":"图像模型（可选，默认自动选）"}`。

## 安装（独立，不依赖其他插件仓库）

```powershell
# dry-run（只打印计划）
node scripts/install-bundle.mjs --profile <profile> --package .

# 实际安装（可 --rollback 回滚）
node scripts/install-bundle.mjs --profile <profile> --package . --apply
```

安装后重启桌面应用，会话中即可看到 `video_project` 工具。

## 测试

```powershell
node --test "test/*.test.mjs"
```

> 说明：analyze 的抽帧测试需要本地有 ffmpeg（或设置 VIDEO_PROJECT_FFMPEG），没有时该用例自动跳过。
