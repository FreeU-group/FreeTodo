"""Quick smoke-test for the omi-compat API layer.

Usage:
    python scripts/test_omi_compat.py [BASE_URL]

Default BASE_URL is http://127.0.0.1:8001
"""

from __future__ import annotations

import asyncio
import os
import sys

import httpx

try:
    import websockets  # type: ignore[import-untyped]
except ImportError:
    websockets = None

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8001"
TOKEN = os.getenv("LIFETRACE_OMI_TOKEN", "")
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
HTTP_OK = 200
HTTP_UNAUTHORIZED = 401
HTTP_NOT_FOUND = 404


def ok(label: str) -> None:
    print(f"  [OK] {label}")


def fail(label: str, detail: str = "") -> None:
    print(f"  [FAIL] {label}  {detail}")


def _status_ok(r: httpx.Response) -> bool:
    return r.status_code == HTTP_OK


async def _check_users_me(client: httpx.AsyncClient) -> None:
    r = await client.get("/v1/users/me")
    if _status_ok(r) and "uid" in r.json():
        ok(f"status={r.status_code}  uid={r.json()['uid']}")
    else:
        fail(f"status={r.status_code}", r.text[:200])


async def _check_json_flag(
    client: httpx.AsyncClient, path: str, key: str, label: str
) -> None:
    r = await client.get(path)
    if _status_ok(r):
        ok(f"{label}={r.json().get(key)}")
    else:
        fail(f"status={r.status_code}")


async def _check_json_len(client: httpx.AsyncClient, path: str, label: str) -> None:
    r = await client.get(path)
    if _status_ok(r):
        ok(f"returned {len(r.json())} {label}")
    else:
        fail(f"status={r.status_code}", r.text[:200])


async def _check_status(
    client: httpx.AsyncClient, method: str, path: str, expect: int
) -> None:
    request = client.post if method == "POST" else client.get
    r = await request(path)
    if r.status_code == expect:
        ok(f"status={expect}")
    else:
        fail(f"status={r.status_code} (expected {expect})")


async def _check_websocket() -> None:
    if websockets is None:
        fail("websockets package not installed, skipping WS test")
        return
    ws_base = BASE.replace("http://", "ws://").replace("https://", "wss://")
    ws_url = (
        f"{ws_base}/v4/listen"
        f"?uid=lifetrace-user&token={TOKEN}"
        f"&language=zh&sample_rate=16000&codec=pcm16"
    )
    try:
        async with websockets.connect(ws_url) as ws:
            await ws.close()
        ok("connected and closed cleanly")
    except Exception as e:
        fail(f"WebSocket error: {e}")


async def _check_bad_token(client: httpx.AsyncClient) -> None:
    r = await client.get(
        "/v1/users/me", headers={"Authorization": "Bearer wrong-token"}
    )
    if r.status_code == HTTP_UNAUTHORIZED:
        ok("correctly rejected")
    else:
        fail(f"status={r.status_code} (expected {HTTP_UNAUTHORIZED})")


async def main() -> None:
    async with httpx.AsyncClient(base_url=BASE, headers=HEADERS, timeout=10) as c:
        print(f"\n=== omi-compat smoke test  ({BASE}) ===\n")
        print("[1] GET /v1/users/me")
        await _check_users_me(c)
        print("[2] GET /v1/users/onboarding-status")
        await _check_json_flag(
            c, "/v1/users/onboarding-status", "completed", "completed"
        )
        print("[3] GET /v3/speech-profile")
        await _check_json_flag(c, "/v3/speech-profile", "has_profile", "has_profile")
        print("[4] GET /v1/conversations")
        await _check_json_len(c, "/v1/conversations", "conversations")
        print("[5] GET /v3/memories")
        await _check_json_len(c, "/v3/memories", "memories")
        print("[6] POST /v1/users/store-device-token")
        await _check_status(c, "POST", "/v1/users/store-device-token", HTTP_OK)
        print("[7] GET /v2/firmware/latest")
        await _check_status(c, "GET", "/v2/firmware/latest", HTTP_NOT_FOUND)
        print("[8] WebSocket /v4/listen")
        await _check_websocket()
        print("[9] Auth rejection (bad token)")
        await _check_bad_token(c)

        print("\n=== done ===\n")


if __name__ == "__main__":
    asyncio.run(main())
