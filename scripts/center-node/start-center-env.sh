#!/usr/bin/env bash
# 供 start-center-*.sh 共用的环境变量，不要直接执行

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$REPO_ROOT/.run-logs"
mkdir -p "$LOG_DIR"

# 日志轮转：超过阈值时归档旧日志，保留最近 N 份
# 用法: rotate_log <log_file> [max_bytes] [keep_count]
rotate_log() {
  local file="$1"
  local max_bytes="${2:-10485760}"  # 默认 10 MB
  local keep="${3:-3}"             # 默认保留 3 份

  [[ -f "$file" ]] || return 0
  local size
  size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
  (( size < max_bytes )) && return 0

  # 删除最旧的，依次递推
  local i=$keep
  while (( i > 1 )); do
    local prev=$(( i - 1 ))
    [[ -f "${file}.${prev}" ]] && mv -f "${file}.${prev}" "${file}.${i}"
    (( i-- ))
  done
  mv -f "$file" "${file}.1"
  : > "$file"  # 创建空文件
}

# 等待端口就绪
# 用法: wait_for_port <port> [timeout_seconds] [label]
wait_for_port() {
  local port="$1"
  local timeout="${2:-30}"
  local label="${3:-service}"
  local elapsed=0
  while ! nc -z 127.0.0.1 "$port" 2>/dev/null; do
    sleep 1
    elapsed=$((elapsed + 1))
    if (( elapsed >= timeout )); then
      echo "WARNING: $label on port $port not ready after ${timeout}s"
      return 1
    fi
  done
  echo "$label is ready on port $port (${elapsed}s)"
  return 0
}

if [[ -f "$SCRIPT_DIR/local-env.sh" ]]; then
  # shellcheck source=./local-env.sh
  source "$SCRIPT_DIR/local-env.sh"
fi

# macOS: opuslib needs libopus from Homebrew (find_library doesn't search /opt/homebrew/lib)
if [[ -d /opt/homebrew/lib ]]; then
  export DYLD_LIBRARY_PATH="/opt/homebrew/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
elif [[ -d /usr/local/lib ]]; then
  export DYLD_LIBRARY_PATH="/usr/local/lib${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
fi

: "${CPOLAR_BACKEND_DOMAIN:=huazebackend}"
: "${CPOLAR_FRONTEND_DOMAIN:=huazefrontend}"
: "${CPOLAR_REGION:=cn}"
: "${CPOLAR_BACKEND_SUFFIX:=${CPOLAR_DOMAIN_SUFFIX:-cpolar.cn}}"
: "${CPOLAR_FRONTEND_SUFFIX:=${CPOLAR_DOMAIN_SUFFIX:-cpolar.cn}}"
: "${CPOLAR_TCP_TUNNEL_NAME:=backend_tcp}"
: "${CPOLAR_TCP_REMOTE_ADDRESS:=8.tcp.cpolar.cn:12659}"

BACKEND_PORT=8001
FRONTEND_PORT=3001
BACKEND_PUBLIC_URL="https://${CPOLAR_BACKEND_DOMAIN}.${CPOLAR_BACKEND_SUFFIX}"
FRONTEND_PUBLIC_URL="https://${CPOLAR_FRONTEND_DOMAIN}.${CPOLAR_FRONTEND_SUFFIX}"
