#!/usr/bin/env bash
# ================================================================
#  LifeTrace PC Node - Stop All (macOS / tmux)
# ================================================================
set -euo pipefail

SESSION="lt-local"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.run-logs/local.env"

echo "================================================"
echo "   LifeTrace PC Node Stop (macOS)"
echo "================================================"
echo ""

# ================================================================
#  Load runtime config
# ================================================================
FRONTEND_PORT=3001

if [[ -f "$ENV_FILE" ]]; then
    echo "Reading runtime config from $ENV_FILE"
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    echo "  Frontend=$FRONTEND_PORT"
    echo ""
else
    echo "[WARN] $ENV_FILE not found, using default ports."
    echo ""
fi

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
            kill -9 "$pid" 2>/dev/null || true
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
        pkill -9 -f "$pattern" 2>/dev/null || true
    else
        echo "[OK]   $name (not running)"
    fi
}

# ================================================================
#  2. Kill by port + process name
# ================================================================
echo ""
echo "Cleaning up processes..."

kill_by_port "$FRONTEND_PORT" "Frontend"
for port in $(seq 3001 3010); do
    [[ "$port" == "$FRONTEND_PORT" ]] && continue
    pids="$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
        for pid in $pids; do
            echo "[STOP] unknown service (port $port, PID $pid)"
            kill -9 "$pid" 2>/dev/null || true
        done
    fi
done

kill_by_pattern "next-server"         "Frontend (next)"
kill_by_pattern "pnpm.*dev"           "Frontend (pnpm)"
kill_by_pattern "python.*sensor"      "Sensor"
kill_by_pattern "signal-sensor\.py"   "Signal sensor"

# ================================================================
#  3. Remove env file
# ================================================================
rm -f "$ENV_FILE"

echo ""
echo "================================================"
echo "   PC Node Stopped"
echo "================================================"
