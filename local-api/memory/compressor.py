"""L2 Compressor — incremental event extraction from deduped_L1/raw_L0 daily Markdown.

Prefers the L1 deduped file (``deduped_L1/{date}.md``) as input when available,
falling back to the L0 raw file (``raw_L0/{date}.md``).

**Incremental mode** (default for periodic tasks):
  Tracks a character offset per date. Each run only reads new content appended
  since the last run, sends it to the LLM for event extraction, and appends
  the resulting events to the existing L2 file. This avoids re-processing the
  entire day's data on every cycle.

**Full-rebuild mode** (manual trigger):
  Re-reads the entire source file and overwrites the L2 file. Uses sliding-window
  chunking when content exceeds the LLM context limit.
"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING

from services.agent_activity_tracker import start_activity, stop_activity
from util.logging_config import get_logger

if TYPE_CHECKING:
    from pathlib import Path

    from llm.llm_client import LLMClient

logger = get_logger()

# Chunk limits for full-rebuild mode
CHUNK_MAX_CHARS = 12_000
CHUNK_OVERLAP_CHARS = 1_500

# ---------------------------------------------------------------------------
# Prompts — Incremental mode
# ---------------------------------------------------------------------------

INCR_SYSTEM_PROMPT = (
    "你是一个个人记忆管理助手，擅长从原始感知记录中提取有意义的事件并生成结构化摘要。\n"
    "你的职责是仅处理用户提供的新增感知记录，不要编造不存在的信息。"
)

INCR_USER_TEMPLATE = """以下是 {date_str} 的新增感知记录。
{existing_hint}
请仅从这些新增记录中提取有意义的事件，生成结构化 Markdown 摘要。

要求：
1. 每个事件包含：标题、时间范围、参与人、来源、摘要、标签
2. 合并时间相近且主题相关的碎片记录为一个事件
3. 忽略无意义的噪声数据（重复内容、无信息量的片段）
4. 不要重复上面已有的事件
5. 如果新记录中没有有意义的新事件，只输出 "无新事件"
6. 输出格式严格遵循下方示例

输出格式示例：
## Event: 与导师微信沟通论文进展
- **时间**: 09:17 - 09:25
- **参与人**: 张教授
- **来源**: 微信（屏幕感知 + 麦克风）
- **摘要**: 导师询问论文进展，回复实验数据正在整理中
- **标签**: #论文项目 #张教授

新增感知记录：
{raw_content}"""

INCR_CHUNK_USER_TEMPLATE = """以下是 {date_str} 新增感知记录的第 {chunk_idx}/{total_chunks} 段。
{existing_hint}
请仅从本段中提取有意义的事件，格式同上。不要编造其他段的信息。
如果本段没有有意义的新事件，只输出 "无新事件"。

本段感知记录：
{raw_content}"""

# ---------------------------------------------------------------------------
# Prompts — Full-rebuild mode (backward compat)
# ---------------------------------------------------------------------------

COMPRESS_SYSTEM_PROMPT = (
    "你是一个个人记忆管理助手，擅长从原始感知记录中提取有意义的事件并生成结构化摘要。"
)

COMPRESS_USER_TEMPLATE = """以下是 {date_str} 的感知记录（已去重）。
请提取所有有意义的事件，生成结构化 Markdown 摘要。

要求：
1. 每个事件包含：标题、时间范围、参与人、来源、摘要、标签
2. 合并时间相近且主题相关的碎片记录为一个事件
3. 忽略无意义的噪声数据（重复内容、无信息量的片段）
4. 输出格式严格遵循下方示例

输出格式示例：
```
# {date_str} 事件摘要

## Event: 与导师微信沟通论文进展
- **时间**: 09:17 - 09:25
- **参与人**: 张教授
- **来源**: 微信（屏幕感知 + 麦克风）
- **摘要**: 导师询问论文进展，回复实验数据正在整理中
- **标签**: #论文项目 #张教授
```

感知记录：
{raw_content}"""

CHUNK_USER_TEMPLATE = """以下是 {date_str} 感知记录的第 {chunk_idx}/{total_chunks} 段。
请提取本段中有意义的事件，生成结构化 Markdown 摘要（仅本段内容，不要编造其他段的信息）。

要求与格式同单次压缩，每个事件包含：标题、时间范围、参与人、来源、摘要、标签。
忽略无意义的噪声数据。

本段感知记录：
{raw_content}"""

MERGE_SYSTEM_PROMPT = (
    "你是一个个人记忆管理助手，负责将多段事件摘要合并为一份去重、连贯的每日事件摘要。"
)

MERGE_USER_TEMPLATE = """以下是 {date_str} 的多段事件摘要，请合并为一份最终摘要。

