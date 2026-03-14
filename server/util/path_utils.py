"""
统一的路径工具模块
提供兼容开发环境和 PyInstaller 打包环境的路径获取函数
"""

from __future__ import annotations

import os
from pathlib import Path

from util import base_paths
from util.settings import settings

# ============================================================
# 基于配置的路径计算函数
# ============================================================


def get_database_path() -> Path:
    """获取数据库路径（基于配置和数据目录）

    Returns:
        Path: 数据库文件的绝对路径
    """
    db_path = settings.database_path
    if not os.path.isabs(db_path):
        return base_paths.get_user_data_dir() / db_path
    return Path(db_path)


def get_screenshots_dir() -> Path:
    """获取截图目录

    Returns:
        Path: 截图目录的绝对路径
    """
    screenshots_dir = settings.screenshots_dir
    if not os.path.isabs(screenshots_dir):
        return base_paths.get_user_data_dir() / screenshots_dir
    return Path(screenshots_dir)


def get_attachments_dir() -> Path:
    """获取附件目录

    Returns:
        Path: 附件目录的绝对路径
    """
    attachments_dir = settings.attachments_dir
    if not os.path.isabs(attachments_dir):
        return base_paths.get_user_data_dir() / attachments_dir
    return Path(attachments_dir)


def get_scheduler_database_path() -> Path:
    """获取调度器数据库路径

    Returns:
        Path: 调度器数据库文件的绝对路径
    """
    db_path = settings.scheduler.database_path
    if not os.path.isabs(db_path):
        return base_paths.get_user_data_dir() / db_path
    return Path(db_path)


def get_vector_db_dir() -> Path:
    """获取向量数据库目录

    Returns:
        Path: 向量数据库目录的绝对路径
    """
    persist_dir = settings.vector_db.persist_directory
    if not os.path.isabs(persist_dir):
        return base_paths.get_user_data_dir() / persist_dir
    return Path(persist_dir)


def get_agno_learning_db_path() -> Path:
    """获取 Agno Learning 数据库路径

    Returns:
        Path: Agno Learning 数据库文件的绝对路径
    """
    db_path = settings.agno.learning.db_path
    if not os.path.isabs(db_path):
        return base_paths.get_user_data_dir() / db_path
    return Path(db_path)


def get_agno_tracing_db_path() -> Path:
    """获取 Agno Tracing 数据库路径

    Returns:
        Path: Agno Tracing 数据库文件的绝对路径
    """
    db_path = settings.agno.tracing.db_path
    if not os.path.isabs(db_path):
        return base_paths.get_user_data_dir() / db_path
    return Path(db_path)


def get_log_dir() -> Path:
    """获取日志目录（替代原有 log_path 属性）

    Returns:
        Path: 日志目录的绝对路径
    """
    return base_paths.get_user_logs_dir()


# ============================================================
# 兼容旧 API 的基础路径函数（转发到 base_paths）
# ============================================================


def get_app_root() -> Path:
    """获取应用程序根目录。"""
    return base_paths.get_app_root()


def get_config_dir() -> Path:
    """获取内置配置目录。"""
    return base_paths.get_config_dir()


def get_models_dir() -> Path:
    """获取内置模型目录。"""
    return base_paths.get_models_dir()


def get_user_config_dir() -> Path:
    """获取用户配置目录。"""
    return base_paths.get_user_config_dir()
