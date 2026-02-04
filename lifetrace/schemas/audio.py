"""Audio related schemas."""

from datetime import datetime

from pydantic import BaseModel


class AudioRecordResponse(BaseModel):
    id: int
    name: str | None
    file_path: str
    file_size: int
    duration: float | None
    sample_rate: int | None
    channels: int | None
    language: str | None
    status: str
    diarization_enabled: bool
    error_message: str | None
    created_at: datetime


class AudioSegmentResponse(BaseModel):
    id: int
    audio_id: int
    speaker: str | None
    start_time: float
    end_time: float
    text_content: str | None
    confidence: float | None
    language: str | None
    created_at: datetime
