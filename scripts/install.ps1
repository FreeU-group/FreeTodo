# ============================================
# LifeTrace - One-Click Installation Script
# LifeTrace - 一键安装脚本
# ============================================
# Description: Automated setup for LifeTrace
# 描述: LifeTrace 自动化安装脚本
# Usage: .\scripts\install.ps1 [options]
# 用法: .\scripts\install.ps1 [选项]
# ============================================

#Requires -Version 5.1

param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend,
    [switch]$ChinaMirror,
    [switch]$Help
)

$ErrorActionPreference = "Stop"

# ============================================
# Color Output Functions / 颜色输出函数
# ============================================
function Write-Info { param([string]$Message) Write-Host "[INFO] $Message" -ForegroundColor Blue }
function Write-Success { param([string]$Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green }
function Write-Warning { param([string]$Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red }
function Write-Step { param([string]$Message) Write-Host "[STEP] $Message" -ForegroundColor Cyan }

# ============================================
# Help Message / 帮助信息
# ============================================
if ($Help) {
    Write-Host "Usage: .\scripts\install.ps1 [options]"
    Write-Host "用法: .\scripts\install.ps1 [选项]"
    Write-Host ""
    Write-Host "Options / 选项:"
    Write-Host "  -SkipFrontend    Skip frontend installation / 跳过前端安装"
    Write-Host "  -SkipBackend     Skip backend installation / 跳过后端安装"
    Write-Host "  -ChinaMirror     Use China mirror sources / 使用国内镜像源"
    Write-Host "  -Help            Show this help message / 显示帮助信息"
    exit 0
}

# ============================================
# Get Script Directory / 获取脚本目录
# ============================================
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Set-Location $ProjectRoot

# ============================================
# Banner
# ============================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "                                                                " -ForegroundColor Cyan
Write-Host "     ██╗     ██╗███████╗███████╗████████╗██████╗  █████╗ ██████╗███████╗" -ForegroundColor Green
Write-Host "     ██║     ██║██╔════╝██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██╔════╝" -ForegroundColor Green
Write-Host "     ██║     ██║█████╗  █████╗     ██║   ██████╔╝███████║██║     █████╗  " -ForegroundColor Green
Write-Host "     ██║     ██║██╔══╝  ██╔══╝     ██║   ██╔══██╗██╔══██║██║     ██╔══╝  " -ForegroundColor Green
Write-Host "     ███████╗██║██║     ███████╗   ██║   ██║  ██║██║  ██║╚██████╗███████╗" -ForegroundColor Green
Write-Host "     ╚══════╝╚═╝╚═╝     ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝" -ForegroundColor Green
Write-Host "                                                                " -ForegroundColor Cyan
Write-Host "          One-Click Installation Script / 一键安装脚本           " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# Step 1: Environment Check / 环境检查
# ============================================
Write-Step "Step 1/5: Checking environment... / 第1步/共5步: 检查环境..."

# Check Git / 检查 Git
try {
    $gitVersion = git --version
    Write-Success "Git: $gitVersion"
} catch {
    Write-Error "Git is not installed. Please install Git first."
    Write-Error "Git 未安装。请先安装 Git。"
    exit 1
}

# Check Python / 检查 Python
function Test-PythonVersion {
    $pythonCmd = $null

    # Try different Python commands
    foreach ($cmd in @("python", "python3")) {
        try {
            $null = & $cmd --version 2>&1
            $pythonCmd = $cmd
            break
        } catch {
            continue
        }
    }

    if (-not $pythonCmd) {
        Write-Error "Python is not installed. Please install Python >= 3.13"
        Write-Error "Python 未安装。请安装 Python >= 3.13"
        exit 1
    }

    # Check version
    $versionOutput = & $pythonCmd -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    $parts = $versionOutput.Split('.')
    $major = [int]$parts[0]
    $minor = [int]$parts[1]

    if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 13)) {
        Write-Error "Python >= 3.13 is required (found: $versionOutput)"
        Write-Error "需要 Python >= 3.13 (当前: $versionOutput)"
        exit 1
    }

    Write-Success "Python: $versionOutput"
    return $pythonCmd
}

$PythonCmd = Test-PythonVersion

# Check Node.js / 检查 Node.js
try {
    $nodeVersion = node --version
    $nodeVersionNum = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')

    if ($nodeVersionNum -lt 20) {
        Write-Error "Node.js >= 20 is required (found: $nodeVersion)"
        Write-Error "需要 Node.js >= 20 (当前: $nodeVersion)"
        exit 1
    }

    Write-Success "Node.js: $nodeVersion"
} catch {
    Write-Error "Node.js is not installed. Please install Node.js >= 20"
    Write-Error "Node.js 未安装。请安装 Node.js >= 20"
    exit 1
}

Write-Success "Environment check passed! / 环境检查通过！"
Write-Host ""

# ============================================
# Step 2: Install Package Managers / 安装包管理器
# ============================================
Write-Step "Step 2/5: Installing package managers... / 第2步/共5步: 安装包管理器..."

# Install uv / 安装 uv
try {
    $null = uv --version 2>&1
    Write-Success "uv: $(uv --version)"
} catch {
    Write-Info "Installing uv... / 正在安装 uv..."
    try {
        Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression

        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")

        # Verify installation
        $null = uv --version 2>&1
        Write-Success "uv: $(uv --version)"
    } catch {
        Write-Error "Failed to install uv. Please install it manually."
        Write-Error "uv 安装失败。请手动安装。"
        Write-Info "Visit / 访问: https://docs.astral.sh/uv/getting-started/installation/"
        exit 1
    }
}

