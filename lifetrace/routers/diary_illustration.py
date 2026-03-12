"""日记插画 REST API"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from lifetrace.services.diary_illustration_service import get_diary_illustration_service
from lifetrace.util.time_utils import local_today_str

router = APIRouter(prefix="/api/diary-illustration", tags=["diary-illustration"])


def _require_service():
    svc = get_diary_illustration_service()
    if svc is None:
        raise HTTPException(
            status_code=503, detail="DiaryIllustrationService not initialized (LLM not configured)"
        )
    return svc


@router.post("/generate")
async def generate_illustration(date: str | None = None):
    """触发生成指定日期的插画（不指定则用今天）"""
    svc = _require_service()
    result = await svc.generate_for_date(date)
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result.get("error", "generation failed"))
    return result


@router.get("/image/{date_str}")
async def get_illustration_image(date_str: str):
    """返回指定日期的插画文件"""
    svc = _require_service()
    path = svc.get_illustration_path(date_str)
    if path is None:
        raise HTTPException(status_code=404, detail=f"No illustration found for {date_str}")
    return FileResponse(str(path), media_type="image/png")


@router.get("/status/{date_str}")
async def get_illustration_status(date_str: str):
    """检查指定日期是否已有插画"""
    svc = _require_service()
    path = svc.get_illustration_path(date_str)
    return {"date": date_str, "exists": path is not None, "path": str(path) if path else None}


@router.get("/today")
async def get_today_status():
    """今天的插画状态"""
    today = local_today_str()
    svc = _require_service()
    path = svc.get_illustration_path(today)
    return {"date": today, "exists": path is not None, "path": str(path) if path else None}
