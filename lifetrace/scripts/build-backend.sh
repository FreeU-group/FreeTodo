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

echo "Building LifeTrace backend..."
echo "Project root: $PROJECT_ROOT"
echo "Lifetrace dir: $LIFETRACE_DIR"
echo "Output dir: $DIST_DIR"

# Check if PyInstaller is installed
if ! command -v pyinstaller &> /dev/null; then
    echo "PyInstaller is not installed. Installing..."
    pip install pyinstaller
fi

# Clean previous build
if [ -d "$DIST_DIR" ]; then
    echo "Cleaning previous build..."
    rm -rf "$DIST_DIR"
fi

# Create dist directory
mkdir -p "$DIST_DIR"

# Change to project root directory
cd "$PROJECT_ROOT"

# Run PyInstaller
echo "Running PyInstaller..."
# Change to lifetrace directory to run PyInstaller (so paths in spec file work correctly)
cd "$LIFETRACE_DIR"
pyinstaller --clean --noconfirm pyinstaller.spec

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
