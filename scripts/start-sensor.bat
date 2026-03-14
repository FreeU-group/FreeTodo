@echo off
chcp 65001 >nul 2>nul
REM ================================================================
REM  LifeTrace Sensor Node - One-click Startup
REM  Start perception daemon + open browser to Center
REM ================================================================
setlocal enabledelayedexpansion

cd /d "%~dp0\.."
set "REPO_ROOT=%cd%"

REM ================================================================
REM  Load local config (if exists)
REM ================================================================
if exist "%~dp0local-env.bat" (
    call "%~dp0local-env.bat"
)

REM Fallback defaults (override in scripts/local-env.bat)
if "%CPOLAR_BACKEND_DOMAIN%"=="" set "CPOLAR_BACKEND_DOMAIN=YOUR_BACKEND_SUBDOMAIN"
if "%CPOLAR_FRONTEND_DOMAIN%"=="" set "CPOLAR_FRONTEND_DOMAIN=YOUR_FRONTEND_SUBDOMAIN"
if "%CPOLAR_BACKEND_SUFFIX%"=="" if "%CPOLAR_DOMAIN_SUFFIX%"=="" set "CPOLAR_BACKEND_SUFFIX=cpolar.cn"
if "%CPOLAR_FRONTEND_SUFFIX%"=="" if "%CPOLAR_DOMAIN_SUFFIX%"=="" set "CPOLAR_FRONTEND_SUFFIX=cpolar.cn"
if "%CPOLAR_BACKEND_SUFFIX%"=="" set "CPOLAR_BACKEND_SUFFIX=%CPOLAR_DOMAIN_SUFFIX%"
if "%CPOLAR_FRONTEND_SUFFIX%"=="" set "CPOLAR_FRONTEND_SUFFIX=%CPOLAR_DOMAIN_SUFFIX%"

set "CENTER_URL=https://%CPOLAR_BACKEND_DOMAIN%.%CPOLAR_BACKEND_SUFFIX%"
set "CENTER_FRONTEND_URL=https://%CPOLAR_FRONTEND_DOMAIN%.%CPOLAR_FRONTEND_SUFFIX%"

REM Node ID (defaults to computer name)
set "NODE_ID=%COMPUTERNAME%"

REM ================================================================
REM  Validate config
REM ================================================================
if "%CPOLAR_BACKEND_DOMAIN%"=="YOUR_BACKEND_SUBDOMAIN" (
    echo [ERROR] Please create scripts\local-env.bat with your cpolar subdomains.
    echo.
    pause
    exit /b 1
)

REM ================================================================
REM  Startup
REM ================================================================

echo ================================================
echo    LifeTrace Sensor Node Startup
echo ================================================
echo.
echo Center backend:  %CENTER_URL%
echo Center frontend: %CENTER_FRONTEND_URL%
echo Node ID:         %NODE_ID%
echo.

REM Check Center connectivity
echo Checking Center connectivity...
curl -s -o nul -w "%%{http_code}" "%CENTER_URL%/health" > "%TEMP%\lt_health.tmp" 2>nul
set /p HEALTH_CODE=<"%TEMP%\lt_health.tmp"
del "%TEMP%\lt_health.tmp" 2>nul

if "%HEALTH_CODE%"=="200" (
    echo Center connection OK
) else (
    echo [WARNING] Center not reachable (HTTP %HEALTH_CODE%)
    echo Sensor will keep retrying...
)
echo.

REM Build sensor command (runs from client/ directory which is a standalone uv project)
set "SENSOR_DIR=%REPO_ROOT%\client"
set "SENSOR_CMD=uv run python -m sensor --center-url %CENTER_URL% --node-id %NODE_ID%"

REM Start perception daemon
echo [1/3] Starting perception daemon...
start "LifeTrace Sensor" cmd /k "pushd %SENSOR_DIR% && %SENSOR_CMD%"

REM Start notification popup (Electron system-level toast)
echo [2/3] Starting notification popup...
set "POPUP_SCRIPT=%REPO_ROOT%\frontend\scripts\notification-popup.js"
set "POPUP_DIR=%REPO_ROOT%\frontend"

REM Try to find electron binary (pnpm node_modules or npx)
set "ELECTRON_BIN="
if exist "%POPUP_DIR%\node_modules\.bin\electron.cmd" (
    set "ELECTRON_BIN=%POPUP_DIR%\node_modules\.bin\electron.cmd"
)

if defined ELECTRON_BIN (
    set "LIFETRACE_BACKEND_URL=%CENTER_URL%"
    start "LifeTrace Popup" cmd /c "pushd %POPUP_DIR% && set LIFETRACE_BACKEND_URL=%CENTER_URL% && set ELECTRON_DISABLE_SECURITY_WARNINGS=1 && "%ELECTRON_BIN%" "%POPUP_SCRIPT%""
    echo Notification popup started (backend: %CENTER_URL%)
) else (
    echo [WARNING] electron not found in frontend/node_modules
    echo Run "pnpm install" in frontend/ to enable notification popups.
    echo Continuing without notification popup...
)

REM Open browser
echo [3/3] Opening browser...
timeout /t 2 /nobreak >nul
start "" "%CENTER_FRONTEND_URL%"

echo.
echo ================================================
echo    Sensor Node Started
echo ================================================
echo.
echo Perception daemon: screenshot + OCR + proactive OCR = %CENTER_URL%
echo Notification popup: system-level toast for invitations
echo Browser opened:    %CENTER_FRONTEND_URL%
echo.
echo Tip: close the "LifeTrace Sensor" and "LifeTrace Popup" windows to stop.
echo.
pause
endlocal
