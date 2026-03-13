"""HTTP client wrappers for CLI commands."""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

import httpx

from cli.errors import CliError, map_status_to_exit_code

if TYPE_CHECKING:
    from cli.config import CliConfig


NO_CONTENT_STATUS = 204


def _extract_error(response: httpx.Response) -> CliError:
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


class ApiClient:
    """Shared HTTP client with error handling."""

    def __init__(self, config: CliConfig):
        headers: dict[str, str] = {}
        if config.api_token:
            headers["Authorization"] = f"Bearer {config.api_token}"
        self._client = httpx.Client(
            base_url=config.base_url,
            timeout=config.timeout_sec,
            headers=headers,
        )

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> tuple[Any, str | None]:
        try:
            response = self._client.request(method, path, **kwargs)
        except httpx.ConnectError as exc:
            raise CliError(
                code="BACKEND_UNAVAILABLE",
                message=f"Cannot connect to backend: {exc}",
                exit_code=map_status_to_exit_code(503),
            ) from exc
        except httpx.HTTPError as exc:
            raise CliError(
                code="HTTP_ERROR",
                message=str(exc),
                exit_code=map_status_to_exit_code(503),
            ) from exc

        if response.is_error:
            raise _extract_error(response)

        request_id = response.headers.get("X-Request-Id") or response.headers.get("X-Request-ID")
        if response.status_code == NO_CONTENT_STATUS or not response.content:
            return None, request_id
        return response.json(), request_id

    def health_check(self) -> tuple[Any, str | None]:
        """Check backend health."""
        return self._request("GET", "/health")


class TodoApiClient(ApiClient):
    """Todo-focused API client."""

    def list_todos(self, *, limit: int, offset: int, status: str | None) -> tuple[Any, str | None]:
        params = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status
        return self._request("GET", "/api/todos", params=params)

    def get_todo(self, todo_id: int) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/todos/{todo_id}")

    def create_todo(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/todos", json=payload)

    def update_todo(self, todo_id: int, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("PUT", f"/api/todos/{todo_id}", json=payload)

    def delete_todo(self, todo_id: int) -> tuple[Any, str | None]:
        return self._request("DELETE", f"/api/todos/{todo_id}")

    def reorder_todos(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/todos/reorder", json=payload)

    def upload_attachments(self, todo_id: int, file_paths: list[str]) -> tuple[Any, str | None]:
        files = []
        try:
            for file_path in file_paths:
                file_name = Path(file_path).name
                files.append(
                    ("files", (file_name, Path(file_path).read_bytes(), "application/octet-stream"))
                )
            return self._request("POST", f"/api/todos/{todo_id}/attachments", files=files)
        except OSError as exc:
            raise CliError(
                code="FILE_READ_ERROR",
                message=f"Failed to read attachment file: {exc}",
                exit_code=2,
            ) from exc

    def delete_attachment(self, todo_id: int, attachment_id: int) -> tuple[Any, str | None]:
        return self._request("DELETE", f"/api/todos/{todo_id}/attachments/{attachment_id}")

    def download_attachment(self, attachment_id: int, output_path: str) -> tuple[Any, str | None]:
        try:
            response = self._client.get(f"/api/todos/attachments/{attachment_id}/file")
        except httpx.ConnectError as exc:
            raise CliError(
                code="BACKEND_UNAVAILABLE",
                message=f"Cannot connect to backend: {exc}",
                exit_code=map_status_to_exit_code(503),
            ) from exc
        except httpx.HTTPError as exc:
            raise CliError(
                code="HTTP_ERROR",
                message=str(exc),
                exit_code=map_status_to_exit_code(503),
            ) from exc
        if response.is_error:
            raise _extract_error(response)
        output = Path(output_path)
        output.write_bytes(response.content)
        request_id = response.headers.get("X-Request-Id") or response.headers.get("X-Request-ID")
        return {"saved_to": str(output.resolve()), "bytes": len(response.content)}, request_id

    def export_ics(
        self,
        *,
        output_path: str,
        limit: int,
        offset: int,
        status: str | None,
    ) -> tuple[Any, str | None]:
        params = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status
        try:
            response = self._client.get("/api/todos/export/ics", params=params)
        except httpx.ConnectError as exc:
            raise CliError(
                code="BACKEND_UNAVAILABLE",
                message=f"Cannot connect to backend: {exc}",
                exit_code=map_status_to_exit_code(503),
            ) from exc
        except httpx.HTTPError as exc:
            raise CliError(
                code="HTTP_ERROR",
                message=str(exc),
                exit_code=map_status_to_exit_code(503),
            ) from exc
        if response.is_error:
            raise _extract_error(response)
        output = Path(output_path)
        output.write_bytes(response.content)
        request_id = response.headers.get("X-Request-Id") or response.headers.get("X-Request-ID")
        return {"saved_to": str(output.resolve()), "bytes": len(response.content)}, request_id

    def import_ics(self, file_path: str) -> tuple[Any, str | None]:
        try:
            path = Path(file_path)
            files = {"file": (path.name, path.read_bytes(), "text/calendar")}
        except OSError as exc:
            raise CliError(
                code="FILE_READ_ERROR",
                message=f"Failed to read ICS file: {exc}",
                exit_code=2,
            ) from exc
        return self._request("POST", "/api/todos/import/ics", files=files)
