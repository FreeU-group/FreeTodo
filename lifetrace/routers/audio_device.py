"""音频设备管理 API 路由

提供跨平台虚拟音频设备的检查和配置接口
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any

from lifetrace.services.audio_device_manager import get_audio_device_manager
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/audio", tags=["audio-device"])


@router.get("/device/status")
async def get_audio_device_status() -> Dict[str, Any]:
    """获取音频设备状态"""
    try:
        manager = get_audio_device_manager()
        info = manager.get_audio_device_info()
        return {
            "success": True,
            "data": info,
        }
    except Exception as e:
        logger.error(f"获取音频设备状态失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取状态失败: {str(e)}")


@router.post("/device/check")
async def check_virtual_audio() -> Dict[str, Any]:
    """检查虚拟音频设备是否可用"""
    try:
        manager = get_audio_device_manager()
        available, message = manager.check_virtual_audio_available()
        return {
            "success": True,
            "available": available,
            "message": message,
        }
    except Exception as e:
        logger.error(f"检查虚拟音频设备失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"检查失败: {str(e)}")


@router.post("/device/setup")
async def setup_virtual_audio() -> Dict[str, Any]:
    """设置虚拟音频设备"""
    try:
        manager = get_audio_device_manager()
        success, message = manager.setup_virtual_audio()
        return {
            "success": success,
            "message": message,
        }
    except Exception as e:
        logger.error(f"设置虚拟音频设备失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"设置失败: {str(e)}")





























