#!/usr/bin/env bash
set -euo pipefail
# 3. Backend (center mode)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./start-center-env.sh
source "$SCRIPT_DIR/start-center-env.sh"
(cd "$REPO_ROOT" && uv run python -m lifetrace.server --role center) >>"$LOG_DIR/backend_center.log" 2>&1 &
echo $! >"$LOG_DIR/backend_center.pid"
echo "[3/7] Backend (center) started (http://0.0.0.0:$BACKEND_PORT), PID $(cat "$LOG_DIR/backend_center.pid")"
