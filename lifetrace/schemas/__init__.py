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
from lifetrace.schemas.todo_extraction import (
    ExtractedTodo,
    TodoExtractionRequest,
    TodoExtractionResponse,
    TodoTimeInfo,
)
from lifetrace.schemas.vector import (
    SemanticSearchRequest,
    SemanticSearchResult,
    VectorStatsResponse,
)
from lifetrace.schemas.vision import VisionChatRequest, VisionChatResponse

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
    # Vision
    "VisionChatRequest",
    "VisionChatResponse",
    # Todo Extraction
    "TodoExtractionRequest",
    "TodoExtractionResponse",
    "ExtractedTodo",
    "TodoTimeInfo",
]
