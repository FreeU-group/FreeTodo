"""L2 Compressor — deduped_L1/raw_L0 daily Markdown → structured event summaries via LLM.

Prefers the L1 deduped file (``deduped_L1/{date}.md``) as input when available,
falling back to the L0 raw file (``raw_L0/{date}.md``).

Uses sliding-window chunking when content exceeds the LLM context limit (e.g. 30K tokens).
"""

from __future__ import annotations

import asyncio
import re
from typing import TYPE_CHECKING

from util.logging_config import get_logger

if TYPE_CHECKING:
    from pathlib import Path

    from llm.llm_client import LLMClient

logger = get_logger()

# Qwen API limit ~30,720 tokens; Chinese ~1.5 chars/token. Reserve ~2K tokens for prompt.
CHUNK_MAX_CHARS = 12_000
CHUNK_OVERLAP_CHARS = 1_500

COMPRESS_SYSTEM_PROMPT = (
    "你是一个个人记忆管理助手，擅长从原始感知记录中提取有意义的事件并生成结构化摘要。"
)

COMPRESS_USER_TEMPLATE = """以下是 {date_str} 的感知记录（已去重）。
请提取所有有意义的事件，生成结构化 Markdown 摘要。

要求：
1. 每个事件包含：标题、时间范围、参与人、来源、摘要、待办（如果有）、标签
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
- **待办**: 下午完成实验数据初步分析
- **标签**: #论文项目 #张教授
```

感知记录：
{raw_content}"""

CHUNK_USER_TEMPLATE = """以下是 {date_str} 感知记录的第 {chunk_idx}/{total_chunks} 段。
请提取本段中有意义的事件，生成结构化 Markdown 摘要（仅本段内容，不要编造其他段的信息）。

要求与格式同单次压缩，每个事件包含：标题、时间范围、参与人、来源、摘要、待办（如有）、标签。
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
4. 保持原有输出格式（## Event: ...、时间、参与人、来源、摘要、待办、标签）

各段摘要：
{partial_summaries}"""


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

    Prefers the L1 deduped file as input; falls back to L0 raw file.
    Uses sliding-window chunking when content exceeds the LLM context limit.
    """

    MIN_RAW_LENGTH = 50

    def __init__(self, memory_dir: Path, llm_client: LLMClient):
        self._memory_dir = memory_dir
        self._raw_dir = memory_dir / "raw_L0"
        self._deduped_dir = memory_dir / "deduped_L1"
        self._events_dir = memory_dir / "events_L2"
        self._events_dir.mkdir(parents=True, exist_ok=True)
        self._llm = llm_client

    def _resolve_source_file(self, date_str: str) -> Path | None:
        """Find the best source file for compression: deduped > raw."""
        deduped_file = self._deduped_dir / f"{date_str}.md"
        if deduped_file.exists():
            return deduped_file
        raw_file = self._raw_dir / f"{date_str}.md"
        if raw_file.exists():
            return raw_file
        return None

    async def _compress_single(self, messages: list[dict[str, str]]) -> str:
        """Call LLM for a single chunk or full content."""
        return await asyncio.to_thread(
            self._llm.chat,
            messages,
            0.3,
            None,
            None,
            log_usage=True,
            log_meta={
                "endpoint": "memory_compress",
                "feature_type": "memory_compression",
            },
        )

    async def compress_day(self, date_str: str) -> Path | None:
        """Compress the best available source file for *date_str* into
        an L2 event summary.

        Uses sliding-window chunking when content exceeds the LLM context limit.
        Returns the path to the generated events file, or ``None`` if nothing
        was produced (missing/too-short source, LLM failure, etc.).
        """
        source_file = self._resolve_source_file(date_str)
        if source_file is None:
            logger.debug(f"No source file for {date_str}, skipping compression")
            return None

        source_content = source_file.read_text(encoding="utf-8")
        if len(source_content.strip()) < self.MIN_RAW_LENGTH:
            logger.debug(f"Source file for {date_str} too short, skipping compression")
            return None

        try:
            if len(source_content) <= CHUNK_MAX_CHARS:
                summary = await self._compress_single_shot(date_str, source_content)
            else:
                summary = await self._compress_sliding_window(date_str, source_content)
        except Exception:
            logger.exception(f"LLM compression failed for {date_str}")
            return None

        if not summary or not summary.strip():
            logger.warning(f"LLM returned empty summary for {date_str}")
            return None

        events_file = self._events_dir / f"{date_str}.md"
        events_file.write_text(summary, encoding="utf-8")
        logger.info(f"Compressed {source_file.name} → {events_file.name} ({len(summary)} chars)")
        return events_file

    async def _compress_single_shot(self, date_str: str, raw_content: str) -> str:
        """Single LLM call when content fits within context limit."""
        prompt = COMPRESS_USER_TEMPLATE.format(date_str=date_str, raw_content=raw_content)
        messages: list[dict[str, str]] = [
            {"role": "system", "content": COMPRESS_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]
        return await self._compress_single(messages)

    async def _compress_sliding_window(self, date_str: str, raw_content: str) -> str:
        """Sliding-window: chunk → compress each → merge summaries."""
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
            part = await self._compress_single(messages)
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
        return await self._compress_single(merge_messages)

    async def compress_yesterday(self) -> Path | None:
        """Convenience: compress yesterday's raw file."""
        from util.time_utils import local_yesterday_str  # noqa: PLC0415

        return await self.compress_day(local_yesterday_str())

    def is_compressed(self, date_str: str) -> bool:
        """Check whether an events file already exists for *date_str*."""
        return (self._events_dir / f"{date_str}.md").exists()
