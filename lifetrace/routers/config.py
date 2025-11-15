"""配置相关路由"""

import os
from typing import Any

from fastapi import APIRouter, HTTPException

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.config import ConfigResponse

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config", response_model=ConfigResponse)
async def get_config():
    """获取配置信息"""
    return ConfigResponse(
        base_dir=deps.config.base_dir,
        screenshots_dir=deps.config.screenshots_dir,
        database_path=deps.config.database_path,
        server={
            "host": deps.config.get("server.host"),
            "port": deps.config.get("server.port"),
            "debug": deps.config.get("server.debug", False),
        },
        record={
            "interval": deps.config.get("jobs.recorder.interval"),
            "screens": deps.config.get("jobs.recorder.screens"),
            "format": deps.config.get("jobs.recorder.format"),
        },
        ocr={
            "enabled": deps.config.get("jobs.ocr.enabled"),
            "use_gpu": deps.config.get("jobs.ocr.use_gpu"),
            "language": deps.config.get("jobs.ocr.language"),
            "confidence_threshold": deps.config.get("jobs.ocr.confidence_threshold"),
        },
        storage={
            "max_days": deps.config.get("storage.max_days"),
            "deduplicate": deps.config.get("storage.deduplicate"),
            "hash_threshold": deps.config.get("storage.hash_threshold"),
        },
    )


@router.post("/test-llm-config")
async def test_llm_config(config_data: dict[str, str]):
    """测试LLM配置是否可用（仅验证认证）"""
    try:
        from openai import OpenAI

        llm_key = config_data.get("llmKey", "")
        base_url = config_data.get("baseUrl", "")
        model = config_data.get("model", "qwen3-max")

        if not llm_key or not base_url:
            return {"success": False, "error": "LLM Key 和 Base URL 不能为空"}

        # 验证 API Key 格式（针对阿里云）
        if base_url and "aliyun" in base_url.lower():
            if not llm_key.startswith("sk-"):
                return {
                    "success": False,
                    "error": "阿里云 API Key 格式错误，应该以 'sk-' 开头",
                }
            if len(llm_key) < 20:
                return {
                    "success": False,
                    "error": f"阿里云 API Key 长度异常（当前: {len(llm_key)} 字符），请检查是否完整",
                }

        deps.logger.info(f"开始测试 LLM 配置 - 模型: {model}, Key前缀: {llm_key[:10]}...")

        # 创建临时客户端进行测试
        client = OpenAI(api_key=llm_key, base_url=base_url)

        # 发送最小化测试请求验证认证
        response = client.chat.completions.create(  # noqa: F841
            model=model, messages=[{"role": "user", "content": "test"}], max_tokens=5
        )

        deps.logger.info(f"LLM配置测试成功 - 模型: {model}")
        return {"success": True, "message": "配置验证成功"}

    except Exception as e:
        error_msg = str(e)
        deps.logger.error(f"LLM配置测试失败: {error_msg}")

        # 提供更友好的错误提示
        if "401" in error_msg or "invalid_api_key" in error_msg:
            return {
                "success": False,
                "error": f"API Key 无效，请检查：\n1. 是否从阿里云控制台正确复制了完整的 API Key\n2. API Key 是否已启用\n3. API Key 是否有权限访问所选模型\n\n原始错误: {error_msg}",
            }
        elif "404" in error_msg:
            return {
                "success": False,
                "error": f"模型 '{model}' 不存在或无权访问，请检查模型名称是否正确\n\n原始错误: {error_msg}",
            }
        else:
            return {"success": False, "error": error_msg}


@router.get("/get-config")
async def get_config_detailed():
    """获取当前配置"""
    try:
        return {
            "success": True,
            "config": {
                # UI配置
                "isDark": deps.config.get("ui.dark_mode", False),
                "language": deps.config.get("ui.language", "zh-CN"),
                "notifications": deps.config.get("ui.notifications", True),
                "soundEnabled": deps.config.get("ui.sound_enabled", True),
                "autoSave": deps.config.get("ui.auto_save", True),
                # 录制配置
                "autoExcludeSelf": deps.config.get("jobs.recorder.auto_exclude_self", True),
                "blacklistEnabled": deps.config.get("jobs.recorder.blacklist.enabled", False),
                "blacklistApps": deps.config.get("jobs.recorder.blacklist.apps", []),
                "recordingEnabled": deps.config.get("jobs.recorder.enabled", True),
                "recordInterval": deps.config.get("jobs.recorder.interval", 1),
                "screenSelection": deps.config.get("jobs.recorder.screens", "all"),
                # 存储配置
                "storageEnabled": deps.config.get("storage.enabled", True),
                "maxDays": deps.config.get("storage.max_days", 30),
                "deduplicateEnabled": deps.config.get("storage.deduplicate", True),
                # LLM配置
                "llmKey": deps.config.llm_api_key,
                "baseUrl": deps.config.llm_base_url,
                "llmModel": deps.config.llm_model,
                "model": deps.config.llm_model,
                "temperature": deps.config.llm_temperature,
                "maxTokens": deps.config.llm_max_tokens,
                # 服务器配置
                "serverHost": deps.config.server_host,
                "serverPort": deps.config.server_port,
                # 聊天配置
                "localHistory": deps.config.chat_local_history,
                "historyLimit": deps.config.chat_history_limit,
            },
        }
    except Exception as e:
        deps.logger.error(f"获取配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取配置失败: {str(e)}") from e


