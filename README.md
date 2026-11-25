# DSH 视频套件（dsh-video-suite）

两个互相独立、可分别安装的 DeepSeek Harness 插件：

| 目录 | 插件 | 作用 |
|---|---|---|
| `dsh-seedance-studio/` | `dsh-seedance-studio` | **视频创作台**：文生视频 / 图生视频 / 首尾帧 / 全模态参考 / 编辑 / 延长；支持 Seedance（方舟 + 中转站）与 MiniMax H3；按会话保存历史、再创作、尾帧分析 |
| `dsh-video-project/` | `dsh-video-project` | **视频项目 · 编导工作台**：需求引导 → 人物卡 → 区域/幕 → 分镜 → 草图 → 生成提示词 → 生成后验收 → 版本/采用/全片管理 |

两者没有代码依赖，可单独安装；同时安装即形成「策划 → 生成 → 验收 → 迭代」的完整流程。协作只通过文件路径与共享能力文件，不做跨包 import。

## 环境要求

- DeepSeek Harness 桌面版（插件通过 profile 的 `link:` 依赖加载）
- Node.js 18.18+（DSH 自带运行时即可；`node --test` 需要 Node 18+）
- 可选：ffmpeg（`dsh-video-project` 的抽帧分析/视频时长与尺寸探测）；缺失时相关功能自动降级

## 安装（开发态 link）

在 DSH profile 目录（`%USERPROFILE%\.dsh\profiles\<profile>`）的 `package.json` 中加依赖：

```json
{
  "dependencies": {
    "dsh-seedance-studio": "link:<本仓库绝对路径>\\dsh-seedance-studio",
    "dsh-video-project": "link:<本仓库绝对路径>\\dsh-video-project"
  },
  "dsh": {
    "profile": {
      "bundles": ["...", "dsh-seedance-studio", "dsh-video-project"]
    }
  }
}
```

然后安装依赖并重启 DSH。每个插件内也有 `scripts/install-bundle.mjs`（默认 dry-run，`--apply` 落盘）与 `--rollback` 回滚。

## 测试

```powershell
# 视频创作台（含 MiniMax 接入、模型目录、中转站协议、i18n 等）
cd dsh-seedance-studio
node --test "test/*.test.mjs"

# 编导工作台（项目/分镜/版本/验收/出图）
cd dsh-video-project
node --test "test/*.test.mjs"
```

## 测试不入库（本地保留）

按项目要求，`test/` 目录**不进版本库**（`dsh-seedance-studio/test`、`dsh-seedance-studio/platforms/codex-plugin/test`、`dsh-video-project/test`）。
测试文件仍在本地磁盘上，可随时执行：

```powershell
cd dsh-seedance-studio ; node --test "test/*.test.mjs"      # 157 项
cd dsh-video-project   ; node --test "test/*.test.mjs"      # 137 项
```

如果从远端克隆（没有测试文件），功能不受影响；需要回归测试时把这些目录单独拷回即可。

## 提交前检查

1. **别提交大文件**（GitHub 单文件上限 100MB）。本仓库里两个大件已被 `.gitignore` 排除：
   - `dsh-video-project/vendor/ffmpeg/ffmpeg.exe`（约 100MB，按需下载，见上文环境自检）
   - `dsh-seedance-studio/platforms/codex-plugin/node_modules/`（约 51MB，`pnpm install` 还原）

   ```powershell
   git ls-files | Get-Item | Sort-Object Length -Descending |
     Select-Object -First 5 Name, @{n='MB';e={[math]::Round($_.Length/1MB,2)}}
   ```

2. **别提交密钥与本机信息**：`settings.json` / `.env` 已在忽略列表；提交前可再扫一次：

   ```powershell
   git grep -nE "sk-[A-Za-z0-9]{20,}|Users\\Administrator|zxzt123"
   ```

3. 提交后确认总量应约 **3.4MB / 250 文件**（源码 + 演示媒体 + 文档）。

## 目录约定

- `dsh-seedance-studio/server/`：与平台无关的数据层（模型目录、API 客户端、任务、存储、设置）
- `dsh-seedance-studio/platforms/`：DSH 插件（`dsh-plugin`）、独立 Web（`web`）、终端（`cli`）、Codex 插件（`codex-plugin`）
- `dsh-seedance-studio/platforms/web/public/`：**唯一界面源码**（DSH / Web / Codex 共用同一份 SPA）
- `dsh-seedance-studio/platforms/web/public/locales/`：动态语言包（`zh/en/ru`；加语言=放一个 JSON + 在 `languages.json` 里登记）
- `dsh-video-project/server/`：项目、分镜、验收、版本、出图、分析与路由
- `dsh-video-project/platforms/web/public/`：项目面板 SPA（与创作台共用同一套组件与语言包风格）

## 不提交的内容

见 `.gitignore`：`node_modules/`、`dist/`（打包产物）、`vendor/ffmpeg/*.exe`（约 100MB，运行前按需下载）、本地 `settings.json` / `.env`（含密钥）、生成的视频与图片、日志与临时文件。

## 更新记录

各插件目录下的 `CHANGELOG.md`。
