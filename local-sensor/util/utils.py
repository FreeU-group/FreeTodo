import hashlib
import importlib
import os
import platform
import shutil
import subprocess  # nosec B404
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

MIN_WINDOW_SIZE = 100
BYTES_PER_KB = 1024
DEFAULT_SCREEN_ID = 1
MACOS_WINDOW_LAYER = 0

try:
    import psutil
    import win32api
    import win32gui
    import win32process
except ImportError:
    psutil = None
    win32api = None
    win32gui = None
    win32process = None


def _load_appkit() -> Any | None:
    try:
        return importlib.import_module("AppKit")
    except Exception:
        return None


def _load_quartz() -> Any | None:
    try:
        return importlib.import_module("Quartz")
    except Exception:
        return None


def _has_macos_screen_recording_permission(quartz: Any) -> bool | None:
    preflight = getattr(quartz, "CGPreflightScreenCaptureAccess", None)
    if not callable(preflight):
        return None
    try:
        return bool(preflight())
    except Exception as e:
        logger.debug(f"检测macOS屏幕录制权限失败: {e}")
        return None


def _get_macos_window_candidates(
    window_list: list[Any], app_name: str | None, app_pid: int | None
) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for raw_window in window_list:
        if not isinstance(raw_window, dict):
            continue

        owner_pid = raw_window.get("kCGWindowOwnerPID")
        owner_name = raw_window.get("kCGWindowOwnerName")
        if app_pid is not None and owner_pid == app_pid:
            candidates.append(raw_window)
            continue
        if app_name and owner_name == app_name:
            candidates.append(raw_window)

    def _candidate_score(window: dict[str, Any]) -> tuple[int, int, int]:
        bounds = window.get("kCGWindowBounds") or {}
        area = int(bounds.get("Width", 0)) * int(bounds.get("Height", 0))
        return (
            int(window.get("kCGWindowOwnerPID") == app_pid),
            int(window.get("kCGWindowLayer") == MACOS_WINDOW_LAYER),
            area,
        )

    return sorted(candidates, key=_candidate_score, reverse=True)


def _get_macos_window_title(quartz: Any, app_name: str, app_pid: int | None) -> str | None:
    try:
        window_list = quartz.CGWindowListCopyWindowInfo(
            quartz.kCGWindowListOptionOnScreenOnly | quartz.kCGWindowListExcludeDesktopElements,
            quartz.kCGNullWindowID,
        )
    except Exception as window_error:
        has_permission = _has_macos_screen_recording_permission(quartz)
        if has_permission is False:
            logger.warning("无法获取窗口标题: 缺少macOS屏幕录制权限")
        else:
            logger.warning(f"无法获取窗口标题: Quartz窗口列表调用失败: {window_error}")
        return None

    if not window_list:
        logger.info(f"未获取到任何可见窗口记录: app={app_name}")
        return None

    candidates = _get_macos_window_candidates(list(window_list), app_name, app_pid)
    if not candidates:
        logger.info(f"未找到前台应用对应的窗口记录: app={app_name}, pid={app_pid}")
        return None

    for window in candidates:
        window_title = str(window.get("kCGWindowName") or "").strip()
        if window_title:
            return window_title

    logger.info(f"前台应用存在窗口记录但未暴露窗口标题: app={app_name}, pid={app_pid}")
    return None


def get_file_hash(file_path: str) -> str:
    hash_md5 = hashlib.md5(usedforsecurity=False)
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except Exception:
        return ""


def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)


def get_active_window_info() -> tuple[str | None, str | None]:
    try:
        system = platform.system()
        if system == "Windows":
            return _get_windows_active_window()
        elif system == "Darwin":
            return _get_macos_active_window()
        elif system == "Linux":
            return _get_linux_active_window()
        else:
            return None, None
    except Exception as e:
        logger.warning(f"获取活跃窗口信息失败: {e}")
        return None, None


