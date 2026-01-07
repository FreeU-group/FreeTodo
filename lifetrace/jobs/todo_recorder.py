"""
Todo 专用屏幕录制器 - 仅录制白名单应用，用于自动待办检测

与通用屏幕录制器（recorder.py）完全独立：
- 用户可以只开启 Todo 专用录制，而不开启通用录制
- 两者可以同时运行，互不影响
- 复用截图核心逻辑，但维护独立的运行状态
"""

import hashlib
import os
import threading
from datetime import datetime
from functools import wraps

import imagehash
import mss
from PIL import Image

from lifetrace.llm.auto_todo_detection_service import get_whitelist_apps
from lifetrace.storage import screenshot_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import get_screenshots_dir
from lifetrace.util.settings import settings
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


def with_timeout(timeout_seconds: float = 5.0, operation_name: str = "操作"):
    """超时装饰器 - 使用线程池实现超时控制"""
    from concurrent.futures import Future, ThreadPoolExecutor

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            executor = ThreadPoolExecutor(max_workers=1)
            future: Future = executor.submit(func, *args, **kwargs)

            try:
                result = future.result(timeout=timeout_seconds)
                return result
            except TimeoutError:
                logger.warning(f"{operation_name}超时 ({timeout_seconds}秒)")
                return None
            except Exception as e:
                logger.error(f"{operation_name}执行失败: {e}")
                raise
            finally:
                executor.shutdown(wait=False)

        return wrapper

    return decorator


