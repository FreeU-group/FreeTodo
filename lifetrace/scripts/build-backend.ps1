# Build script for LifeTrace backend using PyInstaller (Windows PowerShell)
# Usage: .\build-backend.ps1

$ErrorActionPreference = "Stop"

# Get the script directory and project root
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
# Script is in lifetrace/scripts/, so go up two levels to get project root
$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $SCRIPT_DIR)
$LIFETRACE_DIR = Split-Path -Parent $SCRIPT_DIR
$DIST_DIR = "$PROJECT_ROOT\dist-backend"
$VENV_DIR = "$PROJECT_ROOT\.venv"

Write-Host "Building LifeTrace backend..."
Write-Host "Project root: $PROJECT_ROOT"
Write-Host "Lifetrace dir: $LIFETRACE_DIR"
Write-Host "Output dir: $DIST_DIR"
Write-Host "Using virtual environment: $VENV_DIR"

# Check if .venv exists
if (-not (Test-Path $VENV_DIR)) {
    Write-Host "Error: Virtual environment not found at $VENV_DIR"
    Write-Host "Please run 'uv sync --group dev' first to create the virtual environment."
    exit 1
}

# Check if PyInstaller is installed in .venv
$VENV_PYINSTALLER = "$VENV_DIR\Scripts\pyinstaller.exe"
if (-not (Test-Path $VENV_PYINSTALLER)) {
    Write-Host "PyInstaller not found in .venv. Installing via uv..."
    Set-Location $PROJECT_ROOT
    uv sync --group dev
    if (-not (Test-Path $VENV_PYINSTALLER)) {
        Write-Host "Error: Failed to install PyInstaller in .venv"
        exit 1
    }
}

# Use .venv Python and PyInstaller
$VENV_PYTHON = "$VENV_DIR\Scripts\python.exe"

Write-Host "Using Python: $VENV_PYTHON"
Write-Host "Using PyInstaller: $VENV_PYINSTALLER"

# Verify critical dependencies are available in .venv
Write-Host "Verifying dependencies in .venv..."
try {
    & $VENV_PYTHON -c "import fastapi, uvicorn, pydantic; print('✓ All critical dependencies found')"
    if ($LASTEXITCODE -ne 0) {
        throw "Dependency check failed"
    }
} catch {
    Write-Host "Error: Missing dependencies in .venv. Please run 'uv sync --group dev' first."
    exit 1
}

# Clean previous build
if (Test-Path $DIST_DIR) {
    Write-Host "Cleaning previous build..."
    Remove-Item -Recurse -Force $DIST_DIR
}

# Create dist directory
New-Item -ItemType Directory -Force -Path $DIST_DIR | Out-Null

# Change to project root directory
Set-Location $PROJECT_ROOT

# Run PyInstaller using .venv Python
Write-Host "Running PyInstaller..."
# Change to lifetrace directory to run PyInstaller (so paths in spec file work correctly)
Set-Location $LIFETRACE_DIR
# Use .venv Python explicitly to ensure all dependencies are from .venv
& $VENV_PYTHON -m PyInstaller --clean --noconfirm pyinstaller.spec

# Copy the built executable to dist-backend
# PyInstaller creates a directory with the same name as the spec file target
# PyInstaller runs from LIFETRACE_DIR, so dist is created there
$BUILD_DIR = "$LIFETRACE_DIR\dist\lifetrace"
if (Test-Path $BUILD_DIR) {
    Write-Host "Copying build output to $DIST_DIR..."
    Copy-Item -Recurse -Force "$BUILD_DIR\*" $DIST_DIR

    # 将 config 和 models 从 _internal 复制到 app 根目录（与 _internal 同级别）
    # 这样在打包环境中，路径为 backend\config\ 和 backend\models\
    $internalConfig = "$DIST_DIR\_internal\config"
    if (Test-Path $internalConfig) {
        Write-Host "Copying config files to app root..."
        $appConfig = "$DIST_DIR\config"
        New-Item -ItemType Directory -Path $appConfig -Force | Out-Null
        Copy-Item -Path "$internalConfig\*" -Destination $appConfig -Recurse -Force -ErrorAction SilentlyContinue
    }

    $internalModels = "$DIST_DIR\_internal\models"
    if (Test-Path $internalModels) {
        Write-Host "Copying model files to app root..."
        $appModels = "$DIST_DIR\models"
        New-Item -ItemType Directory -Path $appModels -Force | Out-Null
        Copy-Item -Path "$internalModels\*" -Destination $appModels -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Backend build complete! Output: $DIST_DIR"
    Write-Host "Backend executable location: $DIST_DIR\lifetrace.exe"
    Write-Host "Config directory: $DIST_DIR\config"
    Write-Host "Models directory: $DIST_DIR\models"
} else {
    Write-Host "Error: Build directory not found: $BUILD_DIR"
    $DIST_PARENT = "$PROJECT_ROOT\dist"
    if (Test-Path $DIST_PARENT) {
        Write-Host "Available directories in dist:"
        Get-ChildItem $DIST_PARENT | ForEach-Object { Write-Host "  $($_.Name)" }
    } else {
        Write-Host "dist directory does not exist"
    }
    exit 1
}
