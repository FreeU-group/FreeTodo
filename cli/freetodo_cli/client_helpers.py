"""Shared helpers for CLI HTTP clients."""

from __future__ import annotations

import json
import mimetypes
from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx

from freetodo_cli.errors import CliError, map_status_to_exit_code

if TYPE_CHECKING:
    from collections.abc import Callable

NO_CONTENT_STATUS = 204
REQUEST_ID_HEADERS = ("X-Request-Id", "X-Request-ID")


def extract_error(response: httpx.Response) -> CliError:
    """Convert an error response into a structured CLI error."""
    message = f"Request failed with status {response.status_code}"
    details: dict[str, Any] | None = None
    try:
        payload = response.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict):
        detail = payload.get("detail")
        if isinstance(detail, str):
            message = detail
        elif isinstance(detail, dict):
            message = str(detail.get("message") or detail.get("code") or message)
            details = detail
        else:
            details = payload

    return CliError(
        code=f"HTTP_{response.status_code}",
        message=message,
        exit_code=map_status_to_exit_code(response.status_code),
        details=details,
    )


def map_http_error(exc: httpx.HTTPError) -> CliError:
    """Normalize HTTP client exceptions to CLI errors."""
    if isinstance(exc, httpx.ConnectError):
        return CliError(
            code="BACKEND_UNAVAILABLE",
            message=f"Cannot connect to backend: {exc}",
            exit_code=map_status_to_exit_code(503),
        )
    return CliError(code="HTTP_ERROR", message=str(exc), exit_code=map_status_to_exit_code(503))


def get_request_id(response: httpx.Response) -> str | None:
    """Read common request-id headers from a response."""
    for header in REQUEST_ID_HEADERS:
        value = response.headers.get(header)
        if value:
            return value
    return None


def write_download(response: httpx.Response, output_path: str) -> dict[str, Any]:
    """Write binary response content to disk."""
    output = Path(output_path)
    output.write_bytes(response.content)
    return {"saved_to": str(output.resolve()), "bytes": len(response.content)}


def read_file_payload(file_path: str, *, content_type: str | None = None) -> tuple[str, bytes, str]:
    """Read one file for multipart upload."""
    path = Path(file_path)
    resolved_content_type = (
        content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    )
    return path.name, path.read_bytes(), resolved_content_type


def build_upload_list(
    field_name: str, file_paths: list[str]
) -> list[tuple[str, tuple[str, bytes, str]]]:
    """Build a multipart file list for repeated file fields."""
    uploads: list[tuple[str, tuple[str, bytes, str]]] = []
    for file_path in file_paths:
        uploads.append((field_name, read_file_payload(file_path)))
    return uploads


def append_optional_field(data: list[tuple[str, str]], key: str, value: str | None) -> None:
    """Append one optional form field."""
    if value is not None:
        data.append((key, value))


def append_repeated_fields(data: list[tuple[str, str]], key: str, values: list[str] | None) -> None:
    """Append repeatable form fields."""
    for value in values or []:
        data.append((key, value))


def collect_stream_chunks(
    response: httpx.Response,
    *,
    on_chunk: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Consume a streaming response into one payload."""
    chunks: list[str] = []
    for chunk in response.iter_text():
        if not chunk:
            continue
        chunks.append(chunk)
        if on_chunk:
            on_chunk(chunk)
    return {"session_id": response.headers.get("X-Session-Id"), "response": "".join(chunks)}


def collect_json_lines(response: httpx.Response) -> dict[str, Any]:
    """Consume a line-delimited JSON stream into a stable payload."""
    steps: list[Any] = []
    for line in response.iter_lines():
        if not line:
            continue
        try:
            steps.append(json.loads(line))
        except ValueError:
            steps.append({"raw": line})
    return {"steps": steps}
