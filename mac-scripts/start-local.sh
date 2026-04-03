#!/usr/bin/env bash
# ================================================================
#  LifeTrace PC Node - One-click Startup (macOS / tmux)
#  Frontend + Sensor, connecting to remote Center node.
#
#  Usage:
#    ./start-local.sh            # start and attach
#    tmux attach -t lt-local     # re-attach later
#    Ctrl+B then arrow keys      # switch between panes
#    Ctrl+B then z               # zoom/unzoom a pane
#    Ctrl+B then [               # scroll mode (q to exit)
# ================================================================
set -euo pipefail

SESSION="lt-local"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/local-web"
CLIENT_DIR="$REPO_ROOT/local-sensor"
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
#  Load local config
# ================================================================
if [[ -f "$SCRIPT_DIR/local-env.sh" ]]; then
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/local-env.sh"
fi

CENTER_URL="${CENTER_URL:-http://8.136.125.174:8666}"
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

FRONTEND_PORT_PREFERRED="$FRONTEND_PORT"
FRONTEND_PORT="$(find_free_port "$FRONTEND_PORT")"

# ================================================================
#  Validate
# ================================================================
if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
    echo "[ERROR] local-web directory not found: $FRONTEND_DIR"
    exit 1
fi

if [[ ! -d "$CLIENT_DIR" ]]; then
    echo "[ERROR] local-sensor directory not found: $CLIENT_DIR"
    exit 1
fi

# ================================================================
#  Auto-generate .env files from .env.example
# ================================================================
echo "Generating .env files..."

# local-web/.env
cat > "$FRONTEND_DIR/.env" <<EOF
NEXT_PUBLIC_API_URL=$CENTER_URL
EOF
echo "  local-web/.env → NEXT_PUBLIC_API_URL=$CENTER_URL"

# local-sensor/.env
cat > "$CLIENT_DIR/.env" <<EOF
CENTER_URL=$CENTER_URL
NODE_ID=$NODE_ID
EOF
echo "  local-sensor/.env → CENTER_URL=$CENTER_URL  NODE_ID=$NODE_ID"
echo ""

# ================================================================
#  Save runtime info for stop-local.sh
# ================================================================
ENV_FILE="$LOG_DIR/local.env"
cat > "$ENV_FILE" <<EOF
CENTER_URL="$CENTER_URL"
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
#  Check Center connectivity
# ================================================================
echo "Checking Center connectivity ($CENTER_URL)..."
HEALTH_CODE="$(curl -s -o /dev/null -w '%{http_code}' "$CENTER_URL/health" 2>/dev/null || echo "000")"
if [[ "$HEALTH_CODE" == "200" ]]; then
    echo "Center connection OK ✓"
else
    echo "[WARNING] Center not reachable (HTTP $HEALTH_CODE)"
    echo "Sensor will keep retrying..."
fi
echo ""

# ================================================================
#  Print banner
# ================================================================
echo "================================================"
echo "   LifeTrace PC Node Startup (macOS/tmux)"
echo "================================================"
echo ""
echo "Center (remote):  $CENTER_URL"
echo "Frontend (local): http://localhost:$FRONTEND_PORT"
echo "Node ID:          $NODE_ID"
[[ "$FRONTEND_PORT" != "$FRONTEND_PORT_PREFERRED" ]] && echo "Note: preferred port $FRONTEND_PORT_PREFERRED busy, switched to $FRONTEND_PORT"
echo ""

# ================================================================
#  Create tmux session with 2 panes (top / bottom)
# ================================================================
tmux new-session -d -s "$SESSION" -x 200 -y 50
tmux split-window -t "$SESSION" -v

tmux set-option -t "$SESSION" pane-border-status top
tmux set-option -t "$SESSION" pane-border-format " #{pane_index}: #{pane_title} "

# ================================================================
#  [Pane 0] Frontend (pnpm dev)
# ================================================================
echo "[1/2] Starting Frontend (dev mode, port $FRONTEND_PORT)..."
tmux select-pane -t "$SESSION":0.0 -T "Frontend :$FRONTEND_PORT"
tmux send-keys -t "$SESSION":0.0 \
    "cd '$FRONTEND_DIR' && echo '--- Frontend (dev) ---' && echo 'API → $CENTER_URL' && pnpm dev --port $FRONTEND_PORT" C-m

# ================================================================
#  [Pane 1] Sensor (perception daemon)
# ================================================================
echo "[2/2] Starting Sensor..."
tmux select-pane -t "$SESSION":0.1 -T "Sensor ($NODE_ID)"
tmux send-keys -t "$SESSION":0.1 \
    "cd '$CLIENT_DIR' && echo '--- Sensor ---' && echo 'Center: $CENTER_URL  Node: $NODE_ID' && uv run python sensor.py --center-url '$CENTER_URL' --node-id '$NODE_ID' --debug-images" C-m

# ================================================================
#  Summary & attach
# ================================================================
echo ""
echo "================================================"
echo "   PC Node Started  (tmux session: $SESSION)"
echo "================================================"
echo ""
echo "  [0] Frontend  → http://localhost:$FRONTEND_PORT  (API → $CENTER_URL)"
echo "  [1] Sensor    → $CENTER_URL  (Node: $NODE_ID)"
echo ""
echo "Quick reference:"
echo "  Ctrl+B → arrow   switch panes"
echo "  Ctrl+B → z       zoom/unzoom pane"
echo "  Ctrl+B → [       scroll mode (q to quit)"
echo "  Ctrl+B → d       detach (services keep running)"
echo "  tmux attach -t $SESSION   re-attach"
echo "  ./stop-local.sh           stop all"
echo ""
echo "Attaching to tmux session in 2 seconds..."
sleep 2

tmux attach -t "$SESSION"
