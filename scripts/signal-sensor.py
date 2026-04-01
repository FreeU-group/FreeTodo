"""
Signal Sensor — 统一通知守护进程（Center 轮询 + 交互式弹窗）

三种通知源：
  1. Center 推送通知：GET /api/sensor/notifications?node_id=xxx（主动服务 / 远程推送）
  2. 通用通知（邀约等）：GET /api/notifications（重要通知筛选）
  3. 待办草稿检测：GET /api/todos?status=draft&limit=1（新待办弹窗提醒）

弹窗：统一使用交互式 Electron signal-popup.js（支持标题、副标题、链接、确认按钮）

可选本地 HTTP API（需 fastapi/uvicorn）：POST /trigger 直接触发弹窗（本地调试）

启动:
  uv run --directory client python ../scripts/signal-sensor.py --center-url https://xxx.cpolar.cn
  uv run --directory client python ../scripts/signal-sensor.py --center-url https://xxx.cpolar.cn --node-id MY-PC
"""

from __future__ import annotations

import argparse
import contextlib
import json
import logging
import os
import platform
import subprocess  # nosec B404
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx

try:
    import pystray
    from PIL import Image

    _HAS_TRAY = True
except ImportError:
    _HAS_TRAY = False

sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
POPUP_SCRIPT = FRONTEND_DIR / "scripts" / "signal-popup.js"
LOG_DIR = REPO_ROOT / "logs"
LOG_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# Logging setup: console + file with timestamps and levels
# ---------------------------------------------------------------------------

_log_formatter = logging.Formatter(
    fmt="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

_console_handler = logging.StreamHandler(sys.stdout)
_console_handler.setFormatter(_log_formatter)

_file_handler = logging.FileHandler(
    LOG_DIR / "signal-sensor.log",
    encoding="utf-8",
)
_file_handler.setFormatter(_log_formatter)

log = logging.getLogger("signal-sensor")
log.setLevel(logging.DEBUG)
log.addHandler(_console_handler)
log.addHandler(_file_handler)

SENSOR_NOTIFY_POLL_INTERVAL = 1.0
GENERAL_NOTIFY_POLL_INTERVAL = 1.0
DRAFT_TODO_POLL_INTERVAL = 1.0
LOCAL_FILE_POLL_INTERVAL = 2.0
APP_SWITCH_POLL_INTERVAL = 1.0


# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------


class _State:
    popup_lock = threading.Lock()
    popup_proc: subprocess.Popen | None = None  # type: ignore[type-arg]
    electron_bin: str | None = None
    center_url: str = ""
    node_id: str = platform.node()
    seen_notification_ids: set[str] = set()
    last_draft_todo_id: int | None = None
    last_fg_app: str | None = None
    last_fg_title: str | None = None


_state = _State()


# ---------------------------------------------------------------------------
# Electron helpers
# ---------------------------------------------------------------------------


def _find_electron() -> str | None:
    if sys.platform == "win32":
        candidate = FRONTEND_DIR / "node_modules" / "electron" / "dist" / "electron.exe"
    elif sys.platform == "darwin":
        candidate = (
            FRONTEND_DIR
            / "node_modules"
            / "electron"
            / "dist"
            / "Electron.app"
            / "Contents"
            / "MacOS"
            / "Electron"
        )
    else:
        candidate = FRONTEND_DIR / "node_modules" / "electron" / "dist" / "electron"

    if candidate.exists():
        return str(candidate)
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    return npx


def _launch_popup(data: dict, on_confirm=None, on_dismiss=None) -> bool:
    """在后台线程中启动 Electron 交互式弹窗，同一时间只允许一个。

    Args:
        data: popup JSON data
        on_confirm: callback when user clicks confirm (exit code 0)
        on_dismiss: callback when user clicks dismiss (exit code 2)
    """
    with _state.popup_lock:
        if _state.popup_proc and _state.popup_proc.poll() is None:
            return False

    tmp_path = ""
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".json",
        prefix="signal_popup_",
        dir=str(REPO_ROOT),
        delete=False,
        encoding="utf-8",
    ) as tmp:
        json.dump(data, tmp, ensure_ascii=False)
        tmp_path = tmp.name

    def _run() -> None:
        try:
            if _state.electron_bin and _state.electron_bin.endswith(("npx", "npx.cmd")):
                cmd = [_state.electron_bin, "electron", str(POPUP_SCRIPT), tmp_path]
            else:
                cmd = [_state.electron_bin or "", str(POPUP_SCRIPT), tmp_path]

            log.info(
                "弹窗启动: %s (on_confirm=%s, on_dismiss=%s)",
                data.get("title", ""),
                on_confirm is not None,
                on_dismiss is not None,
            )
            with _state.popup_lock:
                _state.popup_proc = subprocess.Popen(  # nosec B603
                    cmd,
                    cwd=str(FRONTEND_DIR),
                    env={
                        **os.environ,
                        "ELECTRON_DISABLE_SECURITY_WARNINGS": "true",
                    },
                )
            _state.popup_proc.wait()
            exit_code = _state.popup_proc.returncode
            log.info(
                "弹窗已关闭 (exit=%d, on_confirm=%s, on_dismiss=%s)",
                exit_code,
                on_confirm is not None,
                on_dismiss is not None,
            )

            if exit_code == 2 and on_dismiss:
                log.info("触发 on_dismiss 回调")
                on_dismiss()
            elif exit_code == 0 and on_confirm:
                log.info("触发 on_confirm 回调")
                on_confirm()
            elif exit_code == 0 and on_confirm is None:
                log.warning("用户点击了确认，但 on_confirm 回调为空，操作被忽略!")
            elif exit_code == 2 and on_dismiss is None:
                log.warning("用户点击了忽略，但 on_dismiss 回调为空，操作被忽略!")
        except Exception as exc:
            log.error("弹窗启动失败: %s", exc, exc_info=True)
        finally:
            with contextlib.suppress(OSError):
                os.unlink(tmp_path)

    threading.Thread(target=_run, daemon=True).start()
    return True


