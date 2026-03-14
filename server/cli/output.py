"""Output helpers for structured CLI responses."""

from __future__ import annotations

import json
import sys
import uuid
from typing import Any


def build_envelope(
    *,
    ok: bool,
    resource: str,
    action: str,
    data: Any = None,
    error: dict[str, Any] | None = None,
    request_id: str | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Build a stable JSON envelope for CLI output."""
    command = " ".join(sys.argv)
    return {
        "ok": ok,
        "data": data,
        "error": error,
        "meta": {
            "resource": resource,
            "action": action,
            "schema_version": 1,
            "command": command,
            "args": sys.argv[1:],
            "request_id": request_id or f"cli_{uuid.uuid4().hex}",
            "dry_run": dry_run,
        },
    }


def emit_json(payload: dict[str, Any], *, stream: str = "stdout") -> None:
    """Emit JSON to stdout or stderr."""
    target = sys.stdout if stream == "stdout" else sys.stderr
    target.write(json.dumps(payload, ensure_ascii=False, indent=2))
    target.write("\n")
    target.flush()
