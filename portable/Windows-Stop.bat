@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion
REM ================================================================
REM  FreeTodo Portable - One-click Stop
REM  停止所有 FreeTodo 服务
REM ================================================================

echo ================================================
echo   FreeTodo Portable - Stopping All
echo ================================================
echo.

REM --- Sensor processes ---
echo --- Stopping Sensor ---
call :kill_window "FreeTodo Sensor"
call :kill_window "FreeTodo Signal"

REM --- Center processes ---
echo.
echo --- Stopping Center ---
call :kill_window "FreeTodo Frontend"
call :kill_window "FreeTodo Backend"
call :kill_window "FreeTodo AgentOS"
call :kill_window "FreeTodo Phoenix"

REM --- Kill by port as fallback ---
echo.
echo --- Port cleanup ---
call :kill_by_port 6006 "Phoenix"
call :kill_by_port 8002 "AgentOS"
call :kill_by_port 8001 "Backend"
call :kill_by_port 3001 "Frontend"

REM --- Orphan cleanup ---
echo.
echo --- Cleaning up orphan processes ---
powershell -NoProfile -Command "$procs = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(python3?|uv|node)\.exe$' -and $_.CommandLine -and ($_.CommandLine -match '-m\s+sensor' -or $_.CommandLine -match 'signal-sensor\.py' -or $_.CommandLine -match 'server\.py' -or $_.CommandLine -match 'agent_os\.py' -or $_.CommandLine -match 'phoenix\s+serve' -or $_.CommandLine -match 'server\.js') }); if($procs.Count -gt 0){ $procs | ForEach-Object { Write-Host ('[STOP] orphan ' + $_.Name + ' (PID ' + $_.ProcessId + ')'); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } else { Write-Host '[OK] No orphan processes' }"

REM --- Sync .env back to data\config ---
set "PORTABLE_ROOT=%~dp0"
if "%PORTABLE_ROOT:~-1%"=="\" set "PORTABLE_ROOT=%PORTABLE_ROOT:~0,-1%"
if exist "%PORTABLE_ROOT%\app\server\.env" (
    copy /Y "%PORTABLE_ROOT%\app\server\.env" "%PORTABLE_ROOT%\data\config\server.env" >nul 2>nul
)
if exist "%PORTABLE_ROOT%\app\client\.env" (
    copy /Y "%PORTABLE_ROOT%\app\client\.env" "%PORTABLE_ROOT%\data\config\client.env" >nul 2>nul
)

echo.
echo ================================================
echo   All Services Stopped
echo ================================================
echo.
pause
endlocal
goto :eof


:kill_window
setlocal
set "TITLE=%~1"
tasklist /FI "WINDOWTITLE eq %TITLE%*" 2>nul | findstr /I /V "^INFO:" | findstr /I ".exe" >nul
if %ERRORLEVEL%==0 (
    echo [STOP] %TITLE%
    taskkill /F /FI "WINDOWTITLE eq %TITLE%*" /T >nul 2>&1
) else (
    echo [SKIP] %TITLE% ^(not running^)
)
endlocal
goto :eof

:kill_by_port
setlocal enabledelayedexpansion
set "PORT=%~1"
set "NAME=%~2"
set "KILLED="
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    if "%%a" NEQ "0" if "%%a" NEQ "" (
        set "SKIP="
        for %%k in (!KILLED!) do (
            if "%%k"=="%%a" set "SKIP=1"
        )
        if not defined SKIP (
            echo [STOP] %NAME% (port %PORT%, PID %%a^)
            taskkill /F /PID %%a >nul 2>&1
            set "KILLED=!KILLED! %%a"
        )
    )
)
if not defined KILLED (
    echo [OK]   %NAME% (port %PORT% not in use^)
)
endlocal
goto :eof