# ---------------------------------------------------------------------------
# 通知源 1：Center 推送通知（/api/sensor/notifications）
# ---------------------------------------------------------------------------


def _poll_sensor_notifications(client: httpx.Client) -> None:
    """后台线程：定时轮询 Center 拉取针对本节点的推送通知。"""
    url = f"{_state.center_url}/api/sensor/notifications"
    log.info(
        "推送通知轮询已启动 (endpoint=%s, node_id=%s, interval=%ss)",
        url,
        _state.node_id,
        SENSOR_NOTIFY_POLL_INTERVAL,
    )

    while True:
        try:
            resp = client.get(url, params={"node_id": _state.node_id})
            resp.raise_for_status()
            items = resp.json().get("notifications", [])
            for item in items:
                log.info(
                    "收到推送通知: %s (id=%s)",
                    item.get("title", ""),
                    item.get("id", "?"),
                )
                _launch_popup(item)
                time.sleep(1)
        except Exception as exc:
            log.error("推送通知轮询失败: %s", exc)
        time.sleep(SENSOR_NOTIFY_POLL_INTERVAL)


# ---------------------------------------------------------------------------
# 通知源 2：通用通知（/api/notifications）— 筛选邀约等重要通知
# ---------------------------------------------------------------------------


def _poll_general_notifications(client: httpx.Client) -> None:
    """后台线程：轮询通用通知接口，筛选邀约等重要通知弹窗。"""
    url = f"{_state.center_url}/api/notifications"
    log.info(
        "通用通知轮询已启动 (endpoint=%s, interval=%ss)",
        url,
        GENERAL_NOTIFY_POLL_INTERVAL,
    )

    while True:
        try:
            resp = client.get(url)
            resp.raise_for_status()
            items = resp.json()
            if not isinstance(items, list):
                time.sleep(GENERAL_NOTIFY_POLL_INTERVAL)
                continue

            for item in items:
                nid = str(item.get("id", ""))
                if not nid or nid in _state.seen_notification_ids:
                    continue
                _state.seen_notification_ids.add(nid)

                title = item.get("title", "")
                ntype = item.get("type", "")
                title_lower = title.lower()
                is_important = ntype in (
                    "auto_todo",
                    "invitation",
                    "pending_todo",
                    "pending_execute",
                    "conflict",
                    "reminder",
                ) or any(
                    kw in title_lower
                    for kw in (
                        "邀约",
                        "invitation",
                        "自动待办",
                        "待办",
                        "intent_",
                        "📨",
                        "✅",
                    )
                )
                if not is_important:
                    continue

                content = item.get("content", "")
                todo_id = item.get("todo_id")
                log.info(
                    "收到重要通知: %s (id=%s, type=%s, todo_id=%s)",
                    title,
                    nid,
                    ntype,
                    todo_id,
                )

                if ntype == "pending_todo":
                    action_id = nid[3:] if nid.startswith("pa_") else nid
                    log.info(
                        "处理 pending_todo 通知, nid=%s -> action_id=%s", nid, action_id
                    )

                    def _on_confirm_pending(aid=action_id):
                        log.info(
                            "用户确认 pending_todo, 调用 POST /api/intent-actions/%s/confirm",
                            aid,
                        )
                        try:
                            r = httpx.post(
                                f"{_state.center_url}/api/intent-actions/{aid}/confirm",
                                timeout=30,
                            )
                            log.info(
                                "confirm 响应: status=%d, body=%s",
                                r.status_code,
                                r.text[:200],
                            )
                        except Exception as e:
                            log.error("确认 pending_todo 失败: %s", e, exc_info=True)

                    def _on_dismiss_pending(aid=action_id):
                        log.info(
                            "用户忽略 pending_todo, 调用 POST /api/intent-actions/%s/reject",
                            aid,
                        )
                        try:
                            r = httpx.post(
                                f"{_state.center_url}/api/intent-actions/{aid}/reject",
                                timeout=10,
                            )
                            log.info("reject 响应: status=%d", r.status_code)
                        except Exception as e:
                            log.error("忽略 pending_todo 失败: %s", e, exc_info=True)

                    subtitle = content
                    try:
                        pa_data = json.loads(content)
                        subtitle = pa_data.get("description", "") or pa_data.get(
                            "title", content
                        )
                    except (json.JSONDecodeError, TypeError):
                        pass

                    _launch_popup(
                        {"title": title, "subtitle": subtitle},
                        on_confirm=_on_confirm_pending,
                        on_dismiss=_on_dismiss_pending,
                    )
                elif ntype == "pending_execute":
                    action_id = nid[3:] if nid.startswith("pa_") else nid
                    log.info(
                        "处理 pending_execute 通知, nid=%s -> action_id=%s",
                        nid,
                        action_id,
                    )

                    subtitle = content
                    try:
                        pa_data = json.loads(content)
                        desc = pa_data.get("description", "")
                        plan = pa_data.get("execution_plan", [])
                        plan_text = (
                            "\n".join(f"  {i + 1}. {s}" for i, s in enumerate(plan))
                            if plan
                            else ""
                        )
                        subtitle = desc + (
                            "\n\n执行计划：\n" + plan_text if plan_text else ""
                        )
                        log.debug(
                            "pending_execute 解析: desc=%s, plan_steps=%d",
                            desc[:80],
                            len(plan),
                        )
                    except (json.JSONDecodeError, TypeError):
                        log.warning(
                            "pending_execute content 不是有效 JSON: %s", content[:100]
                        )

                    def _on_confirm_execute(aid=action_id):
                        log.info(
                            "用户确认执行, 调用 POST /api/intent-actions/%s/execute",
                            aid,
                        )
                        try:
                            r = httpx.post(
                                f"{_state.center_url}/api/intent-actions/{aid}/execute",
                                timeout=30,
                            )
                            if r.status_code == 200:
                                log.info("执行已启动: %s, 响应=%s", aid, r.text[:200])
                            else:
                                log.error(
                                    "执行启动失败: status=%d, body=%s",
                                    r.status_code,
                                    r.text[:200],
                                )
                        except Exception as e:
                            log.error("确认执行失败: %s", e, exc_info=True)

                    def _on_dismiss_execute(aid=action_id):
                        log.info(
                            "用户忽略执行, 调用 POST /api/intent-actions/%s/reject", aid
                        )
                        try:
                            r = httpx.post(
                                f"{_state.center_url}/api/intent-actions/{aid}/reject",
                                timeout=10,
                            )
                            log.info("reject 响应: status=%d", r.status_code)
                        except Exception as e:
                            log.error("忽略执行失败: %s", e, exc_info=True)

                    _launch_popup(
                        {"title": title, "subtitle": subtitle},
                        on_confirm=_on_confirm_execute,
                        on_dismiss=_on_dismiss_execute,
                    )
                elif ntype in ("auto_todo", "invitation") and todo_id:
                    _tid = todo_id
                    log.info("处理 %s 通知, todo_id=%s", ntype, _tid)

                    def _on_confirm(tid=_tid):
                        log.info(
                            "用户确认待办 %s，调用 POST /api/notifications/confirm-todo",
                            tid,
                        )
                        try:
                            r = httpx.post(
                                f"{_state.center_url}/api/notifications/confirm-todo",
                                json={"todo_id": tid},
                                timeout=15,
                            )
                            log.info(
                                "confirm-todo 响应: status=%d, body=%s",
                                r.status_code,
                                r.text[:200],
                            )
                        except Exception as e:
                            log.error("确认待办失败: %s", e, exc_info=True)

                    def _on_dismiss(tid=_tid):
                        log.info(
                            "用户忽略待办 %s，调用 POST /api/notifications/dismiss-todo",
                            tid,
                        )
                        try:
                            r = httpx.post(
                                f"{_state.center_url}/api/notifications/dismiss-todo",
                                json={"todo_id": tid},
                                timeout=10,
                            )
                            log.info("dismiss-todo 响应: status=%d", r.status_code)
                        except Exception as e:
                            log.error("忽略待办失败: %s", e, exc_info=True)

                    _launch_popup(
                        {"title": title, "subtitle": content},
                        on_confirm=_on_confirm,
                        on_dismiss=_on_dismiss,
                    )
                else:
                    log.info("通知类型 %s 无专用回调，仅展示弹窗", ntype)
                    _launch_popup({"title": title, "subtitle": content})
                time.sleep(1)
        except Exception as exc:
            log.error("通用通知轮询失败: %s", exc, exc_info=True)
        time.sleep(GENERAL_NOTIFY_POLL_INTERVAL)


