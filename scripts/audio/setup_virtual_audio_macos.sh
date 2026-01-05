#!/bin/bash
# macOS 虚拟音频设备配置脚本
# 使用 BlackHole 虚拟音频驱动

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_ONLY=false
INSTALL=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --check-only)
            CHECK_ONLY=true
            shift
            ;;
        --install)
            INSTALL=true
            shift
            ;;
        *)
            echo "未知参数: $1"
            exit 1
            ;;
    esac
done

function check_blackhole_installed() {
    # 检查 BlackHole 是否已安装
    if system_profiler SPAudioDataType | grep -q "BlackHole"; then
        return 0
    fi
    return 1
}

function get_blackhole_devices() {
    # 获取 BlackHole 设备列表
    system_profiler SPAudioDataType | grep -A 5 "BlackHole" || echo ""
}

function install_blackhole() {
    echo "正在检查 BlackHole 安装..."

    if check_blackhole_installed; then
        echo "✅ BlackHole 已安装"
        return 0
    fi

    echo "⚠️  BlackHole 未安装"
    echo ""
    echo "安装步骤:"
    echo "1. 使用 Homebrew 安装（推荐）:"
    echo "   brew install blackhole-2ch"
    echo ""
    echo "2. 或从 GitHub 下载:"
    echo "   https://github.com/ExistentialAudio/BlackHole"
    echo ""
    echo "3. 安装后需要授权（系统设置 > 隐私与安全性 > 麦克风）"
    echo "4. 重启应用"

    return 1
}

function configure_audio_routing() {
    echo ""
    echo "配置音频路由建议:"
    echo "1. 使用 Audio MIDI Setup (应用程序 > 实用工具 > 音频 MIDI 设置)"
    echo "2. 创建多输出设备:"
    echo "   - 添加你的真实输出设备（如扬声器）"
    echo "   - 添加 BlackHole 2ch"
    echo "3. 将系统音频输出设置为这个多输出设备"
    echo ""
    echo "或者使用第三方工具如 Soundflower 或 Loopback"
}

# 主逻辑
echo "=== macOS 虚拟音频设备配置 ==="

if [ "$CHECK_ONLY" = true ]; then
    echo ""
    echo "检查虚拟音频设备状态..."

    if check_blackhole_installed; then
        echo "✅ BlackHole 已安装"
        echo ""
        echo "找到的设备:"
        get_blackhole_devices
    else
        echo "❌ BlackHole 未安装"
        echo "请运行: ./setup_virtual_audio_macos.sh --install"
        exit 1
    fi

    exit 0
fi

if [ "$INSTALL" = true ]; then
    install_blackhole
    exit $?
fi

# 默认：检查并提示
echo ""
echo "检查虚拟音频设备..."

if ! check_blackhole_installed; then
    echo "❌ BlackHole 未安装"
    echo ""
    install_blackhole
    exit 1
fi

echo "✅ BlackHole 已安装"
echo ""
echo "找到的设备:"
get_blackhole_devices

configure_audio_routing

echo ""
echo "✅ 配置完成"
