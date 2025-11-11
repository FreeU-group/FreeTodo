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


class MultimodalSearchRequest(BaseModel):
    query: str
    top_k: int = 10
    text_weight: float | None = None
    image_weight: float | None = None
    filters: dict[str, Any] | None = None


class MultimodalSearchResult(BaseModel):
    text: str
    combined_score: float
    text_score: float
    image_score: float
    text_weight: float
    image_weight: float
    metadata: dict[str, Any]
    ocr_result: dict[str, Any] | None = None
    screenshot: dict[str, Any] | None = None


class VectorStatsResponse(BaseModel):
    enabled: bool
    collection_name: str | None = None
    document_count: int | None = None
    error: str | None = None


class MultimodalStatsResponse(BaseModel):
    enabled: bool
    multimodal_available: bool
    text_weight: float
    image_weight: float
    text_database: dict[str, Any]
    image_database: dict[str, Any]
    error: str | None = None
