"""配置相关路由"""

import asyncio
import json
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from services.config_service import ConfigService, is_llm_configured
from services.diary_illustration_service import (
    DEFAULT_VOLCENGINE_BASE_URL,
    DEFAULT_VOLCENGINE_IMAGE_MODEL,
    DEFAULT_VOLCENGINE_IMAGE_SIZE,
    test_diary_provider_config,
)
from util.agent_os_utils import resolve_agent_os_base_url
from util.logging_config import get_logger
from util.prompt_loader import get_prompt
from util.settings import settings

try:
    from tavily import TavilyClient
except ImportError:
    TavilyClient = None

try:
    import websockets
    from websockets.exceptions import ConnectionClosed, InvalidURI
except ImportError:
    websockets = None
    ConnectionClosed = Exception
    InvalidURI = Exception

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


def _validate_aliyun_api_key(llm_key: str) -> dict[str, Any] | None:
    """验证阿里云 API Key 格式"""
    min_aliyun_key_length = 20

    if not llm_key.startswith("sk-"):
        return {
            "success": False,
            "error": "阿里云 API Key 格式错误，应该以 'sk-' 开头",
        }
    if len(llm_key) < min_aliyun_key_length:
        return {
            "success": False,
            "error": f"阿里云 API Key 长度异常（当前: {len(llm_key)} 字符），请检查是否完整",
        }
    return None


def _handle_llm_test_error(error_msg: str, model: str) -> dict[str, Any]:
    """处理LLM测试错误，返回友好的错误信息"""
    if "401" in error_msg or "invalid_api_key" in error_msg:
        return {
            "success": False,
            "error": f"API Key 无效，请检查：\n1. 是否从阿里云控制台正确复制了完整的 API Key\n2. API Key 是否已启用\n3. API Key 是否有权限访问所选模型\n\n原始错误: {error_msg}",
        }
    if "404" in error_msg:
        return {
            "success": False,
            "error": f"模型 '{model}' 不存在或无权访问，请检查模型名称是否正确\n\n原始错误: {error_msg}",
        }
    return {"success": False, "error": error_msg}


def _get_config_value(config_data: dict[str, Any], camel_key: str, snake_key: str) -> Any:
    """从配置数据中获取值，同时支持 camelCase 和 snake_case 格式

    Args:
        config_data: 配置字典
        camel_key: camelCase 格式的键（如 llmApiKey）
        snake_key: snake_case 格式的键（如 llm_api_key）

    Returns:
        配置值，如果都不存在则返回 None
    """
    return config_data.get(camel_key) or config_data.get(snake_key)


def _extract_diary_provider_config(
    provider: str,
    config_data: dict[str, Any],
) -> dict[str, Any]:
    provider_name = provider.strip().lower()
    if provider_name == "gemini":
        return {
            "api_key": _get_config_value(config_data, "banna2ApiKey", "banna2_api_key") or "",
            "ref_image_path": _get_config_value(
                config_data,
                "banna2RefImagePath",
                "banna2_ref_image_path",
            )
            or "",
        }

    if provider_name == "volcengine":
        return {
            "api_key": _get_config_value(config_data, "volcengineApiKey", "volcengine_api_key")
            or "",
            "base_url": _get_config_value(
                config_data,
                "volcengineBaseUrl",
                "volcengine_base_url",
            )
            or DEFAULT_VOLCENGINE_BASE_URL,
            "image_model": _get_config_value(
                config_data,
                "volcengineImageModel",
                "volcengine_image_model",
            )
            or DEFAULT_VOLCENGINE_IMAGE_MODEL,
            "image_size": _get_config_value(
                config_data,
                "volcengineImageSize",
                "volcengine_image_size",
            )
            or DEFAULT_VOLCENGINE_IMAGE_SIZE,
        }

    raise ValueError(f"Unsupported diary illustration provider: {provider}")


async def _reload_agent_os_if_running() -> dict[str, Any]:
    """Best-effort reload of the separate AgentOS process after config changes."""
    reload_url = f"{resolve_agent_os_base_url()}/internal/reload-agent"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(reload_url)
        response.raise_for_status()
        logger.info("AgentOS agent 热重载成功")
        return {"success": True}
    except Exception as exc:
        logger.warning(f"AgentOS 热重载失败: {exc}")
        return {"success": False, "error": str(exc)}


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
        llm_key = _get_config_value(config_data, "llmApiKey", "llm_api_key")
        base_url = _get_config_value(config_data, "llmBaseUrl", "llm_base_url")
        model = _get_config_value(config_data, "llmModel", "llm_model")

        if not llm_key or not base_url:
            return {"success": False, "error": "LLM Key 和 Base URL 不能为空"}

        # 验证 API Key 格式（针对阿里云）
        if base_url and "aliyun" in base_url.lower():
            validation_error = _validate_aliyun_api_key(llm_key)
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
        return _handle_llm_test_error(error_msg, model)


