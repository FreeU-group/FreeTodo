#!/usr/bin/env bash
set -euo pipefail
# 1. Phoenix (observability)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./start-center-env.sh
source "$SCRIPT_DIR/start-center-env.sh"
rotate_log "$LOG_DIR/phoenix.log"
(cd "$REPO_ROOT/local-api" && uv run phoenix serve) >>"$LOG_DIR/phoenix.log" 2>&1 &
echo $! >"$LOG_DIR/phoenix.pid"
echo "[1/7] Phoenix started (http://127.0.0.1:6006), PID $(cat "$LOG_DIR/phoenix.pid")"
