from __future__ import annotations

import json

from typer.testing import CliRunner

from cli.app import app
from cli.errors import CliError

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
