@echo off
chcp 65001 >nul 2>nul
REM ================================================================
REM  手动触发 KOL 推送弹窗
REM  将 kol_push_trigger.txt 设为 1，signal-sensor 检测后自动弹窗
REM ================================================================

cd /d "%~dp0"

echo.
echo ==========================================
echo   KOL 推送触发器（场景二 Level 0 彩蛋）
echo ==========================================
echo.

echo [1] 写入触发信号 (kol_push_trigger.txt = 1) ...
echo 1> "kol_push_trigger.txt"
echo     已写入！signal-sensor 将在 2 秒内检测并弹窗。
echo.
echo 完成。如 signal-sensor 未运行，请使用 kol-push-standalone.bat 直接弹窗。
echo.
pause
