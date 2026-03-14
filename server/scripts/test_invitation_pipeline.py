"""端到端调试脚本 — 模拟微信邀约消息，触发完整感知→意图→调度→通知链路。

用法:
    cd server
    uv run python scripts/test_invitation_pipeline.py [--base-url http://127.0.0.1:8001]

此脚本做 3 件事:
    1. POST /api/perception/ingest  — 注入一条模拟 OCR 感知事件
    2. 轮询 /api/perception/todo-intent/records/recent — 等待处理结果
    3. GET  /api/notifications — 查看最终通知卡片
"""

from __future__ import annotations

import argparse
import sys
import time
from datetime import UTC, datetime

import httpx

DEFAULT_BASE = "http://127.0.0.1:8001"

WECHAT_INVITATION_TEXT = (
    "张三：哥们儿，周六下午两点一起去五道口吃火锅吧？好久没聚了！\n"
    "张三：万达广场那家海底捞，你看行不行？\n"
    "张三：叫上李四他们"
)


def inject_event(client: httpx.Client, base: str) -> str:
    payload = {
        "timestamp": datetime.now(tz=UTC).isoformat(),
        "source": "ocr_proactive",
        "modality": "text",
        "content_text": WECHAT_INVITATION_TEXT,
        "metadata": {
            "app_name": "wechat",
            "window_title": "微信 - 张三",
            "todo_relevant": True,
            "node_id": "debug-local",
        },
    }
    resp = client.post(f"{base}/api/perception/ingest", json=payload)
    resp.raise_for_status()
    data = resp.json()
    event_id = data.get("event_id", "?")
    print(f"[1/3] 感知事件已注入  event_id={event_id}")
    return event_id


def poll_intent_records(client: httpx.Client, base: str, timeout: int = 120) -> None:
    print(f"[2/3] 轮询意图处理记录 (最多等 {timeout}s)...")
    url = f"{base}/api/perception/todo-intent/records/recent?count=5"
    start = time.time()
    seen_ids: set[str] = set()

    while time.time() - start < timeout:
        try:
            resp = client.get(url)
            resp.raise_for_status()
            records = resp.json()
        except Exception as exc:
            print(f"     轮询失败: {exc}")
            time.sleep(3)
            continue

        for r in records:
            rid = r.get("record_id", "")
            if rid in seen_ids:
                continue
            seen_ids.add(rid)
            status = r.get("status", "?")
            merged = (r.get("merged_text") or "")[:80]
            candidates = r.get("candidates", [])
            results = r.get("integration_results", [])
            print(f"     记录 {rid[:16]}...  status={status}")
            if merged:
                print(f"       文本: {merged}...")
            for c in candidates:
                print(
                    f"       候选: name={c.get('name')}  "
                    f"intent_type={c.get('intent_type', 'todo')}  "
                    f"inviter={c.get('inviter')}  "
                    f"confidence={c.get('confidence')}"
                )
            for ir in results:
                print(f"       集成: action={ir.get('action')}  reason={ir.get('reason')}")

            if status in ("extracted", "processed"):
                print("     ✓ 处理完成!")
                return

        time.sleep(3)

    print("     ⚠ 超时，未等到处理完成的记录")


def check_notifications(client: httpx.Client, base: str) -> None:
    print("[3/3] 查看通知列表...")
    resp = client.get(f"{base}/api/notifications")
    resp.raise_for_status()
    notifications = resp.json()
    if not notifications:
        print("     (暂无通知)")
        return
    for n in notifications[:5]:
        title = n.get("title", "")
        content = (n.get("content") or "")[:200]
        ts = n.get("timestamp", "")
        print(f"     📨 [{ts}] {title}")
        if content:
            print(f"        {content}...")
        print()


def main() -> None:
    parser = argparse.ArgumentParser(description="测试邀约感知→调度→通知全链路")
    parser.add_argument("--base-url", default=DEFAULT_BASE, help=f"后端地址 (默认 {DEFAULT_BASE})")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")

    print(f"目标后端: {base}")
    print(f"模拟文本: {WECHAT_INVITATION_TEXT[:60]}...")
    print("=" * 60)

    client = httpx.Client(timeout=30)

    try:
        inject_event(client, base)
        poll_intent_records(client, base)
        check_notifications(client, base)
    except httpx.ConnectError:
        print(f"\n❌ 无法连接到 {base}，请确认后端已启动。")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n中断。")
    finally:
        client.close()

    print("=" * 60)
    print("调试完成。")


if __name__ == "__main__":
    main()
