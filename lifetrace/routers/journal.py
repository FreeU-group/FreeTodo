"""日记相关路由"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from lifetrace.core.dependencies import get_journal_service
from lifetrace.schemas.journal import (
    JournalCreate,
    JournalListResponse,
    JournalResponse,
    JournalUpdate,
)
from lifetrace.services.journal_service import JournalService
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(tags=["journals"])


@router.post("/api/journals", response_model=JournalResponse, status_code=201)
async def create_journal(
    journal: JournalCreate,
    service: JournalService = Depends(get_journal_service),
):
    """创建日记"""
    try:
        return service.create_journal(journal)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建日记失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"创建日记失败: {str(e)}") from e


@router.get("/api/journals", response_model=JournalListResponse)
async def list_journals(
    limit: int = Query(100, ge=1, le=1000, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    start_date: datetime | None = Query(None, description="开始日期筛选"),
    end_date: datetime | None = Query(None, description="结束日期筛选"),
    service: JournalService = Depends(get_journal_service),
):
    """获取日记列表"""
    try:
        return service.list_journals(limit, offset, start_date, end_date)
    except Exception as e:
        logger.error(f"获取日记列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取日记列表失败: {str(e)}") from e


@router.get("/api/journals/{journal_id}", response_model=JournalResponse)
async def get_journal(
    journal_id: int = Path(..., description="日记ID"),
    service: JournalService = Depends(get_journal_service),
):
    """获取日记详情"""
    try:
        return service.get_journal(journal_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取日记详情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取日记详情失败: {str(e)}") from e


@router.put("/api/journals/{journal_id}", response_model=JournalResponse)
async def update_journal(
    journal_id: int = Path(..., description="日记ID"),
    journal: JournalUpdate | None = None,
    service: JournalService = Depends(get_journal_service),
):
    """更新日记"""
    try:
        return service.update_journal(journal_id, journal)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新日记失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新日记失败: {str(e)}") from e


@router.delete("/api/journals/{journal_id}", status_code=204)
async def delete_journal(
    journal_id: int = Path(..., description="日记ID"),
    service: JournalService = Depends(get_journal_service),
):
    """删除日记"""
    try:
        service.delete_journal(journal_id)
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除日记失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除日记失败: {str(e)}") from e
