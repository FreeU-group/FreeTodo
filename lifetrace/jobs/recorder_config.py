"""
屏幕录制器配置模块
包含常量、模式匹配和装饰器
"""

import re
from concurrent.futures import Future, ThreadPoolExecutor
from functools import wraps

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 常量定义
UNKNOWN_APP = "未知应用"
UNKNOWN_WINDOW = "未知窗口"
DEFAULT_SCREEN_ID = 0  # 用于应用使用记录的默认屏幕ID

# LifeTrace窗口识别模式（支持字符串包含匹配和正则表达式）
LIFETRACE_WINDOW_PATTERNS_STR = [
    "lifetrace",
    "lifetrace - intelligent life recording system",
    "lifetrace desktop",
    "lifetrace 智能生活记录系统",
    "lifetrace 桌面版",
    "lifetrace frontend",
    "lifetrace web interface",
    "freetodo",  # Electron 应用名
]

# 端口范围模式（支持 8000-8099 和 3000-3099 动态端口）
LIFETRACE_WINDOW_PATTERNS_REGEX = [
    re.compile(r"localhost:80\d{2}"),  # 匹配 localhost:8000-8099
    re.compile(r"127\.0\.0\.1:80\d{2}"),  # 匹配 127.0.0.1:8000-8099
    re.compile(r"localhost:30\d{2}"),  # 匹配 localhost:3000-3099
    re.compile(r"127\.0\.0\.1:30\d{2}"),  # 匹配 127.0.0.1:3000-3099
]

BROWSER_APPS = ["chrome", "msedge", "firefox", "electron"]
PYTHON_APPS = ["python", "pythonw"]


def with_timeout(timeout_seconds: float = 5.0, operation_name: str = "操作"):
    """超时装饰器 - 使用 Future 实现更清晰的超时控制"""

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            executor = ThreadPoolExecutor(max_workers=1)
            future: Future = executor.submit(func, *args, **kwargs)

            try:
                result = future.result(timeout=timeout_seconds)
                return result
            except TimeoutError:
                logger.warning(f"{operation_name}超时 ({timeout_seconds}秒)，操作可能仍在后台执行")
                return None
            except Exception as e:
                logger.error(f"{operation_name}执行失败: {e}")
                raise
            finally:
                executor.shutdown(wait=False)

        return wrapper

    return decorator
