"""配置相关的 Pydantic 模型"""

from typing import Any

from pydantic import BaseModel


class ConfigResponse(BaseModel):
    base_dir: str
    screenshots_dir: str
    database_path: str
    server: dict[str, Any]
    record: dict[str, Any]
    ocr: dict[str, Any]
    storage: dict[str, Any]
