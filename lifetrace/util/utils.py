import hashlib
import os
import platform
from datetime import datetime, timedelta
from pathlib import Path

from lifetrace.util.logging_config import get_logger

logger = get_logger()


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
        # Windows 依赖未安装是正常的（可选功能），使用 debug 级别避免日志噪音
        logger.debug("Windows依赖未安装，无法获取窗口信息（这是可选的，不影响核心功能）")
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


def _get_macos_active_window_screen() -> int | None:  # noqa: C901, PLR0911
    """获取macOS活跃窗口所在的屏幕ID"""
    try:
        from AppKit import NSScreen, NSWorkspace
        from Quartz import (
            CGWindowListCopyWindowInfo,
            kCGNullWindowID,
            kCGWindowListOptionOnScreenOnly,
        )

        # 获取活跃应用
        workspace = NSWorkspace.sharedWorkspace()
        active_app = workspace.activeApplication()
        if not active_app:
            return None

        app_name = active_app.get("NSApplicationName", None)
        if not app_name:
            return None

        # 获取活跃窗口的边界
        window_list = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID)

        active_window_bounds = None
        if window_list:
            for window in window_list:
                if window.get("kCGWindowOwnerName") == app_name:
                    # 优先选择有标题的窗口（主窗口）
                    bounds = window.get("kCGWindowBounds", {})
                    # 忽略太小的窗口（可能是菜单、工具栏等）
                    MIN_WINDOW_SIZE = 100
                    if (
                        bounds.get("Height", 0) > MIN_WINDOW_SIZE
                        and bounds.get("Width", 0) > MIN_WINDOW_SIZE
                    ):
                        active_window_bounds = bounds
                        break

        if not active_window_bounds:
            # 如果找不到窗口，返回主屏幕（ID为1）
            return 1

        # 计算窗口中心点
        window_x = active_window_bounds.get("X", 0)
        window_y = active_window_bounds.get("Y", 0)
        window_width = active_window_bounds.get("Width", 0)
        window_height = active_window_bounds.get("Height", 0)
        window_center_x = window_x + window_width / 2
        window_center_y = window_y + window_height / 2

        # 获取所有屏幕
        screens = NSScreen.screens()
        if not screens:
            return 1

        # macOS 屏幕坐标系统：主屏幕左下角为 (0, 0)，y 向上增加
        # 但窗口坐标系统是：主屏幕左上角为 (0, 0)，y 向下增加
        # 需要转换坐标系统

        # 遍历所有屏幕，找到包含窗口中心点的屏幕
        for i, screen in enumerate(screens):
            frame = screen.frame()
            screen_x = frame.origin.x
            screen_y = frame.origin.y
            screen_width = frame.size.width
            screen_height = frame.size.height

            # 转换为窗口坐标系（翻转 y 轴）
            main_screen_height = screens[0].frame().size.height
            screen_y_flipped = main_screen_height - screen_y - screen_height

            # 检查窗口中心点是否在此屏幕范围内
            if (
                screen_x <= window_center_x <= screen_x + screen_width
                and screen_y_flipped <= window_center_y <= screen_y_flipped + screen_height
            ):
                # 返回屏幕ID（从1开始）
                return i + 1

        # 如果没有找到匹配的屏幕，返回主屏幕
        return 1

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
        # Windows 依赖未安装是正常的（可选功能），使用 debug 级别避免日志噪音
        logger.debug("Windows依赖未安装，无法获取屏幕信息（这是可选的，不影响核心功能）")
    except Exception as e:
        logger.error(f"获取Windows活跃窗口屏幕失败: {e}")

    return None


def _get_linux_active_window_screen() -> int | None:  # noqa: C901
    """获取Linux活跃窗口所在的屏幕ID"""
    try:
        import subprocess

        # 使用xrandr获取屏幕信息
        # 使用xdotool获取活跃窗口位置
        result = subprocess.run(
            ["xdotool", "getactivewindow", "getwindowgeometry"], capture_output=True, text=True
        )

        if result.returncode != 0:
            return 1

        # 解析窗口位置
        # 输出格式类似: Position: 100,200 (screen: 0)
        for line in result.stdout.split("\n"):
            if "Position:" in line:
                pos = line.split("Position:")[1].split()[0]
                x, y = map(int, pos.split(","))

                # 获取所有屏幕信息
                xrandr_result = subprocess.run(
                    ["xrandr", "--current"], capture_output=True, text=True
                )

                if xrandr_result.returncode == 0:
                    screen_id = 1
                    for xrandr_line in xrandr_result.stdout.split("\n"):
                        if " connected" in xrandr_line and "+" in xrandr_line:
                            # 解析屏幕位置，格式如: 1920x1080+0+0
                            parts = xrandr_line.split()
                            for part in parts:
                                if "+" in part and "x" in part:
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

        return 1  # 默认返回主屏幕

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
    BYTES_PER_KB = 1024
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
