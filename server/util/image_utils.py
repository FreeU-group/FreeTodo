"""图片处理工具函数"""

import base64
import os
from typing import Any

from storage import screenshot_mgr
from util.logging_config import get_logger

logger = get_logger()


def get_screenshot_base64(screenshot_id: int) -> str | None:
    """
    从数据库读取截图并转换为base64编码

    Args:
        screenshot_id: 截图ID

    Returns:
        base64编码的图片字符串（格式：data:image/png;base64,{base64_str}），
        如果截图不存在或读取失败则返回None
    """
    try:
        # 从数据库获取截图信息
        screenshot = screenshot_mgr.get_screenshot_by_id(screenshot_id)
        if not screenshot:
            logger.warning(f"截图 {screenshot_id} 不存在")
            return None

        file_path = screenshot.get("file_path")
        if not file_path:
            logger.warning(f"截图 {screenshot_id} 没有文件路径")
            return None

        # 检查文件是否存在
        if not os.path.exists(file_path):
            logger.warning(f"截图文件不存在: {file_path}")
            return None

        # 读取文件并转换为base64
        with open(file_path, "rb") as f:
            image_data = f.read()

        # 转换为base64
        base64_str = base64.b64encode(image_data).decode("utf-8")

        # 根据文件扩展名确定MIME类型
        file_ext = os.path.splitext(file_path)[1].lower()
        mime_type_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
        }
        mime_type = mime_type_map.get(file_ext, "image/png")

        # 返回data URI格式
        return f"data:{mime_type};base64,{base64_str}"

    except Exception as e:
        logger.error(f"读取截图 {screenshot_id} 并转换为base64失败: {e}")
        return None


def get_screenshots_base64(screenshot_ids: list[int]) -> list[dict[str, Any]]:
    """
    批量获取截图的base64编码

    Args:
        screenshot_ids: 截图ID列表

    Returns:
        包含截图信息的列表，每个元素包含：
        - screenshot_id: 截图ID
        - base64_data: base64编码的图片字符串（如果成功）
        - error: 错误信息（如果失败）
    """
    results = []
    for screenshot_id in screenshot_ids:
        base64_data = get_screenshot_base64(screenshot_id)
        if base64_data:
            results.append({"screenshot_id": screenshot_id, "base64_data": base64_data})
        else:
            results.append(
                {
                    "screenshot_id": screenshot_id,
                    "error": f"截图 {screenshot_id} 读取失败",
                }
            )
    return results


def validate_image_format(file_path: str) -> bool:
    """
    验证图片格式是否支持

    Args:
        file_path: 图片文件路径

    Returns:
        如果格式支持返回True，否则返回False
    """
    supported_formats = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
    file_ext = os.path.splitext(file_path)[1].lower()
    return file_ext in supported_formats
