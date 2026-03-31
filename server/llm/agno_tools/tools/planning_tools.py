"""Planning Tools — AI-powered time planning for todos."""

from __future__ import annotations

import asyncio
import json
from datetime import timedelta
from typing import TYPE_CHECKING

from llm.agno_tools.base import get_message
from util.logging_config import get_logger
from util.time_utils import get_local_now

if TYPE_CHECKING:
    from repositories.sql_todo_repository import SqlTodoRepository

logger = get_logger()

_PLAN_SYSTEM = (
    "你是一个智能时间规划助手。根据用户的待办事项列表，为用户规划合理的时间安排。\n\n"
    "规划原则：\n"
    "1. 已有明确时间的待办，保持不变\n"
    "2. 没有时间的待办，根据优先级和预估耗时安排到空闲时段\n"
    "3. 高优先级的待办尽量安排在上午精力最好的时候\n"
    "4. 会议/社交类安排在下午\n"
    "5. 每个待办之间留 15-30 分钟缓冲\n"
    "6. 午餐时间 12:00-13:00 不安排工作\n"
    "7. 工作时间默认 9:00-22:00\n\n"
    "输出必须是 JSON：\n"
    '{"suggestions": [{"todo_id": 1, "todo_name": "xxx", '
    '"suggested_start": "2026-03-31T09:00:00+08:00", '
    '"suggested_end": "2026-03-31T10:00:00+08:00", '
    '"reason": "一句话原因"}], "summary": "一句话总结"}\n\n'
    "只输出 JSON，不要解释。"
)


def _build_todo_lines(todos: list[dict]) -> list[str]:
    lines = []
    for t in todos:
        tid = t.get("id")
        name = t.get("name", "")
        priority = t.get("priority", "none")
        start = t.get("start_time") or t.get("dtstart")
        end = t.get("end_time")
        due = t.get("due")
        tags = t.get("tags")
        desc = t.get("description", "")

        line = f"- ID:{tid} | {name} | 优先级:{priority}"
        if start:
            line += f" | 开始:{start}"
        if end:
            line += f" | 结束:{end}"
        if due:
            line += f" | 截止:{due}"
        if tags:
            tag_str = ",".join(tags) if isinstance(tags, list) else str(tags)
            line += f" | 标签:{tag_str}"
        if desc:
            line += f" | 描述:{desc[:80]}"
        lines.append(line)
    return lines


class PlanningTools:
    """Time planning tools mixin for Agno Agent."""

    lang: str
    todo_repo: SqlTodoRepository

    def _msg(self, key: str, **kwargs) -> str:
        return get_message(self.lang, key, **kwargs)

    def plan_schedule(
        self,
        scope: str = "today",
        auto_apply: bool = True,
    ) -> str:
        """AI-powered smart time planning for user's todos.

        Analyzes all active todos and generates an optimized schedule,
        then optionally writes the suggested times back to each todo.

        Args:
            scope: Planning scope - "today" for today, "3days" for next 3 days, "week" for this week
            auto_apply: If True, automatically update each todo's start_time/end_time

        Returns:
            Formatted schedule plan with time assignments and summary
        """
        try:
            from llm.llm_client import LLMClient  # noqa: PLC0415
            from util.base_paths import get_user_data_dir  # noqa: PLC0415

            llm = LLMClient()
            if not llm.is_available():
                return "LLM 不可用，无法进行时间规划。"

            todos = self.todo_repo.list_todos(limit=200, offset=0, status="active")
            todo_lines = _build_todo_lines(todos)
            if not todo_lines:
                return "当前没有活跃的待办事项需要安排。"

            now = get_local_now()
            if scope == "week":
                weekday = now.weekday()
                start = (now - timedelta(days=weekday)).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
                end = start + timedelta(days=7)
                label = f"本周（{start.strftime('%m/%d')} - {end.strftime('%m/%d')}）"
            elif scope == "3days":
                start = now.replace(hour=0, minute=0, second=0, microsecond=0)
                end = start + timedelta(days=3)
                label = f"未来3天（{start.strftime('%m/%d')} - {end.strftime('%m/%d')}）"
            else:
                label = f"今天（{now.strftime('%Y-%m-%d %A')}）"

            profile_text = ""
            profile_file = get_user_data_dir() / "memory" / "profile_L4" / "user_profile.md"
            if profile_file.exists():
                profile_text = profile_file.read_text(encoding="utf-8")[:300]

            user_prompt = (
                f"当前时间：{now.strftime('%Y-%m-%d %H:%M')}（{now.strftime('%A')}）\n"
                f"规划范围：{label}\n\n"
                f"用户画像：\n{profile_text or '无'}\n\n"
                f"待办列表：\n" + "\n".join(todo_lines) + "\n\n"
                f"请为用户规划{label}的时间安排。"
            )

            messages = [
                {"role": "system", "content": _PLAN_SYSTEM},
                {"role": "user", "content": user_prompt},
            ]

            resp = llm.chat(messages, 0.3, None, 2048)
            if not resp:
                return "AI 未返回有效的时间规划。"

            clean = resp.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            if clean.endswith("```"):
                clean = clean[:-3]

            parsed = json.loads(clean.strip())
            suggestions = parsed.get("suggestions", [])
            summary = parsed.get("summary", "")

            if auto_apply and suggestions:
                applied = 0
                for s in suggestions:
                    todo_id = s.get("todo_id")
                    start_time = s.get("suggested_start")
                    end_time = s.get("suggested_end")
                    if todo_id and start_time:
                        update_data: dict = {"start_time": start_time}
                        if end_time:
                            update_data["end_time"] = end_time
                        ok = self.todo_repo.update(todo_id, **update_data)
                        if ok:
                            applied += 1
                logger.info(f"AI 规划已应用: {applied}/{len(suggestions)} 条待办已更新时间")

            lines = []
            if summary:
                lines.append(f"📋 {summary}\n")
            lines.append(f"已为 {len(suggestions)} 条待办安排时间：\n")
            for s in suggestions:
                start_str = s.get("suggested_start", "")
                end_str = s.get("suggested_end", "")
                time_range = (
                    f"{start_str[11:16]} - {end_str[11:16]}" if start_str and end_str else "待定"
                )
                reason = s.get("reason", "")
                name = s.get("todo_name", "")
                line = f"- **{name}**：{time_range}"
                if reason:
                    line += f"（{reason}）"
                lines.append(line)

            if auto_apply:
                lines.append(f"\n✅ 已自动将时间写入待办列表。")

            return "\n".join(lines)

        except json.JSONDecodeError:
            return f"AI 返回的规划格式解析失败，原始内容：\n{resp[:300] if resp else '(空)'}"
        except Exception as e:
            logger.exception("plan_schedule failed")
            return f"时间规划失败：{e}"