# Install pnpm / 安装 pnpm
try {
    $null = pnpm --version 2>&1
    Write-Success "pnpm: $(pnpm --version)"
} catch {
    Write-Info "Installing pnpm... / 正在安装 pnpm..."
    try {
        if ($ChinaMirror) {
            npm config set registry https://registry.npmmirror.com
        }
        npm install -g pnpm

        # Verify installation
        $null = pnpm --version 2>&1
        Write-Success "pnpm: $(pnpm --version)"
    } catch {
        Write-Error "Failed to install pnpm. Please install it manually."
        Write-Error "pnpm 安装失败。请手动安装。"
        Write-Info "Visit / 访问: https://pnpm.io/installation"
        exit 1
    }
}

Write-Success "Package managers installed! / 包管理器安装完成！"
Write-Host ""

# ============================================
# Step 3: Install Backend Dependencies / 安装后端依赖
# ============================================
if (-not $SkipBackend) {
    Write-Step "Step 3/5: Installing backend dependencies... / 第3步/共5步: 安装后端依赖..."

    # Set China mirror for uv if needed
    if ($ChinaMirror) {
        $env:UV_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple"
    }

    # Install Python dependencies using uv
    Write-Info "Running uv sync... / 正在运行 uv sync..."
    uv sync

    # Verify virtual environment
    if (-not (Test-Path ".venv")) {
        Write-Error "Virtual environment not created. uv sync may have failed."
        Write-Error "虚拟环境未创建。uv sync 可能失败了。"
        exit 1
    }

    Write-Success "Backend dependencies installed! / 后端依赖安装完成！"
} else {
    Write-Warning "Skipping backend installation / 跳过后端安装"
}
Write-Host ""

# ============================================
# Step 4: Install Frontend Dependencies / 安装前端依赖
# ============================================
if (-not $SkipFrontend) {
    Write-Step "Step 4/5: Installing frontend dependencies... / 第4步/共5步: 安装前端依赖..."

    Set-Location "$ProjectRoot\frontend"

    # Set China mirror for pnpm if needed
    if ($ChinaMirror) {
        pnpm config set registry https://registry.npmmirror.com
    }

    # Install Node.js dependencies
    Write-Info "Running pnpm install... / 正在运行 pnpm install..."
    pnpm install

    # Verify node_modules
    if (-not (Test-Path "node_modules")) {
        Write-Error "node_modules not created. pnpm install may have failed."
        Write-Error "node_modules 未创建。pnpm install 可能失败了。"
        exit 1
    }

    Set-Location $ProjectRoot

    Write-Success "Frontend dependencies installed! / 前端依赖安装完成！"
} else {
    Write-Warning "Skipping frontend installation / 跳过前端安装"
}
Write-Host ""

# ============================================
# Step 5: Initialize Configuration / 初始化配置
# ============================================
Write-Step "Step 5/5: Initializing configuration... / 第5步/共5步: 初始化配置..."

$ConfigDir = Join-Path $ProjectRoot "lifetrace\config"
$ConfigFile = Join-Path $ConfigDir "config.yaml"
$DefaultConfig = Join-Path $ConfigDir "default_config.yaml"

if (-not (Test-Path $ConfigFile)) {
    if (Test-Path $DefaultConfig) {
        Write-Info "Creating config.yaml from default_config.yaml..."
        Write-Info "从 default_config.yaml 创建 config.yaml..."
        Copy-Item $DefaultConfig $ConfigFile
        Write-Success "Configuration file created! / 配置文件已创建！"
    } else {
        Write-Warning "default_config.yaml not found. Please create config.yaml manually."
        Write-Warning "未找到 default_config.yaml。请手动创建 config.yaml。"
    }
} else {
    Write-Info "config.yaml already exists / config.yaml 已存在"
}

Write-Success "Configuration initialized! / 配置初始化完成！"
Write-Host ""

# ============================================
# Installation Complete / 安装完成
# ============================================
Write-Host "================================================================" -ForegroundColor Green
Write-Host "                                                                " -ForegroundColor Green
Write-Host "         Installation Complete! / 安装完成！                     " -ForegroundColor Green
Write-Host "                                                                " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps / 后续步骤:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. Configure your LLM API Key / 配置 LLM API Key:" -ForegroundColor Yellow
Write-Host "     Edit / 编辑: " -NoNewline -ForegroundColor White
Write-Host "lifetrace\config\config.yaml" -ForegroundColor Blue
Write-Host ""
Write-Host "  2. Start the application / 启动应用:" -ForegroundColor Yellow
Write-Host "     " -NoNewline
Write-Host ".\scripts\start.ps1" -ForegroundColor Blue
Write-Host ""
Write-Host "  3. Open in browser / 在浏览器中打开:" -ForegroundColor Yellow
Write-Host "     " -NoNewline
Write-Host "http://localhost:3000" -ForegroundColor Blue
Write-Host ""
Write-Host "For more information / 更多信息:" -ForegroundColor Cyan
Write-Host "  " -NoNewline
Write-Host ".\scripts\start.ps1 -Help" -ForegroundColor Blue
Write-Host ""
