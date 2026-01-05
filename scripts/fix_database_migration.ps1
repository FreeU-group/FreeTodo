# 修复数据库迁移脚本 (PowerShell)

$ErrorActionPreference = "Stop"

Write-Host "🔧 开始修复数据库迁移..." -ForegroundColor Cyan

# 检查是否在项目根目录
if (-not (Test-Path "pyproject.toml")) {
    Write-Host "❌ 错误: 请在项目根目录运行此脚本" -ForegroundColor Red
    exit 1
}

# 激活虚拟环境
if (Test-Path ".venv") {
    Write-Host "🔧 激活虚拟环境..." -ForegroundColor Yellow
    & ".venv\Scripts\Activate.ps1"
} else {
    Write-Host "⚠️  警告: 未找到虚拟环境 .venv" -ForegroundColor Yellow
    Write-Host "   请确保已运行: uv sync" -ForegroundColor Yellow
}

# 设置 UTF-8 编码环境变量（Windows 编码修复）
$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 检查 lifetrace 目录
if (-not (Test-Path "lifetrace")) {
    Write-Host "❌ 错误: 未找到 lifetrace 目录" -ForegroundColor Red
    Write-Host "   请确保在项目根目录运行此脚本" -ForegroundColor Yellow
    exit 1
}

# 进入 lifetrace 目录
Push-Location lifetrace

try {
    # 运行数据库迁移
    Write-Host "📦 运行数据库迁移..." -ForegroundColor Yellow
    python -m alembic upgrade head

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ 数据库迁移成功！" -ForegroundColor Green
    } else {
        Write-Host "❌ 数据库迁移失败，退出码: $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} finally {
    # 返回原目录
    Pop-Location
}

Write-Host ""
Write-Host "✅ 数据库迁移完成！" -ForegroundColor Green
