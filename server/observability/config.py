"""Observability 配置类

定义观测功能的配置结构和默认值。
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from util.base_paths import get_user_data_dir
from util.settings import settings


@dataclass
class LocalExporterConfig:
    """本地文件导出器配置"""

    traces_dir: str = "traces/"
    max_files: int = 100
    pretty_print: bool = True


@dataclass
class PhoenixConfig:
    """Phoenix 配置"""

    endpoint: str = "http://localhost:6006"
    project_name: str = "lifetrace-agent"
    export_timeout_sec: float = 2.0
    disable_after_failures: int = 1
    retry_cooldown_sec: float = 60.0


@dataclass
class TerminalConfig:
    """Terminal 输出配置"""

    summary_only: bool = True


@dataclass
class ObservabilityConfig:
    """观测系统配置"""

    enabled: bool = False
    mode: Literal["local", "phoenix", "both"] = "both"
    local: LocalExporterConfig = field(default_factory=LocalExporterConfig)
    phoenix: PhoenixConfig = field(default_factory=PhoenixConfig)
    terminal: TerminalConfig = field(default_factory=TerminalConfig)


def get_observability_config() -> ObservabilityConfig:
    """从 settings 获取观测配置

    Returns:
        ObservabilityConfig: 观测配置对象
    """
    obs_settings = settings.get("observability", {})

    # 如果配置不存在或为空，返回默认配置（禁用状态）
    if not obs_settings:
        return ObservabilityConfig()

    # 解析 local 配置
    local_settings = obs_settings.get("local", {})
    local_config = LocalExporterConfig(
        traces_dir=local_settings.get("traces_dir", "traces/"),
        max_files=local_settings.get("max_files", 100),
        pretty_print=local_settings.get("pretty_print", True),
    )

    # 解析 phoenix 配置
    phoenix_settings = obs_settings.get("phoenix", {})
    phoenix_config = PhoenixConfig(
        endpoint=phoenix_settings.get("endpoint", "http://localhost:6006"),
        project_name=phoenix_settings.get("project_name", "lifetrace-agent"),
        export_timeout_sec=phoenix_settings.get("export_timeout_sec", 2.0),
        disable_after_failures=phoenix_settings.get("disable_after_failures", 1),
        retry_cooldown_sec=phoenix_settings.get("retry_cooldown_sec", 60.0),
    )

    # 解析 terminal 配置
    terminal_settings = obs_settings.get("terminal", {})
    terminal_config = TerminalConfig(
        summary_only=terminal_settings.get("summary_only", True),
    )

    return ObservabilityConfig(
        enabled=obs_settings.get("enabled", False),
        mode=obs_settings.get("mode", "both"),
        local=local_config,
        phoenix=phoenix_config,
        terminal=terminal_config,
    )


def get_traces_directory() -> Path:
    """获取 traces 目录的完整路径

    Returns:
        Path: traces 目录路径
    """
    config = get_observability_config()
    data_dir = get_user_data_dir()
    traces_dir = data_dir / config.local.traces_dir
    traces_dir.mkdir(parents=True, exist_ok=True)
    return traces_dir
