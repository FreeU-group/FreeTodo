"""配置服务层 - 处理配置的保存、比对和重载逻辑"""

import os
from typing import Any

import yaml

from lifetrace.llm.llm_client import LLMClient
from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import get_user_config_dir
from lifetrace.util.settings import reload_settings, settings

logger = get_logger()


# LLM 相关配置键（支持两种格式，用于判断是否需要重新初始化 LLM）
LLM_RELATED_BACKEND_KEYS = [
    # 点分隔格式（后端标准）
    "llm.api_key",
    "llm.base_url",
    "llm.model",
    # snake_case 格式（前端 fetcher 转换后发送的格式）
    "llm_api_key",
    "llm_base_url",
    "llm_model",
]

# 任务启用状态配置键到调度器任务ID的映射（支持两种格式）
JOB_ENABLED_CONFIG_TO_JOB_ID = {
    # 点分隔格式（后端标准）
    "jobs.recorder.enabled": "recorder_job",
    "jobs.ocr.enabled": "ocr_job",
    "jobs.task_context_mapper.enabled": "task_context_mapper_job",
    "jobs.task_summary.enabled": "task_summary_job",
    "jobs.clean_data.enabled": "clean_data_job",
    "jobs.activity_aggregator.enabled": "activity_aggregator_job",
    # snake_case 格式（前端 fetcher 转换后发送的格式）
    "jobs_recorder_enabled": "recorder_job",
    "jobs_ocr_enabled": "ocr_job",
    "jobs_task_context_mapper_enabled": "task_context_mapper_job",
    "jobs_task_summary_enabled": "task_summary_job",
    "jobs_clean_data_enabled": "clean_data_job",
    "jobs_activity_aggregator_enabled": "activity_aggregator_job",
}


# 简单前缀映射：prefix -> (prefix_length, dot_prefix)
_SIMPLE_PREFIX_MAP: dict[str, tuple[int, str]] = {
    "llm_": (4, "llm"),
    "server_": (7, "server"),
    "chat_": (5, "chat"),
    "dify_": (5, "dify"),
}

# 复合任务名映射：首部分 -> 完整任务名
_COMPOUND_JOB_NAMES: dict[str, str] = {
    "task": "task_context_mapper",
    "clean": "clean_data",
    "activity": "activity_aggregator",
    "auto": "auto_todo_detection",
}

# 最小 jobs 配置部分数量
_MIN_JOBS_PARTS = 3


def _convert_jobs_key(parts: list[str]) -> str:
    """转换 jobs 相关的配置键"""
    job_name = parts[1]  # recorder, ocr, task_context_mapper, etc.

    # 处理复合任务名
    if job_name in _COMPOUND_JOB_NAMES:
        full_job_name = _COMPOUND_JOB_NAMES[job_name]
        name_parts = full_job_name.split("_")
        name_length = len(name_parts)

        if len(parts) > name_length and parts[1 : name_length + 1] == name_parts:
            remaining = parts[name_length + 1 :]
            if remaining:
                return f"jobs.{full_job_name}.{'.'.join(remaining)}"
            return f"jobs.{full_job_name}"

    # 简单任务名
    remaining = parts[2:]
    if not remaining:
        return f"jobs.{job_name}"

    # 处理 params 子配置
    if remaining[0] == "params" and len(remaining) > 1:
        return f"jobs.{job_name}.params.{'.'.join(remaining[1:])}"
    return f"jobs.{job_name}.{'.'.join(remaining)}"


def snake_to_dot_notation(key: str) -> str:
    """将 snake_case 格式的键转换为点分隔格式

    前端 fetcher 会将 camelCase 转换为 snake_case 发送给后端，
    例如: jobsRecorderEnabled -> jobs_recorder_enabled
    后端配置文件使用点分隔格式，例如: jobs.recorder.enabled

    Args:
        key: snake_case 格式的键，如 "jobs_recorder_enabled" 或 "llm_api_key"

    Returns:
        点分隔格式的键，如 "jobs.recorder.enabled" 或 "llm.api_key"
    """
    # 如果已经是点分隔格式或不包含下划线，直接返回
    if "." in key or "_" not in key:
        return key

    # 处理 jobs 相关配置
    if key.startswith("jobs_"):
        parts = key.split("_")
        if parts[0] == "jobs" and len(parts) >= _MIN_JOBS_PARTS:
            return _convert_jobs_key(parts)

    # 处理简单前缀（llm, server, chat）
    for prefix, (prefix_len, dot_prefix) in _SIMPLE_PREFIX_MAP.items():
        if key.startswith(prefix):
            return f"{dot_prefix}.{key[prefix_len:]}"

    # 默认：简单地将下划线替换为点
    return key.replace("_", ".")


