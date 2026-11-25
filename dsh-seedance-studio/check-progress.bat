@echo off
chcp 936 >nul
setlocal enabledelayedexpansion
title Seedance 前端统一 · 工作进度
cd /d "%~dp0.."

echo ============================================
echo   Seedance 前端统一 · 工作进度（Lead / Codex）
echo ============================================
echo.

set "NODE_EXE="
for %%R in ("%LOCALAPPDATA%\Programs\DeepSeek Harness" "D:\DeepSeek" "C:\DeepSeek") do (
  if exist "%%~R\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%%~R\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
  if exist "%%~R\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" exit /b 0
)
for %%P in (node.exe) do if not "%%~$PATH:P"=="" set "NODE_EXE=%%~$PATH:P"
if not defined NODE_EXE (
  echo [错误] 没有找到 Node.js 运行时。
  pause
  exit /b 1
)

chcp 65001 >nul
"%NODE_EXE%" "%~dp0..\scripts\show-progress.mjs"
chcp 936 >nul
echo.
pause