def _get_windows_active_window() -> tuple[str | None, str | None]:
    try:
        if psutil is None or win32gui is None or win32process is None:
            return None, None
        hwnd = win32gui.GetForegroundWindow()
        if hwnd:
            window_title = win32gui.GetWindowText(hwnd)
            _, pid = win32process.GetWindowThreadProcessId(hwnd)
            try:
                process = psutil.Process(pid)
                app_name = process.name()
            except psutil.Error:
                app_name = None
            return app_name, window_title
    except Exception as e:
        logger.error(f"获取Windows窗口信息失败: {e}")
    return None, None


def _get_macos_active_window() -> tuple[str | None, str | None]:
    app_name: str | None = None
    try:
        appkit = _load_appkit()
        quartz = _load_quartz()
        if appkit is None or quartz is None:
            logger.warning("macOS依赖未安装, 无法获取窗口信息")
        else:
            workspace = appkit.NSWorkspace.sharedWorkspace()
            active_app = workspace.activeApplication()
            app_name = active_app.get("NSApplicationName", None) if active_app else None
            app_pid = active_app.get("NSApplicationProcessIdentifier", None) if active_app else None

            if app_name is None:
                logger.info("无法识别当前前台应用, 跳过窗口标题获取")
            else:
                return app_name, _get_macos_window_title(quartz, app_name, app_pid)
    except Exception as e:
        logger.error(f"获取macOS窗口信息失败: {e}")
    return app_name, None


def _get_macos_active_window_bounds(app_name: str) -> dict | None:
    quartz = _load_quartz()
    if quartz is None:
        return None
    window_list = quartz.CGWindowListCopyWindowInfo(
        quartz.kCGWindowListOptionOnScreenOnly, quartz.kCGNullWindowID
    )
    if not window_list:
        return None

    for window in window_list:
        if window.get("kCGWindowOwnerName") == app_name:
            bounds = window.get("kCGWindowBounds", {})
            if (
                bounds.get("Height", 0) > MIN_WINDOW_SIZE
                and bounds.get("Width", 0) > MIN_WINDOW_SIZE
            ):
                return bounds
    return None


def _get_linux_active_window() -> tuple[str | None, str | None]:
    try:
        xprop_path = shutil.which("xprop")
        if not xprop_path:
            return None, None
        result = subprocess.run(  # nosec B603
            [xprop_path, "-root", "_NET_ACTIVE_WINDOW"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            window_id = result.stdout.strip().split()[-1]
            title_result = subprocess.run(  # nosec B603
                [xprop_path, "-id", window_id, "WM_NAME"],
                capture_output=True,
                text=True,
                check=False,
            )
            if title_result.returncode == 0:
                window_title = (
                    title_result.stdout.strip().split('"')[1]
                    if '"' in title_result.stdout
                    else None
                )
                class_result = subprocess.run(  # nosec B603
                    [xprop_path, "-id", window_id, "WM_CLASS"],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                if class_result.returncode == 0:
                    app_name = (
                        class_result.stdout.strip().split('"')[-2]
                        if '"' in class_result.stdout
                        else None
                    )
                    return app_name, window_title
    except Exception as e:
        logger.error(f"获取Linux窗口信息失败: {e}")
    return None, None


def format_file_size(size_bytes: int) -> str:
    if size_bytes == 0:
        return "0 B"
    size_names = ["B", "KB", "MB", "GB", "TB"]
    size_value = float(size_bytes)
    i = 0
    while size_value >= BYTES_PER_KB and i < len(size_names) - 1:
        size_value /= float(BYTES_PER_KB)
        i += 1
    return f"{size_value:.1f} {size_names[i]}"


def get_screenshot_filename(screen_id: int = 0, timestamp: datetime | None = None) -> str:
    if timestamp is None:
        timestamp = get_utc_now()
    return f"screen_{screen_id}_{timestamp.strftime('%Y%m%d_%H%M%S_%f')[:-3]}.png"


def cleanup_old_files(directory: str, max_days: int):
    if max_days <= 0:
        return
    cutoff_time = get_utc_now() - timedelta(days=max_days)
    for file_path in Path(directory).glob("*.png"):
        try:
            if datetime.fromtimestamp(file_path.stat().st_mtime, tz=UTC) < cutoff_time:
                file_path.unlink()
                logger.info(f"清理旧文件: {file_path}")
        except Exception as e:
            logger.error(f"清理文件失败 {file_path}: {e}")
