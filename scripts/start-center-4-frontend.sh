#!/usr/bin/env bash
set -euo pipefail
# 4. Frontend (build + start)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./start-center-env.sh
source "$SCRIPT_DIR/start-center-env.sh"
rotate_log "$LOG_DIR/frontend_center.log"

# 等待后端就绪，前端 SSR build 需要访问后端 API
wait_for_port "$BACKEND_PORT" 30 "Backend"

pid=$(lsof -ti tcp:"$FRONTEND_PORT" 2>/dev/null) && kill -9 $pid 2>/dev/null || true
sleep 1
(
  cd "$REPO_ROOT/local-web"
  # Client-side API URL: default to local backend; override via NEXT_PUBLIC_API_URL in local-env.sh
  export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://127.0.0.1:$BACKEND_PORT}"
  export API_REWRITE_URL="http://127.0.0.1:$BACKEND_PORT"
  pnpm build:frontend:web && pnpm start --port "$FRONTEND_PORT" --hostname 0.0.0.0
) >>"$LOG_DIR/frontend_center.log" 2>&1 &
echo $! >"$LOG_DIR/frontend_center.pid"
echo "[4/7] Frontend started (http://0.0.0.0:$FRONTEND_PORT), PID $(cat "$LOG_DIR/frontend_center.pid")"
