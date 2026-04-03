"""配置服务层 - 处理配置的保存、比对和重载逻辑"""

import os
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

import yaml

from core.config_watcher import reload_with_callbacks
from jobs.scheduler import get_scheduler_manager
from llm.llm_client import LLMClient
from services.asr_client import ASRClient
from services.config_service_helpers import (
    ASR_RELATED_BACKEND_KEYS,
    DIARY_ILLUSTRATION_RUNTIME_KEYS,
    JOB_ENABLED_CONFIG_TO_JOB_ID,
    JOB_LINKED_CONFIG,
    LLM_RELATED_BACKEND_KEYS,
    SENSITIVE_CONFIG_KEYS,
    dot_to_snake_notation,
    is_llm_configured,
    is_masked_api_key,
    mask_api_key,
    snake_to_dot_notation,
)
from services.diary_illustration_service import sync_diary_illustration_job
from util.base_paths import get_app_root, get_config_dir, get_user_config_dir
from util.logging_config import get_logger
from util.settings import reload_settings, settings

logger = get_logger()


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
            logger.info(f"[compare] 键转换: {raw_key} -> {backend_key}")
            try:
                # 获取当前配置值（Dynaconf 合并 config.yaml + .env 后的值）
                old_value = settings.get(backend_key)
                logger.info(
                    f"[compare] {backend_key}: old_type={type(old_value).__name__}, "
                    f"new_type={type(new_value).__name__}, "
                    f"old={str(old_value)[:20] if 'api_key' in backend_key.lower() else old_value}, "
                    f"new={str(new_value)[:20] if 'api_key' in backend_key.lower() else new_value}, "
                    f"equal={old_value == new_value}"
                )

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
                logger.info(f"[compare] {backend_key}: 配置项不存在（KeyError），视为新增")
                if "api_key" in backend_key.lower():
                    changed_items.append(f"{backend_key}: (新增) {str(new_value)[:10]}...")
                else:
                    changed_items.append(f"{backend_key}: (新增) {new_value}")

        logger.info(
            f"[compare] 比对结果: config_changed={config_changed}, 变更项数={len(changed_items)}"
        )
        return config_changed, changed_items

    def get_llm_config(self) -> dict[str, Any]:
        """获取当前 LLM 配置

        Returns:
            LLM 配置字典
        """
        return {
            "api_key": settings.get("llm.api_key"),
            "base_url": settings.get("llm.base_url"),
            "model": settings.get("llm.model"),
            "small_model": settings.get("llm.small_model"),
        }

    def get_asr_config(self) -> dict[str, Any]:
        """获取当前 ASR 配置

        Returns:
            ASR 配置字典
        """
        try:
            return {
                "api_key": settings.audio.asr.api_key,
                "base_url": settings.audio.asr.base_url,
                "model": settings.audio.asr.model,
            }
        except Exception:
            return {
                "api_key": None,
                "base_url": None,
                "model": None,
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
            "llm.small_model",
            "llm.temperature",
            "llm.max_tokens",
            "llm.chat_model",
            "llm.agent.api_key",
            "llm.agent.base_url",
            "llm.agent.model",
            "perception.todo_intent.agent.model",
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
            "jobs.auto_todo_detection.params.whitelist.apps",
            # Tavily 配置（联网搜索）
            "tavily.api_key",
            # 音频录制配置
            "audio.is_24x7",
            # 音频录制任务配置
            "jobs.audio_recording.enabled",
            "jobs.audio_recording.interval",
            # 音频识别（ASR）配置
            "audio.asr.api_key",
            "audio.asr.base_url",
            "audio.asr.model",
            "audio.asr.sample_rate",
            "audio.asr.format",
            "audio.asr.semantic_punctuation_enabled",
            "audio.asr.max_sentence_silence",
            "audio.asr.heartbeat",
            # 感知节点配置
            "sensor.screenshot_enabled",
            "sensor.screenshot_interval",
            "sensor.proactive_ocr_enabled",
            "sensor.proactive_ocr_interval",
            "sensor.audio_enabled",
            "sensor.audio_loopback_enabled",
            # Diary illustration
            "banna2.api_key",
            "banna2.ref_image_path",
            "volcengine.api_key",
            "volcengine.base_url",
            "volcengine.image_model",
            "volcengine.image_size",
            "jobs.diary_illustration.enabled",
            "jobs.diary_illustration.cron",
            "jobs.diary_illustration.provider",
            # Identity / setup
            "setup.user_name",
            "setup.agent_name",
            "setup.scan_directories",
            "agno.default_workspace",
            # Intent recognition source toggles
            "perception.todo_intent.sources.mic_pc",
            "perception.todo_intent.sources.mic_hardware",
            "perception.todo_intent.sources.speaker_pc",
            "perception.todo_intent.sources.ocr_screen",
            "perception.todo_intent.sources.ocr_proactive",
        ]

        config_dict = {}
        for backend_key in backend_config_keys:
            try:
                value = settings.get(backend_key)
                frontend_key = dot_to_snake_notation(backend_key)
                if backend_key in SENSITIVE_CONFIG_KEYS:
                    value = mask_api_key(value)
                config_dict[frontend_key] = value
            except KeyError:
                logger.debug(f"配置项 {backend_key} 不存在，跳过")
                continue

        return config_dict

    @staticmethod
    def _dot_key_to_env_var(dot_key: str) -> str:
        """将点分隔配置键转换为 LIFETRACE 环境变量名

        例如: 'llm.api_key' -> 'LIFETRACE_LLM__API_KEY'
        """
        parts = dot_key.split(".")
        env_suffix = "__".join(part.upper() for part in parts)
        return f"LIFETRACE_{env_suffix}"

    @staticmethod
    def _get_env_file_path() -> Path:
        """获取 .env 文件路径"""
        return get_app_root() / ".env"

    def _format_env_value(self, value: Any) -> str:
        """将配置值格式化为 .env 文件中的字符串"""
        if isinstance(value, bool):
            return "true" if value else "false"
        return str(value)

    def update_env_file(self, new_settings: dict[str, Any]) -> None:
        """将变更的配置同步写回 .env 文件

        仅更新 .env 中已有的环境变量，不会新增条目。
        同时更新 os.environ，确保 Dynaconf reload 后不会用旧值覆盖。

        Args:
            new_settings: 配置字典（键可以是 snake_case 或点分隔格式）
        """
        env_path = self._get_env_file_path()
        logger.info(f"[update_env] .env 路径: {env_path}, 存在: {env_path.exists()}")
        if not env_path.exists():
            logger.info(f"[update_env] .env 文件不存在，跳过同步: {env_path}")
            return

        env_updates: dict[str, str] = {}
        for raw_key, value in new_settings.items():
            backend_key = snake_to_dot_notation(raw_key)
            env_var = self._dot_key_to_env_var(backend_key)
            env_updates[env_var] = self._format_env_value(value)
            logger.info(f"[update_env] 映射: {raw_key} -> {backend_key} -> {env_var}")

        lines = env_path.read_text(encoding="utf-8").splitlines()
        logger.info(
            f"[update_env] .env 文件共 {len(lines)} 行，待匹配环境变量: {list(env_updates.keys())}"
        )
        updated_lines = []
        synced_vars = []

        for line in lines:
            stripped = line.strip()
            if stripped and not stripped.startswith("#") and "=" in stripped:
                var_name = stripped.split("=", 1)[0].strip()
                if var_name in env_updates:
                    updated_lines.append(f"{var_name}={env_updates[var_name]}")
                    os.environ[var_name] = env_updates[var_name]
                    synced_vars.append(var_name)
                    logger.info(f"[update_env] 匹配到 .env 变量: {var_name}，已更新")
                    continue
            updated_lines.append(line)

        if synced_vars:
            env_path.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")
            for var in synced_vars:
                logger.info(f"[update_env] 已同步 .env 环境变量: {var}")
        else:
            logger.info("[update_env] 没有需要同步到 .env 的配置项（.env 中无匹配变量）")

    def update_config_file(self, new_settings: dict[str, Any], config_path: str) -> None:
        """更新配置文件

        Args:
            new_settings: 配置字典（键可以是 snake_case 或点分隔格式）
            config_path: 配置文件路径
        """
        # 读取现有配置
        with open(config_path, encoding="utf-8") as f:
            current_config = yaml.safe_load(f) or {}

        logger.info(f"[update_yaml] 读取到 config.yaml 顶层键: {list(current_config.keys())}")

        # 更新配置
        for raw_key, value in new_settings.items():
            # 将 snake_case 格式转换为点分隔格式
            backend_key = snake_to_dot_notation(raw_key)
            display_val = (
                f"{str(value)[:15]}..." if "api_key" in backend_key.lower() and value else value
            )
            logger.info(f"[update_yaml] 更新: {raw_key} -> {backend_key} = {display_val}")

            # 处理嵌套配置键
            keys = backend_key.split(".")
            current = current_config
            for key in keys[:-1]:
                if key not in current:
                    logger.info(f"[update_yaml]   创建嵌套键: {key}（父路径中不存在）")
                    current[key] = {}
                current = current[key]

            old_yaml_val = current.get(keys[-1], "<不存在>")
            if "api_key" in backend_key.lower():
                old_yaml_val = (
                    f"{str(old_yaml_val)[:15]}..." if old_yaml_val != "<不存在>" else old_yaml_val
                )
            logger.info(f"[update_yaml]   yaml 旧值: {old_yaml_val} -> 新值: {display_val}")
            current[keys[-1]] = value

        # 保存配置文件
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(current_config, f, allow_unicode=True, sort_keys=False)

        logger.info(f"[update_yaml] 配置已保存到: {config_path}")

    def _collect_jobs_to_sync(
        self, job_config_keys: list[str], new_settings: dict[str, Any]
    ) -> dict[str, bool]:
        """收集需要同步的任务（包括联动任务）"""
        jobs_to_sync: dict[str, bool] = {}

        for config_key in job_config_keys:
            job_id = JOB_ENABLED_CONFIG_TO_JOB_ID[config_key]
            enabled = new_settings[config_key]
            jobs_to_sync[job_id] = enabled

            # 检查是否有联动配置
            if config_key in JOB_LINKED_CONFIG:
                self._add_linked_jobs(config_key, job_id, enabled, jobs_to_sync)

        return jobs_to_sync

    def _add_linked_jobs(
        self, config_key: str, job_id: str, enabled: bool, jobs_to_sync: dict[str, bool]
    ) -> None:
        """添加联动任务到同步列表"""
        linked_keys = JOB_LINKED_CONFIG[config_key]
        for linked_key in linked_keys:
            if linked_key in JOB_ENABLED_CONFIG_TO_JOB_ID:
                linked_job_id = JOB_ENABLED_CONFIG_TO_JOB_ID[linked_key]
                if linked_job_id not in jobs_to_sync:
                    jobs_to_sync[linked_job_id] = enabled
                    logger.info(f"📢 联动同步：{job_id} -> {linked_job_id} = {enabled}")

    def sync_job_states_if_needed(self, new_settings: dict[str, Any]) -> None:
        """如果任务启用状态发生变化，同步到调度器

        Args:
            new_settings: 配置字典（键可以是 snake_case 或点分隔格式）
        """
        job_config_keys = [key for key in new_settings if key in JOB_ENABLED_CONFIG_TO_JOB_ID]

        if not job_config_keys:
            return

        try:
            scheduler_manager = get_scheduler_manager()
            jobs_to_sync = self._collect_jobs_to_sync(job_config_keys, new_settings)

            for job_id, enabled in jobs_to_sync.items():
                job = scheduler_manager.get_job(job_id)
                if not job:
                    logger.warning(f"任务 {job_id} 不存在，跳过状态同步")
                    continue

                is_running = job.next_run_time is not None
                if enabled and not is_running:
                    scheduler_manager.resume_job(job_id)
                    logger.info(f"📢 配置变更：任务 {job_id} 已恢复运行")
                elif not enabled and is_running:
                    scheduler_manager.pause_job(job_id)
                    logger.info(f"📢 配置变更：任务 {job_id} 已暂停")

        except Exception as e:
            logger.error(f"同步任务状态失败: {e}", exc_info=True)

    def reinitialize_llm_if_needed(
        self,
        new_settings: dict[str, Any],
        old_llm_config: dict[str, Any],
        is_llm_configured_callback: Callable[[], None] | None = None,
    ) -> None:
        """如果 LLM 配置发生变化，重新初始化 LLM 客户端

        Args:
            new_settings: 配置字典（键为后端格式）
            old_llm_config: 旧的 LLM 配置
            is_llm_configured_callback: 更新 LLM 配置状态的回调函数
        """
        # 检测是否有 LLM 相关配置项在请求中
        has_llm_keys = any(key in LLM_RELATED_BACKEND_KEYS for key in new_settings)

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

    def reinitialize_asr_if_needed(
        self,
        new_settings: dict[str, Any],
        old_asr_config: dict[str, Any],
    ) -> None:
        """如果 ASR 配置发生变化，重新初始化 ASR 客户端

        Args:
            new_settings: 配置字典（键为后端格式）
            old_asr_config: 旧的 ASR 配置
        """
        # 检测是否有 ASR 相关配置项在请求中
        has_asr_keys = any(key in ASR_RELATED_BACKEND_KEYS for key in new_settings)

        if not has_asr_keys:
            return

        # 获取新的 ASR 配置值
        new_asr_config = self.get_asr_config()

        # 比对新旧配置值
        asr_config_changed = old_asr_config != new_asr_config

        if asr_config_changed:
            logger.info("检测到 ASR 配置实际发生变更，正在热加载 ASR 客户端...")
            logger.info(
                f"旧配置: API Key={old_asr_config['api_key'][:10] if old_asr_config['api_key'] else 'None'}..., "
                f"Base URL={old_asr_config['base_url']}, Model={old_asr_config['model']}"
            )
            logger.info(
                f"新配置: API Key={new_asr_config['api_key'][:10] if new_asr_config['api_key'] else 'None'}..., "
                f"Base URL={new_asr_config['base_url']}, Model={new_asr_config['model']}"
            )

            try:
                # 重新初始化 ASR 客户端单例
                asr_client = ASRClient()
                asr_client.reinitialize()
                logger.info(
                    f"ASR 客户端热加载成功 - "
                    f"API Key: {asr_client.api_key[:10] if asr_client.api_key else 'None'}..., "
                    f"Model: {asr_client.model}"
                )
                logger.info("ASR 配置热加载完成")
            except Exception as e:
                logger.error(f"热加载 ASR 客户端失败: {e}", exc_info=True)
        else:
            logger.info("ASR 配置未发生实际变更，跳过重新加载")

    def sync_diary_illustration_job_if_needed(self, new_settings: dict[str, Any]) -> None:
        """在运行中同步日记插画任务，支持 cron 热更新。"""
        if not any(key in DIARY_ILLUSTRATION_RUNTIME_KEYS for key in new_settings):
            return

        try:
            sync_diary_illustration_job()
        except Exception as e:
            logger.error(f"同步日记插画任务失败: {e}", exc_info=True)

    def save_config(
        self,
        new_settings: dict[str, Any],
        is_llm_configured_callback: Callable[[], None] | None = None,
    ) -> dict[str, Any]:
        """保存配置（主入口方法）

        Args:
            new_settings: 配置字典（键为后端格式）
            is_llm_configured_callback: 更新 LLM 配置状态的回调函数

        Returns:
            操作结果字典
        """
        logger.info(
            f"[save_config] 收到前端配置，共 {len(new_settings)} 项，原始键: {list(new_settings.keys())}"
        )
        for k, v in new_settings.items():
            display_v = f"{str(v)[:15]}..." if "api_key" in k.lower() and v else v
            logger.info(
                f"[save_config]   原始 -> {k} = {display_v} (masked={is_masked_api_key(v)})"
            )

        new_settings = {k: v for k, v in new_settings.items() if not is_masked_api_key(v)}
        logger.info(
            f"[save_config] 过滤掩码后剩余 {len(new_settings)} 项，键: {list(new_settings.keys())}"
        )

        config_path = self._config_path
        logger.info(f"[save_config] 配置文件路径: {config_path}")

        # 如果配置文件不存在，从默认配置复制
        if not os.path.exists(config_path):
            self._init_config_file()

        # 1. 先比对配置是否真的发生了变化
        config_changed, changed_items = self.compare_config_changes(new_settings)

        # 如果配置没有发生变化，直接返回
        if not config_changed:
            logger.info("[save_config] 配置未发生变化，跳过保存和重载")
            return {"success": True, "message": "配置未发生变化"}

        # 记录变更信息
        logger.info(f"[save_config] 检测到配置变更，共 {len(changed_items)} 项:")
        for item in changed_items:
            logger.info(f"  - {item}")

        # 2. 保存旧的 LLM 和 ASR 配置值（用于后续比对是否需要重新初始化）
        old_llm_config = self.get_llm_config()
        old_asr_config = self.get_asr_config()

        # 3. 更新配置文件
        logger.info(f"[save_config] 开始写入 config.yaml: {config_path}")
        self.update_config_file(new_settings, config_path)
        logger.info("[save_config] config.yaml 写入完成")

        # 3.5. 同步写回 .env 文件（确保重启后配置不丢失）
        logger.info("[save_config] 开始同步 .env 文件")
        self.update_env_file(new_settings)
        logger.info("[save_config] .env 同步完成")

        # 4. 重新加载配置并触发变更回调（config_watcher 会检测差异并通知订阅者）
        reload_success = reload_with_callbacks()
        if reload_success:
            logger.info("配置已重新加载到内存（含变更回调）")
        else:
            logger.warning("配置重新加载失败，但文件已保存")

        # 5. 同步任务状态到调度器（在配置重载后执行，确保使用最新的配置值）
        self.sync_job_states_if_needed(new_settings)

        # 6. 如果需要，重新初始化 LLM 客户端
        self.reinitialize_llm_if_needed(new_settings, old_llm_config, is_llm_configured_callback)

        # 7. 如果需要，重新初始化 ASR 客户端
        self.reinitialize_asr_if_needed(new_settings, old_asr_config)

        # 8. 热同步日记插画任务注册与 cron
        self.sync_diary_illustration_job_if_needed(new_settings)

        return {"success": True, "message": "配置保存成功"}

    def _init_config_file(self) -> None:
        """从默认配置初始化配置文件"""
        default_config_path = get_config_dir() / "default_config.yaml"

        if not default_config_path.exists():
            raise FileNotFoundError(
                f"默认配置文件不存在: {default_config_path}\n"
                "请确保 default_config.yaml 文件存在于 config 目录中"
            )

        os.makedirs(os.path.dirname(self._config_path), exist_ok=True)
        shutil.copy2(default_config_path, self._config_path)
        reload_settings()
