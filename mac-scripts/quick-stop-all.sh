#!/usr/bin/env bash
# ================================================================
#  LifeTrace Quick Stop All (Center + Sensor) — macOS
#  One click to stop everything started by quick-start-all.sh
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$REPO_ROOT/.run-logs"
ENV_FILE="$LOG_DIR/quick-all.env"

# ================================================================
#  Load runtime config
# ================================================================
SESSION="lt-all"
BACKEND_PORT=8001
FRONTEND_PORT=3001

if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
fi

echo "================================================"
echo "   LifeTrace Quick Stop All (macOS)"
echo "================================================"
echo ""

# ================================================================
#  1. Kill tmux session
# ================================================================
if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "[STOP] Killing tmux session '$SESSION'..."
    tmux kill-session -t "$SESSION"
    echo "       Session killed."
else
    echo "[SKIP] tmux session '$SESSION' not found."
fi
sleep 1

# ================================================================
#  Helpers
# ================================================================
kill_by_port() {
    local port="$1"
    local name="$2"
    local pids
    pids="$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
        for pid in $pids; do
            echo "[STOP] $name (port $port, PID $pid)"
            kill -TERM "$pid" 2>/dev/null || true
            sleep 0.5
            kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
        done
    else
        echo "[OK]   $name (port $port clear)"
    fi
}

kill_by_pattern() {
    local pattern="$1"
    local name="$2"
    if pgrep -f "$pattern" &>/dev/null; then
        echo "[STOP] $name"
        pkill -TERM -f "$pattern" 2>/dev/null || true
        sleep 0.5
        pkill -KILL -f "$pattern" 2>/dev/null || true
    else
        echo "[OK]   $name (not running)"
    fi
}

# ================================================================
#  2. Kill Center services by port
# ================================================================
echo ""
echo "--- Stopping Center Node ---"
kill_by_port 6006           "Phoenix"
kill_by_port 8002           "AgentOS"
kill_by_port "$BACKEND_PORT"  "Backend"
kill_by_port "$FRONTEND_PORT" "Frontend"

# ================================================================
#  3. Kill Sensor services by pattern
# ================================================================
echo ""
echo "--- Stopping Sensor Node ---"
kill_by_pattern "python.*sensor"       "Perception Sensor"
kill_by_pattern "signal-sensor\\.py"   "Signal Sensor"

# ================================================================
#  4. Orphan cleanup
# ================================================================
echo ""
echo "--- Cleaning up orphan processes ---"
kill_by_pattern "phoenix\\s+serve"   "Phoenix (orphan)"
kill_by_pattern "agent_os\\.py"      "AgentOS (orphan)"
kill_by_pattern "server\\.py"        "Backend (orphan)"
kill_by_pattern "next-server"        "Frontend (orphan)"
kill_by_pattern "pnpm.*dev"          "Frontend pnpm (orphan)"

# ================================================================
#  5. Remove runtime env file
# ================================================================
rm -f "$ENV_FILE"

echo ""
echo "================================================"
echo "   All Services Stopped"
echo "================================================"
