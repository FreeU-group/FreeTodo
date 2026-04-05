"""
基础路径工具模块
提供不依赖运行时配置的路径获取函数。

Profile 感知：get_user_data_dir() 根据 active Profile 返回对应的
profiles/{profile_id}/ 子目录，使下游所有路径函数自动指向正确的 Profile 空间。
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_active_profile_id_cache: str | None = None
_profile_cache_loaded: bool = False


def get_app_root() -> Path:
    """
    获取应用程序根目录，兼容开发环境 + PyInstaller 打包环境。

    - 开发环境：返回 server 包所在的项目根（server/）
    - 打包环境：返回可执行文件所在目录（backend/，与 _internal 同级别）

    Returns:
        Path: 应用程序根目录路径
    """
    # PyInstaller 冻结环境
    if getattr(sys, "frozen", False):
        # one-folder 模式：EXE 在 backend/lifetrace，内部依赖在 backend/_internal
        # 返回 backend/ 目录（可执行文件的父目录）
        exe_dir = Path(sys.executable).resolve().parent
        return exe_dir

    # 开发环境：当前文件在 server/util/path_utils.py
    # 返回 server/ 目录
    return Path(__file__).resolve().parent.parent


def get_internal_root() -> Path:
    """
    获取 PyInstaller 打包后的内部资源根目录（_internal），
    开发环境下则退化为 app_root。

    Returns:
        Path: 内部资源根目录路径
    """
    app_root = get_app_root()
    if getattr(sys, "frozen", False):
        # 打包结构：backend/
        #   - lifetrace        (可执行文件)
        #   - _internal/       (所有依赖和 data)
        internal = app_root / "_internal"
        if internal.exists():
            return internal
    return app_root


def get_config_dir() -> Path:
    """
    获取内置配置所在目录（default_config.yaml, prompt.yaml, rapidocr_config.yaml 等）。

    - 开发环境：server/config/
    - 打包环境：backend/config/（与 _internal 同级别，不在 _internal 内）

    Returns:
        Path: 配置目录路径
    """
    return get_app_root() / "config"


def get_models_dir() -> Path:
    """
    获取内置模型目录（ONNX 等）。

    - 开发环境：server/models/
    - 打包环境：backend/models/（与 _internal 同级别，不在 _internal 内）

    Returns:
        Path: 模型目录路径
    """
    return get_app_root() / "models"


def get_data_directory() -> Path | None:
    """
    获取用户数据目录路径（从环境变量）。

    如果设置了 LIFETRACE_DATA_DIR，返回该路径；
    否则返回 None（表示使用应用目录）。

    Returns:
        Path | None: 用户数据目录路径，如果未设置则返回 None
    """
    data_dir = os.environ.get("LIFETRACE_DATA_DIR")
    if data_dir:
        return Path(data_dir).resolve()
    return None


def get_user_config_dir() -> Path:
    """
    获取用户配置目录（数据目录下的 config）。

    如果设置了 LIFETRACE_DATA_DIR，返回 {data_dir}/config/；
    否则返回应用目录下的 config/。

    Returns:
        Path: 用户配置目录路径
    """
    data_dir = get_data_directory()
    if data_dir:
        return data_dir / "config"
    return get_config_dir()


def _get_data_root() -> Path:
    """获取数据根目录（profiles.json 所在的目录）"""
    data_dir = get_data_directory()
    if data_dir:
        return data_dir / "data"
    return get_app_root() / "data"


def _get_active_profile_id() -> str | None:
    """从 profiles.json 读取 active_profile_id，结果缓存到模块变量。"""
    global _active_profile_id_cache, _profile_cache_loaded  # noqa: PLW0603
    if _profile_cache_loaded:
        return _active_profile_id_cache

    _profile_cache_loaded = True
    profiles_path = _get_data_root() / "profiles.json"
    if not profiles_path.exists():
        _active_profile_id_cache = None
        return None

    try:
        raw = json.loads(profiles_path.read_text(encoding="utf-8"))
        _active_profile_id_cache = raw.get("active_profile_id")
    except Exception:
        _active_profile_id_cache = None
    return _active_profile_id_cache


def invalidate_profile_cache() -> None:
    """清除 Profile ID 缓存，下次调用 get_user_data_dir 时重新读取。"""
    global _active_profile_id_cache, _profile_cache_loaded  # noqa: PLW0603
    _active_profile_id_cache = None
    _profile_cache_loaded = False


def set_active_profile_id(profile_id: str | None) -> None:
    """直接设置缓存中的 active profile id（用于 server 启动阶段）。"""
    global _active_profile_id_cache, _profile_cache_loaded  # noqa: PLW0603
    _active_profile_id_cache = profile_id
    _profile_cache_loaded = True


def get_user_data_dir() -> Path:
    """
    获取当前 Profile 的数据目录。

    如果存在 active Profile，返回 {data_root}/profiles/{profile_id}/；
    否则回退到 {data_root}/（兼容无 Profile 的旧布局）。

    Returns:
        Path: 用户数据目录路径
    """
    root = _get_data_root()
    profile_id = _get_active_profile_id()
    if profile_id:
        return root / "profiles" / profile_id
    return root


def get_user_logs_dir() -> Path:
    """
    获取用户日志目录（数据目录下的 logs）。

    如果设置了 LIFETRACE_DATA_DIR，返回 {data_dir}/logs/；
    否则返回应用目录下的 logs/。

    Returns:
        Path: 用户日志目录路径
    """
    data_dir = get_data_directory()
    if data_dir:
        return data_dir / "logs"
    return get_app_root() / "logs"
