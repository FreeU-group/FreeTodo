#!/usr/bin/env bash
set -euo pipefail

# 统一使用仓库内的 .run-logs，和 start-center.sh 保持一致。
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
log_dir="$repo_root/.run-logs"

# 允许通过本地环境文件覆盖默认端口，便于和启动脚本一致。
if [[ -f "$script_dir/../local-env.sh" ]]; then
  # shellcheck disable=SC1091
  source "$script_dir/../local-env.sh"
fi

: "${BACKEND_PORT:=8001}"
: "${FRONTEND_PORT:=3001}"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

is_pid_running() {
  local pid="$1"
  kill -0 "$pid" >/dev/null 2>&1
}

kill_pid() {
  local pid="$1"
  kill -TERM "$pid" >/dev/null 2>&1 || return 1

  for _ in {1..10}; do
    if ! is_pid_running "$pid"; then
      return 0
    fi
    sleep 0.2
  done

  kill -KILL "$pid" >/dev/null 2>&1 || return 1
}

kill_by_pid_file() {
  local pid_file="$1"
  local name="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "[SKIP] $name (pid file not found)"
    return 1
  fi

  local pid
  pid="$(tr -d '[:space:]' <"$pid_file")"

  if [[ -z "$pid" || ! "$pid" =~ ^[0-9]+$ ]]; then
    echo "[SKIP] $name (invalid pid file)"
    rm -f "$pid_file"
    return 1
  fi

  if ! is_pid_running "$pid"; then
    echo "[SKIP] $name (PID $pid not running)"
    rm -f "$pid_file"
    return 1
  fi

  echo "[STOP] $name (PID $pid)"
  if kill_pid "$pid"; then
    rm -f "$pid_file"
    return 0
  fi

  echo "[WARN] Failed to stop $name by PID $pid" >&2
  return 1
}

kill_by_port() {
  local port="$1"
  local name="$2"
  local pids=()

  if command_exists lsof; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && pids+=("$pid")
    done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u)
  else
    echo "[SKIP] $name (lsof not available, cannot inspect port $port)"
    return 1
  fi

  if [[ "${#pids[@]}" -eq 0 ]]; then
    echo "[SKIP] $name (port $port not in use)"
    return 1
  fi

  local pid
  for pid in "${pids[@]}"; do
    if is_pid_running "$pid"; then
      echo "[STOP] $name (port $port, PID $pid)"
      kill_pid "$pid" || echo "[WARN] Failed to stop PID $pid on port $port" >&2
    fi
  done
}

kill_by_name() {
  local proc="$1"
  local name="$2"
  local pids=()

  if command_exists pgrep; then
    while IFS= read -r pid; do
      [[ -n "$pid" ]] && pids+=("$pid")
    done < <(pgrep -x "$proc" 2>/dev/null || true)
  fi

  if [[ "${#pids[@]}" -eq 0 ]]; then
    echo "[SKIP] $name (not running)"
    return 1
  fi

  local pid
  for pid in "${pids[@]}"; do
    if is_pid_running "$pid"; then
      echo "[STOP] $name (PID $pid)"
      kill_pid "$pid" || echo "[WARN] Failed to stop $name PID $pid" >&2
    fi
  done
}

echo "================================================"
echo "   LifeTrace Center Node Stop"
echo "================================================"
echo

kill_by_pid_file "$log_dir/phoenix.pid" "Phoenix" || true
kill_by_pid_file "$log_dir/agentos.pid" "AgentOS" || true
kill_by_pid_file "$log_dir/center-backend.pid" "LifeTrace Backend" || true
kill_by_pid_file "$log_dir/center-frontend.pid" "LifeTrace Frontend" || true

# 兜底按默认端口清理，兼容旧启动方式或 pid 文件丢失的情况。
kill_by_port 6006 "Phoenix" || true
kill_by_port 8200 "AgentOS" || true
kill_by_port "$BACKEND_PORT" "LifeTrace Backend" || true
kill_by_port "$FRONTEND_PORT" "LifeTrace Frontend" || true
kill_by_name "cpolar" "cpolar tunnel" || true

echo
echo "================================================"
echo "   Center Node Stopped"
echo "================================================"
