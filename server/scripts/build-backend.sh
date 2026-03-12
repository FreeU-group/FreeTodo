#!/bin/bash
# Build script for LifeTrace backend using PyInstaller
# Usage: ./build-backend.sh
# Supports: macOS, Linux, Windows (via WSL/Git Bash/MSYS2)

set -e  # Exit on error

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Script is in lifetrace/scripts/, so go up two levels to get project root
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LIFETRACE_DIR="$SCRIPT_DIR/.."
DIST_DIR="$PROJECT_ROOT/dist-backend"
VENV_DIR="$PROJECT_ROOT/.venv"

# Detect platform and set paths accordingly
detect_platform() {
    case "$(uname -s)" in
        Linux*)
            # Check if running in WSL
            if grep -qi microsoft /proc/version 2>/dev/null; then
                echo "windows"
            else
                echo "linux"
            fi
            ;;
        Darwin*)
            echo "macos"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

PLATFORM=$(detect_platform)
echo "Detected platform: $PLATFORM"

# Set platform-specific paths
if [ "$PLATFORM" = "windows" ]; then
    # Windows uses Scripts/ directory and .exe extension
    VENV_BIN_DIR="$VENV_DIR/Scripts"
    VENV_PYTHON="$VENV_BIN_DIR/python.exe"
    VENV_PYINSTALLER="$VENV_BIN_DIR/pyinstaller.exe"
else
    # macOS and Linux use bin/ directory
    VENV_BIN_DIR="$VENV_DIR/bin"
    VENV_PYTHON="$VENV_BIN_DIR/python"
    VENV_PYINSTALLER="$VENV_BIN_DIR/pyinstaller"
fi

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
if [ ! -f "$VENV_PYINSTALLER" ]; then
    echo "PyInstaller not found in .venv at: $VENV_PYINSTALLER"
    echo "Attempting to install via uv..."
    cd "$PROJECT_ROOT"

    # Try to find uv command
    if command -v uv &> /dev/null; then
        uv sync --group dev
    elif [ "$PLATFORM" = "windows" ]; then
        # On Windows/WSL, try common paths for uv
        if [ -f "$HOME/.local/bin/uv" ]; then
            "$HOME/.local/bin/uv" sync --group dev
        elif [ -f "$HOME/.cargo/bin/uv" ]; then
            "$HOME/.cargo/bin/uv" sync --group dev
        else
            echo "Error: 'uv' command not found."
            echo "Please install dependencies manually:"
            echo "  1. In PowerShell: uv sync --group dev"
            echo "  2. Or install uv in WSL: curl -LsSf https://astral.sh/uv/install.sh | sh"
            exit 1
        fi
    else
        echo "Error: 'uv' command not found. Please install it first:"
        echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
        exit 1
    fi

    if [ ! -f "$VENV_PYINSTALLER" ]; then
        echo "Error: Failed to install PyInstaller in .venv"
        echo "Expected location: $VENV_PYINSTALLER"
        exit 1
    fi
fi

echo "Using Python: $VENV_PYTHON"
echo "Using PyInstaller: $VENV_PYINSTALLER"

# Verify critical dependencies are available in .venv
echo "Verifying dependencies in .venv..."
"$VENV_PYTHON" -c "import fastapi, uvicorn, pydantic; print('All critical dependencies found')" || {
    echo "Error: Missing dependencies in .venv. Please run 'uv sync --group dev' first."
    exit 1
}

# Include vector modules in PyInstaller bundle.
export LIFETRACE_INCLUDE_VECTOR=1

# Enable UPX compression if available.
if command -v upx &> /dev/null; then
    export PYINSTALLER_UPX=1
    echo "UPX found: enabling PyInstaller compression."
else
    echo "UPX not found: skipping PyInstaller compression."
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

    # Copy config and models from _internal to app root (same level as _internal)
    # So in packaged environment, paths are backend/config/ and backend/models/
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
    if [ "$PLATFORM" = "windows" ]; then
        echo "Backend executable location: $DIST_DIR/lifetrace.exe"
    else
        echo "Backend executable location: $DIST_DIR/lifetrace"
    fi
    echo "Config directory: $DIST_DIR/config"
    echo "Models directory: $DIST_DIR/models"
else
    echo "Error: Build directory not found: $BUILD_DIR"
    echo "Available directories in dist:"
    ls -la "$PROJECT_ROOT/dist" 2>/dev/null || echo "dist directory does not exist"
    exit 1
fi