要求：
1. 合并描述同一事件或主题相近的条目
2. 去重：相同/重复的事件只保留一条
3. 按时间顺序排列
4. 保持原有输出格式（## Event: ...、时间、参与人、来源、摘要、标签）

各段摘要：
{partial_summaries}"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

NO_NEW_EVENTS_MARKERS = ("无新事件", "没有新事件", "no new events")


def _is_empty_result(text: str) -> bool:
    """Check if the LLM response means 'no new events'."""
    lowered = text.strip().lower()
    return any(m in lowered for m in NO_NEW_EVENTS_MARKERS) and "## Event" not in text


def _split_into_chunks(content: str, max_chars: int, overlap: int) -> list[str]:
    """Split content into overlapping chunks, preferring boundaries at ## headers."""
    if len(content) <= max_chars:
        return [content] if content.strip() else []

    chunks: list[str] = []
    start = 0
    boundary_pattern = re.compile(r"\n(?=## )|\n\n")

    while start < len(content):
        end = min(start + max_chars, len(content))
        segment = content[start:end]

        chars_consumed = len(segment)
        if end < len(content):
            overlap_zone_start = max(0, len(segment) - overlap)
            search_region = segment[overlap_zone_start:]
            matches = list(boundary_pattern.finditer(search_region))
            if matches:
                last = matches[-1]
                cut = overlap_zone_start + last.start() + 1
                segment = segment[:cut].rstrip()
                chars_consumed = cut

        if segment.strip():
            chunks.append(segment.strip())
        start = start + max(chars_consumed - overlap, 1) if end < len(content) else len(content)
    return chunks


