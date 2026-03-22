@echo off
REM ================================================================
REM  Local environment config (DO NOT commit to git)
REM  Copy this file and fill in your own values.
REM  Both start-center.bat and start-sensor.bat will load this file.
REM ================================================================

REM --- Service ports (shared by center & sensor scripts) ---
set "BACKEND_PORT=8001"
set "FRONTEND_PORT=3001"

REM --- cpolar config (used by start-center.bat for public tunnels) ---
set "CPOLAR_BACKEND_DOMAIN=tybbackend"
set "CPOLAR_FRONTEND_DOMAIN=tybfront"
set "CPOLAR_REGION=cn"
set "CPOLAR_BACKEND_SUFFIX=cpolar.cn"
set "CPOLAR_FRONTEND_SUFFIX=cpolar.cn"
set "CPOLAR_TCP_TUNNEL_NAME=backend_tcp"
