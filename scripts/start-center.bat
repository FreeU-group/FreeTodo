@echo off
chcp 65001 >nul 2>nul
REM ================================================================
REM  LifeTrace Center Node - One-click Startup
REM  Phoenix -> AgentOS -> Backend(center) -> Frontend -> cpolar x2
REM ================================================================
setlocal enabledelayedexpansion

cd /d "%~dp0\.."
set "REPO_ROOT=%cd%"
set "LOG_DIR=%REPO_ROOT%\.run-logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM ================================================================
REM  Load local config (if exists)
REM ================================================================
if exist "%~dp0local-env.bat" (
    call "%~dp0local-env.bat"
)

REM Fallback defaults (override in scripts/local-env.bat)
if "%CPOLAR_BACKEND_DOMAIN%"=="" set "CPOLAR_BACKEND_DOMAIN=YOUR_BACKEND_SUBDOMAIN"
if "%CPOLAR_FRONTEND_DOMAIN%"=="" set "CPOLAR_FRONTEND_DOMAIN=YOUR_FRONTEND_SUBDOMAIN"
REM cpolar region (must match the region used when reserving subdomains in dashboard)
REM China=cn (.cpolar.cn) | China Top=cn_top (.cpolar.top) | China VIP=cn_vip
if "%CPOLAR_REGION%"=="" set "CPOLAR_REGION=cn"
REM Per-tunnel suffix fallback
if "%CPOLAR_BACKEND_SUFFIX%"=="" if "%CPOLAR_DOMAIN_SUFFIX%"=="" set "CPOLAR_BACKEND_SUFFIX=cpolar.cn"
if "%CPOLAR_FRONTEND_SUFFIX%"=="" if "%CPOLAR_DOMAIN_SUFFIX%"=="" set "CPOLAR_FRONTEND_SUFFIX=cpolar.cn"
if "%CPOLAR_BACKEND_SUFFIX%"=="" set "CPOLAR_BACKEND_SUFFIX=%CPOLAR_DOMAIN_SUFFIX%"
if "%CPOLAR_FRONTEND_SUFFIX%"=="" set "CPOLAR_FRONTEND_SUFFIX=%CPOLAR_DOMAIN_SUFFIX%"

REM Ports
if "%BACKEND_PORT%"=="" set "BACKEND_PORT=8001"
if "%FRONTEND_PORT%"=="" set "FRONTEND_PORT=3001"
set "BACKEND_PORT_PREFERRED=%BACKEND_PORT%"
set "FRONTEND_PORT_PREFERRED=%FRONTEND_PORT%"
call :find_free_port "%BACKEND_PORT%" BACKEND_PORT
call :find_free_port "%FRONTEND_PORT%" FRONTEND_PORT

REM ================================================================
REM  Derive public URLs
REM ================================================================
set "BACKEND_PUBLIC_URL=https://%CPOLAR_BACKEND_DOMAIN%.%CPOLAR_BACKEND_SUFFIX%"
set "FRONTEND_PUBLIC_URL=https://%CPOLAR_FRONTEND_DOMAIN%.%CPOLAR_FRONTEND_SUFFIX%"

