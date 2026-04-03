from __future__ import annotations

import json

from typer.testing import CliRunner

from freetodo_cli.app import app
from freetodo_cli.errors import CliError

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


def test_todo_list_outputs_json(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "list_todos"
        assert kwargs == {"limit": 10, "offset": 5, "status": "active"}
        return {"total": 1, "todos": [{"id": 1, "name": "demo"}]}, "req-list"

    monkeypatch.setattr(
        "cli.commands.todo.create_todo_client",
        lambda: _StubTodoClient(behavior),
    )

    result = runner.invoke(
        app, ["todo", "list", "--limit", "10", "--offset", "5", "--status", "active"]
    )

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["ok"] is True
    assert payload["meta"]["action"] == "list"
    assert payload["meta"]["request_id"] == "req-list"
    assert payload["data"]["total"] == 1


def test_todo_create_validates_payload_and_passes_json(monkeypatch, tmp_path):
    input_file = tmp_path / "todo.json"
    input_file.write_text(json.dumps({"name": "Write tests", "status": "active"}), encoding="utf-8")

    def behavior(name, **kwargs):
        assert name == "create_todo"
        assert kwargs["payload"]["name"] == "Write tests"
        assert kwargs["payload"]["status"] == "active"
        return {"id": 8, "name": "Write tests", "status": "active"}, "req-create"

    monkeypatch.setattr(
        "cli.commands.todo.create_todo_client",
        lambda: _StubTodoClient(behavior),
    )

    result = runner.invoke(app, ["todo", "create", "--input", str(input_file)])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["id"] == 8
    assert payload["meta"]["request_id"] == "req-create"


def test_todo_create_dry_run_does_not_call_backend(tmp_path):
    input_file = tmp_path / "todo.json"
    input_file.write_text(
        json.dumps({"name": "Dry Run Todo", "status": "active"}), encoding="utf-8"
    )

    result = runner.invoke(app, ["todo", "create", "--input", str(input_file), "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert payload["data"]["payload"]["name"] == "Dry Run Todo"


def test_todo_update_requires_non_empty_patch(tmp_path):
    patch_file = tmp_path / "patch.json"
    patch_file.write_text("{}", encoding="utf-8")

    result = runner.invoke(app, ["todo", "update", "--id", "3", "--patch", str(patch_file)])

    assert result.exit_code == 2
    payload = json.loads(result.stderr)
    assert payload["ok"] is False
    assert payload["error"]["code"] == "EMPTY_PATCH"


def test_todo_get_returns_structured_error(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "get_todo"
        raise CliError(code="HTTP_404", message="todo 不存在", exit_code=5, details={"todo_id": 99})

    monkeypatch.setattr(
        "cli.commands.todo.create_todo_client",
        lambda: _StubTodoClient(behavior),
    )

    result = runner.invoke(app, ["todo", "get", "--id", "99"])

    assert result.exit_code == 5
    payload = json.loads(result.stderr)
    assert payload["error"]["code"] == "HTTP_404"
    assert payload["error"]["message"] == "todo 不存在"


def test_root_help_defaults_to_english():
    result = runner.invoke(app, ["--help"])

    assert result.exit_code == 0
    assert "Agent-first CLI" in result.stdout
    assert "FREETODO_BASE_URL" in result.stdout
    assert "面向 Agent" not in result.stdout


def test_todo_help_defaults_to_english():
    result = runner.invoke(app, ["todo", "--help"])

    assert result.exit_code == 0
    assert "Use JSON-first commands" in result.stdout
    assert "freetodo todo create --input todo.json --json" in result.stdout
    assert "Todo 资源命令" not in result.stdout


def test_localized_help_can_render_chinese():
    result = runner.invoke(app, ["help", "todo", "--lang", "zh"])

    assert result.exit_code == 0
    assert "Todo 资源命令" in result.stdout
    assert "freetodo todo create --input todo.json --json" in result.stdout


def test_localized_help_can_render_bilingual_root():
    result = runner.invoke(app, ["help", "root", "--lang", "bilingual"])

    assert result.exit_code == 0
    assert "Agent-first CLI" in result.stdout
    assert "面向 Agent 的 Lifetrace/FreeTodo 后端命令行入口" in result.stdout


def test_journal_help_defaults_to_english():
    result = runner.invoke(app, ["journal", "--help"])

    assert result.exit_code == 0
    assert "Journal resource commands" in result.stdout
    assert "freetodo journal create --input journal.json --json" in result.stdout


def test_activity_help_defaults_to_english():
    result = runner.invoke(app, ["activity", "--help"])

    assert result.exit_code == 0
    assert "Activity resource commands" in result.stdout
    assert "freetodo activity create-manual --input activity.json --json" in result.stdout


def test_event_help_defaults_to_english():
    result = runner.invoke(app, ["event", "--help"])

    assert result.exit_code == 0
    assert "Event resource commands" in result.stdout
    assert "freetodo event generate-summary --id 42 --json" in result.stdout


def test_automation_help_defaults_to_english():
    result = runner.invoke(app, ["automation", "--help"])

    assert result.exit_code == 0
    assert "Automation task commands" in result.stdout
    assert "freetodo automation create --input task.json --json" in result.stdout


def test_memory_help_defaults_to_english():
    result = runner.invoke(app, ["memory", "--help"])

    assert result.exit_code == 0
    assert "Memory resource commands" in result.stdout
    assert "freetodo memory search --keyword cli --json" in result.stdout


def test_screenshot_help_defaults_to_english():
    result = runner.invoke(app, ["screenshot", "--help"])

    assert result.exit_code == 0
    assert "Screenshot resource commands" in result.stdout
    assert "freetodo screenshot download --id 42 --output shot.png --json" in result.stdout


def test_audio_help_defaults_to_english():
    result = runner.invoke(app, ["audio", "--help"])

    assert result.exit_code == 0
    assert "Audio resource commands" in result.stdout
    assert "freetodo audio transcription --id 12 --json" in result.stdout


def test_scheduler_help_defaults_to_english():
    result = runner.invoke(app, ["scheduler", "--help"])

    assert result.exit_code == 0
    assert "Scheduler resource commands" in result.stdout
    assert "freetodo scheduler pause --id clean_data_job --json" in result.stdout


def test_logs_help_defaults_to_english():
    result = runner.invoke(app, ["logs", "--help"])

    assert result.exit_code == 0
    assert "Logs resource commands" in result.stdout
    assert "freetodo logs content --file server/app.log --json" in result.stdout


def test_system_help_defaults_to_english():
    result = runner.invoke(app, ["system", "--help"])

    assert result.exit_code == 0
    assert "System resource commands" in result.stdout
    assert "freetodo system cleanup --days 30 --dry-run --json" in result.stdout


def test_search_help_defaults_to_english():
    result = runner.invoke(app, ["search", "--help"])

    assert result.exit_code == 0
    assert "Search resource commands" in result.stdout
    assert "freetodo search events --input search.json --json" in result.stdout


def test_vector_help_defaults_to_english():
    result = runner.invoke(app, ["vector", "--help"])

    assert result.exit_code == 0
    assert "Vector resource commands" in result.stdout
    assert "freetodo vector sync --limit 100 --dry-run --json" in result.stdout


def test_notification_help_defaults_to_english():
    result = runner.invoke(app, ["notification", "--help"])

    assert result.exit_code == 0
    assert "Notification resource commands" in result.stdout
    assert "freetodo notification delete --id notif-123 --dry-run --json" in result.stdout


def test_location_help_defaults_to_english():
    result = runner.invoke(app, ["location", "--help"])

    assert result.exit_code == 0
    assert "Location resource commands" in result.stdout
    assert "freetodo location report --input location.json --dry-run --json" in result.stdout


def test_time_allocation_help_defaults_to_english():
    result = runner.invoke(app, ["time-allocation", "--help"])

    assert result.exit_code == 0
    assert "Time allocation resource commands" in result.stdout
    assert "freetodo time-allocation get --days 7 --json" in result.stdout


def test_preview_help_defaults_to_english():
    result = runner.invoke(app, ["preview", "--help"])

    assert result.exit_code == 0
    assert "Preview resource commands" in result.stdout
    assert "freetodo preview file --path /abs/path/file.txt --mode text --json" in result.stdout


def test_cost_tracking_help_defaults_to_english():
    result = runner.invoke(app, ["cost-tracking", "--help"])

    assert result.exit_code == 0
    assert "Cost tracking resource commands" in result.stdout
    assert "freetodo cost-tracking stats --days 30 --json" in result.stdout


def test_plugins_help_defaults_to_english():
    result = runner.invoke(app, ["plugins", "--help"])

    assert result.exit_code == 0
    assert "Plugins resource commands" in result.stdout
    assert "freetodo plugins media-crawler status --json" in result.stdout


def test_config_help_defaults_to_english():
    result = runner.invoke(app, ["config", "--help"])

    assert result.exit_code == 0
    assert "Config resource commands" in result.stdout
    assert "freetodo config save --input config.json --dry-run --json" in result.stdout


def test_health_help_defaults_to_english():
    result = runner.invoke(app, ["health", "--help"])

    assert result.exit_code == 0
    assert "Health resource commands" in result.stdout
    assert "freetodo health status --json" in result.stdout


def test_todo_schema_outputs_example():
    result = runner.invoke(app, ["todo", "schema", "--kind", "update"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["kind"] == "update"
    assert payload["data"]["example"]["status"] == "completed"


def test_doctor_outputs_health(monkeypatch):
    def behavior(name):
        assert name == "health_check"
        return {"status": "healthy", "app": "lifetrace"}, "req-health"

    monkeypatch.setattr("cli.app.ApiClient", lambda _config: _StubApiClient(behavior))

    result = runner.invoke(app, ["doctor"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["backend_health"]["status"] == "healthy"
    assert payload["meta"]["request_id"] == "req-health"


def test_todo_batch_update_runs_multiple_updates(monkeypatch, tmp_path):
    input_file = tmp_path / "batch.json"
    input_file.write_text(
        json.dumps(
            {
                "items": [
                    {"id": 1, "patch": {"status": "completed"}},
                    {"id": 2, "patch": {"priority": "high"}},
                ]
            }
        ),
        encoding="utf-8",
    )

    calls: list[tuple[int, dict]] = []

    def behavior(name, **kwargs):
        assert name == "update_todo"
        calls.append((kwargs["todo_id"], kwargs["payload"]))
        return {"id": kwargs["todo_id"], **kwargs["payload"]}, f"req-{kwargs['todo_id']}"

    monkeypatch.setattr("cli.commands.todo.create_todo_client", lambda: _StubTodoClient(behavior))

    result = runner.invoke(app, ["todo", "batch-update", "--input", str(input_file)])

    assert result.exit_code == 0
    assert calls == [(1, {"status": "completed"}), (2, {"priority": "high"})]
    payload = json.loads(result.stdout)
    assert payload["data"]["count"] == 2


def test_attach_dry_run_outputs_files(tmp_path):
    attachment = tmp_path / "note.txt"
    attachment.write_text("hello", encoding="utf-8")

    result = runner.invoke(
        app, ["todo", "attach", "--id", "3", "--file", str(attachment), "--dry-run"]
    )

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert str(attachment) in payload["data"]["payload"]["files"]


def test_import_ics_dry_run_outputs_file(tmp_path):
    ics_file = tmp_path / "todo.ics"
    ics_file.write_text("BEGIN:VCALENDAR", encoding="utf-8")

    result = runner.invoke(app, ["todo", "import-ics", "--input", str(ics_file), "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["payload"]["file"] == str(ics_file)


def test_export_ics_calls_client(monkeypatch, tmp_path):
    output_file = tmp_path / "todos.ics"

    def behavior(name, **kwargs):
        assert name == "export_ics"
        assert kwargs["output_path"] == str(output_file)
        return {"saved_to": str(output_file), "bytes": 12}, "req-export"

    monkeypatch.setattr("cli.commands.todo.create_todo_client", lambda: _StubTodoClient(behavior))

    result = runner.invoke(app, ["todo", "export-ics", "--output", str(output_file)])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["saved_to"] == str(output_file)


def test_journal_create_validates_payload_and_passes_json(monkeypatch, tmp_path):
    input_file = tmp_path / "journal.json"
    input_file.write_text(
        json.dumps(
            {
                "name": "Daily reflection",
                "user_notes": "Implemented journal CLI support.",
                "date": "2026-03-13T20:00:00+08:00",
            }
        ),
        encoding="utf-8",
    )

    def behavior(name, **kwargs):
        assert name == "create_journal"
        assert kwargs["payload"]["name"] == "Daily reflection"
        return {"id": 9, **kwargs["payload"]}, "req-journal-create"

    monkeypatch.setattr(
        "cli.commands.journal.create_journal_client", lambda: _StubJournalClient(behavior)
    )

    result = runner.invoke(app, ["journal", "create", "--input", str(input_file)])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["id"] == 9
    assert payload["meta"]["request_id"] == "req-journal-create"


def test_journal_generate_ai_dry_run_outputs_payload(tmp_path):
    input_file = tmp_path / "generate.json"
    input_file.write_text(
        json.dumps(
            {
                "title": "Daily reflection",
                "content_original": "Implemented journal CLI support.",
                "date": "2026-03-13T20:00:00+08:00",
            }
        ),
        encoding="utf-8",
    )

    result = runner.invoke(app, ["journal", "generate-ai", "--input", str(input_file), "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert payload["data"]["payload"]["title"] == "Daily reflection"


def test_activity_create_manual_calls_client(monkeypatch, tmp_path):
    input_file = tmp_path / "activity.json"
    input_file.write_text(json.dumps({"event_ids": [101, 102]}), encoding="utf-8")

    def behavior(name, **kwargs):
        assert name == "create_activity_manual"
        assert kwargs["payload"]["event_ids"] == [101, 102]
        return {"id": 12, "event_count": 2}, "req-activity-create"

    monkeypatch.setattr(
        "cli.commands.activity.create_activity_client",
        lambda: _StubActivityClient(behavior),
    )

    result = runner.invoke(app, ["activity", "create-manual", "--input", str(input_file)])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["id"] == 12
    assert payload["meta"]["request_id"] == "req-activity-create"


def test_event_list_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "list_events"
        assert kwargs["app_name"] == "Code"
        return {"events": [{"id": 5, "app_name": "Code"}], "total_count": 1}, "req-event-list"

    monkeypatch.setattr(
        "cli.commands.event.create_event_client", lambda: _StubEventClient(behavior)
    )

    result = runner.invoke(app, ["event", "list", "--app-name", "Code"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["total_count"] == 1
    assert payload["meta"]["request_id"] == "req-event-list"


def test_event_generate_summary_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "generate_event_summary"
        assert kwargs["event_id"] == 77
        return {"generated": True, "id": 77}, "req-event-summary"

    monkeypatch.setattr(
        "cli.commands.event.create_event_client", lambda: _StubEventClient(behavior)
    )

    result = runner.invoke(app, ["event", "generate-summary", "--id", "77"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["generated"] is True
    assert payload["meta"]["request_id"] == "req-event-summary"


def test_automation_create_calls_client(monkeypatch, tmp_path):
    input_file = tmp_path / "task.json"
    input_file.write_text(
        json.dumps(
            {
                "name": "Daily fetch",
                "enabled": True,
                "schedule": {"type": "interval", "interval_seconds": 3600},
                "action": {"type": "web_fetch", "payload": {"url": "https://example.com"}},
            }
        ),
        encoding="utf-8",
    )

    def behavior(name, **kwargs):
        assert name == "create_task"
        assert kwargs["payload"]["name"] == "Daily fetch"
        return {"id": 4, **kwargs["payload"]}, "req-automation-create"

    monkeypatch.setattr(
        "cli.commands.automation.create_automation_client",
        lambda: _StubAutomationClient(behavior),
    )

    result = runner.invoke(app, ["automation", "create", "--input", str(input_file)])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["id"] == 4
    assert payload["meta"]["request_id"] == "req-automation-create"


def test_automation_run_dry_run():
    result = runner.invoke(app, ["automation", "run", "--id", "9", "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert payload["data"]["payload"]["id"] == 9


def test_memory_search_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "search_memory"
        assert kwargs == {"keyword": "cli", "days": 14, "max_results": 5}
        return (
            {"keyword": "cli", "count": 1, "results": [{"date": "2026-03-13"}]},
            "req-memory-search",
        )

    monkeypatch.setattr(
        "cli.commands.memory.create_memory_client",
        lambda: _StubMemoryClient(behavior),
    )

    result = runner.invoke(
        app, ["memory", "search", "--keyword", "cli", "--days", "14", "--max-results", "5"]
    )

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["count"] == 1
    assert payload["meta"]["request_id"] == "req-memory-search"


def test_memory_profile_update_dry_run():
    result = runner.invoke(app, ["memory", "profile-update", "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True


def test_screenshot_download_calls_client(monkeypatch, tmp_path):
    output_file = tmp_path / "shot.png"

    def behavior(name, **kwargs):
        assert name == "download_screenshot_image"
        assert kwargs["screenshot_id"] == 42
        assert kwargs["output_path"] == str(output_file)
        return {"saved_to": str(output_file), "bytes": 256}, "req-screenshot-download"

    monkeypatch.setattr(
        "cli.commands.screenshot.create_screenshot_client",
        lambda: _StubScreenshotClient(behavior),
    )

    result = runner.invoke(
        app,
        ["screenshot", "download", "--id", "42", "--output", str(output_file)],
    )

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["saved_to"] == str(output_file)
    assert payload["meta"]["request_id"] == "req-screenshot-download"


def test_audio_recordings_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "get_recordings"
        assert kwargs["date"] == "2026-03-13"
        return {"recordings": [{"id": 1}]}, "req-audio-recordings"

    monkeypatch.setattr(
        "cli.commands.audio.create_audio_client", lambda: _StubAudioClient(behavior)
    )

    result = runner.invoke(app, ["audio", "recordings", "--date", "2026-03-13"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["recordings"][0]["id"] == 1
    assert payload["meta"]["request_id"] == "req-audio-recordings"


def test_audio_extract_dry_run():
    result = runner.invoke(app, ["audio", "extract", "--id", "12", "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert payload["data"]["payload"]["recording_id"] == 12


def test_scheduler_update_interval_calls_client(monkeypatch, tmp_path):
    input_file = tmp_path / "interval.json"
    input_file.write_text(json.dumps({"minutes": 30}), encoding="utf-8")

    def behavior(name, **kwargs):
        assert name == "update_job_interval"
        assert kwargs["job_id"] == "clean_data_job"
        assert kwargs["payload"] == {"minutes": 30}
        return {"success": True, "message": "updated"}, "req-scheduler-update"

    monkeypatch.setattr(
        "cli.commands.scheduler.create_scheduler_client",
        lambda: _StubSchedulerClient(behavior),
    )

    result = runner.invoke(
        app,
        [
            "scheduler",
            "update-interval",
            "--id",
            "clean_data_job",
            "--input",
            str(input_file),
        ],
    )

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["success"] is True
    assert payload["meta"]["request_id"] == "req-scheduler-update"


def test_scheduler_pause_all_dry_run():
    result = runner.invoke(app, ["scheduler", "pause-all", "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True


def test_logs_content_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "get_log_content"
        assert kwargs["file_path"] == "local-api/app.log"
        return {"file": "local-api/app.log", "content": "line1\nline2"}, "req-logs-content"

    monkeypatch.setattr("cli.commands.logs.create_logs_client", lambda: _StubLogsClient(behavior))

    result = runner.invoke(app, ["logs", "content", "--file", "local-api/app.log"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["file"] == "local-api/app.log"
    assert "line1" in payload["data"]["content"]


def test_system_statistics_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "get_statistics"
        return {"overview": {"events": 10}}, "req-system-stats"

    monkeypatch.setattr(
        "cli.commands.system.create_system_client",
        lambda: _StubSystemClient(behavior),
    )

    result = runner.invoke(app, ["system", "statistics"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["overview"]["events"] == 10
    assert payload["meta"]["request_id"] == "req-system-stats"


def test_system_cleanup_dry_run():
    result = runner.invoke(app, ["system", "cleanup", "--days", "14", "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert payload["data"]["payload"]["days"] == 14


def test_search_screenshots_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "search_screenshots"
        assert kwargs["payload"]["query"] == "meeting notes"
        assert kwargs["payload"]["limit"] == 5
        return [{"id": 1, "app_name": "Cursor"}], "req-search-screens"

    monkeypatch.setattr(
        "cli.commands.search.create_search_client",
        lambda: _StubSearchClient(behavior),
    )

    result = runner.invoke(
        app, ["search", "screenshots", "--query", "meeting notes", "--limit", "5"]
    )

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"][0]["id"] == 1
    assert payload["meta"]["request_id"] == "req-search-screens"


def test_search_events_accepts_input_file(monkeypatch, tmp_path):
    input_file = tmp_path / "search.json"
    input_file.write_text(
        json.dumps({"query": "retro", "app_name": "Notion", "limit": 3}),
        encoding="utf-8",
    )

    def behavior(name, **kwargs):
        assert name == "search_events"
        assert kwargs["payload"]["app_name"] == "Notion"
        return [{"id": 9, "app_name": "Notion"}], "req-search-events"

    monkeypatch.setattr(
        "cli.commands.search.create_search_client",
        lambda: _StubSearchClient(behavior),
    )

    result = runner.invoke(app, ["search", "events", "--input", str(input_file)])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"][0]["id"] == 9


def test_vector_semantic_search_calls_client(monkeypatch, tmp_path):
    input_file = tmp_path / "semantic.json"
    input_file.write_text(json.dumps({"query": "cli rollout", "top_k": 4}), encoding="utf-8")

    def behavior(name, **kwargs):
        assert name == "semantic_search"
        assert kwargs["payload"]["top_k"] == 4
        return [{"text": "result", "score": 0.9, "metadata": {}}], "req-vector-search"

    monkeypatch.setattr(
        "cli.commands.vector.create_vector_client",
        lambda: _StubVectorClient(behavior),
    )

    result = runner.invoke(app, ["vector", "semantic-search", "--input", str(input_file)])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"][0]["score"] == 0.9


def test_vector_sync_dry_run():
    result = runner.invoke(app, ["vector", "sync", "--limit", "50", "--force-reset", "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert payload["data"]["payload"]["limit"] == 50
    assert payload["data"]["payload"]["force_reset"] is True


def test_vector_stats_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "get_vector_stats"
        return {"enabled": True, "document_count": 25}, "req-vector-stats"

    monkeypatch.setattr(
        "cli.commands.vector.create_vector_client",
        lambda: _StubVectorClient(behavior),
    )

    result = runner.invoke(app, ["vector", "stats"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["document_count"] == 25
    assert payload["meta"]["request_id"] == "req-vector-stats"


def test_notification_list_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "list_notifications"
        return [{"id": "notif-1", "title": "Reminder"}], "req-notification-list"

    monkeypatch.setattr(
        "cli.commands.notification.create_notification_client",
        lambda: _StubNotificationClient(behavior),
    )

    result = runner.invoke(app, ["notification", "list"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"][0]["id"] == "notif-1"


def test_notification_delete_dry_run():
    result = runner.invoke(app, ["notification", "delete", "--id", "notif-2", "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert payload["data"]["payload"]["id"] == "notif-2"


def test_location_report_dry_run(tmp_path):
    input_file = tmp_path / "location.json"
    input_file.write_text(
        json.dumps({"latitude": 31.2304, "longitude": 121.4737, "accuracy": 15.0}),
        encoding="utf-8",
    )

    result = runner.invoke(app, ["location", "report", "--input", str(input_file), "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert payload["data"]["payload"]["latitude"] == 31.2304


def test_location_latest_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "get_latest_location"
        return {"ok": True, "location": {"id": 7}}, "req-location-latest"

    monkeypatch.setattr(
        "cli.commands.location.create_location_client",
        lambda: _StubLocationClient(behavior),
    )

    result = runner.invoke(app, ["location", "latest"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["location"]["id"] == 7


def test_location_history_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "get_location_history"
        assert kwargs["limit"] == 20
        return {"ok": True, "total": 1, "locations": [{"id": 1}]}, "req-location-history"

    monkeypatch.setattr(
        "cli.commands.location.create_location_client",
        lambda: _StubLocationClient(behavior),
    )

    result = runner.invoke(app, ["location", "history", "--limit", "20"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["total"] == 1


def test_time_allocation_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "get_time_allocation"
        assert kwargs["days"] == 7
        return {
            "total_time": 120,
            "daily_distribution": [],
            "app_details": [],
        }, "req-time-allocation"

    monkeypatch.setattr(
        "cli.commands.time_allocation.create_time_allocation_client",
        lambda: _StubTimeAllocationClient(behavior),
    )

    result = runner.invoke(app, ["time-allocation", "get", "--days", "7"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["total_time"] == 120


def test_preview_file_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "get_preview"
        assert kwargs["mode"] == "text"
        return {"content": "ok"}, "req-preview"

    monkeypatch.setattr(
        "cli.commands.preview.create_preview_client",
        lambda: _StubPreviewClient(behavior),
    )

    result = runner.invoke(
        app,
        ["preview", "file", "--path", "/tmp/demo.txt", "--mode", "text"],
    )

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["content"] == "ok"


def test_cost_tracking_stats_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "get_cost_stats"
        assert kwargs["days"] == 14
        return {"success": True, "data": {"total_cost": 1.2}}, "req-cost-stats"

    monkeypatch.setattr(
        "cli.commands.cost_tracking.create_cost_tracking_client",
        lambda: _StubCostTrackingClient(behavior),
    )

    result = runner.invoke(app, ["cost-tracking", "stats", "--days", "14"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["data"]["total_cost"] == 1.2


def test_cost_tracking_config_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "get_cost_config"
        return {"success": True, "data": {"model": "gpt-4o"}}, "req-cost-config"

    monkeypatch.setattr(
        "cli.commands.cost_tracking.create_cost_tracking_client",
        lambda: _StubCostTrackingClient(behavior),
    )

    result = runner.invoke(app, ["cost-tracking", "config"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["data"]["model"] == "gpt-4o"


def test_plugins_list_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "list_plugins"
        return {"success": True, "plugins": []}, "req-plugins-list"

    monkeypatch.setattr(
        "cli.commands.plugins.create_plugins_client",
        lambda: _StubPluginsClient(behavior),
    )

    result = runner.invoke(app, ["plugins", "list"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["success"] is True


def test_plugins_media_crawler_status_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "get_media_crawler_status"
        return {"success": True, "installed": False}, "req-plugin-status"

    monkeypatch.setattr(
        "cli.commands.plugins.create_plugins_client",
        lambda: _StubPluginsClient(behavior),
    )

    result = runner.invoke(app, ["plugins", "media-crawler", "status"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["installed"] is False


def test_plugins_media_crawler_install_dry_run():
    result = runner.invoke(
        app,
        ["plugins", "media-crawler", "install", "--version", "1.2.3", "--dry-run"],
    )

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert payload["data"]["payload"]["version"] == "1.2.3"


def test_plugins_media_crawler_uninstall_dry_run():
    result = runner.invoke(app, ["plugins", "media-crawler", "uninstall", "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True


def test_config_get_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "get_config"
        return {"success": True, "config": {"llmModel": "gpt-4o"}}, "req-config-get"

    monkeypatch.setattr(
        "cli.commands.config.create_config_client",
        lambda: _StubConfigClient(behavior),
    )

    result = runner.invoke(app, ["config", "get"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["config"]["llmModel"] == "gpt-4o"


def test_config_save_dry_run(tmp_path):
    input_file = tmp_path / "config.json"
    input_file.write_text(json.dumps({"llmModel": "gpt-4o"}), encoding="utf-8")

    result = runner.invoke(app, ["config", "save", "--input", str(input_file), "--dry-run"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["meta"]["dry_run"] is True
    assert payload["data"]["payload"]["llmModel"] == "gpt-4o"


def test_config_test_llm_calls_client(monkeypatch, tmp_path):
    input_file = tmp_path / "llm.json"
    input_file.write_text(
        json.dumps({"llmApiKey": "sk-test", "llmBaseUrl": "https://example.com"}),
        encoding="utf-8",
    )

    def behavior(name, **kwargs):
        assert name == "test_llm_config"
        assert "llmApiKey" in kwargs["payload"]
        return {"success": True}, "req-test-llm"

    monkeypatch.setattr(
        "cli.commands.config.create_config_client",
        lambda: _StubConfigClient(behavior),
    )

    result = runner.invoke(app, ["config", "test-llm", "--input", str(input_file)])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["success"] is True


def test_health_status_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "get_health"
        return {"status": "healthy"}, "req-health"

    monkeypatch.setattr(
        "cli.commands.health.create_health_client",
        lambda: _StubHealthClient(behavior),
    )

    result = runner.invoke(app, ["health", "status"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["status"] == "healthy"
