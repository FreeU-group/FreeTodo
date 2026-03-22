@echo off
chcp 65001 >nul 2>nul
REM ================================================================
REM  LifeTrace Sensor Node - One-click Startup
REM  Start perception daemon + signal sensor + open browser
REM  Connects to Center on localhost (same machine).
REM ================================================================
setlocal enabledelayedexpansion

for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"

REM ================================================================
REM  Load local config (if exists)
REM ================================================================
if exist "%~dp0local-env.bat" (
    call "%~dp0local-env.bat"
)

REM Ports (must match start-center.bat; override in local-env.bat)
if "%BACKEND_PORT%"=="" set "BACKEND_PORT=8001"
if "%FRONTEND_PORT%"=="" set "FRONTEND_PORT=3001"

set "CENTER_URL=http://127.0.0.1:%BACKEND_PORT%"
set "CENTER_FRONTEND_URL=http://127.0.0.1:%FRONTEND_PORT%"

REM Node ID (defaults to computer name)
set "NODE_ID=%COMPUTERNAME%"

REM ================================================================
REM  Startup
REM ================================================================

echo ================================================
echo    LifeTrace Sensor Node Startup (local)
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
    echo Make sure start-center.bat is running first.
    echo Sensor will keep retrying...
)
echo.

REM Build sensor command (runs from client/ directory which is a standalone uv project)
set "SENSOR_DIR=%REPO_ROOT%\client"
set "SENSOR_CMD=uv run python -m sensor --center-url %CENTER_URL% --node-id %NODE_ID% --debug-images"

REM Start perception daemon
echo [1/3] Starting perception daemon...
start "LifeTrace Sensor" cmd /k "pushd %SENSOR_DIR% && %SENSOR_CMD%"

REM Start signal-sensor (unified notification daemon + interactive popup)
echo [2/3] Starting signal-sensor (notification polling + popup)...
set "SIGNAL_SCRIPT=%REPO_ROOT%\scripts\signal-sensor.py"
start "LifeTrace Signal" cmd /k "pushd %REPO_ROOT%\client && uv run python "%SIGNAL_SCRIPT%" --center-url %CENTER_URL% --node-id %NODE_ID%"
echo Signal sensor started (center: %CENTER_URL%, node: %NODE_ID%)

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
echo Signal sensor:     notification polling + interactive popup
echo Browser opened:    %CENTER_FRONTEND_URL%
echo.
echo Tip: close the "LifeTrace Sensor" and "LifeTrace Signal" windows to stop,
echo      or run stop-sensor.bat.
echo.
pause
endlocal
