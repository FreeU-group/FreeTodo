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
import os
import platform
import subprocess  # nosec B404
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx

sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
POPUP_SCRIPT = FRONTEND_DIR / "scripts" / "signal-popup.js"

SENSOR_NOTIFY_POLL_INTERVAL = 1.0
GENERAL_NOTIFY_POLL_INTERVAL = 1.0
DRAFT_TODO_POLL_INTERVAL = 1.0
LOCAL_FILE_POLL_INTERVAL = 2.0


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


def _launch_popup(data: dict) -> bool:
    """在后台线程中启动 Electron 交互式弹窗，同一时间只允许一个。"""
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

            print(f"[signal-sensor] 弹窗启动: {data.get('title', '')}")
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
            print(f"[signal-sensor] 弹窗已关闭 (exit={_state.popup_proc.returncode})")
        except Exception as exc:
            print(f"[signal-sensor] 弹窗启动失败: {exc}")
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
    print(
        f"[signal-sensor] 推送通知轮询已启动 "
        f"(endpoint={url}, node_id={_state.node_id}, interval={SENSOR_NOTIFY_POLL_INTERVAL}s)"
    )

    while True:
        try:
            resp = client.get(url, params={"node_id": _state.node_id})
            resp.raise_for_status()
            items = resp.json().get("notifications", [])
            for item in items:
                print(
                    f"[signal-sensor] 收到推送通知: {item.get('title', '')} "
                    f"(id={item.get('id', '?')})"
                )
                _launch_popup(item)
                time.sleep(1)
        except Exception as exc:
            print(f"[signal-sensor] 推送通知轮询失败: {exc}")
        time.sleep(SENSOR_NOTIFY_POLL_INTERVAL)


# ---------------------------------------------------------------------------
# 通知源 2：通用通知（/api/notifications）— 筛选邀约等重要通知
# ---------------------------------------------------------------------------


