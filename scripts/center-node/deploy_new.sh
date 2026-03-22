#!/usr/bin/env bash
set -euo pipefail

PORT=${1:?"用法: deploy_new.sh <端口号> (8000-9000)"}

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 8000 ] || [ "$PORT" -gt 9000 ]; then
  echo "错误: 端口号必须在 8000-9000 之间"
  exit 1
fi

AGENT_PORT=$((PORT + 1))

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC="$REPO_ROOT/deploy"
DEST="$REPO_ROOT/deploy-${PORT}"

if [ -d "$DEST" ]; then
  echo "错误: $DEST 已存在"
  exit 1
fi

# 兼容 macOS / Linux 的 sed -i
sedi() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

echo "创建部署目录: $DEST"
mkdir -p "$DEST"
cp "$SRC/compose.yaml" "$DEST/compose.yaml"
cp "$SRC/.env" "$DEST/.env"

# ── 更新 .env ──
sedi "s/^LIFETRACE_SERVER__PORT=.*/LIFETRACE_SERVER__PORT=${PORT}/" "$DEST/.env"
sedi "s/^LIFETRACE_AGNO__AGENT_OS__PORT=.*/LIFETRACE_AGNO__AGENT_OS__PORT=${AGENT_PORT}/" "$DEST/.env"

# ── 更新 compose.yaml ──
# 容器名称（避免多实例冲突）
sedi "s/container_name: lifetrace-server/container_name: lifetrace-server-${PORT}/" "$DEST/compose.yaml"
sedi "s/container_name: lifetrace-agent/container_name: lifetrace-agent-${PORT}/" "$DEST/compose.yaml"

# Agent 内部 URL 和硬编码端口
sedi "s|http://agent:8002|http://agent:${AGENT_PORT}|g" "$DEST/compose.yaml"
sedi "s/LIFETRACE_AGNO__AGENT_OS__PORT: 8002/LIFETRACE_AGNO__AGENT_OS__PORT: ${AGENT_PORT}/g" "$DEST/compose.yaml"

# 环境变量默认值
sedi "s/:-8001}/:-${PORT}}/g" "$DEST/compose.yaml"
sedi "s/:-8002}/:-${AGENT_PORT}}/g" "$DEST/compose.yaml"

# 端口映射（容器内端口）
sedi "s/:8001\"/:${PORT}\"/g" "$DEST/compose.yaml"
sedi "s/:8002\"/:${AGENT_PORT}\"/g" "$DEST/compose.yaml"

# 网络名称（避免多实例冲突）
sedi "s/lifetrace-network/lifetrace-network-${PORT}/g" "$DEST/compose.yaml"

echo "✅ 部署配置已生成:"
echo "  目录: $DEST"
echo "  Server 端口: ${PORT}"
echo "  Agent  端口: ${AGENT_PORT}"
echo ""
echo "启动命令:"
echo "  cd $DEST && docker compose up -d"