REM ================================================================
REM  Validate config
REM ================================================================
if "%CPOLAR_BACKEND_DOMAIN%"=="YOUR_BACKEND_SUBDOMAIN" (
    echo [ERROR] Please create scripts\local-env.bat with your cpolar subdomains.
    echo         See scripts\local-env.bat.example or edit this file directly.
    echo.
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
REM  1. Start Phoenix (observability tracing)
REM ================================================================
echo [1/6] Starting Phoenix (observability)...
start "LifeTrace Phoenix" cmd /k "pushd %REPO_ROOT% && uv run phoenix serve"
echo Waiting for Phoenix (2s)...
timeout /t 2 /nobreak >nul

REM ================================================================
REM  2. Start AgentOS (Agno agent framework, must start before backend)
REM ================================================================
echo [2/6] Starting AgentOS...
start "LifeTrace AgentOS" cmd /k "pushd %REPO_ROOT% && uv run python -m lifetrace.agent_os"
echo Waiting for AgentOS (2s)...
timeout /t 2 /nobreak >nul

REM ================================================================
REM  3. Start backend (center mode)
REM ================================================================
echo [3/6] Starting LifeTrace Server (center mode)...
start "LifeTrace Center Backend" cmd /k "pushd %REPO_ROOT% && uv run python -m lifetrace.server --role center --port %BACKEND_PORT%"
echo Waiting for backend (5s)...
timeout /t 5 /nobreak >nul

REM ================================================================
REM  4. Build and start frontend
REM     NEXT_PUBLIC_API_URL = cpolar public URL (baked into client JS for streaming)
REM     API_REWRITE_URL     = localhost (server-side Next.js rewrite, same machine)
REM ================================================================
echo [4/6] Building frontend (client API = %BACKEND_PUBLIC_URL%, rewrite = localhost:%BACKEND_PORT%)...
start "LifeTrace Center Frontend" cmd /k "pushd %REPO_ROOT%\free-todo-frontend && set NEXT_PUBLIC_API_URL=%BACKEND_PUBLIC_URL%&& set API_REWRITE_URL=http://127.0.0.1:%BACKEND_PORT%&& pnpm build:frontend:web && pnpm start --port %FRONTEND_PORT% --hostname 0.0.0.0"
echo Waiting for frontend build (~30s)...
timeout /t 30 /nobreak >nul

REM ================================================================
REM  5. Start cpolar backend tunnel (HTTP - for frontend/browser)
REM ================================================================
echo [5/7] Starting cpolar backend tunnel (HTTP) = %BACKEND_PUBLIC_URL%
start "LifeTrace cpolar Backend HTTP" cmd /k "cpolar http -region=%CPOLAR_REGION% -subdomain=%CPOLAR_BACKEND_DOMAIN% %BACKEND_PORT%"
timeout /t 2 /nobreak >nul

REM ================================================================
REM  6. Start cpolar backend tunnel (TCP - for mobile WebSocket)
REM     TCP tunnel does raw passthrough, no HTTP/WS protocol interference.
REM     Configure fixed TCP address in cpolar.yml with remote_addr parameter.
REM     Set CPOLAR_TCP_TUNNEL_NAME in local-env.bat (default: backend_tcp).
REM ================================================================
if "%CPOLAR_TCP_TUNNEL_NAME%"=="" set "CPOLAR_TCP_TUNNEL_NAME=backend_tcp"
echo [6/7] Starting cpolar backend tunnel (TCP) via named tunnel: %CPOLAR_TCP_TUNNEL_NAME%
start "LifeTrace cpolar Backend TCP" cmd /k "cpolar start %CPOLAR_TCP_TUNNEL_NAME%"
timeout /t 2 /nobreak >nul

REM ================================================================
REM  7. Start cpolar frontend tunnel
REM ================================================================
echo [7/7] Starting cpolar frontend tunnel = %FRONTEND_PUBLIC_URL%
start "LifeTrace cpolar Frontend" cmd /k "cpolar http -region=%CPOLAR_REGION% -subdomain=%CPOLAR_FRONTEND_DOMAIN% %FRONTEND_PORT%"

REM ================================================================
REM  Done
REM ================================================================
echo.
echo ================================================
echo    Center Node Started (7 windows)
echo ================================================
echo.
echo Services:
echo   Phoenix:      http://127.0.0.1:6006
echo   AgentOS:      http://127.0.0.1:8200
echo   Backend:      http://0.0.0.0:%BACKEND_PORT%
echo   Frontend:     http://0.0.0.0:%FRONTEND_PORT%
echo.
echo Public access:
echo   Frontend UI:  %FRONTEND_PUBLIC_URL%
echo   Backend API:  %BACKEND_PUBLIC_URL% (HTTP)
echo   Backend TCP:  Check "LifeTrace cpolar Backend TCP" window for tcp:// address
echo.
echo IMPORTANT: Copy the TCP tunnel address (e.g. tcp://1.tcp.cpolar.cn:20xxx)
echo            and update phone/lib/env/lifetrace_env.dart with:
echo            http://HOST:PORT/
echo.
echo Sensor startup command (run from client/ directory):
echo   cd client ^&^& uv run python -m sensor --center-url %BACKEND_PUBLIC_URL%
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
