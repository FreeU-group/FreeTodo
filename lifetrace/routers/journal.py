"""日记相关路由"""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Path, Query

from lifetrace.schemas.journal import (
    JournalCreate,
    JournalListResponse,
    JournalResponse,
    JournalUpdate,
)
from lifetrace.storage import journal_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(tags=["journals"])


@router.post("/api/journals", response_model=JournalResponse, status_code=201)
async def create_journal(journal: JournalCreate):
    """创建日记"""
    try:
        journal_id = journal_mgr.create_journal(
            name=journal.name,
            user_notes=journal.user_notes,
            date=journal.date,
            content_format=journal.content_format,
            tag_ids=journal.tag_ids,
        )
        if not journal_id:
            raise HTTPException(status_code=500, detail="创建日记失败")

        created = journal_mgr.get_journal(journal_id)
        if not created:
            raise HTTPException(status_code=500, detail="获取创建的日记失败")

        logger.info(f"成功创建日记: {journal_id} - {journal.name}")
        return JournalResponse(**created)
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
):
    """获取日记列表"""
    try:
        journals = journal_mgr.list_journals(
            limit=limit,
            offset=offset,
            start_date=start_date,
            end_date=end_date,
        )
        total = journal_mgr.count_journals(
            start_date=start_date,
            end_date=end_date,
        )
        return JournalListResponse(
            total=total,
            journals=[JournalResponse(**j) for j in journals],
        )
    except Exception as e:
        logger.error(f"获取日记列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取日记列表失败: {str(e)}") from e


@router.get("/api/journals/{journal_id}", response_model=JournalResponse)
async def get_journal(journal_id: int = Path(..., description="日记ID")):
    """获取日记详情"""
    try:
        journal = journal_mgr.get_journal(journal_id)
        if not journal:
            raise HTTPException(status_code=404, detail="日记不存在")
        return JournalResponse(**journal)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取日记详情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取日记详情失败: {str(e)}") from e


@router.put("/api/journals/{journal_id}", response_model=JournalResponse)
async def update_journal(
    journal_id: int = Path(..., description="日记ID"),
    journal: JournalUpdate | None = None,
):
    """更新日记"""
    try:
        existing = journal_mgr.get_journal(journal_id)
        if not existing:
            raise HTTPException(status_code=404, detail="日记不存在")

        success = journal_mgr.update_journal(
            journal_id=journal_id,
            name=journal.name,
            user_notes=journal.user_notes,
            date=journal.date,
            content_format=journal.content_format,
            tag_ids=journal.tag_ids,
        )
        if not success:
            raise HTTPException(status_code=500, detail="更新日记失败")

        updated = journal_mgr.get_journal(journal_id)
        if not updated:
            raise HTTPException(status_code=500, detail="获取更新后的日记失败")

        logger.info(f"成功更新日记: {journal_id}")
        return JournalResponse(**updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新日记失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新日记失败: {str(e)}") from e


@router.delete("/api/journals/{journal_id}", status_code=204)
async def delete_journal(journal_id: int = Path(..., description="日记ID")):
    """删除日记"""
    try:
        existing = journal_mgr.get_journal(journal_id)
        if not existing:
            raise HTTPException(status_code=404, detail="日记不存在")

        success = journal_mgr.delete_journal(journal_id)
        if not success:
            raise HTTPException(status_code=500, detail="删除日记失败")

        logger.info(f"成功删除日记: {journal_id}")
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除日记失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除日记失败: {str(e)}") from e
