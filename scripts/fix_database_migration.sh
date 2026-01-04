#!/bin/bash
# 修复数据库迁移脚本

set -e

echo "🔧 开始修复数据库迁移..."

# 检查是否在项目根目录
if [ ! -f "pyproject.toml" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 激活虚拟环境
if [ -d ".venv" ]; then
    echo "🔧 激活虚拟环境..."
    source .venv/bin/activate 2>/dev/null || source .venv/Scripts/activate 2>/dev/null || {
        echo "⚠️  无法自动激活虚拟环境，请手动运行:"
        echo "   source .venv/bin/activate  # Linux/macOS"
        echo "   .venv\\Scripts\\activate     # Windows"
        exit 1
    }
fi

# 设置 UTF-8 编码环境变量
export PYTHONIOENCODING=utf-8

# 检查 lifetrace 目录
if [ ! -d "lifetrace" ]; then
    echo "❌ 错误: 未找到 lifetrace 目录"
    echo "   请确保在项目根目录运行此脚本"
    exit 1
fi

# 进入 lifetrace 目录
cd lifetrace

# 运行数据库迁移
echo "📦 运行数据库迁移..."
python -m alembic upgrade head

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 数据库迁移完成！"
else
    echo ""
    echo "❌ 数据库迁移失败"
    exit 1
fi

