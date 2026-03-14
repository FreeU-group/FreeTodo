#!/usr/bin/env bash
# 供 start-center-*.sh 共用的环境变量，不要直接执行

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$REPO_ROOT/.run-logs"
mkdir -p "$LOG_DIR"

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
