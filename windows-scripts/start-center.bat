@echo off
chcp 65001 >nul 2>nul
REM ================================================================
REM  LifeTrace Center Node - One-click Startup
REM  Phoenix -> AgentOS -> Backend(center) -> Frontend -> cpolar
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

REM Fallback defaults (override in local-env.bat)
if "%CPOLAR_BACKEND_DOMAIN%"=="" set "CPOLAR_BACKEND_DOMAIN=YOUR_BACKEND_SUBDOMAIN"
if "%CPOLAR_FRONTEND_DOMAIN%"=="" set "CPOLAR_FRONTEND_DOMAIN=YOUR_FRONTEND_SUBDOMAIN"
if "%CPOLAR_REGION%"=="" set "CPOLAR_REGION=cn"
if "%CPOLAR_BACKEND_SUFFIX%"=="" if "%CPOLAR_DOMAIN_SUFFIX%"=="" set "CPOLAR_BACKEND_SUFFIX=cpolar.cn"
if "%CPOLAR_FRONTEND_SUFFIX%"=="" if "%CPOLAR_DOMAIN_SUFFIX%"=="" set "CPOLAR_FRONTEND_SUFFIX=cpolar.cn"
if "%CPOLAR_BACKEND_SUFFIX%"=="" set "CPOLAR_BACKEND_SUFFIX=%CPOLAR_DOMAIN_SUFFIX%"
if "%CPOLAR_FRONTEND_SUFFIX%"=="" set "CPOLAR_FRONTEND_SUFFIX=%CPOLAR_DOMAIN_SUFFIX%"

REM Ports (override in local-env.bat)
if "%BACKEND_PORT%"=="" set "BACKEND_PORT=8001"
if "%FRONTEND_PORT%"=="" set "FRONTEND_PORT=3001"
set "BACKEND_PORT_PREFERRED=%BACKEND_PORT%"
set "FRONTEND_PORT_PREFERRED=%FRONTEND_PORT%"
call :find_free_port "%BACKEND_PORT%" BACKEND_PORT
call :find_free_port "%FRONTEND_PORT%" FRONTEND_PORT

REM Derive public URLs
set "BACKEND_PUBLIC_URL=https://%CPOLAR_BACKEND_DOMAIN%.%CPOLAR_BACKEND_SUFFIX%"
set "FRONTEND_PUBLIC_URL=https://%CPOLAR_FRONTEND_DOMAIN%.%CPOLAR_FRONTEND_SUFFIX%"

REM ================================================================
REM  Validate config
REM ================================================================
if "%CPOLAR_BACKEND_DOMAIN%"=="YOUR_BACKEND_SUBDOMAIN" (
    echo [ERROR] Please create windows-scripts\local-env.bat with your cpolar subdomains.
    echo.
    pause
    exit /b 1
)

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
echo    LifeTrace Center Node Startup
echo ================================================
echo.
echo Backend local:   http://0.0.0.0:%BACKEND_PORT%
echo Backend public:  %BACKEND_PUBLIC_URL%
echo Frontend local:  http://0.0.0.0:%FRONTEND_PORT%
echo Frontend public: %FRONTEND_PUBLIC_URL%
if not "%BACKEND_PORT%"=="%BACKEND_PORT_PREFERRED%" echo Note: backend preferred port %BACKEND_PORT_PREFERRED% busy, switched to %BACKEND_PORT%
if not "%FRONTEND_PORT%"=="%FRONTEND_PORT_PREFERRED%" echo Note: frontend preferred port %FRONTEND_PORT_PREFERRED% busy, switched to %FRONTEND_PORT%
echo.

REM ================================================================
REM  1. Start Phoenix (observability tracing) - optional
REM     Requires arize-phoenix to be installed. Skip gracefully if missing.
REM ================================================================
echo [1/6] Starting Phoenix (observability)...
start /MAX "LifeTrace Phoenix" cmd /k "pushd %SERVER_DIR% && uv run phoenix serve || echo [WARN] Phoenix not available. Install with: uv add arize-phoenix && pause"
echo Waiting for Phoenix (2s)...
timeout /t 2 /nobreak >nul

REM ================================================================
REM  2. Start AgentOS (Agno agent framework, must start before backend)
REM ================================================================
echo [2/6] Starting AgentOS...
start /MAX "LifeTrace AgentOS" cmd /k "pushd %SERVER_DIR% && uv run python agent_os.py"
echo Waiting for AgentOS (2s)...
timeout /t 2 /nobreak >nul

REM ================================================================
REM  3. Start backend (center mode)
REM     Role and port are set via Dynaconf env vars (LIFETRACE__ prefix).
REM ================================================================
echo [3/6] Starting LifeTrace Server (center mode, port %BACKEND_PORT%)...
start /MAX "LifeTrace Center Backend" cmd /k "pushd %SERVER_DIR% && set LIFETRACE_DEPLOYMENT__ROLE=center&& set LIFETRACE_SERVER__PORT=%BACKEND_PORT%&& set LIFETRACE_SERVER__HOST=0.0.0.0&& uv run python server.py"
echo Waiting for backend (5s)...
timeout /t 5 /nobreak >nul

REM ================================================================
REM  4. Build and start frontend
REM     NEXT_PUBLIC_API_URL = cpolar public URL (baked into client JS for streaming)
REM     API_REWRITE_URL     = localhost (server-side Next.js rewrite, same machine)
REM ================================================================
echo [4/6] Building frontend (client API = %BACKEND_PUBLIC_URL%, rewrite = localhost:%BACKEND_PORT%)...
start /MAX "LifeTrace Center Frontend" cmd /k "pushd %FRONTEND_DIR% && set NEXT_PUBLIC_API_URL=%BACKEND_PUBLIC_URL%&& set API_REWRITE_URL=http://127.0.0.1:%BACKEND_PORT%&& pnpm build:frontend:web && pnpm start --port %FRONTEND_PORT% --hostname 0.0.0.0"
echo Waiting for frontend build (~30s)...
timeout /t 30 /nobreak >nul

REM ================================================================
REM  5. Start cpolar backend tunnels (HTTP + TCP)
REM     Tunnels are defined in cpolar.yml: backend_http, backend_tcp
REM ================================================================
echo [5/6] Starting cpolar backend tunnels (HTTP + TCP)...
echo       Backend HTTP:  %BACKEND_PUBLIC_URL%
echo       Backend TCP:   2.tcp.cpolar.cn:12691
start /MAX "LifeTrace cpolar Backend" cmd /k "cpolar start backend_http backend_tcp"
timeout /t 2 /nobreak >nul

REM ================================================================
REM  6. Start cpolar frontend tunnel (separate session)
REM ================================================================
echo [6/6] Starting cpolar frontend tunnel...
echo       Frontend HTTP: %FRONTEND_PUBLIC_URL%
start /MAX "LifeTrace cpolar Frontend" cmd /k "cpolar start frontend_http"

REM ================================================================
REM  Done
REM ================================================================
echo.
echo ================================================
echo    Center Node Started (6 windows)
echo ================================================
echo.
echo Services:
echo   Phoenix:      http://127.0.0.1:6006
echo   AgentOS:      http://127.0.0.1:8002
echo   Backend:      http://0.0.0.0:%BACKEND_PORT%
echo   Frontend:     http://0.0.0.0:%FRONTEND_PORT%
echo.
echo Public access:
echo   Frontend UI:  %FRONTEND_PUBLIC_URL%
echo   Backend API:  %BACKEND_PUBLIC_URL% (HTTP)
echo   Backend TCP:  2.tcp.cpolar.cn:12691
echo.
echo Local sensor (same machine, no cpolar needed):
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
