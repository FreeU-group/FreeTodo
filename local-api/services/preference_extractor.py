"""Lightweight preference extractor — detects explicit preferences from chat.

Called as a fire-and-forget background task after each chat turn.  Uses a
short LLM prompt to decide whether the user expressed any clear preference
and, if so, extracts bullet-point items to be merged into the profile's
"偏好与习惯" section.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from util.logging_config import get_logger

if TYPE_CHECKING:
    from llm.llm_client import LLMClient

logger = get_logger()

_SYSTEM = (
    "你是一个偏好检测器。分析用户的聊天消息，判断其中是否包含**明确的个人偏好或习惯表达**。\n\n"
    "偏好示例：\n"
    "- 「我喜欢用 Vim」→ 偏好使用 Vim 编辑器\n"
    "- 「我习惯晚上工作」→ 习惯在夜间进行深度工作\n"
    "- 「我不喜欢写文档」→ 倾向于避免写文档\n"
    "- 「我偏向用中文」→ 偏好使用中文交流\n\n"
    "注意：\n"
    "- 只提取**明确、稳定**的偏好，不要提取一次性请求或临时意图\n"
    "- 提取结果使用 bullet point 格式（`- `开头），每条一个偏好\n"
    "- 如果没有检测到偏好，输出：NO_PREFERENCE\n"
    "- 最多提取 3 条\n"
)

_USER_TEMPLATE = """\
用户消息：
{user_message}

AI 回复：
{ai_response}

请提取用户消息中的明确偏好（如果有）。
"""


async def extract_preferences(
    user_message: str,
    ai_response: str,
    llm_client: LLMClient,
    model: str | None = None,
) -> list[str]:
    """Return a list of preference bullet strings, or empty if none detected."""
    if not user_message or not user_message.strip():
        return []

    prompt = _USER_TEMPLATE.format(
        user_message=user_message.strip(),
        ai_response=(ai_response or "").strip()[:500],
    )
    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": prompt},
    ]
    try:
        resp = await asyncio.to_thread(
            llm_client.chat,
            messages,
            0.1,
            model,
            256,
            log_usage=True,
            log_meta={
                "endpoint": "preference_extraction",
                "feature_type": "memory_profile",
            },
        )
    except Exception:
        logger.exception("Preference extraction LLM call failed")
        return []

    if not resp or "NO_PREFERENCE" in resp.strip().upper():
        return []

    items: list[str] = []
    for raw_line in resp.strip().splitlines():
        stripped = raw_line.strip()
        if stripped.startswith("- "):
            items.append(stripped)
    return items[:3]
