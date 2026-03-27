#!/usr/bin/env bash
# ================================================================
#  LifeTrace Quick Start All (Center + Sensor) - macOS
#  One click to launch everything on the same machine.
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$REPO_ROOT/server"
FRONTEND_DIR="$REPO_ROOT/frontend"
SENSOR_DIR="$REPO_ROOT/client"
LOG_DIR="$REPO_ROOT/.run-logs"
PID_DIR="$REPO_ROOT/.run-pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

# Load local config
if [[ -f "$SCRIPT_DIR/local-env.sh" ]]; then
    source "$SCRIPT_DIR/local-env.sh"
fi

# Ports
BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"

find_free_port() {
    local port=$1
    while lsof -iTCP:"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1; do
        port=$((port + 1))
    done
    echo "$port"
}

BACKEND_PORT=$(find_free_port "$BACKEND_PORT")
FRONTEND_PORT=$(find_free_port "$FRONTEND_PORT")

CENTER_URL="http://127.0.0.1:$BACKEND_PORT"
NODE_ID="${NODE_ID:-$(hostname -s)}"

echo "================================================"
echo "   LifeTrace Quick Start All (macOS)"
echo "================================================"
echo ""
echo "Backend:   $CENTER_URL"
echo "Frontend:  http://127.0.0.1:$FRONTEND_PORT"
echo "Node ID:   $NODE_ID"
echo ""

# ================================================================
#  Center services
# ================================================================

echo "[1/6] Starting Phoenix (observability)..."
(cd "$SERVER_DIR" && uv run phoenix serve >> "$LOG_DIR/phoenix.log" 2>&1) &
echo $! > "$PID_DIR/phoenix.pid"
sleep 2

echo "[2/6] Starting AgentOS..."
(cd "$SERVER_DIR" && uv run python agent_os.py >> "$LOG_DIR/agent_os.log" 2>&1) &
echo $! > "$PID_DIR/agent_os.pid"
sleep 2

echo "[3/6] Starting Backend (port $BACKEND_PORT)..."
(cd "$SERVER_DIR" && \
    LIFETRACE_DEPLOYMENT__ROLE=center \
    LIFETRACE_SERVER__PORT="$BACKEND_PORT" \
    LIFETRACE_SERVER__HOST=0.0.0.0 \
    uv run python server.py >> "$LOG_DIR/backend.log" 2>&1) &
echo $! > "$PID_DIR/backend.pid"
sleep 5

echo "[4/6] Starting Frontend (dev mode, port $FRONTEND_PORT)..."
(cd "$FRONTEND_DIR" && \
    NEXT_PUBLIC_API_URL="$CENTER_URL" \
    API_REWRITE_URL="http://127.0.0.1:$BACKEND_PORT" \
    pnpm dev --port "$FRONTEND_PORT" --hostname 0.0.0.0 >> "$LOG_DIR/frontend.log" 2>&1) &
echo $! > "$PID_DIR/frontend.pid"

# Wait for backend to be ready
echo "Waiting for backend to be ready (20s)..."
sleep 20

# ================================================================
#  Sensor services
# ================================================================

echo "[5/6] Starting Perception Daemon..."
(cd "$SENSOR_DIR" && \
    uv run python -m sensor \
        --center-url "$CENTER_URL" \
        --node-id "$NODE_ID" \
        --debug-images \
        >> "$LOG_DIR/sensor.log" 2>&1) &
echo $! > "$PID_DIR/sensor.pid"

echo "[6/6] Starting Signal Sensor..."
SIGNAL_SCRIPT="$REPO_ROOT/scripts/signal-sensor.py"
if [[ -f "$SIGNAL_SCRIPT" ]]; then
    (cd "$SENSOR_DIR" && \
        uv run python "$SIGNAL_SCRIPT" \
            --center-url "$CENTER_URL" \
            --node-id "$NODE_ID" \
            >> "$LOG_DIR/signal.log" 2>&1) &
    echo $! > "$PID_DIR/signal.pid"
else
    echo "[WARN] signal-sensor.py not found, skipping"
fi

# Open browser
echo "Waiting for frontend (10s)..."
sleep 10
open "http://127.0.0.1:$FRONTEND_PORT" 2>/dev/null || true

echo ""
echo "================================================"
echo "   All Services Started (6 background processes)"
echo "================================================"
echo ""
echo "  Phoenix:      http://127.0.0.1:6006"
echo "  AgentOS:      http://127.0.0.1:8002"
echo "  Backend:      $CENTER_URL"
echo "  Frontend:     http://127.0.0.1:$FRONTEND_PORT"
echo "  Sensor:       $NODE_ID -> $CENTER_URL"
echo "  Signal:       notification polling + popup"
echo ""
echo "Logs:  $LOG_DIR/"
echo "PIDs:  $PID_DIR/"
echo ""
echo "To stop everything: run mac-scripts/quick-stop-all.sh"