class TodoScreenRecorder:
    """Todo 专用屏幕录制器

    仅在白名单应用激活时截图，截图后直接触发自动待办检测。
    与通用录制器完全独立，不依赖其运行状态。
    """

    def __init__(self):
        """初始化 Todo 专用录制器"""
        self.screenshots_dir = str(get_screenshots_dir())
        self.interval = settings.get("jobs.todo_recorder.interval", 5)
        self.deduplicate = settings.get("jobs.todo_recorder.params.deduplicate", True)
        self.hash_threshold = settings.get("jobs.todo_recorder.params.hash_threshold", 5)

        # 超时配置
        self.file_io_timeout = settings.get("jobs.todo_recorder.params.file_io_timeout", 15)
        self.db_timeout = settings.get("jobs.todo_recorder.params.db_timeout", 20)
        self.window_info_timeout = settings.get("jobs.todo_recorder.params.window_info_timeout", 5)

        # 初始化截图目录
        ensure_dir(self.screenshots_dir)

        # 独立的上一张截图哈希值（用于去重，与通用录制器独立）
        self.last_hash: str | None = None

        logger.info(f"[Todo录制器] 初始化完成，间隔: {self.interval}秒，去重: {self.deduplicate}")

    def _get_window_info(self) -> tuple[str, str]:
        """获取当前活动窗口信息"""

        @with_timeout(timeout_seconds=self.window_info_timeout, operation_name="获取窗口信息")
        def _do_get_window_info():
            return get_active_window_info()

        try:
            result = _do_get_window_info()
            if result is not None:
                app_name, window_title = result
                app_name = app_name or UNKNOWN_APP
                window_title = window_title or UNKNOWN_WINDOW
                return (app_name, window_title)
            return (UNKNOWN_APP, UNKNOWN_WINDOW)
        except Exception as e:
            logger.error(f"[Todo录制器] 获取窗口信息失败: {e}")
            return (UNKNOWN_APP, UNKNOWN_WINDOW)

    def _is_whitelist_app(self, app_name: str) -> bool:
        """检查当前应用是否在白名单中

        Args:
            app_name: 应用名称

        Returns:
            是否为白名单应用
        """
        if not app_name or app_name == UNKNOWN_APP:
            return False

        whitelist_apps = get_whitelist_apps()
        app_name_lower = app_name.lower()
        return any(whitelist_app.lower() in app_name_lower for whitelist_app in whitelist_apps)

    def _calculate_image_hash_from_memory(self, screenshot) -> str:
        """从内存中的截图计算图像感知哈希值"""

        @with_timeout(timeout_seconds=self.file_io_timeout, operation_name="计算图像哈希")
        def _do_calculate_hash():
            img = Image.frombytes("RGB", screenshot.size, screenshot.rgb)
            return str(imagehash.phash(img))

        try:
            result = _do_calculate_hash()
            return result if result is not None else ""
        except Exception as e:
            logger.error(f"[Todo录制器] 计算图像哈希失败: {e}")
            return ""

    def _is_duplicate(self, image_hash: str) -> bool:
        """检查是否为重复图像"""
        if not self.deduplicate or not self.last_hash:
            return False

        try:
            current = imagehash.hex_to_hash(image_hash)
            previous = imagehash.hex_to_hash(self.last_hash)
            distance = current - previous

            is_duplicate = distance <= self.hash_threshold

            if is_duplicate:
                logger.debug("[Todo录制器] 检测到重复截图，跳过")

            return is_duplicate
        except Exception as e:
            logger.error(f"[Todo录制器] 比较图像哈希失败: {e}")
            return False

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
            logger.error(f"[Todo录制器] 保存截图失败 {file_path}: {e}")
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
            logger.error(f"[Todo录制器] 读取图像尺寸失败 {file_path}: {e}")
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
            logger.error(f"[Todo录制器] 计算文件哈希失败 {file_path}: {e}")
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
            screenshot_id = screenshot_mgr.add_screenshot(
                file_path=file_path,
                file_hash=file_hash,
                width=width,
                height=height,
                metadata={
                    "screen_id": screen_id,
                    "app_name": app_name or UNKNOWN_APP,
                    "window_title": window_title or UNKNOWN_WINDOW,
                    "source": "todo_recorder",  # 标记来源为 Todo 专用录制器
                    "event_id": None,
                },
            )
            return screenshot_id

        try:
            result = _do_save_to_db()
            return result
        except Exception as e:
            logger.error(f"[Todo录制器] 保存截图记录到数据库失败: {e}")
            return None

    def _trigger_todo_detection(self, screenshot_id: int, app_name: str):
        """触发自动待办检测

        Args:
            screenshot_id: 截图ID
            app_name: 应用名称
        """

        def _detect_todos():
            try:
                from lifetrace.llm.auto_todo_detection_service import AutoTodoDetectionService

                service = AutoTodoDetectionService()
                result = service.detect_and_create_todos_from_screenshot(screenshot_id)
                logger.info(
                    f"[Todo录制器] 截图 {screenshot_id} 待办检测完成，"
                    f"创建 {result.get('created_count', 0)} 个 draft 待办"
                )
            except Exception as e:
                logger.error(
                    f"[Todo录制器] 截图 {screenshot_id} 待办检测失败: {e}",
                    exc_info=True,
                )

        # 使用后台线程异步执行，避免阻塞截图流程
        thread = threading.Thread(target=_detect_todos, daemon=True)
        thread.start()

    def _check_whitelist_and_screen(self, app_name: str) -> tuple[int, str, str] | None:
        """检查白名单应用和屏幕

        Returns:
            (screen_id, app_name, window_title) 或 None（如果检查失败）
        """
        _, window_title = self._get_window_info()

        if not self._is_whitelist_app(app_name):
            logger.debug(f"[Todo录制器] 当前应用 '{app_name}' 不在白名单中，跳过截图")
            return None

        active_screen_id = get_active_window_screen()
        if active_screen_id is None:
            logger.warning("[Todo录制器] 无法获取活跃窗口所在的屏幕，跳过截图")
            return None

        logger.info(
            f"[Todo录制器] 📸 检测到白名单应用: {app_name}，准备截图 - 屏幕: {active_screen_id}"
        )
        return (active_screen_id, app_name, window_title)

    def _capture_and_save(
        self,
        active_screen_id: int,
        app_name: str,
        window_title: str,
    ) -> str | None:
        """执行截图并保存

        Returns:
            截图文件路径，如果失败则返回 None
        """
        with mss.mss() as sct:
            if active_screen_id >= len(sct.monitors):
                logger.warning(f"[Todo录制器] 屏幕ID {active_screen_id} 不存在")
                return None

            monitor = sct.monitors[active_screen_id]
            screenshot = sct.grab(monitor)
            timestamp = datetime.now()
            filename = f"todo_{get_screenshot_filename(active_screen_id, timestamp)}"
            file_path = os.path.join(self.screenshots_dir, filename)

            # 计算图像哈希（用于去重）
            image_hash = self._calculate_image_hash_from_memory(screenshot)
            if not image_hash:
                logger.error("[Todo录制器] 计算图像哈希失败，跳过")
                return None

            # 检查是否重复
            if self._is_duplicate(image_hash):
                return None

            # 更新哈希记录并保存
            self.last_hash = image_hash
            if not self._save_screenshot(screenshot, file_path):
                logger.error(f"[Todo录制器] 保存截图失败: {filename}")
                return None

            # 保存元数据并触发检测
            self._save_metadata_and_trigger(
                file_path, filename, active_screen_id, app_name, window_title
            )
            return file_path

    def _save_metadata_and_trigger(
        self,
        file_path: str,
        filename: str,
        screen_id: int,
        app_name: str,
        window_title: str,
    ) -> None:
        """保存元数据并触发待办检测"""
        width, height = self._get_image_size(file_path)
        file_hash = self._calculate_file_hash(file_path) or ""

        screenshot_id = self._save_to_database(
            file_path, file_hash, width, height, screen_id, app_name, window_title
        )

        file_size = os.path.getsize(file_path)
        file_size_kb = file_size / 1024
        logger.info(f"[Todo录制器] ✅ 截图保存: {filename} ({file_size_kb:.2f} KB) - {app_name}")

        if screenshot_id:
            self._trigger_todo_detection(screenshot_id, app_name)
        else:
            logger.warning(f"[Todo录制器] 数据库保存失败，但文件已保存: {filename}")

    def capture_whitelist_app(self) -> str | None:
        """截取白名单应用的屏幕

        仅在当前活动窗口为白名单应用时才截图。

        Returns:
            截图文件路径，如果未截图则返回 None
        """
        app_name, window_title = self._get_window_info()

        check_result = self._check_whitelist_and_screen(app_name)
        if check_result is None:
            return None

        active_screen_id, app_name, window_title = check_result

        try:
            return self._capture_and_save(active_screen_id, app_name, window_title)
        except Exception as e:
            logger.error(f"[Todo录制器] 截图失败: {e}", exc_info=True)
            return None

    def execute_capture(self) -> str | None:
        """执行一次截图任务（用于调度器调用）

        Returns:
            截图文件路径，如果未截图则返回 None
        """
        try:
            result = self.capture_whitelist_app()
            if result:
                logger.info("[Todo录制器] ✅ 本次截取了白名单应用截图")
            else:
                logger.debug("[Todo录制器] ⏭️ 本次未截取截图（非白名单应用或重复）")
            return result
        except Exception as e:
            logger.error(f"[Todo录制器] 执行截图任务失败: {e}", exc_info=True)
            return None


# 全局录制器实例（用于调度器任务）
_global_todo_recorder_instance: TodoScreenRecorder | None = None


def get_todo_recorder_instance() -> TodoScreenRecorder:
    """获取全局 Todo 录制器实例

    Returns:
        TodoScreenRecorder 实例
    """
    global _global_todo_recorder_instance
    if _global_todo_recorder_instance is None:
        _global_todo_recorder_instance = TodoScreenRecorder()
    return _global_todo_recorder_instance


def execute_todo_capture_task() -> int:
    """执行 Todo 截图任务（供调度器调用的可序列化函数）

    这是一个模块级别的函数，可以被 APScheduler 序列化到数据库中

    Returns:
        1 如果截图成功，0 如果未截图
    """
    try:
        logger.debug("🔄 [Todo录制器] 开始执行截图任务")
        recorder = get_todo_recorder_instance()
        result = recorder.execute_capture()
        return 1 if result else 0
    except Exception as e:
        logger.error(f"[Todo录制器] 执行任务失败: {e}", exc_info=True)
        return 0
