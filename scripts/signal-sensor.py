"""
Signal Sensor — HTTP API + Center 轮询，触发 Electron 弹窗

两种触发方式并存：
  1. 本地 HTTP API：POST /trigger 直接触发弹窗（本地调试 / 本地脚本）
  2. Center 轮询：定时 GET Center /api/sensor/notifications 拉取远程推送的通知

启动:
  uv run python scripts/signal-sensor.py --center-url https://xxx.cpolar.cn
  uv run python scripts/signal-sensor.py --port 9876 --center-url https://xxx.cpolar.cn
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
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "frontend"
POPUP_SCRIPT = FRONTEND_DIR / "scripts" / "signal-popup.js"


class _State:
    popup_lock = threading.Lock()
    popup_proc: subprocess.Popen | None = None  # type: ignore[type-arg]
    electron_bin: str | None = None
    center_url: str = ""
    node_id: str = platform.node()
    poll_interval: float = 1.0


_state = _State()

app = FastAPI(title="Signal Sensor", docs_url="/docs")
app.add_middleware(
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
    """在后台线程中启动 Electron 弹窗，同一时间只允许一个。"""
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
# Center notification polling
# ---------------------------------------------------------------------------


def _poll_center_notifications() -> None:
    """后台线程：定时轮询 Center 拉取通知并触发弹窗。"""
    client = httpx.Client(timeout=10)
    url = f"{_state.center_url}/api/sensor/notifications"
    print(
        f"[signal-sensor] 通知轮询已启动 (center={_state.center_url}, "
        f"node_id={_state.node_id}, interval={_state.poll_interval}s)"
    )

    while True:
        try:
            resp = client.get(url, params={"node_id": _state.node_id})
            resp.raise_for_status()
            items = resp.json().get("notifications", [])
            for item in items:
                print(
                    f"[signal-sensor] 收到远程通知: {item.get('title', '')} "
                    f"(id={item.get('id', '?')})"
                )
                _launch_popup(item)
                time.sleep(1)
        except Exception as exc:
            print(f"[signal-sensor] 轮询失败: {exc}")
        time.sleep(_state.poll_interval)


# ---------------------------------------------------------------------------
# Local HTTP API
# ---------------------------------------------------------------------------


@app.post("/trigger")
async def trigger(req: TriggerRequest):
    """本地接口：接收 JSON 数据，直接触发 Electron 弹窗。"""
    data = req.model_dump()
    ok = _launch_popup(data)
    if ok:
        return {"status": "ok", "message": "弹窗已触发"}
    return {"status": "busy", "message": "当前已有弹窗显示中，请等待关闭后重试"}


@app.get("/health")
async def health():
    busy = _state.popup_proc is not None and _state.popup_proc.poll() is None
    return {
        "status": "running",
        "popup_active": busy,
        "center_url": _state.center_url or None,
        "node_id": _state.node_id,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Signal Sensor HTTP API")
    parser.add_argument("--port", type=int, default=9876)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument(
        "--center-url",
        default="",
        help="Center node URL for remote notification polling",
    )
    parser.add_argument(
        "--node-id", default=platform.node(), help="Node ID (defaults to hostname)"
    )
    parser.add_argument("--poll-interval", type=float, default=1.0)
    args = parser.parse_args()

    _state.electron_bin = _find_electron()
    if _state.electron_bin is None:
        print("[signal-sensor] 未找到 Electron，请先在 frontend 目录执行 pnpm install")
        sys.exit(1)

    _state.center_url = args.center_url.rstrip("/") if args.center_url else ""
    _state.node_id = args.node_id

    print("[signal-sensor] Signal Sensor 启动中...")
    print(f"  本地 API: http://{args.host}:{args.port}")
    print(f"  API 文档: http://{args.host}:{args.port}/docs")
    print(f"  Electron: {_state.electron_bin}")
    print(f"  Node ID:  {_state.node_id}")
    if _state.center_url:
        print(f"  Center:   {_state.center_url}")
        print(f"  轮询间隔: {args.poll_interval}s")
    else:
        print("  Center:   未配置 (仅本地 API 模式)")
    print()

    if _state.center_url:
        _state.poll_interval = args.poll_interval
        t = threading.Thread(target=_poll_center_notifications, daemon=True)
        t.start()

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
