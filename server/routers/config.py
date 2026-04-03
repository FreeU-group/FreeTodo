"""配置相关路由"""

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException

from routers.config_helpers import (
    TavilyClient,
    build_asr_test_payload,
    extract_diary_provider_config,
    get_config_value,
    handle_asr_test_error,
    handle_llm_test_error,
    reload_agent_os_if_running,
    test_asr_websocket_connection,
    test_diary_provider_config,
    validate_aliyun_api_key,
)
from services.config_service import ConfigService, is_llm_configured, is_masked_api_key
from util.logging_config import get_logger
from util.prompt_loader import get_prompt
from util.settings import settings

logger = get_logger()

router = APIRouter(prefix="/api", tags=["config"])


# 初始化配置服务
config_service = ConfigService()

# 追踪 LLM 连接是否已验证成功
# 只有通过 API 测试成功后才设置为 True
_llm_connection_state: dict[str, bool] = {"verified": False}


def verify_llm_connection_on_startup():
    """在应用启动时验证现有 LLM 配置

    如果配置存在且有效，尝试连接验证
    """
    if not is_llm_configured():
        logger.info("LLM 未配置，跳过启动时验证")
        return

    try:
        from openai import OpenAI  # noqa: PLC0415
    except Exception as exc:
        logger.warning(f"OpenAI 依赖未安装，跳过启动时验证: {exc}")
        return

    try:
        api_key = settings.llm.api_key
        base_url = settings.llm.base_url
        model = settings.llm.model

        # 创建临时客户端进行测试
        client = OpenAI(api_key=api_key, base_url=base_url)

        # 发送最小化测试请求验证认证
        client.chat.completions.create(
            model=model, messages=[{"role": "user", "content": "test"}], max_tokens=5
        )

        _llm_connection_state["verified"] = True
        logger.info("LLM 启动时连接验证成功")
    except Exception as e:
        _llm_connection_state["verified"] = False
        logger.warning(f"LLM 启动时连接验证失败: {e}")


@router.post("/test-llm-config")
async def test_llm_config(config_data: dict[str, str]):
    """测试LLM配置是否可用（仅验证认证）"""
    model = ""
    try:
        try:
            from openai import OpenAI  # noqa: PLC0415
        except Exception as exc:
            return {"success": False, "error": f"OpenAI 依赖未安装: {exc}"}

        # 同时支持 camelCase 和 snake_case 格式（前端 fetcher 会自动转换为 snake_case）
        llm_key = get_config_value(config_data, "llmApiKey", "llm_api_key")
        base_url = get_config_value(config_data, "llmBaseUrl", "llm_base_url")
        model = get_config_value(config_data, "llmModel", "llm_model")

        if is_masked_api_key(llm_key):
            llm_key = settings.get("llm.api_key")

        if not llm_key or not base_url:
            return {"success": False, "error": "LLM Key 和 Base URL 不能为空"}

        # 验证 API Key 格式（针对阿里云）
        if base_url and "aliyun" in base_url.lower():
            validation_error = validate_aliyun_api_key(llm_key)
            if validation_error:
                return validation_error

        logger.info(f"开始测试 LLM 配置 - 模型: {model}, Key前缀: {llm_key[:10]}...")

        # 创建临时客户端进行测试
        client = OpenAI(api_key=llm_key, base_url=base_url)

        # 发送最小化测试请求验证认证
        try:
            client.chat.completions.create(
                model=model, messages=[{"role": "user", "content": "test"}], max_tokens=5
            )
            logger.info(f"LLM配置测试成功 - 模型: {model}")
            return {"success": True, "message": "配置验证成功"}
        except Exception as e:
            logger.error(f"LLM配置测试失败: {e} - 模型: {model}, Key前缀: {llm_key[:10]}...")
            return {"success": False, "error": str(e)}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"LLM配置测试失败: {error_msg}")
        return handle_llm_test_error(error_msg, model)


