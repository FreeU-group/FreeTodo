# ============================================
# LifeTrace - One-Click Startup Script
# LifeTrace - 一键启动脚本
# ============================================
# Description: Start LifeTrace services
# 描述: 启动 LifeTrace 服务
# Usage: .\scripts\start.ps1 [options]
# 用法: .\scripts\start.ps1 [选项]
# ============================================

#Requires -Version 5.1

param(
    [switch]$BackendOnly,
    [switch]$FrontendOnly,
    [switch]$NoBrowser,
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
    Write-Host "Usage: .\scripts\start.ps1 [options]"
    Write-Host "用法: .\scripts\start.ps1 [选项]"
    Write-Host ""
    Write-Host "Options / 选项:"
    Write-Host "  -BackendOnly     Start backend only / 仅启动后端"
    Write-Host "  -FrontendOnly    Start frontend only / 仅启动前端"
    Write-Host "  -NoBrowser       Don't open browser automatically / 不自动打开浏览器"
    Write-Host "  -Help            Show this help message / 显示帮助信息"
    exit 0
}

# ============================================
# Get Script Directory / 获取脚本目录
# ============================================
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$PidDir = Join-Path $ProjectRoot ".pids"

Set-Location $ProjectRoot

# Create PID directory
if (-not (Test-Path $PidDir)) {
    New-Item -ItemType Directory -Path $PidDir -Force | Out-Null
}

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
Write-Host "              Startup Script / 启动脚本                          " -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# Read Configuration / 读取配置
# ============================================
$ConfigFile = "lifetrace\config\config.yaml"
$DefaultConfigFile = "lifetrace\config\default_config.yaml"

# Default values / 默认值
$BackendHost = "127.0.0.1"
$BackendPort = 8000
$FrontendPort = 3000

# Read ports from config file / 从配置文件读取端口
$ConfigToRead = $ConfigFile
if (-not (Test-Path $ConfigFile)) {
    $ConfigToRead = $DefaultConfigFile
}

if (Test-Path $ConfigToRead) {
    $content = Get-Content $ConfigToRead -Raw

    # Read backend host (server.host)
    if ($content -match "server:[\s\S]*?host:\s*(\S+)") {
        $BackendHost = $Matches[1]
    }

    # Read backend port (server.port)
    if ($content -match "server:[\s\S]*?port:\s*(\d+)") {
        $BackendPort = [int]$Matches[1]
    }

    # Read frontend port (frontend.port)
    if ($content -match "frontend:[\s\S]*?port:\s*(\d+)") {
        $FrontendPort = [int]$Matches[1]
    }

    Write-Info "Backend: http://${BackendHost}:${BackendPort}, Frontend port: $FrontendPort (from config)"
    Write-Info "后端: http://${BackendHost}:${BackendPort}, 前端端口: $FrontendPort (来自配置)"
}

# ============================================
# Environment Validation / 环境验证
# ============================================
Write-Step "Validating environment... / 验证环境..."

# Check virtual environment
if (-not (Test-Path ".venv")) {
    Write-Error "Virtual environment not found. Please run install.ps1 first."
    Write-Error "未找到虚拟环境。请先运行 install.ps1。"
    exit 1
}

# Check node_modules
if (-not (Test-Path "frontend\node_modules")) {
    Write-Error "node_modules not found. Please run install.ps1 first."
    Write-Error "未找到 node_modules。请先运行 install.ps1。"
    exit 1
}

# Check config.yaml
if (-not (Test-Path $ConfigFile)) {
    Write-Warning "config.yaml not found. Creating from default_config.yaml..."
    Write-Warning "未找到 config.yaml。从 default_config.yaml 创建..."
    if (Test-Path $DefaultConfigFile) {
        Copy-Item $DefaultConfigFile $ConfigFile
    } else {
        Write-Error "default_config.yaml not found. Please create config.yaml manually."
        Write-Error "未找到 default_config.yaml。请手动创建 config.yaml。"
        exit 1
    }
}

Write-Success "Environment validated! / 环境验证通过！"
Write-Host ""

# ============================================
# Check for Running Services / 检查运行中的服务
# ============================================
function Test-PortInUse {
    param([int]$Port)
    $connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connection
}

# Check if services are already running
if (-not $FrontendOnly) {
    if (Test-PortInUse -Port $BackendPort) {
        Write-Warning "Port $BackendPort is already in use. Backend may already be running."
        Write-Warning "端口 $BackendPort 已被占用。后端可能已在运行。"
        Write-Info "Use .\scripts\stop.ps1 to stop existing services / 使用 .\scripts\stop.ps1 停止现有服务"
    }
}

if (-not $BackendOnly) {
    if (Test-PortInUse -Port $FrontendPort) {
        Write-Warning "Port $FrontendPort is already in use. Frontend may already be running."
        Write-Warning "端口 $FrontendPort 已被占用。前端可能已在运行。"
        Write-Info "Use .\scripts\stop.ps1 to stop existing services / 使用 .\scripts\stop.ps1 停止现有服务"
    }
}

