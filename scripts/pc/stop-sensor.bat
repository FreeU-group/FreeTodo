@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion
REM ================================================================
REM  LifeTrace Sensor Node - Stop
REM ================================================================

echo ================================================
echo    LifeTrace Sensor Node Stop
echo ================================================
echo.

tasklist /FI "WINDOWTITLE eq LifeTrace Sensor*" 2>nul | findstr /I "cmd.exe" >nul
if %ERRORLEVEL%==0 (
    echo [STOP] LifeTrace Sensor
    taskkill /FI "WINDOWTITLE eq LifeTrace Sensor*" /F >nul 2>&1
) else (
    echo [SKIP] Sensor not running
)

echo.
echo ================================================
echo    Sensor Node Stopped
echo ================================================
echo.
pause
endlocal
