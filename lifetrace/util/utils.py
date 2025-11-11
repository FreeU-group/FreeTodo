import hashlib
import logging
import os
import platform
from datetime import datetime, timedelta
from pathlib import Path


def get_file_hash(file_path: str) -> str:
    """计算文件MD5哈希值"""
    hash_md5 = hashlib.md5()
    try:
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except Exception:
        return ""


def ensure_dir(path: str):
    """确保目录存在"""
    os.makedirs(path, exist_ok=True)


def get_active_window_info() -> tuple[str | None, str | None]:
    """获取当前活跃窗口信息"""
    try:
        system = platform.system()

        if system == "Windows":
            return _get_windows_active_window()
        elif system == "Darwin":  # macOS
            return _get_macos_active_window()
        elif system == "Linux":
            return _get_linux_active_window()
        else:
            return None, None
    except Exception as e:
        logging.warning(f"获取活跃窗口信息失败: {e}")
        return None, None


def _get_windows_active_window() -> tuple[str | None, str | None]:
    """获取Windows活跃窗口信息"""
    try:
        import psutil
        import win32gui
        import win32process

        hwnd = win32gui.GetForegroundWindow()
        if hwnd:
            window_title = win32gui.GetWindowText(hwnd)
            _, pid = win32process.GetWindowThreadProcessId(hwnd)

            try:
                process = psutil.Process(pid)
                app_name = process.name()
            except:  # noqa: E722
                app_name = None

            return app_name, window_title
    except ImportError:
        logging.warning("Windows依赖未安装，无法获取窗口信息")
    except Exception as e:
        logging.error(f"获取Windows窗口信息失败: {e}")

    return None, None


def _get_macos_active_window() -> tuple[str | None, str | None]:
    """获取macOS活跃窗口信息"""
    try:
        from AppKit import NSWorkspace
        from Quartz import (
            CGWindowListCopyWindowInfo,
            kCGNullWindowID,
            kCGWindowListOptionOnScreenOnly,
        )

        # 获取活跃应用
        workspace = NSWorkspace.sharedWorkspace()
        active_app = workspace.activeApplication()
        app_name = active_app.get("NSApplicationName", None) if active_app else None

        # 获取窗口标题
        window_list = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID)
        if window_list:
            for window in window_list:
                if window.get("kCGWindowOwnerName") == app_name:
                    window_title = window.get("kCGWindowName", "")
                    if window_title:
                        return app_name, window_title

        return app_name, None
    except ImportError:
        logging.warning("macOS依赖未安装，无法获取窗口信息")
    except Exception as e:
        logging.error(f"获取macOS窗口信息失败: {e}")

    return None, None


def _get_linux_active_window() -> tuple[str | None, str | None]:
    """获取Linux活跃窗口信息"""
    try:
        import subprocess

        # 使用xprop获取活跃窗口ID
        result = subprocess.run(
            ["xprop", "-root", "_NET_ACTIVE_WINDOW"], capture_output=True, text=True
        )
        if result.returncode == 0:
            window_id = result.stdout.strip().split()[-1]

            # 获取窗口标题
            title_result = subprocess.run(
                ["xprop", "-id", window_id, "WM_NAME"], capture_output=True, text=True
            )
            if title_result.returncode == 0:
                window_title = (
                    title_result.stdout.strip().split('"')[1]
                    if '"' in title_result.stdout
                    else None
                )

                # 获取应用名称
                class_result = subprocess.run(
                    ["xprop", "-id", window_id, "WM_CLASS"],
                    capture_output=True,
                    text=True,
                )
                if class_result.returncode == 0:
                    app_name = (
                        class_result.stdout.strip().split('"')[-2]
                        if '"' in class_result.stdout
                        else None
                    )
                    return app_name, window_title
    except Exception as e:
        logging.error(f"获取Linux窗口信息失败: {e}")

    return None, None


def format_file_size(size_bytes: int) -> str:
    """格式化文件大小"""
    if size_bytes == 0:
        return "0 B"

    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while size_bytes >= 1024 and i < len(size_names) - 1:
        size_bytes /= 1024.0
        i += 1

    return f"{size_bytes:.1f} {size_names[i]}"


def get_screenshot_filename(screen_id: int = 0, timestamp: datetime | None = None) -> str:
    """生成截图文件名"""
    if timestamp is None:
        timestamp = datetime.now()

    return f"screen_{screen_id}_{timestamp.strftime('%Y%m%d_%H%M%S_%f')[:-3]}.png"


def cleanup_old_files(directory: str, max_days: int):
    """清理旧文件"""
    if max_days <= 0:
        return

    cutoff_time = datetime.now() - timedelta(days=max_days)

    for file_path in Path(directory).glob("*.png"):
        try:
            if datetime.fromtimestamp(file_path.stat().st_mtime) < cutoff_time:
                file_path.unlink()
                logging.info(f"清理旧文件: {file_path}")
        except Exception as e:
            logging.error(f"清理文件失败 {file_path}: {e}")
