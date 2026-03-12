"""External tool registry for the Agno agent."""

from __future__ import annotations

import importlib
import inspect
from pathlib import Path
from typing import TYPE_CHECKING

from util.logging_config import get_logger

if TYPE_CHECKING:
    from agno.tools import Toolkit

logger = get_logger()

# 可用的外部工具映射
EXTERNAL_TOOLS_REGISTRY: dict[str, type[Toolkit]] = {}


def _try_register_tool(name: str, module_path: str, class_name: str, warning: str = ""):
    """尝试注册单个工具"""
    try:
        module = importlib.import_module(module_path)
        tool_class = getattr(module, class_name)
        EXTERNAL_TOOLS_REGISTRY[name] = tool_class
        logger.debug(f"已注册外部工具: {name}")
    except ImportError:
        logger.warning(warning or f"无法导入 {class_name}")


def _ensure_tool_dependency(tool_name: str, package_name: str) -> bool:
    """检查外部工具依赖是否可用"""
    try:
        importlib.import_module(package_name)
    except ImportError:
        logger.warning(f"{tool_name} 工具依赖 {package_name} 包，未安装，跳过注册")
        return False
    return True


def _register_external_tools():
    """注册可用的外部工具（延迟导入以避免启动时的依赖问题）"""
    if EXTERNAL_TOOLS_REGISTRY:
        return

    # 工具注册配置: (名称, 模块路径, 类名, 警告信息, 依赖包)
    tools_config = [
        # 搜索类工具
        ("websearch", "agno.tools.websearch", "WebSearchTools", "请确保已安装 ddgs 包", "ddgs"),
        ("hackernews", "agno.tools.hackernews", "HackerNewsTools", "", None),
        # 本地工具
        ("file", "agno.tools.file", "FileTools", "", None),
        ("local_fs", "agno.tools.local_file_system", "LocalFileSystemTools", "", None),
        ("shell", "agno.tools.shell", "ShellTools", "", None),
        ("sleep", "agno.tools.sleep", "SleepTools", "", None),
    ]

    for name, module_path, class_name, warning, dependency in tools_config:
        if dependency and not _ensure_tool_dependency(name, dependency):
            continue
        _try_register_tool(name, module_path, class_name, warning)


def get_available_external_tools() -> list[str]:
    """获取可用的外部工具列表"""
    _register_external_tools()
    return list(EXTERNAL_TOOLS_REGISTRY.keys())


def _create_file_tool(tool_class, **kwargs) -> Toolkit | None:
    """创建 FileTools 实例"""
    base_dir = kwargs.get("base_dir")
    if not base_dir:
        logger.warning("FileTools 需要 base_dir 参数，跳过创建")
        return None
    # FileTools 需要 Path 对象，而不是字符串
    base_dir_path = Path(base_dir) if isinstance(base_dir, str) else base_dir
    return tool_class(
        base_dir=base_dir_path,
        enable_save_file=True,
        enable_read_file=True,
        enable_read_file_chunk=True,
        enable_replace_file_chunk=True,
        enable_list_files=True,
        enable_search_files=True,
        enable_delete_file=kwargs.get("enable_delete", False),
    )


def _safe_tool_init(tool_class, **kwargs) -> Toolkit:
    """安全初始化工具，兼容不同版本的构造参数"""
    try:
        return tool_class(**kwargs)
    except TypeError as exc:
        if "unexpected keyword argument" not in str(exc):
            raise
        try:
            sig = inspect.signature(tool_class.__init__)
        except (TypeError, ValueError):
            return tool_class()
        allowed_kwargs = {k: v for k, v in kwargs.items() if k in sig.parameters}
        if not allowed_kwargs:
            return tool_class()
        return tool_class(**allowed_kwargs)


def create_external_tool(tool_name: str, **kwargs) -> Toolkit | None:  # noqa: PLR0911
    """创建外部工具实例

    可用工具:
        搜索类: websearch, hackernews
        本地类: file(需要base_dir), local_fs, shell, sleep
    """
    _register_external_tools()
    tool_class = EXTERNAL_TOOLS_REGISTRY.get(tool_name)
    if not tool_class:
        return None

    base_dir = kwargs.get("base_dir")

    # 搜索类工具
    if tool_name == "websearch":
        return _safe_tool_init(tool_class, backend="auto", search=True, news=True)
    if tool_name in ("hackernews", "sleep"):
        return _safe_tool_init(tool_class)

    # 本地工具
    if tool_name == "file":
        return _create_file_tool(tool_class, **kwargs)
    if tool_name == "local_fs":
        # 确保使用 Path 对象
        base_dir_path = Path(base_dir) if isinstance(base_dir, str) else base_dir
        return (
            _safe_tool_init(tool_class, target_directory=base_dir_path)
            if base_dir
            else _safe_tool_init(tool_class)
        )
    if tool_name == "shell":
        # 确保使用 Path 对象
        base_dir_path = Path(base_dir) if isinstance(base_dir, str) else base_dir
        return (
            _safe_tool_init(tool_class, base_dir=base_dir_path)
            if base_dir
            else _safe_tool_init(tool_class)
        )

    return _safe_tool_init(tool_class)
