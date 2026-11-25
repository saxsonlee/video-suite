@echo off
chcp 936 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Seedance 终端版

echo ============================================
echo   Seedance 终端版（CLI）
echo ============================================
echo.
echo 进入后按菜单操作；退出终端版回到这里。
echo.

set "NODE_EXE="
call :find_node
if not defined NODE_EXE (
  echo.
  echo [错误] 没有找到可用的 Node.js 运行时（需要 18 或更高版本）。
  echo.
  echo   独立网页版/终端版不需要 DeepSeek Harness，但需要 Node.js：
  echo     1. 打开 https://nodejs.org/ 下载 LTS 版，一路“下一步”安装；
  echo     2. 安装完重新双击本脚本即可（脚本会自动使用系统里的 Node.js）。
  echo   如果电脑上已经装了 DeepSeek Harness 桌面版，也会自动使用它自带的运行时。
  if defined OLD_NODE echo.
  if defined OLD_NODE echo   提示：系统 PATH 里的 Node.js 版本太旧：!OLD_NODE!，请升级到 18 或更高。
  echo.
  pause
  exit /b 1
)

echo 运行时：!NODE_EXE!
chcp 65001 >nul
"%NODE_EXE%" "%~dp0platforms\cli\bin.js"

chcp 936 >nul
echo.
pause
exit /b 0

:find_node
REM 1) 优先用系统 PATH 里的 Node.js（独立部署/没装 DSH 也能用）
set "NODE_EXE="
set "NODE_MAJOR="
for %%P in (node.exe) do if not "%%~$PATH:P"=="" set "NODE_EXE=%%~$PATH:P"
call :read_node_major
if defined NODE_OK exit /b 0
REM PATH 里的版本太旧：记下来，继续找 DSH 自带运行时（找不到时报警用）
if defined NODE_MAJOR set "OLD_NODE=!NODE_EXE! (v!NODE_MAJOR!)"
set "NODE_EXE="
set "NODE_MAJOR="
REM 2) 再找 DeepSeek Harness 自带的 Node.js 运行时
for %%R in ("%LOCALAPPDATA%\Programs\DeepSeek Harness" "D:\DeepSeek" "C:\DeepSeek") do (
  if exist "%%~R\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%%~R\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
  if exist "%%~R\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" goto :found_in_dsh
)
if exist "%ProgramFiles%\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%ProgramFiles%\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
if exist "%ProgramFiles(x86)%\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\DeepSeek Harness\resources\runtime\primary-runtime\dependencies\node\bin\node.exe"
:found_in_dsh
call :read_node_major
exit /b 0

:read_node_major
REM 读 node 主版本号；NODE_OK=1 表示 >=18
set "NODE_OK="
set "NODE_MAJOR="
if not defined NODE_EXE exit /b 0
for /f "tokens=1 delims=." %%A in ('"%NODE_EXE%" --version 2^>nul') do set "NODE_MAJOR=%%A"
set "NODE_MAJOR=!NODE_MAJOR:v=!"
if not defined NODE_MAJOR exit /b 0
if !NODE_MAJOR! GEQ 18 set "NODE_OK=1"
exit /b 0
