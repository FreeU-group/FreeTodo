from __future__ import annotations

# ruff: noqa: PLR2004
import json

from test_cli_support import CliError, _StubApiClient, _StubTodoClient, app, runner


def test_todo_list_outputs_json(monkeypatch):
    def behavior(name, **kwargs):
        assert name == "list_todos"
        assert kwargs == {"limit": 10, "offset": 5, "status": "active"}
        return {"total": 1, "todos": [{"id": 1, "name": "demo"}]}, "req-list"

    monkeypatch.setattr(
        "freetodo_cli.commands.todo.create_todo_client",
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
        "freetodo_cli.commands.todo.create_todo_client",
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
        "freetodo_cli.commands.todo.create_todo_client",
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

    monkeypatch.setattr("freetodo_cli.app.ApiClient", lambda _config: _StubApiClient(behavior))

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

    monkeypatch.setattr(
        "freetodo_cli.commands.todo_batch.create_todo_client", lambda: _StubTodoClient(behavior)
    )

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

    monkeypatch.setattr(
        "freetodo_cli.commands.todo_transfer.create_todo_client", lambda: _StubTodoClient(behavior)
    )

    result = runner.invoke(app, ["todo", "export-ics", "--output", str(output_file)])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["saved_to"] == str(output_file)
