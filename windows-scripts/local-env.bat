@echo off
REM ================================================================
REM  Local environment config (DO NOT commit to git)
REM  Copy this file and fill in your own values.
REM  Both start-center.bat and start-sensor.bat will load this file.
REM ================================================================

REM --- Service ports (shared by center & sensor scripts) ---
set "BACKEND_PORT=8001"
set "FRONTEND_PORT=3001"

REM --- cpolar config (disabled - no longer needed) ---
REM set "CPOLAR_BACKEND_DOMAIN=tybbackend"
REM set "CPOLAR_FRONTEND_DOMAIN=tybfront"
REM set "CPOLAR_REGION=cn"
REM set "CPOLAR_BACKEND_SUFFIX=cpolar.cn"
REM set "CPOLAR_FRONTEND_SUFFIX=cpolar.cn"
REM set "CPOLAR_TCP_TUNNEL_NAME=backend_tcp"
