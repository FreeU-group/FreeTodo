#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_dir="$repo_root/.run-logs"
mkdir -p "$log_dir"

ensure_env() {
  local dir="$1"
  if [ ! -f "$dir/.env" ] && [ -f "$dir/.env.example" ]; then
    echo "Creating $dir/.env from .env.example ..."
    cp "$dir/.env.example" "$dir/.env"
  fi
}

ensure_env "$repo_root/server"
ensure_env "$repo_root/frontend"
ensure_env "$repo_root/client"

check_server_env() {
  local env_file="$repo_root/server/.env"
  local placeholders=("your-api-key" "your-asr-api-key" "your-tavily-api-key" "your-gemini-api-key")
  local warnings=()

  while IFS='=' read -r key value; do
    key="$(echo "$key" | xargs)"
    value="$(echo "$value" | xargs)"
    [[ -z "$key" || "$key" == \#* ]] && continue
    for ph in "${placeholders[@]}"; do
      if [ "$value" = "$ph" ]; then
        warnings+=("  $key=$value")
      fi
    done
  done < "$env_file"

  if [ ${#warnings[@]} -eq 0 ]; then
    return 0
  fi

  echo ""
  echo "WARNING: server/.env still contains default placeholder values:"
  for w in "${warnings[@]}"; do
    echo "$w"
  done
  echo ""
  echo "Please edit server/.env and fill in your real API keys (LIFETRACE_LLM__API_KEY is required):"
  echo "  vi $env_file"
  echo ""
  echo "Then re-run:"
  echo "  $0"
  exit 1
}

check_server_env

run_bg() {
  local name="$1"
  local work_dir="$2"
  shift 2
  local cmd="$*"
  echo "Starting $name..."
  if command -v setsid >/dev/null 2>&1; then
    setsid "$SHELL" -lc "cd \"$work_dir\"; exec $cmd" >"$log_dir/$name.log" 2>&1 &
  else
    "$SHELL" -lc "cd \"$work_dir\"; exec $cmd" >"$log_dir/$name.log" 2>&1 &
  fi
  local pid=$!
  local pgid
  pgid="$(ps -o pgid= "$pid" 2>/dev/null | tr -d ' ' || true)"
  echo "$pid" >"$log_dir/$name.pid"
  echo "${pgid:-$pid}" >"$log_dir/$name.pgid"
}

cleanup_frontend_lock() {
  local lock_path="$repo_root/frontend/.next/dev/lock"
  if [ ! -f "$lock_path" ]; then
    return
  fi
  if command -v pgrep >/dev/null 2>&1; then
    if pgrep -fa "next dev" | grep -q "$repo_root/frontend"; then
      echo "Frontend dev lock present and Next.js appears running; leaving lock in place."
      return
    fi
  fi
  echo "Removing stale frontend dev lock: $lock_path"
  rm -f "$lock_path"
}

run_bg "server" "$repo_root/server" "uv run python server.py"
sleep 2

run_bg "agent_os" "$repo_root/server" "uv run python agent_os.py"
sleep 1

cleanup_frontend_lock
run_bg "frontend" "$repo_root" "pnpm --dir frontend dev"
sleep 1

run_bg "client" "$repo_root/client" "uv run python sensor.py"

echo ""
echo "All processes started."
echo "Logs: $log_dir"

frontend_url=""
if command -v rg >/dev/null 2>&1; then
  for _ in {1..30}; do
    if [ -f "$log_dir/frontend.log" ]; then
      frontend_url=$(rg -m1 -o "http://localhost:[0-9]+" "$log_dir/frontend.log" | head -n1 || true)
      if [ -n "$frontend_url" ]; then
        break
      fi
    fi
    sleep 1
  done
fi

echo "Server API:   http://localhost:8001"
echo "AgentOS API:  http://localhost:8002"
if [ -n "$frontend_url" ]; then
  echo "Frontend UI:  $frontend_url"
else
  echo "Frontend UI:  http://localhost:3000 (check $log_dir/frontend.log)"
fi
echo ""
echo "Status all: bash scripts/status_all.sh"
echo "Stop all: bash scripts/stop_all.sh"
