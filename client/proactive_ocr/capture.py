"""屏幕捕获模块"""

import contextlib
import importlib
import platform
import shutil
import subprocess  # nosec B404
import sys
import time
import uuid
from typing import Any, cast

import numpy as np

from util.logging_config import get_logger
from util.utils import _get_macos_active_window_bounds, get_active_window_info

from .models import BBox, FrameEvent, ImageFrame, WindowMeta

logger = get_logger()

try:
    import mss
    import mss.tools
except ImportError:
    mss = None
    logger.warning("mss not available, window capture will be limited")

if sys.platform == "win32":
    try:
        from ctypes import c_void_p, windll

        import win32con
        import win32gui
        import win32process

        win32ui = importlib.import_module("win32ui")

        WIN32_AVAILABLE = True
    except ImportError:
        c_void_p = None
        windll = None
        win32con = None
        win32gui = None
        win32process = None
        win32ui = None
        WIN32_AVAILABLE = False
        logger.warning("pywin32 not available, PrintWindow capture disabled")
else:
    c_void_p = None
    windll = None
    win32con = None
    win32gui = None
    win32process = None
    win32ui = None
    WIN32_AVAILABLE = False

try:
    import psutil
except ImportError:
    psutil = None
    logger.warning("psutil not available, process name detection disabled")

BGRA_CHANNELS = 4


def set_dpi_awareness():
    if not WIN32_AVAILABLE or windll is None or c_void_p is None:
        return
    with contextlib.suppress(Exception):
        windll.user32.SetProcessDpiAwarenessContext(c_void_p(-4))
        return
    with contextlib.suppress(Exception):
        windll.shcore.SetProcessDpiAwareness(2)
        return
    with contextlib.suppress(Exception):
        windll.user32.SetProcessDPIAware()


if WIN32_AVAILABLE:
    set_dpi_awareness()


