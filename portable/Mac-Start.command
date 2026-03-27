#!/bin/bash
# ================================================================
#  FreeTodo Portable - Mac One-click Start
#  双击启动所有服务
# ================================================================

PORTABLE_ROOT="$(cd "$(dirname "$0")" && pwd)"

# ---- Detect architecture ----
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
    PLATFORM="mac-arm64"
else
    PLATFORM="mac-x64"
fi

RT="$PORTABLE_ROOT/runtime/$PLATFORM"

# ---- Paths ----
UV="$RT/uv"
NODE_BIN="$RT/node/bin/node"
SERVER_DIR="$PORTABLE_ROOT/app/server"
CLIENT_DIR="$PORTABLE_ROOT/app/client"
FRONTEND_DIR="$PORTABLE_ROOT/app/frontend"
SCRIPTS_DIR="$PORTABLE_ROOT/app/scripts"
DATA_DIR="$PORTABLE_ROOT/data"

# ---- Python UTF-8 ----
export PYTHONUTF8=1

# ---- uv portable config ----
export UV_PYTHON_INSTALL_DIR="$RT/python"
export UV_CACHE_DIR="$RT/uv-cache"
export UV_PROJECT_ENVIRONMENT=".venv-$PLATFORM"

# ---- Data directory ----
export LIFETRACE_DATA_DIR="$DATA_DIR"
export FREETODO_CLIENT_DATA_DIR="$DATA_DIR"

# ---- HuggingFace cache ----
export HF_HOME="$DATA_DIR/models"
export SENTENCE_TRANSFORMERS_HOME="$DATA_DIR/models/sentence-transformers"

# ---- Load local config ----
[ -f "$PORTABLE_ROOT/local-env.sh" ] && source "$PORTABLE_ROOT/local-env.sh"

# ---- Ports ----
BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"

find_free_port() {
    local port=$1
    while lsof -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; do
        port=$((port + 1))
    done
    echo $port
}

BACKEND_PORT=$(find_free_port $BACKEND_PORT)
FRONTEND_PORT=$(find_free_port $FRONTEND_PORT)

CENTER_URL="http://127.0.0.1:$BACKEND_PORT"
NODE_ID="$(hostname -s)"

LOG_DIR="$DATA_DIR/logs"
mkdir -p "$LOG_DIR" "$DATA_DIR/config" "$DATA_DIR/data" "$DATA_DIR/models"

# ================================================================
#  Pre-flight checks
# ================================================================
if [ ! -f "$UV" ]; then
    echo "[ERROR] uv not found: $UV"
    echo "        Please run setup.sh first."
    read -p "Press enter to exit..."
    exit 1
fi
if [ ! -f "$NODE_BIN" ]; then
    echo "[ERROR] Node.js not found: $NODE_BIN"
    echo "        Please run setup.sh first."
    read -p "Press enter to exit..."
    exit 1
fi

# ================================================================
#  Check and repair venv
# ================================================================
check_venv() {
    local dir="$1" name="$2"
    local venv_dir="$dir/.venv-$PLATFORM"
    if [ ! -f "$venv_dir/pyvenv.cfg" ]; then
        echo "[REPAIR] $name venv not found, running uv sync..."
        "$UV" sync --directory "$dir" --python-preference only-managed
    elif ! grep -q "runtime/$PLATFORM/python" "$venv_dir/pyvenv.cfg" 2>/dev/null; then
        echo "[REPAIR] $name venv points to wrong runtime, rebuilding..."
        rm -rf "$venv_dir"
        "$UV" sync --directory "$dir" --python-preference only-managed
    fi
}

check_venv "$SERVER_DIR" "server"
check_venv "$CLIENT_DIR" "client"

# ================================================================
#  Sync .env
# ================================================================
[ -f "$DATA_DIR/config/server.env" ] && cp "$DATA_DIR/config/server.env" "$SERVER_DIR/.env"
[ -f "$DATA_DIR/config/client.env" ] && cp "$DATA_DIR/config/client.env" "$CLIENT_DIR/.env"

