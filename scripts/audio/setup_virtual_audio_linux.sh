#!/bin/bash
# Linux 虚拟音频设备配置脚本
# 使用 PulseAudio 环回模块

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_ONLY=false
LOAD_MODULE=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --check-only)
            CHECK_ONLY=true
            shift
            ;;
        --load-module)
            LOAD_MODULE=true
            shift
            ;;
        *)
            echo "未知参数: $1"
            exit 1
            ;;
    esac
done

function check_pulseaudio() {
    # 检查 PulseAudio 是否运行
    if pgrep -x pulseaudio > /dev/null; then
        return 0
    fi
    return 1
}

function check_loopback_module() {
    # 检查环回模块是否已加载
    if pactl list modules short | grep -q "module-loopback"; then
        return 0
    fi
    return 1
}

function load_loopback_module() {
    # 加载 PulseAudio 环回模块
    echo "正在加载 PulseAudio 环回模块..."

    # 获取默认输出设备
    DEFAULT_SINK=$(pactl info | grep "Default Sink" | cut -d: -f2 | tr -d ' ')

    if [ -z "$DEFAULT_SINK" ]; then
        echo "❌ 无法获取默认输出设备"
        return 1
    fi

    # 创建虚拟源（sink）
    VIRTUAL_SINK="virtual_audio_sink"

    # 加载 null sink（虚拟输出设备）
    pactl load-module module-null-sink sink_name="$VIRTUAL_SINK" sink_properties=device.description="VirtualAudioSink" || {
        echo "⚠️  可能已存在同名 sink，尝试使用现有设备"
    }

    # 加载环回模块（将默认输出路由到虚拟 sink）
    LOOPBACK_ID=$(pactl load-module module-loopback source="$DEFAULT_SINK.monitor" sink="$VIRTUAL_SINK" || echo "")

    if [ -n "$LOOPBACK_ID" ]; then
        echo "✅ 环回模块已加载 (ID: $LOOPBACK_ID)"
        echo "虚拟音频设备: $VIRTUAL_SINK"
        return 0
    else
        echo "⚠️  环回模块可能已加载或加载失败"
        return 1
    fi
}

function unload_loopback_module() {
    # 卸载环回模块
    echo "正在卸载环回模块..."
    pactl unload-module module-loopback 2>/dev/null || true
    pactl unload-module module-null-sink 2>/dev/null || true
    echo "✅ 已卸载"
}

function list_virtual_sinks() {
    # 列出虚拟音频设备
    echo ""
    echo "可用的虚拟音频设备:"
    pactl list sinks short | grep -i virtual || pactl list sinks short | grep -i null || echo "  无"
}

# 主逻辑
echo "=== Linux 虚拟音频设备配置 ==="

# 检查 PulseAudio
if ! check_pulseaudio; then
    echo "❌ PulseAudio 未运行"
    echo "请确保 PulseAudio 已安装并运行"
    echo "安装: sudo apt install pulseaudio  # Debian/Ubuntu"
    echo "      sudo pacman -S pulseaudio    # Arch"
    exit 1
fi

echo "✅ PulseAudio 正在运行"

if [ "$CHECK_ONLY" = true ]; then
    echo ""
    echo "检查环回模块状态..."

    if check_loopback_module; then
        echo "✅ 环回模块已加载"
        list_virtual_sinks
    else
        echo "⚠️  环回模块未加载"
        echo "运行: ./setup_virtual_audio_linux.sh --load-module"
    fi

    exit 0
fi

if [ "$LOAD_MODULE" = true ]; then
    load_loopback_module
    list_virtual_sinks
    exit 0
fi

# 默认：检查并提示
echo ""
echo "检查环回模块..."

if check_loopback_module; then
    echo "✅ 环回模块已加载"
    list_virtual_sinks
else
    echo "⚠️  环回模块未加载"
    echo ""
    echo "自动加载环回模块..."
    load_loopback_module
    list_virtual_sinks
fi

echo ""
echo "配置说明:"
echo "1. 虚拟音频设备已创建: virtual_audio_sink"
echo "2. 应用可以从此设备捕获音频"
echo "3. 系统音频会自动路由到此设备"
echo ""
echo "卸载模块: ./setup_virtual_audio_linux.sh --unload-module"

echo ""
echo "✅ 配置完成"
