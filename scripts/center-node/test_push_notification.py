"""往 Center 推送一条测试通知，触发边缘节点弹窗。

用法:
  python scripts/test_push_notification.py
  python scripts/test_push_notification.py --center-url https://your-backend.cpolar.cn
  python scripts/test_push_notification.py --node-id MY-PC
"""

from __future__ import annotations

import argparse

import httpx


def main() -> None:
    parser = argparse.ArgumentParser(description="Push test notification to Center")
    parser.add_argument(
        "--center-url",
        default="https://tybbackend.cpolar.cn",
        help="Center node URL",
    )
    parser.add_argument(
        "--node-id",
        default="",
        help="Target node ID (empty = broadcast to all)",
    )
    args = parser.parse_args()

    url = f"{args.center_url.rstrip('/')}/api/sensor/notifications"
    payload = {
        "node_id": args.node_id,
        "title": "测试通知",
        "subtitle": "这是一条来自 Center 的推送测试",
        "links": [
            {"name": "前端页面", "url": f"{args.center_url}/", "platform": "前端"},
        ],
    }

    print(f"POST {url}")
    print(f"Payload: {payload}")
    resp = httpx.post(url, json=payload)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.json()}")


if __name__ == "__main__":
    main()
