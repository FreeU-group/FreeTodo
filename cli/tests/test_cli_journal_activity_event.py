from __future__ import annotations

# ruff: noqa: PLR2004
import json

from test_cli_support import (
    _StubActivityClient,
    _StubAutomationClient,
    _StubEventClient,
    _StubJournalClient,
    _StubMemoryClient,
    _StubScreenshotClient,
    app,
    runner,
)


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
        "freetodo_cli.commands.journal.create_journal_client", lambda: _StubJournalClient(behavior)
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
        "freetodo_cli.commands.activity.create_activity_client",
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
        "freetodo_cli.commands.event.create_event_client", lambda: _StubEventClient(behavior)
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
        "freetodo_cli.commands.event.create_event_client", lambda: _StubEventClient(behavior)
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
        "freetodo_cli.commands.automation.create_automation_client",
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
        "freetodo_cli.commands.memory.create_memory_client",
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
        "freetodo_cli.commands.screenshot.create_screenshot_client",
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
