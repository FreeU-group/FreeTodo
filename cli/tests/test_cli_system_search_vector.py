from __future__ import annotations

# ruff: noqa: PLR2004
import json

from test_cli_support import (
    _StubAudioClient,
    _StubLogsClient,
    _StubNotificationClient,
    _StubSchedulerClient,
    _StubSearchClient,
    _StubSystemClient,
    _StubVectorClient,
    app,
    runner,
)


def test_audio_recordings_calls_client(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "get_recordings"
        assert kwargs["date"] == "2026-03-13"
        return {"recordings": [{"id": 1}]}, "req-audio-recordings"

    monkeypatch.setattr(
        "freetodo_cli.commands.audio.create_audio_client", lambda: _StubAudioClient(behavior)
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
        "freetodo_cli.commands.scheduler.create_scheduler_client",
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
        assert kwargs["file_path"] == "server/app.log"
        return {"file": "server/app.log", "content": "line1\nline2"}, "req-logs-content"

    monkeypatch.setattr(
        "freetodo_cli.commands.logs.create_logs_client", lambda: _StubLogsClient(behavior)
    )

    result = runner.invoke(app, ["logs", "content", "--file", "server/app.log"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["file"] == "server/app.log"
    assert "line1" in payload["data"]["content"]


def test_system_statistics_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "get_statistics"
        return {"overview": {"events": 10}}, "req-system-stats"

    monkeypatch.setattr(
        "freetodo_cli.commands.system.create_system_client",
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
        "freetodo_cli.commands.search.create_search_client",
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
        "freetodo_cli.commands.search.create_search_client",
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
        "freetodo_cli.commands.vector.create_vector_client",
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
        "freetodo_cli.commands.vector.create_vector_client",
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
        "freetodo_cli.commands.notification.create_notification_client",
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
