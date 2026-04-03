@echo off
chcp 65001 >nul 2>nul
REM ================================================================
REM  LifeTrace Quick Start All (Center + Sensor)
REM  One click to launch everything on the same machine.
REM ================================================================
setlocal enabledelayedexpansion

for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"
set "SERVER_DIR=%REPO_ROOT%\local-api"
set "FRONTEND_DIR=%REPO_ROOT%\local-web"
set "SENSOR_DIR=%REPO_ROOT%\local-sensor"

REM Load local config
if exist "%~dp0local-env.bat" call "%~dp0local-env.bat"

REM Ports
if "%BACKEND_PORT%"=="" set "BACKEND_PORT=8001"
if "%FRONTEND_PORT%"=="" set "FRONTEND_PORT=3001"
call :find_free_port "%BACKEND_PORT%" BACKEND_PORT
call :find_free_port "%FRONTEND_PORT%" FRONTEND_PORT

set "CENTER_URL=http://127.0.0.1:%BACKEND_PORT%"
set "NODE_ID=%COMPUTERNAME%"

echo ================================================
echo    LifeTrace Quick Start All
echo ================================================
echo.
echo Backend:   %CENTER_URL%
echo Frontend:  http://127.0.0.1:%FRONTEND_PORT%
echo Node ID:   %NODE_ID%
echo.

REM ================================================================
REM  Center services
REM ================================================================

echo [1/6] Starting Phoenix (observability)...
start /MIN "LifeTrace Phoenix" cmd /k "pushd %SERVER_DIR% && uv run phoenix serve || echo [WARN] Phoenix not available && pause"
timeout /t 2 /nobreak >nul

echo [2/6] Starting AgentOS...
start /MIN "LifeTrace AgentOS" cmd /k "pushd %SERVER_DIR% && uv run python agent_os.py"
timeout /t 2 /nobreak >nul

echo [3/6] Starting Backend (port %BACKEND_PORT%)...
start /MIN "LifeTrace Center Backend" cmd /k "pushd %SERVER_DIR% && set LIFETRACE_DEPLOYMENT__ROLE=center&& set LIFETRACE_SERVER__PORT=%BACKEND_PORT%&& set LIFETRACE_SERVER__HOST=0.0.0.0&& uv run python server.py"
timeout /t 5 /nobreak >nul

echo [4/6] Starting Frontend (dev mode, port %FRONTEND_PORT%)...
start /MIN "LifeTrace Center Frontend" cmd /k "pushd %FRONTEND_DIR% && set NEXT_PUBLIC_API_URL=http://127.0.0.1:%BACKEND_PORT%&& set API_REWRITE_URL=http://127.0.0.1:%BACKEND_PORT%&& pnpm dev --port %FRONTEND_PORT% --hostname 0.0.0.0"

REM Wait for backend to be ready before starting sensor
echo Waiting for backend to be ready (20s)...
timeout /t 20 /nobreak >nul

REM ================================================================
REM  Sensor services
REM ================================================================

echo [5/6] Starting Perception Daemon...
start /MIN "LifeTrace Sensor" cmd /k "pushd %SENSOR_DIR% && uv run python -m sensor --center-url %CENTER_URL% --node-id %NODE_ID% --debug-images"

echo [6/6] Starting Signal Sensor...
set "SIGNAL_SCRIPT=%REPO_ROOT%\scripts\signal-sensor.py"
start /MIN "LifeTrace Signal" cmd /k "pushd %SENSOR_DIR% && uv run python "%SIGNAL_SCRIPT%" --center-url %CENTER_URL% --node-id %NODE_ID%"

REM Open browser (dev mode starts faster)
echo Waiting for frontend (10s)...
timeout /t 10 /nobreak >nul
start "" "http://127.0.0.1:%FRONTEND_PORT%"

echo.
echo ================================================
echo    All Services Started (6 windows)
echo ================================================
echo.
echo   Phoenix:      http://127.0.0.1:6006
echo   AgentOS:      http://127.0.0.1:8002
echo   Backend:      %CENTER_URL%
echo   Frontend:     http://127.0.0.1:%FRONTEND_PORT%
echo   Sensor:       %NODE_ID% -^> %CENTER_URL%
echo   Signal:       notification polling + popup
echo.
echo To stop everything: run quick-stop-all.bat
echo.
pause
endlocal
goto :eof

:find_free_port
set "START_PORT=%~1"
set "OUT_VAR=%~2"
set "FOUND_PORT="
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$p=[int]%START_PORT%; while($true){ try{ $l=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$p); $l.Start(); $l.Stop(); Write-Output $p; break } catch { $p++ } }"`) do set "FOUND_PORT=%%P"
if "%FOUND_PORT%"=="" set "FOUND_PORT=%START_PORT%"
set "%OUT_VAR%=%FOUND_PORT%"
exit /b 0
