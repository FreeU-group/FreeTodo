"""Integration test for the rewritten execution engine.

Uses in-process imports to test:
1. pending_actions: new fields (streaming_output, activity_id)
2. intent_actions API: progress endpoint returns streaming_output (via TestClient)
3. execution_engine: helper functions, activity tracker integration
4. agent_activity_tracker: executor type activities
5. notification-facing API format compatibility
"""

import sys

sys.path.insert(0, "D:\\tyb_file\\tyb_tasks\\startup\\FreeTodo\\server")

PASS = 0
FAIL = 0


def check(name: str, condition: bool, detail: str = ""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"  [PASS] {name}")
    else:
        FAIL += 1
        print(f"  [FAIL] {name} -- {detail}")


# ---------------------------------------------------------------------------
# Test 1: PendingAction data model
# ---------------------------------------------------------------------------
def test_pending_actions_fields():
    print("\n== Test 1: PendingAction new fields ==")
    from services.perception_todo_intent.pending_actions import (
        ActionType,
        append_streaming_output,
        create_pending_action,
        get_action,
        set_activity_id,
    )

    action = create_pending_action(
        action_type=ActionType.EXECUTABLE,
        title="Test Task",
        description="Testing new fields",
        execution_plan=["Step 1", "Step 2"],
    )
    aid = action.action_id

    check("action created", aid.startswith("pa_"))
    check("streaming_output init empty", action.streaming_output == "")
    check("activity_id init empty", action.activity_id == "")

    append_streaming_output(aid, "Hello ")
    append_streaming_output(aid, "World")
    a = get_action(aid)
    check(
        "streaming_output accumulated",
        a.streaming_output == "Hello World",
        f"got: {a.streaming_output!r}",
    )

    set_activity_id(aid, "test_act_123")
    a = get_action(aid)
    check("activity_id set", a.activity_id == "test_act_123", f"got: {a.activity_id!r}")

    d = a.to_dict()
    check("to_dict has streaming_output", "streaming_output" in d)
    check("to_dict has activity_id", "activity_id" in d)
    check("to_dict streaming_output value", d["streaming_output"] == "Hello World")
    check("to_dict activity_id value", d["activity_id"] == "test_act_123")

    # Verify backward compat: execution_steps still in to_dict (empty list)
    check("to_dict has execution_steps (compat)", "execution_steps" in d)
    check("execution_steps is empty list", d["execution_steps"] == [])

    return aid


# ---------------------------------------------------------------------------
# Test 2: Progress API via FastAPI TestClient (in-process)
# ---------------------------------------------------------------------------
def test_progress_api_via_testclient(action_id: str):
    print("\n== Test 2: Progress API via TestClient ==")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from routers.intent_actions import router

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    r = client.get(f"/api/intent-actions/{action_id}/progress")
    check("progress returns 200", r.status_code == 200, f"got {r.status_code}")

    data = r.json()
    check("has streaming_output", "streaming_output" in data, f"keys: {list(data.keys())}")
    check("has activity_id", "activity_id" in data, f"keys: {list(data.keys())}")
    check("has result", "result" in data)
    check("has status", "status" in data)
    check("no steps field", "steps" not in data, f"keys: {list(data.keys())}")
    check(
        "streaming_output value",
        data.get("streaming_output") == "Hello World",
        f"got: {data.get('streaming_output')!r}",
    )
    check(
        "activity_id value",
        data.get("activity_id") == "test_act_123",
        f"got: {data.get('activity_id')!r}",
    )


# ---------------------------------------------------------------------------
# Test 3: Action detail API via TestClient
# ---------------------------------------------------------------------------
def test_detail_api_via_testclient(action_id: str):
    print("\n== Test 3: Action detail API via TestClient ==")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from routers.intent_actions import router

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    r = client.get(f"/api/intent-actions/{action_id}")
    check("detail returns 200", r.status_code == 200, f"got {r.status_code}")

    data = r.json()
    check("detail has streaming_output", "streaming_output" in data, f"keys: {list(data.keys())}")
    check("detail has activity_id", "activity_id" in data, f"keys: {list(data.keys())}")
    check("detail streaming_output value", data["streaming_output"] == "Hello World")
    check("detail activity_id value", data["activity_id"] == "test_act_123")


