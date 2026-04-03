"""截图相关的 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel


class ScreenshotResponse(BaseModel):
    id: int
    file_path: str
    app_name: str | None
    window_title: str | None
    created_at: datetime
    text_content: str | None
    width: int
    height: int
    file_deleted: bool = False  # 文件是否已被清理
