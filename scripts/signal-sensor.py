"""
Signal Sensor — HTTP API 触发 Electron 弹窗

暴露一个 HTTP 接口，接收 JSON 数据并启动 Electron 弹窗展示内容。

启动:
  uv run python scripts/signal-sensor.py
  uv run python scripts/signal-sensor.py --port 9876

触发弹窗:
  curl -X POST http://127.0.0.1:9876/trigger -H "Content-Type: application/json" ^
       -d "{\"title\": \"相关KOL信息如下\", \"links\": [{\"name\": \"xiangyu\", \"url\": \"https://bilibili.com\", \"platform\": \"bilibili\"}]}"
"""

from __future__ import annotations

import argparse
import contextlib
import json
import os
import subprocess  # nosec B404
import sys
import tempfile
import threading
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

sys.stdout.reconfigure(line_buffering=True)  # type: ignore[attr-defined]

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = REPO_ROOT / "free-todo-frontend"
POPUP_SCRIPT = FRONTEND_DIR / "scripts" / "signal-popup.js"


class _State:
    popup_lock = threading.Lock()
    popup_proc: subprocess.Popen | None = None  # type: ignore[type-arg]
    electron_bin: str | None = None


_state = _State()

app = FastAPI(title="Signal Sensor", docs_url="/docs")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class LinkItem(BaseModel):
    name: str
    url: str
    platform: str = ""


class TriggerRequest(BaseModel):
    title: str = "通知"
    subtitle: str = ""
    badge: str = "Signal"
    links: list[LinkItem] = []


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
                    env={**os.environ, "ELECTRON_DISABLE_SECURITY_WARNINGS": "true"},
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


@app.post("/trigger")
async def trigger(req: TriggerRequest):
    """接收 JSON 数据，触发 Electron 弹窗展示内容。"""
    data = req.model_dump()
    ok = _launch_popup(data)
    if ok:
        return {"status": "ok", "message": "弹窗已触发"}
    return {"status": "busy", "message": "当前已有弹窗显示中，请等待关闭后重试"}


@app.get("/health")
async def health():
    busy = _state.popup_proc is not None and _state.popup_proc.poll() is None
    return {"status": "running", "popup_active": busy}


def main() -> None:
    parser = argparse.ArgumentParser(description="Signal Sensor HTTP API")
    parser.add_argument("--port", type=int, default=9876)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    _state.electron_bin = _find_electron()
    if _state.electron_bin is None:
        print("[signal-sensor] 未找到 Electron，请先在 free-todo-frontend 目录执行 pnpm install")
        sys.exit(1)

    print("[signal-sensor] HTTP API 启动中...")
    print(f"  地址: http://{args.host}:{args.port}")
    print(f"  文档: http://{args.host}:{args.port}/docs")
    print(f"  Electron: {_state.electron_bin}")
    print()

    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
