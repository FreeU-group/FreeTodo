@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion
REM ================================================================
REM  LifeTrace Center Node - Stop All
REM ================================================================

echo ================================================
echo    LifeTrace Center Node Stop
echo ================================================
echo.

call :kill_by_port 6006 "Phoenix"
call :kill_by_port 8002 "AgentOS"
call :kill_by_port 8001 "LifeTrace Backend"
call :kill_by_port 3001 "LifeTrace Frontend"
REM [cpolar disabled] call :kill_by_name "cpolar" "cpolar tunnel"

echo.
echo ================================================
echo    Center Node Stopped
echo ================================================
echo.
pause
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
    echo [SKIP] %NAME% (port %PORT% not in use^)
)
endlocal
goto :eof

:kill_by_name
setlocal
set "PROC=%~1"
set "NAME=%~2"
tasklist /FI "IMAGENAME eq %PROC%.exe" 2>nul | findstr /I "%PROC%.exe" >nul
if %ERRORLEVEL%==0 (
    echo [STOP] %NAME%
    taskkill /F /IM "%PROC%.exe" >nul 2>&1
) else (
    echo [SKIP] %NAME% (not running^)
)
endlocal
goto :eof
