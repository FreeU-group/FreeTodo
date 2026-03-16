from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime
from typing import TYPE_CHECKING

from llm.agno_agent import AgnoAgentService
from llm.llm_client import LLMClient
from schemas.perception_todo_intent import (
    ExtractedTodoCandidate,
    IntentType,
    MemoryMatch,
    MemoryMatchAction,
)
from util.prompt_loader import get_prompt
from util.settings import settings

if TYPE_CHECKING:
    from schemas.perception_todo_intent import TodoIntentContext

logger = logging.getLogger(__name__)


class TodoIntentExtractor:
    """Todo intent extractor powered by Agno agent.

    When Memory context (active_todos / user_profile) is provided, the agent also
    performs Memory Match to classify each candidate as new / link_existing /
    conflict / cancel_existing relative to the existing todo list.
    """

    _JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)

    def __init__(
        self,
        *,
        llm_client: LLMClient | None = None,
        agno_service: AgnoAgentService | None = None,
        model: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 800,
        prompt_category: str = "perception_todo_intent_extraction",
    ):
        self._llm_client = llm_client or LLMClient()
        self._agno_service = agno_service
        self._model = (model or "").strip()
        self._temperature = float(temperature)
        self._max_tokens = max(64, int(max_tokens))
        self._prompt_category = prompt_category

    def _run_agno_sync(self, message: str, model: str | None) -> str:
        service = self._agno_service or AgnoAgentService(
            lang="zh",
            selected_tools=[],
            model=model or None,
            agent_name="TodoIntentExtractor",
        )
        response_parts: list[str] = []
        for chunk in service.stream_response(message, include_tool_events=False):
            response_parts.append(chunk)
        return "".join(response_parts)

    @staticmethod
    def _compose_agno_message(system_prompt: str, user_prompt: str) -> str:
        return (
            "[系统任务]\n"
            f"{system_prompt.strip()}\n\n"
            "[用户输入]\n"
            f"{user_prompt.strip()}\n\n"
            "请严格只返回 JSON，不要输出额外解释。"
        )

    @staticmethod
    def _load_from_settings() -> dict:
        cfg = settings.get("perception.todo_intent.extractor", {}) or {}
        if not isinstance(cfg, dict):
            cfg = {}
        return cfg

    @staticmethod
    def _to_datetime(value: object) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        text = str(value).strip()
        if not text:
            return None
        normalized = text.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except Exception:
            return None

    @staticmethod
    def _to_confidence(value: object) -> float:
        if isinstance(value, int | float):
            val = float(value)
        elif isinstance(value, str):
            text = value.strip()
            if not text:
                return 0.0
            try:
                val = float(text)
            except ValueError:
                return 0.0
        else:
            return 0.0
        if val < 0:
            return 0.0
        if val > 1:
            return 1.0
        return val

    @staticmethod
    def _to_tags(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        tags: list[str] = []
        for item in value:
            text = str(item).strip()
            if text:
                tags.append(text)
        return tags

    @classmethod
    def _parse_json(cls, text: str) -> dict:
        raw = (text or "").strip()
        if raw.startswith("```json"):
            raw = raw[7:]
        if raw.startswith("```"):
            raw = raw[3:]
        if raw.endswith("```"):
            raw = raw[:-3]
        raw = raw.strip()
        if not raw:
            return {}

        parsed: object | None = None
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = None
        if isinstance(parsed, dict):
            return parsed
        if parsed is not None:
            return {}

        match = cls._JSON_BLOCK_RE.search(raw)
        if not match:
            return {}
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}

    @staticmethod
    def _parse_memory_match(raw: object) -> MemoryMatch:
        if not isinstance(raw, dict):
            return MemoryMatch()
        action_str = str(raw.get("action", "new")).strip().lower()
        try:
            action = MemoryMatchAction(action_str)
        except ValueError:
            action = MemoryMatchAction.NEW
        matched_name = raw.get("matched_todo_name")
        reason = raw.get("reason")
        return MemoryMatch(
            action=action,
            matched_todo_name=str(matched_name).strip() if matched_name else None,
            reason=str(reason).strip() if reason else None,
        )

    def _to_candidates(self, payload: dict) -> list[ExtractedTodoCandidate]:
        todos_raw = payload.get("todos")
        if not isinstance(todos_raw, list):
            return []

        out: list[ExtractedTodoCandidate] = []
        for item in todos_raw:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("title") or "").strip()
            if not name:
                continue
            intent_type_raw = str(item.get("intent_type") or "todo").strip().lower()
            try:
                intent_type = IntentType(intent_type_raw)
            except ValueError:
                intent_type = IntentType.TODO

            inviter_raw = item.get("inviter")
            inviter = str(inviter_raw).strip() if inviter_raw else None

            location_raw = item.get("location")
            location = str(location_raw).strip() if location_raw else None

            out.append(
                ExtractedTodoCandidate(
                    name=name,
                    description=str(item.get("description")).strip()
                    if item.get("description") is not None
                    else None,
                    start_time=self._to_datetime(item.get("start_time")),
                    due=self._to_datetime(item.get("due")),
                    deadline=self._to_datetime(item.get("deadline")),
                    time_zone=str(item.get("time_zone")).strip()
                    if item.get("time_zone") is not None
                    else None,
                    priority=str(item.get("priority") or "none").strip().lower() or "none",
                    tags=self._to_tags(item.get("tags")),
                    confidence=self._to_confidence(item.get("confidence")),
                    source_text=str(item.get("source_text")).strip()
                    if item.get("source_text") is not None
                    else None,
                    memory_match=self._parse_memory_match(item.get("memory_match")),
                    intent_type=intent_type,
                    inviter=inviter,
                    location=location,
                )
            )
        return out

    async def extract(
        self,
        context: TodoIntentContext,
        *,
        strict_json: bool = False,
        active_todos: str = "",
        user_profile: str = "",
    ) -> list[ExtractedTodoCandidate]:
        cfg = self._load_from_settings()
        llm_client = self._llm_client
        if not llm_client.is_available():
            return []

        model = (
            str(cfg.get("model", "")).strip()
            or self._model
            or str(settings.get("llm.todo_extraction_model", "")).strip()
            or llm_client.model
        )
        temperature = float(cfg.get("temperature", self._temperature))
        max_tokens = int(cfg.get("max_tokens", self._max_tokens))
        prompt_category = str(cfg.get("prompt_category", self._prompt_category))

        merged_text = (context.merged_text or "").strip()
        if not merged_text:
            return []

        has_memory = bool(active_todos.strip() or user_profile.strip())

        if has_memory:
            system_prompt = get_prompt(prompt_category, "system_assistant")
        else:
            system_prompt = get_prompt(prompt_category, "system_assistant_no_memory") or get_prompt(
                prompt_category, "system_assistant"
            )

        user_prompt = get_prompt(
            prompt_category,
            "user_prompt",
            text=merged_text,
            source_set=", ".join([source.value for source in context.source_set]) or "unknown",
            app_name=str(context.metadata.get("app_name") or ""),
            window_title=str(context.metadata.get("window_title") or ""),
            speaker=str(context.metadata.get("speaker") or ""),
            strict_json="true" if strict_json else "false",
            active_todos=active_todos or "(无已有待办)",
            user_profile=user_profile or "(无用户画像)",
        )
        if strict_json:
            user_prompt = (
                f"{user_prompt}\n\n仅返回严格 JSON，不要包含任何解释、前后缀或 markdown 代码块。"
            )

        if not system_prompt or not user_prompt:
            raise ValueError("missing_extractor_prompt")

        agno_message = self._compose_agno_message(system_prompt, user_prompt)
        _ = (temperature, max_tokens)
        result_text = await asyncio.to_thread(self._run_agno_sync, agno_message, model)
        if not (result_text or "").strip():
            raise ValueError("extractor_empty_response")
        logger.info(
            "[Extractor] Agno响应: context_id=%s model=%s response_len=%d preview=%.200s",
            context.context_id[:16],
            model,
            len(result_text),
            result_text,
        )
        payload = self._parse_json(result_text)
        if payload is None or (isinstance(payload, dict) and not payload):
            logger.warning(
                "[Extractor] Agno响应无法解析为JSON, 视为无候选项. "
                "context_id=%s, response_preview=%.200s",
                context.context_id,
                result_text,
            )
            return []
        candidates = self._to_candidates(payload)
        logger.info(
            "[Extractor] 解析完成: context_id=%s candidates=%d names=%s",
            context.context_id[:16],
            len(candidates),
            [c.name for c in candidates][:5],
        )
        return candidates
