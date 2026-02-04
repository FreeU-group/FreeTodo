"""Audio transcription routes."""

import os
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel

from lifetrace.core.dependencies import get_audio_transcription_service
from lifetrace.jobs.audio_transcription import process_audio_record
from lifetrace.schemas.audio import AudioRecordResponse, AudioSegmentResponse
from lifetrace.storage import audio_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import get_audio_dir
from lifetrace.util.settings import settings
from lifetrace.util.utils import ensure_dir, get_file_hash

logger = get_logger()

router = APIRouter(prefix="/api/audio", tags=["audio"])


class AudioRecordUpdate(BaseModel):
    name: str | None = None


def _save_upload(upload: UploadFile) -> str:
    audio_dir = get_audio_dir()
    ensure_dir(str(audio_dir))

    ext = Path(upload.filename or "").suffix or ".wav"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    filename = f"audio_{timestamp}{ext}"
    file_path = audio_dir / filename

    with open(file_path, "wb") as out_file:
        shutil.copyfileobj(upload.file, out_file)

    return str(file_path)


@router.post("/transcriptions")
async def create_transcription(
    file: UploadFile = File(...),
    process: bool = Query(True),
    diarization: bool | None = Query(None),
    language: str | None = Query(None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="missing filename")

    try:
        file_path = _save_upload(file)
    finally:
        await file.close()

    file_size = os.path.getsize(file_path)
    file_hash = get_file_hash(file_path)

    service = get_audio_transcription_service()
    metadata = service.get_audio_metadata(file_path)

    diarization_enabled = (
        diarization
        if diarization is not None
        else settings.get("audio_transcription.diarization.enabled", False)
    )

    audio_id = audio_mgr.add_audio_record(
        file_path=file_path,
        file_hash=file_hash,
        file_size=file_size,
        duration=metadata.duration,
        sample_rate=metadata.sample_rate,
        channels=metadata.channels,
        language=language,
        name=None,
        diarization_enabled=diarization_enabled,
    )

    if not audio_id:
        raise HTTPException(status_code=500, detail="failed to create audio record")

    if not process:
        return {"audio_id": audio_id, "status": "pending"}

    result = process_audio_record(audio_id, language=language)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "transcription failed"))

    return {
        "audio_id": audio_id,
        "status": "done",
        "language": result.get("language"),
        "segments": result.get("segments", []),
    }


@router.post("/transcriptions/quick")
async def quick_transcription(
    file: UploadFile = File(...),
    diarization: bool | None = Query(None),
    language: str | None = Query(None),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="missing filename")

    try:
        file_path = _save_upload(file)
    finally:
        await file.close()

    try:
        service = get_audio_transcription_service()
        result = service.transcribe(
            file_path,
            language=language,
            diarization_enabled=diarization,
        )
        return {
            "status": "done",
            "language": result.get("language"),
            "segments": result.get("segments", []),
        }
    finally:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except OSError as exc:
            logger.warning(f"Failed to delete temp audio file {file_path}: {exc}")


@router.post("/records/{audio_id}/process")
async def process_record(audio_id: int, language: str | None = Query(None)):
    result = process_audio_record(audio_id, language=language)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "transcription failed"))
    return result


@router.get("/records", response_model=list[AudioRecordResponse])
async def list_records(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: str | None = Query(None),
):
    records = audio_mgr.list_audio_records(limit=limit, offset=offset, status=status)
    return [AudioRecordResponse(**record) for record in records]


@router.get("/records/{audio_id}", response_model=AudioRecordResponse)
async def get_record(audio_id: int):
    record = audio_mgr.get_audio_record(audio_id)
    if not record:
        raise HTTPException(status_code=404, detail="audio record not found")
    return AudioRecordResponse(**record)


@router.patch("/records/{audio_id}")
async def update_record(audio_id: int, payload: AudioRecordUpdate):
    updated = audio_mgr.update_audio_name(audio_id, payload.name)
    if not updated:
        raise HTTPException(status_code=404, detail="audio record not found")
    return {"success": True}


@router.delete("/records/{audio_id}")
async def delete_record(audio_id: int):
    file_path = audio_mgr.delete_audio_record(audio_id)
    if not file_path:
        raise HTTPException(status_code=404, detail="audio record not found")
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
    except OSError as exc:
        logger.warning(f"Failed to delete audio file {file_path}: {exc}")
    return {"success": True}


@router.get("/records/{audio_id}/segments", response_model=list[AudioSegmentResponse])
async def get_segments(audio_id: int):
    segments = audio_mgr.get_segments(audio_id)
    return [AudioSegmentResponse(**segment) for segment in segments]
