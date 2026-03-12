"""Additional Omi-compatible stub endpoints split from stubs.py."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from core.dependencies import get_chat_service
from routers.omi_compat.auth import verify_token

if TYPE_CHECKING:
    from services.chat_service import ChatService

router = APIRouter(tags=["omi-stubs"])

# -- Goals -----------------------------------------------------------------


@router.get("/v1/goals/all")
async def list_goals(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/goals")
async def get_goals(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/goals")
async def create_goal(request: Request, uid: str = Depends(verify_token)):
    return {"id": "", "status": "created"}


@router.get("/v1/goals/{goal_id}")
async def get_goal(goal_id: str, uid: str = Depends(verify_token)):
    return {}


@router.delete("/v1/goals/{goal_id}")
async def delete_goal(goal_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/goals/{goal_id}/progress")
async def update_goal_progress(goal_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/goals/{goal_id}/history")
async def goal_history(goal_id: str, days: int = 7, uid: str = Depends(verify_token)):
    return []


@router.post("/v1/goals/suggest")
async def suggest_goals(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/goals/advice")
async def goals_advice(uid: str = Depends(verify_token)):
    return {"advice": ""}


@router.post("/v1/goals/{goal_id}/advice")
async def goal_advice(goal_id: str, uid: str = Depends(verify_token)):
    return {"advice": ""}


# -- Folders ---------------------------------------------------------------


@router.get("/v1/folders")
async def list_folders(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/folders")
async def create_folder(request: Request, uid: str = Depends(verify_token)):
    return {"id": "", "name": ""}


@router.get("/v1/folders/{folder_id}")
async def get_folder(folder_id: str, uid: str = Depends(verify_token)):
    return {}


@router.put("/v1/folders/{folder_id}")
async def update_folder(folder_id: str, request: Request, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.delete("/v1/folders/{folder_id}")
async def delete_folder(folder_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/conversations/{cid}/folder")
async def move_to_folder(cid: str, request: Request, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/folders/{folder_id}/conversations/bulk-move")
async def bulk_move_to_folder(folder_id: str, request: Request, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/folders/reorder")
async def reorder_folders(request: Request, uid: str = Depends(verify_token)):
    return {"status": "ok"}


# -- Knowledge graph / Calendar / Integrations -----------------------------


@router.get("/v1/knowledge-graph/{path:path}")
async def kg_stub(path: str, uid: str = Depends(verify_token)):
    return []


@router.post("/v1/knowledge-graph/{path:path}")
async def kg_post_stub(path: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/calendar/meetings")
async def list_meetings(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/integrations/{app_key}")
async def get_integration(app_key: str, uid: str = Depends(verify_token)):
    return {"enabled": False}


@router.get("/v1/task-integrations")
async def list_task_integrations(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/task-integrations/default")
async def get_default_task_integration(uid: str = Depends(verify_token)):
    return {}


@router.post("/v1/task-integrations/default")
async def set_default_task_integration(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/task-integrations/{app_key}")
async def get_task_integration(app_key: str, uid: str = Depends(verify_token)):
    return {"enabled": False}


# -- People detail / CRUD -------------------------------------------------


@router.get("/v1/users/people/{person_id}")
async def get_person(
    person_id: str, include_speech_samples: bool = False, uid: str = Depends(verify_token)
):
    return {"id": person_id, "name": ""}


@router.patch("/v1/users/people/{person_id}/name")
async def rename_person(person_id: str, value: str = "", uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.delete("/v1/users/people/{person_id}")
async def delete_person(person_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.delete("/v1/users/people/{person_id}/speech-samples/{sample_index}")
async def delete_speech_sample(person_id: str, sample_index: int, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.delete("/v1/users/delete-account")
async def delete_account(uid: str = Depends(verify_token)):
    return {"status": "ok"}


# -- Developer webhooks ----------------------------------------------------


@router.get("/v1/users/developer/webhook/{webhook_type}")
async def get_webhook(webhook_type: str, uid: str = Depends(verify_token)):
    return {}


@router.post("/v1/users/developer/webhook/{webhook_type}")
async def set_webhook(webhook_type: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/users/developer/webhook/{webhook_type}/disable")
async def disable_webhook(webhook_type: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/users/developer/webhook/{webhook_type}/enable")
async def enable_webhook(webhook_type: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


# -- Daily summaries detail ------------------------------------------------


@router.get("/v1/users/daily-summaries/{summary_id}")
async def get_daily_summary(summary_id: str, uid: str = Depends(verify_token)):
    return {}


@router.post("/v1/users/daily-summaries/{summary_id}")
async def regenerate_daily_summary(summary_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/users/daily-summary-settings/test")
async def test_daily_summary(uid: str = Depends(verify_token)):
    return {"status": "ok"}


# -- User profile / migration ---------------------------------------------


@router.get("/v1/users/profile")
async def get_user_profile(uid: str = Depends(verify_token)):
    return {"uid": uid, "data_protection_level": "standard"}


@router.get("/v1/users/migration/requests")
async def list_migration_requests(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/users/migration/requests")
async def create_migration_request(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.delete("/v1/users/migration/requests")
async def cancel_migration_request(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/users/migration/batch-requests")
async def batch_migration(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/users/migration/requests/data-protection-level/finalize")
async def finalize_migration(uid: str = Depends(verify_token)):
    return {"status": "ok"}


# -- Payments / Stripe / PayPal -------------------------------------------


@router.post("/v1/payments/checkout-session")
async def checkout_session(uid: str = Depends(verify_token)):
    return {}


@router.get("/v1/payments/subscription")
async def get_payment_sub(uid: str = Depends(verify_token)):
    return {"plan": "unlimited", "status": "active"}


@router.post("/v1/payments/upgrade-subscription")
async def upgrade_sub(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/payments/available-plans")
async def available_plans(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/payments/customer-portal")
async def customer_portal(uid: str = Depends(verify_token)):
    return {"url": ""}


@router.get("/v1/stripe/connect-accounts")
async def stripe_connect(uid: str = Depends(verify_token)):
    return {}


@router.get("/v1/stripe/onboarded")
async def stripe_onboarded(uid: str = Depends(verify_token)):
    return {"onboarded": False}


@router.get("/v1/stripe/supported-countries")
async def stripe_countries(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/paypal/payment-details")
async def paypal_details(uid: str = Depends(verify_token)):
    return {}


@router.post("/v1/paypal/payment-details")
async def save_paypal_details(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/payment-methods/status")
async def payment_methods_status(uid: str = Depends(verify_token)):
    return {}


@router.post("/v1/payment-methods/default")
async def set_default_payment(uid: str = Depends(verify_token)):
    return {"status": "ok"}


# -- Personas --------------------------------------------------------------


@router.get("/v1/personas")
async def list_personas(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/personas")
async def create_persona(request: Request, uid: str = Depends(verify_token)):
    return {"id": "", "status": "created"}


@router.put("/v1/personas/{persona_id}")
async def update_persona(persona_id: str, request: Request, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/personas/twitter/profile")
async def twitter_profile(handle: str = "", uid: str = Depends(verify_token)):
    return {}


@router.get("/v1/personas/twitter/verify-ownership")
async def verify_twitter(username: str = "", handle: str = "", uid: str = Depends(verify_token)):
    return {"verified": False}


@router.get("/v1/personas/twitter/initial-message")
async def twitter_initial(username: str = "", uid: str = Depends(verify_token)):
    return {"message": ""}


# -- Conversations CRUD (supplemental) ------------------------------------


@router.patch("/v1/conversations/{cid}/title")
async def patch_title(
    cid: str,
    title: str = "",
    uid: str = Depends(verify_token),
    chat_service: ChatService = Depends(get_chat_service),
):
    normalized = title.strip()
    if not normalized:
        return JSONResponse(status_code=400, content={"detail": "title is required"})
    ok = chat_service.update_chat_title(cid, normalized)
    if ok:
        return {"status": "ok", "id": cid, "title": normalized}
    return JSONResponse(status_code=404, content={"detail": "conversation not found"})


@router.get("/v1/conversations/{cid}/photos")
async def get_photos(cid: str, uid: str = Depends(verify_token)):
    return []


@router.get("/v1/conversations/{cid}/recording")
async def get_recording(cid: str, uid: str = Depends(verify_token)):
    return {"url": None}


@router.post("/v1/conversations/{cid}/segments/assign-bulk")
async def assign_segments(cid: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.patch("/v1/conversations/{cid}/visibility")
async def patch_visibility(cid: str, value: str = "", uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.patch("/v1/conversations/{cid}/starred")
async def patch_starred(cid: str, starred: bool = False, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/conversations/{cid}/reprocess")
async def reprocess(cid: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/conversations/{cid}/test-prompt")
async def test_prompt(cid: str, request: Request, uid: str = Depends(verify_token)):
    return {"result": ""}


@router.post("/v1/conversations/merge")
async def merge_conversations(request: Request, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.patch("/v1/conversations/{cid}/action-items/{idx}")
async def patch_action_item(cid: str, idx: int, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.post("/v1/conversations/{cid}/action-items")
async def create_action_item(cid: str, request: Request, uid: str = Depends(verify_token)):
    return {"status": "ok"}


# -- Announcements ---------------------------------------------------------


@router.get("/v1/announcements/changelogs")
async def changelogs(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/announcements/pending")
async def pending_announcements(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/announcements/{announcement_id}/dismiss")
async def dismiss_announcement(announcement_id: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


# -- Misc (import, MCP, dev, wrapped, sdcard, sync, joan) -----------------


@router.get("/v1/import/jobs")
async def list_import_jobs(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/import/jobs/{job_id}")
async def get_import_job(job_id: str, uid: str = Depends(verify_token)):
    return {}


@router.post("/v1/import/limitless")
async def import_limitless(uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/import/limitless/conversations")
async def limitless_conversations(uid: str = Depends(verify_token)):
    return []


@router.get("/v1/mcp/{path:path}")
async def mcp_get_stub(path: str, uid: str = Depends(verify_token)):
    return []


@router.post("/v1/mcp/{path:path}")
async def mcp_post_stub(path: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/dev/{path:path}")
async def dev_get_stub(path: str, uid: str = Depends(verify_token)):
    return []


@router.post("/v1/dev/{path:path}")
async def dev_post_stub(path: str, uid: str = Depends(verify_token)):
    return {"status": "ok"}


@router.get("/v1/wrapped/{path:path}")
async def wrapped_stub(path: str, uid: str = Depends(verify_token)):
    return {}


@router.post("/v1/wrapped/{path:path}")
async def wrapped_post_stub(path: str, uid: str = Depends(verify_token)):
    return {}


@router.post("/sdcard_memory")
async def sdcard_memory(uid: str = Depends(verify_token)):
    return []


@router.post("/v1/sync-local-files")
async def sync_local_files(uid: str = Depends(verify_token)):
    return {"synced": 0}


@router.get("/v1/joan/{conversation_id}/followup-question")
async def followup_question(conversation_id: str, uid: str = Depends(verify_token)):
    return {"result": ""}
