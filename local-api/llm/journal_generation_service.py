"""Journal generation service for objective and AI-view content."""

from __future__ import annotations

from datetime import datetime
from typing import Any, cast

from llm.llm_client import LLMClient
from util.logging_config import get_logger
from util.token_usage_logger import log_token_usage

logger = get_logger()

_MAX_ITEMS = 20
_RESPONSE_PREVIEW_LENGTH = 500


class JournalGenerationService:
    """Generate objective log and AI view for journals."""

    def __init__(self) -> None:
        self.llm_client = LLMClient()

    def generate_objective(
        self,
        *,
        activities: list[dict[str, Any]],
        todos: list[dict[str, Any]],
        language: str,
    ) -> str:
        if not self.llm_client.is_available():
            logger.warning("LLM client unavailable, using fallback objective log")
            return self._fallback_objective(activities, todos, language)

        try:
            system_prompt = (
                "You are a calm journaling assistant. Summarize facts only, no judgment."
            )
            user_prompt = self._build_objective_prompt(activities, todos, language)
            content = self._call_llm(system_prompt, user_prompt, response_type="objective")
            return content or self._fallback_objective(activities, todos, language)
        except Exception as exc:
            logger.error(f"Objective log generation failed: {exc}", exc_info=True)
            return self._fallback_objective(activities, todos, language)

    def generate_ai_view(
        self,
        *,
        title: str,
        content_original: str,
        activities: list[dict[str, Any]],
        todos: list[dict[str, Any]],
        language: str,
    ) -> str:
        if not self.llm_client.is_available():
            logger.warning("LLM client unavailable, using fallback AI view")
            return self._fallback_ai_view(content_original, language)

        try:
            system_prompt = (
                "You are a gentle observer. Describe the day in a supportive tone, no judgment."
            )
            user_prompt = self._build_ai_prompt(
                title=title,
                content_original=content_original,
                activities=activities,
                todos=todos,
                language=language,
            )
            content = self._call_llm(system_prompt, user_prompt, response_type="ai_view")
            return content or self._fallback_ai_view(content_original, language)
        except Exception as exc:
            logger.error(f"AI view generation failed: {exc}", exc_info=True)
            return self._fallback_ai_view(content_original, language)

    def _call_llm(self, system_prompt: str, user_prompt: str, response_type: str) -> str:
        client = self.llm_client._get_client()
        response = cast(
            "Any",
            client.chat.completions.create(
                model=self.llm_client.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.4,
                max_tokens=800,
            ),
        )

        usage = getattr(response, "usage", None)
        if usage:
            log_token_usage(
                model=self.llm_client.model,
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.completion_tokens,
                endpoint="journal_generation",
                response_type=response_type,
                feature_type="journal_generation",
            )

        content = (response.choices[0].message.content or "").strip()
        if not content:
            logger.warning("LLM returned empty content for journal generation")
            return ""
        return content

    def _build_objective_prompt(
        self,
        activities: list[dict[str, Any]],
        todos: list[dict[str, Any]],
        language: str,
    ) -> str:
        activity_text = self._format_activity_text(activities)
        todo_text = self._format_todo_text(todos)
        return (
            "Generate an objective log in the following language. "
            f"Language: {language}.\n\n"
            "Activities:\n"
            f"{activity_text}\n\n"
            "Todos:\n"
            f"{todo_text}\n\n"
            "Return a short timeline and a brief summary."
        )

    def _build_ai_prompt(
        self,
        *,
        title: str,
        content_original: str,
        activities: list[dict[str, Any]],
        todos: list[dict[str, Any]],
        language: str,
    ) -> str:
        activity_text = self._format_activity_text(activities)
        todo_text = self._format_todo_text(todos)
        return (
            "Write a gentle AI-view journal entry based on the original notes and the day data. "
            f"Language: {language}.\n\n"
            f"Title: {title or 'Untitled'}\n"
            f"Original Notes:\n{content_original}\n\n"
            "Activities:\n"
            f"{activity_text}\n\n"
            "Todos:\n"
            f"{todo_text}\n\n"
            "Keep it supportive, observational, and non-judgmental."
        )

    def _format_activity_text(self, activities: list[dict[str, Any]]) -> str:
        if not activities:
            return "(none)"
        lines: list[str] = []
        for activity in activities[:_MAX_ITEMS]:
            title = activity.get("title") or "Activity"
            summary = activity.get("summary") or ""
            start = self._format_time(activity.get("start_time"))
            line = f"- {start} {title}"
            if summary:
                line = f"{line}: {summary}"
            lines.append(line)
        if len(activities) > _MAX_ITEMS:
            lines.append(f"- ... ({len(activities) - _MAX_ITEMS} more)")
        return "\n".join(lines)

    def _format_todo_text(self, todos: list[dict[str, Any]]) -> str:
        if not todos:
            return "(none)"
        lines: list[str] = []
        for todo in todos[:_MAX_ITEMS]:
            name = todo.get("name") or "Todo"
            status = todo.get("status") or "unknown"
            time_str = self._format_time(todo.get("deadline") or todo.get("start_time"))
            line = f"- {name} ({status})"
            if time_str:
                line = f"{line} @ {time_str}"
            lines.append(line)
        if len(todos) > _MAX_ITEMS:
            lines.append(f"- ... ({len(todos) - _MAX_ITEMS} more)")
        return "\n".join(lines)

    def _format_time(self, value: Any) -> str:
        if isinstance(value, datetime):
            return value.strftime("%H:%M")
        if value:
            return str(value)
        return ""

    def _fallback_objective(
        self,
        activities: list[dict[str, Any]],
        todos: list[dict[str, Any]],
        language: str,
    ) -> str:
        activity_count = len(activities)
        todo_count = len(todos)
        if language.lower().startswith("zh"):
            return (
                "Objective log (ZH):\n"
                f"- Activities: {activity_count}\n"
                f"- Todos: {todo_count}\n"
                "- Detailed record unavailable"
            )
        return (
            "Objective log:\n"
            f"- Activities: {activity_count}\n"
            f"- Todos: {todo_count}\n"
            "- Detailed record unavailable"
        )

    def _fallback_ai_view(self, content_original: str, language: str) -> str:
        preview = content_original.strip()[:_RESPONSE_PREVIEW_LENGTH]
        if language.lower().startswith("zh"):
            if preview:
                return f"AI view (ZH):\nYou noted: {preview}"
            return "AI view (ZH):\nNotes are light today, but your effort still counts."
        if preview:
            return f"AI view:\nYou noted: {preview}"
        return "AI view:\nToday is light on notes, but your effort still counts."


journal_generation_service = JournalGenerationService()
