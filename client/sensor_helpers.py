from __future__ import annotations

import hashlib
import re
from urllib.parse import urlparse

import numpy as np

BGRA_CHANNELS = 4

_SELF_WINDOW_PATTERNS_STR = [
    "lifetrace",
    "freetodo",
]

_SELF_WINDOW_PATTERNS_REGEX = [
    re.compile(r"localhost:80\d{2}"),
    re.compile(r"127\.0\.0\.1:80\d{2}"),
    re.compile(r"localhost:30\d{2}"),
    re.compile(r"127\.0\.0\.1:30\d{2}"),
]

_BROWSER_APPS = ["chrome", "msedge", "firefox", "electron"]
_PYTHON_APPS = ["python", "pythonw"]


def is_self_window(app_name: str, window_title: str) -> bool:
    """Check whether the foreground window belongs to FreeTodo/LifeTrace itself."""
    title_lower = (window_title or "").lower()
    if any(pattern in title_lower for pattern in _SELF_WINDOW_PATTERNS_STR):
        return True
    if any(pattern.search(title_lower) for pattern in _SELF_WINDOW_PATTERNS_REGEX):
        return True
    app_lower = (app_name or "").lower()
    if any(app in app_lower for app in _BROWSER_APPS + _PYTHON_APPS) and title_lower:
        if any(pattern in title_lower for pattern in _SELF_WINDOW_PATTERNS_STR):
            return True
        if any(pattern.search(title_lower) for pattern in _SELF_WINDOW_PATTERNS_REGEX):
            return True
    return False


def is_local_center(center_url: str) -> bool:
    """Return True when center endpoint points to local machine."""
    host = (urlparse(center_url).hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"}


def mss_grab_in_thread(logger) -> np.ndarray | None:
    """Capture primary monitor inside the calling thread."""
    import mss  # noqa: PLC0415

    try:
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            shot = sct.grab(monitor)
            arr = np.array(shot)
            if arr.shape[2] == BGRA_CHANNELS:
                arr = arr[:, :, :3]
            return arr[:, :, ::-1].copy()
    except Exception as exc:
        logger.error(f"mss screenshot failed: {exc}")
        return None


def text_hash(text: str) -> str:
    return hashlib.md5(text.encode(), usedforsecurity=False).hexdigest()