@router.post("/test-tavily-config")
async def test_tavily_config(config_data: dict[str, str]):
    """测试Tavily配置是否可用（仅验证认证）"""
    try:
        if TavilyClient is None:
            return {"success": False, "error": "Tavily 依赖未安装，请先安装 tavily"}

        # 同时支持 camelCase 和 snake_case 格式（前端 fetcher 会自动转换为 snake_case）
        tavily_key = get_config_value(config_data, "tavilyApiKey", "tavily_api_key")

        if is_masked_api_key(tavily_key):
            tavily_key = settings.get("tavily.api_key")

        if not tavily_key:
            return {"success": False, "error": "Tavily API Key 不能为空"}

        # 检查是否为占位符
        invalid_values = [
            "xxx",
            "YOUR_API_KEY_HERE",
            "YOUR_TAVILY_API_KEY_HERE",
        ]
        if tavily_key in invalid_values:
            return {"success": False, "error": "请填写有效的 Tavily API Key"}

        logger.info(f"开始测试 Tavily 配置 - Key前缀: {tavily_key[:10]}...")

        # 创建临时客户端进行测试
        try:
            client = TavilyClient(api_key=tavily_key)
            # 执行一个简单的搜索请求来验证 API key
            client.search(query="test", max_results=1)
            logger.info("Tavily配置测试成功")
            return {"success": True, "message": "配置验证成功"}
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Tavily配置测试失败: {error_msg} - Key前缀: {tavily_key[:10]}...")
            # 处理常见的错误
            if "401" in error_msg or "unauthorized" in error_msg.lower():
                error_msg = (
                    "API Key 无效，请检查：\n1. 是否从 Tavily 控制台正确复制了完整的 API Key\n"
                    "2. API Key 是否已启用\n\n原始错误: " + error_msg
                )
            return {"success": False, "error": error_msg}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Tavily配置测试失败: {error_msg}")
        return {"success": False, "error": error_msg}


@router.post("/test-diary-illustration-provider")
async def test_diary_illustration_provider(config_data: dict[str, Any]):
    """测试日记插画图片提供商是否可用。"""
    provider = str(get_config_value(config_data, "provider", "provider") or "").strip().lower()
    if not provider:
        return {"success": False, "error": "缺少 provider 字段"}

    try:
        provider_config = extract_diary_provider_config(provider, config_data)
        result = await asyncio.to_thread(test_diary_provider_config, provider, provider_config)
        return {"success": True, **result}
    except Exception as exc:
        logger.error("测试日记插画提供商失败 provider=%s error=%s", provider, exc)
        return {"success": False, "error": str(exc), "provider": provider}


@router.post("/test-asr-config")
async def test_asr_config(config_data: dict[str, Any]):
    """测试ASR配置是否可用（验证WebSocket连接和认证）"""
    try:
        payload = build_asr_test_payload(config_data, is_masked_api_key, settings, logger)
        if not payload["success"]:
            return payload
        return await test_asr_websocket_connection(
            payload["base_url"],
            payload["asr_key"],
            payload["run_task_message"],
            payload["task_id"],
            logger,
        )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"ASR配置测试失败: {error_msg}")
        model = (
            get_config_value(config_data, "audioAsrModel", "audio_asr_model") or "fun-asr-realtime"
        )
        return handle_asr_test_error(error_msg, model)


@router.get("/llm-status")
async def get_llm_status():
    """检查 LLM 是否已正确配置并通过连接测试

    Returns:
        dict: 包含 configured 字段，表示 LLM 是否已配置且连接验证成功
    """
    try:
        # 只有配置存在且连接验证成功才返回 True
        has_config = is_llm_configured()
        return {"configured": has_config and _llm_connection_state["verified"]}
    except Exception as e:
        logger.error(f"检查 LLM 配置状态失败: {e}")
        return {"configured": False}


@router.get("/get-config")
async def get_config_detailed():
    """获取当前配置（返回驼峰格式的配置键）"""
    try:
        # 使用配置服务获取前端格式的配置
        config_dict = config_service.get_config_for_frontend()

        return {
            "success": True,
            "config": config_dict,
        }
    except Exception as e:
        logger.error(f"获取配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取配置失败: {e!s}") from e


