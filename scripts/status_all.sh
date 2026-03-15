#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_dir="$repo_root/.run-logs"

services=("server" "agent_os" "frontend" "client")

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

check_service() {
  local name="$1"
  local pid_file="$log_dir/$name.pid"

  if [ ! -f "$pid_file" ]; then
    printf "  %-12s ${RED}●${NC} stopped (no pid file)\n" "$name"
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"

  if [ -z "$pid" ]; then
    printf "  %-12s ${RED}●${NC} stopped (empty pid file)\n" "$name"
    return
  fi

  if kill -0 "$pid" 2>/dev/null; then
    printf "  %-12s ${GREEN}●${NC} running (PID $pid)\n" "$name"
  else
    printf "  %-12s ${YELLOW}●${NC} dead (PID $pid exited)\n" "$name"
  fi
}

echo "FreeTodo Service Status"
echo "─────────────────────────────"

for svc in "${services[@]}"; do
  check_service "$svc"
done

echo ""
echo "Logs: $log_dir"
