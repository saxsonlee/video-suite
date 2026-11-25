@echo off
chcp 936 >nul
setlocal
cd /d "%~dp0"
title 视频项目 · 环境检查

set "NODE="
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE where node >nul 2>nul && set "NODE=node"
if not defined NODE (
  for %%R in ("%LOCALAPPDATA%\Programs\DeepSeek Harness" "%ProgramFiles%\DeepSeek Harness" "D:\DeepSeek" "C:\DeepSeek") do (
    if not defined NODE if exist "%%~R\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" set "NODE=%%~R\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
  )
)
if not defined NODE (
  echo [错误] 未找到 Node.js。请安装 Node.js 18+，或先安装 DeepSeek Harness。
  echo.
  pause
  exit /b 1
)

"%NODE%" scripts\check-env.mjs %*

echo.
pause