def dot_to_snake_notation(key: str) -> str:
    """将点分隔格式的键转换为 snake_case 格式

    后端配置文件使用点分隔格式，例如: jobs.recorder.enabled
    前端 fetcher 需要 snake_case 格式才能转换为 camelCase，例如: jobs_recorder_enabled

    Args:
        key: 点分隔格式的键，如 "jobs.recorder.enabled" 或 "llm.api_key"

    Returns:
        snake_case 格式的键，如 "jobs_recorder_enabled" 或 "llm_api_key"
    """
    # 如果已经是 snake_case 格式或不包含点，直接返回
    if "." not in key:
        return key

    # 简单地将点替换为下划线
    return key.replace(".", "_")


def is_llm_configured() -> bool:
    """检查 LLM 是否已配置

    Returns:
        bool: 如果 llm_key 和 base_url 都已配置（不是占位符或空），返回 True
    """
    invalid_values = ["", "xxx", "YOUR_API_KEY_HERE", "YOUR_BASE_URL_HERE", "YOUR_LLM_KEY_HERE"]
    return (
        settings.llm.api_key not in invalid_values and settings.llm.base_url not in invalid_values
    )


class ConfigService:
    """配置服务类 - 负责配置的保存、比对和热加载"""

    def __init__(self):
        """初始化配置服务"""
        self._config_path = str(get_user_config_dir() / "config.yaml")

    def compare_config_changes(self, new_settings: dict[str, Any]) -> tuple[bool, list[str]]:
        """比对配置变更

        Args:
            new_settings: 前端提交的配置字典（键可以是 snake_case 或点分隔格式）

        Returns:
            (是否有变更, 变更项列表)
        """
        config_changed = False
        changed_items = []

        for raw_key, new_value in new_settings.items():
            # 将 snake_case 格式转换为点分隔格式
            backend_key = snake_to_dot_notation(raw_key)
            try:
                # 获取当前配置值
                old_value = settings.get(backend_key)

                # 比对新旧值
                if old_value != new_value:
                    config_changed = True
                    # 记录变更项（敏感信息脱敏）
                    if "api_key" in backend_key.lower():
                        changed_items.append(
                            f"{backend_key}: {str(old_value)[:10] if old_value else 'None'}... -> {str(new_value)[:10]}..."
                        )
                    else:
                        changed_items.append(f"{backend_key}: {old_value} -> {new_value}")
            except KeyError:
                # 配置项不存在，视为新增配置
                config_changed = True
                if "api_key" in backend_key.lower():
                    changed_items.append(f"{backend_key}: (新增) {str(new_value)[:10]}...")
                else:
                    changed_items.append(f"{backend_key}: (新增) {new_value}")

        return config_changed, changed_items

    def get_llm_config(self) -> dict[str, Any]:
        """获取当前 LLM 配置

        Returns:
            LLM 配置字典
        """
        return {
            "api_key": settings.llm.api_key,
            "base_url": settings.llm.base_url,
            "model": settings.llm.model,
        }

    def get_config_for_frontend(self) -> dict[str, Any]:
        """获取配置（转换为 snake_case 格式供前端使用）

        前端 fetcher 会将 snake_case 转换为 camelCase。
        后端配置文件使用点分隔格式，需要转换为 snake_case 格式。

        Returns:
            snake_case 格式的配置字典，前端 fetcher 会自动转换为 camelCase
        """
        # 定义需要获取的配置项（后端格式）
        backend_config_keys = [
            # 录制配置
            "jobs.recorder.params.auto_exclude_self",
            "jobs.recorder.params.blacklist.enabled",
            "jobs.recorder.params.blacklist.apps",
            "jobs.recorder.enabled",
            "jobs.recorder.interval",
            "jobs.recorder.params.screens",
            "jobs.recorder.params.deduplicate",
            # LLM配置
            "llm.api_key",
            "llm.base_url",
            "llm.model",
            "llm.temperature",
            "llm.max_tokens",
            # 服务器配置
            "server.host",
            "server.port",
            # Clean data 配置
            "jobs.clean_data.params.max_days",
            "jobs.clean_data.params.max_screenshots",
            # 聊天配置
            "chat.enable_history",
            "chat.history_limit",
            # 自动待办检测配置
            "jobs.auto_todo_detection.enabled",
            # Dify 配置
            "dify.enabled",
            "dify.api_key",
            "dify.base_url",
        ]

        config_dict = {}
        for backend_key in backend_config_keys:
            try:
                value = settings.get(backend_key)
                # 将点分隔格式转换为 snake_case 格式，以便前端 fetcher 能正确转换为 camelCase
                frontend_key = dot_to_snake_notation(backend_key)
                config_dict[frontend_key] = value
            except KeyError:
                # 配置项不存在，跳过或使用默认值
                logger.debug(f"配置项 {backend_key} 不存在，跳过")
                continue

        return config_dict

    def update_config_file(self, new_settings: dict[str, Any], config_path: str) -> None:
        """更新配置文件

        Args:
            new_settings: 配置字典（键可以是 snake_case 或点分隔格式）
            config_path: 配置文件路径
        """
        # 读取现有配置
        with open(config_path, encoding="utf-8") as f:
            current_config = yaml.safe_load(f) or {}

        # 更新配置
        for raw_key, value in new_settings.items():
            # 将 snake_case 格式转换为点分隔格式
            backend_key = snake_to_dot_notation(raw_key)
            logger.info(f"更新配置: {raw_key} -> {backend_key} = {value}")

            # 处理嵌套配置键
            keys = backend_key.split(".")
            current = current_config
            for key in keys[:-1]:
                if key not in current:
                    current[key] = {}
                current = current[key]
            current[keys[-1]] = value

        # 保存配置文件
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(current_config, f, allow_unicode=True, sort_keys=False)

        logger.info(f"配置已保存到: {config_path}")

    def sync_job_states_if_needed(self, new_settings: dict[str, Any]) -> None:
        """如果任务启用状态发生变化，同步到调度器

        Args:
            new_settings: 配置字典（键可以是 snake_case 或点分隔格式）
        """
        # 检测是否有任务启用状态相关的配置项
        # 同时支持 snake_case 和点分隔格式
        job_config_keys = [
            key for key in new_settings.keys() if key in JOB_ENABLED_CONFIG_TO_JOB_ID
        ]

        if not job_config_keys:
            return

        # 延迟导入避免循环依赖
        from lifetrace.jobs.scheduler import get_scheduler_manager

        try:
            scheduler_manager = get_scheduler_manager()

            for config_key in job_config_keys:
                job_id = JOB_ENABLED_CONFIG_TO_JOB_ID[config_key]
                enabled = new_settings[config_key]

                # 获取当前任务状态
                job = scheduler_manager.get_job(job_id)
                if not job:
                    logger.warning(f"任务 {job_id} 不存在，跳过状态同步")
                    continue

                # 判断任务当前是否在运行（next_run_time 为 None 表示已暂停）
                is_running = job.next_run_time is not None

                if enabled and not is_running:
                    # 需要恢复任务
                    scheduler_manager.resume_job(job_id)
                    logger.info(f"📢 配置变更：任务 {job_id} 已恢复运行")
                elif not enabled and is_running:
                    # 需要暂停任务
                    scheduler_manager.pause_job(job_id)
                    logger.info(f"📢 配置变更：任务 {job_id} 已暂停")
                else:
                    logger.debug(
                        f"任务 {job_id} 状态无需变更 (enabled={enabled}, running={is_running})"
                    )

        except Exception as e:
            logger.error(f"同步任务状态失败: {e}", exc_info=True)

    def reinitialize_llm_if_needed(
        self,
        new_settings: dict[str, Any],
        old_llm_config: dict[str, Any],
        is_llm_configured_callback: callable = None,
    ) -> None:
        """如果 LLM 配置发生变化，重新初始化 LLM 客户端

        Args:
            new_settings: 配置字典（键为后端格式）
            old_llm_config: 旧的 LLM 配置
            is_llm_configured_callback: 更新 LLM 配置状态的回调函数
        """
        # 检测是否有 LLM 相关配置项在请求中
        has_llm_keys = any(key in LLM_RELATED_BACKEND_KEYS for key in new_settings.keys())

        if not has_llm_keys:
            return

        # 获取新的 LLM 配置值
        new_llm_config = self.get_llm_config()

        # 比对新旧配置值
        llm_config_changed = old_llm_config != new_llm_config

        if llm_config_changed:
            logger.info("检测到 LLM 配置实际发生变更，正在热加载 LLM 客户端...")
            logger.info(
                f"旧配置: API Key={old_llm_config['api_key'][:10] if old_llm_config['api_key'] else 'None'}..., "
                f"Base URL={old_llm_config['base_url']}, Model={old_llm_config['model']}"
            )
            logger.info(
                f"新配置: API Key={new_llm_config['api_key'][:10] if new_llm_config['api_key'] else 'None'}..., "
                f"Base URL={new_llm_config['base_url']}, Model={new_llm_config['model']}"
            )

            try:
                # 更新配置状态
                if is_llm_configured_callback:
                    is_llm_configured_callback()

                configured = is_llm_configured()
                status = "已配置" if configured else "未配置"
                logger.info(f"LLM 配置状态已更新: {status}")

                # 重新初始化 LLM 客户端单例（所有服务共享此实例）
                llm_client = LLMClient()
                client_available = llm_client.reinitialize()
                logger.info(f"LLM 客户端已重新初始化 - 可用: {client_available}")

                if client_available:
                    logger.info(
                        f"LLM 客户端热加载成功 - "
                        f"API Key: {llm_client.api_key[:10]}..., "
                        f"Model: {llm_client.model}"
                    )
                    logger.info("所有服务将自动使用更新后的 LLM 客户端")
                else:
                    logger.warning("LLM 客户端重新初始化后不可用，请检查配置")

                logger.info("LLM 配置热加载完成")
            except Exception as e:
                logger.error(f"热加载 LLM 客户端失败: {e}", exc_info=True)
        else:
            logger.info("LLM 配置未发生实际变更，跳过重新加载")

    def save_config(
        self,
        new_settings: dict[str, Any],
        is_llm_configured_callback: callable = None,
    ) -> dict[str, Any]:
        """保存配置（主入口方法）

        Args:
            new_settings: 配置字典（键为后端格式）
            is_llm_configured_callback: 更新 LLM 配置状态的回调函数

        Returns:
            操作结果字典
        """
        config_path = self._config_path

        # 如果配置文件不存在，从默认配置复制
        if not os.path.exists(config_path):
            self._init_config_file()

        # 1. 先比对配置是否真的发生了变化
        config_changed, changed_items = self.compare_config_changes(new_settings)

        # 如果配置没有发生变化，直接返回
        if not config_changed:
            logger.info("配置未发生变化，跳过保存和重载")
            return {"success": True, "message": "配置未发生变化"}

        # 记录变更信息
        logger.info(f"检测到配置变更，共 {len(changed_items)} 项:")
        for item in changed_items:
            logger.info(f"  - {item}")

        # 2. 保存旧的 LLM 配置值（用于后续比对 LLM 是否需要重新初始化）
        old_llm_config = self.get_llm_config()

        # 3. 更新配置文件
        self.update_config_file(new_settings, config_path)

        # 4. 重新加载配置（使用封装函数，正确处理返回值）
        reload_success = reload_settings()
        if reload_success:
            logger.info("配置已重新加载到内存")
        else:
            logger.warning("配置重新加载失败，但文件已保存")

        # 5. 同步任务状态到调度器（在配置重载后执行，确保使用最新的配置值）
        self.sync_job_states_if_needed(new_settings)

        # 6. 如果需要，重新初始化 LLM 客户端
        self.reinitialize_llm_if_needed(new_settings, old_llm_config, is_llm_configured_callback)

        return {"success": True, "message": "配置保存成功"}

    def _init_config_file(self) -> None:
        """从默认配置初始化配置文件"""
        import shutil

        from lifetrace.util.path_utils import get_config_dir

        default_config_path = get_config_dir() / "default_config.yaml"

        if not default_config_path.exists():
            raise FileNotFoundError(
                f"默认配置文件不存在: {default_config_path}\n"
                "请确保 default_config.yaml 文件存在于 config 目录中"
            )

        os.makedirs(os.path.dirname(self._config_path), exist_ok=True)
        shutil.copy2(default_config_path, self._config_path)
        reload_settings()
