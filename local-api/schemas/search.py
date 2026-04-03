"""搜索相关的 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel


class SearchRequest(BaseModel):
    query: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    app_name: str | None = None
    limit: int = 50
