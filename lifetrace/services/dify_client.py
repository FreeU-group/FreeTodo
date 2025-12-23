"""Dify 集成客户端（测试模式用）

目前仅用于在 Chat 流式接口中提供一个简单的测试通道：
- 接收一段用户消息
- 调用 Dify 的 chat-messages 接口（非流式）
- 返回一次性完整回复

如果后续需要更复杂的能力（带历史、多轮、变量等），可以在此文件中继续扩展。
"""

from __future__ import annotations

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


def call_dify_chat(message: str, user: str | None = None) -> str:
    """调用 Dify chat-messages 接口，返回一次性完整回复文本。

    这里使用 blocking 模式，便于快速集成测试。
    """
    cfg = _get_dify_config()

    headers = {
        "Authorization": f"Bearer {cfg['api_key']}",
        "Content-Type": "application/json",
    }

    # 参考 Dify 官方 REST API（chat-messages）
    payload: dict[str, Any] = {
        "inputs": {},
        "query": message,
        "response_mode": "blocking",
        "user": user or "lifetrace-user",
    }

    url = f"{cfg['base_url']}/chat-messages"

    logger.info("[dify] 调用 Dify chat-messages 接口")

    try:
        with httpx.Client(timeout=60) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
    except Exception as e:  # noqa: BLE001
        logger.error(f"[dify] 调用失败: {e}")
        raise

    try:
        data = resp.json()
    except Exception as e:  # noqa: BLE001
        logger.error(f"[dify] 解析响应 JSON 失败: {e}")
        raise

    # Dify 一般会返回 answer 字段，这里做一些兜底
    answer = data.get("answer") or data.get("output") or data.get("result") or ""

    if not answer:
        logger.warning("[dify] 响应中未找到 answer 字段，将返回原始 JSON 文本")
        answer = str(data)

    return answer