class MemoryCompressor:
    """L2 event aggregation: deduped_L1/raw_L0 → structured event summaries via LLM.

    Two modes:
    - **Incremental** (``compress_incremental``): only process new content, append.
    - **Full-rebuild** (``compress_day``): reprocess everything, overwrite.
    """

    MIN_RAW_LENGTH = 50

    def __init__(self, memory_dir: Path, llm_client: LLMClient, *, model: str | None = None):
        self._memory_dir = memory_dir
        self._raw_dir = memory_dir / "raw_L0"
        self._deduped_dir = memory_dir / "deduped_L1"
        self._events_dir = memory_dir / "events_L2"
        self._events_dir.mkdir(parents=True, exist_ok=True)
        self._llm = llm_client
        self._model = model or llm_client.model

        self._state_file = self._events_dir / ".compress_state.json"
        self._state: dict[str, int] = self._load_state()

    # ------------------------------------------------------------------
    # Offset state persistence
    # ------------------------------------------------------------------

    def _load_state(self) -> dict[str, int]:
        if self._state_file.exists():
            try:
                return json.loads(self._state_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                logger.warning("Corrupt compress state file, starting fresh")
        return {}

    def _save_state(self) -> None:
        try:
            self._state_file.write_text(
                json.dumps(self._state, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError:
            logger.exception("Failed to save compress state")

    def _get_offset(self, date_str: str) -> int:
        return self._state.get(date_str, 0)

    def _set_offset(self, date_str: str, offset: int) -> None:
        self._state[date_str] = offset
        self._save_state()

    # ------------------------------------------------------------------
    # Source file resolution
    # ------------------------------------------------------------------

    def _resolve_source_file(self, date_str: str) -> Path | None:
        """Find the best source file for compression: deduped > raw."""
        deduped_file = self._deduped_dir / f"{date_str}.md"
        if deduped_file.exists():
            return deduped_file
        raw_file = self._raw_dir / f"{date_str}.md"
        if raw_file.exists():
            return raw_file
        return None

    # ------------------------------------------------------------------
    # Extract existing event titles from L2 file
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_event_titles(events_file: Path) -> list[str]:
        """Read existing L2 file and extract all ``## Event:`` titles."""
        if not events_file.exists():
            return []
        try:
            content = events_file.read_text(encoding="utf-8")
            return re.findall(r"^## Event:\s*(.+)$", content, re.MULTILINE)
        except OSError:
            return []

    def _build_existing_hint(self, events_file: Path) -> str:
        titles = self._extract_event_titles(events_file)
        if not titles:
            return ""
        title_list = "\n".join(f"- {t}" for t in titles)
        return f"今天已提取的事件（不要重复）：\n{title_list}\n"

    # ------------------------------------------------------------------
    # LLM call (async)
    # ------------------------------------------------------------------

    async def _llm_call(self, messages: list[dict[str, str]]) -> str:
        return await self._llm.async_chat(
            messages,
            temperature=0.3,
            model=self._model,
            log_usage=True,
            log_meta={
                "endpoint": "memory_compress",
                "feature_type": "memory_compression",
            },
        )

    # ==================================================================
    # Incremental compression (default for periodic tasks)
    # ==================================================================

    async def compress_incremental(self, date_str: str) -> Path | None:
        """Incrementally compress new perception records for *date_str*.

        Reads only the content appended since the last run, extracts events
        via LLM, and appends them to the existing L2 file.
        Returns the events file path, or ``None`` if nothing was produced.
        """
        source_file = self._resolve_source_file(date_str)
        if source_file is None:
            logger.debug(f"No source file for {date_str}, skipping incremental compress")
            return None

        source_content = source_file.read_text(encoding="utf-8")
        source_len = len(source_content)
        offset = self._get_offset(date_str)
        events_file = self._events_dir / f"{date_str}.md"

        # First run with existing L2 — initialize offset, skip reprocessing
        if offset == 0 and events_file.exists():
            self._set_offset(date_str, source_len)
            logger.info(
                f"Incremental: L2 exists for {date_str}, initialized offset to {source_len}"
            )
            return events_file

        # Nothing new
        if source_len <= offset:
            logger.debug(f"No new content for {date_str} (offset={offset}, size={source_len})")
            return events_file if events_file.exists() else None

        new_content = source_content[offset:]

        # Align to next complete entry boundary (## header)
        if offset > 0:
            idx = new_content.find("\n## ")
            if idx >= 0:
                new_content = new_content[idx + 1 :]
            elif not new_content.startswith("## "):
                first_nl = new_content.find("\n")
                if first_nl >= 0:
                    new_content = new_content[first_nl + 1 :]

        if len(new_content.strip()) < self.MIN_RAW_LENGTH:
            logger.debug(f"New content for {date_str} too short ({len(new_content.strip())} chars)")
            self._set_offset(date_str, source_len)
            return events_file if events_file.exists() else None

        aid = start_activity(agent_type="memory_compress", task="增量压缩记忆")
        try:
            existing_hint = self._build_existing_hint(events_file)
            summary = await self._compress_incremental_content(date_str, new_content, existing_hint)
        except Exception:
            logger.exception(f"Incremental compression failed for {date_str}")
            stop_activity(aid, status="error")
            return None
        finally:
            stop_activity(aid)

        # Always advance offset even if LLM returned nothing meaningful
        self._set_offset(date_str, source_len)

        if not summary or not summary.strip() or _is_empty_result(summary):
            logger.info(f"Incremental: no new events for {date_str}")
            return events_file if events_file.exists() else None

        # Clean up: only keep the event blocks (## Event: ...)
        summary = self._strip_non_event_lines(summary)
        if not summary:
            return events_file if events_file.exists() else None

        # Append to L2 file
        if events_file.exists():
            with open(events_file, "a", encoding="utf-8") as f:
                f.write(f"\n\n{summary.strip()}\n")
        else:
            header = f"# {date_str} 事件摘要\n\n"
            events_file.write_text(header + summary.strip() + "\n", encoding="utf-8")

        logger.info(f"Incremental compress: appended {len(summary)} chars to {events_file.name}")
        return events_file

    async def _compress_incremental_content(
        self, date_str: str, raw_content: str, existing_hint: str
    ) -> str:
        """Run LLM on new content. Uses chunking if content is large."""
        if len(raw_content) <= CHUNK_MAX_CHARS:
            prompt = INCR_USER_TEMPLATE.format(
                date_str=date_str,
                existing_hint=existing_hint,
                raw_content=raw_content,
            )
            messages: list[dict[str, str]] = [
                {"role": "system", "content": INCR_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ]
            return await self._llm_call(messages)

        # Chunked incremental
        chunks = _split_into_chunks(raw_content, CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS)
        total = len(chunks)
        logger.info(f"Incremental chunked for {date_str}: {total} chunks")

        partial_summaries: list[str] = []
        for i, chunk in enumerate(chunks):
            prompt = INCR_CHUNK_USER_TEMPLATE.format(
                date_str=date_str,
                chunk_idx=i + 1,
                total_chunks=total,
                existing_hint=existing_hint,
                raw_content=chunk,
            )
            messages = [
                {"role": "system", "content": INCR_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ]
            part = await self._llm_call(messages)
            if part and part.strip() and not _is_empty_result(part):
                partial_summaries.append(part.strip())

        if not partial_summaries:
            return ""
        if len(partial_summaries) == 1:
            return partial_summaries[0]

        merged_prompt = MERGE_USER_TEMPLATE.format(
            date_str=date_str,
            partial_summaries="\n\n---\n\n".join(partial_summaries),
        )
        merge_messages: list[dict[str, str]] = [
            {"role": "system", "content": MERGE_SYSTEM_PROMPT},
            {"role": "user", "content": merged_prompt},
        ]
        return await self._llm_call(merge_messages)

    @staticmethod
    def _strip_non_event_lines(text: str) -> str:
        """Keep only lines that are part of ``## Event:`` blocks."""
        lines = text.split("\n")
        result: list[str] = []
        in_event = False
        for line in lines:
            if re.match(r"^## Event:", line, re.IGNORECASE):
                in_event = True
                result.append(line)
            elif in_event:
                if (
                    line.startswith("## ") and not re.match(r"^## Event:", line, re.IGNORECASE)
                ) or (line.startswith("# ") and not line.startswith("## ")):
                    in_event = False
                else:
                    result.append(line)
        return "\n".join(result).strip()

    # ==================================================================
    # Full-rebuild compression (manual / backward compat)
    # ==================================================================

    async def compress_day(self, date_str: str) -> Path | None:
        """Full rebuild: re-compress the entire source file for *date_str*.

        Overwrites the L2 file and resets the offset.
        """
        source_file = self._resolve_source_file(date_str)
        if source_file is None:
            logger.debug(f"No source file for {date_str}, skipping compression")
            return None

        source_content = source_file.read_text(encoding="utf-8")
        if len(source_content.strip()) < self.MIN_RAW_LENGTH:
            logger.debug(f"Source file for {date_str} too short, skipping compression")
            return None

        aid = start_activity(agent_type="memory_compress", task="全量压缩记忆")
        try:
            if len(source_content) <= CHUNK_MAX_CHARS:
                summary = await self._compress_single_shot(date_str, source_content)
            else:
                summary = await self._compress_sliding_window(date_str, source_content)
        except Exception:
            logger.exception(f"LLM compression failed for {date_str}")
            stop_activity(aid, status="error")
            return None
        finally:
            stop_activity(aid)

        if not summary or not summary.strip():
            logger.warning(f"LLM returned empty summary for {date_str}")
            return None

        events_file = self._events_dir / f"{date_str}.md"
        events_file.write_text(summary, encoding="utf-8")
        self._set_offset(date_str, len(source_content))
        logger.info(f"Full compress {source_file.name} → {events_file.name} ({len(summary)} chars)")
        return events_file

    async def _compress_single_shot(self, date_str: str, raw_content: str) -> str:
        prompt = COMPRESS_USER_TEMPLATE.format(date_str=date_str, raw_content=raw_content)
        messages: list[dict[str, str]] = [
            {"role": "system", "content": COMPRESS_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        return await self._llm_call(messages)

    async def _compress_sliding_window(self, date_str: str, raw_content: str) -> str:
        chunks = _split_into_chunks(raw_content, CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS)
        total = len(chunks)
        logger.info(f"Sliding-window compression for {date_str}: {total} chunks")

        partial_summaries: list[str] = []
        for i, chunk in enumerate(chunks):
            prompt = CHUNK_USER_TEMPLATE.format(
                date_str=date_str,
                chunk_idx=i + 1,
                total_chunks=total,
                raw_content=chunk,
            )
            messages: list[dict[str, str]] = [
                {"role": "system", "content": COMPRESS_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ]
            part = await self._llm_call(messages)
            if part and part.strip():
                partial_summaries.append(part.strip())

        if not partial_summaries:
            return ""
        if len(partial_summaries) == 1:
            return partial_summaries[0]

        merged_prompt = MERGE_USER_TEMPLATE.format(
            date_str=date_str,
            partial_summaries="\n\n---\n\n".join(partial_summaries),
        )
        merge_messages: list[dict[str, str]] = [
            {"role": "system", "content": MERGE_SYSTEM_PROMPT},
            {"role": "user", "content": merged_prompt},
        ]
        return await self._llm_call(merge_messages)

    # ------------------------------------------------------------------
    # Convenience helpers
    # ------------------------------------------------------------------

    async def compress_yesterday(self) -> Path | None:
        """Convenience: full-rebuild compress yesterday's raw file."""
        from util.time_utils import local_yesterday_str  # noqa: PLC0415

        return await self.compress_day(local_yesterday_str())

    def is_compressed(self, date_str: str) -> bool:
        """Check whether an events file already exists for *date_str*."""
        return (self._events_dir / f"{date_str}.md").exists()
