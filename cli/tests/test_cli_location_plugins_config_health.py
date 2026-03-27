from __future__ import annotations

# ruff: noqa: PLR2004
import json

from test_cli_support import (
    _StubConfigClient,
    _StubCostTrackingClient,
    _StubHealthClient,
    _StubLocationClient,
    _StubPluginsClient,
    _StubPreviewClient,
    _StubTimeAllocationClient,
    app,
    runner,
)


def test_location_latest_calls_client(monkeypatch):
    def behavior(name, **_ignored):
        assert name == "get_latest_location"
        return {"ok": True, "location": {"id": 7}}, "req-location-latest"

    monkeypatch.setattr(
        "freetodo_cli.commands.location.create_location_client",
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
        "freetodo_cli.commands.location.create_location_client",
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
        "freetodo_cli.commands.time_allocation.create_time_allocation_client",
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
        "freetodo_cli.commands.preview.create_preview_client",
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
        "freetodo_cli.commands.cost_tracking.create_cost_tracking_client",
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
        "freetodo_cli.commands.cost_tracking.create_cost_tracking_client",
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
        "freetodo_cli.commands.plugins.create_plugins_client",
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
        "freetodo_cli.commands.plugins.create_plugins_client",
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
        "freetodo_cli.commands.config.create_config_client",
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
        "freetodo_cli.commands.config.create_config_client",
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
        "freetodo_cli.commands.health.create_health_client",
        lambda: _StubHealthClient(behavior),
    )

    result = runner.invoke(app, ["health", "status"])

    assert result.exit_code == 0
    payload = json.loads(result.stdout)
    assert payload["data"]["status"] == "healthy"
