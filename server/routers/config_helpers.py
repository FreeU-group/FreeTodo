"""Shared helpers for config router validation and provider tests."""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

import httpx

from services.diary_illustration_service import (
    DEFAULT_VOLCENGINE_BASE_URL,
    DEFAULT_VOLCENGINE_IMAGE_MODEL,
    DEFAULT_VOLCENGINE_IMAGE_SIZE,
    test_diary_provider_config,
)
from util.agent_os_utils import resolve_agent_os_base_url

try:
    import websockets
    from websockets.exceptions import ConnectionClosed, InvalidURI
except ImportError:
    websockets = None
    ConnectionClosed = Exception
    InvalidURI = Exception

try:
    from tavily import TavilyClient
except ImportError:
    TavilyClient = None


MIN_ALIYUN_API_KEY_LENGTH = 20


def get_config_value(config_data: dict[str, Any], camel_key: str, snake_key: str) -> Any:
    return config_data.get(camel_key) or config_data.get(snake_key)


def validate_aliyun_api_key(llm_key: str) -> dict[str, Any] | None:
    if not llm_key.startswith("sk-"):
        return {"success": False, "error": "阿里云 API Key 格式错误，应该以 'sk-' 开头"}
    if len(llm_key) < MIN_ALIYUN_API_KEY_LENGTH:
        return {
            "success": False,
            "error": f"阿里云 API Key 长度异常（当前: {len(llm_key)} 字符），请检查是否完整",
        }
    return None


def handle_llm_test_error(error_msg: str, model: str) -> dict[str, Any]:
    if "401" in error_msg or "invalid_api_key" in error_msg:
        return {
            "success": False,
            "error": (
                "API Key 无效，请检查：\n1. 是否从阿里云控制台正确复制了完整的 API Key\n"
                "2. API Key 是否已启用\n3. API Key 是否有权限访问所选模型\n\n原始错误: "
                f"{error_msg}"
            ),
        }
    if "404" in error_msg:
        return {
            "success": False,
            "error": f"模型 '{model}' 不存在或无权访问，请检查模型名称是否正确\n\n原始错误: {error_msg}",
        }
    return {"success": False, "error": error_msg}


def extract_diary_provider_config(provider: str, config_data: dict[str, Any]) -> dict[str, Any]:
    provider_name = provider.strip().lower()
    if provider_name == "gemini":
        return {
            "api_key": get_config_value(config_data, "banna2ApiKey", "banna2_api_key") or "",
            "ref_image_path": get_config_value(
                config_data,
                "banna2RefImagePath",
                "banna2_ref_image_path",
            )
            or "",
        }
    if provider_name == "volcengine":
        return {
            "api_key": get_config_value(config_data, "volcengineApiKey", "volcengine_api_key")
            or "",
            "base_url": get_config_value(config_data, "volcengineBaseUrl", "volcengine_base_url")
            or DEFAULT_VOLCENGINE_BASE_URL,
            "image_model": get_config_value(
                config_data,
                "volcengineImageModel",
                "volcengine_image_model",
            )
            or DEFAULT_VOLCENGINE_IMAGE_MODEL,
            "image_size": get_config_value(
                config_data,
                "volcengineImageSize",
                "volcengine_image_size",
            )
            or DEFAULT_VOLCENGINE_IMAGE_SIZE,
        }
    raise ValueError(f"Unsupported diary illustration provider: {provider}")


async def reload_agent_os_if_running(logger) -> dict[str, Any]:
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


def parse_asr_config(config_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "asr_key": get_config_value(config_data, "audioAsrApiKey", "audio_asr_api_key"),
        "base_url": get_config_value(config_data, "audioAsrBaseUrl", "audio_asr_base_url"),
        "model": get_config_value(config_data, "audioAsrModel", "audio_asr_model")
        or "fun-asr-realtime",
        "sample_rate": int(
            get_config_value(config_data, "audioAsrSampleRate", "audio_asr_sample_rate") or 16000
        ),
        "format_type": get_config_value(config_data, "audioAsrFormat", "audio_asr_format") or "pcm",
        "semantic_punc": get_config_value(
            config_data,
            "audioAsrSemanticPunctuationEnabled",
            "audio_asr_semantic_punctuation_enabled",
        )
        or False,
        "max_silence": int(
            get_config_value(
                config_data,
                "audioAsrMaxSentenceSilence",
                "audio_asr_max_sentence_silence",
            )
            or 1300
        ),
        "heartbeat": get_config_value(config_data, "audioAsrHeartbeat", "audio_asr_heartbeat")
        or False,
    }


