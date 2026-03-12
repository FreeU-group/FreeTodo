"""Utilities for Agno learning state snapshots."""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any


def safe_store_get(store: Any, user_id: str | None) -> Any | None:
    """Safely fetch data from an Agno learning store."""
    if not store or not user_id:
        return None

    getter = getattr(store, "get", None)
    if not callable(getter):
        return None

    try:
        return getter(user_id=user_id)
    except TypeError:
        try:
            return getter(user_id)
        except Exception:
            return None


def _get_profile_data(profile: Any | None) -> dict[str, Any] | None:
    """Extract profile data as a dict."""
    if profile is None:
        return None

    if hasattr(profile, "to_dict"):
        return profile.to_dict()
    if is_dataclass(profile) and not isinstance(profile, type):
        return asdict(profile)
    if isinstance(profile, dict):
        return profile
    return None


def _get_profile_field_filter(profile: Any | None) -> set[str] | None:
    """Return the updateable field whitelist if available."""
    if profile is None:
        return None

    getter = getattr(profile.__class__, "get_updateable_fields", None)
    if not callable(getter):
        return None

    try:
        fields = getter()
    except Exception:
        return None

    if isinstance(fields, dict):
        return set(fields.keys())
    return None


def normalize_profile(profile: Any | None) -> dict[str, Any]:
    """Normalize a user profile into a comparable dict."""
    data = _get_profile_data(profile)
    if data is None:
        return {}

    field_filter = _get_profile_field_filter(profile)

    skip = {"user_id", "created_at", "updated_at", "agent_id", "team_id"}
    filtered: dict[str, Any] = {}
    for key, value in data.items():
        if field_filter is not None and key not in field_filter:
            continue
        if field_filter is None and key in skip:
            continue
        if value is None or value == "":
            continue
        filtered[key] = value
    return filtered


def normalize_memories(memories: Any | None) -> dict[str, str]:
    """Normalize user memories into a comparable dict."""
    if memories is None:
        return {}

    items = None
    if hasattr(memories, "memories"):
        items = memories.memories
    elif isinstance(memories, dict):
        items = memories.get("memories")

    if not isinstance(items, list):
        return {}

    normalized: dict[str, str] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        content = item.get("content") or item.get("text") or ""
        if not content:
            continue
        memory_id = item.get("id") or item.get("memory_id") or content
        normalized[str(memory_id)] = str(content)
    return normalized
