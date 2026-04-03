from __future__ import annotations

from typing import Any

from util.settings import settings


def get_todo_intent_config() -> dict[str, Any]:
    cfg = settings.get("perception.todo_intent", {}) or {}
    return dict(cfg) if isinstance(cfg, dict) else {}


def is_todo_intent_enabled() -> bool:
    cfg = get_todo_intent_config()
    return bool(cfg.get("enabled", True))


def should_disable_legacy_auto_extraction() -> bool:
    """Whether legacy auto-extraction paths should be bypassed.

    Default behavior:
    - if todo-intent is disabled: keep legacy behavior.
    - if todo-intent is enabled: disable legacy auto extraction by default.
    """

    cfg = get_todo_intent_config()
    if not bool(cfg.get("enabled", True)):
        return False
    return bool(cfg.get("disable_legacy_auto_extraction", True))
