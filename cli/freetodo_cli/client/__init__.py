"""HTTP client wrappers for CLI commands."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import httpx

from freetodo_cli.client_chat import ChatRequest
from freetodo_cli.client_helpers import (
    NO_CONTENT_STATUS,
    build_upload_list,
    collect_json_lines,
    collect_stream_chunks,
    extract_error,
    get_request_id,
    map_http_error,
    read_file_payload,
    write_download,
)
from freetodo_cli.errors import CliError

if TYPE_CHECKING:
    from collections.abc import Callable

    from freetodo_cli.config import CliConfig


class ApiClient:
    """Shared HTTP client with error handling."""

    def __init__(self, config: CliConfig):
        headers: dict[str, str] = {}
        if config.api_token:
            headers["Authorization"] = f"Bearer {config.api_token}"
        self._client = httpx.Client(
            base_url=config.base_url, timeout=config.timeout_sec, headers=headers
        )

    def close(self) -> None:
        self._client.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> tuple[Any, str | None]:
        try:
            response = self._client.request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise map_http_error(exc) from exc
        if response.is_error:
            raise extract_error(response)
        request_id = get_request_id(response)
        if response.status_code == NO_CONTENT_STATUS or not response.content:
            return None, request_id
        return response.json(), request_id

    def _download(self, path: str, output_path: str) -> tuple[Any, str | None]:
        try:
            response = self._client.get(path)
        except httpx.HTTPError as exc:
            raise map_http_error(exc) from exc
        if response.is_error:
            raise extract_error(response)
        return write_download(response, output_path), get_request_id(response)


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
        try:
            files = build_upload_list("files", file_paths)
        except OSError as exc:
            raise CliError(
                code="FILE_READ_ERROR",
                message=f"Failed to read attachment file: {exc}",
                exit_code=2,
            ) from exc
        return self._request("POST", f"/api/todos/{todo_id}/attachments", files=files)

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
        except httpx.HTTPError as exc:
            raise map_http_error(exc) from exc
        if response.is_error:
            raise extract_error(response)
        return write_download(response, output_path), get_request_id(response)

    def import_ics(self, file_path: str) -> tuple[Any, str | None]:
        try:
            name, content, content_type = read_file_payload(file_path, content_type="text/calendar")
        except OSError as exc:
            raise CliError(
                code="FILE_READ_ERROR", message=f"Failed to read ICS file: {exc}", exit_code=2
            ) from exc
        return self._request(
            "POST", "/api/todos/import/ics", files={"file": (name, content, content_type)}
        )


class ChatApiClient(ApiClient):
    """Chat streaming API client."""

    def stream_chat(  # noqa: PLR0913
        self,
        *,
        message: str,
        user_input: str | None,
        mode: str | None,
        attachments: list[str] | None,
        selected_tools: list[str] | None,
        external_tools: list[str] | None,
        context: str | None,
        system_prompt: str | None,
        conversation_id: str | None,
        use_rag: bool | None,
        on_chunk: Callable[[str], None] | None = None,
    ) -> tuple[Any, str | None]:
        request = ChatRequest(
            message=message,
            user_input=user_input,
            mode=mode,
            attachments=attachments,
            selected_tools=selected_tools,
            external_tools=external_tools,
            context=context,
            system_prompt=system_prompt,
            conversation_id=conversation_id,
            use_rag=use_rag,
            on_chunk=on_chunk,
        )
        try:
            with self._client.stream(
                "POST", "/api/chat/stream", data=request.form_data(), files=request.files()
            ) as response:
                if response.is_error:
                    response.read()
                    raise extract_error(response)
                return collect_stream_chunks(response, on_chunk=on_chunk), get_request_id(response)
        except httpx.HTTPError as exc:
            raise map_http_error(exc) from exc


class JournalApiClient(ApiClient):
    """Journal-focused API client."""

    def list_journals(
        self, *, limit: int, offset: int, start_date: str | None, end_date: str | None
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
        self, *, limit: int, offset: int, start_date: str | None, end_date: str | None
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
        self, *, start_date: str | None, end_date: str | None, app_name: str | None
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
        return self._request(
            "GET",
            "/api/memory/search",
            params={"keyword": keyword, "days": days, "max_results": max_results},
        )

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
        return self._request(
            "PUT", f"/api/scheduler/jobs/{job_id}/interval", json={"job_id": job_id, **payload}
        )

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


class SearchApiClient(ApiClient):
    """Search-focused API client."""

    def search_screenshots(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/search", json=payload)

    def search_events(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/event-search", json=payload)


class VectorApiClient(ApiClient):
    """Vector-focused API client."""

    def semantic_search(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/semantic-search", json=payload)

    def event_semantic_search(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/event-semantic-search", json=payload)

    def get_vector_stats(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/vector-stats")

    def sync_vector_database(
        self, *, limit: int | None, force_reset: bool
    ) -> tuple[Any, str | None]:
        params: dict[str, Any] = {"force_reset": force_reset}
        if limit is not None:
            params["limit"] = limit
        return self._request("POST", "/api/vector-sync", params=params)

    def reset_vector_database(self) -> tuple[Any, str | None]:
        return self._request("POST", "/api/vector-reset")


class NotificationApiClient(ApiClient):
    """Notification-focused API client."""

    def list_notifications(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/notifications")

    def delete_notification(self, notification_id: str) -> tuple[Any, str | None]:
        return self._request("DELETE", f"/api/notifications/{notification_id}")


class LocationApiClient(ApiClient):
    """Location-focused API client."""

    def report_location(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/location/report", json=payload)

    def get_latest_location(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/location/latest")

    def get_location_history(
        self, *, start: str | None, end: str | None, limit: int, offset: int
    ) -> tuple[Any, str | None]:
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if start is not None:
            params["start"] = start
        if end is not None:
            params["end"] = end
        return self._request("GET", "/api/location/history", params=params)


class TimeAllocationApiClient(ApiClient):
    """Time allocation API client."""

    def get_time_allocation(
        self, *, start_date: str | None, end_date: str | None, days: int | None
    ) -> tuple[Any, str | None]:
        params: dict[str, Any] = {}
        if start_date is not None:
            params["start_date"] = start_date
        if end_date is not None:
            params["end_date"] = end_date
        if days is not None:
            params["days"] = days
        return self._request("GET", "/api/time-allocation", params=params)


class PreviewApiClient(ApiClient):
    """Preview API client."""

    def get_preview(self, *, path: str, mode: str, max_bytes: int | None) -> tuple[Any, str | None]:
        params: dict[str, Any] = {"path": path, "mode": mode}
        if max_bytes is not None:
            params["max_bytes"] = max_bytes
        return self._request("GET", "/api/preview/file", params=params)


class CostTrackingApiClient(ApiClient):
    """Cost tracking API client."""

    def get_cost_stats(self, *, days: int) -> tuple[Any, str | None]:
        return self._request("GET", "/api/cost-tracking/stats", params={"days": days})

    def get_cost_config(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/cost-tracking/config")


class PluginsApiClient(ApiClient):
    """Plugins API client."""

    def list_plugins(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/plugins/list")

    def get_media_crawler_status(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/plugins/media-crawler/status")

    def uninstall_media_crawler(self) -> tuple[Any, str | None]:
        return self._request("POST", "/api/plugins/media-crawler/uninstall")

    def install_media_crawler(
        self, *, version: str | None, download_url: str | None
    ) -> tuple[Any, str | None]:
        params: dict[str, Any] = {}
        if version is not None:
            params["version"] = version
        if download_url is not None:
            params["download_url"] = download_url
        try:
            with self._client.stream(
                "POST", "/api/plugins/media-crawler/install", params=params
            ) as response:
                if response.is_error:
                    response.read()
                    raise extract_error(response)
                return collect_json_lines(response), get_request_id(response)
        except httpx.HTTPError as exc:
            raise map_http_error(exc) from exc


class ConfigApiClient(ApiClient):
    """Config API client."""

    def get_config(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/get-config")

    def get_llm_status(self) -> tuple[Any, str | None]:
        return self._request("GET", "/api/llm-status")

    def test_llm_config(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/test-llm-config", json=payload)

    def test_tavily_config(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/test-tavily-config", json=payload)

    def test_asr_config(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/test-asr-config", json=payload)

    def save_config(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/save-config", json=payload)

    def save_and_init_llm(self, payload: dict[str, Any]) -> tuple[Any, str | None]:
        return self._request("POST", "/api/save-and-init-llm", json=payload)


class HealthApiClient(ApiClient):
    """Health API client."""

    def get_root(self) -> tuple[Any, str | None]:
        return self._request("GET", "/")

    def get_health(self) -> tuple[Any, str | None]:
        return self._request("GET", "/health")

    def get_llm_health(self) -> tuple[Any, str | None]:
        return self._request("GET", "/health/llm")
