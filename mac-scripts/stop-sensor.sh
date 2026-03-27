#!/usr/bin/env bash
# ================================================================
#  LifeTrace Sensor Node - Stop All (macOS)
#  Kills: perception daemon + signal sensor + orphan processes
# ================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="$REPO_ROOT/.run-pids"

echo "================================================"
echo "   LifeTrace Sensor Node Stop (macOS)"
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

# Stop by PID files
kill_by_pid_file "Sensor"  "sensor.pid"
kill_by_pid_file "Signal"  "signal.pid"

# Orphan cleanup
echo ""
echo "--- Scanning for orphan processes ---"
ORPHANS=$(pgrep -f '(python.*-m sensor|signal-sensor\.py)' 2>/dev/null || true)
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
echo "   Sensor Node Stopped"
echo "================================================"
