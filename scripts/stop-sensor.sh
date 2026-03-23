#!/usr/bin/env bash
# ================================================================
#  LifeTrace Sensor Node - Stop
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PIDFILE="$REPO_ROOT/.run-logs/sensor.pid"

echo "================================================"
echo "   LifeTrace Sensor Node Stop"
echo "================================================"
echo

if [[ ! -f "$PIDFILE" ]]; then
    echo "[SKIP] PID file not found — sensor may not be running."
    echo "       You can also try:  pkill -f 'python -m sensor'"
    exit 0
fi

while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    if kill -0 "$pid" 2>/dev/null; then
        echo "[STOP] Killing process group $pid ..."
        kill -- -"$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
    else
        echo "[SKIP] PID $pid not running"
    fi
done < "$PIDFILE"

rm -f "$PIDFILE"

echo
echo "================================================"
echo "   Sensor Node Stopped"
echo "================================================"
