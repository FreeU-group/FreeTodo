"""AgentOS HTTP client for streaming runs."""

from __future__ import annotations

import json
from typing import Any

import httpx

from util.agent_os_utils import resolve_agent_os_base_url
from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()


def _parse_sse_event_block(event_block: str) -> tuple[str | None, dict[str, Any] | None]:
    event_type: str | None = None
    data_lines: list[str] = []

    for raw_line in event_block.split("\n"):
        line = raw_line.strip()
        if line.startswith("event:"):
            event_type = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].strip())

    if not data_lines:
        return event_type, None

    data_str = "\n".join(data_lines)
    try:
        payload = json.loads(data_str)
    except json.JSONDecodeError:
        logger.warning(f"[agentos] SSE 数据解析失败: {data_str}")
        return event_type, None

    if not event_type and isinstance(payload, dict):
        event_type = payload.get("event")

    return event_type, payload


def _parse_sse_stream(response: httpx.Response):
    buffer = ""
    for chunk in response.iter_text():
        if not chunk:
            continue
        buffer += chunk
        while "\n\n" in buffer:
            event_block, buffer = buffer.split("\n\n", 1)
            event_block = event_block.strip()
            if not event_block:
                continue
            yield _parse_sse_event_block(event_block)

    if buffer.strip():
        yield _parse_sse_event_block(buffer.strip())


class AgentOSClient:
    def __init__(self, base_url: str, agent_id: str, timeout_sec: float = 60.0):
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self.timeout_sec = timeout_sec

    @classmethod
    def from_settings(cls) -> AgentOSClient:
        base_url = resolve_agent_os_base_url()
        agent_id = settings.get("agno.agent_os.agent_id", "lifetrace-agent")
        timeout_sec = float(settings.get("agno.agent_os.timeout_sec", 60.0))
        return cls(base_url, agent_id, timeout_sec)

    def stream_run_events(
        self,
        message: str,
        session_id: str,
        user_id: str | None = None,
        dependencies: dict[str, Any] | None = None,
        add_history_to_context: bool | None = None,
    ):
        url = f"{self.base_url}/agents/{self.agent_id}/runs"
        payload: dict[str, Any] = {
            "message": message,
            "stream": "true",
            "stream_events": "true",
            "session_id": session_id,
        }

        if user_id:
            payload["user_id"] = user_id
        if dependencies is not None:
            payload["dependencies"] = json.dumps(dependencies, ensure_ascii=False)
        if add_history_to_context is not None:
            payload["add_history_to_context"] = "true" if add_history_to_context else "false"

        headers = {"Accept": "text/event-stream"}
        timeout = httpx.Timeout(self.timeout_sec, read=None)

        with (
            httpx.Client(timeout=timeout) as client,
            client.stream("POST", url, data=payload, headers=headers) as response,
        ):
            response.raise_for_status()
            yield from _parse_sse_stream(response)
