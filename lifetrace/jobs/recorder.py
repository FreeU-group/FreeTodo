"""
屏幕录制器 - 负责截图和相关处理
"""

import argparse
import hashlib
import os
import time
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any

import imagehash
import mss
from PIL import Image

from lifetrace.storage import event_mgr, get_session, screenshot_mgr
from lifetrace.util.app_utils import expand_blacklist_apps
from lifetrace.util.config import config
from lifetrace.util.logging_config import get_logger
from lifetrace.util.utils import (
    ensure_dir,
    get_active_window_info,
    get_active_window_screen,
    get_screenshot_filename,
)

logger = get_logger()

# 常量定义
UNKNOWN_APP = "未知应用"
UNKNOWN_WINDOW = "未知窗口"
DEFAULT_SCREEN_ID = 0  # 用于应用使用记录的默认屏幕ID


# LifeTrace窗口识别模式
LIFETRACE_WINDOW_PATTERNS = [
    "lifetrace",
    "localhost:8000",
    "127.0.0.1:8000",
    "lifetrace - intelligent life recording system",
    "lifetrace desktop",
    "lifetrace 智能生活记录系统",
    "lifetrace 桌面版",
    "lifetrace frontend",
    "lifetrace web interface",
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
                # 注意：无法强制终止线程，只能记录超时
                return None
            except Exception as e:
                logger.error(f"{operation_name}执行失败: {e}")
                raise
            finally:
                executor.shutdown(wait=False)

        return wrapper

    return decorator


class ScreenRecorder:
    """屏幕录制器"""

    def __init__(self):
        self.config = config
        self.screenshots_dir = self.config.screenshots_dir
        self.interval = self.config.get("jobs.recorder.interval")
        self.screens = self._get_screen_list()
        self.deduplicate = self.config.get("jobs.recorder.params.deduplicate")
        self.hash_threshold = self.config.get("jobs.recorder.params.hash_threshold")

        # 超时配置
        self.file_io_timeout = self.config.get("jobs.recorder.params.file_io_timeout")
        self.db_timeout = self.config.get("jobs.recorder.params.db_timeout")
        self.window_info_timeout = self.config.get("jobs.recorder.params.window_info_timeout")

        # 初始化截图目录
        ensure_dir(self.screenshots_dir)

        # 上一张截图的哈希值（用于去重）
        self.last_hashes = {}

        logger.info(
            f"超时配置 - 文件I/O: {self.file_io_timeout}s, "
            f"数据库: {self.db_timeout}s, "
            f"窗口信息: {self.window_info_timeout}s"
        )

        logger.info(f"屏幕录制器初始化完成，监控屏幕: {self.screens}")

        # 打印黑名单配置信息
        self._log_blacklist_config()

        # 启动时扫描未处理的文件
        self._scan_unprocessed_files()

    def _log_blacklist_config(self):
        """打印当前黑名单配置"""
        blacklist_enabled = self.config.get("jobs.recorder.params.blacklist.enabled")
        blacklist_apps = self.config.get("jobs.recorder.params.blacklist.apps")
        blacklist_windows = self.config.get("jobs.recorder.params.blacklist.windows")

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

    def _save_screenshot(self, screenshot, file_path: str) -> bool:
        """保存截图到文件"""

        @with_timeout(timeout_seconds=self.file_io_timeout, operation_name="保存截图文件")
        def _do_save():
            mss.tools.to_png(screenshot.rgb, screenshot.size, output=file_path)
            return True

        try:
            result = _do_save()
            return result if result is not None else False
        except Exception as e:
            logger.error(f"保存截图失败 {file_path}: {e}")
            return False

    def _get_image_size(self, file_path: str) -> tuple:
        """获取图像尺寸"""

        @with_timeout(timeout_seconds=self.file_io_timeout, operation_name="读取图像尺寸")
        def _do_get_size():
            with Image.open(file_path) as img:
                return img.size

        try:
            result = _do_get_size()
            return result if result is not None else (0, 0)
        except Exception as e:
            logger.error(f"读取图像尺寸失败 {file_path}: {e}")
            return (0, 0)

    def _calculate_file_hash(self, file_path: str) -> str:
        """计算文件MD5哈希"""

        @with_timeout(timeout_seconds=self.file_io_timeout, operation_name="计算文件哈希")
        def _do_calculate_hash():
            with open(file_path, "rb") as f:
                return hashlib.md5(f.read()).hexdigest()

        try:
            result = _do_calculate_hash()
            return result if result is not None else ""
        except Exception as e:
            logger.error(f"计算文件哈希失败 {file_path}: {e}")
            return ""

    def _save_to_database(
        self,
        file_path: str,
        file_hash: str,
        width: int,
        height: int,
        screen_id: int,
        app_name: str,
        window_title: str,
    ) -> int | None:
        """保存截图信息到数据库"""

        @with_timeout(timeout_seconds=self.db_timeout, operation_name="数据库操作")
        def _do_save_to_db():
            # 不再自动关联事件，由事件处理器处理
            screenshot_id = screenshot_mgr.add_screenshot(
                file_path=file_path,
                file_hash=file_hash,
                width=width,
                height=height,
                metadata={
                    "screen_id": screen_id,
                    "app_name": app_name or UNKNOWN_APP,
                    "window_title": window_title or UNKNOWN_WINDOW,
                    "event_id": None,  # 不自动关联事件
                },
            )
            return screenshot_id

        try:
            result = _do_save_to_db()
            return result
        except Exception as e:
            logger.error(f"保存截图记录到数据库失败: {e}")
            return None

    def _process_screenshot_event(
        self,
        screenshot_id: int,
        app_name: str,
        window_title: str,
        timestamp: datetime,
    ):
        """处理截图事件：将截图关联到事件

        Args:
            screenshot_id: 截图ID
            app_name: 应用名称
            window_title: 窗口标题
            timestamp: 截图时间
        """
        try:
            # 检查是否有该应用的活跃事件
            active_event_id = event_mgr.get_active_event_by_app(app_name)

            if active_event_id:
                # 有活跃事件，添加截图到该事件
                success = event_mgr.add_screenshot_to_event(screenshot_id, active_event_id)
                if success:
                    logger.info(
                        f"📎 截图 {screenshot_id} 已添加到事件 {active_event_id} [{app_name}]"
                    )
                else:
                    logger.warning(f"⚠️  截图 {screenshot_id} 添加到事件失败")
            else:
                # 没有活跃事件，需要完成其他应用的事件并创建新事件
                self._complete_other_active_events(app_name, timestamp)

                # 创建新事件
                event_id = event_mgr.create_event_for_screenshot(
                    screenshot_id=screenshot_id,
                    app_name=app_name,
                    window_title=window_title,
                    timestamp=timestamp,
                )

                if event_id:
                    logger.info(f"✨ 为截图 {screenshot_id} 创建新事件 {event_id} [{app_name}]")
                else:
                    logger.warning(f"⚠️  创建事件失败，截图ID: {screenshot_id}")

        except Exception as e:
            logger.error(f"处理截图事件失败: {e}", exc_info=True)

    def _complete_other_active_events(self, current_app: str, end_time: datetime):
        """完成其他应用的活跃事件

        Args:
            current_app: 当前应用名称
            end_time: 结束时间
        """
        try:
            from lifetrace.storage.models import Event

            with get_session() as session:
                # 获取所有未完成的事件（new 或 processing 状态）
                active_events = (
                    session.query(Event)
                    .filter(Event.status.in_(["new", "processing"]), Event.app_name != current_app)
                    .all()
                )

                for event in active_events:
                    logger.info(
                        f"🔚 应用切换，完成其他事件 {event.id}: "
                        f"[{event.app_name}] → [{current_app}]"
                    )
                    # 使用 event_mgr 的方法来完成事件，这样会触发摘要生成
                    event_mgr.complete_event(event.id, end_time)

        except Exception as e:
            logger.error(f"完成其他活跃事件失败: {e}", exc_info=True)

    def _get_window_info(self) -> tuple[str, str]:
        """获取当前活动窗口信息"""

        @with_timeout(timeout_seconds=self.window_info_timeout, operation_name="获取窗口信息")
        def _do_get_window_info():
            return get_active_window_info()

        try:
            result = _do_get_window_info()
            if result is not None:
                app_name, window_title = result
                # 如果任何一个为 None，使用默认值
                app_name = app_name or UNKNOWN_APP
                window_title = window_title or UNKNOWN_WINDOW
                return (app_name, window_title)
            return (UNKNOWN_APP, UNKNOWN_WINDOW)
        except Exception as e:
            logger.error(f"获取窗口信息失败: {e}")
            return (UNKNOWN_APP, UNKNOWN_WINDOW)

    def _is_lifetrace_window(self, app_name: str, window_title: str) -> bool:
        """检查是否为LifeTrace相关窗口"""
        if not app_name and not window_title:
            return False

        # 直接检查窗口标题是否包含LifeTrace模式
        if window_title and self._check_window_title_patterns(window_title):
            return True

        # 检查应用名：如果是浏览器或Python应用，需要进一步检查窗口标题
        if app_name:
            app_name_lower = app_name.lower()
            if self._is_browser_or_python_app(app_name_lower) and window_title:
                return self._check_window_title_patterns(window_title)

        return False

    def _check_window_title_patterns(self, window_title: str) -> bool:
        """检查窗口标题是否匹配LifeTrace模式"""
        window_title_lower = window_title.lower()
        return any(pattern in window_title_lower for pattern in LIFETRACE_WINDOW_PATTERNS)

    def _is_browser_or_python_app(self, app_name_lower: str) -> bool:
        """检查是否为浏览器或Python应用"""
        return any(browser in app_name_lower for browser in BROWSER_APPS + PYTHON_APPS)

    def _get_blacklist_reason(self, app_name: str, window_title: str) -> str:
        """获取应用被列入黑名单的原因

        Returns:
            如果在黑名单中，返回跳过原因；否则返回空字符串
        """
        # 首先检查是否启用自动排除LifeTrace自身窗口
        auto_exclude_self = self.config.get("jobs.recorder.params.auto_exclude_self")
        if auto_exclude_self and self._is_lifetrace_window(app_name, window_title):
            return f"🏠 [自动排除] 检测到 LifeTrace 自身窗口 - 应用: '{app_name}', 窗口: '{window_title}'"

        # 检查黑名单功能是否启用
        blacklist_enabled = self.config.get("jobs.recorder.params.blacklist.enabled")
        if not blacklist_enabled:
            return ""

        # 检查应用名是否在黑名单中
        app_reason = self._get_app_blacklist_reason(app_name)
        if app_reason:
            return app_reason

        # 检查窗口标题是否在黑名单中
        window_reason = self._get_window_blacklist_reason(window_title)
        if window_reason:
            return window_reason

        return ""

    def _is_app_blacklisted(self, app_name: str, window_title: str) -> bool:
        """检查应用是否在黑名单中（保留向后兼容性）"""
        return bool(self._get_blacklist_reason(app_name, window_title))

    def _get_app_blacklist_reason(self, app_name: str) -> str:
        """获取应用名在黑名单中的原因

        Returns:
            如果在黑名单中，返回跳过原因；否则返回空字符串
        """
        if not app_name:
            return ""

        blacklist_apps = self.config.get("jobs.recorder.params.blacklist.apps")
        expanded_blacklist_apps = expand_blacklist_apps(blacklist_apps)

        if not expanded_blacklist_apps:
            return ""

        app_name_lower = app_name.lower()
        # 查找匹配的黑名单项
        for blacklist_app in expanded_blacklist_apps:
            if blacklist_app.lower() == app_name_lower or blacklist_app.lower() in app_name_lower:
                # 找到匹配项，返回原因
                return f"🚫 [黑名单过滤] 应用 '{app_name}' 匹配黑名单项 '{blacklist_app}'"

        return ""

    def _get_window_blacklist_reason(self, window_title: str) -> str:
        """获取窗口标题在黑名单中的原因

        Returns:
            如果在黑名单中，返回跳过原因；否则返回空字符串
        """
        if not window_title:
            return ""

        blacklist_windows = self.config.get("jobs.recorder.params.blacklist.windows")
        if not blacklist_windows:
            return ""

        window_title_lower = window_title.lower()
        # 查找匹配的黑名单项
        for blacklist_window in blacklist_windows:
            if (
                blacklist_window.lower() == window_title_lower
                or blacklist_window.lower() in window_title_lower
            ):
                # 找到匹配项，返回原因
                return f"🚫 [黑名单过滤] 窗口 '{window_title}' 匹配黑名单项 '{blacklist_window}'"

        return ""

    def _is_app_in_blacklist(self, app_name: str) -> bool:
        """检查应用名是否在黑名单中（保留向后兼容性）"""
        return bool(self._get_app_blacklist_reason(app_name))

    def _is_window_in_blacklist(self, window_title: str) -> bool:
        """检查窗口标题是否在黑名单中（保留向后兼容性）"""
        return bool(self._get_window_blacklist_reason(window_title))

    def _get_screen_list(self) -> list[int]:
        """获取要截图的屏幕列表"""
        screens_config = self.config.get("jobs.recorder.params.screens")
        logger.debug(f"屏幕配置: {screens_config}")
        with mss.mss() as sct:
            monitor_count = len(sct.monitors) - 1  # 减1因为第0个是所有屏幕的组合

            if screens_config == "all":
                return list(range(1, monitor_count + 1))
            elif isinstance(screens_config, list):
                return [s for s in screens_config if 1 <= s <= monitor_count]
            else:
                return [1] if monitor_count > 0 else []

    def _calculate_image_hash(self, image_path: str) -> str:
        """计算图像感知哈希值"""

        @with_timeout(timeout_seconds=self.file_io_timeout, operation_name="计算图像哈希")
        def _do_calculate_hash():
            with Image.open(image_path) as img:
                return str(imagehash.phash(img))

        try:
            result = _do_calculate_hash()
            return result if result is not None else ""
        except Exception as e:
            logger.error(f"计算图像哈希失败 {image_path}: {e}")
            return ""

    def _calculate_image_hash_from_memory(self, screenshot) -> str:
        """直接从内存中的截图计算图像感知哈希值"""

        @with_timeout(timeout_seconds=self.file_io_timeout, operation_name="从内存计算图像哈希")
        def _do_calculate_hash():
            # 将mss截图转换为PIL Image对象
            img = Image.frombytes("RGB", screenshot.size, screenshot.rgb)
            return str(imagehash.phash(img))

        try:
            result = _do_calculate_hash()
            return result if result is not None else ""
        except Exception as e:
            logger.error(f"从内存计算图像哈希失败: {e}")
            return ""

    def _is_duplicate(self, screen_id: int, image_hash: str) -> bool:
        """检查是否为重复图像"""
        if not self.deduplicate:
            return False

        if screen_id not in self.last_hashes:
            return False

        last_hash = self.last_hashes[screen_id]
        try:
            # 计算汉明距离
            current = imagehash.hex_to_hash(image_hash)
            previous = imagehash.hex_to_hash(last_hash)
            distance = current - previous

            is_duplicate = distance <= self.hash_threshold

            # 去重通知
            if is_duplicate:
                logger.info(f"[窗口 {screen_id}] 跳过重复截图")

            return is_duplicate
        except Exception as e:
            logger.error(f"比较图像哈希失败: {e}")
            return False

    def _capture_screen(
        self,
        screen_id: int,
        app_name: str | None = None,
        window_title: str | None = None,
    ) -> tuple[str | None, str]:
        """截取指定屏幕

        Returns:
            (file_path, status) - file_path为截图路径，status为状态: 'success', 'skipped', 'failed'
        """
        try:
            screenshot, file_path, timestamp = self._grab_and_prepare_screenshot(screen_id)
            if not screenshot:
                return None, "failed"

            # 优化：先从内存计算图像哈希，避免不必要的磁盘I/O
            image_hash = self._calculate_image_hash_from_memory(screenshot)
            if not image_hash:
                filename = os.path.basename(file_path)
                logger.error(f"[窗口 {screen_id}] 计算图像哈希失败，跳过: {filename}")
                return None, "failed"

            # 检查是否重复
            if self._is_duplicate(screen_id, image_hash):
                filename = os.path.basename(file_path)
                logger.debug(f"[窗口 {screen_id}] 检测到重复截图，跳过保存: {filename}")
                return None, "skipped"

            # 更新哈希记录并保存截图
            self.last_hashes[screen_id] = image_hash
            if not self._save_screenshot(screenshot, file_path):
                filename = os.path.basename(file_path)
                logger.error(f"[窗口 {screen_id}] 保存截图失败: {filename}")
                return None, "failed"

            # 获取窗口信息和保存到数据库
            app_name, window_title = self._ensure_window_info(app_name, window_title)
            self._save_screenshot_metadata(file_path, screen_id, app_name, window_title, timestamp)

            return file_path, "success"

        except Exception as e:
            logger.error(f"[窗口 {screen_id}] 截图失败: {e}")
            return None, "failed"

    def _grab_and_prepare_screenshot(self, screen_id: int) -> tuple[Any | None, str, datetime]:
        """抓取屏幕并准备截图文件路径"""
        with mss.mss() as sct:
            if screen_id >= len(sct.monitors):
                logger.warning(f"[窗口 {screen_id}] 屏幕ID不存在")
                return None, "", datetime.now()

            monitor = sct.monitors[screen_id]
            screenshot = sct.grab(monitor)
            timestamp = datetime.now()
            filename = get_screenshot_filename(screen_id, timestamp)
            file_path = os.path.join(self.screenshots_dir, filename)
            return screenshot, file_path, timestamp

    def _ensure_window_info(
        self,
        app_name: str | None,
        window_title: str | None,
    ) -> tuple[str, str]:
        """确保有窗口信息，如果没有则获取"""
        if app_name is None or window_title is None:
            return self._get_window_info()
        return app_name, window_title

    def _save_screenshot_metadata(
        self, file_path: str, screen_id: int, app_name: str, window_title: str, timestamp: datetime
    ):
        """保存截图的元数据到数据库"""
        filename = os.path.basename(file_path)

        # 获取图像尺寸
        width, height = self._get_image_size(file_path)

        # 计算文件哈希
        file_hash = self._calculate_file_hash(file_path)
        if not file_hash:
            logger.warning(f"[窗口 {screen_id}] 计算文件哈希失败，使用空值: {filename}")
            file_hash = ""

        # 保存到数据库
        screenshot_id = self._save_to_database(
            file_path, file_hash, width, height, screen_id, app_name, window_title
        )

        if screenshot_id:
            logger.debug(f"[窗口 {screen_id}] 截图记录已保存到数据库: {screenshot_id}")

            # 立即处理事件：将截图关联到事件
            self._process_screenshot_event(screenshot_id, app_name, window_title, timestamp)
        else:
            logger.warning(f"[窗口 {screen_id}] 数据库保存失败，但文件已保存: {filename}")

        file_size = os.path.getsize(file_path)
        file_size_kb = file_size / 1024
        logger.info(f"[窗口 {screen_id}] 截图保存: {filename} ({file_size_kb:.2f} KB) - {app_name}")

    def capture_all_screens(self) -> list[str]:
        """只截取活跃窗口所在的屏幕"""
        captured_files = []

        # 获取当前活动窗口信息（用于事件关联和应用使用记录）
        app_name, window_title = self._get_window_info()

        # 获取活跃窗口所在的屏幕ID
        active_screen_id = get_active_window_screen()

        if active_screen_id is None:
            logger.warning("无法获取活跃窗口所在的屏幕，跳过截图")
            return captured_files

        # 检查活跃屏幕是否在配置的屏幕列表中
        if active_screen_id not in self.screens:
            logger.info(f"⏭️  活跃窗口在屏幕 {active_screen_id}，但该屏幕未在配置中启用，跳过截图")
            return captured_files

        # 检查活动窗口是否在黑名单中
        blacklist_reason = self._get_blacklist_reason(app_name, window_title)
        is_blacklisted = bool(blacklist_reason)

        if is_blacklisted:
            # 活动窗口在黑名单中，跳过截图
            logger.info(f"⏭️  {blacklist_reason}（跳过截图）")
            # 关闭活跃事件，避免黑名单窗口被关联到事件
            self._close_active_event_on_blacklist()
            return captured_files

        # 活动窗口不在黑名单，显示窗口信息
        logger.info(
            f"📸 准备截图 - 屏幕: {active_screen_id}, 应用: {app_name}, 窗口: {window_title}"
        )

        # 只截取活跃窗口所在的屏幕
        file_path, status = self._capture_screen(active_screen_id, app_name, window_title)
        if file_path:
            captured_files.append(file_path)

        # 输出统计信息
        if status == "success":
            logger.info(f"截图成功 - 屏幕: {active_screen_id}")
        elif status == "skipped":
            logger.info(f"截图跳过 - 屏幕: {active_screen_id}")
        elif status == "failed":
            logger.warning(f"截图失败 - 屏幕: {active_screen_id}")

        return captured_files

    def _close_active_event_on_blacklist(self):
        """当应用进入黑名单时关闭活跃事件"""
        # 关闭上一个未结束的事件（如果存在）
        # 这样可以确保从白名单应用切换到黑名单应用时，
        # 白名单应用的事件能正确结束
        try:
            event_mgr.close_active_event()
            logger.info("已关闭上一个活跃事件")
        except Exception as e:
            logger.error(f"关闭活跃事件失败: {e}")

    def execute_capture(self):
        """执行一次截图任务（用于调度器调用）

        Returns:
            捕获的文件列表
        """
        try:
            captured_files = self.capture_all_screens()
            if captured_files:
                logger.info(f"✅ 本次截取了 {len(captured_files)} 张截图")
            else:
                logger.info("⏭️  本次未截取截图（窗口被跳过或重复）")
            return captured_files
        except Exception as e:
            logger.error(f"执行截图任务失败: {e}")
            return []

    def start_recording(self):
        """开始录制（传统模式，独立运行）"""
        logger.info("开始屏幕录制...")

        try:
            while True:
                start_time = time.time()

                # 截图
                captured_files = self.capture_all_screens()

                if captured_files:
                    logger.debug(f"本次截取了 {len(captured_files)} 张截图")

                # 计算下次截图时间
                elapsed = time.time() - start_time
                sleep_time = max(0, self.interval - elapsed)

                if sleep_time > 0:
                    time.sleep(sleep_time)
                else:
                    logger.warning(f"截图处理时间 ({elapsed:.2f}s) 超过间隔时间 ({self.interval}s)")

        except KeyboardInterrupt:
            logger.error("收到停止信号，结束录制")
            self._print_final_stats()
        except Exception as e:
            logger.error(f"录制过程中发生错误: {e}")
            self._print_final_stats()
            raise
        finally:
            pass

    def _get_unprocessed_files(self) -> list[str]:
        """获取所有未处理的截图文件列表"""
        screenshot_files = []
        for file_path in Path(self.screenshots_dir).glob("*.png"):
            if file_path.is_file():
                screenshot_files.append(str(file_path))

        # 检查哪些文件未处理
        unprocessed_files = []
        for file_path in screenshot_files:
            screenshot = screenshot_mgr.get_screenshot_by_path(file_path)
            if not screenshot:
                unprocessed_files.append(file_path)

        return unprocessed_files

    def _process_single_file(self, file_path: str) -> bool:
        """处理单个未处理的截图文件，返回是否成功"""
        if not os.path.exists(file_path):
            return False

        file_stats = os.stat(file_path)
        if file_stats.st_size == 0:
            logger.warning(f"文件为空，跳过: {file_path}")
            return False

        # 获取图像尺寸
        try:
            with Image.open(file_path) as img:
                width, height = img.size
        except Exception as e:
            logger.error(f"无法处理图像文件 {file_path}: {e}")
            return False

        # 从文件名提取屏幕ID
        screen_id = self._extract_screen_id_from_path(file_path)

        # 获取文件哈希（MD5）
        file_hash = self._calculate_file_hash(file_path)
        if not file_hash:
            filename = os.path.basename(file_path)
            logger.warning(f"[窗口 {screen_id}] 计算文件哈希失败，使用空值: {filename}")
            file_hash = ""

        # 获取窗口信息（这里可能不准确，因为是事后处理）
        app_name, window_title = self._get_window_info()

        # 添加到数据库
        screenshot_id = screenshot_mgr.add_screenshot(
            file_path=file_path,
            file_hash=file_hash,
            width=width,
            height=height,
            metadata={
                "screen_id": screen_id,
                "app_name": app_name,
                "window_title": window_title,
            },
        )

        if screenshot_id:
            filename = os.path.basename(file_path)
            logger.debug(f"[窗口 {screen_id}] 已处理未处理文件: {filename} (ID: {screenshot_id})")
            return True

        logger.warning(f"[窗口 {screen_id}] 添加截图记录失败: {file_path}")
        return False

    def _scan_unprocessed_files(self):
        """扫描并处理未处理的截图文件"""
        if not os.path.exists(self.screenshots_dir):
            logger.info("截图目录不存在，跳过扫描")
            return

        logger.info(f"扫描现有截图文件: {self.screenshots_dir}")

        unprocessed_files = self._get_unprocessed_files()

        if not unprocessed_files:
            logger.info("未发现未处理的截图文件")
            return

        logger.info(f"发现 {len(unprocessed_files)} 个未处理文件，开始处理...")

        # 处理未处理的文件
        processed_count = 0
        for file_path in unprocessed_files:
            try:
                if self._process_single_file(file_path):
                    processed_count += 1
            except Exception as e:
                logger.error(f"处理文件失败 {file_path}: {e}")

        logger.info(
            f"未处理文件扫描完成，成功处理 {processed_count}/{len(unprocessed_files)} 个文件"
        )

    def _extract_screen_id_from_path(self, file_path: str) -> int:
        """从文件名提取屏幕ID"""
        # 文件名格式: screen_{id}_{timestamp}.png
        MIN_FILENAME_PARTS = 2

        try:
            filename = os.path.basename(file_path)
            if filename.startswith("screen_"):
                parts = filename.split("_")
                if len(parts) >= MIN_FILENAME_PARTS:
                    return int(parts[1])
        except (ValueError, IndexError):
            pass
        return 0

    def _print_final_stats(self):
        """输出最终统计信息"""
        logger.info("录制会话结束")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="LifeTrace Screen Recorder")
    parser.add_argument("--config", help="配置文件路径")
    parser.add_argument("--interval", type=int, help="截图间隔（秒）")
    parser.add_argument("--screens", help='要截图的屏幕，用逗号分隔或使用"all"')
    parser.add_argument("--debug", action="store_true", help="启用调试日志")

    args = parser.parse_args()

    # 更新配置
    if args.interval:
        config.set("jobs.recorder.interval", args.interval)

    if args.screens:
        if args.screens.lower() == "all":
            config.set("jobs.recorder.params.screens", "all")
        else:
            screens = [int(s.strip()) for s in args.screens.split(",")]
            config.set("jobs.recorder.params.screens", screens)

    # 创建并启动录制器
    recorder = ScreenRecorder()
    recorder.start_recording()


# 全局录制器实例（用于调度器任务）
_global_recorder_instance = None


def get_recorder_instance() -> ScreenRecorder:
    """获取全局录制器实例

    Returns:
        ScreenRecorder 实例
    """
    global _global_recorder_instance
    if _global_recorder_instance is None:
        _global_recorder_instance = ScreenRecorder()
    return _global_recorder_instance


def execute_capture_task():
    """执行截图任务（供调度器调用的可序列化函数）

    这是一个模块级别的函数，可以被 APScheduler 序列化到数据库中
    """
    try:
        logger.info("🔄 开始执行录制器任务")
        recorder = get_recorder_instance()
        captured_files = recorder.execute_capture()
        return len(captured_files)
    except Exception as e:
        logger.error(f"执行录制器任务失败: {e}", exc_info=True)
        return 0
