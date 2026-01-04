# WhisperLiveKit 安装和设置脚本 (PowerShell)
# 使用 uv 和虚拟环境

$ErrorActionPreference = "Stop"

Write-Host "🚀 开始设置 WhisperLiveKit..." -ForegroundColor Cyan

# 检查是否在项目根目录
if (-not (Test-Path "pyproject.toml")) {
    Write-Host "❌ 错误: 请在项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

# 检查 uv 是否安装
try {
    $null = Get-Command uv -ErrorAction Stop
} catch {
    Write-Host "❌ 错误: uv 未安装，请先安装 uv" -ForegroundColor Red
    Write-Host "   安装方法: powershell -ExecutionPolicy ByPass -c `"irm https://astral.sh/uv/install.ps1 | iex`"" -ForegroundColor Yellow
    exit 1
}

# 检查虚拟环境
if (-not (Test-Path ".venv")) {
    Write-Host "📦 创建虚拟环境..." -ForegroundColor Yellow
    uv venv
}

# 激活虚拟环境
Write-Host "🔧 激活虚拟环境..." -ForegroundColor Yellow
& ".venv\Scripts\Activate.ps1"

# 同步依赖
Write-Host "📥 同步依赖（包括 WhisperLiveKit）..." -ForegroundColor Yellow
uv sync

# 检查 FFmpeg
Write-Host "🔍 检查 FFmpeg..." -ForegroundColor Yellow
try {
    $ffmpegVersion = ffmpeg -version 2>&1 | Select-Object -First 1
    Write-Host "✅ FFmpeg 已安装: $ffmpegVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠️  警告: FFmpeg 未安装，WhisperLiveKit 需要 FFmpeg" -ForegroundColor Yellow
    Write-Host "   安装方法: 从 https://ffmpeg.org/download.html 下载并添加到 PATH" -ForegroundColor Yellow
}

# 检查 WhisperLiveKit
Write-Host "🔍 检查 WhisperLiveKit..." -ForegroundColor Yellow
$whisperlivekit = uv pip list | Select-String "whisperlivekit"
if ($whisperlivekit) {
    Write-Host "✅ WhisperLiveKit 已安装" -ForegroundColor Green
    $version = uv pip show whisperlivekit | Select-String "Version" | ForEach-Object { $_.Line.Split()[1] }
    Write-Host "   版本: $version" -ForegroundColor Gray
} else {
    Write-Host "❌ WhisperLiveKit 未安装，尝试安装..." -ForegroundColor Yellow
    uv pip install whisperlivekit
}

# 检查 websockets
Write-Host "🔍 检查 websockets..." -ForegroundColor Yellow
$websockets = uv pip list | Select-String "websockets"
if ($websockets) {
    Write-Host "✅ websockets 已安装" -ForegroundColor Green
} else {
    Write-Host "📦 安装 websockets..." -ForegroundColor Yellow
    uv pip install websockets
}

Write-Host ""
Write-Host "✅ 设置完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📋 下一步：" -ForegroundColor Cyan
Write-Host "   1. 启动服务器: python -m lifetrace.server" -ForegroundColor White
Write-Host "   2. WhisperLiveKit 服务器会自动启动（端口 8002）" -ForegroundColor White
Write-Host "   3. 前端会自动连接到 /api/voice/stream" -ForegroundColor White
Write-Host ""
Write-Host "💡 提示: 首次运行时会自动下载模型（约 1.5GB）" -ForegroundColor Yellow





