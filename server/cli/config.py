"""Configuration helpers for CLI runtime."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(slots=True)
class CliConfig:
    """Resolved runtime configuration."""

    base_url: str
    api_token: str | None
    timeout_sec: float


def load_config() -> CliConfig:
    """Load configuration from environment variables."""
    return CliConfig(
        base_url=os.getenv("FREETODO_BASE_URL", "http://127.0.0.1:8001").rstrip("/"),
        api_token=os.getenv("FREETODO_API_TOKEN"),
        timeout_sec=float(os.getenv("FREETODO_TIMEOUT_SEC", "30")),
    )