@router.post("/save-and-init-llm")
async def save_and_init_llm(config_data: dict[str, str]):
    """保存配置并重新初始化LLM服务"""
    try:
        # 验证必需字段
        required_fields = ["llmKey", "baseUrl", "model"]
        missing_fields = [f for f in required_fields if not config_data.get(f)]
        if missing_fields:
            return {
                "success": False,
                "error": f"缺少必需字段: {', '.join(missing_fields)}",
            }

        # 验证字段类型和内容
        if not isinstance(config_data.get("llmKey"), str) or not config_data.get("llmKey").strip():
            return {"success": False, "error": "LLM Key必须是非空字符串"}

        if (
            not isinstance(config_data.get("baseUrl"), str)
            or not config_data.get("baseUrl").strip()
        ):
            return {"success": False, "error": "Base URL必须是非空字符串"}

        if not isinstance(config_data.get("model"), str) or not config_data.get("model").strip():
            return {"success": False, "error": "模型名称必须是非空字符串"}

        # 1. 先测试配置
        test_result = await test_llm_config(config_data)
        if not test_result["success"]:
            return test_result

        # 2. 保存配置到文件
        save_result = await save_config(
            {
                "llmKey": config_data.get("llmKey"),
                "baseUrl": config_data.get("baseUrl"),
                "llmModel": config_data.get("model"),
            }
        )

        if not save_result.get("success"):
            return {"success": False, "error": "保存配置失败"}

        # 3. 重新加载配置
        # LLM配置处理器会自动检测变化并重新初始化LLM客户端
        reload_success = deps.config.reload()
        if not reload_success:
            deps.logger.error("配置重新加载失败")
            return {"success": False, "error": "配置重新加载失败"}

        deps.logger.info(f"配置已重新加载 - LLM Key: {deps.config.llm_api_key[:10]}...")
        deps.logger.info(f"配置已重新加载 - Base URL: {deps.config.llm_base_url}")
        deps.logger.info(f"配置已重新加载 - Model: {deps.config.llm_model}")
        deps.logger.info("LLM配置处理器将自动检测变化并重新初始化客户端")

        # 4. 更新配置状态
        deps.is_llm_configured = True
        deps.logger.info("LLM配置状态已更新为：已配置")

        return {"success": True, "message": "配置保存成功，正在跳转..."}

    except Exception as e:
        error_msg = str(e)
        deps.logger.error(f"保存并初始化LLM失败: {error_msg}")
        return {"success": False, "error": error_msg}


@router.post("/save-config")
async def save_config(settings: dict[str, Any]):
    """保存配置到config.yaml文件"""
    try:
        import yaml

        # 读取当前配置文件
        config_path = deps.config.config_path

        # 如果配置文件不存在，创建默认配置
        if not os.path.exists(config_path):
            deps.config.save_config()

        # 读取现有配置
        with open(config_path, encoding="utf-8") as f:
            current_config = yaml.safe_load(f) or {}

        # 更新配置项
        # 映射前端设置到配置文件结构
        config_mapping = {
            "isDark": "ui.dark_mode",
            "darkMode": "ui.dark_mode",
            "language": "ui.language",
            "blacklistEnabled": "jobs.recorder.blacklist.enabled",
            "blacklistApps": "jobs.recorder.blacklist.apps",
            "recordingEnabled": "jobs.recorder.enabled",
            "recordInterval": "jobs.recorder.interval",
            "screenSelection": "jobs.recorder.screens",
            "storageEnabled": "storage.enabled",
            "maxDays": "storage.max_days",
            "deduplicateEnabled": "storage.deduplicate",
            "model": "llm.model",
            "temperature": "llm.temperature",
            "maxTokens": "llm.max_tokens",
            "notifications": "ui.notifications",
            "soundEnabled": "ui.sound_enabled",
            "autoSave": "ui.auto_save",
            "localHistory": "chat.local_history",
            "historyLimit": "chat.history_limit",
            # API配置
            "llmKey": "llm.api_key",
            "baseUrl": "llm.base_url",
            "llmModel": "llm.model",
            # 服务器配置
            "serverHost": "server.host",
            "serverPort": "server.port",
            "autoExcludeSelf": "jobs.recorder.auto_exclude_self",
        }

        # 更新配置
        for frontend_key, config_key in config_mapping.items():
            if frontend_key in settings:
                # 处理嵌套配置键
                keys = config_key.split(".")
                current = current_config
                for key in keys[:-1]:
                    if key not in current:
                        current[key] = {}
                    current = current[key]
                current[keys[-1]] = settings[frontend_key]

                # 记录敏感配置的保存（仅显示前几位）
                if frontend_key == "llmKey":
                    deps.logger.info(f"保存 LLM Key: {settings[frontend_key][:10]}...")
                elif frontend_key in ["baseUrl", "llmModel"]:
                    deps.logger.info(f"保存 {frontend_key}: {settings[frontend_key]}")

        # 保存配置文件
        with open(config_path, "w", encoding="utf-8") as f:
            yaml.dump(current_config, f, allow_unicode=True, sort_keys=False)

        deps.logger.info(f"配置已保存到: {config_path}")

        # 验证保存后的配置
        with open(config_path, encoding="utf-8") as f:
            saved_config = yaml.safe_load(f)
            if "llm" in saved_config and "api_key" in saved_config["llm"]:
                deps.logger.info(f"验证保存: LLM Key = {saved_config['llm']['api_key'][:10]}...")

        # 重新加载配置
        # 配置重新加载后，LLM配置处理器会自动检测变化并重新初始化LLM客户端
        reload_success = deps.config.reload()
        if reload_success:
            deps.logger.info("配置已重新加载到内存（LLM配置变化将自动触发重新初始化）")
        else:
            deps.logger.warning("配置重新加载失败，但文件已保存")

        return {"success": True, "message": "配置保存成功"}

    except Exception as e:
        deps.logger.error(f"保存配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存配置失败: {str(e)}") from e
