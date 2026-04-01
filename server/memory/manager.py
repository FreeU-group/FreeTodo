"""Memory Manager — lifecycle management for the memory module."""

from __future__ import annotations

import asyncio
import contextlib
from pathlib import Path
from typing import TYPE_CHECKING

from memory.compressor import MemoryCompressor
from memory.deduper import MemoryDeduper
from memory.profile_builder import ProfileBuilder
from memory.reader import MemoryReader
from memory.task_linker import TaskLinker
from memory.writer import MemoryWriter
from util.base_paths import get_user_data_dir
from util.logging_config import get_logger

if TYPE_CHECKING:
    from perception.stream import PerceptionStream

logger = get_logger()


class MemoryManager:
    """Manage Memory module lifecycle: writer + deduper + compressor + task_linker + profile_builder + reader."""

    def __init__(self, config: dict | None = None):
        config = dict(config or {})
        memory_base = config.get("memory_dir")
        if memory_base:
            self._memory_dir = Path(memory_base)
        else:
            self._memory_dir = get_user_data_dir() / "memory"

        self._memory_dir.mkdir(parents=True, exist_ok=True)

        self.writer = MemoryWriter(self._memory_dir)
        self.deduper: MemoryDeduper | None = None
        self.reader = MemoryReader(self._memory_dir)
        self.compressor: MemoryCompressor | None = None
        self.task_linker: TaskLinker | None = None
        self.profile_builder: ProfileBuilder | None = None

        self._config = config
        self._subscribed = False
        self._compress_task: asyncio.Task | None = None
        self._profile_task: asyncio.Task | None = None

        if config.get("auto_compress", True):
            self._init_llm_components()

    def _init_llm_components(self) -> None:
        """Initialize LLM-dependent components."""
        try:
            from llm.llm_client import LLMClient  # noqa: PLC0415

            llm = LLMClient()
            if not llm.is_available():
                logger.warning("LLM not available — LLM-dependent memory components disabled")
                return

            # L1 Deduper
            dedup_cfg = self._config.get("dedup", {}) or {}
            dedup_model = str(dedup_cfg.get("model", "")).strip() or llm.small_model
            self.deduper = MemoryDeduper(
                self._memory_dir,
                llm,
                model=dedup_model,
                window_seconds=dedup_cfg.get("window_seconds", 10.0),
                window_max_items=dedup_cfg.get("window_max_items", 10),
            )
            logger.info("MemoryDeduper initialized")

            # L2 Compressor
            compress_cfg = self._config.get("compress", {}) or {}
            compress_model = str(compress_cfg.get("model", "")).strip() or None
            self.compressor = MemoryCompressor(self._memory_dir, llm, model=compress_model)
            logger.info(f"MemoryCompressor initialized (model={self.compressor._model})")

            # L3 TaskLinker
            linker_cfg = self._config.get("task_linker", {}) or {}
            self.task_linker = TaskLinker(
                self._memory_dir,
                llm,
                model=linker_cfg.get("model", "qwen-flash"),
            )
            logger.info("TaskLinker initialized")

            # L4 ProfileBuilder
            profile_cfg = self._config.get("profile", {}) or {}
            profile_model = profile_cfg.get("model") or None
            self.profile_builder = ProfileBuilder(
                self._memory_dir,
                llm,
                model=profile_model,
            )
            logger.info("ProfileBuilder initialized")

        except Exception:
            logger.exception("Failed to initialize LLM-dependent memory components")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def start(self, perception_stream: PerceptionStream | None = None) -> None:
        """Start the memory module, optionally subscribing to perception stream."""
        if perception_stream and not self._subscribed:
            perception_stream.subscribe(self.writer.on_event)
            if self.deduper:
                perception_stream.subscribe(self.deduper.on_event)
                logger.info("MemoryDeduper subscribed to PerceptionStream")
            self._subscribed = True
            logger.info("MemoryWriter subscribed to PerceptionStream")

        if self.compressor and self._compress_task is None:
            compress_interval = self._config.get("compress_interval_seconds", 1200)
            self._compress_task = asyncio.create_task(
                self._compress_loop(compress_interval),
                name="memory-compress-loop",
            )
            logger.info(f"L2+L3 periodic compress task started (interval={compress_interval}s)")

        if self.profile_builder and self._profile_task is None:
            profile_cfg = self._config.get("profile", {}) or {}
            interval = profile_cfg.get("interval_seconds", 10800)
            self._profile_task = asyncio.create_task(
                self._profile_loop(interval),
                name="memory-profile-loop",
            )
            logger.info(f"ProfileBuilder periodic task started (interval={interval}s)")

    async def stop(self, perception_stream: PerceptionStream | None = None) -> None:
        """Stop the memory module, unsubscribing from perception stream."""
        if self._compress_task and not self._compress_task.done():
            self._compress_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._compress_task
            self._compress_task = None
            logger.info("L2+L3 periodic compress task stopped")

        if self._profile_task and not self._profile_task.done():
            self._profile_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._profile_task
            self._profile_task = None
            logger.info("ProfileBuilder periodic task stopped")

        if perception_stream and self._subscribed:
            perception_stream.unsubscribe(self.writer.on_event)
            if self.deduper:
                perception_stream.unsubscribe(self.deduper.on_event)
                logger.info("MemoryDeduper unsubscribed from PerceptionStream")
            self._subscribed = False
            logger.info("MemoryWriter unsubscribed from PerceptionStream")

    # ------------------------------------------------------------------
    # Periodic L2+L3 compress & link loop
    # ------------------------------------------------------------------

    async def _compress_loop(self, interval: int) -> None:
        """Background loop: incremental L2 compression + L3 task linking every *interval* seconds."""
        await asyncio.sleep(60)
        while True:
            from util.time_utils import local_today_str  # noqa: PLC0415

            today = local_today_str()
            try:
                result = await self.incremental_compress_and_link(today)
                logger.info(f"Periodic incremental_compress_and_link: {result}")
            except Exception:
                logger.exception(f"Periodic incremental_compress_and_link failed for {today}")
            await asyncio.sleep(interval)

    # ------------------------------------------------------------------
    # Periodic profile update loop
    # ------------------------------------------------------------------

    async def _profile_loop(self, interval: int) -> None:
        """Background loop: update L4 user profile on startup, then every *interval* seconds."""
        while True:
            try:
                await self.profile_builder.update()  # type: ignore[union-attr]
                logger.info("ProfileBuilder periodic update completed")
            except Exception:
                logger.exception("ProfileBuilder periodic update failed")
            await asyncio.sleep(interval)

    # ------------------------------------------------------------------
    # Manual triggers
    # ------------------------------------------------------------------

    async def compress_and_link(self, date_str: str) -> dict:
        """Run **full-rebuild** L2 compression then L3 task linking for a given date.

        Returns a summary dict of what happened.
        """
        result: dict = {"date": date_str, "mode": "full", "compressed": False, "linked": 0}

        if self.compressor:
            path = await self.compressor.compress_day(date_str)
            result["compressed"] = path is not None

        if self.task_linker and result["compressed"]:
            linked = await self.task_linker.link_day(date_str)
            result["linked"] = linked

        return result

    async def incremental_compress_and_link(self, date_str: str) -> dict:
        """Run **incremental** L2 compression then L3 task linking for a given date.

        Only processes new content since last run.
        Returns a summary dict of what happened.
        """
        result: dict = {"date": date_str, "mode": "incremental", "compressed": False, "linked": 0}

        if self.compressor:
            path = await self.compressor.compress_incremental(date_str)
            result["compressed"] = path is not None

        if self.task_linker and result["compressed"]:
            linked = await self.task_linker.link_day(date_str)
            result["linked"] = linked

        return result

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self) -> dict:
        status: dict = {
            "memory_dir": str(self._memory_dir),
            "subscribed": self._subscribed,
            "deduper_available": self.deduper is not None,
            "compressor_available": self.compressor is not None,
            "task_linker_available": self.task_linker is not None,
            "profile_builder_available": self.profile_builder is not None,
            "writer": self.writer.get_stats(),
            "available_dates": self.reader.list_available_dates()[:10],
        }
        if self.deduper:
            status["deduper"] = self.deduper.get_stats()
        if self.task_linker:
            status["task_linker"] = self.task_linker.get_stats()
        if self.profile_builder:
            status["profile_builder"] = self.profile_builder.get_stats()
        return status

    @property
    def memory_dir(self) -> Path:
        return self._memory_dir


# ---------------------------------------------------------------------------
# Singleton access pattern (mirrors perception/manager.py)
# ---------------------------------------------------------------------------

_manager: MemoryManager | None = None


async def init_memory_manager(
    config: dict | None = None,
    perception_stream: PerceptionStream | None = None,
) -> MemoryManager:
    global _manager  # noqa: PLW0603
    if _manager is None:
        _manager = MemoryManager(config=config)
        await _manager.start(perception_stream)
    return _manager


async def shutdown_memory_manager() -> None:
    global _manager  # noqa: PLW0603
    if _manager is None:
        return
    await _manager.stop()
    _manager = None


def get_memory_manager() -> MemoryManager:
    if _manager is None:
        raise RuntimeError("MemoryManager not initialized. Call init_memory_manager() at startup.")
    return _manager


def try_get_memory_manager() -> MemoryManager | None:
    return _manager
