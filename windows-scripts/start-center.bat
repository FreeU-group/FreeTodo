@echo off
chcp 65001 >nul 2>nul
REM ================================================================
REM  LifeTrace Center Node - One-click Startup
REM  Phoenix -> AgentOS -> Backend(center) -> Frontend
REM ================================================================
setlocal enabledelayedexpansion

for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"
set "SERVER_DIR=%REPO_ROOT%\server"
set "FRONTEND_DIR=%REPO_ROOT%\frontend"
set "LOG_DIR=%REPO_ROOT%\.run-logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM ================================================================
REM  Load local config (if exists)
REM ================================================================
if exist "%~dp0local-env.bat" (
    call "%~dp0local-env.bat"
)

REM Ports (override in local-env.bat)
if "%BACKEND_PORT%"=="" set "BACKEND_PORT=8001"
if "%FRONTEND_PORT%"=="" set "FRONTEND_PORT=3001"
set "BACKEND_PORT_PREFERRED=%BACKEND_PORT%"
set "FRONTEND_PORT_PREFERRED=%FRONTEND_PORT%"
call :find_free_port "%BACKEND_PORT%" BACKEND_PORT
call :find_free_port "%FRONTEND_PORT%" FRONTEND_PORT

REM ================================================================
REM  Validate directories
REM ================================================================
if not exist "%SERVER_DIR%\pyproject.toml" (
    echo [ERROR] Server directory not found: %SERVER_DIR%
    echo         Expected pyproject.toml at %SERVER_DIR%\pyproject.toml
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%\package.json" (
    echo [ERROR] Frontend directory not found: %FRONTEND_DIR%
    echo         Expected package.json at %FRONTEND_DIR%\package.json
    pause
    exit /b 1
)

echo ================================================
echo    LifeTrace Center Node Startup (local)
echo ================================================
echo.
echo Backend:   http://127.0.0.1:%BACKEND_PORT%
echo Frontend:  http://127.0.0.1:%FRONTEND_PORT%
if not "%BACKEND_PORT%"=="%BACKEND_PORT_PREFERRED%" echo Note: backend preferred port %BACKEND_PORT_PREFERRED% busy, switched to %BACKEND_PORT%
if not "%FRONTEND_PORT%"=="%FRONTEND_PORT_PREFERRED%" echo Note: frontend preferred port %FRONTEND_PORT_PREFERRED% busy, switched to %FRONTEND_PORT%
echo.

REM ================================================================
REM  1. Start Phoenix (observability tracing) - optional
REM     Requires arize-phoenix to be installed. Skip gracefully if missing.
REM ================================================================
echo [1/4] Starting Phoenix (observability)...
start /MAX "LifeTrace Phoenix" cmd /k "pushd %SERVER_DIR% && uv run phoenix serve || echo [WARN] Phoenix not available. Install with: uv add arize-phoenix && pause"
echo Waiting for Phoenix (2s)...
timeout /t 2 /nobreak >nul

REM ================================================================
REM  2. Start AgentOS (Agno agent framework, must start before backend)
REM ================================================================
echo [2/4] Starting AgentOS...
start /MAX "LifeTrace AgentOS" cmd /k "pushd %SERVER_DIR% && uv run python agent_os.py"
echo Waiting for AgentOS (2s)...
timeout /t 2 /nobreak >nul

REM ================================================================
REM  3. Start backend (center mode)
REM     Role and port are set via Dynaconf env vars (LIFETRACE__ prefix).
REM ================================================================
echo [3/4] Starting LifeTrace Server (center mode, port %BACKEND_PORT%)...
start /MAX "LifeTrace Center Backend" cmd /k "pushd %SERVER_DIR% && set LIFETRACE_DEPLOYMENT__ROLE=center&& set LIFETRACE_SERVER__PORT=%BACKEND_PORT%&& set LIFETRACE_SERVER__HOST=0.0.0.0&& uv run python server.py"
echo Waiting for backend (5s)...
timeout /t 5 /nobreak >nul

REM ================================================================
REM  4. Build and start frontend
REM     NEXT_PUBLIC_API_URL  = what browser JS uses to call backend
REM     API_REWRITE_URL      = server-side Next.js rewrite target
REM     Both point to localhost since center & sensor are on same machine.
REM ================================================================
echo [4/4] Building frontend (API = http://127.0.0.1:%BACKEND_PORT%)...
start /MAX "LifeTrace Center Frontend" cmd /k "pushd %FRONTEND_DIR% && set NEXT_PUBLIC_API_URL=http://127.0.0.1:%BACKEND_PORT%&& set API_REWRITE_URL=http://127.0.0.1:%BACKEND_PORT%&& pnpm build:frontend:web && pnpm start --port %FRONTEND_PORT% --hostname 0.0.0.0"
echo Waiting for frontend build (~30s)...
timeout /t 30 /nobreak >nul

REM ================================================================
REM  cpolar tunnels - DISABLED (center & sensor on same machine)
REM  Uncomment below if you need public access via cpolar again.
REM ================================================================
REM echo [5/6] Starting cpolar backend tunnels (HTTP + TCP)...
REM start /MAX "LifeTrace cpolar Backend" cmd /k "cpolar start backend_http backend_tcp"
REM timeout /t 2 /nobreak >nul
REM echo [6/6] Starting cpolar frontend tunnel...
REM start /MAX "LifeTrace cpolar Frontend" cmd /k "cpolar start frontend_http"

REM ================================================================
REM  Done
REM ================================================================
echo.
echo ================================================
echo    Center Node Started (4 windows)
echo ================================================
echo.
echo Services:
echo   Phoenix:      http://127.0.0.1:6006
echo   AgentOS:      http://127.0.0.1:8002
echo   Backend:      http://127.0.0.1:%BACKEND_PORT%
echo   Frontend:     http://127.0.0.1:%FRONTEND_PORT%
echo.
echo Sensor startup command (run from client/ directory):
echo   cd client ^&^& uv run python -m sensor --center-url http://127.0.0.1:%BACKEND_PORT%
echo.
echo Tip: close each window to stop its service.
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
