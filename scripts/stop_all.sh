#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_dir="$repo_root/.run-logs"

if [ ! -d "$log_dir" ]; then
  echo "No log directory found: $log_dir"
  exit 1
fi

stopped_any=false
is_ours() {
  local pid="$1"
  if [ ! -r "/proc/$pid/cmdline" ]; then
    return 1
  fi
  tr '\0' ' ' <"/proc/$pid/cmdline" | grep -q "$repo_root"
}

stop_pid() {
  local name="$1"
  local pid="$2"
  if ! is_ours "$pid"; then
    echo "Skip $name (pid $pid): not in repo $repo_root"
    return
  fi
  echo "Stopping $name (pid $pid)..."
  if [ -f "$log_dir/$name.pgid" ]; then
    local pgid
    pgid="$(cat "$log_dir/$name.pgid" 2>/dev/null || true)"
    if [ -n "$pgid" ]; then
      kill -TERM -- "-$pgid" 2>/dev/null || true
    fi
  fi
  kill -TERM -- "-$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true
  if command -v pkill >/dev/null 2>&1; then
    pkill -TERM -P "$pid" 2>/dev/null || true
  fi
  for _ in {1..10}; do
    if ! kill -0 "$pid" 2>/dev/null; then
      return
    fi
    sleep 0.5
  done
  kill -KILL -- "-$pid" 2>/dev/null || true
  kill -KILL "$pid" 2>/dev/null || true
}

cleanup_frontend_lock() {
  local lock_path="$repo_root/free-todo-frontend/.next/dev/lock"
  if [ -f "$lock_path" ]; then
    echo "Removing frontend dev lock: $lock_path"
    rm -f "$lock_path"
  fi
}

for pid_file in "$log_dir"/*.pid; do
  [ -f "$pid_file" ] || continue
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    stop_pid "$(basename "$pid_file" .pid)" "$pid"
    stopped_any=true
  fi
  rm -f "$pid_file"
  rm -f "${pid_file%.pid}.pgid"
done

cleanup_frontend_lock

if [ "$stopped_any" = false ]; then
  echo "No running processes found."
fi
