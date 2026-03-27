#!/usr/bin/env bash
# ================================================================
#  LifeTrace Sensor Node - One-click Startup (macOS)
#  Start perception daemon + signal sensor + open browser
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SENSOR_DIR="$REPO_ROOT/client"
LOG_DIR="$REPO_ROOT/.run-logs"
PID_DIR="$REPO_ROOT/.run-pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

# Load local config
if [[ -f "$SCRIPT_DIR/local-env.sh" ]]; then
    source "$SCRIPT_DIR/local-env.sh"
fi

# Defaults (override in local-env.sh)
BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"
CENTER_URL="${CENTER_URL:-http://127.0.0.1:$BACKEND_PORT}"
CENTER_FRONTEND_URL="http://127.0.0.1:$FRONTEND_PORT"
NODE_ID="${NODE_ID:-$(hostname -s)}"

echo "================================================"
echo "   LifeTrace Sensor Node Startup (macOS)"
echo "================================================"
echo ""
echo "Center backend:  $CENTER_URL"
echo "Center frontend: $CENTER_FRONTEND_URL"
echo "Node ID:         $NODE_ID"
echo ""

# Check Center connectivity
echo "Checking Center connectivity..."
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$CENTER_URL/health" 2>/dev/null || echo "000")
if [[ "$HEALTH_CODE" == "200" ]]; then
    echo "Center connection OK"
else
    echo "[WARNING] Center not reachable (HTTP $HEALTH_CODE)"
    echo "Make sure the center is running first."
    echo "Sensor will keep retrying..."
fi
echo ""

# 1. Perception daemon
echo "[1/3] Starting perception daemon..."
(cd "$SENSOR_DIR" && \
    uv run python -m sensor \
        --center-url "$CENTER_URL" \
        --node-id "$NODE_ID" \
        --debug-images \
        >> "$LOG_DIR/sensor.log" 2>&1) &
echo $! > "$PID_DIR/sensor.pid"

# 2. Signal sensor
echo "[2/3] Starting signal-sensor (notification polling + popup)..."
SIGNAL_SCRIPT="$REPO_ROOT/scripts/signal-sensor.py"
if [[ -f "$SIGNAL_SCRIPT" ]]; then
    (cd "$SENSOR_DIR" && \
        uv run python "$SIGNAL_SCRIPT" \
            --center-url "$CENTER_URL" \
            --node-id "$NODE_ID" \
            >> "$LOG_DIR/signal.log" 2>&1) &
    echo $! > "$PID_DIR/signal.pid"
else
    echo "[WARN] signal-sensor.py not found at $SIGNAL_SCRIPT, skipping"
fi

# 3. Open browser
echo "[3/3] Opening browser..."
sleep 2
open "$CENTER_FRONTEND_URL" 2>/dev/null || true

echo ""
echo "================================================"
echo "   Sensor Node Started"
echo "================================================"
echo ""
echo "Perception daemon: screenshot + OCR -> $CENTER_URL"
echo "Signal sensor:     notification polling + interactive popup"
echo "Browser opened:    $CENTER_FRONTEND_URL"
echo ""
echo "Logs:  $LOG_DIR/"
echo "PIDs:  $PID_DIR/"
echo ""
echo "To stop: run mac-scripts/stop-sensor.sh"
