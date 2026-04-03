@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

REM ================================================================
REM  FreeTodo Portable - Setup Script
REM  在开发机上运行一次，构建便携包。
REM  完成后，将整个 portable\ 文件夹拷贝到 U 盘即可。
REM ================================================================

set "PORTABLE_ROOT=%~dp0"
if "%PORTABLE_ROOT:~-1%"=="\" set "PORTABLE_ROOT=%PORTABLE_ROOT:~0,-1%"
for %%I in ("%PORTABLE_ROOT%\..") do set "REPO_ROOT=%%~fI"

REM ---- Versions (按需修改) ----
set "NODE_VERSION=v22.15.0"
set "UV_VERSION=0.7.12"

REM ---- Download URLs (国内镜像优先) ----
set "NODE_MIRROR=https://npmmirror.com/mirrors/node"
set "NODE_URL=%NODE_MIRROR%/%NODE_VERSION%/node-%NODE_VERSION%-win-x64.zip"
set "UV_URL=https://github.com/astral-sh/uv/releases/download/%UV_VERSION%/uv-x86_64-pc-windows-msvc.zip"

REM ---- Platform ----
set "PLATFORM=win-x64"
set "RT=%PORTABLE_ROOT%\runtime\%PLATFORM%"

REM ---- Portable uv 配置 ----
set "UV_PYTHON_INSTALL_DIR=%RT%\python"
set "UV_CACHE_DIR=%RT%\uv-cache"
set "UV_TORCH_BACKEND=cpu"
set "UV_PROJECT_ENVIRONMENT=.venv-%PLATFORM%"
set "UV=%RT%\uv.exe"
set "NODE=%RT%\node\node.exe"

echo ================================================
echo   FreeTodo Portable - Build Setup
echo ================================================
echo.
echo   Repo root:     %REPO_ROOT%
echo   Portable root: %PORTABLE_ROOT%
echo   Node:          %NODE_VERSION%
echo   uv:            %UV_VERSION%
echo.

REM ================================================================
REM  [1/8] 创建目录结构
REM ================================================================
echo [1/8] Creating directory structure...
for %%D in (
    runtime\%PLATFORM% runtime\%PLATFORM%\python runtime\%PLATFORM%\uv-cache
    app\server app\client app\scripts app\frontend
    data\config data\data data\logs data\models
) do (
    if not exist "%PORTABLE_ROOT%\%%D" mkdir "%PORTABLE_ROOT%\%%D"
)

REM ================================================================
REM  [2/8] 下载 uv
REM ================================================================
if exist "%UV%" (
    echo [2/8] uv already exists, skipping download.
) else (
    echo [2/8] Downloading uv %UV_VERSION%...
    curl -fSL "%UV_URL%" -o "%RT%\uv.zip"
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to download uv. Check network or use VPN.
        pause & exit /b 1
    )
    powershell -NoProfile -Command "Expand-Archive -Force '%RT%\uv.zip' '%RT%\_uv_tmp'"
    for /D %%D in ("%RT%\_uv_tmp\*") do (
        copy /Y "%%D\uv.exe" "%RT%\uv.exe" >nul 2>nul
        copy /Y "%%D\uvx.exe" "%RT%\uvx.exe" >nul 2>nul
    )
    if not exist "%UV%" copy /Y "%RT%\_uv_tmp\uv.exe" "%RT%\uv.exe" >nul 2>nul
    rd /S /Q "%RT%\_uv_tmp" 2>nul
    del "%RT%\uv.zip" 2>nul
    echo   uv downloaded OK.
)

REM ================================================================
REM  [3/8] 下载 Node.js
REM ================================================================
if exist "%NODE%" (
    echo [3/8] Node.js already exists, skipping download.
) else (
    echo [3/8] Downloading Node.js %NODE_VERSION%...
    curl -fSL "%NODE_URL%" -o "%RT%\node.zip"
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Failed to download Node.js. Check network.
        pause & exit /b 1
    )
    powershell -NoProfile -Command "Expand-Archive -Force '%RT%\node.zip' '%RT%\_node_tmp'"
    for /D %%D in ("%RT%\_node_tmp\node-*") do (
        robocopy "%%D" "%RT%\node" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul
    )
    rd /S /Q "%RT%\_node_tmp" 2>nul
    del "%RT%\node.zip" 2>nul
    echo   Node.js downloaded OK.
)

REM ================================================================
REM  [4/8] 通过 uv 安装 Python 3.12
REM ================================================================
echo [4/8] Installing Python 3.12 via uv...
"%UV%" python install 3.12 --python-preference only-managed
if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] Failed to install Python. Check network.
    pause & exit /b 1
)
echo   Python 3.12 installed OK.

REM ================================================================
REM  [5/8] 复制源代码
REM ================================================================
echo [5/8] Copying source code...

echo   Copying local-api...
robocopy "%REPO_ROOT%\local-api" "%PORTABLE_ROOT%\app\local-api" /E /PURGE ^
    /XD .venv __pycache__ data logs .ruff_cache .pytest_cache .mypy_cache node_modules ^
    /XF *.pyc ^
    /NFL /NDL /NJH /NJS /NC /NS /NP >nul

