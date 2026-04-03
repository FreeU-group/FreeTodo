"""基础路径工具模块"""

from __future__ import annotations

import os
import sys
from pathlib import Path


def get_app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def get_internal_root() -> Path:
    app_root = get_app_root()
    if getattr(sys, "frozen", False):
        internal = app_root / "_internal"
        if internal.exists():
            return internal
    return app_root


def get_config_dir() -> Path:
    return get_app_root() / "config"


def get_data_directory() -> Path | None:
    data_dir = os.environ.get("FREETODO_CLIENT_DATA_DIR") or os.environ.get("LIFETRACE_DATA_DIR")
    if data_dir:
        return Path(data_dir).resolve()
    return None


def get_user_config_dir() -> Path:
    data_dir = get_data_directory()
    if data_dir:
        return data_dir / "config"
    return get_config_dir()


def get_user_data_dir() -> Path:
    data_dir = get_data_directory()
    if data_dir:
        return data_dir / "data"
    return get_app_root() / "data"


def get_user_logs_dir() -> Path:
    data_dir = get_data_directory()
    if data_dir:
        return data_dir / "logs"
    return get_app_root() / "logs"
