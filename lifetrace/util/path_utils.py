"""
统一的路径工具模块
提供兼容开发环境和 PyInstaller 打包环境的路径获取函数
"""

import os
import sys
from pathlib import Path


def get_app_root() -> Path:
    """
    获取应用程序根目录，兼容开发环境 + PyInstaller 打包环境。

    - 开发环境：返回 lifetrace 包所在的项目根（lifetrace/）
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

    # 开发环境：当前文件在 lifetrace/util/path_utils.py
    # 返回 lifetrace/ 目录
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

    - 开发环境：lifetrace/config/
    - 打包环境：backend/config/（与 _internal 同级别，不在 _internal 内）

    Returns:
        Path: 配置目录路径
    """
    return get_app_root() / "config"


def get_models_dir() -> Path:
    """
    获取内置模型目录（ONNX 等）。

    - 开发环境：lifetrace/models/
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


def get_user_data_dir() -> Path:
    """
    获取用户数据目录（数据目录下的 data）。

    如果设置了 LIFETRACE_DATA_DIR，返回 {data_dir}/data/；
    否则返回应用目录下的 data/。

    Returns:
        Path: 用户数据目录路径
    """
    data_dir = get_data_directory()
    if data_dir:
        return data_dir / "data"
    return get_app_root() / "data"


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
