#!/bin/bash
# ================================================================
#  FreeTodo Portable - Mac Stop All
# ================================================================

echo "================================================"
echo "  FreeTodo Portable - Stopping All"
echo "================================================"
echo ""

# Sync .env back to data/config
PORTABLE_ROOT="$(cd "$(dirname "$0")" && pwd)"
[ -f "$PORTABLE_ROOT/app/local-api/.env" ] && \
    cp "$PORTABLE_ROOT/app/local-api/.env" "$PORTABLE_ROOT/data/config/server.env" 2>/dev/null
[ -f "$PORTABLE_ROOT/app/local-sensor/.env" ] && \
    cp "$PORTABLE_ROOT/app/local-sensor/.env" "$PORTABLE_ROOT/data/config/client.env" 2>/dev/null

kill_by_pattern() {
    local pattern="$1" name="$2"
    local pids
    pids=$(pgrep -f "$pattern" 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "[STOP] $name (PIDs: $pids)"
        echo "$pids" | xargs kill -9 2>/dev/null
    else
        echo "[SKIP] $name (not running)"
    fi
}

kill_by_pattern "python.*server\.py" "Backend"
kill_by_pattern "python.*agent_os\.py" "AgentOS"
kill_by_pattern "phoenix serve" "Phoenix"
kill_by_pattern "python.*-m sensor" "Sensor"
kill_by_pattern "python.*signal-sensor\.py" "Signal"

# Kill Node.js frontend (standalone server.js)
FRONTEND_PIDS=$(pgrep -f "node.*server\.js" 2>/dev/null)
if [ -n "$FRONTEND_PIDS" ]; then
    echo "[STOP] Frontend (PIDs: $FRONTEND_PIDS)"
    echo "$FRONTEND_PIDS" | xargs kill -9 2>/dev/null
else
    echo "[SKIP] Frontend (not running)"
fi

echo ""
echo "================================================"
echo "  All Services Stopped"
echo "================================================"
echo ""
