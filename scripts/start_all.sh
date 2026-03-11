#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_dir="$repo_root/.run-logs"
mkdir -p "$log_dir"

run_bg() {
  local name="$1"
  shift
  local cmd="$*"
  echo "Starting $name..."
  if command -v setsid >/dev/null 2>&1; then
    setsid "$SHELL" -lc "cd \"$repo_root\"; exec $cmd" >"$log_dir/$name.log" 2>&1 &
  else
    "$SHELL" -lc "cd \"$repo_root\"; exec $cmd" >"$log_dir/$name.log" 2>&1 &
  fi
  local pid=$!
  local pgid
  pgid="$(ps -o pgid= "$pid" 2>/dev/null | tr -d ' ' || true)"
  echo "$pid" >"$log_dir/$name.pid"
  echo "${pgid:-$pid}" >"$log_dir/$name.pgid"
}

cleanup_frontend_lock() {
  local lock_path="$repo_root/free-todo-frontend/.next/dev/lock"
  if [ ! -f "$lock_path" ]; then
    return
  fi
  if command -v pgrep >/dev/null 2>&1; then
    if pgrep -fa "next dev" | grep -q "$repo_root/free-todo-frontend"; then
      echo "Frontend dev lock present and Next.js appears running; leaving lock in place."
      return
    fi
  fi
  echo "Removing stale frontend dev lock: $lock_path"
  rm -f "$lock_path"
}

run_bg "phoenix" "uv run phoenix serve"
sleep 2
run_bg "lifetrace.agent_os" "uv run python -m lifetrace.agent_os"
sleep 2
run_bg "lifetrace.server" "uv run python -m lifetrace.server"
sleep 1
cleanup_frontend_lock
run_bg "frontend.dev" "pnpm -C free-todo-frontend dev"

echo "All processes started."
echo "Logs: $log_dir"
echo "Phoenix UI: http://localhost:6006"

frontend_url=""
if command -v rg >/dev/null 2>&1; then
  for _ in {1..30}; do
    if [ -f "$log_dir/frontend.dev.log" ]; then
      frontend_url=$(rg -m1 -o "http://localhost:[0-9]+" "$log_dir/frontend.dev.log" | head -n1 || true)
      if [ -n "$frontend_url" ]; then
        break
      fi
    fi
    sleep 1
  done
fi

if [ -n "$frontend_url" ]; then
  echo "Frontend UI: $frontend_url"
else
  echo "Frontend UI: check $log_dir/frontend.dev.log"
fi

echo "Stop all: bash scripts/stop_all.sh"