class WindowCapture:
    def __init__(self, fps: float = 1.0):
        self.fps = fps
        self.interval = 1.0 / fps
        self.last_capture_time = 0
        self._sct = None
        self.platform = platform.system()

    def _get_mss(self):
        if mss is None:
            return None
        if self._sct is None:
            self._sct = mss.mss()
        return self._sct

    def get_all_windows(self) -> list[WindowMeta]:
        if not WIN32_AVAILABLE or win32gui is None or win32process is None:
            return []

        win32gui_local = cast("Any", win32gui)
        win32process_local = cast("Any", win32process)
        windows = []

        def enum_callback(hwnd, results):
            if win32gui_local.IsWindowVisible(hwnd):
                title = win32gui_local.GetWindowText(hwnd)
                if title:
                    try:
                        rect = win32gui_local.GetWindowRect(hwnd)
                        _, pid = win32process_local.GetWindowThreadProcessId(hwnd)
                        process_name = ""
                        if psutil:
                            try:
                                process = psutil.Process(pid)
                                process_name = process.name()
                            except (psutil.NoSuchProcess, psutil.AccessDenied):
                                pass
                        is_minimized = bool(win32gui_local.IsIconic(hwnd))
                        window_meta = WindowMeta(
                            hwnd=hwnd, title=title, process_name=process_name, pid=pid,
                            rect=BBox(x=rect[0], y=rect[1], width=rect[2] - rect[0], height=rect[3] - rect[1]),
                            is_visible=True, is_minimized=is_minimized,
                        )
                        results.append(window_meta)
                    except Exception as e:
                        logger.debug(f"Failed to get window info for hwnd {hwnd}: {e}")
            return True

        win32gui_local.EnumWindows(enum_callback, windows)
        return windows

    def get_foreground_window(self) -> WindowMeta | None:
        if self.platform == "Windows" and WIN32_AVAILABLE:
            return self._get_windows_foreground_window()
        elif self.platform == "Darwin":
            return self._get_macos_foreground_window()
        elif self.platform == "Linux":
            return self._get_linux_foreground_window()
        else:
            logger.warning(f"Unsupported platform: {self.platform}")
            return None

    def _get_windows_foreground_window(self) -> WindowMeta | None:
        if not WIN32_AVAILABLE or win32gui is None or win32process is None:
            return None
        try:
            win32gui_local = cast("Any", win32gui)
            win32process_local = cast("Any", win32process)
            hwnd = win32gui_local.GetForegroundWindow()
            if not hwnd:
                return None
            title = win32gui_local.GetWindowText(hwnd)
            rect = win32gui_local.GetWindowRect(hwnd)
            _, pid = win32process_local.GetWindowThreadProcessId(hwnd)
            process_name = ""
            if psutil:
                try:
                    process = psutil.Process(pid)
                    process_name = process.name()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            return WindowMeta(
                hwnd=hwnd, title=title, process_name=process_name, pid=pid,
                rect=BBox(x=rect[0], y=rect[1], width=rect[2] - rect[0], height=rect[3] - rect[1]),
                is_visible=True, is_minimized=bool(win32gui_local.IsIconic(hwnd)),
            )
        except Exception as e:
            logger.error(f"Failed to get Windows foreground window: {e}")
            return None

    def _get_macos_foreground_window(self) -> WindowMeta | None:
        try:
            app_name, window_title = get_active_window_info()
            if not app_name:
                return None
            bounds = _get_macos_active_window_bounds(app_name)
            if not bounds:
                bounds = {"X": 0, "Y": 0, "Width": 800, "Height": 600}
            pid = 0
            if psutil:
                with contextlib.suppress(Exception):
                    for proc in psutil.process_iter(["pid", "name"]):
                        if proc.info["name"] == app_name or proc.info["name"] == f"{app_name}.app":
                            pid = proc.info["pid"]
                            break
            return WindowMeta(
                hwnd=pid, title=window_title or "", process_name=app_name, pid=pid,
                rect=BBox(
                    x=int(bounds.get("X", 0)), y=int(bounds.get("Y", 0)),
                    width=int(bounds.get("Width", 800)), height=int(bounds.get("Height", 600)),
                ),
                is_visible=True, is_minimized=False,
            )
        except ImportError as e:
            logger.warning(f"macOS dependencies not available: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to get macOS foreground window: {e}")
            return None

    def _get_linux_foreground_window(self) -> WindowMeta | None:  # noqa: C901
        try:
            app_name, window_title = get_active_window_info()
            if not app_name:
                return None
            try:
                xdotool_path = shutil.which("xdotool")
                if not xdotool_path:
                    raise FileNotFoundError("xdotool not found")
                result = subprocess.run(  # nosec B603
                    [xdotool_path, "getactivewindow", "getwindowgeometry"],
                    capture_output=True, text=True, timeout=2, check=False,
                )
                if result.returncode == 0:
                    geometry = {}
                    for line in result.stdout.split("\n"):
                        if "Position:" in line:
                            pos = line.split("Position:")[1].strip().split()[0]
                            x, y = map(int, pos.split(","))
                            geometry["x"] = x
                            geometry["y"] = y
                        elif "Geometry:" in line:
                            size = line.split("Geometry:")[1].strip().split()[0]
                            width, height = map(int, size.split("x"))
                            geometry["width"] = width
                            geometry["height"] = height
                    wid_result = subprocess.run(  # nosec B603
                        [xdotool_path, "getactivewindow"],
                        capture_output=True, text=True, timeout=2, check=False,
                    )
                    window_id = int(wid_result.stdout.strip()) if wid_result.returncode == 0 else 0
                    pid = 0
                    if psutil:
                        with contextlib.suppress(Exception):
                            for proc in psutil.process_iter(["pid", "name"]):
                                if proc.info["name"].lower() == app_name.lower():
                                    pid = proc.info["pid"]
                                    break
                    return WindowMeta(
                        hwnd=window_id, title=window_title or "", process_name=app_name, pid=pid,
                        rect=BBox(
                            x=geometry.get("x", 0), y=geometry.get("y", 0),
                            width=geometry.get("width", 800), height=geometry.get("height", 600),
                        ),
                        is_visible=True, is_minimized=False,
                    )
            except (subprocess.TimeoutExpired, subprocess.SubprocessError, FileNotFoundError):
                logger.debug("xdotool not available, using default window bounds")
                return WindowMeta(
                    hwnd=0, title=window_title or "", process_name=app_name, pid=0,
                    rect=BBox(x=0, y=0, width=800, height=600),
                    is_visible=True, is_minimized=False,
                )
        except Exception as e:
            logger.error(f"Failed to get Linux foreground window: {e}")
            return None

    def capture_window(self, window: WindowMeta, use_printwindow: bool = True) -> ImageFrame | None:
        if use_printwindow and WIN32_AVAILABLE:
            return self._capture_with_printwindow(window)
        else:
            return self._capture_with_mss(window)

    def _capture_with_printwindow(self, window: WindowMeta) -> ImageFrame | None:
        if (
            not WIN32_AVAILABLE
            or win32gui is None or win32ui is None
            or win32con is None or windll is None
        ):
            return self._capture_with_mss(window)
        try:
            win32gui_local = cast("Any", win32gui)
            win32ui_local = cast("Any", win32ui)
            hwnd = window.hwnd
            left, top, right, bottom = win32gui_local.GetWindowRect(hwnd)
            width = right - left
            height = bottom - top
            if width <= 0 or height <= 0:
                return self._capture_with_mss(window)

            hwnd_dc = win32gui_local.GetWindowDC(hwnd)
            mfc_dc = win32ui_local.CreateDCFromHandle(hwnd_dc)
            save_dc = mfc_dc.CreateCompatibleDC()
            bitmap = win32ui_local.CreateBitmap()
            bitmap.CreateCompatibleBitmap(mfc_dc, width, height)
            save_dc.SelectObject(bitmap)

            result = windll.user32.PrintWindow(hwnd, save_dc.GetSafeHdc(), 2)
            if result == 0:
                save_dc.BitBlt((0, 0), (width, height), mfc_dc, (0, 0), win32con.SRCCOPY)

            bmp_info = bitmap.GetInfo()
            bmp_str = bitmap.GetBitmapBits(True)
            img_array = np.frombuffer(bmp_str, dtype=np.uint8)
            img_array = img_array.reshape((bmp_info["bmHeight"], bmp_info["bmWidth"], 4))
            img_array = img_array[:, :, :3][:, :, ::-1]

            win32gui_local.DeleteObject(bitmap.GetHandle())
            save_dc.DeleteDC()
            mfc_dc.DeleteDC()
            win32gui_local.ReleaseDC(hwnd, hwnd_dc)

            return ImageFrame(
                data=img_array, width=width, height=height,
                timestamp_ms=int(time.time() * 1000), capture_id=str(uuid.uuid4())[:8],
            )
        except Exception as e:
            logger.warning(f"PrintWindow capture failed: {e}, falling back to MSS")
            return self._capture_with_mss(window)

    def _capture_with_mss(self, window: WindowMeta) -> ImageFrame | None:
        if mss is None:
            logger.error("MSS not available, cannot capture window")
            return None
        try:
            sct = self._get_mss()
            if sct is None:
                return None
            monitor = {
                "left": window.rect.x, "top": window.rect.y,
                "width": window.rect.width, "height": window.rect.height,
            }
            screenshot = sct.grab(monitor)
            img_array = np.array(screenshot)
            if img_array.shape[2] == BGRA_CHANNELS:
                img_array = img_array[:, :, :3]
            img_array = img_array[:, :, ::-1]
            return ImageFrame(
                data=img_array, width=window.rect.width, height=window.rect.height,
                timestamp_ms=int(time.time() * 1000), capture_id=str(uuid.uuid4())[:8],
            )
        except Exception as e:
            logger.error(f"MSS capture failed: {e}")
            return None

    def capture_frame_event(self, window: WindowMeta) -> FrameEvent | None:
        frame = self.capture_window(window)
        if frame is None:
            return None
        return FrameEvent(frame=frame, window_meta=window, capture_id=frame.capture_id)

    def should_capture(self) -> bool:
        current_time = time.time()
        if current_time - self.last_capture_time >= self.interval:
            self.last_capture_time = current_time
            return True
        return False

    def cleanup(self):
        if self._sct:
            self._sct.close()
            self._sct = None


_capture_state: dict[str, WindowCapture | None] = {"instance": None}


def get_capture(fps: float = 1.0) -> WindowCapture:
    instance = _capture_state["instance"]
    if instance is None:
        instance = WindowCapture(fps=fps)
        _capture_state["instance"] = instance
    return instance
