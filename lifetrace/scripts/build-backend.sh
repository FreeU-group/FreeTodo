#!/bin/bash
# Build script for LifeTrace backend using PyInstaller
# Usage: ./build-backend.sh

set -e  # Exit on error

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Script is in lifetrace/scripts/, so go up two levels to get project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LIFETRACE_DIR="$SCRIPT_DIR/.."
DIST_DIR="$PROJECT_ROOT/dist-backend"
VENV_DIR="$PROJECT_ROOT/.venv"

echo "Building LifeTrace backend..."
echo "Project root: $PROJECT_ROOT"
echo "Lifetrace dir: $LIFETRACE_DIR"
echo "Output dir: $DIST_DIR"
echo "Using virtual environment: $VENV_DIR"

# Check if .venv exists
if [ ! -d "$VENV_DIR" ]; then
    echo "Error: Virtual environment not found at $VENV_DIR"
    echo "Please run 'uv sync --group dev' first to create the virtual environment."
    exit 1
fi

# Check if PyInstaller is installed in .venv
VENV_PYINSTALLER="$VENV_DIR/bin/pyinstaller"
if [ ! -f "$VENV_PYINSTALLER" ]; then
    echo "PyInstaller not found in .venv. Installing via uv..."
    cd "$PROJECT_ROOT"
    uv sync --group dev
    if [ ! -f "$VENV_PYINSTALLER" ]; then
        echo "Error: Failed to install PyInstaller in .venv"
        exit 1
    fi
fi

# Use .venv Python and PyInstaller
VENV_PYTHON="$VENV_DIR/bin/python"

echo "Using Python: $VENV_PYTHON"
echo "Using PyInstaller: $VENV_PYINSTALLER"

# Verify critical dependencies are available in .venv
echo "Verifying dependencies in .venv..."
"$VENV_PYTHON" -c "import fastapi, uvicorn, pydantic; print('✓ All critical dependencies found')" || {
    echo "Error: Missing dependencies in .venv. Please run 'uv sync --group dev' first."
    exit 1
}

# Clean previous build
if [ -d "$DIST_DIR" ]; then
    echo "Cleaning previous build..."
    rm -rf "$DIST_DIR"
fi

# Create dist directory
mkdir -p "$DIST_DIR"

# Change to project root directory
cd "$PROJECT_ROOT"

# Run PyInstaller using .venv Python
echo "Running PyInstaller..."
# Change to lifetrace directory to run PyInstaller (so paths in spec file work correctly)
cd "$LIFETRACE_DIR"
# Use .venv Python explicitly to ensure all dependencies are from .venv
"$VENV_PYTHON" -m PyInstaller --clean --noconfirm pyinstaller.spec

# Copy the built executable to dist-backend
# PyInstaller creates a directory with the same name as the spec file target
# PyInstaller runs from LIFETRACE_DIR, so dist is created there
BUILD_DIR="$LIFETRACE_DIR/dist/lifetrace"
if [ -d "$BUILD_DIR" ]; then
    echo "Copying build output to $DIST_DIR..."
    cp -r "$BUILD_DIR"/* "$DIST_DIR/"

    # 将 config 和 models 从 _internal 复制到 app 根目录（与 _internal 同级别）
    # 这样在打包环境中，路径为 backend/config/ 和 backend/models/
    if [ -d "$DIST_DIR/_internal/config" ]; then
        echo "Copying config files to app root..."
        mkdir -p "$DIST_DIR/config"
        cp -r "$DIST_DIR/_internal/config"/* "$DIST_DIR/config/" 2>/dev/null || true
    fi

    if [ -d "$DIST_DIR/_internal/models" ]; then
        echo "Copying model files to app root..."
        mkdir -p "$DIST_DIR/models"
        cp -r "$DIST_DIR/_internal/models"/* "$DIST_DIR/models/" 2>/dev/null || true
    fi

    echo "Backend build complete! Output: $DIST_DIR"
    echo "Backend executable location: $DIST_DIR/lifetrace"
    echo "Config directory: $DIST_DIR/config"
    echo "Models directory: $DIST_DIR/models"
else
    echo "Error: Build directory not found: $BUILD_DIR"
    echo "Available directories in dist:"
    ls -la "$PROJECT_ROOT/dist" 2>/dev/null || echo "dist directory does not exist"
    exit 1
fi
