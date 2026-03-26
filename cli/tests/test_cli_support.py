from __future__ import annotations

from typer.testing import CliRunner

from freetodo_cli.app import app
from freetodo_cli.errors import CliError

__all__ = [
    "CliError",
    "_StubActivityClient",
    "_StubApiClient",
    "_StubAudioClient",
    "_StubAutomationClient",
    "_StubConfigClient",
    "_StubCostTrackingClient",
    "_StubEventClient",
    "_StubHealthClient",
    "_StubJournalClient",
    "_StubLocationClient",
    "_StubLogsClient",
    "_StubMemoryClient",
    "_StubNotificationClient",
    "_StubPluginsClient",
    "_StubPreviewClient",
    "_StubSchedulerClient",
    "_StubScreenshotClient",
    "_StubSearchClient",
    "_StubSystemClient",
    "_StubTimeAllocationClient",
    "_StubTodoClient",
    "_StubVectorClient",
    "app",
    "runner",
]

runner = CliRunner()


class _StubTodoClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def list_todos(self, *, limit: int, offset: int, status: str | None):
        return self.behavior("list_todos", limit=limit, offset=offset, status=status)

    def get_todo(self, todo_id: int):
        return self.behavior("get_todo", todo_id=todo_id)

    def create_todo(self, payload):
        return self.behavior("create_todo", payload=payload)

    def update_todo(self, todo_id: int, payload):
        return self.behavior("update_todo", todo_id=todo_id, payload=payload)

    def delete_todo(self, todo_id: int):
        return self.behavior("delete_todo", todo_id=todo_id)

    def reorder_todos(self, payload):
        return self.behavior("reorder_todos", payload=payload)

    def upload_attachments(self, todo_id: int, file_paths: list[str]):
        return self.behavior("upload_attachments", todo_id=todo_id, file_paths=file_paths)

    def delete_attachment(self, todo_id: int, attachment_id: int):
        return self.behavior("delete_attachment", todo_id=todo_id, attachment_id=attachment_id)

    def download_attachment(self, attachment_id: int, output_path: str):
        return self.behavior(
            "download_attachment", attachment_id=attachment_id, output_path=output_path
        )

    def export_ics(self, *, output_path: str, limit: int, offset: int, status: str | None):
        return self.behavior(
            "export_ics", output_path=output_path, limit=limit, offset=offset, status=status
        )

    def import_ics(self, file_path: str):
        return self.behavior("import_ics", file_path=file_path)


class _StubApiClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def health_check(self):
        return self.behavior("health_check")


class _StubJournalClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def list_journals(
        self, *, limit: int, offset: int, start_date: str | None, end_date: str | None
    ):
        return self.behavior(
            "list_journals",
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
        )

    def get_journal(self, journal_id: int):
        return self.behavior("get_journal", journal_id=journal_id)

    def create_journal(self, payload):
        return self.behavior("create_journal", payload=payload)

    def update_journal(self, journal_id: int, payload):
        return self.behavior("update_journal", journal_id=journal_id, payload=payload)

    def delete_journal(self, journal_id: int):
        return self.behavior("delete_journal", journal_id=journal_id)

    def auto_link_journal(self, payload):
        return self.behavior("auto_link_journal", payload=payload)

    def generate_objective_journal(self, payload):
        return self.behavior("generate_objective_journal", payload=payload)

    def generate_ai_journal(self, payload):
        return self.behavior("generate_ai_journal", payload=payload)


class _StubActivityClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def list_activities(
        self, *, limit: int, offset: int, start_date: str | None, end_date: str | None
    ):
        return self.behavior(
            "list_activities",
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
        )

    def get_activity_events(self, activity_id: int):
        return self.behavior("get_activity_events", activity_id=activity_id)

    def create_activity_manual(self, payload):
        return self.behavior("create_activity_manual", payload=payload)


class _StubEventClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def list_events(
        self,
        *,
        limit: int,
        offset: int,
        start_date: str | None,
        end_date: str | None,
        app_name: str | None,
    ):
        return self.behavior(
            "list_events",
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )

    def count_events(self, *, start_date: str | None, end_date: str | None, app_name: str | None):
        return self.behavior(
            "count_events",
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )

    def get_event(self, event_id: int):
        return self.behavior("get_event", event_id=event_id)

    def get_event_context(self, event_id: int):
        return self.behavior("get_event_context", event_id=event_id)

    def generate_event_summary(self, event_id: int):
        return self.behavior("generate_event_summary", event_id=event_id)