echo "================================================"
echo "  FreeTodo Portable - Starting ($PLATFORM)"
echo "================================================"
echo ""
echo "  Backend:   $CENTER_URL"
echo "  Frontend:  http://127.0.0.1:$FRONTEND_PORT"
echo "  Node ID:   $NODE_ID"
echo "  Data:      $DATA_DIR"
echo ""

# ================================================================
#  Start services
# ================================================================

echo "[1/6] Starting Phoenix..."
cd "$SERVER_DIR" && "$UV" run phoenix serve >> "$LOG_DIR/phoenix.log" 2>&1 &
sleep 2

echo "[2/6] Starting Backend (port $BACKEND_PORT)..."
cd "$SERVER_DIR" && \
    LIFETRACE_DEPLOYMENT__ROLE=center \
    LIFETRACE_SERVER__PORT=$BACKEND_PORT \
    LIFETRACE_SERVER__HOST=0.0.0.0 \
    "$UV" run python server.py >> "$LOG_DIR/server.log" 2>&1 &
echo "  Waiting for database init (10s)..."
sleep 10

echo "[3/6] Starting AgentOS..."
cd "$SERVER_DIR" && "$UV" run python agent_os.py >> "$LOG_DIR/agent_os.log" 2>&1 &
sleep 3

echo "[4/6] Starting Frontend (port $FRONTEND_PORT)..."
cd "$FRONTEND_DIR" && \
    PORT=$FRONTEND_PORT \
    HOSTNAME=0.0.0.0 \
    API_REWRITE_URL="http://127.0.0.1:$BACKEND_PORT" \
    "$NODE_BIN" server.js >> "$LOG_DIR/frontend.log" 2>&1 &
sleep 5

echo "[5/6] Starting Perception Daemon..."
cd "$CLIENT_DIR" && "$UV" run python -m sensor \
    --center-url "$CENTER_URL" --node-id "$NODE_ID" \
    >> "$LOG_DIR/sensor.log" 2>&1 &

echo "[6/6] Starting Signal Sensor..."
cd "$CLIENT_DIR" && "$UV" run python "$SCRIPTS_DIR/signal-sensor.py" \
    --center-url "$CENTER_URL" --node-id "$NODE_ID" \
    >> "$LOG_DIR/signal.log" 2>&1 &

# Open browser
sleep 3
open "http://127.0.0.1:$FRONTEND_PORT" 2>/dev/null || true

echo ""
echo "================================================"
echo "  FreeTodo Started! ($PLATFORM)"
echo "================================================"
echo ""
echo "  Phoenix:    http://127.0.0.1:6006"
echo "  AgentOS:    http://127.0.0.1:8002"
echo "  Backend:    $CENTER_URL"
echo "  Frontend:   http://127.0.0.1:$FRONTEND_PORT"
echo "  Sensor:     $NODE_ID -> $CENTER_URL"
echo ""
echo "  Logs:       $LOG_DIR"
echo ""
echo "  To stop: run Mac-Stop.command"
echo "  Press Ctrl+C or close this window to stop all."
echo ""

# Keep script alive; trap to clean up on exit
cleanup() {
    echo ""
    echo "Stopping all services..."
    # Sync .env back to data/config before stopping
    [ -f "$SERVER_DIR/.env" ] && cp "$SERVER_DIR/.env" "$DATA_DIR/config/server.env" 2>/dev/null
    [ -f "$CLIENT_DIR/.env" ] && cp "$CLIENT_DIR/.env" "$DATA_DIR/config/client.env" 2>/dev/null
    pkill -f "python.*server\.py" 2>/dev/null
    pkill -f "python.*agent_os\.py" 2>/dev/null
    pkill -f "phoenix serve" 2>/dev/null
    pkill -f "python.*-m sensor" 2>/dev/null
    pkill -f "python.*signal-sensor\.py" 2>/dev/null
    pkill -f "node.*server\.js" 2>/dev/null
    echo "All stopped."
}
trap cleanup EXIT
wait
