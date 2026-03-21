#!/usr/bin/env bash
# ================================================================
#  LifeTrace Sensor Node - One-click Startup
#  Start perception daemon + open browser to Center
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ================================================================
#  Load local config (if exists)
# ================================================================
if [[ -f "$SCRIPT_DIR/local-env.sh" ]]; then
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/local-env.sh"
fi

# Fallback defaults (override in scripts/local-env.sh)
: "${CPOLAR_BACKEND_DOMAIN:=YOUR_BACKEND_SUBDOMAIN}"
: "${CPOLAR_FRONTEND_DOMAIN:=YOUR_FRONTEND_SUBDOMAIN}"
: "${CPOLAR_DOMAIN_SUFFIX:=}"
: "${CPOLAR_BACKEND_SUFFIX:=${CPOLAR_DOMAIN_SUFFIX:-cpolar.cn}}"
: "${CPOLAR_FRONTEND_SUFFIX:=${CPOLAR_DOMAIN_SUFFIX:-cpolar.cn}}"

CENTER_URL="https://${CPOLAR_BACKEND_DOMAIN}.${CPOLAR_BACKEND_SUFFIX}"
CENTER_FRONTEND_URL="https://${CPOLAR_FRONTEND_DOMAIN}.${CPOLAR_FRONTEND_SUFFIX}"

# Node ID (defaults to hostname)
NODE_ID="${NODE_ID:-$(hostname)}"

# ================================================================
#  Validate config
# ================================================================
if [[ "$CPOLAR_BACKEND_DOMAIN" == "YOUR_BACKEND_SUBDOMAIN" ]]; then
    echo "[ERROR] Please create scripts/local-env.sh with your cpolar subdomains."
    echo
    exit 1
fi

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

SENSOR_DIR="$REPO_ROOT/client"
SENSOR_CMD="uv run python -m sensor --center-url $CENTER_URL --node-id $NODE_ID --debug-images"

cleanup() {
    echo
    echo "Shutting down sensor processes..."
    kill "${SENSOR_PID:-}" "${SIGNAL_PID:-}" 2>/dev/null || true
    wait "${SENSOR_PID:-}" "${SIGNAL_PID:-}" 2>/dev/null || true
    echo "All processes stopped."
}
trap cleanup EXIT INT TERM

# Start perception daemon
echo "[1/3] Starting perception daemon..."
(cd "$SENSOR_DIR" && $SENSOR_CMD) &
SENSOR_PID=$!

# Start signal-sensor (unified notification daemon + interactive popup)
echo "[2/3] Starting signal-sensor (notification polling + popup)..."
SIGNAL_SCRIPT="$REPO_ROOT/scripts/signal-sensor.py"
(cd "$REPO_ROOT/client" && uv run python "$SIGNAL_SCRIPT" --center-url "$CENTER_URL" --node-id "$NODE_ID") &
SIGNAL_PID=$!
echo "Signal sensor started (center: $CENTER_URL, node: $NODE_ID)"

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
echo "Tip: press Ctrl+C to stop all sensor processes."
echo

wait
