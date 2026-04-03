"""Simple token-based authentication for omi App compatibility.

Replaces Firebase Auth with a local token check. Since LifeTrace is
single-user / self-hosted, a static token is sufficient.
"""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, WebSocket

from util.settings import settings

router = APIRouter(tags=["omi-auth"])


def _get_omi_token() -> str:
    configured = str(settings.get("omi_compat.token", "")).strip()
    if configured:
        return configured
    raise HTTPException(status_code=500, detail="omi_compat.token is not configured")


def _get_single_uid() -> str:
    return str(settings.get("omi_compat.uid", "lifetrace-user"))


def verify_token(authorization: str = Header("")) -> str:
    """HTTP dependency – extracts uid after verifying the bearer token."""
    token = authorization.removeprefix("Bearer ").strip()
    if not token or token != _get_omi_token():
        raise HTTPException(status_code=401, detail="Invalid or missing token")
    return _get_single_uid()


async def verify_ws_token(websocket: WebSocket) -> str:
    """WebSocket dependency – checks *uid* query-param as simple auth.

    The omi App passes ``uid`` as a query parameter on the ``/v4/listen``
    WebSocket.  In the original backend that uid comes from Firebase;
    here we accept any non-empty uid and treat it as the single local user.
    For an extra layer of safety the caller can also pass a ``token``
    query parameter which is validated against the configured secret.
    """
    token = websocket.query_params.get("token", "")
    if token and token != _get_omi_token():
        await websocket.close(code=1008, reason="Bad token")
        raise HTTPException(status_code=401, detail="Bad token")

    uid = websocket.query_params.get("uid", "")
    if not uid:
        uid = _get_single_uid()
    return uid