def _poll_general_notifications(client: httpx.Client) -> None:
    """后台线程：轮询通用通知接口，筛选邀约等重要通知弹窗。"""
    url = f"{_state.center_url}/api/notifications"
    print(
        f"[signal-sensor] 通用通知轮询已启动 "
        f"(endpoint={url}, interval={GENERAL_NOTIFY_POLL_INTERVAL}s)"
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
                title_lower = title.lower()
                is_important = any(
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
                print(f"[signal-sensor] 收到重要通知: {title} (id={nid})")
                _launch_popup({"title": title, "subtitle": content})
                time.sleep(1)
        except Exception as exc:
            print(f"[signal-sensor] 通用通知轮询失败: {exc}")
        time.sleep(GENERAL_NOTIFY_POLL_INTERVAL)


# ---------------------------------------------------------------------------
# 通知源 3：待办草稿检测（/api/todos?status=draft）
# ---------------------------------------------------------------------------


def _poll_draft_todos(client: httpx.Client) -> None:
    """后台线程：轮询待办草稿接口，发现新草稿时弹窗提醒。"""
    url = f"{_state.center_url}/api/todos"
    print(
        f"[signal-sensor] 待办草稿轮询已启动 "
        f"(endpoint={url}, interval={DRAFT_TODO_POLL_INTERVAL}s)"
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
                    print(
                        f"[signal-sensor] 检测到新草稿待办: {todo_name} (id={todo_id})"
                    )
                    _launch_popup(
                        {
                            "title": "待办提醒",
                            "subtitle": f"检测到：{todo_name}",
                        }
                    )
        except Exception as exc:
            print(f"[signal-sensor] 待办草稿轮询失败: {exc}")
        time.sleep(DRAFT_TODO_POLL_INTERVAL)


# ---------------------------------------------------------------------------
# 通知源 4：本地文件触发（kol_push_trigger.txt → 1 时弹窗推送 KOL 信息）
# ---------------------------------------------------------------------------

KOL_TRIGGER_FILE = REPO_ROOT / "scripts" / "kol_push_trigger.txt"
KOL_DATA_FILE = REPO_ROOT / "scripts" / "kol_push_data.json"


def _poll_local_trigger() -> None:
    """后台线程：定时检查本地触发文件，值为 1 时弹窗推送 KOL 信息并重置为 0。"""
    print(
        f"[signal-sensor] 本地文件触发轮询已启动 "
        f"(file={KOL_TRIGGER_FILE}, interval={LOCAL_FILE_POLL_INTERVAL}s)"
    )

    while True:
        try:
            if KOL_TRIGGER_FILE.exists():
                value = KOL_TRIGGER_FILE.read_text(encoding="utf-8").strip()
                if value == "1":
                    print("[signal-sensor] 检测到本地触发文件=1，准备推送 KOL 信息")
                    KOL_TRIGGER_FILE.write_text("0", encoding="utf-8")

                    if KOL_DATA_FILE.exists():
                        data = json.loads(KOL_DATA_FILE.read_text(encoding="utf-8"))
                    else:
                        data = {
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

                    _launch_popup(data)
        except Exception as exc:
            print(f"[signal-sensor] 本地文件触发轮询失败: {exc}")
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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Signal Sensor — 统一通知守护进程（Center 轮询 + 交互式弹窗）"
    )
    parser.add_argument(
        "--port", type=int, default=9876, help="本地 API 端口（需 fastapi）"
    )
    parser.add_argument("--host", default="127.0.0.1")
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
        print("[signal-sensor] 未找到 Electron，请先在 frontend 目录执行 pnpm install")
        sys.exit(1)

    _state.center_url = args.center_url.rstrip("/") if args.center_url else ""
    _state.node_id = args.node_id

    if not _state.center_url:
        print("[signal-sensor] 错误: 必须指定 --center-url")
        sys.exit(1)

    print("[signal-sensor] Signal Sensor 启动中...")
    print(f"  Center:   {_state.center_url}")
    print(f"  Node ID:  {_state.node_id}")
    print(f"  Electron: {_state.electron_bin}")
    print(f"  本地 API: {'可用' if _HAS_FASTAPI else '不可用（缺少 fastapi/uvicorn）'}")
    print()
    print("  通知源:")
    print(
        f"    [1] 推送通知  /api/sensor/notifications  (每 {SENSOR_NOTIFY_POLL_INTERVAL}s)"
    )
    print(
        f"    [2] 通用通知  /api/notifications          (每 {GENERAL_NOTIFY_POLL_INTERVAL}s)"
    )
    print(
        f"    [3] 待办草稿  /api/todos?status=draft      (每 {DRAFT_TODO_POLL_INTERVAL}s)"
    )
    print(
        f"    [4] 本地触发  {KOL_TRIGGER_FILE.name}        (每 {LOCAL_FILE_POLL_INTERVAL}s)"
    )
    print()

    http_client = httpx.Client(timeout=10)

    threading.Thread(
        target=_poll_sensor_notifications, args=(http_client,), daemon=True
    ).start()
    threading.Thread(
        target=_poll_general_notifications, args=(http_client,), daemon=True
    ).start()
    threading.Thread(target=_poll_draft_todos, args=(http_client,), daemon=True).start()
    threading.Thread(target=_poll_local_trigger, daemon=True).start()

    if _HAS_FASTAPI:
        import uvicorn

        print(f"[signal-sensor] 本地 API: http://{args.host}:{args.port}")
        print(f"[signal-sensor] API 文档: http://{args.host}:{args.port}/docs")
        print()
        uvicorn.run(_app, host=args.host, port=args.port, log_level="warning")
    else:
        print("[signal-sensor] 所有轮询线程已启动，主线程等待中...")
        print("[signal-sensor] 按 Ctrl+C 退出")
        print()
        try:
            while True:
                time.sleep(60)
        except KeyboardInterrupt:
            print("\n[signal-sensor] 退出")


if __name__ == "__main__":
    main()
