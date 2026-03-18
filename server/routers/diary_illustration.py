"""Diary illustration REST API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from services.diary_illustration_service import (
    ensure_diary_illustration_service,
    get_diary_illustration_service,
)
from util.time_utils import local_today_str

router = APIRouter(prefix="/api/diary-illustration", tags=["diary-illustration"])


def _require_service():
    service = get_diary_illustration_service()
    if service is None:
        service = ensure_diary_illustration_service()
    if service is None:
        raise HTTPException(
            status_code=503,
            detail="DiaryIllustrationService not initialized (LLM or Gemini config unavailable)",
        )
    return service


@router.post("/generate")
async def generate_illustration(date: str | None = None, async_mode: bool = False):
    service = _require_service()
    if async_mode:
        return await service.start_generation(date)
    result = await service.generate_for_date(date)
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result.get("error", "generation failed"))
    return result


@router.post("/generate-text")
async def generate_diary_text(date: str | None = None):
    """基于 L2 事件流生成日记文本（今日总结 + 下一步行动 + 鼓励）"""
    service = _require_service()
    result = await service.generate_diary_text(date)
    if not result["ok"]:
        raise HTTPException(status_code=500, detail=result.get("error", "generation failed"))
    return result


@router.get("/image/{date_str}/{index}")
async def get_illustration_image(date_str: str, index: int):
    service = _require_service()
    paths = service.get_illustration_paths(date_str)
    if index < 1 or index > len(paths):
        raise HTTPException(status_code=404, detail=f"Panel {index} not found for {date_str}")
    return FileResponse(str(paths[index - 1]), media_type="image/png")


@router.get("/images/{date_str}")
async def list_illustration_images(date_str: str):
    service = _require_service()
    paths = service.get_illustration_paths(date_str)
    return {
        "date": date_str,
        "count": len(paths),
        "urls": [f"/api/diary-illustration/image/{date_str}/{i + 1}" for i in range(len(paths))],
    }


@router.get("/status/{date_str}")
async def get_illustration_status(date_str: str):
    service = _require_service()
    return service.get_generation_status(date_str)


@router.get("/today")
async def get_today_status():
    today = local_today_str()
    service = _require_service()
    return service.get_generation_status(today)
