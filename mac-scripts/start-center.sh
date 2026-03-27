#!/usr/bin/env bash
# ================================================================
#  LifeTrace Center Node - One-click Startup (macOS)
#  Phoenix -> AgentOS -> Backend(center) -> Frontend
# ================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$REPO_ROOT/server"
FRONTEND_DIR="$REPO_ROOT/frontend"
LOG_DIR="$REPO_ROOT/.run-logs"
PID_DIR="$REPO_ROOT/.run-pids"
mkdir -p "$LOG_DIR" "$PID_DIR"

# Load local config
if [[ -f "$SCRIPT_DIR/local-env.sh" ]]; then
    source "$SCRIPT_DIR/local-env.sh"
fi

# Ports (override in local-env.sh)
BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"

find_free_port() {
    local port=$1
    while lsof -iTCP:"$port" -sTCP:LISTEN -P -n >/dev/null 2>&1; do
        port=$((port + 1))
    done
    echo "$port"
}

BACKEND_PORT_PREFERRED="$BACKEND_PORT"
FRONTEND_PORT_PREFERRED="$FRONTEND_PORT"
BACKEND_PORT=$(find_free_port "$BACKEND_PORT")
FRONTEND_PORT=$(find_free_port "$FRONTEND_PORT")

BACKEND_PUBLIC_URL="http://127.0.0.1:$BACKEND_PORT"
FRONTEND_PUBLIC_URL="http://127.0.0.1:$FRONTEND_PORT"

# Validate
if [[ ! -f "$SERVER_DIR/pyproject.toml" ]]; then
    echo "[ERROR] Server directory not found: $SERVER_DIR"
    exit 1
fi
if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
    echo "[ERROR] Frontend directory not found: $FRONTEND_DIR"
    exit 1
fi

echo "================================================"
echo "   LifeTrace Center Node Startup (macOS)"
echo "================================================"
echo ""
echo "Backend local:   http://0.0.0.0:$BACKEND_PORT"
echo "Backend public:  $BACKEND_PUBLIC_URL"
echo "Frontend local:  http://0.0.0.0:$FRONTEND_PORT"
echo "Frontend public: $FRONTEND_PUBLIC_URL"
[[ "$BACKEND_PORT" != "$BACKEND_PORT_PREFERRED" ]] && echo "Note: backend preferred port $BACKEND_PORT_PREFERRED busy, switched to $BACKEND_PORT"
[[ "$FRONTEND_PORT" != "$FRONTEND_PORT_PREFERRED" ]] && echo "Note: frontend preferred port $FRONTEND_PORT_PREFERRED busy, switched to $FRONTEND_PORT"
echo ""

# 1. Phoenix (observability)
echo "[1/4] Starting Phoenix (observability)..."
(cd "$SERVER_DIR" && uv run phoenix serve >> "$LOG_DIR/phoenix.log" 2>&1) &
echo $! > "$PID_DIR/phoenix.pid"
sleep 2

# 2. AgentOS
echo "[2/4] Starting AgentOS..."
(cd "$SERVER_DIR" && uv run python agent_os.py >> "$LOG_DIR/agent_os.log" 2>&1) &
echo $! > "$PID_DIR/agent_os.pid"
sleep 2

# 3. Backend (center mode)
echo "[3/4] Starting LifeTrace Server (center mode, port $BACKEND_PORT)..."
(cd "$SERVER_DIR" && \
    LIFETRACE_DEPLOYMENT__ROLE=center \
    LIFETRACE_SERVER__PORT="$BACKEND_PORT" \
    LIFETRACE_SERVER__HOST=0.0.0.0 \
    uv run python server.py >> "$LOG_DIR/backend.log" 2>&1) &
echo $! > "$PID_DIR/backend.pid"
sleep 5

# 4. Frontend
echo "[4/4] Starting Frontend (port $FRONTEND_PORT)..."
(cd "$FRONTEND_DIR" && \
    NEXT_PUBLIC_API_URL="$BACKEND_PUBLIC_URL" \
    API_REWRITE_URL="http://127.0.0.1:$BACKEND_PORT" \
    pnpm dev --port "$FRONTEND_PORT" --hostname 0.0.0.0 >> "$LOG_DIR/frontend.log" 2>&1) &
echo $! > "$PID_DIR/frontend.pid"

echo ""
echo "================================================"
echo "   Center Node Started (4 background processes)"
echo "================================================"
echo ""
echo "Services:"
echo "  Phoenix:      http://127.0.0.1:6006"
echo "  AgentOS:      http://127.0.0.1:8002"
echo "  Backend:      http://0.0.0.0:$BACKEND_PORT"
echo "  Frontend:     http://0.0.0.0:$FRONTEND_PORT"
echo ""
echo "Logs:  $LOG_DIR/"
echo "PIDs:  $PID_DIR/"
echo ""
echo "To stop: run mac-scripts/stop-center.sh"