class _StubAutomationClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def list_tasks(self):
        return self.behavior("list_tasks")

    def get_task(self, task_id: int):
        return self.behavior("get_task", task_id=task_id)

    def create_task(self, payload):
        return self.behavior("create_task", payload=payload)

    def update_task(self, task_id: int, payload):
        return self.behavior("update_task", task_id=task_id, payload=payload)

    def delete_task(self, task_id: int):
        return self.behavior("delete_task", task_id=task_id)

    def run_task(self, task_id: int):
        return self.behavior("run_task", task_id=task_id)

    def pause_task(self, task_id: int):
        return self.behavior("pause_task", task_id=task_id)

    def resume_task(self, task_id: int):
        return self.behavior("resume_task", task_id=task_id)


class _StubMemoryClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def get_today_memory(self):
        return self.behavior("get_today_memory")

    def get_memory_by_date(self, date_str: str):
        return self.behavior("get_memory_by_date", date_str=date_str)

    def get_raw_memory(self, date_str: str):
        return self.behavior("get_raw_memory", date_str=date_str)

    def search_memory(self, *, keyword: str, days: int, max_results: int):
        return self.behavior("search_memory", keyword=keyword, days=days, max_results=max_results)

    def list_memory_dates(self):
        return self.behavior("list_memory_dates")

    def get_memory_status(self):
        return self.behavior("get_memory_status")

    def trigger_compress(self, date_str: str):
        return self.behavior("trigger_compress", date_str=date_str)

    def get_dedup_stats(self):
        return self.behavior("get_dedup_stats")

    def trigger_task_link(self, date_str: str):
        return self.behavior("trigger_task_link", date_str=date_str)

    def trigger_compress_and_link(self, date_str: str):
        return self.behavior("trigger_compress_and_link", date_str=date_str)

    def get_task_linker_stats(self):
        return self.behavior("get_task_linker_stats")

    def get_profile(self):
        return self.behavior("get_profile")

    def trigger_profile_update(self):
        return self.behavior("trigger_profile_update")

    def trigger_profile_consolidate(self):
        return self.behavior("trigger_profile_consolidate")

    def get_profile_stats(self):
        return self.behavior("get_profile_stats")


class _StubScreenshotClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def list_screenshots(
        self,
        *,
        limit: int,
        offset: int,
        start_date: str | None,
        end_date: str | None,
        app_name: str | None,
    ):
        return self.behavior(
            "list_screenshots",
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
            app_name=app_name,
        )

    def get_screenshot(self, screenshot_id: int):
        return self.behavior("get_screenshot", screenshot_id=screenshot_id)

    def get_screenshot_path(self, screenshot_id: int):
        return self.behavior("get_screenshot_path", screenshot_id=screenshot_id)

    def download_screenshot_image(self, screenshot_id: int, output_path: str):
        return self.behavior(
            "download_screenshot_image", screenshot_id=screenshot_id, output_path=output_path
        )


class _StubAudioClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def get_recordings(self, *, date: str | None):
        return self.behavior("get_recordings", date=date)

    def get_timeline(self, *, date: str | None):
        return self.behavior("get_timeline", date=date)

    def get_transcription(self, recording_id: int):
        return self.behavior("get_transcription", recording_id=recording_id)

    def link_extracted_items(self, recording_id: int, payload):
        return self.behavior("link_extracted_items", recording_id=recording_id, payload=payload)

    def extract_todos(self, recording_id: int):
        return self.behavior("extract_todos", recording_id=recording_id)

    def download_recording(self, recording_id: int, output_path: str):
        return self.behavior(
            "download_recording", recording_id=recording_id, output_path=output_path
        )


