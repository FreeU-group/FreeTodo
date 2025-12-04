"""Pydantic 模型定义"""

from lifetrace.schemas.chat import (
    ChatMessage,
    ChatMessageWithContext,
    ChatResponse,
    NewChatRequest,
    NewChatResponse,
)
from lifetrace.schemas.event import EventDetailResponse, EventResponse
from lifetrace.schemas.screenshot import ScreenshotResponse
from lifetrace.schemas.search import SearchRequest
from lifetrace.schemas.stats import (
    StatisticsResponse,
    TimeAllocationResponse,
)
from lifetrace.schemas.system import ProcessInfo, SystemResourcesResponse
from lifetrace.schemas.vector import (
    SemanticSearchRequest,
    SemanticSearchResult,
    VectorStatsResponse,
)

__all__ = [
    # Chat
    "ChatMessage",
    "ChatMessageWithContext",
    "ChatResponse",
    "NewChatRequest",
    "NewChatResponse",
    # Event
    "EventResponse",
    "EventDetailResponse",
    # Screenshot
    "ScreenshotResponse",
    # Search
    "SearchRequest",
    # Stats
    "StatisticsResponse",
    "TimeAllocationResponse",
    # System
    "ProcessInfo",
    "SystemResourcesResponse",
    # Vector
    "SemanticSearchRequest",
    "SemanticSearchResult",
    "VectorStatsResponse",
]
