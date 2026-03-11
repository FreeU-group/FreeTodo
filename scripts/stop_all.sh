#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_dir="$repo_root/.run-logs"

if [ ! -d "$log_dir" ]; then
  echo "No log directory found: $log_dir"
  exit 1
fi

stopped_any=false
for pid_file in "$log_dir"/*.pid; do
  [ -f "$pid_file" ] || continue
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "Stopping $(basename "$pid_file" .pid) (pid $pid)..."
    kill "$pid" 2>/dev/null || true
    stopped_any=true
  fi
  rm -f "$pid_file"
done

if [ "$stopped_any" = false ]; then
  echo "No running processes found."
fi
