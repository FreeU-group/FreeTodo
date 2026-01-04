#!/usr/bin/env python3
"""测试 WhisperLiveKit 服务

使用 uv 和虚拟环境运行此脚本
"""

import sys
import asyncio
from pathlib import Path

# 添加项目根目录到路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from lifetrace.services.whisperlivekit_service import get_whisperlivekit_service
from lifetrace.util.logging_config import get_logger, setup_logging
from lifetrace.util.settings import settings

# 设置日志
logging_config = settings.get("logging", {}).copy()
setup_logging(logging_config)
logger = get_logger()


async def test_whisperlivekit():
    """测试 WhisperLiveKit 服务"""
    print("🧪 开始测试 WhisperLiveKit 服务...")
    print()
    
    # 获取服务实例
    service = get_whisperlivekit_service()
    
    # 显示配置
    print("📋 配置信息:")
    print(f"   模型大小: {service.model_size}")
    print(f"   语言: {service.language}")
    print(f"   设备: {service.device}")
    print(f"   服务器端口: {service.server_port}")
    print(f"   服务器主机: {service.server_host}")
    print()
    
    # 测试启动服务器
    print("🚀 尝试启动 WhisperLiveKit 服务器...")
    try:
        started = await service.start_server()
        if started:
            print("✅ 服务器启动成功！")
            print(f"   WebSocket URL: {service.get_server_url()}")
            print(f"   HTTP URL: {service.get_http_url()}")
            print()
            
            # 测试健康检查
            print("🏥 测试健康检查...")
            is_healthy = await service.health_check()
            if is_healthy:
                print("✅ 服务器健康检查通过")
            else:
                print("⚠️  服务器健康检查失败")
            print()
            
            # 等待几秒
            print("⏳ 等待 5 秒...")
            await asyncio.sleep(5)
            
            # 停止服务器
            print("🛑 停止服务器...")
            await service.stop_server()
            print("✅ 服务器已停止")
        else:
            print("❌ 服务器启动失败")
            print()
            print("💡 故障排除:")
            print("   1. 检查是否安装了 WhisperLiveKit: uv pip list | grep whisperlivekit")
            print("   2. 检查 FFmpeg 是否安装: ffmpeg -version")
            print("   3. 查看日志了解详细错误信息")
            return False
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print()
    print("✅ 所有测试通过！")
    return True


if __name__ == "__main__":
    try:
        success = asyncio.run(test_whisperlivekit())
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️  测试被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 测试异常: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)





