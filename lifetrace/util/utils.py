import hashlib
import os
import platform
from datetime import datetime, timedelta
from pathlib import Path

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 常量定义
MIN_WINDOW_SIZE = 100  # 最小窗口尺寸（用于过滤菜单、工具栏等）
BYTES_PER_KB = 1024  # 每KB的字节数
DEFAULT_SCREEN_ID = 1  # 默认屏幕ID


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
        logger.warning(f"获取活跃窗口信息失败: {e}")
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
        logger.warning("Windows依赖未安装，无法获取窗口信息")
    except Exception as e:
        logger.error(f"获取Windows窗口信息失败: {e}")

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
        try:
            window_list = CGWindowListCopyWindowInfo(
                kCGWindowListOptionOnScreenOnly, kCGNullWindowID
            )
            if window_list:
                for window in window_list:
                    if window.get("kCGWindowOwnerName") == app_name:
                        window_title = window.get("kCGWindowName", "")
                        if window_title:
                            return app_name, window_title
        except Exception as window_error:
            # 可能是权限问题，返回应用名称但不返回窗口标题
            logger.warning(f"无法获取窗口标题（可能缺少屏幕录制权限）: {window_error}")
            return app_name, None

        return app_name, None
    except ImportError as e:
        logger.warning(f"macOS依赖未安装，无法获取窗口信息: {e}")
    except Exception as e:
        logger.error(f"获取macOS窗口信息失败: {e}")

    return None, None


def get_active_window_screen() -> int | None:
    """获取活跃窗口所在的屏幕ID（从1开始）"""
    try:
        system = platform.system()

        if system == "Darwin":  # macOS
            return _get_macos_active_window_screen()
        elif system == "Windows":
            return _get_windows_active_window_screen()
        elif system == "Linux":
            return _get_linux_active_window_screen()
        else:
            return None
    except Exception as e:
        logger.warning(f"获取活跃窗口屏幕失败: {e}")
        return None


def _get_macos_active_app_name() -> str | None:
    """获取macOS活跃应用名称"""
    from AppKit import NSWorkspace

    workspace = NSWorkspace.sharedWorkspace()
    active_app = workspace.activeApplication()
    if not active_app:
        return None
    return active_app.get("NSApplicationName", None)


def _get_macos_active_window_bounds(app_name: str) -> dict | None:
    """获取macOS活跃窗口的边界"""
    from Quartz import (
        CGWindowListCopyWindowInfo,
        kCGNullWindowID,
        kCGWindowListOptionOnScreenOnly,
    )

    window_list = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID)
    if not window_list:
        return None

    for window in window_list:
        if window.get("kCGWindowOwnerName") == app_name:
            bounds = window.get("kCGWindowBounds", {})
            # 忽略太小的窗口（可能是菜单、工具栏等）
            if (
                bounds.get("Height", 0) > MIN_WINDOW_SIZE
                and bounds.get("Width", 0) > MIN_WINDOW_SIZE
            ):
                return bounds

    return None


def _find_screen_for_window_center(window_center: tuple[float, float], screens: list) -> int:
    """查找包含窗口中心点的屏幕"""
    window_center_x, window_center_y = window_center
    main_screen_height = screens[0].frame().size.height

    for i, screen in enumerate(screens):
        frame = screen.frame()
        screen_x = frame.origin.x
        screen_y = frame.origin.y
        screen_width = frame.size.width
        screen_height = frame.size.height

        # 转换为窗口坐标系（翻转 y 轴）
        screen_y_flipped = main_screen_height - screen_y - screen_height

        if (
            screen_x <= window_center_x <= screen_x + screen_width
            and screen_y_flipped <= window_center_y <= screen_y_flipped + screen_height
        ):
            return i + 1

    return DEFAULT_SCREEN_ID


def _get_macos_active_window_screen() -> int | None:
    """获取macOS活跃窗口所在的屏幕ID"""
    try:
        from AppKit import NSScreen

        app_name = _get_macos_active_app_name()
        if not app_name:
            return None

        active_window_bounds = _get_macos_active_window_bounds(app_name)
        if not active_window_bounds:
            return DEFAULT_SCREEN_ID

        # 计算窗口中心点
        window_x = active_window_bounds.get("X", 0)
        window_y = active_window_bounds.get("Y", 0)
        window_width = active_window_bounds.get("Width", 0)
        window_height = active_window_bounds.get("Height", 0)
        window_center = (window_x + window_width / 2, window_y + window_height / 2)

        screens = NSScreen.screens()
        if not screens:
            return DEFAULT_SCREEN_ID

        return _find_screen_for_window_center(window_center, screens)

    except ImportError as e:
        logger.warning(f"macOS依赖未安装，无法获取屏幕信息: {e}")
    except Exception as e:
        logger.error(f"获取macOS活跃窗口屏幕失败: {e}")

    return None


