"""L1 Deduper — real-time deduplication via sliding window + LLM.

Subscribes to PerceptionStream alongside MemoryWriter. For each incoming
event, compares it against the most recently kept content. If the new content
is essentially the same (e.g. repeated OCR of the same screen), it is
dropped; if it has incremental additions, it is kept; if completely new, it
is kept as-is.  Output goes to ``deduped_L1/{date}.md``.

The deduper itself is also a **pub/sub source**: downstream modules (e.g.
intent recognition) can ``subscribe()`` to receive only the kept (non-duplicate)
events in real-time, forming the L1 deduped stream.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from typing import TYPE_CHECKING

from memory.models import DedupeVerdict
from util.logging_config import get_logger

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from pathlib import Path

    from llm.llm_client import LLMClient
    from perception.models import PerceptionEvent

logger = get_logger()

DEDUP_SYSTEM_PROMPT = (
    "你是一个数据去重助手。判断新记录和已有记录的关系。\n"
    '只输出一个 JSON：{"verdict": "duplicate|incremental|new", "reason": "简要原因"}'
)

DEDUP_USER_TEMPLATE = """已有记录（最近保留的内容）：
{existing}

新记录：
来源：{source}
时间：{timestamp}
内容：{incoming}

判断规则：
- 如果新记录和已有记录内容 90% 以上重叠（例如同一屏幕反复 OCR），verdict = "duplicate"
- 如果新记录在已有内容基础上有新增信息（例如聊天窗口多了一条消息），verdict = "incremental"
- 如果新记录和已有记录完全不同（例如用户切换了窗口），verdict = "new"
"""


class MemoryDeduper:
    """Real-time L1 deduplication: PerceptionEvent → deduped_L1/{date}.md.

    Maintains a reference to the most recently *kept* record. For each
    incoming event, runs a fast character-overlap check first; only calls
    LLM when the fast check is inconclusive.

    Also acts as a pub/sub source: call ``subscribe(callback)`` to receive
    the kept (non-duplicate) PerceptionEvents in real-time. This is how
    downstream modules (e.g. intent recognition) consume the L1 deduped stream.
    """

    FAST_SIMILARITY_THRESHOLD = 0.96
    FAST_DISSIMILARITY_THRESHOLD = 0.3

    ALWAYS_NEW_SOURCES: frozenset[str] = frozenset(
        {
            "app_switch",
            "user_input",
            "ai_output",
            "gps_mobile",
        }
    )

    def __init__(
        self,
        memory_dir: Path,
        llm_client: LLMClient | None,
        *,
        model: str = "qwen-flash",
        window_seconds: float = 10.0,
        window_max_items: int = 10,
    ):
        self._memory_dir = memory_dir
        self._deduped_dir = memory_dir / "deduped_L1"
        self._deduped_dir.mkdir(parents=True, exist_ok=True)
        self._llm = llm_client
        self._model = model

        self._window_seconds = window_seconds
        self._window_max_items = window_max_items

        self._last_kept_content: str | None = None
        self._last_kept_source: str | None = None
        self._last_kept_time: float = 0.0

        self._subscribers: list[Callable[[PerceptionEvent], Awaitable[None]]] = []

        self._recent_kept: deque[PerceptionEvent] = deque(maxlen=200)

        self._lock = asyncio.Lock()
        self._current_date: str | None = None
        self._current_file: Path | None = None

        self._stats = {"total": 0, "kept": 0, "dropped_dup": 0, "dropped_empty": 0}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def subscribe(self, callback: Callable[[PerceptionEvent], Awaitable[None]]) -> None:
        """Register a downstream subscriber for the L1 deduped stream."""
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[PerceptionEvent], Awaitable[None]]) -> None:
        """Remove a downstream subscriber."""
        self._subscribers = [s for s in self._subscribers if s is not callback]

    async def on_event(self, event: PerceptionEvent) -> None:
        """PerceptionStream subscriber callback."""
        try:
            await self._process(event)
        except Exception:
            logger.exception(f"MemoryDeduper failed on event {event.event_id}")

    async def get_recent(self, count: int = 50) -> list[PerceptionEvent]:
        """Return the most recent *count* kept (non-duplicate) events."""
        items = list(self._recent_kept)
        return items[-count:]

    def get_stats(self) -> dict:
        return dict(self._stats)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _process(self, event: PerceptionEvent) -> None:
        self._stats["total"] += 1

        content = event.content_text.strip()
        if not content:
            self._stats["dropped_empty"] += 1
            return

        source_val = event.source.value

        # Sources like app_switch are inherently unique — always keep, skip dedup
        if source_val in self.ALWAYS_NEW_SOURCES:
            async with self._lock:
                await self._keep(event, content)
            return

        async with self._lock:
            if self._last_kept_content is None:
                await self._keep(event, content)
                return

            same_source = source_val == self._last_kept_source
            elapsed = time.monotonic() - self._last_kept_time

            if same_source and elapsed < self._window_seconds:
                verdict = self._fast_judge(content)
                if verdict is None:
                    verdict = await self._llm_judge(event, content)
            else:
                verdict = DedupeVerdict.NEW

            if verdict == DedupeVerdict.DUPLICATE:
                self._stats["dropped_dup"] += 1
                logger.debug(f"Dedup: dropped duplicate (source={source_val})")
            else:
                await self._keep(event, content)

    def _fast_judge(self, incoming: str) -> DedupeVerdict | None:
        """Character-level overlap check. Returns DUPLICATE if very similar,
        None if inconclusive (should defer to LLM)."""
        if self._last_kept_content is None:
            return None
        sim = self._char_similarity(self._last_kept_content, incoming)
        if sim >= self.FAST_SIMILARITY_THRESHOLD:
            return DedupeVerdict.DUPLICATE
        if sim < self.FAST_DISSIMILARITY_THRESHOLD:
            return DedupeVerdict.NEW
        return None

    async def _llm_judge(self, event: PerceptionEvent, incoming: str) -> DedupeVerdict:
        """Ask LLM whether content is duplicate / incremental / new."""
        if self._llm is None or not self._llm.is_available():
            return DedupeVerdict.NEW

        from util.time_utils import to_local  # noqa: PLC0415

        local_ts = to_local(event.timestamp)
        ts_str = (local_ts or event.timestamp).strftime("%H:%M:%S")

        prompt = DEDUP_USER_TEMPLATE.format(
            existing=self._last_kept_content or "(无)",
            source=event.source.value,
            timestamp=ts_str,
            incoming=incoming,
        )
        messages: list[dict[str, str]] = [
            {"role": "system", "content": DEDUP_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        try:
            resp = await asyncio.to_thread(
                self._llm.chat,
                messages,
                0.0,
                self._model,
                100,
                log_usage=True,
                log_meta={"endpoint": "memory_dedup", "feature_type": "memory_dedup"},
            )
            return self._parse_verdict(resp)
        except Exception:
            logger.exception("LLM dedup judgment failed, treating as NEW")
            return DedupeVerdict.NEW

    @staticmethod
    def _parse_verdict(resp: str) -> DedupeVerdict:
        """Extract verdict from LLM JSON response."""
        if not resp:
            return DedupeVerdict.NEW

        text = resp
        try:
            start = resp.find("{")
            end = resp.rfind("}") + 1
            if start >= 0 and end > start:
                data = json.loads(resp[start:end])
                text = data.get("verdict", "")
        except (json.JSONDecodeError, KeyError):
            pass

        lowered = text.lower()
        if "duplicate" in lowered:
            return DedupeVerdict.DUPLICATE
        if "incremental" in lowered:
            return DedupeVerdict.INCREMENTAL
        return DedupeVerdict.NEW

    @staticmethod
    def _char_similarity(a: str, b: str) -> float:
        """Fast character-set overlap ratio (symmetric)."""
        if a == b:
            return 1.0
        if not a or not b:
            return 0.0
        set_a = set(a)
        set_b = set(b)
        intersection = len(set_a & set_b)
        union = len(set_a | set_b)
        jaccard = intersection / union if union else 0.0
        len_ratio = min(len(a), len(b)) / max(len(a), len(b))
        return jaccard * 0.5 + len_ratio * 0.5

    async def _keep(self, event: PerceptionEvent, content: str) -> None:
        """Write the event to deduped file and update tracking state."""
        from util.time_utils import to_local  # noqa: PLC0415

        local_ts = to_local(event.timestamp)
        date_str = (local_ts or event.timestamp).strftime("%Y-%m-%d")
        ts = (local_ts or event.timestamp).strftime("%H:%M")
        source = event.source.value

        parts: list[str] = [ts, source]
        meta = event.metadata
        if meta.get("app"):
            parts.append(str(meta["app"]))
        if meta.get("speaker"):
            speaker = str(meta["speaker"])
            if meta.get("target"):
                speaker = f"{speaker} → {meta['target']}"
            parts.append(speaker)

        header = " | ".join(parts)
        line = f"\n## {header}\n{content}\n"

        if date_str != self._current_date:
            self._current_date = date_str
            self._deduped_dir.mkdir(parents=True, exist_ok=True)
            self._current_file = self._deduped_dir / f"{date_str}.md"
            if not self._current_file.exists():
                with open(self._current_file, "w", encoding="utf-8") as f:
                    f.write(f"# {date_str} 去重记录\n")
                logger.info(f"MemoryDeduper created new deduped file: {self._current_file.name}")

        if self._current_file is None:
            raise RuntimeError("Deduper output file is not initialized")
        self._current_file.parent.mkdir(parents=True, exist_ok=True)
        if not self._current_file.exists():
            with open(self._current_file, "w", encoding="utf-8") as f:
                f.write(f"# {self._current_date} 去重记录\n")
        with open(self._current_file, "a", encoding="utf-8") as f:
            f.write(line)

        self._last_kept_content = content
        self._last_kept_source = event.source.value
        self._last_kept_time = time.monotonic()
        self._stats["kept"] += 1
        self._recent_kept.append(event)

        await self._notify_subscribers(event)

    async def _notify_subscribers(self, event: PerceptionEvent) -> None:
        """Push the kept event to all L1 subscribers."""
        if not self._subscribers:
            return
        results = await asyncio.gather(
            *(sub(event) for sub in self._subscribers),
            return_exceptions=True,
        )
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.exception(
                    f"L1 subscriber {self._subscribers[i]} raised an error",
                    exc_info=result,
                )
