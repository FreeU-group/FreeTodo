"""Dify 集成客户端（测试模式用）

目前仅用于在 Chat 流式接口中提供一个简单的测试通道：
- 接收一段用户消息
- 调用 Dify 的 chat-messages 接口（支持流式和非流式）
- 返回流式增量文本或完整回复

如果后续需要更复杂的能力（带历史、多轮、变量等），可以在此文件中继续扩展。
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import httpx

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()


def _get_dify_config() -> dict[str, str]:
    """从 dynaconf 配置中读取 Dify 相关设置。

    支持以下 dynaconf 路径（config.yaml 中）：
    - dify.enabled: 是否启用 Dify（可选，默认为 True）
    - dify.api_key: Dify API Key（必填）
    - dify.base_url: Dify API Base URL，默认 https://api.dify.ai/v1
    """
    enabled = getattr(getattr(settings, "dify", {}), "enabled", True)
    if enabled is False:
        raise RuntimeError("Dify 功能已在配置中关闭（dify.enabled = false）")

    api_key = getattr(getattr(settings, "dify", {}), "api_key", "").strip()
    if not api_key:
        raise RuntimeError("未配置 Dify API Key（dify.api_key），请在设置面板中填写")

    base_url = getattr(getattr(settings, "dify", {}), "base_url", "https://api.dify.ai/v1")
    base_url = str(base_url).rstrip("/")

    return {
        "api_key": api_key,
        "base_url": base_url,
    }


def _parse_sse_event_block(event_block: str) -> dict[str, Any] | None:
    """解析单个 SSE 事件块，提取 JSON 数据。

    Args:
        event_block: SSE 事件块文本（不包含 \n\n 分隔符）

    Returns:
        解析后的 JSON 数据字典，如果解析失败则返回 None
    """
    for line in event_block.split("\n"):
        line = line.strip()
        if line.startswith("data: "):
            data_str = line[6:]  # 跳过 "data: " 前缀
            try:
                return json.loads(data_str)
            except json.JSONDecodeError:
                logger.warning(f"[dify] 解析 SSE 数据 JSON 失败，原始数据: {data_str}")
                continue
    return None


def _extract_answer_from_sse_data(data_content: dict[str, Any]) -> str | None:
    """从 SSE 数据内容中提取 answer 字段。

    Args:
        data_content: 解析后的 SSE 事件数据字典

    Returns:
        answer 文本内容，如果不存在则返回 None
    """
    answer_delta = data_content.get("answer", "")
    return answer_delta if answer_delta else None


def _process_sse_event_block(event_block: str) -> Iterator[str]:
    """处理单个 SSE 事件块，提取并 yield answer 内容。

    Args:
        event_block: SSE 事件块文本（已去除 \n\n 分隔符并 strip）

    Yields:
        增量文本内容（如果有）
    """
    if not event_block:
        return

    data_content = _parse_sse_event_block(event_block)
    if not data_content:
        return

    answer_delta = _extract_answer_from_sse_data(data_content)
    if answer_delta:
        yield answer_delta

    event_type = data_content.get("event", "")
    if event_type == "message_end":
        logger.info("[dify] 流式响应接收完成")


def _parse_sse_stream(response: httpx.Response) -> Iterator[str]:
    """解析 SSE 格式的流式响应，提取 answer 字段。

    Args:
        response: httpx 流式响应对象

    Yields:
        增量文本内容
    """
    buffer = ""
    for chunk in response.iter_text():
        if not chunk:
            continue

        buffer += chunk

        # SSE 格式：每个事件以 \n\n 分隔
        while "\n\n" in buffer:
            event_block, buffer = buffer.split("\n\n", 1)
            yield from _process_sse_event_block(event_block.strip())

    # 处理剩余的 buffer（最后一个可能不完整的 SSE 事件）
    if buffer.strip():
        yield from _process_sse_event_block(buffer.strip())


def _handle_blocking_response(response: httpx.Response) -> Iterator[str]:
    """处理 blocking 模式的响应，返回完整回复。

    Args:
        response: httpx 响应对象

    Yields:
        完整的回复文本（作为单个元素）
    """
    try:
        data = response.json()
    except json.JSONDecodeError as e:
        logger.error(f"[dify] 解析响应 JSON 失败: {e}")
        raise

    # Dify 一般会返回 answer 字段，这里做一些兜底
    answer = data.get("answer") or data.get("output") or data.get("result") or ""

    if not answer:
        logger.warning("[dify] 响应中未找到 answer 字段，将返回原始 JSON 文本")
        answer = str(data)

    yield answer


def call_dify_chat(
    message: str,
    user: str | None = None,
    response_mode: str = "streaming",
    inputs: dict[str, Any] | None = None,
    **extra_payload: Any,
) -> Iterator[str]:
    """调用 Dify chat-messages 接口，返回文本生成器。

    Args:
        message: 用户消息内容
        user: 用户标识，默认为 "lifetrace-user"
        response_mode: 响应模式，可选 "streaming"（默认）或 "blocking"
        inputs: Dify 输入变量字典，默认为空字典
        **extra_payload: 额外的 payload 参数，会被合并到请求 payload 中

    Yields:
        文本内容（流式模式下为增量文本，阻塞模式下为完整文本）
    """
    cfg = _get_dify_config()

    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
    }

    # 构建 payload，允许前端通过参数自定义所有字段
    payload: dict[str, Any] = {
        "inputs": inputs if inputs is not None else {},
        "query": message,
        "response_mode": response_mode,
        "user": user or "lifetrace-user",
        **extra_payload,  # 允许前端传入额外的参数
    }

    url = f"{cfg['base_url']}/chat-messages"

    logger.info(f"[dify] 调用 Dify chat-messages 接口（{response_mode} 模式）")

    try:
        with httpx.Client(timeout=60) as client:
            if response_mode == "streaming":
                # 流式模式：使用 stream 方法
                with client.stream("POST", url, headers=headers, json=payload) as response:
                    response.raise_for_status()
                    yield from _parse_sse_stream(response)
            else:
                # 阻塞模式：使用普通 post 方法
                response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                yield from _handle_blocking_response(response)

    except Exception as e:  # noqa: BLE001
        logger.error(f"[dify] 调用失败 ({response_mode} 模式): {e}")
        raise
