#!/usr/bin/env bash
set -euo pipefail

# 计算脚本目录、仓库根目录，并统一把运行日志放到 .run-logs 下。
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
log_dir="$repo_root/.run-logs"
mkdir -p "$log_dir"

# 允许用户通过本地环境文件覆盖默认配置，不纳入版本控制更方便放私有参数。
if [[ -f "$script_dir/local-env.sh" ]]; then
  # shellcheck disable=SC1091
  source "$script_dir/local-env.sh"
fi

# 判断命令是否存在于当前 PATH 中。
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# 启动前检查关键依赖，缺失时直接报错退出。
require_command() {
  local cmd="$1"
  if ! command_exists "$cmd"; then
    echo "[ERROR] Missing required command: $cmd" >&2
    exit 1
  fi
}

# 优先使用 python3，兼容部分环境只有 python 命令的情况。
find_python() {
  if command_exists python3; then
    echo "python3"
    return 0
  fi
  if command_exists python; then
    echo "python"
    return 0
  fi
  echo "[ERROR] python3/python not found." >&2
  exit 1
}

# 从指定起始端口开始向上探测，直到找到一个未被占用的本地端口。
# 这里借助 Python 做 socket 绑定探测，兼容 Linux 和 macOS。
find_free_port() {
  local start_port="$1"
  local py_bin="$2"

  "$py_bin" - "$start_port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
while True:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(("127.0.0.1", port))
        except OSError:
            port += 1
            continue
    print(port)
    break
PY
}

# 后台启动进程，并把 stdout/stderr 统一写入日志，同时记录 PID。
# 与 Windows bat 不同，Unix 系统一般不弹出多个新窗口，更适合这种后台常驻方式。
start_bg() {
  local name="$1"
  local workdir="$2"
  local command="$3"
  local log_file="$log_dir/${name}.log"
  local pid_file="$log_dir/${name}.pid"

  echo "Starting $name..."
  (
    cd "$workdir"
    nohup bash -lc "$command" >>"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )
}

# 输出等待提示，方便观察启动顺序和阶段耗时。
sleep_with_message() {
  local seconds="$1"
  local message="$2"
  echo "$message"
  sleep "$seconds"
}

py_bin="$(find_python)"
require_command uv
require_command pnpm

# 环境变量默认值：优先使用 local-env.sh 中的配置，没有时再回落。
: "${BACKEND_PORT:=8001}"
: "${FRONTEND_PORT:=3001}"

# 记录用户期望端口；若被占用则自动顺延到下一个可用端口。
backend_port_preferred="$BACKEND_PORT"
frontend_port_preferred="$FRONTEND_PORT"
BACKEND_PORT="$(find_free_port "$BACKEND_PORT" "$py_bin")"
FRONTEND_PORT="$(find_free_port "$FRONTEND_PORT" "$py_bin")"

BACKEND_LOCAL_URL="http://127.0.0.1:${BACKEND_PORT}"
FRONTEND_LOCAL_URL="http://127.0.0.1:${FRONTEND_PORT}"

cat <<EOF
================================================
   LifeTrace Center Node Startup
================================================

Backend local:   ${BACKEND_LOCAL_URL}
Frontend local:  ${FRONTEND_LOCAL_URL}
EOF

if [[ "$BACKEND_PORT" != "$backend_port_preferred" ]]; then
  echo "Note: backend preferred port ${backend_port_preferred} busy, switched to ${BACKEND_PORT}"
fi
if [[ "$FRONTEND_PORT" != "$frontend_port_preferred" ]]; then
  echo "Note: frontend preferred port ${frontend_port_preferred} busy, switched to ${FRONTEND_PORT}"
fi
echo

# 下面按依赖顺序启动：
# Phoenix -> AgentOS -> 后端 -> 前端。
echo "[1/4] Starting Phoenix (observability)..."
start_bg "phoenix" "$repo_root" "uv run phoenix serve"
sleep_with_message 2 "Waiting for Phoenix (2s)..."

echo "[2/4] Starting AgentOS..."
start_bg "agentos" "$repo_root" "uv run python -m lifetrace.agent_os"
sleep_with_message 2 "Waiting for AgentOS (2s)..."

echo "[3/4] Starting LifeTrace Server (center mode)..."
start_bg "center-backend" "$repo_root" \
  "uv run python -m lifetrace.server --role center --port ${BACKEND_PORT}"
sleep_with_message 5 "Waiting for backend (5s)..."

# 前端直连本地后端，不再注入任何公网地址。
echo "[4/4] Building frontend (client API = ${BACKEND_LOCAL_URL}, rewrite = localhost:${BACKEND_PORT})..."
start_bg "center-frontend" "$repo_root/free-todo-frontend" \
  "NEXT_PUBLIC_API_URL='${BACKEND_LOCAL_URL}' API_REWRITE_URL='${BACKEND_LOCAL_URL}' pnpm build:frontend:web && pnpm start --port ${FRONTEND_PORT} --hostname 0.0.0.0"
sleep_with_message 30 "Waiting for frontend build (~30s)..."

cat <<EOF

================================================
   Center Node Started (background processes)
================================================

Services:
  Phoenix:      http://127.0.0.1:6006
  AgentOS:      http://127.0.0.1:8200
  Backend:      ${BACKEND_LOCAL_URL}
  Frontend:     ${FRONTEND_LOCAL_URL}

Sensor startup command (run from client/ directory):
  cd client && uv run python -m sensor --center-url ${BACKEND_LOCAL_URL}

Logs: ${log_dir}
PIDs: ${log_dir}/*.pid
EOF
