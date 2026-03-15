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


_WECHAT_LINE_RE = re.compile(r"^\[([^\]]+)\]\s*(.+)$")
_WECHAT_HEADER_RE = re.compile(r"^\[(私聊|群聊)\]")
_WECHAT_NOISE_KEYWORDS = ("发送", "发送（", "发送(")


class WeChatMessageHistory:
    """Message-line level dedup for WeChat structured OCR text.

    Maintains a sliding window of normalized message lines. On each new
    structured text, strips out lines already seen and returns only genuinely
    new content. Prevents re-extraction of intents from messages that have
    already been processed in earlier sensor cycles.
    """

    def __init__(self, *, ttl_seconds: int = 1800, max_lines: int = 10000):
        self._ttl = max(60, int(ttl_seconds))
        self._max_lines = max(100, int(max_lines))
        self._seen: OrderedDict[str, float] = OrderedDict()
        self._stats_total = 0
        self._stats_new = 0

    def _evict(self, now: float) -> None:
        while self._seen:
            key, expires = next(iter(self._seen.items()))
            if expires > now:
                break
            self._seen.popitem(last=False)
        while len(self._seen) > self._max_lines:
            self._seen.popitem(last=False)

    @staticmethod
    def _is_noise(text: str) -> bool:
        stripped = text.strip()
        if len(stripped) < 2:
            return True
        for kw in _WECHAT_NOISE_KEYWORDS:
            if stripped.startswith(kw):
                return True
        return False

    def filter_new_messages(self, structured_text: str) -> str | None:
        """Return structured text with only unseen message lines.

        Returns None if no new meaningful messages remain.
        """
        now = get_utc_now().timestamp()
        self._evict(now)

        lines = structured_text.strip().splitlines()
        if not lines:
            return None

        header_line = ""
        msg_lines: list[str] = []
        for line in lines:
            if _WECHAT_HEADER_RE.match(line):
                header_line = line
            else:
                msg_lines.append(line)

        new_lines: list[str] = []
        for line in msg_lines:
            m = _WECHAT_LINE_RE.match(line)
            if not m:
                continue
            _speaker, content = m.group(1), m.group(2)
            if self._is_noise(content):
                continue

            norm = _normalize_text(content)
            self._stats_total += 1

            if self._is_seen(norm, now):
                continue

            self._stats_new += 1
            self._seen[norm] = now + self._ttl
            self._seen.move_to_end(norm, last=True)
            new_lines.append(line)

        self._evict(now)

        if not new_lines:
            return None
        if header_line:
            return header_line + "\n" + "\n".join(new_lines)
        return "\n".join(new_lines)

    def _is_seen(self, norm_text: str, now: float) -> bool:
        if norm_text in self._seen and self._seen[norm_text] > now:
            self._seen[norm_text] = now + self._ttl
            self._seen.move_to_end(norm_text, last=True)
            return True
        for existing, expires in list(self._seen.items()):
            if expires <= now:
                continue
            if norm_text in existing or existing in norm_text:
                self._seen[existing] = now + self._ttl
                self._seen.move_to_end(existing, last=True)
                return True
        return False

    def stats(self) -> dict[str, int]:
        return {
            "history_size": len(self._seen),
            "total_lines": self._stats_total,
            "new_lines": self._stats_new,
        }