# ---------------------------------------------------------------------------
# 通知源 3：待办草稿检测（/api/todos?status=draft）
# ---------------------------------------------------------------------------


def _poll_draft_todos(client: httpx.Client) -> None:
    """后台线程：轮询待办草稿接口，发现新草稿时弹窗提醒。"""
    url = f"{_state.center_url}/api/todos"
    log.info(
        "待办草稿轮询已启动 (endpoint=%s, interval=%ss)", url, DRAFT_TODO_POLL_INTERVAL
    )

    while True:
        try:
            resp = client.get(url, params={"status": "draft", "limit": 1})
            resp.raise_for_status()
            data = resp.json()
            todos = data.get("todos", [])

            if todos:
                latest = todos[0]
                todo_id = latest.get("id")
                todo_name = latest.get("name", "新的待办事项")

                if todo_id is not None and todo_id != _state.last_draft_todo_id:
                    _state.last_draft_todo_id = todo_id
                    log.info("检测到新草稿待办: %s (id=%s)", todo_name, todo_id)

                    def _on_confirm_draft(tid=todo_id, name=todo_name):
                        log.info(
                            "用户确认草稿待办 %s, 调用 PUT /api/todos/%s {status: active}",
                            name,
                            tid,
                        )
                        try:
                            r = httpx.put(
                                f"{_state.center_url}/api/todos/{tid}",
                                json={"status": "active"},
                                timeout=15,
                            )
                            log.info(
                                "草稿激活响应: status=%d, body=%s",
                                r.status_code,
                                r.text[:200],
                            )
                        except Exception as e:
                            log.error("激活草稿待办失败: %s", e, exc_info=True)

                    def _on_dismiss_draft(tid=todo_id, name=todo_name):
                        log.info(
                            "用户忽略草稿待办 %s, 调用 DELETE /api/todos/%s", name, tid
                        )
                        try:
                            r = httpx.delete(
                                f"{_state.center_url}/api/todos/{tid}",
                                timeout=10,
                            )
                            log.info("草稿删除响应: status=%d", r.status_code)
                        except Exception as e:
                            log.error("删除草稿待办失败: %s", e, exc_info=True)

                    _launch_popup(
                        {
                            "title": "待办提醒",
                            "subtitle": f"检测到：{todo_name}",
                        },
                        on_confirm=_on_confirm_draft,
                        on_dismiss=_on_dismiss_draft,
                    )
        except Exception as exc:
            log.error("待办草稿轮询失败: %s", exc, exc_info=True)
        time.sleep(DRAFT_TODO_POLL_INTERVAL)


