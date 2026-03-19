@echo off
chcp 65001 >nul 2>nul
REM ================================================================
REM  独立 KOL 推送弹窗（不依赖 signal-sensor）
REM  直接启动 Electron 弹窗展示 KOL 信息
REM ================================================================

for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"
set "FRONTEND_DIR=%REPO_ROOT%\frontend"
set "POPUP_SCRIPT=%FRONTEND_DIR%\scripts\signal-popup.js"
set "KOL_DATA=%REPO_ROOT%\scripts\kol_push_data.json"

echo.
echo ==============================================
echo   KOL 推送弹窗（独立模式 - 场景二 Level 0 彩蛋）
echo ==============================================
echo.

REM Try Electron from node_modules
set "ELECTRON_BIN=%FRONTEND_DIR%\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_BIN%" (
    echo [INFO] 未找到本地 Electron，尝试使用 npx...
    set "ELECTRON_BIN=npx.cmd"
    set "USE_NPX=1"
)

if not exist "%KOL_DATA%" (
    echo [ERROR] KOL 数据文件不存在: %KOL_DATA%
    echo 请先确认 scripts\kol_push_data.json 文件存在。
    pause
    exit /b 1
)

echo 启动 KOL 推送弹窗...
echo   Electron: %ELECTRON_BIN%
echo   弹窗脚本: %POPUP_SCRIPT%
echo   KOL 数据: %KOL_DATA%
echo.

cd /d "%FRONTEND_DIR%"

if defined USE_NPX (
    start "" "%ELECTRON_BIN%" electron "%POPUP_SCRIPT%" "%KOL_DATA%"
) else (
    start "" "%ELECTRON_BIN%" "%POPUP_SCRIPT%" "%KOL_DATA%"
)

echo 弹窗已启动！
echo.