class _StubSchedulerClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def list_jobs(self):
        return self.behavior("list_jobs")

    def get_job(self, job_id: str):
        return self.behavior("get_job", job_id=job_id)

    def get_status(self):
        return self.behavior("get_status")

    def pause_job(self, job_id: str):
        return self.behavior("pause_job", job_id=job_id)

    def resume_job(self, job_id: str):
        return self.behavior("resume_job", job_id=job_id)

    def delete_job(self, job_id: str):
        return self.behavior("delete_job", job_id=job_id)

    def update_job_interval(self, job_id: str, payload):
        return self.behavior("update_job_interval", job_id=job_id, payload=payload)

    def pause_all_jobs(self):
        return self.behavior("pause_all_jobs")

    def resume_all_jobs(self):
        return self.behavior("resume_all_jobs")


class _StubLogsClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def list_log_files(self):
        return self.behavior("list_log_files")

    def get_log_content(self, file_path: str):
        return self.behavior("get_log_content", file_path=file_path)


class _StubSystemClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def get_statistics(self):
        return self.behavior("get_statistics")

    def cleanup_old_data(self, *, days: int):
        return self.behavior("cleanup_old_data", days=days)

    def get_system_resources(self):
        return self.behavior("get_system_resources")

    def get_capabilities(self):
        return self.behavior("get_capabilities")


class _StubSearchClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def search_screenshots(self, payload):
        return self.behavior("search_screenshots", payload=payload)

    def search_events(self, payload):
        return self.behavior("search_events", payload=payload)


class _StubVectorClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def semantic_search(self, payload):
        return self.behavior("semantic_search", payload=payload)

    def event_semantic_search(self, payload):
        return self.behavior("event_semantic_search", payload=payload)

    def get_vector_stats(self):
        return self.behavior("get_vector_stats")

    def sync_vector_database(self, *, limit: int | None, force_reset: bool):
        return self.behavior("sync_vector_database", limit=limit, force_reset=force_reset)

    def reset_vector_database(self):
        return self.behavior("reset_vector_database")


class _StubNotificationClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def list_notifications(self):
        return self.behavior("list_notifications")

    def delete_notification(self, notification_id: str):
        return self.behavior("delete_notification", notification_id=notification_id)


class _StubLocationClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def report_location(self, payload):
        return self.behavior("report_location", payload=payload)

    def get_latest_location(self):
        return self.behavior("get_latest_location")

    def get_location_history(self, *, start: str | None, end: str | None, limit: int, offset: int):
        return self.behavior(
            "get_location_history",
            start=start,
            end=end,
            limit=limit,
            offset=offset,
        )


class _StubTimeAllocationClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def get_time_allocation(
        self, *, start_date: str | None, end_date: str | None, days: int | None
    ):
        return self.behavior(
            "get_time_allocation",
            start_date=start_date,
            end_date=end_date,
            days=days,
        )


class _StubPreviewClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def get_preview(self, *, path: str, mode: str, max_bytes: int | None):
        return self.behavior("get_preview", path=path, mode=mode, max_bytes=max_bytes)


class _StubCostTrackingClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def get_cost_stats(self, *, days: int):
        return self.behavior("get_cost_stats", days=days)

    def get_cost_config(self):
        return self.behavior("get_cost_config")


class _StubPluginsClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def list_plugins(self):
        return self.behavior("list_plugins")

    def get_media_crawler_status(self):
        return self.behavior("get_media_crawler_status")

    def install_media_crawler(self, *, version: str | None, download_url: str | None):
        return self.behavior("install_media_crawler", version=version, download_url=download_url)

    def uninstall_media_crawler(self):
        return self.behavior("uninstall_media_crawler")


class _StubConfigClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def get_config(self):
        return self.behavior("get_config")

    def get_llm_status(self):
        return self.behavior("get_llm_status")

    def test_llm_config(self, payload):
        return self.behavior("test_llm_config", payload=payload)

    def test_tavily_config(self, payload):
        return self.behavior("test_tavily_config", payload=payload)

    def test_asr_config(self, payload):
        return self.behavior("test_asr_config", payload=payload)

    def save_config(self, payload):
        return self.behavior("save_config", payload=payload)

    def save_and_init_llm(self, payload):
        return self.behavior("save_and_init_llm", payload=payload)


class _StubHealthClient:
    def __init__(self, behavior):
        self.behavior = behavior

    def close(self) -> None:
        return None

    def get_root(self):
        return self.behavior("get_root")

    def get_health(self):
        return self.behavior("get_health")

    def get_llm_health(self):
        return self.behavior("get_llm_health")
