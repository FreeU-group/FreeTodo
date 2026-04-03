#!/bin/bash
set -e

# ================================================================
#  FreeTodo Portable - Mac Setup Script
#  在开发机上运行一次，构建便携包。
#  完成后，将整个 portable/ 文件夹拷贝到 U 盘即可。
# ================================================================

PORTABLE_ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$PORTABLE_ROOT/.." && pwd)"

# ---- Detect architecture ----
ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
    PLATFORM="mac-arm64"
    NODE_ARCH="arm64"
    UV_ARCH="aarch64-apple-darwin"
else
    PLATFORM="mac-x64"
    NODE_ARCH="x64"
    UV_ARCH="x86_64-apple-darwin"
fi

RT="$PORTABLE_ROOT/runtime/$PLATFORM"

# ---- Versions ----
NODE_VERSION="v22.15.0"
UV_VERSION="0.7.12"

# ---- Download URLs ----
NODE_MIRROR="https://npmmirror.com/mirrors/node"
NODE_URL="$NODE_MIRROR/$NODE_VERSION/node-$NODE_VERSION-darwin-$NODE_ARCH.tar.gz"
UV_URL="https://github.com/astral-sh/uv/releases/download/$UV_VERSION/uv-$UV_ARCH.tar.gz"

# ---- Portable uv config ----
export UV_PYTHON_INSTALL_DIR="$RT/python"
export UV_CACHE_DIR="$RT/uv-cache"
export UV_TORCH_BACKEND=cpu
export UV_PROJECT_ENVIRONMENT=".venv-$PLATFORM"

UV="$RT/uv"
NODE_BIN="$RT/node/bin/node"

echo "================================================"
echo "  FreeTodo Portable - Mac Setup ($PLATFORM)"
echo "================================================"
echo ""
echo "  Repo root:     $REPO_ROOT"
echo "  Portable root: $PORTABLE_ROOT"
echo "  Platform:       $PLATFORM"
echo "  Node:           $NODE_VERSION"
echo "  uv:             $UV_VERSION"
echo ""

# ================================================================
#  [1/8] Create directory structure
# ================================================================
echo "[1/8] Creating directory structure..."
mkdir -p "$RT/python" "$RT/uv-cache"
mkdir -p "$PORTABLE_ROOT/app/server" "$PORTABLE_ROOT/app/client"
mkdir -p "$PORTABLE_ROOT/app/scripts" "$PORTABLE_ROOT/app/frontend"
mkdir -p "$PORTABLE_ROOT/data/config" "$PORTABLE_ROOT/data/data"
mkdir -p "$PORTABLE_ROOT/data/logs" "$PORTABLE_ROOT/data/models"

# ================================================================
#  [2/8] Download uv
# ================================================================
if [ -f "$UV" ]; then
    echo "[2/8] uv already exists, skipping download."
else
    echo "[2/8] Downloading uv $UV_VERSION ($UV_ARCH)..."
    curl -fSL "$UV_URL" -o "$RT/uv.tar.gz"
    tar xzf "$RT/uv.tar.gz" -C "$RT"
    # uv tar extracts to uv-$UV_ARCH/ or directly
    if [ -d "$RT/uv-$UV_ARCH" ]; then
        mv "$RT/uv-$UV_ARCH/uv" "$RT/uv"
        mv "$RT/uv-$UV_ARCH/uvx" "$RT/uvx" 2>/dev/null || true
        rm -rf "$RT/uv-$UV_ARCH"
    fi
    rm -f "$RT/uv.tar.gz"
    chmod +x "$UV"
    echo "  uv downloaded OK."
fi

# ================================================================
#  [3/8] Download Node.js
# ================================================================
if [ -f "$NODE_BIN" ]; then
    echo "[3/8] Node.js already exists, skipping download."
