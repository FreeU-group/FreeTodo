@echo off
REM ================================================================
REM  Local environment config (DO NOT commit to git)
REM  Copy this file and fill in your own values.
REM  Both start-center.bat and start-sensor.bat will load this file.
REM ================================================================

REM cpolar subdomains (from your cpolar dashboard)
set "CPOLAR_BACKEND_DOMAIN=tybbackend"
set "CPOLAR_FRONTEND_DOMAIN=tybfront"
REM cpolar region must match the region used when reserving subdomains
REM China=cn (.cpolar.cn) | China Top=cn_top (.cpolar.top) | China VIP=cn_vip
set "CPOLAR_REGION=cn"
set "CPOLAR_BACKEND_SUFFIX=cpolar.cn"
set "CPOLAR_FRONTEND_SUFFIX=cpolar.cn"
REM Named TCP tunnel in cpolar.yml for mobile WebSocket (default: backend_tcp)
REM Configure remote_addr in cpolar.yml to use reserved fixed TCP address.
set "CPOLAR_TCP_TUNNEL_NAME=backend_tcp"
