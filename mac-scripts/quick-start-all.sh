#!/usr/bin/env bash
# ================================================================
#  LifeTrace Quick Start All (Center + Sensor) — macOS / tmux
#  One click to launch everything on the same machine.
#
#  Usage:
#    ./quick-start-all.sh            # start and attach
#    tmux attach -t lt-all           # re-attach later
#    Ctrl+B then arrow keys          # switch between panes
#    Ctrl+B then z                   # zoom/unzoom a pane
#    Ctrl+B then [                   # scroll mode (q to exit)
# ================================================================
set -euo pipefail

SESSION="lt-all"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$REPO_ROOT/local-api"
FRONTEND_DIR="$REPO_ROOT/local-web"
SENSOR_DIR="$REPO_ROOT/local-sensor"
LOG_DIR="$REPO_ROOT/.run-logs"
mkdir -p "$LOG_DIR"

# ================================================================
#  Preflight checks
# ================================================================
if ! command -v tmux &>/dev/null; then
    echo "[ERROR] tmux is required but not found."
    echo "        Install with:  brew install tmux"
    exit 1
fi

# ================================================================
#  Load local config (optional override)
# ================================================================
if [[ -f "$SCRIPT_DIR/local-env.sh" ]]; then
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/local-env.sh"
fi

BACKEND_PORT="${BACKEND_PORT:-8001}"
FRONTEND_PORT="${FRONTEND_PORT:-3001}"
NODE_ID="${NODE_ID:-$(hostname -s)}"

# ================================================================
#  Find a free port
# ================================================================
find_free_port() {
    local port="$1"
    while lsof -iTCP:"$port" -sTCP:LISTEN -t &>/dev/null; do
        port=$((port + 1))
    done
    echo "$port"
}

BACKEND_PORT_ORIG="$BACKEND_PORT"
BACKEND_PORT="$(find_free_port "$BACKEND_PORT")"
FRONTEND_PORT_ORIG="$FRONTEND_PORT"
FRONTEND_PORT="$(find_free_port "$FRONTEND_PORT")"
CENTER_URL="http://127.0.0.1:$BACKEND_PORT"

# ================================================================
#  Ensure .env files exist
# ================================================================
ensure_env() {
    local dir="$1"
    if [[ ! -f "$dir/.env" ]] && [[ -f "$dir/.env.example" ]]; then
        echo "Creating $dir/.env from .env.example ..."
        cp "$dir/.env.example" "$dir/.env"
    fi
}
ensure_env "$SERVER_DIR"
ensure_env "$FRONTEND_DIR"
ensure_env "$SENSOR_DIR"

# ================================================================
#  Validate directories
# ================================================================
for d in "$SERVER_DIR" "$FRONTEND_DIR" "$SENSOR_DIR"; do
    if [[ ! -d "$d" ]]; then
        echo "[ERROR] Directory not found: $d"
        exit 1
    fi
done

# ================================================================
#  Save runtime info for quick-stop-all.sh
# ================================================================
ENV_FILE="$LOG_DIR/quick-all.env"
cat > "$ENV_FILE" <<EOF
BACKEND_PORT="$BACKEND_PORT"
FRONTEND_PORT="$FRONTEND_PORT"
NODE_ID="$NODE_ID"
SESSION="$SESSION"
STARTED_AT="$(date '+%Y-%m-%d %H:%M:%S')"
EOF

# ================================================================
#  Kill existing session if present
# ================================================================
if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "[WARN] Session '$SESSION' already exists — killing it first..."
    tmux kill-session -t "$SESSION"
    sleep 1
fi

# ================================================================
#  Print banner
# ================================================================
echo "================================================"
echo "   LifeTrace Quick Start All (macOS/tmux)"
echo "================================================"
echo ""
echo "  Backend:   $CENTER_URL"
echo "  Frontend:  http://127.0.0.1:$FRONTEND_PORT"
echo "  Node ID:   $NODE_ID"
[[ "$BACKEND_PORT" != "$BACKEND_PORT_ORIG" ]] && echo "  Note: backend port $BACKEND_PORT_ORIG busy, switched to $BACKEND_PORT"
[[ "$FRONTEND_PORT" != "$FRONTEND_PORT_ORIG" ]] && echo "  Note: local-web port $FRONTEND_PORT_ORIG busy, switched to $FRONTEND_PORT"
echo ""

# ================================================================
#  Create tmux session with 6 panes (3 rows x 2 cols)
#
#  Layout:
#    ┌──────────────┬──────────────┐
#    │  Phoenix     │  AgentOS     │
#    ├──────────────┼──────────────┤
#    │  Backend     │  Frontend    │
#    ├──────────────┼──────────────┤
#    │  Sensor      │  Signal      │
#    └──────────────┴──────────────┘
# ================================================================
tmux new-session  -d -s "$SESSION" -x 200 -y 50
tmux split-window -t "$SESSION" -v
tmux split-window -t "$SESSION" -v
tmux select-pane  -t "$SESSION":0.0
tmux split-window -t "$SESSION" -h
tmux select-pane  -t "$SESSION":0.2
tmux split-window -t "$SESSION" -h
tmux select-pane  -t "$SESSION":0.4
tmux split-window -t "$SESSION" -h
tmux select-layout -t "$SESSION" tiled

tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format " #{pane_index}: #{pane_title} "

# ================================================================
#  [Pane 0] Phoenix (observability)
# ================================================================
echo "[1/6] Starting Phoenix (observability)..."
tmux select-pane -t "$SESSION":0.0 -T "Phoenix :6006"
tmux send-keys -t "$SESSION":0.0 \
    "cd '$SERVER_DIR' && echo '--- Phoenix (observability) ---' && uv run phoenix serve || echo '[WARN] Phoenix not available'" C-m

# ================================================================
#  [Pane 1] AgentOS
# ================================================================
echo "[2/6] Starting AgentOS..."
tmux select-pane -t "$SESSION":0.1 -T "AgentOS :8002"
tmux send-keys -t "$SESSION":0.1 \
    "cd '$SERVER_DIR' && echo '--- AgentOS ---' && sleep 2 && uv run python agent_os.py" C-m

# ================================================================
#  [Pane 2] Backend
# ================================================================
echo "[3/6] Starting Backend (port $BACKEND_PORT)..."
tmux select-pane -t "$SESSION":0.2 -T "Backend :$BACKEND_PORT"
tmux send-keys -t "$SESSION":0.2 \
    "cd '$SERVER_DIR' && echo '--- Backend (port $BACKEND_PORT) ---' && export LIFETRACE_DEPLOYMENT__ROLE=center && export LIFETRACE_SERVER__PORT=$BACKEND_PORT && export LIFETRACE_SERVER__HOST=0.0.0.0 && uv run python server.py" C-m

# ================================================================
#  [Pane 3] Frontend (dev mode)
# ================================================================
echo "[4/6] Starting Frontend (dev mode, port $FRONTEND_PORT)..."
tmux select-pane -t "$SESSION":0.3 -T "Frontend :$FRONTEND_PORT"
tmux send-keys -t "$SESSION":0.3 \
    "cd '$FRONTEND_DIR' && echo '--- Frontend (dev, port $FRONTEND_PORT) ---' && echo 'Waiting 10s for backend...' && sleep 10 && export NEXT_PUBLIC_API_URL=http://127.0.0.1:$BACKEND_PORT && export API_REWRITE_URL=http://127.0.0.1:$BACKEND_PORT && pnpm dev --port $FRONTEND_PORT --hostname 0.0.0.0" C-m

# ================================================================
#  [Pane 4] Sensor (perception daemon)
# ================================================================
echo "[5/6] Starting Perception Sensor..."
tmux select-pane -t "$SESSION":0.4 -T "Sensor ($NODE_ID)"
tmux send-keys -t "$SESSION":0.4 \
    "cd '$SENSOR_DIR' && echo '--- Sensor ---' && echo 'Waiting 20s for backend...' && sleep 20 && uv run python -m sensor --center-url '$CENTER_URL' --node-id '$NODE_ID' --debug-images" C-m

# ================================================================
#  [Pane 5] Signal sensor
# ================================================================
echo "[6/6] Starting Signal Sensor..."
tmux select-pane -t "$SESSION":0.5 -T "Signal"
tmux send-keys -t "$SESSION":0.5 \
    "cd '$SENSOR_DIR' && echo '--- Signal Sensor ---' && echo 'Waiting 20s for backend...' && sleep 20 && uv run python '$REPO_ROOT/scripts/signal-sensor.py' --center-url '$CENTER_URL' --node-id '$NODE_ID'" C-m

# ================================================================
#  Open browser after frontend is likely ready
# ================================================================
(sleep 30 && open "http://127.0.0.1:$FRONTEND_PORT" 2>/dev/null) &

# ================================================================
#  Summary & attach
# ================================================================
echo ""
echo "================================================"
echo "   All Services Starting (tmux session: $SESSION)"
echo "================================================"
echo ""
echo "  [0] Phoenix       → http://127.0.0.1:6006"
echo "  [1] AgentOS       → http://127.0.0.1:8002"
echo "  [2] Backend       → $CENTER_URL"
echo "  [3] Frontend      → http://127.0.0.1:$FRONTEND_PORT"
echo "  [4] Sensor        → $NODE_ID → $CENTER_URL"
echo "  [5] Signal        → notification polling + popup"
echo ""
echo "Quick reference:"
echo "  Ctrl+B → arrow   switch panes"
echo "  Ctrl+B → z       zoom/unzoom pane"
echo "  Ctrl+B → [       scroll mode (q to quit)"
echo "  Ctrl+B → d       detach (services keep running)"
echo "  tmux attach -t $SESSION   re-attach"
echo "  bash mac-scripts/quick-stop-all.sh   stop all"
echo ""
echo "Attaching to tmux session in 2 seconds..."
sleep 2

tmux attach -t "$SESSION"
