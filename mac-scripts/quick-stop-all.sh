#!/usr/bin/env bash
# ================================================================
#  LifeTrace Quick Stop All (macOS)
#  One click to stop Center + Sensor + all related processes
# ================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="$REPO_ROOT/.run-pids"

echo "================================================"
echo "   LifeTrace Quick Stop All (macOS)"
echo "================================================"
echo ""

kill_by_pid_file() {
    local name="$1"
    local pidfile="$PID_DIR/$2"
    if [[ -f "$pidfile" ]]; then
        local pid
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            echo "[STOP] $name (PID $pid)"
            kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
            rm -f "$pidfile"
        else
            echo "[SKIP] $name (PID $pid not running)"
            rm -f "$pidfile"
        fi
    else
        echo "[SKIP] $name (no PID file)"
    fi
}

kill_by_port() {
    local port="$1"
    local name="$2"
    local pids
    pids=$(lsof -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
        for pid in $pids; do
            echo "[STOP] $name (port $port, PID $pid)"
            kill -9 "$pid" 2>/dev/null || true
        done
    else
        echo "[SKIP] $name (port $port not in use)"
    fi
}

# --- Phase 1: Stop by PID files ---
echo "--- Stopping by PID files ---"
kill_by_pid_file "Sensor"   "sensor.pid"
kill_by_pid_file "Signal"   "signal.pid"
kill_by_pid_file "Phoenix"  "phoenix.pid"
kill_by_pid_file "AgentOS"  "agent_os.pid"
kill_by_pid_file "Backend"  "backend.pid"
kill_by_pid_file "Frontend" "frontend.pid"

# --- Phase 2: Fallback by port ---
echo ""
echo "--- Checking ports for remaining processes ---"
kill_by_port 6006 "Phoenix"
kill_by_port 8002 "AgentOS"
kill_by_port 8001 "LifeTrace Backend"
kill_by_port 3001 "LifeTrace Frontend"

# --- Phase 3: Orphan cleanup ---
echo ""
echo "--- Cleaning up orphan processes ---"
ORPHANS=$(pgrep -f '(python.*-m sensor|signal-sensor\.py|server\.py|agent_os\.py|phoenix serve)' 2>/dev/null || true)
if [[ -n "$ORPHANS" ]]; then
    for pid in $ORPHANS; do
        CMD=$(ps -p "$pid" -o args= 2>/dev/null || true)
        echo "[STOP] orphan PID $pid ($CMD)"
        kill -9 "$pid" 2>/dev/null || true
    done
else
    echo "[OK] No orphan processes"
fi

echo ""
echo "================================================"
echo "   All Services Stopped"
echo "================================================"
