"""Audio transcription job helpers."""

from lifetrace.core.dependencies import get_audio_transcription_service
from lifetrace.storage import audio_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()


def process_audio_record(audio_id: int, language: str | None = None) -> dict:
    record = audio_mgr.get_audio_record(audio_id)
    if not record:
        return {"success": False, "error": "audio record not found"}

    if record["status"] == "processing":
        return {"success": False, "error": "audio record already processing"}

    audio_mgr.update_audio_status(audio_id, "processing")

    try:
        service = get_audio_transcription_service()
        result = service.transcribe(
            record["file_path"],
            language=language or record.get("language"),
            diarization_enabled=record.get("diarization_enabled", False),
        )
        segments = result.get("segments", [])
        if segments:
            audio_mgr.add_segments(audio_id, segments)
        audio_mgr.update_audio_status(audio_id, "done", language=result.get("language"))
        return {"success": True, "segments": segments, "language": result.get("language")}
    except Exception as e:
        logger.error(f"Audio transcription failed: {e}")
        audio_mgr.update_audio_status(audio_id, "failed", error_message=str(e))
        return {"success": False, "error": str(e)}


def execute_audio_transcription_task() -> int:
    pending = audio_mgr.list_audio_records(status="pending", limit=50, offset=0)
    processed = 0
    for record in pending:
        result = process_audio_record(record["id"])
        if result.get("success"):
            processed += 1
    return processed
