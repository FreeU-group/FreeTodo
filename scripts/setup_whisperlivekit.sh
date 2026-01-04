#!/bin/bash
# WhisperLiveKit 安装和设置脚本
# 使用 uv 和虚拟环境

set -e

echo "🚀 开始设置 WhisperLiveKit..."

# 检查是否在项目根目录
if [ ! -f "pyproject.toml" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 检查 uv 是否安装
if ! command -v uv &> /dev/null; then
    echo "❌ 错误: uv 未安装，请先安装 uv"
    echo "   安装方法: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# 检查虚拟环境
if [ ! -d ".venv" ]; then
    echo "📦 创建虚拟环境..."
    uv venv
fi

# 激活虚拟环境
echo "🔧 激活虚拟环境..."
source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate 2>/dev/null || {
    echo "⚠️  无法自动激活虚拟环境，请手动运行:"
    echo "   source .venv/bin/activate  # Linux/macOS"
    echo "   .venv\\Scripts\\activate     # Windows"
}

# 同步依赖
echo "📥 同步依赖（包括 WhisperLiveKit）..."
uv sync

# 检查 FFmpeg
echo "🔍 检查 FFmpeg..."
if ! command -v ffmpeg &> /dev/null; then
    echo "⚠️  警告: FFmpeg 未安装，WhisperLiveKit 需要 FFmpeg"
    echo "   安装方法:"
    echo "   - macOS: brew install ffmpeg"
    echo "   - Ubuntu/Debian: sudo apt install ffmpeg"
    echo "   - Windows: 从 https://ffmpeg.org/download.html 下载并添加到 PATH"
else
    echo "✅ FFmpeg 已安装: $(ffmpeg -version | head -n 1)"
fi

# 检查 WhisperLiveKit
echo "🔍 检查 WhisperLiveKit..."
if uv pip list | grep -q whisperlivekit; then
    echo "✅ WhisperLiveKit 已安装"
    echo "   版本: $(uv pip show whisperlivekit | grep Version | cut -d' ' -f2)"
else
    echo "❌ WhisperLiveKit 未安装，尝试安装..."
    uv pip install whisperlivekit
fi

# 检查 websockets
echo "🔍 检查 websockets..."
if uv pip list | grep -q websockets; then
    echo "✅ websockets 已安装"
else
    echo "📦 安装 websockets..."
    uv pip install websockets
fi

echo ""
echo "✅ 设置完成！"
echo ""
echo "📋 下一步："
echo "   1. 启动服务器: python -m lifetrace.server"
echo "   2. WhisperLiveKit 服务器会自动启动（端口 8002）"
echo "   3. 前端会自动连接到 /api/voice/stream"
echo ""
echo "💡 提示: 首次运行时会自动下载模型（约 1.5GB）"