# ============================================
# Start Backend / 启动后端
# ============================================
$BackendProcess = $null
if (-not $FrontendOnly) {
    Write-Step "Starting backend service... / 正在启动后端服务..."

    # Activate virtual environment and start backend
    $VenvActivate = Join-Path $ProjectRoot ".venv\Scripts\Activate.ps1"

    # Start backend process
    $BackendProcess = Start-Process -FilePath "powershell" -ArgumentList @(
        "-NoExit",
        "-Command",
        "& '$VenvActivate'; python -m lifetrace.server"
    ) -PassThru -WindowStyle Normal

    # Save PID
    $BackendProcess.Id | Out-File -FilePath (Join-Path $PidDir "backend.pid") -Encoding ASCII

    # Wait for backend / 等待后端
    Write-Info "Waiting for backend to be ready... / 等待后端就绪..."
    Write-Info "(First startup may take several minutes to download models / 首次启动可能需要几分钟下载模型)"

    $backendReady = $false
    $round = 1

    while (-not $backendReady) {
        Write-Info "Waiting 30 seconds... (round $round) / 等待 30 秒...（第 $round 轮）"
        Start-Sleep -Seconds 30

        # Health check / 健康检查
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$BackendPort/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Success "Backend is ready at http://localhost:$BackendPort"
                Write-Success "后端已就绪: http://localhost:$BackendPort"
                $backendReady = $true
            }
        } catch {
            Write-Info "Backend not ready yet, continuing to wait... / 后端尚未就绪，继续等待..."
        }

        $round++
    }
}

# ============================================
# Start Frontend / 启动前端
# ============================================
$FrontendProcess = $null
if (-not $BackendOnly) {
    Write-Step "Starting frontend service... / 正在启动前端服务..."

    $FrontendDir = Join-Path $ProjectRoot "frontend"

    # Build API URL for frontend / 构建前端 API URL
    $ApiUrl = "http://${BackendHost}:${BackendPort}"
    Write-Info "Frontend API URL: $ApiUrl"
    Write-Info "前端 API 地址: $ApiUrl"

    # Start frontend process with configured port and API URL / 使用配置的端口和 API 地址启动前端
    $FrontendProcess = Start-Process -FilePath "powershell" -ArgumentList @(
        "-NoExit",
        "-Command",
        "`$env:NEXT_PUBLIC_API_URL='$ApiUrl'; Set-Location '$FrontendDir'; pnpm dev -p $FrontendPort"
    ) -PassThru -WindowStyle Normal

    # Save PID
    $FrontendProcess.Id | Out-File -FilePath (Join-Path $PidDir "frontend.pid") -Encoding ASCII

    # Wait for frontend to start
    Write-Info "Waiting for frontend to be ready... / 等待前端就绪..."
    $maxRetries = 60
    $retryCount = 0
    while ($retryCount -lt $maxRetries) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$FrontendPort" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Success "Frontend is ready at http://localhost:$FrontendPort"
                Write-Success "前端已就绪: http://localhost:$FrontendPort"
                break
            }
        } catch {
            # Continue waiting
        }
        Start-Sleep -Seconds 1
        $retryCount++
        Write-Host "`r[INFO] Waiting... $retryCount/${maxRetries}s" -NoNewline -ForegroundColor Blue
    }
    Write-Host ""

    if ($retryCount -ge $maxRetries) {
        Write-Warning "Frontend health check timed out. It may still be starting..."
        Write-Warning "前端健康检查超时。它可能仍在启动中..."
    }
}

# ============================================
# Open Browser / 打开浏览器
# ============================================
if (-not $NoBrowser -and -not $BackendOnly) {
    Write-Info "Opening browser... / 正在打开浏览器..."
    Start-Process "http://localhost:$FrontendPort"
}

# ============================================
# Startup Complete / 启动完成
# ============================================
Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "                                                                " -ForegroundColor Green
Write-Host "           Services Started! / 服务已启动！                      " -ForegroundColor Green
Write-Host "                                                                " -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
Write-Host ""

if (-not $FrontendOnly) {
    Write-Host "  Backend / 后端:  " -NoNewline -ForegroundColor Cyan
    Write-Host "http://localhost:$BackendPort" -ForegroundColor Blue
}
if (-not $BackendOnly) {
    Write-Host "  Frontend / 前端: " -NoNewline -ForegroundColor Cyan
    Write-Host "http://localhost:$FrontendPort" -ForegroundColor Blue
}

Write-Host ""
Write-Host "To stop services, close the service windows or press Ctrl+C." -ForegroundColor Yellow
Write-Host "要停止服务，请关闭服务窗口或按 Ctrl+C。" -ForegroundColor Yellow
Write-Host ""
Write-Host "Services are running in separate windows." -ForegroundColor Yellow
Write-Host "服务正在独立窗口中运行。" -ForegroundColor Yellow
Write-Host ""
