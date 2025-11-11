#!/usr/bin/env python3
"""
配置监听管理器
负责管理配置文件的监听和配置变更回调
"""

from collections.abc import Callable
from enum import Enum
from typing import Protocol

from lifetrace.util.config import config
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class ConfigChangeType(Enum):
    """配置变更类型枚举"""

    LLM = "llm"
    JOBS = "jobs"
    SERVER = "server"
    ALL = "all"  # 所有配置变更


class ConfigChangeHandler(Protocol):
    """配置变更处理器协议

    实现此协议的类需要提供 handle_config_change 方法
    """

    def handle_config_change(
        self, change_type: ConfigChangeType, old_value: dict, new_value: dict
    ) -> None:
        """处理配置变更

        Args:
            change_type: 配置变更类型
            old_value: 旧配置值
            new_value: 新配置值
        """
        ...


class ConfigWatcherManager:
    """配置监听管理器 - 增强版"""

    def __init__(self):
        """初始化配置监听管理器"""
        # 按类型分类的处理器
        self.handlers: dict[ConfigChangeType, list[ConfigChangeHandler]] = {}
        # 兼容旧的回调函数（将逐步废弃）
        self.legacy_callbacks: list[Callable[[dict, dict], None]] = []
        self._watching = False
        logger.info("配置监听管理器已初始化（增强版）")

    def register_handler(self, change_type: ConfigChangeType, handler: ConfigChangeHandler):
        """注册配置变更处理器（推荐方式）

        Args:
            change_type: 关注的配置变更类型
            handler: 处理器实例，需实现 ConfigChangeHandler 协议
        """
        if change_type not in self.handlers:
            self.handlers[change_type] = []

        if handler not in self.handlers[change_type]:
            self.handlers[change_type].append(handler)
            handler_name = getattr(handler, "__class__", handler).__name__
            logger.info(f"已注册配置变更处理器: {handler_name} -> {change_type.value}")

    def unregister_handler(self, change_type: ConfigChangeType, handler: ConfigChangeHandler):
        """取消注册配置变更处理器

        Args:
            change_type: 配置变更类型
            handler: 要取消的处理器实例
        """
        if change_type in self.handlers and handler in self.handlers[change_type]:
            self.handlers[change_type].remove(handler)
            handler_name = getattr(handler, "__class__", handler).__name__
            logger.info(f"已取消注册配置变更处理器: {handler_name} -> {change_type.value}")

    def register_callback(self, callback: Callable[[dict, dict], None]):
        """注册配置变更回调函数（兼容旧版，不推荐使用）

        Args:
            callback: 回调函数，接收 (old_config, new_config) 参数
        """
        if callback not in self.legacy_callbacks:
            self.legacy_callbacks.append(callback)
            logger.warning(
                f"已注册旧版配置变更回调: {callback.__name__} (建议迁移到 register_handler)"
            )

    def unregister_callback(self, callback: Callable[[dict, dict], None]):
        """取消注册配置变更回调函数（兼容旧版）

        Args:
            callback: 要取消的回调函数
        """
        if callback in self.legacy_callbacks:
            self.legacy_callbacks.remove(callback)
            logger.debug(f"已取消注册旧版配置变更回调: {callback.__name__}")

    def _on_config_change(self, old_config: dict, new_config: dict):
        """配置变更的统一处理函数"""
        logger.info("检测到配置文件变更")

        # 1. 先触发新版处理器（按类型分发）
        self._notify_handlers_by_type(old_config, new_config)

        # 2. 再触发旧版回调函数（兼容）
        for callback in self.legacy_callbacks:
            try:
                callback(old_config, new_config)
            except Exception as e:
                logger.error(f"执行旧版配置变更回调 {callback.__name__} 失败: {e}", exc_info=True)

    def _notify_handlers_by_type(self, old_config: dict, new_config: dict):
        """按配置类型通知对应的处理器"""
        # 检测各类型配置是否变更
        changes = self._detect_changes(old_config, new_config)

        # 通知每种类型的处理器
        for change_type, (old_value, new_value) in changes.items():
            self._notify_handlers(change_type, old_value, new_value)

        # 如果有任何变更，通知 ALL 类型的处理器
        if changes:
            self._notify_handlers(ConfigChangeType.ALL, old_config, new_config)

    def _detect_changes(
        self, old_config: dict, new_config: dict
    ) -> dict[ConfigChangeType, tuple[dict, dict]]:
        """检测配置变更并返回变更的类型和值"""
        changes = {}

        # 检查 LLM 配置
        old_llm = old_config.get("llm", {})
        new_llm = new_config.get("llm", {})
        if old_llm != new_llm:
            changes[ConfigChangeType.LLM] = (old_llm, new_llm)

        # 检查 Jobs 配置
        old_jobs = old_config.get("jobs", {})
        new_jobs = new_config.get("jobs", {})
        if old_jobs != new_jobs:
            changes[ConfigChangeType.JOBS] = (old_jobs, new_jobs)

        # 检查 Server 配置
        old_server = old_config.get("server", {})
        new_server = new_config.get("server", {})
        if old_server != new_server:
            changes[ConfigChangeType.SERVER] = (old_server, new_server)

        return changes

    def _notify_handlers(self, change_type: ConfigChangeType, old_value: dict, new_value: dict):
        """通知指定类型的所有处理器"""
        handlers = self.handlers.get(change_type, [])
        if not handlers:
            return

        logger.info(f"通知 {len(handlers)} 个处理器处理 {change_type.value} 配置变更")

        for handler in handlers:
            try:
                handler.handle_config_change(change_type, old_value, new_value)
            except Exception as e:
                handler_name = getattr(handler, "__class__", handler).__name__
                logger.error(
                    f"处理器 {handler_name} 处理 {change_type.value} 配置变更失败: {e}",
                    exc_info=True,
                )

    def start_watching(self):
        """启动配置文件监听"""
        if self._watching:
            logger.warning("配置文件监听已经在运行")
            return

        try:
            config.register_callback(self._on_config_change)
            config.start_watching()
            self._watching = True
            logger.info("已启动配置文件监听")
        except Exception as e:
            logger.error(f"启动配置文件监听失败: {e}", exc_info=True)

    def stop_watching(self):
        """停止配置文件监听"""
        if not self._watching:
            logger.warning("配置文件监听未在运行")
            return

        try:
            config.stop_watching()
            self._watching = False
            logger.error("已停止配置文件监听")
        except Exception as e:
            logger.error(f"停止配置文件监听失败: {e}", exc_info=True)

    def is_watching(self) -> bool:
        """检查是否正在监听配置文件"""
        return self._watching


# 全局单例
_config_watcher_instance = None


def get_config_watcher() -> ConfigWatcherManager:
    """获取配置监听管理器单例"""
    global _config_watcher_instance
    if _config_watcher_instance is None:
        _config_watcher_instance = ConfigWatcherManager()
    return _config_watcher_instance
