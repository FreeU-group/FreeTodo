#!/usr/bin/env bash
set -euo pipefail
# 6. cpolar backend tunnel (TCP)，使用保留地址 -remote-addr 提供稳定端点
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./start-center-env.sh
source "$SCRIPT_DIR/start-center-env.sh"
cpolar tcp -region="$CPOLAR_REGION" -remote-addr="$CPOLAR_TCP_REMOTE_ADDRESS" "$BACKEND_PORT" >>"$LOG_DIR/cpolar_backend_tcp.log" 2>&1 &
echo $! >"$LOG_DIR/cpolar_backend_tcp.pid"
echo "[6/7] cpolar backend TCP started (reserved: $CPOLAR_TCP_REMOTE_ADDRESS -> localhost:$BACKEND_PORT), PID $(cat "$LOG_DIR/cpolar_backend_tcp.pid")"
