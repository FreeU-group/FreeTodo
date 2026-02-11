from __future__ import annotations

import json
import re
from typing import Any

from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.settings import settings
from lifetrace.util.token_usage_logger import log_token_usage

logger = get_logger()


def parse_gate_response(result_text: str) -> dict[str, Any] | None:
    """解析 gate LLM 响应（JSON）。"""
    clean = (result_text or "").strip()
    if clean.startswith("```json"):
        clean = clean[7:]
    if clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()

    try:
        return json.loads(clean)
    except Exception:
        pass

    try:
        match = re.search(r"\{.*\}", clean, re.DOTALL)
        if not match:
            return None
        return json.loads(match.group(0))
    except Exception:
        return None


def coerce_gate_bool(value: Any) -> bool | None:
    """将 gate 字段转换为 bool。"""
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return bool(value)
    if isinstance(value, float):
        return bool(int(value))
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "t", "yes", "y", "1", "extract", "run", "need", "needed"}:
            return True
        if normalized in {"false", "f", "no", "n", "0", "skip", "ignore", "none"}:
            return False
    return None


def coerce_gate_decision(data: dict[str, Any]) -> bool | None:
    """从 gate JSON 中提取最终决策。"""
    for key in (
        "should_extract",
        "shouldExtract",
        "needs_extract",
        "needsExtract",
        "need_extract",
        "needExtract",
        "extract",
        "needs_extraction",
        "needsExtraction",
        "need_extraction",
        "needExtraction",
    ):
        if key in data:
            casted = coerce_gate_bool(data.get(key))
            if casted is not None:
                return casted

    for key in ("decision", "action", "result", "label", "type"):
        if key in data:
            casted = coerce_gate_bool(data.get(key))
            if casted is not None:
                return casted
            normalized = str(data.get(key) or "").strip().lower()
            if normalized in {"extract", "run", "yes", "true"}:
                return True
            if normalized in {"skip", "no", "false"}:
                return False

    return None


async def should_extract_with_llm_gate(  # noqa: PLR0911
    *, text: str, llm_client
) -> tuple[bool, str, dict[str, Any] | None]:
    """用更便宜/短输出的 LLM 调用判断是否需要执行完整提取。"""
    clean_text = (text or "").strip()
    if not clean_text:
        return False, "empty_text", None

    try:
        min_text_length = max(0, int(settings.get("audio.extraction_gate.min_text_length", 0)))
    except (TypeError, ValueError):
        min_text_length = 0

    if min_text_length > 0 and len(clean_text) < min_text_length:
        return (
            False,
            "too_short",
            {"min_text_length": min_text_length, "text_length": len(clean_text)},
        )

    if not llm_client.is_available():
        return False, "llm_unavailable", None

    model = (settings.get("audio.extraction_gate.model") or "").strip() or llm_client.model
    temperature = float(settings.get("audio.extraction_gate.temperature", 0.0))
    max_tokens = int(settings.get("audio.extraction_gate.max_tokens", 160))

    llm_client._initialize_client()

    try:
        system_prompt = get_prompt("transcription_extraction_gate", "system_assistant")
        user_prompt = get_prompt(
            "transcription_extraction_gate",
            "user_prompt",
            text=clean_text,
        )
        if not system_prompt or not user_prompt:
            logger.warning("无法加载 gate 提示词，跳过 gate，直接执行提取")
            return True, "missing_prompt", None

        response = llm_client.client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )

        if hasattr(response, "usage") and response.usage:
            log_token_usage(
                model=model,
                input_tokens=int(response.usage.prompt_tokens or 0),
                output_tokens=int(response.usage.completion_tokens or 0),
                endpoint="audio_extract_gate",
                user_query=clean_text,
                response_type="gate",
                feature_type="audio",
            )

        raw = (response.choices[0].message.content or "").strip()
        data = parse_gate_response(raw)
        if not isinstance(data, dict):
            logger.warning("gate 响应无法解析为 JSON，跳过 gate，直接执行提取")
            return True, "unparseable", None

        decision = coerce_gate_decision(data)
        if isinstance(decision, bool):
            return decision, "ok", data

        return True, "unknown_format", data
    except Exception as error:
        logger.warning(f"gate 调用失败，跳过 gate，直接执行提取: {error}")
        return True, "error", None
