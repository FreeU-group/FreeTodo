#!/usr/bin/env bash
set -euo pipefail
# 1. Phoenix (observability)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./start-center-env.sh
source "$SCRIPT_DIR/start-center-env.sh"
(cd "$REPO_ROOT" && uv run phoenix serve) >>"$LOG_DIR/phoenix.log" 2>&1 &
echo $! >"$LOG_DIR/phoenix.pid"
echo "[1/7] Phoenix started (http://127.0.0.1:6006), PID $(cat "$LOG_DIR/phoenix.pid")"