# ---------------------------------------------------------------------------
# Test 4: List API via TestClient
# ---------------------------------------------------------------------------
def test_list_api_via_testclient():
    print("\n== Test 4: List API via TestClient ==")
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from routers.intent_actions import router

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    r = client.get("/api/intent-actions")
    check("list returns 200", r.status_code == 200, f"got {r.status_code}")

    data = r.json()
    check("list returns array", isinstance(data, list), f"type: {type(data)}")

    if isinstance(data, list) and len(data) > 0:
        first = data[0]
        check("list item has streaming_output", "streaming_output" in first)
        check("list item has activity_id", "activity_id" in first)
    else:
        check("list has items", False, "empty list")


# ---------------------------------------------------------------------------
# Test 5: Activity tracker with executor type
# ---------------------------------------------------------------------------
def test_activity_tracker():
    print("\n== Test 5: Activity tracker executor type ==")
    from services.agent_activity_tracker import (
        get_all_activities,
        is_cancelled,
        request_cancel,
        start_activity,
        stop_activity,
    )

    aid = start_activity(agent_type="executor", task="Test executor task", model="agno")
    check("activity started", aid is not None and len(aid) > 0)

    activities = get_all_activities()
    executor_acts = [a for a in activities if a.get("agent_type") == "executor" and a["id"] == aid]
    check("executor activity in list", len(executor_acts) == 1, f"found: {len(executor_acts)}")

    if executor_acts:
        check("status is running", executor_acts[0]["status"] == "running")
        check("agent_type is executor", executor_acts[0]["agent_type"] == "executor")
        check("task correct", executor_acts[0]["task"] == "Test executor task")
        check("model correct", executor_acts[0]["model"] == "agno")

    # Test cancel flow
    result = request_cancel(aid)
    check("cancel accepted", result is True)
    check("is_cancelled True", is_cancelled(aid) is True)

    stop_activity(aid, status="cancelled")
    remaining = [a for a in get_all_activities() if a["id"] == aid]
    check("activity removed after stop", len(remaining) == 0)


# ---------------------------------------------------------------------------
# Test 6: execution_engine helper functions
# ---------------------------------------------------------------------------
def test_execution_engine_helpers():
    print("\n== Test 6: execution_engine helpers ==")
    try:
        from services.perception_todo_intent.execution_engine import (
            _create_executor_agent,
            _parse_tool_event_json,
            _strip_tool_events,
            execute_action,
            is_running,
        )

        check("all imports resolve", True)
    except ImportError as e:
        check("all imports resolve", False, str(e))
        return

    from llm.agno_agent_io import TOOL_EVENT_PREFIX, TOOL_EVENT_SUFFIX

    # _strip_tool_events
    text1 = f'Hello{TOOL_EVENT_PREFIX}{{"type":"tool_call"}}{TOOL_EVENT_SUFFIX}World'
    check(
        "strip: normal case",
        _strip_tool_events(text1) == "HelloWorld",
        f"got: {_strip_tool_events(text1)!r}",
    )

    text2 = "No events here"
    check("strip: no events", _strip_tool_events(text2) == "No events here")

    text3 = f'{TOOL_EVENT_PREFIX}{{"a":1}}{TOOL_EVENT_SUFFIX}'
    check("strip: only event", _strip_tool_events(text3) == "")

    text4 = f'A{TOOL_EVENT_PREFIX}{{"x":1}}{TOOL_EVENT_SUFFIX}B{TOOL_EVENT_PREFIX}{{"y":2}}{TOOL_EVENT_SUFFIX}C'
    check(
        "strip: multiple events",
        _strip_tool_events(text4) == "ABC",
        f"got: {_strip_tool_events(text4)!r}",
    )

    # _parse_tool_event_json
    ev1 = _parse_tool_event_json(text1)
    check(
        "parse: extracts event", ev1 is not None and ev1.get("type") == "tool_call", f"got: {ev1!r}"
    )

    check("parse: no event returns None", _parse_tool_event_json("plain text") is None)

    bad_json = f"X{TOOL_EVENT_PREFIX}not-json{TOOL_EVENT_SUFFIX}Y"
    check("parse: bad JSON returns None", _parse_tool_event_json(bad_json) is None)

    # _strip_tool_events edge case: unclosed marker
    unclosed = f"Prefix{TOOL_EVENT_PREFIX}data without suffix"
    result = _strip_tool_events(unclosed)
    check("strip: unclosed marker handled", "Prefix" in result, f"got: {result!r}")


