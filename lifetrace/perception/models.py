from __future__ import annotations

from datetime import datetime  # noqa: TC003
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    MIC_PC = "mic_pc"
    MIC_HARDWARE = "mic_hardware"
    OCR_SCREEN = "ocr_screen"
    OCR_PROACTIVE = "ocr_proactive"
    USER_INPUT = "user_input"
    AI_OUTPUT = "ai_output"
    GPS_MOBILE = "gps_mobile"


class Modality(str, Enum):
    AUDIO = "audio"
    IMAGE = "image"
    TEXT = "text"
    LOCATION = "location"


class PerceptionEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    sequence_id: int = 0
    timestamp: datetime
    ingested_at: datetime | None = None
    source: SourceType
    modality: Modality
    content_text: str
    content_raw: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)
    priority: int = 0
