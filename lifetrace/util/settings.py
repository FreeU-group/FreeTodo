"""
Dynaconf 配置模块 - 支持热加载的配置管理

使用 Dynaconf 替代自定义配置类，提供：
- 配置文件热加载 (reload)
- 环境变量覆盖 (LIFETRACE__ 前缀)
- 多配置文件合并
- 配置验证
"""

from pathlib import Path

from dynaconf import Dynaconf, Validator


def _get_config_dir() -> Path:
    """获取配置目录"""
    from lifetrace.util.path_utils import get_user_config_dir

    return get_user_config_dir()


def _get_default_config_dir() -> Path:
    """获取内置默认配置目录"""
    from lifetrace.util.path_utils import get_config_dir

    return get_config_dir()


def _init_config_files() -> list[str]:
    """初始化并返回配置文件列表

    确保用户配置目录存在，如果 config.yaml 不存在则从默认配置复制。
    返回按加载顺序排列的配置文件路径列表。
    """
    import shutil

    user_config_dir = _get_config_dir()
    default_config_dir = _get_default_config_dir()

    # 确保用户配置目录存在
    user_config_dir.mkdir(parents=True, exist_ok=True)

    # 默认配置文件路径
    default_config_path = default_config_dir / "default_config.yaml"
    user_default_config_path = user_config_dir / "default_config.yaml"
    user_config_path = user_config_dir / "config.yaml"

    # 如果用户目录没有 default_config.yaml，从内置配置复制
    if not user_default_config_path.exists() and default_config_path.exists():
        shutil.copy2(default_config_path, user_default_config_path)

    # 如果用户目录没有 config.yaml，从 default_config.yaml 复制
    if not user_config_path.exists():
        source = (
            user_default_config_path if user_default_config_path.exists() else default_config_path
        )
        if source.exists():
            shutil.copy2(source, user_config_path)

    # 构建配置文件列表（按加载顺序：默认配置 -> 用户配置）
    settings_files = []

    # 首先加载默认配置
    if user_default_config_path.exists():
        settings_files.append(str(user_default_config_path))
    elif default_config_path.exists():
        settings_files.append(str(default_config_path))

    # 然后加载用户配置（覆盖默认值）
    if user_config_path.exists():
        settings_files.append(str(user_config_path))

    return settings_files


# 初始化配置文件并获取路径列表
_settings_files = _init_config_files()

# Dynaconf 实例
settings = Dynaconf(
    # 配置文件（按顺序加载，后面的覆盖前面的）
    settings_files=_settings_files,
    # 环境变量前缀：LIFETRACE__LLM__API_KEY -> llm.api_key
    envvar_prefix="LIFETRACE",
    # 嵌套分隔符：双下划线
    nested_separator="__",
    # 启用配置合并（字典会合并而非覆盖）
    merge_enabled=True,
    # 加载 .env 文件
    load_dotenv=True,
    # 允许小写访问
    lowercase_read=True,
    # 验证器
    validators=[
        # 服务器配置
        Validator("server.host", default="127.0.0.1"),
        Validator("server.port", default=8000, is_type_of=int),
        Validator("server.debug", default=False, is_type_of=bool),
        # 基础目录配置
        Validator("base_dir", default="data"),
        Validator("database_path", default="lifetrace.db"),
        Validator("screenshots_dir", default="screenshots/"),
        # 日志配置
        Validator("logging.level", default="INFO"),
        Validator("logging.log_path", default="logs/"),
        # 调度器配置
        Validator("scheduler.enabled", default=True, is_type_of=bool),
        Validator("scheduler.database_path", default="scheduler.db"),
        # 向量数据库配置
        Validator("vector_db.enabled", default=True, is_type_of=bool),
        Validator("vector_db.collection_name", default="lifetrace_ocr"),
        Validator("vector_db.persist_directory", default="vector_db"),
        # 聊天配置
        Validator("chat.enable_history", default=True, is_type_of=bool),
        Validator("chat.history_limit", default=10, is_type_of=int),
        # LLM 配置（关键配置，启动时不强制要求，运行时检查）
        Validator("llm.api_key", default="YOUR_LLM_KEY_HERE"),
        Validator("llm.base_url", default="https://dashscope.aliyuncs.com/compatible-mode/v1"),
        Validator("llm.model", default="qwen-plus"),
        Validator("llm.vision_model", default="qwen3-vl-plus"),
        Validator("llm.temperature", default=0.7),
        Validator("llm.max_tokens", default=2048, is_type_of=int),
        # Tavily 配置（联网搜索）
        Validator("tavily.api_key", default="YOUR_TAVILY_API_KEY_HERE"),
        Validator("tavily.search_depth", default="basic"),
        Validator("tavily.max_results", default=5, is_type_of=int),
        Validator("tavily.include_domains", default=[]),
        Validator("tavily.exclude_domains", default=[]),
    ],
)


def get_settings() -> Dynaconf:
    """获取 Dynaconf settings 实例"""
    return settings


def reload_settings() -> bool:
    """重新加载配置文件

    Returns:
        bool: 是否成功重载
    """
    try:
        settings.reload()
        return True
    except Exception:
        return False
