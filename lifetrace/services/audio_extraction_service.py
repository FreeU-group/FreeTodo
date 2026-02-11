"""音频提取服务

处理音频转录文本的待办和日程提取逻辑。
"""

import hashlib
import json
from typing import Any, cast

from sqlmodel import select

from lifetrace.llm.llm_client import LLMClient
from lifetrace.services.audio_extraction.gate import should_extract_with_llm_gate
from lifetrace.services.audio_extraction.text_chunking import chunk_transcription
from lifetrace.storage import get_session
from lifetrace.storage.models import Transcription
from lifetrace.storage.sql_utils import col
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.settings import settings
from lifetrace.util.token_usage_logger import log_token_usage

logger = get_logger()


class AudioExtractionService:
    """音频提取服务"""

    def __init__(self, llm_client: LLMClient):
        """初始化提取服务

        Args:
            llm_client: LLM客户端
        """
        self.llm_client = llm_client

    def _stable_extracted_id(self, prefix: str, item: dict) -> str:
        """生成稳定的提取项ID

        Args:
            prefix: 前缀
            item: 提取项字典

        Returns:
            稳定的ID字符串
        """
        base = "|".join(
            [
                str(item.get("source_text") or ""),
                str(item.get("start_time") or item.get("deadline") or item.get("time") or ""),
            ]
        )
        digest = hashlib.sha1(base.encode("utf-8"), usedforsecurity=False).hexdigest()[:16]
        return f"{prefix}_{digest}"

    def _enrich_extracted_items(self, prefix: str, items: list[dict]) -> list[dict]:
        """丰富提取项，添加缺失字段

        Args:
            prefix: 前缀
            items: 提取项列表

        Returns:
            丰富后的提取项列表
        """
        out: list[dict] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            it2 = dict(it)
            it2.setdefault(
                "dedupe_key",
                "|".join(
                    [
                        str(it2.get("source_text") or ""),
                        str(it2.get("start_time") or it2.get("deadline") or it2.get("time") or ""),
                    ]
                ),
            )
            it2.setdefault("id", self._stable_extracted_id(prefix, it2))
            it2.setdefault("linked", False)
            it2.setdefault("linked_todo_id", None)
            out.append(it2)
        return out

    def update_extraction(
        self,
        transcription_id: int,
        todos: list[dict] | None = None,
        schedules: list[dict] | None = None,
    ) -> Transcription | None:
        """更新提取结果

        Args:
            transcription_id: 转录ID
            todos: 待办事项列表
            schedules: 日程安排列表

        Returns:
            更新后的Transcription对象
        """
        with get_session() as session:
            transcription = session.get(Transcription, transcription_id)
            if transcription:
                if todos is not None:
                    transcription.extracted_todos = json.dumps(
                        self._enrich_extracted_items("todo", todos), ensure_ascii=False
                    )
                if schedules is not None:
                    transcription.extracted_schedules = json.dumps(
                        self._enrich_extracted_items("schedule", schedules), ensure_ascii=False
                    )
                transcription.extraction_status = "completed"
                session.commit()
                session.refresh(transcription)
            return transcription

    def _load_extraction_from_transcription(
        self, transcription: Transcription
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """从转录对象中加载提取结果

        Args:
            transcription: 转录对象

        Returns:
            (todos, schedules) 元组
        """
        todos: list[dict[str, Any]] = []
        schedules: list[dict[str, Any]] = []

        if transcription.extracted_todos:
            try:
                todos = json.loads(transcription.extracted_todos)
            except Exception:
                todos = []
        if transcription.extracted_schedules:
            try:
                schedules = json.loads(transcription.extracted_schedules)
            except Exception:
                schedules = []

        return todos, schedules

    def _build_item_lookup_maps(
        self, items: list[dict[str, Any]]
    ) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
        """构建项目的查找映射（按 id 和 dedupe_key）

        Args:
            items: 项目列表

        Returns:
            (by_id, by_dedupe) 元组
        """
        by_id: dict[str, dict[str, Any]] = {}
        by_dedupe: dict[str, dict[str, Any]] = {}

        for item in items:
            if not isinstance(item, dict):
                continue
            item_id = item.get("id")
            dedupe_key = item.get("dedupe_key")
            if item_id:
                by_id[str(item_id)] = item
            if dedupe_key:
                by_dedupe[str(dedupe_key)] = item

        return by_id, by_dedupe

    def _apply_links_to_items(
        self,
        links: list[dict[str, Any]],
        todo_by_id: dict[str, dict[str, Any]],
        todo_by_dedupe: dict[str, dict[str, Any]],
        sched_by_id: dict[str, dict[str, Any]],
        sched_by_dedupe: dict[str, dict[str, Any]],
    ) -> int:
        """应用链接到项目

        Args:
            links: 链接列表
            todo_by_id: 待办按 id 的映射
            todo_by_dedupe: 待办按 dedupe_key 的映射
            sched_by_id: 日程按 id 的映射
            sched_by_dedupe: 日程按 dedupe_key 的映射

        Returns:
            更新的项目数量
        """
        updated = 0
        for link in links:
            kind = link.get("kind")
            item_id = link.get("item_id")
            todo_id = link.get("todo_id")
            if not kind or not item_id or not todo_id:
                continue

            if kind == "todo":
                target = todo_by_id.get(item_id) or todo_by_dedupe.get(item_id)
            else:
                target = sched_by_id.get(item_id) or sched_by_dedupe.get(item_id)

            if not target:
                continue

            target["linked"] = True
            target["linked_todo_id"] = int(todo_id)
            updated += 1

        return updated

    def link_extracted_items(
        self,
        recording_id: int,
        links: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """标记提取项为已链接到待办（持久化在转录JSON中）

        Args:
            recording_id: 录音ID
            links: 链接列表

        Returns:
            包含更新数量的字典
        """
        with get_session() as session:
            # 查询转录记录（一个 recording_id 只应该有一条）
            statement = (
                select(Transcription)
                .where(Transcription.audio_recording_id == recording_id)
                .order_by(col(Transcription.id).desc())
            )
            transcription = session.exec(statement).first()
            if not transcription:
                raise ValueError("transcription not found")

            todos, schedules = self._load_extraction_from_transcription(transcription)

            # Backfill missing fields for legacy stored items (and persist)
            todos = self._enrich_extracted_items("todo", todos)
            schedules = self._enrich_extracted_items("schedule", schedules)

            todo_by_id, todo_by_dedupe = self._build_item_lookup_maps(todos)
            sched_by_id, sched_by_dedupe = self._build_item_lookup_maps(schedules)

            updated = self._apply_links_to_items(
                links, todo_by_id, todo_by_dedupe, sched_by_id, sched_by_dedupe
            )

            transcription.extracted_todos = json.dumps(todos, ensure_ascii=False)
            transcription.extracted_schedules = json.dumps(schedules, ensure_ascii=False)
            session.add(transcription)
            session.commit()

            return {"updated": updated}

    def _load_extraction_prompts(self, text: str) -> tuple[str, str]:
        """加载提取提示词

        Args:
            text: 转录文本

        Returns:
            (system_prompt, user_prompt) 元组
        """
        system_prompt = get_prompt("transcription_extraction", "system_assistant")
        user_prompt = get_prompt("transcription_extraction", "user_prompt", text=text)

        if not system_prompt or not user_prompt:
            logger.warning("无法加载提取提示词，使用默认提示词")
            system_prompt = "你是一个专业的任务和日程提取助手。"
            user_prompt = f"请从以下转录文本中提取待办事项和日程安排。\n\n转录文本：\n{text}\n\n只返回JSON，不要其他内容。"

        return system_prompt, user_prompt

    def _parse_llm_response(self, result_text: str) -> dict[str, Any]:
        """解析 LLM 响应文本

        Args:
            result_text: LLM 返回的原始文本

        Returns:
            解析后的 JSON 字典
        """
        # 移除可能的markdown代码块标记
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.startswith("```"):
            result_text = result_text[3:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]
        result_text = result_text.strip()

        return json.loads(result_text)

    def _normalize_extraction_result(self, result: dict[str, Any]) -> dict[str, Any]:
        """规范化提取结果格式

        将字符串数组转换为标准格式（对象数组，包含 source_text）

        Args:
            result: 原始提取结果

        Returns:
            规范化后的结果
        """
        # 处理 todos
        if "todos" in result:
            todos = result["todos"]
            if todos and isinstance(todos[0], str):
                result["todos"] = [
                    {
                        "title": item,
                        "description": None,
                        "source_text": item,
                    }
                    for item in todos
                ]

        # 兼容旧模型输出：将 schedules 降级合并到 todos
        if "schedules" in result:
            schedules = result.get("schedules") or []
            todos = result.get("todos") or []
            if not isinstance(todos, list):
                todos = []

            converted: list[dict[str, Any]] = []
            if schedules and isinstance(schedules[0], str):
                converted = [
                    {
                        "title": item,
                        "description": None,
                        "start_time": None,
                        "source_text": item,
                    }
                    for item in schedules
                    if isinstance(item, str) and item.strip()
                ]
            elif schedules and isinstance(schedules[0], dict):
                for schedule in schedules:
                    if not isinstance(schedule, dict):
                        continue
                    converted.append(
                        {
                            "title": schedule.get("title") or schedule.get("source_text") or "",
                            "description": schedule.get("description"),
                            "start_time": schedule.get("time") or schedule.get("start_time"),
                            "source_text": schedule.get("source_text") or schedule.get("title"),
                        }
                    )

            if converted:
                result["todos"] = [*todos, *converted]
            result.pop("schedules", None)

        return result

    async def extract_todos(  # noqa: C901, PLR0912, PLR0915
        self,
        text: str,
        segment_timestamps: list[float] | None = None,
    ) -> dict[str, Any]:
        """从转录文本中提取待办（按 chunk + gate）。

        Args:
            text: 转录文本

        Returns:
            包含 todos（及可选 gate 元数据）的字典
        """
        try:
            if not self.llm_client.is_available():
                logger.warning("LLM客户端不可用，跳过提取")
                return {"todos": []}

            chunk_chars = int(settings.get("audio.extraction_gate.max_chars", 2500))
            chunk_seconds = int(settings.get("audio.extraction_gate.max_seconds", 0))
            chunk_objs = chunk_transcription(
                text=text,
                max_chars=chunk_chars,
                max_seconds=chunk_seconds,
                segment_timestamps=segment_timestamps,
            )
            if not chunk_objs:
                return {"todos": []}

            gate_meta: dict[str, Any] | None = None
            chunk_gate: list[dict[str, Any]] = []

            should_extract_any = False
            for index, chunk_obj in enumerate(chunk_objs):
                chunk_text = chunk_obj["text"]
                should_extract, reason, gate_data = await should_extract_with_llm_gate(
                    text=chunk_text,
                    llm_client=self.llm_client,
                )
                chunk_gate.append(
                    {
                        "i": index + 1,
                        "should_extract": bool(should_extract),
                        "reason": reason,
                        "gate": gate_data if isinstance(gate_data, dict) else None,
                        "start_line": chunk_obj.get("start_line"),
                        "end_line": chunk_obj.get("end_line"),
                        "start_s": chunk_obj.get("start_s"),
                        "end_s": chunk_obj.get("end_s"),
                    }
                )
                if should_extract:
                    should_extract_any = True

            gate_meta = {
                "should_extract": bool(should_extract_any),
                "reason": "ok",
                "data": {
                    "chunked": len(chunk_objs) > 1,
                    "chunk_count": len(chunk_objs),
                    "chunk_max_chars": chunk_chars,
                    "chunk_max_seconds": chunk_seconds,
                    "chunks": chunk_gate,
                },
            }

            if not should_extract_any:
                logger.info(
                    f"audio extraction gate: skip (chunks={len(chunk_objs)}, reason=all_false)"
                )
                return {"todos": [], "gate": gate_meta}

            extracted_items: list[dict[str, Any]] = []
            client = self.llm_client
            client._initialize_client()
            openai_client = client._get_client()

            for index, chunk_obj in enumerate(chunk_objs):
                if chunk_gate and not chunk_gate[index].get("should_extract"):
                    continue

                chunk_text = chunk_obj["text"]
                system_prompt, user_prompt = self._load_extraction_prompts(chunk_text)

                response = cast(
                    "Any",
                    openai_client.chat.completions.create(
                        model=client.model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        temperature=0.3,
                    ),
                )

                usage = getattr(response, "usage", None)
                if usage:
                    endpoint = "audio_extract"
                    if len(chunk_objs) > 1:
                        endpoint = f"{endpoint}|chunk:{index + 1}/{len(chunk_objs)}"
                    log_token_usage(
                        model=client.model,
                        input_tokens=usage.prompt_tokens,
                        output_tokens=usage.completion_tokens,
                        endpoint=endpoint,
                        user_query=chunk_text,
                        response_type="extract",
                        feature_type="audio",
                    )

                result_text = (response.choices[0].message.content or "").strip()
                result = self._parse_llm_response(result_text)
                result = self._normalize_extraction_result(result)

                todos = result.get("todos", [])
                if isinstance(todos, list):
                    extracted_items.extend(todos)

            enriched = self._enrich_extracted_items("todo", extracted_items)
            deduped: list[dict[str, Any]] = []
            seen: set[str] = set()
            for item in enriched:
                key = str(item.get("dedupe_key") or item.get("id") or "")
                if not key or key in seen:
                    continue
                seen.add(key)
                deduped.append(item)

            output: dict[str, Any] = {"todos": deduped}
            if gate_meta is not None:
                output["gate"] = gate_meta
            return output
        except Exception as e:
            logger.error(f"提取待办失败: {e}")
            return {"todos": []}

    async def extract_todos_and_schedules(self, text: str) -> dict[str, Any]:
        """兼容旧接口：返回 todos + 空 schedules。"""
        result = await self.extract_todos(text=text)
        return {**result, "schedules": []}
