#!/usr/bin/env bash
set -euo pipefail
# 5. cpolar backend tunnel (HTTP)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./start-center-env.sh
source "$SCRIPT_DIR/start-center-env.sh"
rotate_log "$LOG_DIR/cpolar_backend_http.log"
{ cpolar http -region="$CPOLAR_REGION" -subdomain="$CPOLAR_BACKEND_DOMAIN" "$BACKEND_PORT" 2>&1 | while IFS= read -r line; do echo "$(date '+%Y-%m-%d %H:%M:%S') $line"; done; } >>"$LOG_DIR/cpolar_backend_http.log" &
echo $! >"$LOG_DIR/cpolar_backend_http.pid"
echo "[5/7] cpolar backend HTTP started = $BACKEND_PUBLIC_URL, PID $(cat "$LOG_DIR/cpolar_backend_http.pid")"