echo   Copying local-sensor...
robocopy "%REPO_ROOT%\local-sensor" "%PORTABLE_ROOT%\app\local-sensor" /E /PURGE ^
    /XD .venv __pycache__ data logs .ruff_cache .pytest_cache .mypy_cache sensor_debug ^
    /XF *.pyc ^
    /NFL /NDL /NJH /NJS /NC /NS /NP >nul

echo   Copying scripts...
robocopy "%REPO_ROOT%\scripts" "%PORTABLE_ROOT%\app\scripts" /E /PURGE ^
    /XD __pycache__ ^
    /XF *.pyc ^
    /NFL /NDL /NJH /NJS /NC /NS /NP >nul

REM ================================================================
REM  [6/8] 安装 Python 依赖（较慢，请耐心等待）
REM ================================================================
echo [6/8] Installing Python dependencies (may take 5-10 minutes)...

echo   Syncing local-api dependencies (torch-cpu, chromadb, etc.)...
"%UV%" sync --directory "%PORTABLE_ROOT%\app\local-api" --python-preference only-managed
if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] local-api dependency sync failed.
    pause & exit /b 1
)

echo   Syncing local-sensor dependencies (OCR, etc.)...
"%UV%" sync --directory "%PORTABLE_ROOT%\app\local-sensor" --python-preference only-managed
if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] local-sensor dependency sync failed.
    pause & exit /b 1
)
echo   All Python dependencies installed OK.

REM ================================================================
REM  [7/8] 构建前端 (Next.js standalone)
REM ================================================================
echo [7/8] Building frontend (Next.js standalone)...

pushd "%REPO_ROOT%\local-web"
set "NEXT_PUBLIC_API_URL=http://127.0.0.1:8001"
call pnpm build
if !ERRORLEVEL! NEQ 0 (
    echo [ERROR] Frontend build failed. Make sure pnpm is installed and dependencies are synced.
    popd
    pause & exit /b 1
)
popd

echo   Copying standalone output...
robocopy "%REPO_ROOT%\local-web\.next\standalone" "%PORTABLE_ROOT%\app\local-web" /E /PURGE ^
    /NFL /NDL /NJH /NJS /NC /NS /NP >nul
robocopy "%REPO_ROOT%\local-web\.next\static" "%PORTABLE_ROOT%\app\local-web\.next\static" /E /PURGE ^
    /NFL /NDL /NJH /NJS /NC /NS /NP >nul
robocopy "%REPO_ROOT%\local-web\public" "%PORTABLE_ROOT%\app\local-web\public" /E /PURGE ^
    /NFL /NDL /NJH /NJS /NC /NS /NP >nul

echo   Resolving pnpm symlinks in standalone...
"%NODE%" "%REPO_ROOT%\local-web\scripts\resolve-symlinks.js"
echo   Copying missing deps to standalone...
"%NODE%" "%REPO_ROOT%\local-web\scripts\copy-missing-deps.js"

echo   Copying fixed standalone to portable...
robocopy "%REPO_ROOT%\local-web\.next\standalone" "%PORTABLE_ROOT%\app\local-web" /E ^
    /NFL /NDL /NJH /NJS /NC /NS /NP >nul
robocopy "%REPO_ROOT%\local-web\.next\static" "%PORTABLE_ROOT%\app\local-web\.next\static" /E ^
    /NFL /NDL /NJH /NJS /NC /NS /NP >nul
robocopy "%REPO_ROOT%\local-web\public" "%PORTABLE_ROOT%\app\local-web\public" /E ^
    /NFL /NDL /NJH /NJS /NC /NS /NP >nul
echo   Frontend build OK.

REM ================================================================
REM  [8/8] 初始化配置文件
REM ================================================================
echo [8/8] Initializing config files...

if not exist "%PORTABLE_ROOT%\data\config\server.env" (
    if exist "%REPO_ROOT%\local-api\.env.example" (
        copy /Y "%REPO_ROOT%\local-api\.env.example" "%PORTABLE_ROOT%\data\config\server.env" >nul
        echo   Created data\config\server.env from template.
    )
)
if not exist "%PORTABLE_ROOT%\data\config\client.env" (
    if exist "%REPO_ROOT%\local-sensor\.env.example" (
        copy /Y "%REPO_ROOT%\local-sensor\.env.example" "%PORTABLE_ROOT%\data\config\client.env" >nul
        echo   Created data\config\client.env from template.
    )
)

echo.
echo ================================================
echo   Setup Complete!
echo ================================================
echo.
echo   Portable directory ready: %PORTABLE_ROOT%
echo.
echo   Next steps:
echo     1. Configure API keys:
echo        - Open Config.html in a browser, OR
echo        - Edit data\config\server.env directly
echo        (LIFETRACE_LLM__API_KEY is required)
echo.
echo     2. Double-click Windows-Start.bat to launch
echo.
echo     3. To distribute: copy the entire portable\ folder
echo        to a USB drive (need ~3-4 GB free space)
echo.
pause
endlocal
