"""Memory REST API — read, search, compress, link and profile operations."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from memory.manager import try_get_memory_manager
from util.time_utils import local_today_str

router = APIRouter(prefix="/api/memory", tags=["memory"])


def _require_manager():
    mgr = try_get_memory_manager()
    if mgr is None:
        raise HTTPException(status_code=503, detail="Memory module not initialized")
    return mgr


@router.get("/today")
async def get_today_memory():
    mgr = _require_manager()
    today = local_today_str()
    content = mgr.reader.read_by_date(today)
    return {"date": today, "content": content}


@router.get("/date/{date_str}")
async def get_memory_by_date(date_str: str):
    mgr = _require_manager()
    content = mgr.reader.read_by_date(date_str)
    return {"date": date_str, "content": content}


@router.get("/raw/{date_str}")
async def get_raw_memory(date_str: str):
    mgr = _require_manager()
    content = mgr.reader.get_raw_content(date_str)
    return {"date": date_str, "content": content}


@router.get("/search")
async def search_memory(
    keyword: str = Query(..., min_length=1),
    days: int = Query(default=7, ge=1, le=365),
    max_results: int = Query(default=10, ge=1, le=50),
):
    mgr = _require_manager()
    results = mgr.reader.search_keyword(keyword, days=days, max_results=max_results)
    return {
        "keyword": keyword,
        "days": days,
        "count": len(results),
        "results": [r.model_dump() for r in results],
    }


@router.get("/dates")
async def list_memory_dates():
    mgr = _require_manager()
    dates = mgr.reader.list_available_dates()
    return {"count": len(dates), "dates": dates}


@router.get("/status")
async def get_memory_status():
    mgr = _require_manager()
    return mgr.get_status()


# ------------------------------------------------------------------
# L2 Compression
# ------------------------------------------------------------------


@router.post("/compress/{date_str}")
async def trigger_compress(date_str: str):
    mgr = _require_manager()
    if mgr.compressor is None:
        raise HTTPException(status_code=503, detail="Compressor not available (LLM not configured)")
    path = await mgr.compressor.compress_day(date_str)
    return {
        "date": date_str,
        "compressed": path is not None,
        "path": str(path) if path else None,
    }


# ------------------------------------------------------------------
# L1 Dedup stats
# ------------------------------------------------------------------


@router.get("/dedup-stats")
async def get_dedup_stats():
    mgr = _require_manager()
    if mgr.deduper is None:
        raise HTTPException(status_code=503, detail="Deduper not available (LLM not configured)")
    return mgr.deduper.get_stats()


# ------------------------------------------------------------------
# L3 Task linking
# ------------------------------------------------------------------


@router.post("/link/{date_str}")
async def trigger_task_link(date_str: str):
    """Run L3 task linking for a given date (requires L2 events file to exist)."""
    mgr = _require_manager()
    if mgr.task_linker is None:
        raise HTTPException(status_code=503, detail="TaskLinker not available (LLM not configured)")
    linked = await mgr.task_linker.link_day(date_str)
    return {"date": date_str, "linked": linked}


@router.post("/compress-and-link/{date_str}")
async def trigger_compress_and_link(date_str: str):
    """Run L2 compression then L3 task linking in sequence."""
    mgr = _require_manager()
    result = await mgr.compress_and_link(date_str)
    return result


@router.get("/task-linker-stats")
async def get_task_linker_stats():
    mgr = _require_manager()
    if mgr.task_linker is None:
        raise HTTPException(status_code=503, detail="TaskLinker not available")
    return mgr.task_linker.get_stats()


# ------------------------------------------------------------------
# L4 Profile
# ------------------------------------------------------------------


@router.get("/profile")
async def get_profile():
    """Read the current user profile."""
    mgr = _require_manager()
    content = mgr.reader.get_user_profile()
    return {"content": content}


@router.post("/profile/update")
async def trigger_profile_update():
    """Manually trigger an L4 profile update cycle."""
    mgr = _require_manager()
    if mgr.profile_builder is None:
        raise HTTPException(
            status_code=503, detail="ProfileBuilder not available (LLM not configured)"
        )
    updated = await mgr.profile_builder.update()
    return {"updated": updated, "stats": mgr.profile_builder.get_stats()}


@router.post("/profile/consolidate")
async def trigger_profile_consolidate():
    """Force-consolidate the user profile to reduce bloat."""
    mgr = _require_manager()
    if mgr.profile_builder is None:
        raise HTTPException(
            status_code=503, detail="ProfileBuilder not available (LLM not configured)"
        )
    changed = await mgr.profile_builder.consolidate()
    return {
        "consolidated": changed,
        "stats": mgr.profile_builder.get_stats(),
        "content": mgr.reader.get_user_profile(),
    }


@router.get("/profile-stats")
async def get_profile_stats():
    mgr = _require_manager()
    if mgr.profile_builder is None:
        raise HTTPException(status_code=503, detail="ProfileBuilder not available")
    return mgr.profile_builder.get_stats()
