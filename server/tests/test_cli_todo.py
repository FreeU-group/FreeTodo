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
