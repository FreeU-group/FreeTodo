@echo off
chcp 65001 >nul 2>nul
REM ================================================================
REM  FreeTodo Portable - One-click Start
REM ================================================================
setlocal enabledelayedexpansion

set "PORTABLE_ROOT=%~dp0"
if "%PORTABLE_ROOT:~-1%"=="\" set "PORTABLE_ROOT=%PORTABLE_ROOT:~0,-1%"

set "PLATFORM=win-x64"
set "RT=%PORTABLE_ROOT%\runtime\%PLATFORM%"

set "UV=%RT%\uv.exe"
set "NODE=%RT%\node\node.exe"
set "SERVER_DIR=%PORTABLE_ROOT%\app\server"
set "CLIENT_DIR=%PORTABLE_ROOT%\app\client"
set "FRONTEND_DIR=%PORTABLE_ROOT%\app\frontend"
set "SCRIPTS_DIR=%PORTABLE_ROOT%\app\scripts"
set "DATA_DIR=%PORTABLE_ROOT%\data"

REM ---- All env vars set here are inherited by child processes ----
set "PYTHONUTF8=1"
set "PYTHONIOENCODING=utf-8"
set "UV_PYTHON_INSTALL_DIR=%RT%\python"
set "UV_CACHE_DIR=%RT%\uv-cache"
set "UV_PROJECT_ENVIRONMENT=.venv-%PLATFORM%"
set "LIFETRACE_DATA_DIR=%DATA_DIR%"
set "FREETODO_CLIENT_DATA_DIR=%DATA_DIR%"
set "HF_HOME=%DATA_DIR%\models"
set "SENTENCE_TRANSFORMERS_HOME=%DATA_DIR%\models\sentence-transformers"

if exist "%PORTABLE_ROOT%\local-env.bat" call "%PORTABLE_ROOT%\local-env.bat"

if "%BACKEND_PORT%"=="" set "BACKEND_PORT=8001"
if "%FRONTEND_PORT%"=="" set "FRONTEND_PORT=3001"
call :find_free_port "%BACKEND_PORT%" BACKEND_PORT
call :find_free_port "%FRONTEND_PORT%" FRONTEND_PORT

set "CENTER_URL=http://127.0.0.1:%BACKEND_PORT%"
set "NODE_ID=%COMPUTERNAME%"

REM ---- Pre-flight checks ----
if not exist "%UV%" (
    echo [ERROR] uv not found. Please run setup.bat first.
    pause & exit /b 1
)
if not exist "%NODE%" (
    echo [ERROR] Node.js not found. Please run setup.bat first.
    pause & exit /b 1
)
if not exist "%SERVER_DIR%\pyproject.toml" (
    echo [ERROR] Server source not found. Please run setup.bat first.
    pause & exit /b 1
)

REM ---- Check and repair venv ----
call :check_venv "%SERVER_DIR%" "server"
call :check_venv "%CLIENT_DIR%" "client"

REM ---- Sync .env ----
if exist "%DATA_DIR%\config\server.env" copy /Y "%DATA_DIR%\config\server.env" "%SERVER_DIR%\.env" >nul 2>nul
if exist "%DATA_DIR%\config\client.env" copy /Y "%DATA_DIR%\config\client.env" "%CLIENT_DIR%\.env" >nul 2>nul

for %%D in (config data logs models) do (
    if not exist "%DATA_DIR%\%%D" mkdir "%DATA_DIR%\%%D"
)

echo ================================================
echo   FreeTodo Portable - Starting
echo ================================================
echo.
echo   Backend:   %CENTER_URL%
echo   Frontend:  http://127.0.0.1:%FRONTEND_PORT%
echo   Node ID:   %NODE_ID%
echo   Data:      %DATA_DIR%
echo.

REM [1/6] Phoenix
echo [1/6] Starting Phoenix (observability)...
start /MIN "FreeTodo Phoenix" cmd /c "cd /d %SERVER_DIR% && %UV% run phoenix serve || echo [WARN] Phoenix not available && pause"
timeout /t 2 /nobreak >nul

REM [2/6] Backend
echo [2/6] Starting Backend (port %BACKEND_PORT%)...
set "LIFETRACE_DEPLOYMENT__ROLE=center"
set "LIFETRACE_SERVER__PORT=%BACKEND_PORT%"
set "LIFETRACE_SERVER__HOST=0.0.0.0"
start /MIN "FreeTodo Backend" cmd /k "cd /d %SERVER_DIR% && %UV% run python server.py"
echo   Waiting for database init (10s)...
timeout /t 10 /nobreak >nul

REM [3/6] AgentOS
echo [3/6] Starting AgentOS...
start /MIN "FreeTodo AgentOS" cmd /k "cd /d %SERVER_DIR% && %UV% run python agent_os.py"
timeout /t 3 /nobreak >nul

REM [4/6] Frontend
echo [4/6] Starting Frontend (port %FRONTEND_PORT%)...
set "PORT=%FRONTEND_PORT%"
set "HOSTNAME=0.0.0.0"
set "API_REWRITE_URL=http://127.0.0.1:%BACKEND_PORT%"
start /MIN "FreeTodo Frontend" cmd /k "cd /d %FRONTEND_DIR% && %NODE% server.js"
echo   Waiting for services (10s)...
timeout /t 10 /nobreak >nul

REM [5/6] Sensor
echo [5/6] Starting Perception Daemon...
start /MIN "FreeTodo Sensor" cmd /k "cd /d %CLIENT_DIR% && %UV% run python -m sensor --center-url %CENTER_URL% --node-id %NODE_ID% --debug-images"

REM [6/6] Signal
echo [6/6] Starting Signal Sensor...
start /MIN "FreeTodo Signal" cmd /k "cd /d %CLIENT_DIR% && %UV% run python %SCRIPTS_DIR%\signal-sensor.py --center-url %CENTER_URL% --node-id %NODE_ID%"

echo   Waiting for frontend (5s)...
timeout /t 5 /nobreak >nul
start "" "http://127.0.0.1:%FRONTEND_PORT%"

echo.
echo ================================================
echo   FreeTodo Started! (6 windows)
echo ================================================
echo.
echo   Phoenix:    http://127.0.0.1:6006
echo   AgentOS:    http://127.0.0.1:8002
echo   Backend:    %CENTER_URL%
echo   Frontend:   http://127.0.0.1:%FRONTEND_PORT%
echo   Sensor:     %NODE_ID% -^> %CENTER_URL%
echo   Signal:     notification polling + popup
echo.
echo   Data dir:   %DATA_DIR%
echo   To stop:    Windows-Stop.bat
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

:check_venv
set "_VENV_DIR=%~1\.venv-%PLATFORM%"
set "_NAME=%~2"
if not exist "%_VENV_DIR%\pyvenv.cfg" (
    echo [REPAIR] %_NAME% venv not found, running uv sync...
    "%UV%" sync --directory "%~1" --python-preference only-managed
    exit /b 0
)
findstr /C:"runtime\%PLATFORM%\python" "%_VENV_DIR%\pyvenv.cfg" >nul 2>nul
if !ERRORLEVEL! NEQ 0 (
    echo [REPAIR] %_NAME% venv paths wrong, rebuilding...
    rd /S /Q "%_VENV_DIR%" 2>nul
    "%UV%" sync --directory "%~1" --python-preference only-managed
)
exit /b 0
