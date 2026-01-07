"""
屏幕录制器黑名单处理模块
包含黑名单检测和LifeTrace窗口识别逻辑
"""

from lifetrace.util.app_utils import expand_blacklist_apps
from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

from .recorder_config import (
    BROWSER_APPS,
    LIFETRACE_WINDOW_PATTERNS_REGEX,
    LIFETRACE_WINDOW_PATTERNS_STR,
    PYTHON_APPS,
)

logger = get_logger()


def check_window_title_patterns(window_title: str) -> bool:
    """检查窗口标题是否匹配LifeTrace模式（支持动态端口）"""
    window_title_lower = window_title.lower()
    # 检查字符串包含模式
    if any(pattern in window_title_lower for pattern in LIFETRACE_WINDOW_PATTERNS_STR):
        return True
    # 检查正则表达式模式（用于端口范围匹配）
    return any(pattern.search(window_title_lower) for pattern in LIFETRACE_WINDOW_PATTERNS_REGEX)


def is_browser_or_python_app(app_name_lower: str) -> bool:
    """检查是否为浏览器或Python应用"""
    return any(browser in app_name_lower for browser in BROWSER_APPS + PYTHON_APPS)


def is_lifetrace_window(app_name: str, window_title: str) -> bool:
    """检查是否为LifeTrace相关窗口"""
    if not app_name and not window_title:
        return False

    # 直接检查窗口标题是否包含LifeTrace模式
    if window_title and check_window_title_patterns(window_title):
        return True

    # 检查应用名：如果是浏览器或Python应用，需要进一步检查窗口标题
    if app_name:
        app_name_lower = app_name.lower()
        if is_browser_or_python_app(app_name_lower) and window_title:
            return check_window_title_patterns(window_title)

    return False


def get_app_blacklist_reason(app_name: str) -> str:
    """获取应用名在黑名单中的原因

    Returns:
        如果在黑名单中，返回跳过原因；否则返回空字符串
    """
    if not app_name:
        return ""

    blacklist_apps = settings.get("jobs.recorder.params.blacklist.apps")
    expanded_blacklist_apps = expand_blacklist_apps(blacklist_apps)

    if not expanded_blacklist_apps:
        return ""

    app_name_lower = app_name.lower()
    for blacklist_app in expanded_blacklist_apps:
        if blacklist_app.lower() == app_name_lower or blacklist_app.lower() in app_name_lower:
            return f"🚫 [黑名单过滤] 应用 '{app_name}' 匹配黑名单项 '{blacklist_app}'"

    return ""


def get_window_blacklist_reason(window_title: str) -> str:
    """获取窗口标题在黑名单中的原因

    Returns:
        如果在黑名单中，返回跳过原因；否则返回空字符串
    """
    if not window_title:
        return ""

    blacklist_windows = settings.get("jobs.recorder.params.blacklist.windows")
    if not blacklist_windows:
        return ""

    window_title_lower = window_title.lower()
    for blacklist_window in blacklist_windows:
        if (
            blacklist_window.lower() == window_title_lower
            or blacklist_window.lower() in window_title_lower
        ):
            return f"🚫 [黑名单过滤] 窗口 '{window_title}' 匹配黑名单项 '{blacklist_window}'"

    return ""


def get_blacklist_reason(app_name: str, window_title: str) -> str:
    """获取应用被列入黑名单的原因

    Returns:
        如果在黑名单中，返回跳过原因；否则返回空字符串
    """
    # 首先检查是否启用自动排除LifeTrace自身窗口
    auto_exclude_self = settings.get("jobs.recorder.params.auto_exclude_self")
    if auto_exclude_self and is_lifetrace_window(app_name, window_title):
        return (
            f"🏠 [自动排除] 检测到 LifeTrace 自身窗口 - 应用: '{app_name}', 窗口: '{window_title}'"
        )

    # 检查黑名单功能是否启用
    blacklist_enabled = settings.get("jobs.recorder.params.blacklist.enabled")
    if not blacklist_enabled:
        return ""

    # 检查应用名是否在黑名单中
    app_reason = get_app_blacklist_reason(app_name)
    if app_reason:
        return app_reason

    # 检查窗口标题是否在黑名单中
    window_reason = get_window_blacklist_reason(window_title)
    if window_reason:
        return window_reason

    return ""


def log_blacklist_config():
    """打印当前黑名单配置"""
    blacklist_enabled = settings.get("jobs.recorder.params.blacklist.enabled")
    blacklist_apps = settings.get("jobs.recorder.params.blacklist.apps")
    blacklist_windows = settings.get("jobs.recorder.params.blacklist.windows")

    logger.info("=" * 60)
    logger.info(f"📋 黑名单配置状态: {'✅ 已启用' if blacklist_enabled else '❌ 已禁用'}")

    if blacklist_enabled:
        if blacklist_apps:
            expanded_apps = expand_blacklist_apps(blacklist_apps)
            logger.info(f"🚫 黑名单应用: {blacklist_apps}")
            logger.info(f"   扩展后的进程名: {expanded_apps}")
        else:
            logger.info("🚫 黑名单应用: 无")

        if blacklist_windows:
            logger.info(f"🚫 黑名单窗口: {blacklist_windows}")
        else:
            logger.info("🚫 黑名单窗口: 无")
    else:
        logger.info("   (黑名单功能未启用，所有应用都会被截图)")

    logger.info("=" * 60)
