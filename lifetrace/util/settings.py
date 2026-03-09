"""
Dynaconf 配置模块 - 支持热加载的配置管理

使用 Dynaconf 替代自定义配置类，提供：
- 配置文件热加载 (reload)
- 环境变量覆盖 (LIFETRACE__ 前缀)
- 多配置文件合并
- 配置验证
"""

import shutil
from pathlib import Path

from dynaconf import Dynaconf, Validator

from lifetrace.util.base_paths import get_config_dir, get_user_config_dir


def _get_config_dir() -> Path:
    """获取配置目录"""
    return get_user_config_dir()


def _get_default_config_dir() -> Path:
    """获取内置默认配置目录"""
    return get_config_dir()


def _init_config_files() -> list[str]:
    """初始化并返回配置文件列表

    确保用户配置目录存在，如果 config.yaml 不存在则从默认配置复制。
    返回按加载顺序排列的配置文件路径列表。
    """
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
    # 环境变量前缀：LIFETRACE_LLM__API_KEY -> llm.api_key（前缀后单下划线，嵌套用双下划线）
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
        Validator("server.port", default=8001, is_type_of=int),
        Validator("server.debug", default=False, is_type_of=bool),
        # 基础目录配置
        Validator("base_dir", default="data"),
        Validator("database_path", default="lifetrace.db"),
        Validator("screenshots_dir", default="screenshots/"),
        Validator("attachments_dir", default="attachments/"),
        # 日志配置
        Validator("logging.level", default="INFO"),
        Validator("logging.log_path", default="logs/"),
        Validator("logging.console_level", default="INFO"),
        Validator("logging.file_level", default="INFO"),
        Validator("logging.quiet_modules", default=[], is_type_of=list),
        # 调度器配置
        Validator("scheduler.enabled", default=True, is_type_of=bool),
        Validator("scheduler.database_path", default="scheduler.db"),
        Validator("scheduler.max_workers", default=10, is_type_of=int),
        Validator("scheduler.coalesce", default=True, is_type_of=bool),
        Validator("scheduler.max_instances", default=1, is_type_of=int),
        Validator("scheduler.misfire_grace_time", default=60, is_type_of=int),
        Validator("scheduler.timezone", default="Asia/Shanghai"),
        # 向量数据库配置
        Validator("vector_db.enabled", default=True, is_type_of=bool),
        Validator("vector_db.collection_name", default="lifetrace_ocr"),
        Validator("vector_db.persist_directory", default="vector_db"),
        # 聊天配置
        Validator("chat.enable_history", default=True, is_type_of=bool),
        Validator("chat.history_limit", default=10, is_type_of=int),
        # Agno Learning 配置
        Validator("agno.learning.enabled", default=True, is_type_of=bool),
        Validator("agno.learning.mode", default="always"),
        Validator("agno.learning.db_path", default="agno/learning.db"),
        Validator("agno.learning.add_history_to_context", default=False, is_type_of=bool),
        Validator("agno.user_id", default="local-user"),
        Validator("agno.default_workspace", default="/workspace"),
        # AgentOS 配置
        Validator("agno.agent_os.enabled", default=True, is_type_of=bool),
        Validator("agno.agent_os.host", default="127.0.0.1"),
        Validator("agno.agent_os.port", default=None),
        Validator(
            "agno.agent_os.port_range",
            default={"min": 8200, "max": 8299},
        ),
        Validator("agno.agent_os.port_file", default="agent_os_port.json"),
        Validator("agno.agent_os.base_url", default=""),
        Validator("agno.agent_os.agent_id", default="freetodo-agent"),
        Validator("agno.agent_os.agent_name", default="FreeTodo Agent"),
        Validator("agno.agent_os.lang", default="en"),
        Validator("agno.agent_os.timeout_sec", default=60.0),
        Validator("agno.agent_os.selected_tools", default=[], is_type_of=list),
        Validator("agno.agent_os.external_tools", default=[], is_type_of=list),
        Validator("agno.agent_os.external_tools_config", default={}, is_type_of=dict),
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
        # 音频配置
        Validator("audio.is_24x7", default=False, is_type_of=bool),
        Validator("audio.asr.api_key", default="YOUR_LLM_KEY_HERE"),
        Validator(
            "audio.asr.base_url", default="wss://dashscope.aliyuncs.com/api-ws/v1/inference/"
        ),
        Validator("audio.asr.model", default="fun-asr-realtime"),
        Validator("audio.asr.sample_rate", default=16000, is_type_of=int),
        Validator("audio.asr.format", default="pcm"),
        Validator("audio.asr.semantic_punctuation_enabled", default=False, is_type_of=bool),
        Validator("audio.asr.max_sentence_silence", default=1300, is_type_of=int),
        Validator("audio.asr.heartbeat", default=False, is_type_of=bool),
        Validator("audio.storage.audio_dir", default="audio/"),
        Validator("audio.storage.temp_audio_dir", default="temp_audio/"),
        # 后端模块启用配置
        Validator("backend_modules.enabled", default=[], is_type_of=list),
        Validator("backend_modules.disabled", default=[], is_type_of=list),
        Validator("backend_modules.unavailable", default=[], is_type_of=list),
        # 感知流配置（Perception Stream）
        Validator("perception.enabled", default=True, is_type_of=bool),
        Validator("perception.window_seconds", default=300, is_type_of=int),
        Validator("perception.max_pending_events", default=1000, is_type_of=int),
        Validator("perception.status_online_window_seconds", default=60, is_type_of=int),
        Validator("perception.audio_enabled", default=True, is_type_of=bool),
        Validator("perception.audio_source", default="mic_pc"),
        Validator("perception.ocr_enabled", default=False, is_type_of=bool),
        Validator("perception.input_enabled", default=False, is_type_of=bool),
        Validator("perception.todo_intent.enabled", default=True, is_type_of=bool),
        Validator("perception.todo_intent.mode", default="draft"),
        Validator("perception.todo_intent.window_seconds", default=20, is_type_of=int),
        Validator("perception.todo_intent.max_context_chars", default=5000, is_type_of=int),
        Validator("perception.todo_intent.max_todos_per_context", default=5, is_type_of=int),
        Validator("perception.todo_intent.internal_queue_maxsize", default=200, is_type_of=int),
        Validator("perception.todo_intent.processing_workers", default=2, is_type_of=int),
        Validator("perception.todo_intent.processing_queue_maxsize", default=200, is_type_of=int),
        Validator("perception.todo_intent.pre_gate_dedupe.enabled", default=True, is_type_of=bool),
        Validator(
            "perception.todo_intent.pre_gate_dedupe.exact_window_seconds",
            default=90,
            is_type_of=int,
        ),
        Validator(
            "perception.todo_intent.pre_gate_dedupe.max_cache_size",
            default=5000,
            is_type_of=int,
        ),
        Validator("perception.todo_intent.gate.enabled", default=True, is_type_of=bool),
        Validator("perception.todo_intent.gate.model", default="qwen-turbo"),
        Validator("perception.todo_intent.gate.temperature", default=0.0),
        Validator("perception.todo_intent.gate.max_tokens", default=160, is_type_of=int),
        Validator("perception.todo_intent.gate.min_text_length", default=8, is_type_of=int),
        Validator("perception.todo_intent.extractor.model", default=""),
        Validator("perception.todo_intent.extractor.temperature", default=0.2),
        Validator("perception.todo_intent.extractor.max_tokens", default=800, is_type_of=int),
        Validator(
            "perception.todo_intent.integration.post_extract_dedupe_window_seconds",
            default=600,
            is_type_of=int,
        ),
        Validator(
            "perception.todo_intent.integration.create_confidence_threshold",
            default=0.7,
        ),
        Validator(
            "perception.todo_intent.integration.update_confidence_threshold",
            default=0.75,
        ),
        Validator(
            "perception.todo_intent.integration.update_time_tolerance_seconds",
            default=7200,
            is_type_of=int,
        ),
        Validator(
            "perception.todo_intent.integration.lookup_limit",
            default=500,
            is_type_of=int,
        ),
        # Memory 模块配置
        Validator("memory.enabled", default=True, is_type_of=bool),
        Validator("memory.auto_compress", default=True, is_type_of=bool),
        Validator("memory.dedup.model", default="qwen-flash"),
        Validator("memory.dedup.temperature", default=0.0),
        Validator("memory.dedup.max_tokens", default=100, is_type_of=int),
        Validator("memory.dedup.window_seconds", default=10.0),
        Validator("memory.dedup.window_max_items", default=10, is_type_of=int),
        Validator("memory.compress_interval_seconds", default=300, is_type_of=int),
        Validator("memory.task_linker.model", default="qwen-flash"),
        Validator("memory.profile.model", default=""),
        Validator("memory.profile.interval_seconds", default=3600, is_type_of=int),
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