def _validate_config_fields(config_data: dict[str, str]) -> dict[str, Any] | None:
    """验证配置字段，返回错误信息或 None"""
    # 同时支持 camelCase 和 snake_case 格式
    llm_key = get_config_value(config_data, "llmApiKey", "llm_api_key")
    base_url = get_config_value(config_data, "llmBaseUrl", "llm_base_url")
    model = get_config_value(config_data, "llmModel", "llm_model")

    # 检查必需字段（掩码值视为已配置）
    missing_fields = []
    if not llm_key and not is_masked_api_key(llm_key):
        missing_fields.append("llmApiKey")
    if not base_url:
        missing_fields.append("llmBaseUrl")
    if not model:
        missing_fields.append("llmModel")

    if missing_fields:
        return {
            "success": False,
            "error": f"缺少必需字段: {', '.join(missing_fields)}",
        }

    # 验证字段类型和内容
    if not isinstance(llm_key, str) or not llm_key.strip():
        return {"success": False, "error": "LLM Key必须是非空字符串"}

    if not isinstance(base_url, str) or not base_url.strip():
        return {"success": False, "error": "Base URL必须是非空字符串"}

    if not isinstance(model, str) or not model.strip():
        return {"success": False, "error": "模型名称必须是非空字符串"}

    return None


def _validate_agent_triplet(config_data: dict[str, Any]) -> dict[str, Any] | None:
    """校验 Agent 专属模型三联：api_key / base_url / model 必须全空或全填。

    Returns validation error dict, or None if valid.
    """
    agent_key = str(
        get_config_value(config_data, "llmAgentApiKey", "llm_agent_api_key") or ""
    ).strip()
    agent_url = str(
        get_config_value(config_data, "llmAgentBaseUrl", "llm_agent_base_url") or ""
    ).strip()
    agent_model = str(
        get_config_value(config_data, "llmAgentModel", "llm_agent_model") or ""
    ).strip()

    if is_masked_api_key(agent_key):
        agent_key = str(settings.get("llm.agent.api_key", "") or "").strip()

    filled = [
        ("API Key", bool(agent_key)),
        ("Base URL", bool(agent_url)),
        ("模型", bool(agent_model)),
    ]
    filled_count = sum(1 for _, v in filled if v)

    if filled_count != 0 and filled_count != 3:
        missing = [name for name, v in filled if not v]
        return {
            "success": False,
            "error": f"Agent 专属模型配置不完整，缺少: {', '.join(missing)}。请全部填写或全部留空。",
            "field": "agent_triplet",
        }
    return None


def _test_llm_channel(api_key: str, base_url: str, model: str) -> dict[str, Any]:
    """Test a single LLM channel by sending a minimal request. Runs synchronously."""
    try:
        from openai import OpenAI  # noqa: PLC0415
    except Exception as exc:
        return {"success": False, "error": f"OpenAI 依赖未安装: {exc}"}

    try:
        client = OpenAI(api_key=api_key, base_url=base_url)
        client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "test"}],
            max_tokens=5,
        )
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/test-llm-channels")
async def test_llm_channels(config_data: dict[str, Any] | None = None):
    """测试所有已配置的 LLM 通道连通性。

    如果传入 config_data 则用请求中的值测试；否则用当前服务端配置。
    返回 { main: {success, error?}, agent?: {success, error?} }
    """
    results: dict[str, Any] = {}

    if config_data:
        main_key = str(get_config_value(config_data, "llmApiKey", "llm_api_key") or "").strip()
        main_url = str(get_config_value(config_data, "llmBaseUrl", "llm_base_url") or "").strip()
        main_model = str(get_config_value(config_data, "llmModel", "llm_model") or "").strip()
        if is_masked_api_key(main_key):
            main_key = str(settings.get("llm.api_key", "") or "").strip()

        agent_key = str(
            get_config_value(config_data, "llmAgentApiKey", "llm_agent_api_key") or ""
        ).strip()
        agent_url = str(
            get_config_value(config_data, "llmAgentBaseUrl", "llm_agent_base_url") or ""
        ).strip()
        agent_model = str(
            get_config_value(config_data, "llmAgentModel", "llm_agent_model") or ""
        ).strip()
        if is_masked_api_key(agent_key):
            agent_key = str(settings.get("llm.agent.api_key", "") or "").strip()
    else:
        main_key = str(settings.get("llm.api_key", "") or "").strip()
        main_url = str(settings.get("llm.base_url", "") or "").strip()
        main_model = str(settings.get("llm.model", "") or "").strip()
        agent_cfg = settings.get("llm.agent", {}) or {}
        agent_key = str(agent_cfg.get("api_key", "") or "").strip()
        agent_url = str(agent_cfg.get("base_url", "") or "").strip()
        agent_model = str(agent_cfg.get("model", "") or "").strip()

    if main_key and main_url and main_model:
        results["main"] = await asyncio.to_thread(_test_llm_channel, main_key, main_url, main_model)
        results["main"]["model"] = main_model
        results["main"]["base_url"] = main_url
    else:
        results["main"] = {"success": False, "error": "主通道未配置完整"}

    _placeholders = {"", "YOUR_LLM_KEY_HERE", "YOUR_BASE_URL_HERE"}
    if agent_key and agent_key not in _placeholders and agent_url and agent_model:
        results["agent"] = await asyncio.to_thread(
            _test_llm_channel, agent_key, agent_url, agent_model
        )
        results["agent"]["model"] = agent_model
        results["agent"]["base_url"] = agent_url

    return {"success": True, "channels": results}


