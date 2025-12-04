"""配置服务层 - 处理配置的保存、比对和重载逻辑"""

import os
from typing import Any

import yaml

from lifetrace.llm.llm_client import LLMClient
from lifetrace.util.config import (
    LifeTraceConfig,
    backend_to_frontend_key,
    frontend_to_backend_key,
)
from lifetrace.util.logging_config import get_logger

logger = get_logger()


# LLM 相关配置键（后端格式，用于判断是否需要重新初始化 LLM）
LLM_RELATED_BACKEND_KEYS = ["llm.api_key", "llm.base_url", "llm.model"]


class ConfigService:
    """配置服务类 - 负责配置的保存、比对和热加载"""

    def __init__(self, config: LifeTraceConfig):
        """初始化配置服务

        Args:
            config: LifeTrace配置实例
        """
        self.config = config

    def compare_config_changes(self, settings: dict[str, Any]) -> tuple[bool, list[str]]:
        """比对配置变更

        Args:
            settings: 前端提交的配置字典（键为驼峰形式，如 uiTheme）

        Returns:
            (是否有变更, 变更项列表)
        """
        config_changed = False
        changed_items = []

        for frontend_key, new_value in settings.items():
            # 将前端键转换为后端配置路径
            backend_key = frontend_to_backend_key(frontend_key)

            try:
                # 获取当前配置值
                old_value = self.config.get(backend_key)

                # 比对新旧值
                if old_value != new_value:
                    config_changed = True
                    # 记录变更项（敏感信息脱敏）
                    if "apikey" in frontend_key.lower() or "api_key" in backend_key.lower():
                        changed_items.append(
                            f"{frontend_key}: {str(old_value)[:10] if old_value else 'None'}... -> {str(new_value)[:10]}..."
                        )
                    else:
                        changed_items.append(f"{frontend_key}: {old_value} -> {new_value}")
            except KeyError:
                # 配置项不存在，视为新增配置
                config_changed = True
                if "apikey" in frontend_key.lower() or "api_key" in backend_key.lower():
                    changed_items.append(f"{frontend_key}: (新增) {str(new_value)[:10]}...")
                else:
                    changed_items.append(f"{frontend_key}: (新增) {new_value}")

        return config_changed, changed_items

    def get_llm_config(self) -> dict[str, Any]:
        """获取当前 LLM 配置

        Returns:
            LLM 配置字典
        """
        return {
            "api_key": self.config.get("llm.api_key"),
            "base_url": self.config.get("llm.base_url"),
            "model": self.config.get("llm.model"),
        }

    def get_config_for_frontend(self) -> dict[str, Any]:
        """获取配置并转换为前端格式（驼峰命名）

        Returns:
            前端格式的配置字典
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
        ]

        config_dict = {}
        for backend_key in backend_config_keys:
            try:
                value = self.config.get(backend_key)
                # 转换为前端格式的键（将点和下划线都转为驼峰）
                frontend_key = backend_to_frontend_key(backend_key)
                config_dict[frontend_key] = value
            except KeyError:
                # 配置项不存在，跳过或使用默认值
                logger.debug(f"配置项 {backend_key} 不存在，跳过")
                continue

        return config_dict

    def update_config_file(self, settings: dict[str, Any], config_path: str) -> None:
        """更新配置文件

        Args:
            settings: 前端提交的配置字典（键为驼峰形式）
            config_path: 配置文件路径
        """
        # 读取现有配置
        with open(config_path, encoding="utf-8") as f:
            current_config = yaml.safe_load(f) or {}

        # 更新配置
        for frontend_key, value in settings.items():
            # 将前端键转换为后端配置路径
            backend_key = frontend_to_backend_key(frontend_key)
            logger.info(f"转换配置键: {frontend_key} -> {backend_key} = {value}")

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

    def reinitialize_llm_if_needed(
        self,
        settings: dict[str, Any],
        old_llm_config: dict[str, Any],
        is_llm_configured_callback: callable = None,
    ) -> None:
        """如果 LLM 配置发生变化，重新初始化 LLM 客户端

        Args:
            settings: 前端提交的配置字典（键为驼峰形式）
            old_llm_config: 旧的 LLM 配置
            is_llm_configured_callback: 更新 LLM 配置状态的回调函数
        """
        # 检测是否有 LLM 相关配置项在请求中
        # 将设置中的键转换为后端格式后进行比对
        has_llm_keys = any(
            frontend_to_backend_key(key) in LLM_RELATED_BACKEND_KEYS for key in settings.keys()
        )

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

                is_configured = self.config.is_configured()
                status = "已配置" if is_configured else "未配置"
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
        settings: dict[str, Any],
        is_llm_configured_callback: callable = None,
    ) -> dict[str, Any]:
        """保存配置（主入口方法）

        Args:
            settings: 前端提交的配置字典
            is_llm_configured_callback: 更新 LLM 配置状态的回调函数

        Returns:
            操作结果字典
        """
        config_path = self.config.config_path

        # 如果配置文件不存在，创建默认配置
        if not os.path.exists(config_path):
            self.config.save_config()

        # 1. 先比对配置是否真的发生了变化
        config_changed, changed_items = self.compare_config_changes(settings)

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
        self.update_config_file(settings, config_path)

        # 4. 重新加载配置
        reload_success = self.config.reload()
        if reload_success:
            logger.info("配置已重新加载到内存")
        else:
            logger.warning("配置重新加载失败，但文件已保存")

        # 5. 如果需要，重新初始化 LLM 客户端
        self.reinitialize_llm_if_needed(settings, old_llm_config, is_llm_configured_callback)

        return {"success": True, "message": "配置保存成功"}