def build_asr_run_task_message(task_id: str, config: dict[str, Any]) -> dict[str, Any]:
    return {
        "header": {"action": "run-task", "task_id": task_id, "streaming": "duplex"},
        "payload": {
            "task_group": "audio",
            "task": "asr",
            "function": "recognition",
            "model": config["model"],
            "parameters": {
                "format": config["format_type"],
                "sample_rate": config["sample_rate"],
                "semantic_punctuation_enabled": config["semantic_punc"],
                "max_sentence_silence": config["max_silence"],
                "heartbeat": config["heartbeat"],
            },
            "input": {},
        },
    }


def build_asr_finish_task_message(task_id: str) -> dict[str, Any]:
    return {
        "header": {"action": "finish-task", "task_id": task_id, "streaming": "duplex"},
        "payload": {"input": {}},
    }


async def handle_asr_websocket_response(ws, task_id: str, logger) -> dict[str, Any]:
    try:
        response = await asyncio.wait_for(ws.recv(), timeout=3.0)
        data = json.loads(response)
        event = data.get("header", {}).get("event")
        logger.info("ASR 测试收到响应: %s", event)

        if event in ("task-started", "result-generated"):
            await ws.send(json.dumps(build_asr_finish_task_message(task_id)))
            logger.info("ASR配置测试成功")
            return {"success": True, "message": "配置验证成功"}
        if event == "task-failed":
            error_code = data.get("header", {}).get("error_code", "")
            error_message = data.get("header", {}).get("error_message", "")
            error_msg = f"ASR任务失败: {error_code} - {error_message}"
            logger.error("ASR配置测试失败: %s", error_msg)
            return {"success": False, "error": error_msg}

        logger.info("ASR配置测试成功（收到其他事件）")
        return {"success": True, "message": "配置验证成功"}
    except TimeoutError:
        logger.info("ASR配置测试成功（连接超时但已建立连接）")
        return {"success": True, "message": "配置验证成功"}


async def test_asr_websocket_connection(
    base_url: str,
    asr_key: str,
    run_task_message: dict[str, Any],
    task_id: str,
    logger,
) -> dict[str, Any]:
    if websockets is None:
        return {"success": False, "error": "websockets 依赖未安装，请先安装 websockets"}

    headers = [("Authorization", f"Bearer {asr_key}")]
    try:
        async with websockets.connect(base_url, additional_headers=headers, close_timeout=5) as ws:
            await ws.send(json.dumps(run_task_message))
            logger.info("ASR WebSocket 连接成功，已发送 run-task 消息")
            return await handle_asr_websocket_response(ws, task_id, logger)
    except ConnectionClosed as exc:
        error_msg = f"WebSocket 连接被关闭: {exc}"
    except InvalidURI as exc:
        error_msg = f"WebSocket 地址无效: {exc}"
    except Exception as exc:
        error_msg = str(exc)
    logger.error("ASR配置测试失败: %s", error_msg)
    return {"success": False, "error": error_msg}


def handle_asr_test_error(error_msg: str, model: str) -> dict[str, Any]:
    if "401" in error_msg or "unauthorized" in error_msg.lower() or "invalid" in error_msg.lower():
        return {
            "success": False,
            "error": (
                "API Key 无效，请检查：\n1. 是否从阿里云控制台正确复制了完整的 API Key\n"
                "2. API Key 是否已启用\n3. API Key 是否有权限访问 ASR 服务\n\n原始错误: "
                f"{error_msg}"
            ),
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


def build_asr_test_payload(
    config_data: dict[str, Any], is_masked_api_key, settings, logger
) -> dict[str, Any] | dict[str, str]:
    config = parse_asr_config(config_data)
    asr_key = config["asr_key"]
    base_url = config["base_url"]

    if is_masked_api_key(asr_key):
        asr_key = settings.get("audio.asr.api_key")
    if not asr_key or not base_url:
        return {"success": False, "error": "ASR API Key 和 Base URL 不能为空"}
    if "aliyun" in base_url.lower():
        validation_error = validate_aliyun_api_key(asr_key)
        if validation_error:
            return validation_error

    logger.info("开始测试 ASR 配置 - 模型: %s, Key前缀: %s...", config["model"], asr_key[:10])
    task_id = uuid.uuid4().hex[:32]
    return {
        "success": True,
        "task_id": task_id,
        "base_url": base_url,
        "asr_key": asr_key,
        "run_task_message": build_asr_run_task_message(task_id, config),
        "model": config["model"],
    }


__all__ = [
    "TavilyClient",
    "build_asr_test_payload",
    "extract_diary_provider_config",
    "get_config_value",
    "handle_asr_test_error",
    "handle_llm_test_error",
    "reload_agent_os_if_running",
    "test_asr_websocket_connection",
    "test_diary_provider_config",
    "validate_aliyun_api_key",
]
