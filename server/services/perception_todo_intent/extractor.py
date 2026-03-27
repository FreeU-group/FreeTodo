from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime
from typing import TYPE_CHECKING

from llm.llm_client import LLMClient
from schemas.perception_todo_intent import (
    ExtractedTodoCandidate,
    IntentType,
    MemoryMatch,
    MemoryMatchAction,
    TodoRole,
)
from util.prompt_loader import get_prompt
from util.settings import settings

if TYPE_CHECKING:
    from schemas.perception_todo_intent import TodoIntentContext

logger = logging.getLogger(__name__)


class TodoIntentExtractor:
    """Todo intent extractor powered by LLM text generation.

    When Memory context (active_todos / user_profile) is provided, the LLM also
    performs Memory Match to classify each candidate as new / link_existing /
    conflict / cancel_existing relative to the existing todo list.
    """

    _JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)

    def __init__(
        self,
        *,
        llm_client: LLMClient | None = None,
        model: str | None = None,
        temperature: float = 0.2,
        max_tokens: int = 800,
        prompt_category: str = "perception_todo_intent_extraction",
    ):
        self._llm_client = llm_client or LLMClient()
        self._model = (model or "").strip()
        self._temperature = float(temperature)
        self._max_tokens = max(64, int(max_tokens))
        self._prompt_category = prompt_category

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
            inviter_raw = item.get("inviter")
            inviter = str(inviter_raw).strip() if inviter_raw else None

            # Backward compat: if LLM still returns intent_type=invitation,
            # convert it to a tag instead of using IntentType enum.
            intent_type_raw = str(item.get("intent_type") or "todo").strip().lower()
            is_invitation = intent_type_raw == "invitation"

            who_founder_raw = item.get("who_founder")
            who_founder = str(who_founder_raw).strip() if who_founder_raw else None

            who_executor_raw = item.get("who_executor")
            who_executor = str(who_executor_raw).strip() if who_executor_raw else None

            todo_role_raw = str(item.get("todo_role") or "executor").strip().lower()
            try:
                todo_role = TodoRole(todo_role_raw)
            except ValueError:
                todo_role = TodoRole.EXECUTOR

            when_raw = item.get("when")
            when = str(when_raw).strip() if when_raw else None

            where_raw = item.get("where") or item.get("location")
            where = str(where_raw).strip() if where_raw else None

            tags = self._to_tags(item.get("tags"))
            if (is_invitation or inviter) and "邀约" not in tags:
                tags.append("邀约")

            out.append(
                ExtractedTodoCandidate(
                    name=name,
                    description=str(item.get("description")).strip()
                    if item.get("description") is not None
                    else None,
                    who_founder=who_founder,
                    who_executor=who_executor,
                    when=when,
                    where=where,
                    start_time=self._to_datetime(item.get("start_time")),
                    due=self._to_datetime(item.get("due")),
                    deadline=self._to_datetime(item.get("deadline")),
                    time_zone=str(item.get("time_zone")).strip()
                    if item.get("time_zone") is not None
                    else None,
                    priority=str(item.get("priority") or "none").strip().lower() or "none",
                    tags=tags,
                    confidence=self._to_confidence(item.get("confidence")),
                    source_text=str(item.get("source_text")).strip()
                    if item.get("source_text") is not None
                    else None,
                    memory_match=self._parse_memory_match(item.get("memory_match")),
                    intent_type=IntentType.INVITATION if is_invitation else IntentType.TODO,
                    todo_role=todo_role,
                    inviter=inviter,
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

        model = str(cfg.get("model", "")).strip() or self._model or llm_client.model
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

        from util.time_utils import get_utc_now, to_local  # noqa: PLC0415

        now = get_utc_now()
        local_now = to_local(now) or now
        current_time_str = local_now.strftime("%Y-%m-%d %H:%M:%S %Z")

        user_prompt = get_prompt(
            prompt_category,
            "user_prompt",
            text=merged_text,
            current_time=current_time_str,
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

        result_text = await asyncio.to_thread(
            llm_client.chat,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature,
            model=model,
            max_tokens=max_tokens,
            log_meta={
                "endpoint": "perception_todo_intent_extract",
                "feature_type": "perception",
                "response_type": "extract",
                "user_query": merged_text,
                "context_id": context.context_id,
                "has_memory_context": has_memory,
            },
        )
        if not (result_text or "").strip():
            raise ValueError("extractor_empty_response")
        logger.info(
            "[Extractor] LLM响应: context_id=%s model=%s response_len=%d preview=%.200s",
            context.context_id[:16],
            model,
            len(result_text),
            result_text,
        )
        payload = self._parse_json(result_text)
        if payload is None or (isinstance(payload, dict) and not payload):
            logger.warning(
                "[Extractor] LLM响应无法解析为JSON, 视为无候选项. "
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
