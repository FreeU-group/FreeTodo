"""Audio storage manager."""

from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import AudioRecord, AudioSegment
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class AudioManager:
    """Audio record and segment manager."""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def add_audio_record(
        self,
        file_path: str,
        file_hash: str,
        file_size: int,
        duration: float | None = None,
        sample_rate: int | None = None,
        channels: int | None = None,
        language: str | None = None,
        name: str | None = None,
        diarization_enabled: bool = False,
    ) -> int | None:
        try:
            with self.db_base.get_session() as session:
                record = AudioRecord(
                    name=name,
                    file_path=file_path,
                    file_hash=file_hash,
                    file_size=file_size,
                    duration=duration,
                    sample_rate=sample_rate,
                    channels=channels,
                    language=language,
                    diarization_enabled=diarization_enabled,
                )
                session.add(record)
                session.flush()
                return record.id
        except SQLAlchemyError as e:
            logger.error(f"Failed to add audio record: {e}")
            return None

    def update_audio_status(
        self,
        audio_id: int,
        status: str,
        language: str | None = None,
        error_message: str | None = None,
    ) -> bool:
        try:
            with self.db_base.get_session() as session:
                record = session.query(AudioRecord).filter_by(id=audio_id).first()
                if not record:
                    return False
                if record.deleted_at is not None:
                    return False
                record.status = status
                if language:
                    record.language = language
                if error_message is not None:
                    record.error_message = error_message
                return True
        except SQLAlchemyError as e:
            logger.error(f"Failed to update audio status: {e}")
            return False

    def add_segments(self, audio_id: int, segments: list[dict[str, Any]]) -> int:
        created = 0
        try:
            with self.db_base.get_session() as session:
                for segment in segments:
                    item = AudioSegment(
                        audio_id=audio_id,
                        speaker=segment.get("speaker"),
                        start_time=segment["start_time"],
                        end_time=segment["end_time"],
                        text_content=segment.get("text_content"),
                        confidence=segment.get("confidence"),
                        language=segment.get("language"),
                    )
                    session.add(item)
                    created += 1
            return created
        except SQLAlchemyError as e:
            logger.error(f"Failed to add audio segments: {e}")
            return 0

    def update_audio_name(self, audio_id: int, name: str | None) -> bool:
        try:
            with self.db_base.get_session() as session:
                record = session.query(AudioRecord).filter_by(id=audio_id).first()
                if not record or record.deleted_at is not None:
                    return False
                record.name = name
                return True
        except SQLAlchemyError as e:
            logger.error(f"Failed to update audio name: {e}")
            return False

    def delete_audio_record(self, audio_id: int) -> str | None:
        try:
            with self.db_base.get_session() as session:
                record = session.query(AudioRecord).filter_by(id=audio_id).first()
                if not record or record.deleted_at is not None:
                    return None
                file_path = record.file_path
                session.query(AudioSegment).filter_by(audio_id=audio_id).delete()
                session.delete(record)
                return file_path
        except SQLAlchemyError as e:
            logger.error(f"Failed to delete audio record: {e}")
            return None

    def get_audio_record(self, audio_id: int) -> dict[str, Any] | None:
        try:
            with self.db_base.get_session() as session:
                record = session.query(AudioRecord).filter_by(id=audio_id).first()
                if not record:
                    return None
                if record.deleted_at is not None:
                    return None
                return {
                    "id": record.id,
                    "name": record.name,
                    "file_path": record.file_path,
                    "file_hash": record.file_hash,
                    "file_size": record.file_size,
                    "duration": record.duration,
                    "sample_rate": record.sample_rate,
                    "channels": record.channels,
                    "language": record.language,
                    "status": record.status,
                    "diarization_enabled": record.diarization_enabled,
                    "error_message": record.error_message,
                    "created_at": record.created_at,
                }
        except SQLAlchemyError as e:
            logger.error(f"Failed to get audio record: {e}")
            return None

    def list_audio_records(
        self,
        limit: int = 50,
        offset: int = 0,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        try:
            with self.db_base.get_session() as session:
                query = session.query(AudioRecord).filter(AudioRecord.deleted_at.is_(None))
                if status:
                    query = query.filter_by(status=status)
                records = query.order_by(AudioRecord.created_at.desc()).offset(offset).limit(limit).all()
                results = []
                for record in records:
                    results.append(
                        {
                            "id": record.id,
                            "name": record.name,
                            "file_path": record.file_path,
                            "file_hash": record.file_hash,
                            "file_size": record.file_size,
                            "duration": record.duration,
                            "sample_rate": record.sample_rate,
                            "channels": record.channels,
                            "language": record.language,
                            "status": record.status,
                            "diarization_enabled": record.diarization_enabled,
                            "error_message": record.error_message,
                            "created_at": record.created_at,
                        }
                    )
                return results
        except SQLAlchemyError as e:
            logger.error(f"Failed to list audio records: {e}")
            return []

    def get_segments(self, audio_id: int) -> list[dict[str, Any]]:
        try:
            with self.db_base.get_session() as session:
                segments = (
                    session.query(AudioSegment)
                    .filter_by(audio_id=audio_id)
                    .order_by(AudioSegment.start_time.asc())
                    .all()
                )
                results = []
                for segment in segments:
                    results.append(
                        {
                            "id": segment.id,
                            "audio_id": segment.audio_id,
                            "speaker": segment.speaker,
                            "start_time": segment.start_time,
                            "end_time": segment.end_time,
                            "text_content": segment.text_content,
                            "confidence": segment.confidence,
                            "language": segment.language,
                            "created_at": segment.created_at,
                        }
                    )
                return results
        except SQLAlchemyError as e:
            logger.error(f"Failed to get audio segments: {e}")
            return []
