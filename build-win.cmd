@echo off
setlocal
cd /d "%~dp0"

echo 正在停止可能占用编译文件的 Node 进程...
taskkill /F /IM node.exe >nul 2>&1

echo 正在构建 Windows 可执行程序...
call npm run build:win
set BUILD_ERRORLEVEL=%ERRORLEVEL%

if %BUILD_ERRORLEVEL% neq 0 (
  echo 构建失败，请关闭占用项目的程序后重试。
  exit /b %BUILD_ERRORLEVEL%
)

echo 构建完成，可执行文件位于：
echo %~dp0dist\Static HTML Host.exe
exit /b 0