# ---------------------------------------------------------------------------
# 通知源 4：待办即将到期提醒（每 60 秒扫描一次）
# ---------------------------------------------------------------------------

TODO_REMINDER_POLL_INTERVAL = 60.0
TODO_REMINDER_AHEAD_MINUTES = 10
_reminded_todo_ids: set[int] = set()


def _poll_upcoming_todos(client: httpx.Client) -> None:
    """后台线程：定期扫描即将到期的待办，弹窗提醒。"""
    url = f"{_state.center_url}/api/todos"
    log.info(
        "待办提醒轮询已启动 (endpoint=%s, ahead=%dmin, interval=%ss)",
        url,
        TODO_REMINDER_AHEAD_MINUTES,
        TODO_REMINDER_POLL_INTERVAL,
    )

    while True:
        try:
            resp = client.get(url, params={"status": "active", "limit": 100})
            resp.raise_for_status()
            todos = resp.json().get("todos", [])

            from datetime import datetime, timedelta, timezone

            now = datetime.now(timezone.utc)
            window_start = now
            window_end = now + timedelta(minutes=TODO_REMINDER_AHEAD_MINUTES)

            for todo in todos:
                todo_id = todo.get("id")
                if todo_id in _reminded_todo_ids:
                    continue

                due_str = (
                    todo.get("due")
                    or todo.get("start_time")
                    or todo.get("deadline")
                    or todo.get("dtstart")
                )
                if not due_str:
                    continue

                try:
                    due_dt = datetime.fromisoformat(due_str.replace("Z", "+00:00"))
                    if due_dt.tzinfo is None:
                        due_dt = due_dt.replace(tzinfo=timezone.utc)
                except (TypeError, ValueError):
                    continue

                if window_start <= due_dt <= window_end:
                    remaining_min = max(0, int((due_dt - now).total_seconds() // 60))
                    todo_name = todo.get("name", "待办事项")
                    log.info(
                        "待办即将到期: %s (还有 %d 分钟)", todo_name, remaining_min
                    )

                    _launch_popup(
                        {
                            "title": f"待办提醒：{todo_name}",
                            "subtitle": f"还有 {remaining_min} 分钟到期\n{todo.get('description', '')}".strip(),
                        }
                    )
                    _reminded_todo_ids.add(todo_id)
                    time.sleep(1)

            # Clean up old reminded IDs (keep set from growing indefinitely)
            active_ids = {t.get("id") for t in todos}
            _reminded_todo_ids.difference_update(_reminded_todo_ids - active_ids)

        except Exception as exc:
            log.error("待办提醒轮询失败: %s", exc)
        time.sleep(TODO_REMINDER_POLL_INTERVAL)


# ---------------------------------------------------------------------------
# 通知源 6：前台应用切换检测 → POST /api/perception/app-switch
# ---------------------------------------------------------------------------


def _get_foreground_window() -> tuple[str | None, str | None]:
    """Return (app_name, window_title) of the current foreground window."""
    system = platform.system()
    if system == "Windows":
        return _get_foreground_window_windows()
    if system == "Darwin":
        return _get_foreground_window_macos()
    return None, None


def _get_foreground_window_windows() -> tuple[str | None, str | None]:
    try:
        import ctypes
        import ctypes.wintypes

        user32 = ctypes.windll.user32  # type: ignore[attr-defined]
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return None, None

        length = user32.GetWindowTextLengthW(hwnd)
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        window_title = buf.value or ""

        pid = ctypes.wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

        app_name: str | None = None
        try:
            import psutil

            app_name = psutil.Process(pid.value).name()
        except Exception:
            pass

        return app_name, window_title
    except Exception:
        return None, None


def _get_foreground_window_macos() -> tuple[str | None, str | None]:
    try:
        result = subprocess.run(  # nosec B603 B607
            [
                "osascript",
                "-e",
                'tell application "System Events" to get {name, title of first window} of first application process whose frontmost is true',
            ],
            capture_output=True,
            text=True,
            timeout=3,
            check=False,
        )
        if result.returncode != 0:
            return None, None
        parts = result.stdout.strip().split(", ", 1)
        app_name = parts[0] if parts else None
        window_title = parts[1] if len(parts) > 1 else None
        return app_name, window_title
    except Exception:
        return None, None


def _poll_app_switch(client: httpx.Client) -> None:
    """Background thread: detect foreground app changes and POST to center."""
    url = f"{_state.center_url}/api/perception/app-switch"
    log.info(
        "应用切换检测已启动 (endpoint=%s, interval=%ss)", url, APP_SWITCH_POLL_INTERVAL
    )

    while True:
        try:
            app_name, window_title = _get_foreground_window()
            if app_name:
                if (
                    app_name != _state.last_fg_app
                    or window_title != _state.last_fg_title
                ):
                    _state.last_fg_app = app_name
                    _state.last_fg_title = window_title
                    log.debug("应用切换: %s — %s", app_name, window_title or "")
                    try:
                        resp = client.post(
                            url,
                            json={
                                "app_name": app_name,
                                "window_title": window_title or "",
                            },
                            timeout=5,
                        )
                        if resp.status_code != 200:
                            log.warning("应用切换上报失败: HTTP %d", resp.status_code)
                    except Exception as exc:
                        log.error("应用切换上报异常: %s", exc)
        except Exception as exc:
            log.error("应用切换检测异常: %s", exc)
        time.sleep(APP_SWITCH_POLL_INTERVAL)


# ---------------------------------------------------------------------------
# 通知源 5：本地文件触发（demo_trigger.txt → 非零值时弹窗）
# ---------------------------------------------------------------------------

DEMO_TRIGGER_FILE = REPO_ROOT / "scripts" / "demo_trigger.txt"
DEMO_DATA_DIR = REPO_ROOT / "scripts" / "demo"
KOL_DATA_FILE = REPO_ROOT / "scripts" / "kol_push_data.json"

_KOL_FALLBACK = {
    "title": "📣 团队 KOL 资料已就绪",
    "subtitle": "已为您整理好相关资料，点击即可查看主页：",
    "links": [
        {
            "name": "陈翔宇（糖果果的陈同学）",
            "url": "https://b23.tv/nh3n1UK",
            "platform": "B站",
        },
        {
            "name": "胡可儿Keer",
            "url": "https://xhslink.com/m/9ubIvmSXUEE",
            "platform": "小红书",
        },
    ],
}


def _load_demo_data(trigger_value: str) -> dict | None:
    """Load popup data for a given trigger value.

    Resolution order:
      1. scripts/demo/<value>.json  (+ optional <value>.html merged as bodyHtml)
      2. For value "1": scripts/kol_push_data.json → fallback KOL data
    """
    demo_json = DEMO_DATA_DIR / f"{trigger_value}.json"
    demo_html = DEMO_DATA_DIR / f"{trigger_value}.html"
    if demo_json.exists():
        data = json.loads(demo_json.read_text(encoding="utf-8"))
        if demo_html.exists():
            data["bodyHtml"] = demo_html.read_text(encoding="utf-8")
        return data
    if trigger_value == "1":
        if KOL_DATA_FILE.exists():
            return json.loads(KOL_DATA_FILE.read_text(encoding="utf-8"))
        return dict(_KOL_FALLBACK)
    return None


def _poll_local_trigger() -> None:
    """后台线程：定时检查触发文件，非零值时加载对应 demo JSON 并弹窗。"""
    log.info(
        "本地文件触发轮询已启动 (file=%s, interval=%ss)",
        DEMO_TRIGGER_FILE,
        LOCAL_FILE_POLL_INTERVAL,
    )

    while True:
        try:
            if DEMO_TRIGGER_FILE.exists():
                value = DEMO_TRIGGER_FILE.read_text(encoding="utf-8").strip()
                if value and value != "0":
                    log.info("检测到触发值=%s", value)
                    DEMO_TRIGGER_FILE.write_text("0", encoding="utf-8")
                    data = _load_demo_data(value)
                    if data:
                        _launch_popup(data)
                    else:
                        log.warning("未找到 demo/%s.json，跳过", value)
        except Exception as exc:
            log.error("本地文件触发轮询失败: %s", exc)
        time.sleep(LOCAL_FILE_POLL_INTERVAL)


# ---------------------------------------------------------------------------
# Optional local HTTP API (requires fastapi + uvicorn)
# ---------------------------------------------------------------------------

_HAS_FASTAPI = False
try:
    from fastapi import FastAPI
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

    _HAS_FASTAPI = True

    _app = FastAPI(title="Signal Sensor", docs_url="/docs")
    _app.add_middleware(
        CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
    )

    class LinkItem(BaseModel):
        name: str
        url: str
        platform: str = ""

    class TriggerRequest(BaseModel):
        title: str = "通知"
        subtitle: str = ""
        links: list[LinkItem] = []

    @_app.post("/trigger")
    async def trigger(req: TriggerRequest):
        """本地接口：接收 JSON 数据，直接触发 Electron 弹窗。"""
        data = req.model_dump()
        ok = _launch_popup(data)
        if ok:
            return {"status": "ok", "message": "弹窗已触发"}
        return {"status": "busy", "message": "当前已有弹窗显示中，请等待关闭后重试"}

    @_app.get("/demo/{scene_id}")
    async def demo_trigger(scene_id: str):
        """远程触发 demo 弹窗，浏览器访问 /demo/11 即可。"""
        data = _load_demo_data(scene_id)
        if data is None:
            return {"status": "error", "message": f"未找到 demo/{scene_id}.json"}
        ok = _launch_popup(data)
        if ok:
            return {"status": "ok", "scene": scene_id}
        return {"status": "busy", "message": "当前已有弹窗显示中"}

    @_app.get("/health")
    async def health():
        busy = _state.popup_proc is not None and _state.popup_proc.poll() is None
        return {
            "status": "running",
            "popup_active": busy,
            "center_url": _state.center_url or None,
            "node_id": _state.node_id,
        }

except ImportError:
    pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# System Tray (pystray)
# ---------------------------------------------------------------------------

TRAY_ICON_PATH = REPO_ROOT / "scripts" / "freeu_tray.ico"


def _open_frontend() -> None:
    """Open the frontend URL in the default browser."""
    import webbrowser

    port = os.environ.get("FRONTEND_PORT", "3001")
    webbrowser.open(f"http://127.0.0.1:{port}")


def _open_api_docs() -> None:
    import webbrowser

    webbrowser.open("http://127.0.0.1:9876/docs")


def _build_tray_icon() -> "pystray.Icon | None":
    if not _HAS_TRAY:
        return None
    try:
        image = Image.open(str(TRAY_ICON_PATH))
    except Exception:
        image = Image.new("RGB", (64, 64), (129, 140, 248))

    def on_open_ui(icon, item):
        _open_frontend()

    def on_api_docs(icon, item):
        _open_api_docs()

    def on_quit(icon, item):
        icon.stop()
        os._exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("打开 Free U", on_open_ui, default=True),
        pystray.MenuItem("API 文档", on_api_docs),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(
            "状态",
            pystray.Menu(
                pystray.MenuItem(
                    lambda item: f"Center: {_state.center_url or '未连接'}",
                    None,
                    enabled=False,
                ),
                pystray.MenuItem(
                    lambda item: f"Node: {_state.node_id}",
                    None,
                    enabled=False,
                ),
            ),
        ),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("退出 Free U", on_quit),
    )

    icon = pystray.Icon("freeu", image, "Free U Agent", menu)
    return icon


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Signal Sensor — 统一通知守护进程（Center 轮询 + 交互式弹窗）"
    )
    parser.add_argument(
        "--port", type=int, default=9876, help="本地 API 端口（需 fastapi）"
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument(
        "--center-url",
        default="",
        help="Center 节点 URL（必需，用于轮询通知）",
    )
    parser.add_argument(
        "--node-id", default=platform.node(), help="节点 ID（默认主机名）"
    )
    args = parser.parse_args()

    _state.electron_bin = _find_electron()
    if _state.electron_bin is None:
        log.error("未找到 Electron，请先在 frontend 目录执行 pnpm install")
        sys.exit(1)

    _state.center_url = args.center_url.rstrip("/") if args.center_url else ""
    _state.node_id = args.node_id

    if not _state.center_url:
        log.error("必须指定 --center-url")
        sys.exit(1)

    log.info("Signal Sensor 启动中...")
    log.info("  Center:   %s", _state.center_url)
    log.info("  Node ID:  %s", _state.node_id)
    log.info("  Electron: %s", _state.electron_bin)
    log.info("  日志文件: %s", LOG_DIR / "signal-sensor.log")
    log.info(
        "  本地 API: %s", "可用" if _HAS_FASTAPI else "不可用（缺少 fastapi/uvicorn）"
    )
    log.info("  通知源:")
    log.info(
        "    [1] 推送通知  /api/sensor/notifications  (每 %ss)",
        SENSOR_NOTIFY_POLL_INTERVAL,
    )
    log.info(
        "    [2] 通用通知  /api/notifications          (每 %ss)",
        GENERAL_NOTIFY_POLL_INTERVAL,
    )
    log.info(
        "    [3] 待办草稿  /api/todos?status=draft      (每 %ss)",
        DRAFT_TODO_POLL_INTERVAL,
    )
    log.info(
        "    [4] 待办提醒  提前%d分钟                    (每 %ss)",
        TODO_REMINDER_AHEAD_MINUTES,
        TODO_REMINDER_POLL_INTERVAL,
    )
    log.info(
        "    [5] 本地触发  %s                           (每 %ss)",
        DEMO_TRIGGER_FILE.name,
        LOCAL_FILE_POLL_INTERVAL,
    )
    log.info(
        "    [6] 应用切换  /api/perception/app-switch   (每 %ss)",
        APP_SWITCH_POLL_INTERVAL,
    )

    http_client = httpx.Client(timeout=10)

    health_url = f"{_state.center_url}/health"
    log.info("等待后端就绪 (%s)...", health_url)
    while True:
        try:
            resp = http_client.get(health_url, timeout=3)
            if resp.status_code == 200:
                log.info("后端已就绪")
                break
        except Exception:
            pass
        time.sleep(2)

    threading.Thread(
        target=_poll_sensor_notifications, args=(http_client,), daemon=True
    ).start()
    threading.Thread(
        target=_poll_general_notifications, args=(http_client,), daemon=True
    ).start()
    threading.Thread(target=_poll_draft_todos, args=(http_client,), daemon=True).start()
    threading.Thread(
        target=_poll_upcoming_todos, args=(http_client,), daemon=True
    ).start()
    threading.Thread(target=_poll_local_trigger, daemon=True).start()
    threading.Thread(target=_poll_app_switch, args=(http_client,), daemon=True).start()

    if _HAS_FASTAPI:
        import uvicorn

        log.info("本地 API: http://%s:%s", args.host, args.port)
        log.info("API 文档: http://%s:%s/docs", args.host, args.port)
        threading.Thread(
            target=uvicorn.run,
            kwargs={
                "app": _app,
                "host": args.host,
                "port": args.port,
                "log_level": "warning",
            },
            daemon=True,
        ).start()

    tray_icon = _build_tray_icon() if _HAS_TRAY else None
    if tray_icon:
        log.info("系统托盘已启动（右下角图标）")
        tray_icon.run()
    else:
        if not _HAS_TRAY:
            log.info("系统托盘不可用（安装: pip install pystray pillow）")
        log.info("所有轮询线程已启动，主线程等待中...")
        log.info("按 Ctrl+C 退出")
        try:
            while True:
                time.sleep(60)
        except KeyboardInterrupt:
            log.info("退出")


if __name__ == "__main__":
    main()
