#!/usr/bin/env bash
# ================================================================
#  LifeTrace Center Node - Stop All (macOS)
# ================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_DIR="$REPO_ROOT/.run-pids"

echo "================================================"
echo "   LifeTrace Center Node Stop (macOS)"
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

# Stop by PID files first
kill_by_pid_file "Phoenix"  "phoenix.pid"
kill_by_pid_file "AgentOS"  "agent_os.pid"
kill_by_pid_file "Backend"  "backend.pid"
kill_by_pid_file "Frontend" "frontend.pid"

# Fallback: stop by port
echo ""
echo "--- Checking ports for orphan processes ---"
kill_by_port 6006 "Phoenix"
kill_by_port 8002 "AgentOS"
kill_by_port 8001 "LifeTrace Backend"
kill_by_port 3001 "LifeTrace Frontend"

echo ""
echo "================================================"
echo "   Center Node Stopped"
echo "================================================"
