from __future__ import annotations

import asyncio
import logging
from typing import Any

from llm.llm_client import LLMClient
from schemas.perception_todo_intent import IntentGateDecision, TodoIntentContext
from services.agent_activity_tracker import start_activity, stop_activity
from services.audio_extraction.gate import (
    coerce_gate_decision,
    parse_gate_response,
)
from util.prompt_loader import get_prompt
from util.settings import settings
from util.token_usage_logger import log_token_usage

logger = logging.getLogger(__name__)


class TodoIntentGate:
    """Todo intent gate with LLM decision + robust fallback."""

    def __init__(
        self,
        *,
        llm_client: LLMClient | None = None,
        min_text_length: int = 8,
        model: str | None = None,
        temperature: float = 0.0,
        max_tokens: int = 160,
        prompt_category: str = "transcription_extraction_gate",
    ):
        self._llm_client = llm_client or LLMClient()
        self._min_text_length = max(0, int(min_text_length))
        self._model = (model or "").strip()
        self._temperature = float(temperature)
        self._max_tokens = max(16, int(max_tokens))
        self._prompt_category = prompt_category

    @staticmethod
    def _load_from_settings() -> dict[str, Any]:
        cfg = settings.get("perception.todo_intent.gate", {}) or {}
        if not isinstance(cfg, dict):
            cfg = {}
        return cfg

    async def decide(self, context: TodoIntentContext) -> IntentGateDecision:  # noqa: PLR0911
        text = (context.merged_text or "").strip()
        if not text:
            logger.info("[Gate] 跳过: 空文本")
            return IntentGateDecision(should_extract=False, reason="empty_text")
        if len(text) < self._min_text_length:
            logger.info("[Gate] 跳过: 文本过短 (%d < %d)", len(text), self._min_text_length)
            return IntentGateDecision(should_extract=False, reason="too_short")

        cfg = self._load_from_settings()
        enabled = bool(cfg.get("enabled", True))
        if not enabled:
            return IntentGateDecision(should_extract=True, reason="gate_disabled")

        llm_client = self._llm_client
        if not llm_client.is_available():
            return IntentGateDecision(should_extract=True, reason="llm_unavailable_fallback")

        model = (str(cfg.get("model", "")).strip() or self._model or llm_client.small_model).strip()
        temperature = float(cfg.get("temperature", self._temperature))
        max_tokens = int(cfg.get("max_tokens", self._max_tokens))
        prompt_category = str(cfg.get("prompt_category", self._prompt_category))

        client = llm_client._get_client()

        system_prompt = get_prompt(prompt_category, "system_assistant")
        user_prompt = get_prompt(prompt_category, "user_prompt", text=text)
        if not system_prompt or not user_prompt:
            return IntentGateDecision(should_extract=True, reason="missing_prompt_fallback")

        aid = start_activity(agent_type="intent_gate", task=text[:100], model=model)
        try:
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            usage = getattr(response, "usage", None)
            if usage:
                log_token_usage(
                    model=model,
                    input_tokens=int(usage.prompt_tokens or 0),
                    output_tokens=int(usage.completion_tokens or 0),
                    endpoint="perception_todo_intent_gate",
                    user_query=text,
                    response_type="gate",
                    feature_type="perception",
                )

            result_text = (response.choices[0].message.content or "").strip()
            parsed = parse_gate_response(result_text)
            if not isinstance(parsed, dict):
                logger.info("[Gate] LLM响应无法解析, fallback=extract. raw=%.120s", result_text)
                return IntentGateDecision(
                    should_extract=True,
                    reason="gate_unparseable_fallback",
                )

            decision = coerce_gate_decision(parsed)
            if not isinstance(decision, bool):
                logger.info("[Gate] 未知决策格式, fallback=extract. parsed=%s", parsed)
                return IntentGateDecision(
                    should_extract=True,
                    reason="gate_unknown_format_fallback",
                    raw=parsed,
                )

            reason = str(parsed.get("reason") or parsed.get("explanation") or "ok")
            logger.info(
                "[Gate] 决策: should_extract=%s reason=%s text_preview=%.60s",
                decision,
                reason[:80],
                text[:60],
            )
            return IntentGateDecision(
                should_extract=decision,
                reason=reason[:120],
                raw=parsed,
            )
        except Exception:
            logger.warning("[Gate] LLM调用异常, fallback=extract", exc_info=True)
            stop_activity(aid, status="error")
            return IntentGateDecision(
                should_extract=True,
                reason="gate_error_fallback",
            )
        finally:
            stop_activity(aid)
