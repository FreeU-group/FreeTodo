#!/usr/bin/env bash
set -euo pipefail
# 2. AgentOS
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./start-center-env.sh
source "$SCRIPT_DIR/start-center-env.sh"
rotate_log "$LOG_DIR/agent_os.log"
(cd "$REPO_ROOT/server" && uv run python agent_os.py) >>"$LOG_DIR/agent_os.log" 2>&1 &
echo $! >"$LOG_DIR/agent_os.pid"
echo "[2/7] AgentOS started (http://127.0.0.1:8200), PID $(cat "$LOG_DIR/agent_os.pid")"
