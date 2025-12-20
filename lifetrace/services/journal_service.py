"""Journal 业务逻辑层

处理 Journal 相关的业务逻辑，与数据访问层解耦。
"""

from datetime import datetime

from fastapi import HTTPException

from lifetrace.repositories.interfaces import IJournalRepository
from lifetrace.schemas.journal import (
    JournalCreate,
    JournalListResponse,
    JournalResponse,
    JournalUpdate,
)
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class JournalService:
    """Journal 业务逻辑层"""

    def __init__(self, repository: IJournalRepository):
        self.repository = repository

    def get_journal(self, journal_id: int) -> JournalResponse:
        """获取单个日记"""
        journal = self.repository.get_by_id(journal_id)
        if not journal:
            raise HTTPException(status_code=404, detail="日记不存在")
        return JournalResponse(**journal)

    def list_journals(
        self,
        limit: int,
        offset: int,
        start_date: datetime | None,
        end_date: datetime | None,
    ) -> JournalListResponse:
        """获取日记列表"""
        journals = self.repository.list_journals(limit, offset, start_date, end_date)
        total = self.repository.count(start_date, end_date)
        return JournalListResponse(
            total=total,
            journals=[JournalResponse(**j) for j in journals],
        )

    def create_journal(self, data: JournalCreate) -> JournalResponse:
        """创建日记"""
        journal_id = self.repository.create(
            name=data.name,
            user_notes=data.user_notes,
            date=data.date,
            content_format=data.content_format,
            tag_ids=data.tag_ids,
        )
        if not journal_id:
            raise HTTPException(status_code=500, detail="创建日记失败")

        logger.info(f"成功创建日记: {journal_id} - {data.name}")
        return self.get_journal(journal_id)

    def update_journal(self, journal_id: int, data: JournalUpdate) -> JournalResponse:
        """更新日记"""
        if not self.repository.get_by_id(journal_id):
            raise HTTPException(status_code=404, detail="日记不存在")

        if not self.repository.update(
            journal_id,
            name=data.name,
            user_notes=data.user_notes,
            date=data.date,
            content_format=data.content_format,
            tag_ids=data.tag_ids,
        ):
            raise HTTPException(status_code=500, detail="更新日记失败")

        logger.info(f"成功更新日记: {journal_id}")
        return self.get_journal(journal_id)

    def delete_journal(self, journal_id: int) -> None:
        """删除日记"""
        if not self.repository.get_by_id(journal_id):
            raise HTTPException(status_code=404, detail="日记不存在")
        if not self.repository.delete(journal_id):
            raise HTTPException(status_code=500, detail="删除日记失败")

        logger.info(f"成功删除日记: {journal_id}")
