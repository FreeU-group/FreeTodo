from __future__ import annotations

import hashlib
import re
from collections import OrderedDict
from dataclasses import dataclass
from typing import TYPE_CHECKING

from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from schemas.perception_todo_intent import TodoIntentContext


_NON_WORD_RE = re.compile(r"[^\w\s]", re.UNICODE)
_MULTI_SPACE_RE = re.compile(r"\s+")


def _normalize_text(text: str) -> str:
    normalized = _NON_WORD_RE.sub(" ", (text or "").lower())
    normalized = _MULTI_SPACE_RE.sub(" ", normalized).strip()
    return normalized


@dataclass
class _DedupeEntry:
    expires_at: float
    anchor: str
    canonical_text: str


class PreGateDedupeCache:
    """In-memory dedupe cache for TodoIntent pre-gate filtering."""

    def __init__(
        self,
        *,
        ttl_seconds: int = 90,
        max_cache_size: int = 5000,
    ):
        self._ttl_seconds = max(1, int(ttl_seconds))
        self._max_cache_size = max(1, int(max_cache_size))
        self._cache: OrderedDict[str, _DedupeEntry] = OrderedDict()
        self._anchor_index: dict[str, set[str]] = {}
        self._hit_count = 0
        self._miss_count = 0

    @staticmethod
    def _build_anchor(context: TodoIntentContext) -> str:
        source_set = ",".join(sorted(source.value for source in context.source_set))
        return "|".join(
            [
                str(context.metadata.get("app_name") or ""),
                str(context.metadata.get("window_title") or ""),
                str(context.metadata.get("speaker") or ""),
                source_set,
            ]
        )

    @staticmethod
    def _build_key(canonical_text: str, anchor: str) -> str:
        raw = f"{canonical_text}|{anchor}"
        return hashlib.sha1(raw.encode("utf-8"), usedforsecurity=False).hexdigest()

    def _remove_from_anchor_index(self, anchor: str, dedupe_key: str) -> None:
        keys = self._anchor_index.get(anchor)
        if not keys:
            return
        keys.discard(dedupe_key)
        if not keys:
            self._anchor_index.pop(anchor, None)

    def _remove_key(self, dedupe_key: str) -> None:
        entry = self._cache.pop(dedupe_key, None)
        if entry is None:
            return
        self._remove_from_anchor_index(entry.anchor, dedupe_key)

    def _evict_expired(self, now_ts: float) -> None:
        for key, entry in list(self._cache.items()):
            if entry.expires_at <= now_ts:
                self._remove_key(key)

    def _evict_overflow(self) -> None:
        while len(self._cache) > self._max_cache_size:
            oldest_key, oldest_entry = self._cache.popitem(last=False)
            self._remove_from_anchor_index(oldest_entry.anchor, oldest_key)

    def check_and_record(self, context: TodoIntentContext) -> tuple[bool, str]:
        now_ts = get_utc_now().timestamp()
        self._evict_expired(now_ts)

        canonical_text = _normalize_text(context.merged_text)
        anchor = self._build_anchor(context)
        dedupe_key = self._build_key(canonical_text, anchor)

        entry = self._cache.get(dedupe_key)
        if entry and entry.expires_at > now_ts:
            self._hit_count += 1
            entry.expires_at = now_ts + self._ttl_seconds
            self._cache[dedupe_key] = entry
            self._cache.move_to_end(dedupe_key, last=True)
            return True, dedupe_key

        replaced_keys: list[str] = []
        for existing_key in list(self._anchor_index.get(anchor, set())):
            existing_entry = self._cache.get(existing_key)
            if existing_entry is None:
                continue
            existing_text = existing_entry.canonical_text
            if not existing_text:
                continue

            # Keep the latest text version across batches.
            if canonical_text == existing_text or canonical_text in existing_text:
                self._hit_count += 1
                existing_entry.expires_at = now_ts + self._ttl_seconds
                self._cache[existing_key] = existing_entry
                self._cache.move_to_end(existing_key, last=True)
                return True, existing_key

            if existing_text in canonical_text:
                replaced_keys.append(existing_key)

        for replaced_key in replaced_keys:
            self._remove_key(replaced_key)

        self._miss_count += 1
        self._cache[dedupe_key] = _DedupeEntry(
            expires_at=now_ts + self._ttl_seconds,
            anchor=anchor,
            canonical_text=canonical_text,
        )
        self._anchor_index.setdefault(anchor, set()).add(dedupe_key)
        self._cache.move_to_end(dedupe_key, last=True)
        self._evict_overflow()
        return False, dedupe_key

    def stats(self) -> dict[str, int]:
        return {
            "size": len(self._cache),
            "hit_count": self._hit_count,
            "miss_count": self._miss_count,
        }