# ---------------------------------------------------------------------------
# Test 7: Execute + progress end-to-end flow (mock)
# ---------------------------------------------------------------------------
def test_execute_and_progress_flow():
    """Test that execute endpoint creates activity and progress shows streaming_output."""
    print("\n== Test 7: Execute + progress flow ==")
    from services.perception_todo_intent.pending_actions import (
        ActionStatus,
        ActionType,
        append_streaming_output,
        create_pending_action,
        get_action,
        set_activity_id,
        update_action_status,
    )

    action = create_pending_action(
        action_type=ActionType.EXECUTABLE,
        title="Flow Test Task",
        description="Testing end-to-end flow",
        execution_plan=["Do A", "Do B"],
    )
    aid = action.action_id

    # Simulate what execute_action does (without actually running the agent)
    update_action_status(aid, ActionStatus.EXECUTING)
    a = get_action(aid)
    check("status set to EXECUTING", a.status == ActionStatus.EXECUTING)

    from services.agent_activity_tracker import start_activity, stop_activity

    activity_id = start_activity(
        agent_type="executor", task=f"执行任务: {action.title}", model="agno"
    )
    set_activity_id(aid, activity_id)

    a = get_action(aid)
    check("activity_id linked", a.activity_id == activity_id)

    # Simulate streaming output
    append_streaming_output(aid, "正在执行第一步...\n")
    append_streaming_output(aid, "第一步完成。\n正在执行第二步...\n")

    # Check progress via TestClient
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from routers.intent_actions import router

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    r = client.get(f"/api/intent-actions/{aid}/progress")
    data = r.json()
    check("progress status is executing", data["status"] == "executing")
    check(
        "progress has streaming text",
        "正在执行第一步" in data["streaming_output"],
        f"got: {data['streaming_output'][:50]!r}",
    )
    check("progress activity_id present", data["activity_id"] == activity_id)

    # Simulate completion
    from services.perception_todo_intent.pending_actions import set_execution_result

    set_execution_result(aid, "任务全部完成！")
    stop_activity(activity_id, status="completed")

    r2 = client.get(f"/api/intent-actions/{aid}/progress")
    data2 = r2.json()
    check("final status is completed", data2["status"] == "completed")
    check("final result present", data2["result"] == "任务全部完成！")

    # Verify the popup polling would see correct data
    check("popup: streaming_output available", len(data2["streaming_output"]) > 0)
    check("popup: status triggers poll stop", data2["status"] in ("completed", "failed"))


# ---------------------------------------------------------------------------
# Test 8: Cancel flow simulation
# ---------------------------------------------------------------------------
def test_cancel_flow():
    print("\n== Test 8: Cancel flow ==")
    from services.agent_activity_tracker import (
        is_cancelled,
        request_cancel,
        start_activity,
        stop_activity,
    )
    from services.perception_todo_intent.pending_actions import (
        ActionStatus,
        ActionType,
        append_streaming_output,
        create_pending_action,
        get_action,
        set_activity_id,
        update_action_status,
    )

    action = create_pending_action(
        action_type=ActionType.EXECUTABLE,
        title="Cancel Test",
        description="Will be cancelled",
    )
    aid = action.action_id

    update_action_status(aid, ActionStatus.EXECUTING)
    activity_id = start_activity(agent_type="executor", task="Cancel test", model="agno")
    set_activity_id(aid, activity_id)

    # Simulate some streaming output
    append_streaming_output(aid, "开始执行...\n")

    # Cancel via activity tracker
    request_cancel(activity_id)
    check("cancel flag set", is_cancelled(activity_id) is True)

    # Simulate what execution_engine does on cancel
    append_streaming_output(aid, "\n\n[已中断]")
    update_action_status(aid, ActionStatus.FAILED)
    stop_activity(activity_id, status="cancelled")

    a = get_action(aid)
    check("action status FAILED after cancel", a.status == ActionStatus.FAILED)
    check("streaming shows interrupted", "[已中断]" in a.streaming_output)

    # Verify via API
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from routers.intent_actions import router

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)

    r = client.get(f"/api/intent-actions/{aid}/progress")
    data = r.json()
    check("API status is failed", data["status"] == "failed")
    check("API streaming shows interrupted", "[已中断]" in data["streaming_output"])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    print("=" * 60)
    print("Execution Engine Integration Tests")
    print("=" * 60)

    action_id = test_pending_actions_fields()
    test_progress_api_via_testclient(action_id)
    test_detail_api_via_testclient(action_id)
    test_list_api_via_testclient()
    test_activity_tracker()
    test_execution_engine_helpers()
    test_execute_and_progress_flow()
    test_cancel_flow()

    print("\n" + "=" * 60)
    print(f"Results: {PASS} passed, {FAIL} failed")
    print("=" * 60)
    sys.exit(1 if FAIL > 0 else 0)