@router.post("/test-tavily-config")
async def test_tavily_config(config_data: dict[str, str]):
    """测试Tavily配置是否可用（仅验证认证）"""
    try:
        if TavilyClient is None:
            return {"success": False, "error": "Tavily 依赖未安装，请先安装 tavily"}

        # 同时支持 camelCase 和 snake_case 格式（前端 fetcher 会自动转换为 snake_case）
        tavily_key = _get_config_value(config_data, "tavilyApiKey", "tavily_api_key")

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
    provider = str(_get_config_value(config_data, "provider", "provider") or "").strip().lower()
    if not provider:
        return {"success": False, "error": "缺少 provider 字段"}

    try:
        provider_config = _extract_diary_provider_config(provider, config_data)
        result = await asyncio.to_thread(test_diary_provider_config, provider, provider_config)
        return {"success": True, **result}
    except Exception as exc:
        logger.error("测试日记插画提供商失败 provider=%s error=%s", provider, exc)
        return {"success": False, "error": str(exc), "provider": provider}


def _parse_asr_config(config_data: dict[str, Any]) -> dict[str, Any]:
    """解析 ASR 配置参数"""
    return {
        "asr_key": _get_config_value(config_data, "audioAsrApiKey", "audio_asr_api_key"),
        "base_url": _get_config_value(config_data, "audioAsrBaseUrl", "audio_asr_base_url"),
        "model": _get_config_value(config_data, "audioAsrModel", "audio_asr_model")
        or "fun-asr-realtime",
        "sample_rate": int(
            _get_config_value(config_data, "audioAsrSampleRate", "audio_asr_sample_rate") or 16000
        ),
        "format_type": _get_config_value(config_data, "audioAsrFormat", "audio_asr_format")
        or "pcm",
        "semantic_punc": _get_config_value(
            config_data,
            "audioAsrSemanticPunctuationEnabled",
            "audio_asr_semantic_punctuation_enabled",
        )
        or False,
        "max_silence": int(
            _get_config_value(
                config_data, "audioAsrMaxSentenceSilence", "audio_asr_max_sentence_silence"
            )
            or 1300
        ),
        "heartbeat": _get_config_value(config_data, "audioAsrHeartbeat", "audio_asr_heartbeat")
        or False,
    }


def _build_asr_run_task_message(
    task_id: str,
    model: str,
    format_type: str,
    sample_rate: int,
    semantic_punc: bool,
    max_silence: int,
    heartbeat: bool,
) -> dict[str, Any]:
    """构建 ASR run-task 消息"""
    return {
        "header": {
            "action": "run-task",
            "task_id": task_id,
            "streaming": "duplex",
        },
        "payload": {
            "task_group": "audio",
            "task": "asr",
            "function": "recognition",
            "model": model,
            "parameters": {
                "format": format_type,
                "sample_rate": sample_rate,
                "semantic_punctuation_enabled": semantic_punc,
                "max_sentence_silence": max_silence,
                "heartbeat": heartbeat,
            },
            "input": {},
        },
    }


def _build_asr_finish_task_message(task_id: str) -> dict[str, Any]:
    """构建 ASR finish-task 消息"""
    return {
        "header": {
            "action": "finish-task",
            "task_id": task_id,
            "streaming": "duplex",
        },
        "payload": {"input": {}},
    }


async def _handle_asr_websocket_response(ws, task_id: str) -> dict[str, Any]:
    """处理 ASR WebSocket 响应"""
    try:
        response = await asyncio.wait_for(ws.recv(), timeout=3.0)
        data = json.loads(response)
        event = data.get("header", {}).get("event")
        logger.info(f"ASR 测试收到响应: {event}")

        if event in ("task-started", "result-generated"):
            finish_message = _build_asr_finish_task_message(task_id)
            await ws.send(json.dumps(finish_message))
            logger.info("ASR配置测试成功")
            return {"success": True, "message": "配置验证成功"}
        if event == "task-failed":
            error_code = data.get("header", {}).get("error_code", "")
            error_message = data.get("header", {}).get("error_message", "")
            error_msg = f"ASR任务失败: {error_code} - {error_message}"
            logger.error(f"ASR配置测试失败: {error_msg}")
            return {"success": False, "error": error_msg}
        # 其他事件也视为成功（至少连接和认证通过了）
        logger.info("ASR配置测试成功（收到其他事件）")
        return {"success": True, "message": "配置验证成功"}
    except TimeoutError:
        # 超时也视为成功（至少连接和认证通过了）
        logger.info("ASR配置测试成功（连接超时但已建立连接）")
        return {"success": True, "message": "配置验证成功"}


