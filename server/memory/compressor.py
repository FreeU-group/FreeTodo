"""L2 Compressor — deduped_L1/raw_L0 daily Markdown → structured event summaries via LLM.

Prefers the L1 deduped file (``deduped_L1/{date}.md``) as input when available,
falling back to the L0 raw file (``raw_L0/{date}.md``).
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

from util.logging_config import get_logger

if TYPE_CHECKING:
    from pathlib import Path

    from llm.llm_client import LLMClient

logger = get_logger()

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


class MemoryCompressor:
    """L2 event aggregation: deduped_L1/raw_L0 → structured event summaries via LLM.

    Prefers the L1 deduped file as input; falls back to L0 raw file.
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

    async def compress_day(self, date_str: str) -> Path | None:
        """Compress the best available source file for *date_str* into
        an L2 event summary.

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

        prompt = COMPRESS_USER_TEMPLATE.format(date_str=date_str, raw_content=source_content)
        messages: list[dict[str, str]] = [
            {"role": "system", "content": COMPRESS_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        try:
            summary = await asyncio.to_thread(
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

    async def compress_yesterday(self) -> Path | None:
        """Convenience: compress yesterday's raw file."""
        from util.time_utils import local_yesterday_str  # noqa: PLC0415

        return await self.compress_day(local_yesterday_str())

    def is_compressed(self, date_str: str) -> bool:
        """Check whether an events file already exists for *date_str*."""
        return (self._events_dir / f"{date_str}.md").exists()
