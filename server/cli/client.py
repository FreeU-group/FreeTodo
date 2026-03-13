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

    def _download(self, path: str, output_path: str) -> tuple[Any, str | None]:
        try:
            response = self._client.get(path)
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
        return self._download(f"/api/todos/attachments/{attachment_id}/file", output_path)

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


class JournalApiClient(ApiClient):
    """Journal-focused API client."""

    def list_journals(
        self,
        *,
        limit: int,
        offset: int,
        start_date: str | None,
        end_date: str | None,
    ) -> tuple[Any, str | None]:
        params = {"limit": limit, "offset": offset}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        return self._request("GET", "/api/journals", params=params)

    def get_journal(self, journal_id: int) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/journals/{journal_id}")

    def create_journal(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/journals", json=payload)

    def update_journal(self, journal_id: int, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("PUT", f"/api/journals/{journal_id}", json=payload)

    def delete_journal(self, journal_id: int) -> tuple[Any, str | None]:
        return self._request("DELETE", f"/api/journals/{journal_id}")

    def auto_link_journal(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/journals/auto-link", json=payload)

    def generate_objective_journal(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/journals/generate-objective", json=payload)

    def generate_ai_journal(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/journals/generate-ai", json=payload)


class ActivityApiClient(ApiClient):
    """Activity-focused API client."""

    def list_activities(
        self,
        *,
        limit: int,
        offset: int,
        start_date: str | None,
        end_date: str | None,
    ) -> tuple[Any, str | None]:
        params = {"limit": limit, "offset": offset}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        return self._request("GET", "/api/activities", params=params)

    def get_activity_events(self, activity_id: int) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/activities/{activity_id}/events")

    def create_activity_manual(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/activities/manual", json=payload)


class EventApiClient(ApiClient):
    """Event-focused API client."""

    def list_events(
        self,
        *,
        limit: int,
        offset: int,
        start_date: str | None,
        end_date: str | None,
        app_name: str | None,
    ) -> tuple[Any, str | None]:
        params = {"limit": limit, "offset": offset}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        if app_name:
            params["app_name"] = app_name
        return self._request("GET", "/api/events", params=params)

    def count_events(
        self,
        *,
        start_date: str | None,
        end_date: str | None,
        app_name: str | None,
    ) -> tuple[Any, str | None]:
        params: dict[str, Any] = {}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        if app_name:
            params["app_name"] = app_name
        return self._request("GET", "/api/events/count", params=params)

    def get_event(self, event_id: int) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/events/{event_id}")

    def get_event_context(self, event_id: int) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/events/{event_id}/context")

    def generate_event_summary(self, event_id: int) -> tuple[Any, str | None]:
        return self._request("POST", f"/api/events/{event_id}/generate-summary")


class AutomationApiClient(ApiClient):
    """Automation-focused API client."""

    def list_tasks(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/automation/tasks")

    def get_task(self, task_id: int) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/automation/tasks/{task_id}")

    def create_task(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/automation/tasks", json=payload)

    def update_task(self, task_id: int, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("PUT", f"/api/automation/tasks/{task_id}", json=payload)

    def delete_task(self, task_id: int) -> tuple[Any, str | None]:
        return self._request("DELETE", f"/api/automation/tasks/{task_id}")

    def run_task(self, task_id: int) -> tuple[Any, str | None]:
        return self._request("POST", f"/api/automation/tasks/{task_id}/run")

    def pause_task(self, task_id: int) -> tuple[Any, str | None]:
        return self._request("POST", f"/api/automation/tasks/{task_id}/pause")

    def resume_task(self, task_id: int) -> tuple[Any, str | None]:
        return self._request("POST", f"/api/automation/tasks/{task_id}/resume")


class MemoryApiClient(ApiClient):
    """Memory-focused API client."""

    def get_today_memory(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/memory/today")

    def get_memory_by_date(self, date_str: str) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/memory/date/{date_str}")

    def get_raw_memory(self, date_str: str) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/memory/raw/{date_str}")

    def search_memory(self, *, keyword: str, days: int, max_results: int) -> tuple[Any, str | None]:
        params = {"keyword": keyword, "days": days, "max_results": max_results}
        return self._request("GET", "/api/memory/search", params=params)

    def list_memory_dates(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/memory/dates")

    def get_memory_status(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/memory/status")

    def trigger_compress(self, date_str: str) -> tuple[Any, str | None]:
        return self._request("POST", f"/api/memory/compress/{date_str}")

    def get_dedup_stats(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/memory/dedup-stats")

    def trigger_task_link(self, date_str: str) -> tuple[Any, str | None]:
        return self._request("POST", f"/api/memory/link/{date_str}")

    def trigger_compress_and_link(self, date_str: str) -> tuple[Any, str | None]:
        return self._request("POST", f"/api/memory/compress-and-link/{date_str}")

    def get_task_linker_stats(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/memory/task-linker-stats")

    def get_profile(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/memory/profile")

    def trigger_profile_update(self) -> tuple[Any, str | None]:
        return self._request("POST", "/api/memory/profile/update")

    def trigger_profile_consolidate(self) -> tuple[Any, str | None]:
        return self._request("POST", "/api/memory/profile/consolidate")

    def get_profile_stats(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/memory/profile-stats")


class ScreenshotApiClient(ApiClient):
    """Screenshot-focused API client."""

    def list_screenshots(
        self,
        *,
        limit: int,
        offset: int,
        start_date: str | None,
        end_date: str | None,
        app_name: str | None,
    ) -> tuple[Any, str | None]:
        params = {"limit": limit, "offset": offset}
        if start_date:
            params["start_date"] = start_date
        if end_date:
            params["end_date"] = end_date
        if app_name:
            params["app_name"] = app_name
        return self._request("GET", "/api/screenshots", params=params)

    def get_screenshot(self, screenshot_id: int) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/screenshots/{screenshot_id}")

    def get_screenshot_path(self, screenshot_id: int) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/screenshots/{screenshot_id}/path")

    def download_screenshot_image(
        self, screenshot_id: int, output_path: str
    ) -> tuple[Any, str | None]:
        return self._download(f"/api/screenshots/{screenshot_id}/image", output_path)


class AudioApiClient(ApiClient):
    """Audio-focused API client."""

    def get_recordings(self, *, date: str | None) -> tuple[Any, str | None]:
        params: dict[str, Any] = {}
        if date:
            params["date"] = date
        return self._request("GET", "/api/audio/recordings", params=params)

    def get_timeline(self, *, date: str | None) -> tuple[Any, str | None]:
        params: dict[str, Any] = {}
        if date:
            params["date"] = date
        return self._request("GET", "/api/audio/timeline", params=params)

    def get_transcription(self, recording_id: int) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/audio/transcription/{recording_id}")

    def link_extracted_items(
        self, recording_id: int, payload: dict[str, Any]
    ) -> tuple[Any, str | None]:
        return self._request("POST", f"/api/audio/transcription/{recording_id}/link", json=payload)

    def extract_todos(self, recording_id: int) -> tuple[Any, str | None]:
        return self._request("POST", "/api/audio/extract", params={"recording_id": recording_id})

    def download_recording(self, recording_id: int, output_path: str) -> tuple[Any, str | None]:
        return self._download(f"/api/audio/recording/{recording_id}/file", output_path)


class SchedulerApiClient(ApiClient):
    """Scheduler-focused API client."""

    def list_jobs(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/scheduler/jobs")

    def get_job(self, job_id: str) -> tuple[Any, str | None]:
        return self._request("GET", f"/api/scheduler/jobs/{job_id}")

    def get_status(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/scheduler/status")

    def pause_job(self, job_id: str) -> tuple[Any, str | None]:
        return self._request("POST", f"/api/scheduler/jobs/{job_id}/pause")

    def resume_job(self, job_id: str) -> tuple[Any, str | None]:
        return self._request("POST", f"/api/scheduler/jobs/{job_id}/resume")

    def delete_job(self, job_id: str) -> tuple[Any, str | None]:
        return self._request("DELETE", f"/api/scheduler/jobs/{job_id}")

    def update_job_interval(self, job_id: str, payload: dict[str, Any]) -> tuple[Any, str | None]:
        payload_with_id = {"job_id": job_id, **payload}
        return self._request("PUT", f"/api/scheduler/jobs/{job_id}/interval", json=payload_with_id)

    def pause_all_jobs(self) -> tuple[Any, str | None]:
        return self._request("POST", "/api/scheduler/jobs/pause-all")

    def resume_all_jobs(self) -> tuple[Any, str | None]:
        return self._request("POST", "/api/scheduler/jobs/resume-all")


class LogsApiClient(ApiClient):
    """Logs-focused API client."""

    def list_log_files(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/logs/files")

    def get_log_content(self, file_path: str) -> tuple[Any, str | None]:
        data, request_id = self._request("GET", "/api/logs/content", params={"file": file_path})
        return {"file": file_path, "content": data}, request_id


class SystemApiClient(ApiClient):
    """System-focused API client."""

    def get_statistics(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/statistics")

    def cleanup_old_data(self, *, days: int) -> tuple[Any, str | None]:
        return self._request("POST", "/api/cleanup", params={"days": days})

    def get_system_resources(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/system-resources")

    def get_capabilities(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/capabilities")
