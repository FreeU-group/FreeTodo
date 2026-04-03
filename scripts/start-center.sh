#!/usr/bin/env bash
set -euo pipefail

# 一键启动 Center Node 全部服务（Phoenix / AgentOS / Backend / Frontend / cpolar tunnels）

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./start-center-env.sh
source "$SCRIPT_DIR/start-center-env.sh"

# ── 可选参数 ──────────────────────────────────────────────
# --no-cpolar : 跳过 cpolar 隧道
SKIP_CPOLAR=false
for arg in "$@"; do
  case "$arg" in
    --no-cpolar) SKIP_CPOLAR=true ;;
  esac
done

cat <<EOF
================================================
   LifeTrace Center Node — One-click Startup
================================================

Backend  local : http://127.0.0.1:$BACKEND_PORT
Frontend local : http://127.0.0.1:$FRONTEND_PORT
EOF
if [[ "$SKIP_CPOLAR" == false ]]; then
  cat <<EOF
Backend  public: $BACKEND_PUBLIC_URL
Backend  TCP   : $CPOLAR_TCP_REMOTE_ADDRESS
Frontend public: $FRONTEND_PUBLIC_URL
EOF
fi
echo

# ── [1/7] Phoenix ─────────────────────────────────────────
rotate_log "$LOG_DIR/phoenix.log"
(cd "$REPO_ROOT/local-api" && uv run phoenix serve) >>"$LOG_DIR/phoenix.log" 2>&1 &
echo $! >"$LOG_DIR/phoenix.pid"
echo "[1/7] Phoenix started (http://127.0.0.1:6006), PID $!"

# ── [2/7] AgentOS ─────────────────────────────────────────
rotate_log "$LOG_DIR/agent_os.log"
(cd "$REPO_ROOT/local-api" && uv run python agent_os.py) >>"$LOG_DIR/agent_os.log" 2>&1 &
echo $! >"$LOG_DIR/agent_os.pid"
echo "[2/7] AgentOS started (http://127.0.0.1:8200), PID $!"

# ── [3/7] Backend (center mode) ──────────────────────────
rotate_log "$LOG_DIR/backend_center_new.log"
(cd "$REPO_ROOT/local-api" && uv run python server.py) >>"$LOG_DIR/backend_center_new.log" 2>&1 &
echo $! >"$LOG_DIR/backend_center.pid"
echo "[3/7] Backend (center) started (http://0.0.0.0:$BACKEND_PORT), PID $!"

# 等待后端就绪，前端 SSR build 需要访问后端 API
wait_for_port "$BACKEND_PORT" 30 "Backend"

# ── [4/7] Frontend (build + start) ───────────────────────
rotate_log "$LOG_DIR/frontend_center.log"
pid=$(lsof -ti tcp:"$FRONTEND_PORT" 2>/dev/null) && kill -9 $pid 2>/dev/null || true
sleep 1
(
  cd "$REPO_ROOT/local-web"
  export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1:$BACKEND_PORT}"
  export API_REWRITE_URL="http://127.0.0.1:$BACKEND_PORT"
  pnpm build:frontend:web && pnpm start --port "$FRONTEND_PORT" --hostname 0.0.0.0
) >>"$LOG_DIR/frontend_center.log" 2>&1 &
echo $! >"$LOG_DIR/frontend_center.pid"
echo "[4/7] Frontend started (http://0.0.0.0:$FRONTEND_PORT), PID $!"

if [[ "$SKIP_CPOLAR" == true ]]; then
  echo
  echo "Skipping cpolar tunnels (--no-cpolar)"
else
  if ! command -v cpolar >/dev/null 2>&1; then
    echo
    echo "WARNING: cpolar not found in PATH, skipping tunnel steps [5-7]"
  else
    # ── [5/7] cpolar backend HTTP ──────────────────────────
    rotate_log "$LOG_DIR/cpolar_backend_http.log"
    { cpolar http -region="$CPOLAR_REGION" -subdomain="$CPOLAR_BACKEND_DOMAIN" "$BACKEND_PORT" 2>&1 \
      | while IFS= read -r line; do echo "$(date '+%Y-%m-%d %H:%M:%S') $line"; done; } \
      >>"$LOG_DIR/cpolar_backend_http.log" &
    echo $! >"$LOG_DIR/cpolar_backend_http.pid"
    echo "[5/7] cpolar backend HTTP started = $BACKEND_PUBLIC_URL, PID $!"

    # ── [6/7] cpolar backend TCP ───────────────────────────
    rotate_log "$LOG_DIR/cpolar_backend_tcp.log"
    cpolar tcp -region="$CPOLAR_REGION" -remote-addr="$CPOLAR_TCP_REMOTE_ADDRESS" "$BACKEND_PORT" \
      >>"$LOG_DIR/cpolar_backend_tcp.log" 2>&1 &
    echo $! >"$LOG_DIR/cpolar_backend_tcp.pid"
    echo "[6/7] cpolar backend TCP started ($CPOLAR_TCP_REMOTE_ADDRESS -> localhost:$BACKEND_PORT), PID $!"

    # ── [7/7] cpolar frontend ──────────────────────────────
    rotate_log "$LOG_DIR/cpolar_frontend.log"
    cpolar http -region="$CPOLAR_REGION" -subdomain="$CPOLAR_FRONTEND_DOMAIN" "$FRONTEND_PORT" \
      >>"$LOG_DIR/cpolar_frontend.log" 2>&1 &
    echo $! >"$LOG_DIR/cpolar_frontend.pid"
    echo "[7/7] cpolar frontend started = $FRONTEND_PUBLIC_URL, PID $!"
  fi
fi

cat <<EOF

================================================
   Center Node Started (all background)
================================================

Local services:
  Phoenix  : http://127.0.0.1:6006
  AgentOS  : http://127.0.0.1:8200
  Backend  : http://127.0.0.1:$BACKEND_PORT
  Frontend : http://127.0.0.1:$FRONTEND_PORT
EOF

if [[ "$SKIP_CPOLAR" == false ]] && command -v cpolar >/dev/null 2>&1; then
  cat <<EOF

Public tunnels:
  Backend HTTP : $BACKEND_PUBLIC_URL
  Backend TCP  : $CPOLAR_TCP_REMOTE_ADDRESS
  Frontend     : $FRONTEND_PUBLIC_URL
EOF
fi

cat <<EOF

Sensor startup (run from another terminal):
  cd local-sensor && uv run python -m sensor --center-url http://127.0.0.1:$BACKEND_PORT

Logs : $LOG_DIR
PIDs : $LOG_DIR/*.pid
Stop : bash $SCRIPT_DIR/stop-center.sh
EOF
