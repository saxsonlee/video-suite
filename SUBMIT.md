# 提交说明（Git）

本目录已按「可公开提交」整理：只含源码、测试、文档、脚本与演示资源，敏感与本机相关内容已剔除。

## 已剔除 / 忽略

| 类型 | 处理 |
|---|---|
| API Key、中转站 Key | 工程内无真实密钥（只有测试用假值 `sk-test` / `ark-test-key-123` 等）；本地 `settings.json` / `.env` 永不提交 |
| 私有中转站域名 | 已替换为 `https://relay.example.com` |
| 本机用户名路径 | `C:\Users\<用户名>\.dsh` → `%USERPROFILE%\.dsh`；DSH 安装路径 → 「DSH 安装目录」 |
| 用户项目名 / 生成素材 | 示例改为中性文案；生成的视频/图片不提交 |
| 依赖与产物 | `node_modules/`、`dist/`、`*.zip` |
| 大二进制 | `vendor/ffmpeg/*.exe`（约 100MB，运行前按需下载） |
| 日志/临时 | `*.log`、`*.bak`、`*.tmp`、`*.part` |


## ⚠️ 大文件检查（提交前必看）

GitHub 单文件上限 **100MB**。本工程里有几个「运行需要但不该提交」的大文件，已被 `.gitignore` 排除：

| 文件 | 大小 | 说明 |
|---|---|---|
| `dsh-video-project/vendor/ffmpeg/ffmpeg.exe` | 100.5MB | 抽帧/探测用，按需下载 |
| `dsh-seedance-studio/platforms/codex-plugin/node_modules/` | 51MB | Codex 依赖，`pnpm i` 还原 |

提交前自检（应只剩源码，总大小约 3.4MB）：

```bash
git ls-files -s | awk '{print $4}' | while read f; do du -k "$f"; done | sort -rn | head -5
```

```powershell
git ls-files | Get-Item | Sort-Object Length -Descending |
  Select-Object -First 5 Name, @{n='MB';e={[math]::Round($_.Length/1MB,2)}}
```

## 已经误提交了大文件？这样修

```bash
cd dsh-video-suite
# 1) 确认 .gitignore 已含：**/vendor/ffmpeg/*.exe 与 *.exe
git rm --cached dsh-video-project/vendor/ffmpeg/ffmpeg.exe
git add -A
git commit --amend -m "first commit"     # 只有一个 commit，amend 即可
git gc --prune=now                       # 清掉那 40MB 压缩对象
git ls-files -s | grep -i ffmpeg         # 应无输出
git push -u origin main
```

历史里已经 push 成功过时需重写并强制推送（`git push -f`），或在 GitHub 上删库重建。

## 首次提交

```powershell
cd dsh-video-suite
git init
git add .
git status          # 提交前再看一眼文件清单
git commit -m "chore: initial import of dsh-seedance-studio and dsh-video-project"
```

建议先 `git status` 确认没有意外文件；提交前可再跑一次敏感词自检：

```powershell
git grep -nE "zxzt123|sk-[A-Za-z0-9]{20,}|Users\\Administrator"
```

## 提交后

- 需要 `vendor/ffmpeg/ffmpeg.exe` 时：运行 `dsh-video-project/scripts/fetch-ffmpeg.mjs`（或自行放置），它不会进入版本库。
- 需要打包发布：`dsh-seedance-studio/scripts/pack.mjs`（生成 `dist/`，也不进入版本库）。