@router.post("/save-and-init-llm")
async def save_and_init_llm(config_data: dict[str, str]):
    """保存配置并重新初始化LLM服务"""
    try:
        # 验证必需字段
        validation_error = _validate_config_fields(config_data)
        if validation_error:
            return validation_error

        # 校验 Agent 三联完整性
        triplet_error = _validate_agent_triplet(config_data)
        if triplet_error:
            return triplet_error

        # 1. 先测试配置
        test_result = await test_llm_config(config_data)
        if not test_result["success"]:
            # 测试失败，标记连接未验证
            _llm_connection_state["verified"] = False
            return test_result

        # 2. 保存配置到文件（save_config 内部已经会重载配置并智能判断是否需要重新初始化 LLM）
        save_result = await save_config(config_data)

        if not save_result.get("success"):
            return {"success": False, "error": "保存配置失败"}

        # 3. 测试成功，标记连接已验证
        _llm_connection_state["verified"] = True
        logger.info("LLM 连接验证成功，配置已保存")

        agent_os_reload = await reload_agent_os_if_running(logger)
        if not agent_os_reload["success"]:
            logger.warning("LLM 配置已更新，但 AgentOS 未能热重载，可能需要手动重启 agent_os.py")

        return {"success": True, "message": "配置保存成功，正在跳转..."}

    except Exception as e:
        error_msg = str(e)
        logger.error(f"保存并初始化LLM失败: {error_msg}")
        return {"success": False, "error": error_msg}


@router.post("/save-config")
async def save_config(settings: dict[str, Any]):
    """保存配置到config.yaml文件"""
    try:
        logger.info(f"[/save-config] 收到请求，键: {list(settings.keys())}")

        # 校验 Agent 三联完整性（如果请求中包含 Agent 字段）
        _agent_keys = {
            "llmAgentApiKey",
            "llm_agent_api_key",
            "llmAgentBaseUrl",
            "llm_agent_base_url",
            "llmAgentModel",
            "llm_agent_model",
        }
        if _agent_keys & settings.keys():
            triplet_error = _validate_agent_triplet(settings)
            if triplet_error:
                return triplet_error

        # 定义更新 LLM 配置状态的回调函数（配置状态已通过 config.is_configured() 实时获取）
        def update_llm_configured_status():
            # 配置状态现在通过 config.is_configured() 实时获取
            pass

        # 调用配置服务保存配置
        result = config_service.save_config(settings, update_llm_configured_status)
        logger.info(f"[/save-config] 保存结果: {result}")
        return result

    except Exception as e:
        logger.error(f"保存配置失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"保存配置失败: {e!s}") from e


@router.get("/get-chat-prompts")
async def get_chat_prompts(locale: str = "zh"):
    """获取前端聊天功能所需的 prompt

    Args:
        locale: 语言代码，'zh' 或 'en'，默认为 'zh'

    Returns:
        包含 editSystemPrompt 和 planSystemPrompt 的字典
    """
    try:
        # 根据语言选择对应的 prompt key
        edit_key = "edit_system_prompt_zh" if locale == "zh" else "edit_system_prompt_en"
        plan_key = "plan_system_prompt_zh" if locale == "zh" else "plan_system_prompt_en"

        edit_prompt = get_prompt("chat_frontend", edit_key)
        plan_prompt = get_prompt("chat_frontend", plan_key)

        if not edit_prompt or not plan_prompt:
            logger.warning(f"无法加载 prompt，locale={locale}")
            raise HTTPException(
                status_code=500,
                detail="无法加载 prompt 配置，请检查 prompt.yaml",
            )

        return {
            "success": True,
            "editSystemPrompt": edit_prompt,
            "planSystemPrompt": plan_prompt,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取聊天 prompt 失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"获取聊天 prompt 失败: {e!s}",
        ) from e
