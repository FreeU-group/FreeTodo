"""Utilities for AgentOS runtime configuration."""

from __future__ import annotations

from util.settings import settings


def resolve_agent_os_base_url() -> str:
    base_url = settings.get("agno.agent_os.base_url")
    if base_url:
        return str(base_url).rstrip("/")

    host = str(settings.get("agno.agent_os.host", "127.0.0.1"))
    port = int(settings.get("agno.agent_os.port", 8002))
    return f"http://{host}:{port}"
