"""向量数据库相关的 Pydantic 模型"""

from typing import Any

from pydantic import BaseModel


class SemanticSearchRequest(BaseModel):
    query: str
    top_k: int = 10
    use_rerank: bool = True
    retrieve_k: int | None = None
    filters: dict[str, Any] | None = None


class SemanticSearchResult(BaseModel):
    text: str
    score: float
    metadata: dict[str, Any]
    ocr_result: dict[str, Any] | None = None
    screenshot: dict[str, Any] | None = None


class VectorStatsResponse(BaseModel):
    enabled: bool
    collection_name: str | None = None
    document_count: int | None = None
    error: str | None = None