else
    echo "[3/8] Downloading Node.js $NODE_VERSION (darwin-$NODE_ARCH)..."
    curl -fSL "$NODE_URL" -o "$RT/node.tar.gz"
    mkdir -p "$RT/_node_tmp" "$RT/node"
    tar xzf "$RT/node.tar.gz" -C "$RT/_node_tmp"
    mv "$RT"/_node_tmp/node-*/* "$RT/node/"
    rm -rf "$RT/_node_tmp" "$RT/node.tar.gz"
    echo "  Node.js downloaded OK."
fi

# ================================================================
#  [4/8] Install Python 3.12 via uv
# ================================================================
echo "[4/8] Installing Python 3.12 via uv..."
"$UV" python install 3.12 --python-preference only-managed
echo "  Python 3.12 installed OK."

# ================================================================
#  [5/8] Copy source code
# ================================================================
echo "[5/8] Copying source code..."

_portable_copy() {
    local src_dir="$1" dest_dir="$2"
    shift 2
    local prune_args=()
    for pat in "$@"; do
        prune_args+=(-name "$pat" -prune -o)
    done

    # Clean dest but preserve cross-platform venvs
    find "$dest_dir" -mindepth 1 -maxdepth 1 ! -name '.venv-*' -exec rm -rf {} +

    cd "$src_dir" && find . "${prune_args[@]}" -print | while read -r f; do
        if [ -d "$f" ]; then
            mkdir -p "$dest_dir/$f"
        else
            cp "$f" "$dest_dir/$f"
        fi
    done
}

echo "  Copying local-api..."
_portable_copy "$REPO_ROOT/local-api" "$PORTABLE_ROOT/app/local-api" \
    '.venv*' '__pycache__' 'data' 'logs' '.ruff_cache' '.pytest_cache' '*.pyc'

echo "  Copying local-sensor..."
_portable_copy "$REPO_ROOT/local-sensor" "$PORTABLE_ROOT/app/local-sensor" \
    '.venv*' '__pycache__' 'data' 'logs' '.ruff_cache' '.pytest_cache' 'sensor_debug' '*.pyc'

echo "  Copying scripts..."
_portable_copy "$REPO_ROOT/scripts" "$PORTABLE_ROOT/app/scripts" \
    '__pycache__' '*.pyc'

# ================================================================
#  [6/8] Install Python dependencies
# ================================================================
echo "[6/8] Installing Python dependencies (may take 5-10 minutes)..."

echo "  Syncing local-api dependencies..."
"$UV" sync --directory "$PORTABLE_ROOT/app/local-api" --python-preference only-managed

echo "  Syncing local-sensor dependencies..."
"$UV" sync --directory "$PORTABLE_ROOT/app/local-sensor" --python-preference only-managed

echo "  All Python dependencies installed OK."

# ================================================================
#  [7/8] Build or copy frontend
# ================================================================
echo "[7/8] Setting up frontend..."

if [ ! -f "$PORTABLE_ROOT/app/local-web/server.js" ]; then
    echo "  Building frontend (Next.js standalone)..."
    cd "$REPO_ROOT/local-web"
    NEXT_PUBLIC_API_URL=http://127.0.0.1:8001 pnpm build

    echo "  Resolving pnpm symlinks..."
    "$NODE_BIN" "$REPO_ROOT/local-web/scripts/resolve-symlinks.js"
    echo "  Copying missing deps..."
    "$NODE_BIN" "$REPO_ROOT/local-web/scripts/copy-missing-deps.js"

    echo "  Copying standalone output..."
    cp -R "$REPO_ROOT/local-web/.next/standalone/." "$PORTABLE_ROOT/app/local-web/"
    mkdir -p "$PORTABLE_ROOT/app/local-web/.next/static"
    cp -R "$REPO_ROOT/local-web/.next/static/." "$PORTABLE_ROOT/app/local-web/.next/static/"
    mkdir -p "$PORTABLE_ROOT/app/local-web/public"
    cp -R "$REPO_ROOT/local-web/public/." "$PORTABLE_ROOT/app/local-web/public/"
    cd "$PORTABLE_ROOT"
else
    echo "  Frontend already exists (built on another platform), skipping build."
fi

# Ensure Mac-specific sharp binary is present
echo "  Checking sharp binary for $PLATFORM..."
if [ "$ARCH" = "arm64" ]; then
    SHARP_PKG="@img/sharp-darwin-arm64"
    SHARP_PNPM="@img+sharp-darwin-arm64"
else
    SHARP_PKG="@img/sharp-darwin-x64"
    SHARP_PNPM="@img+sharp-darwin-x64"
fi
SHARP_DEST="$PORTABLE_ROOT/app/local-web/node_modules/$SHARP_PKG"
if [ ! -d "$SHARP_DEST" ]; then
    SHARP_SRC=$(find "$REPO_ROOT/local-web/node_modules/.pnpm" -maxdepth 1 -name "${SHARP_PNPM}@*" -type d 2>/dev/null | head -1)
    if [ -n "$SHARP_SRC" ] && [ -d "$SHARP_SRC/node_modules/$SHARP_PKG" ]; then
        echo "  Copying $SHARP_PKG..."
        mkdir -p "$(dirname "$SHARP_DEST")"
        cp -R "$SHARP_SRC/node_modules/$SHARP_PKG" "$SHARP_DEST"
    else
        echo "  [WARN] $SHARP_PKG not found in pnpm store. Image processing may not work."
    fi
fi

echo "  Frontend OK."

# ================================================================
#  [8/8] Initialize config files
# ================================================================
echo "[8/8] Initializing config files..."

if [ ! -f "$PORTABLE_ROOT/data/config/server.env" ]; then
    if [ -f "$REPO_ROOT/local-api/.env.example" ]; then
        cp "$REPO_ROOT/local-api/.env.example" "$PORTABLE_ROOT/data/config/server.env"
        echo "  Created data/config/server.env from template."
    fi
fi
if [ ! -f "$PORTABLE_ROOT/data/config/client.env" ]; then
    if [ -f "$REPO_ROOT/local-sensor/.env.example" ]; then
        cp "$REPO_ROOT/local-sensor/.env.example" "$PORTABLE_ROOT/data/config/client.env"
        echo "  Created data/config/client.env from template."
    fi
fi

echo ""
echo "================================================"
echo "  Setup Complete! ($PLATFORM)"
echo "================================================"
echo ""
echo "  Next steps:"
echo "    1. Double-click Mac-Start.command to launch"
echo "    2. Configure API keys in the web UI"
echo ""
echo "  To add another platform, run setup on that OS."
echo ""