def _get_windows_active_window_screen() -> int | None:
    """获取Windows活跃窗口所在的屏幕ID"""
    try:
        import win32api
        import win32gui

        hwnd = win32gui.GetForegroundWindow()
        if not hwnd:
            return None

        # 获取窗口矩形
        rect = win32gui.GetWindowRect(hwnd)
        window_x = rect[0]
        window_y = rect[1]
        window_width = rect[2] - rect[0]
        window_height = rect[3] - rect[1]

        # 计算窗口中心点
        center_x = window_x + window_width // 2
        center_y = window_y + window_height // 2

        # 获取所有显示器
        monitors = win32api.EnumDisplayMonitors()

        # 遍历所有显示器，找到包含窗口中心点的显示器
        for i, monitor in enumerate(monitors):
            monitor_info = win32api.GetMonitorInfo(monitor[0])
            monitor_rect = monitor_info["Monitor"]

            if (
                monitor_rect[0] <= center_x <= monitor_rect[2]
                and monitor_rect[1] <= center_y <= monitor_rect[3]
            ):
                return i + 1

        return 1  # 默认返回主屏幕

    except ImportError:
        logger.warning("Windows依赖未安装，无法获取屏幕信息")
    except Exception as e:
        logger.error(f"获取Windows活跃窗口屏幕失败: {e}")

    return None


def _parse_linux_window_position(stdout: str) -> tuple[int, int] | None:
    """解析Linux窗口位置"""
    for line in stdout.split("\n"):
        if "Position:" in line:
            pos = line.split("Position:")[1].split()[0]
            x, y = map(int, pos.split(","))
            return x, y
    return None


def _find_linux_screen_for_position(x: int, y: int, xrandr_stdout: str) -> int:
    """根据位置查找Linux屏幕ID"""
    screen_id = 1
    for xrandr_line in xrandr_stdout.split("\n"):
        if " connected" not in xrandr_line or "+" not in xrandr_line:
            continue

        for part in xrandr_line.split():
            if "+" not in part or "x" not in part:
                continue

            screen_x = int(part.split("+")[1])
            screen_y = int(part.split("+")[2])
            screen_width = int(part.split("x")[0])
            screen_height = int(part.split("x")[1].split("+")[0])

            if (
                screen_x <= x <= screen_x + screen_width
                and screen_y <= y <= screen_y + screen_height
            ):
                return screen_id

            screen_id += 1

    return DEFAULT_SCREEN_ID


def _get_linux_active_window_screen() -> int | None:
    """获取Linux活跃窗口所在的屏幕ID"""
    try:
        import subprocess

        result = subprocess.run(
            ["xdotool", "getactivewindow", "getwindowgeometry"], capture_output=True, text=True
        )

        if result.returncode != 0:
            return DEFAULT_SCREEN_ID

        position = _parse_linux_window_position(result.stdout)
        if not position:
            return DEFAULT_SCREEN_ID

        xrandr_result = subprocess.run(["xrandr", "--current"], capture_output=True, text=True)
        if xrandr_result.returncode != 0:
            return DEFAULT_SCREEN_ID

        return _find_linux_screen_for_position(position[0], position[1], xrandr_result.stdout)

    except Exception as e:
        logger.error(f"获取Linux活跃窗口屏幕失败: {e}")

    return None


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
        logger.error(f"获取Linux窗口信息失败: {e}")

    return None, None


def format_file_size(size_bytes: int) -> str:
    """格式化文件大小"""
    if size_bytes == 0:
        return "0 B"

    size_names = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while size_bytes >= BYTES_PER_KB and i < len(size_names) - 1:
        size_bytes /= float(BYTES_PER_KB)
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
                logger.info(f"清理旧文件: {file_path}")
        except Exception as e:
            logger.error(f"清理文件失败 {file_path}: {e}")
