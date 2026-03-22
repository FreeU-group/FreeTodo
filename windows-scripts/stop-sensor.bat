@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion
REM ================================================================
REM  LifeTrace Sensor Node - Stop All
REM  Kills: perception daemon + signal sensor + all child processes
REM ================================================================

echo ================================================
echo    LifeTrace Sensor Node Stop
echo ================================================
echo.

REM --- Phase 1: Tree-kill by window title ---
call :kill_window "LifeTrace Sensor"
call :kill_window "LifeTrace Signal"

REM --- Phase 2: Kill orphan python/uv processes that survived ---
echo.
echo Scanning for orphan processes...
powershell -NoProfile -Command "$procs = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(python3?|uv)\.exe$' -and $_.CommandLine -and ($_.CommandLine -match '-m\s+sensor' -or $_.CommandLine -match 'signal-sensor\.py') }); if($procs.Count -gt 0){ $procs | ForEach-Object { Write-Host ('[STOP] orphan ' + $_.Name + ' (PID ' + $_.ProcessId + ')'); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } else { Write-Host '[OK] No orphan processes' }"

echo.
echo ================================================
echo    Sensor Node Stopped
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
    echo [STOP] %TITLE% ^(tree kill^)
    taskkill /F /FI "WINDOWTITLE eq %TITLE%*" /T >nul 2>&1
) else (
    echo [SKIP] %TITLE% ^(window not found^)
)
endlocal
goto :eof
