#!/usr/bin/env bash
set -euo pipefail
# 7. cpolar frontend tunnel
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./start-center-env.sh
source "$SCRIPT_DIR/start-center-env.sh"
cpolar http -region="$CPOLAR_REGION" -subdomain="$CPOLAR_FRONTEND_DOMAIN" "$FRONTEND_PORT" >>"$LOG_DIR/cpolar_frontend.log" 2>&1 &
echo $! >"$LOG_DIR/cpolar_frontend.pid"
echo "[7/7] cpolar frontend started = $FRONTEND_PUBLIC_URL, PID $(cat "$LOG_DIR/cpolar_frontend.pid")"
