"""Omi-compatible user / firmware / misc endpoints.

The omi App calls many user-profile, preference, subscription, and
notification endpoints. We provide stubs for all of them so the App
runs without 404s in LifeTrace self-hosted mode.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Request

from routers.omi_compat.auth import verify_token
from util.logging_config import get_logger

logger = get_logger()

router = APIRouter(tags=["omi-users"])
_language_pref: dict[str, str] = {}


# ---------------------------------------------------------------------------
# User profile
# ---------------------------------------------------------------------------


@router.get("/v1/users/me")
async def get_current_user(uid: str = Depends(verify_token)):
    return {
        "uid": uid,
        "email": "",
        "name": "LifeTrace User",
        "created_at": "2026-01-01T00:00:00Z",
        "plan_type": "unlimited",
        "has_speech_profile": False,
        "geolocation": None,
    }


@router.get("/v1/users/me/usage")
async def get_usage(period: str = "monthly", uid: str = Depends(verify_token)):
    return {
        "conversations": 0,
        "messages": 0,
        "seconds_transcribed": 0,
        "plan_type": "unlimited",
        "period": period,
    }


@router.get("/v1/users/me/subscription")
async def get_subscription(uid: str = Depends(verify_token)):
    return {
        "plan": "unlimited",
        "status": "active",
        "current_period_end": "2099-12-31T00:00:00Z",
    }


# ---------------------------------------------------------------------------
# Onboarding (App calls /v1/users/onboarding, not /onboarding-status)
# ---------------------------------------------------------------------------


@router.get("/v1/users/onboarding-status")
async def onboarding_status_legacy(uid: str = Depends(verify_token)):
    return {"completed": True}


@router.get("/v1/users/onboarding")
async def get_onboarding(uid: str = Depends(verify_token)):
    return {"completed": True}


@router.post("/v1/users/onboarding")
@router.patch("/v1/users/onboarding")
async def update_onboarding(uid: str = Depends(verify_token)):
    return {"completed": True}


# ---------------------------------------------------------------------------
# Language preferences
# ---------------------------------------------------------------------------


@router.get("/v1/users/language")
async def get_language(uid: str = Depends(verify_token)):
    return {"language": _language_pref.get(uid, "zh-CN")}


@router.post("/v1/users/language")
@router.patch("/v1/users/language")
async def set_language(request: Request, uid: str = Depends(verify_token)):
    language = "zh-CN"
    try:
        body = await request.json()
        raw = body.get("language") if isinstance(body, dict) else None
        text = str(raw or "").strip()
        if text:
            language = text
    except json.JSONDecodeError:
        logger.warning("[omi-users] set_language received non-JSON payload")

    # Normalize common Simplified Chinese aliases to zh-CN.
    normalized = language
    if normalized in {"zh", "zh-Hans", "zh_CN", "zh-cn"}:
        normalized = "zh-CN"

    _language_pref[uid] = normalized
    return {"status": "ok", "language": normalized}


# ---------------------------------------------------------------------------
# Transcription / recording preferences
# ---------------------------------------------------------------------------


@router.get("/v1/users/transcription-preferences")
async def get_transcription_prefs(uid: str = Depends(verify_token)):
    return {"model": "dashscope", "language": "zh"}


@router.post("/v1/users/transcription-preferences")
@router.patch("/v1/users/transcription-preferences")
async def set_transcription_prefs(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/users/store-recording-permission")
async def store_recording_perm(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/users/store-recording-permission")
async def get_recording_perm(uid: str = Depends(verify_token)):
    return {"store_recording_permission": True}


_cloud_sync_enabled: dict[str, bool] = {}


@router.post("/v1/users/private-cloud-sync")
async def set_cloud_sync(value: bool = True, uid: str = Depends(verify_token)):
    _cloud_sync_enabled[uid] = value
    return {"status": "ok"}


@router.get("/v1/users/private-cloud-sync")
async def get_cloud_sync(uid: str = Depends(verify_token)):
    return {"private_cloud_sync_enabled": _cloud_sync_enabled.get(uid, False)}


@router.get("/v1/users/training-data-opt-in")
async def get_training_opt(uid: str = Depends(verify_token)):
    return {"opted_in": False}


@router.post("/v1/users/training-data-opt-in")
async def set_training_opt(uid: str = Depends(verify_token)):
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Speech profile
# ---------------------------------------------------------------------------


@router.get("/v3/speech-profile")
async def has_speech_profile(uid: str = Depends(verify_token)):
    return {"has_profile": False}


@router.get("/v4/speech-profile")
async def get_speech_profile(uid: str = Depends(verify_token)):
    return {"url": None}


# ---------------------------------------------------------------------------
# People (speaker identification stubs)
# ---------------------------------------------------------------------------


@router.get("/v1/users/people")
async def list_people(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/users/people")
async def create_person(uid: str = Depends(verify_token)):
    return {"id": "", "name": ""}


# ---------------------------------------------------------------------------
# Firmware
# ---------------------------------------------------------------------------


@router.get("/v2/firmware/latest")
async def get_latest_firmware(
    device_model: str = "",
    firmware_revision: str = "",
    hardware_revision: str = "",
    manufacturer_name: str = "",
):
    from fastapi import HTTPException

    raise HTTPException(status_code=404, detail="No firmware update available")


# ---------------------------------------------------------------------------
# Notifications / FCM
# ---------------------------------------------------------------------------


@router.post("/v1/users/store-device-token")
async def store_device_token(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/users/fcm-token")
async def save_fcm_token(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/users/mentor-notification-settings")
async def get_mentor_notif(uid: str = Depends(verify_token)):
    return {"frequency": 0}


@router.post("/v1/users/mentor-notification-settings")
@router.patch("/v1/users/mentor-notification-settings")
async def set_mentor_notif(uid: str = Depends(verify_token)):
    return {"status": "ok", "frequency": 0}


# ---------------------------------------------------------------------------
# Daily summaries
# ---------------------------------------------------------------------------


@router.get("/v1/users/daily-summary-settings")
async def get_daily_summary_settings(uid: str = Depends(verify_token)):
    return {"enabled": False, "hour": 21}


@router.post("/v1/users/daily-summary-settings")
@router.patch("/v1/users/daily-summary-settings")
async def set_daily_summary_settings(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/users/daily-summaries")
async def list_daily_summaries(
    limit: int = 10,
    offset: int = 0,
    uid: str = Depends(verify_token),
):
    return {"summaries": [], "has_more": False}


# ---------------------------------------------------------------------------
# Geolocation / analytics / misc
# ---------------------------------------------------------------------------


@router.post("/v3/users/geolocation")
async def update_geolocation(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/users/geolocation")
@router.patch("/v1/users/geolocation")
async def update_geolocation_v1(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/users/analytics/{path:path}")
async def analytics_stub(path: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/users/preferences/app")
async def get_app_pref(uid: str = Depends(verify_token)):
    return {}


@router.get("/v1/users/developer/webhooks/status")
async def webhooks_status(uid: str = Depends(verify_token)):
    return {"webhooks": []}


@router.get("/v1/users/export")
async def export_data(uid: str = Depends(verify_token)):
    return {"status": "not_available"}