async def _test_asr_websocket_connection(
    base_url: str, asr_key: str, run_task_message: dict[str, Any], task_id: str
) -> dict[str, Any]:
    """测试 ASR WebSocket 连接"""
    if websockets is None:
        return {"success": False, "error": "websockets 依赖未安装，请先安装 websockets"}

    headers = [("Authorization", f"Bearer {asr_key}")]
    try:
        async with websockets.connect(base_url, additional_headers=headers, close_timeout=5) as ws:
            await ws.send(json.dumps(run_task_message))
            logger.info("ASR WebSocket 连接成功，已发送 run-task 消息")
            return await _handle_asr_websocket_response(ws, task_id)
    except ConnectionClosed as e:
        error_msg = f"WebSocket 连接被关闭: {e}"
        logger.error(f"ASR配置测试失败: {error_msg}")
        return {"success": False, "error": error_msg}
    except InvalidURI as e:
        error_msg = f"WebSocket 地址无效: {e}"
        logger.error(f"ASR配置测试失败: {error_msg}")
        return {"success": False, "error": error_msg}
    except Exception as e:
        error_msg = str(e)
        logger.error(f"ASR配置测试失败: {error_msg}")
        return {"success": False, "error": error_msg}


def _handle_asr_test_error(error_msg: str, model: str) -> dict[str, Any]:
    """处理ASR测试错误，返回友好的错误信息"""
    if "401" in error_msg or "unauthorized" in error_msg.lower() or "invalid" in error_msg.lower():
        return {
            "success": False,
            "error": f"API Key 无效，请检查：\n1. 是否从阿里云控制台正确复制了完整的 API Key\n2. API Key 是否已启用\n3. API Key 是否有权限访问 ASR 服务\n\n原始错误: {error_msg}",
        }
    if "404" in error_msg or "not found" in error_msg.lower():
        return {
            "success": False,
            "error": f"WebSocket 地址或模型 '{model}' 不存在，请检查配置是否正确\n\n原始错误: {error_msg}",
        }
    if "connection" in error_msg.lower() or "timeout" in error_msg.lower():
        return {
            "success": False,
            "error": f"连接失败，请检查：\n1. WebSocket 地址是否正确\n2. 网络连接是否正常\n\n原始错误: {error_msg}",
        }
    return {"success": False, "error": error_msg}


@router.post("/test-asr-config")
async def test_asr_config(config_data: dict[str, Any]):
    """测试ASR配置是否可用（验证WebSocket连接和认证）"""
    try:
        # 解析配置参数
        config = _parse_asr_config(config_data)
        asr_key = config["asr_key"]
        base_url = config["base_url"]
        model = config["model"]

        if not asr_key or not base_url:
            return {"success": False, "error": "ASR API Key 和 Base URL 不能为空"}

        # 验证 API Key 格式（针对阿里云）
        if "aliyun" in base_url.lower():
            validation_error = _validate_aliyun_api_key(asr_key)
            if validation_error:
                return validation_error

        logger.info(f"开始测试 ASR 配置 - 模型: {model}, Key前缀: {asr_key[:10]}...")

        # 构建测试消息
        task_id = uuid.uuid4().hex[:32]
        run_task_message = _build_asr_run_task_message(
            task_id,
            model,
            config["format_type"],
            config["sample_rate"],
            config["semantic_punc"],
            config["max_silence"],
            config["heartbeat"],
        )

        # 测试 WebSocket 连接
        return await _test_asr_websocket_connection(base_url, asr_key, run_task_message, task_id)

    except Exception as e:
        error_msg = str(e)
        logger.error(f"ASR配置测试失败: {error_msg}")
        model = (
            _get_config_value(config_data, "audioAsrModel", "audio_asr_model") or "fun-asr-realtime"
        )
        return _handle_asr_test_error(error_msg, model)


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
    llm_key = _get_config_value(config_data, "llmApiKey", "llm_api_key")
    base_url = _get_config_value(config_data, "llmBaseUrl", "llm_base_url")
    model = _get_config_value(config_data, "llmModel", "llm_model")

    # 检查必需字段
    missing_fields = []
    if not llm_key:
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


@router.post("/save-and-init-llm")
async def save_and_init_llm(config_data: dict[str, str]):
    """保存配置并重新初始化LLM服务"""
    try:
        # 验证必需字段
        validation_error = _validate_config_fields(config_data)
        if validation_error:
            return validation_error

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

        agent_os_reload = await _reload_agent_os_if_running()
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
        # 定义更新 LLM 配置状态的回调函数（配置状态已通过 config.is_configured() 实时获取）
        def update_llm_configured_status():
            # 配置状态现在通过 config.is_configured() 实时获取
            pass

        # 调用配置服务保存配置
        result = config_service.save_config(settings, update_llm_configured_status)
        return result

    except Exception as e:
        logger.error(f"保存配置失败: {e}")
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
