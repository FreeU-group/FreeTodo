# Build script for LifeTrace backend using PyInstaller (Windows PowerShell)
# Usage: .\build-backend.ps1

$ErrorActionPreference = "Stop"

# Get the script directory and project root
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
# Script is in lifetrace/scripts/, so go up two levels to get project root
$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $SCRIPT_DIR)
$LIFETRACE_DIR = Split-Path -Parent $SCRIPT_DIR
$DIST_DIR = Join-Path $PROJECT_ROOT "dist-backend"

Write-Host "Building LifeTrace backend..."
Write-Host "Project root: $PROJECT_ROOT"
Write-Host "Lifetrace dir: $LIFETRACE_DIR"
Write-Host "Output dir: $DIST_DIR"

# Check if PyInstaller is installed
try {
    $null = Get-Command pyinstaller -ErrorAction Stop
} catch {
    Write-Host "PyInstaller is not installed. Installing..."
    pip install pyinstaller
}

# Clean previous build
if (Test-Path $DIST_DIR) {
    Write-Host "Cleaning previous build..."
    Remove-Item -Recurse -Force $DIST_DIR
}

# Create dist directory
New-Item -ItemType Directory -Force -Path $DIST_DIR | Out-Null

# Change to lifetrace directory to run PyInstaller (so paths in spec file work correctly)
Set-Location $LIFETRACE_DIR

# Run PyInstaller
Write-Host "Running PyInstaller..."
pyinstaller --clean --noconfirm pyinstaller.spec

# Copy the built executable to dist-backend
# PyInstaller creates a directory with the same name as the spec file target
# PyInstaller runs from LIFETRACE_DIR, so dist is created there
$BUILD_DIR = Join-Path $LIFETRACE_DIR "dist" "lifetrace"
if (Test-Path $BUILD_DIR) {
    Write-Host "Copying build output to $DIST_DIR..."
    Copy-Item -Recurse -Force "$BUILD_DIR\*" $DIST_DIR

    # 将 config 和 models 从 _internal 复制到 app 根目录（与 _internal 同级别）
    # 这样在打包环境中，路径为 backend\config\ 和 backend\models\
    $internalConfig = Join-Path $DIST_DIR "_internal" "config"
    if (Test-Path $internalConfig) {
        Write-Host "Copying config files to app root..."
        $appConfig = Join-Path $DIST_DIR "config"
        New-Item -ItemType Directory -Path $appConfig -Force | Out-Null
        Copy-Item -Path "$internalConfig\*" -Destination $appConfig -Recurse -Force -ErrorAction SilentlyContinue
    }

    $internalModels = Join-Path $DIST_DIR "_internal" "models"
    if (Test-Path $internalModels) {
        Write-Host "Copying model files to app root..."
        $appModels = Join-Path $DIST_DIR "models"
        New-Item -ItemType Directory -Path $appModels -Force | Out-Null
        Copy-Item -Path "$internalModels\*" -Destination $appModels -Recurse -Force -ErrorAction SilentlyContinue
    }

    Write-Host "Backend build complete! Output: $DIST_DIR"
    Write-Host "Backend executable location: $(Join-Path $DIST_DIR 'lifetrace.exe')"
    Write-Host "Config directory: $(Join-Path $DIST_DIR 'config')"
    Write-Host "Models directory: $(Join-Path $DIST_DIR 'models')"
} else {
    Write-Host "Error: Build directory not found: $BUILD_DIR"
    $DIST_PARENT = Join-Path $PROJECT_ROOT "dist"
    if (Test-Path $DIST_PARENT) {
        Write-Host "Available directories in dist:"
        Get-ChildItem $DIST_PARENT | ForEach-Object { Write-Host "  $($_.Name)" }
    } else {
        Write-Host "dist directory does not exist"
    }
    exit 1
}
