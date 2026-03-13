"""CLI error definitions and mappings."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from cli import exit_codes


@dataclass(slots=True)
class CliError(Exception):
    """Structured error surfaced by CLI commands."""

    code: str
    message: str
    exit_code: int
    details: dict[str, Any] | None = None


def map_status_to_exit_code(status_code: int) -> int:
    """Map HTTP status codes to CLI exit codes."""
    if status_code in {401}:
        return exit_codes.AUTH_ERROR
    if status_code in {403}:
        return exit_codes.PERMISSION_ERROR
    if status_code in {404}:
        return exit_codes.NOT_FOUND_ERROR
    if status_code in {409}:
        return exit_codes.CONFLICT_ERROR
    if status_code in {502, 503, 504}:
        return exit_codes.BACKEND_UNAVAILABLE_ERROR
    return exit_codes.UNKNOWN_ERROR
