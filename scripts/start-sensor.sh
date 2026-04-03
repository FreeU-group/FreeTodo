#!/usr/bin/env bash
# ================================================================
#  LifeTrace Sensor Node - One-click Startup
#  Start perception daemon + open browser to Center
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/start-center-env.sh"
cd "$REPO_ROOT"

CENTER_URL="$BACKEND_PUBLIC_URL"
CENTER_FRONTEND_URL="$FRONTEND_PUBLIC_URL"
PIDFILE="$REPO_ROOT/.run-logs/sensor.pid"

# Node ID (defaults to hostname)
NODE_ID="${NODE_ID:-$(hostname)}"

# ================================================================
#  Startup
# ================================================================

echo "================================================"
echo "   LifeTrace Sensor Node Startup"
echo "================================================"
echo
echo "Center backend:  $CENTER_URL"
echo "Center frontend: $CENTER_FRONTEND_URL"
echo "Node ID:         $NODE_ID"
echo

# Check Center connectivity
echo "Checking Center connectivity..."
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$CENTER_URL/health" 2>/dev/null || echo "000")

if [[ "$HEALTH_CODE" == "200" ]]; then
    echo "Center connection OK"
else
    echo "[WARNING] Center not reachable (HTTP $HEALTH_CODE)"
    echo "Sensor will keep retrying..."
fi
echo

SENSOR_DIR="$REPO_ROOT/local-sensor"

cleanup() {
    echo
    echo "Shutting down sensor processes..."
    # Kill entire process groups so grandchild processes (python) also die
    for pid in "${SENSOR_PID:-}" "${SIGNAL_PID:-}"; do
        [[ -n "$pid" ]] && kill -- -"$pid" 2>/dev/null || true
    done
    wait 2>/dev/null || true
    rm -f "$PIDFILE"
    echo "All processes stopped."
}
trap cleanup EXIT INT TERM

# Start perception daemon (setsid gives it its own process group)
echo "[1/3] Starting perception daemon..."
( cd "$SENSOR_DIR" && exec setsid uv run python -m sensor --center-url "$CENTER_URL" --node-id "$NODE_ID" --debug-images ) &
SENSOR_PID=$!

# Start signal-sensor (setsid for clean group kill)
echo "[2/3] Starting signal-sensor (notification polling + popup)..."
SIGNAL_SCRIPT="$REPO_ROOT/scripts/signal-sensor.py"
( cd "$SENSOR_DIR" && exec setsid uv run python "$SIGNAL_SCRIPT" --center-url "$CENTER_URL" --node-id "$NODE_ID" ) &
SIGNAL_PID=$!
echo "Signal sensor started (center: $CENTER_URL, node: $NODE_ID)"

# Write PID file for stop-sensor.sh
echo "$$" > "$PIDFILE"
echo "$SENSOR_PID" >> "$PIDFILE"
echo "$SIGNAL_PID" >> "$PIDFILE"

# Open browser
echo "[3/3] Opening browser..."
sleep 2
if command -v xdg-open &>/dev/null; then
    xdg-open "$CENTER_FRONTEND_URL" &>/dev/null &
elif command -v open &>/dev/null; then
    open "$CENTER_FRONTEND_URL"
else
    echo "Could not detect browser opener. Please open manually: $CENTER_FRONTEND_URL"
fi

echo
echo "================================================"
echo "   Sensor Node Started"
echo "================================================"
echo
echo "Perception daemon: screenshot + OCR + proactive OCR = $CENTER_URL"
echo "Signal sensor:     notification polling + interactive popup"
echo "Browser opened:    $CENTER_FRONTEND_URL"
echo
echo "Tip: press Ctrl+C or run scripts/stop-sensor.sh to stop."
echo

wait
