#!/usr/bin/env bash
set -euo pipefail
# 4. Frontend (build + start)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./start-center-env.sh
source "$SCRIPT_DIR/start-center-env.sh"
pid=$(lsof -ti tcp:"$FRONTEND_PORT" 2>/dev/null) && kill -9 $pid 2>/dev/null || true
sleep 1
(
  cd "$REPO_ROOT/free-todo-frontend"
  export NEXT_PUBLIC_API_URL="$BACKEND_PUBLIC_URL"
  export API_REWRITE_URL="http://127.0.0.1:$BACKEND_PORT"
  pnpm build:frontend:web && pnpm start --port "$FRONTEND_PORT" --hostname 0.0.0.0
) >>"$LOG_DIR/frontend_center.log" 2>&1 &
echo $! >"$LOG_DIR/frontend_center.pid"
echo "[4/7] Frontend started (http://0.0.0.0:$FRONTEND_PORT), PID $(cat "$LOG_DIR/frontend_center.pid")"
