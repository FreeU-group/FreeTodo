"""音频服务层

处理音频录制、存储、转录等业务逻辑。
"""

import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlmodel import select

from lifetrace.llm.llm_client import LLMClient
from lifetrace.services.audio_extraction_service import AudioExtractionService
from lifetrace.storage import get_session
from lifetrace.storage.models import AudioRecording, Transcription
from lifetrace.storage.sql_utils import col
from lifetrace.util.base_paths import get_user_data_dir
from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings
from lifetrace.util.time_utils import get_utc_now, to_local

logger = get_logger()


class AudioService:
    """音频服务"""

    def __init__(self):
        """初始化音频服务"""
        self.llm_client = LLMClient()
        self.extraction_service = AudioExtractionService(self.llm_client)
        self._background_tasks: set[asyncio.Task] = set()
        self.audio_base_dir = Path(get_user_data_dir()) / settings.audio.storage.audio_dir
        self.temp_audio_dir = Path(get_user_data_dir()) / settings.audio.storage.temp_audio_dir
        self.audio_base_dir.mkdir(parents=True, exist_ok=True)
        self.temp_audio_dir.mkdir(parents=True, exist_ok=True)

    def get_audio_dir_for_date(self, date: datetime) -> Path:
        """获取指定日期的音频存储目录（按年月日组织）

        Args:
            date: 日期

        Returns:
            音频目录路径（格式：audio/2025/01/17/）
        """
        local_date = to_local(date) or date
        year = local_date.strftime("%Y")
        month = local_date.strftime("%m")
        day = local_date.strftime("%d")
        audio_dir = self.audio_base_dir / year / month / day
        audio_dir.mkdir(parents=True, exist_ok=True)
        return audio_dir

    def generate_audio_file_path(self, date: datetime, filename: str | None = None) -> Path:
        """生成音频文件路径

        Args:
            date: 日期
            filename: 文件名（可选，如果不提供则自动生成）

        Returns:
            音频文件路径
        """
        local_date = to_local(date) or date
        audio_dir = self.get_audio_dir_for_date(local_date)
        if filename:
            return audio_dir / filename
        # 自动生成文件名：HHMMSS.wav
        timestamp = local_date.strftime("%H%M%S")
        return audio_dir / f"{timestamp}.wav"

    def create_recording(
        self,
        file_path: str,
        file_size: int,
        duration: float,
        is_24x7: bool = False,
    ) -> int:
        """创建录音记录

        Args:
            file_path: 音频文件路径
            file_size: 文件大小（字节）
            duration: 录音时长（秒）
            is_24x7: 是否为7x24小时录制

        Returns:
            创建的AudioRecording对象
        """
        # 注意：不要把 ORM 实例（AudioRecording）跨 session 返回到路由层；
        # SQLAlchemy 默认会在 commit 后过期属性，session 关闭后再访问会触发 refresh，
        # 从而报 “Instance ... is not bound to a Session”。
        # 这里只返回 recording_id，路由层需要对象时再用新的 session 查询。
        with get_session() as session:
            recording = AudioRecording(
                file_path=file_path,
                file_size=file_size,
                duration=duration,
                # 使用本地时间记录，避免前端显示存在时区偏移
                start_time=get_utc_now().astimezone(),
                status="recording",
                is_24x7=is_24x7,
                is_transcribed=False,
                is_extracted=False,
                is_summarized=False,
                is_full_audio=False,
                is_segment_audio=False,
                transcription_status="pending",
            )
            session.add(recording)
            session.commit()
            session.refresh(recording)
            if recording.id is None:
                raise ValueError("Recording must have an id after creation.")
            return int(recording.id)

    def complete_recording(self, recording_id: int) -> AudioRecording | None:
        """完成录音

        Args:
            recording_id: 录音ID

        Returns:
            更新后的AudioRecording对象，如果不存在则返回None
        """
        with get_session() as session:
            recording = session.get(AudioRecording, recording_id)
            if recording:
                recording.status = "completed"
                # 使用本地时间记录结束时间
                recording.end_time = get_utc_now().astimezone()
                recording.transcription_status = "processing"
                session.commit()
                session.refresh(recording)
            return recording

    def get_recordings_by_date(self, date: datetime) -> list[dict[str, Any]]:
        """根据日期获取录音列表

        Args:
            date: 日期

        Returns:
            录音列表（序列化后的字典列表，避免 Session 错误）
        """
        with get_session() as session:
            start_of_day = date.replace(hour=0, minute=0, second=0, microsecond=0)
            end_of_day = date.replace(hour=23, minute=59, second=59, microsecond=999999)

            statement = select(AudioRecording).where(
                col(AudioRecording.start_time) >= start_of_day,
                col(AudioRecording.start_time) <= end_of_day,
                col(AudioRecording.deleted_at).is_(None),
            )
            recordings = session.exec(statement).all()
            # 在 session 内序列化数据，避免 Session 错误
            result = []
            for rec in recordings:
                result.append(
                    {
                        "id": rec.id,
                        "file_path": rec.file_path,
                        "file_size": rec.file_size,
                        "duration": rec.duration,
                        "start_time": to_local(rec.start_time),
                        "end_time": to_local(rec.end_time) if rec.end_time else None,
                        "status": rec.status,
                        "is_24x7": rec.is_24x7,
                        "is_transcribed": rec.is_transcribed,
                        "is_extracted": rec.is_extracted,
                        "is_summarized": rec.is_summarized,
                        "is_full_audio": rec.is_full_audio,
                        "is_segment_audio": rec.is_segment_audio,
                        "transcription_status": rec.transcription_status,
                    }
                )
            return result

    def _check_has_extraction(self, transcription: Transcription) -> bool:
        """检查转录记录是否有提取结果

        Args:
            transcription: 转录记录

        Returns:
            是否有提取结果
        """
        return bool(
            transcription.extracted_todos
            and transcription.extracted_todos.strip()
            and transcription.extracted_todos.strip() != "[]"
        )

    def _check_text_changes(self, existing: Transcription, segmented_text: str) -> bool:
        """检查文本是否变化

        Args:
            existing: 现有转录记录
            segmented_text: 新的分段文本

        Returns:
            原文是否变化
        """
        return (existing.original_text or "").strip() != (segmented_text or "").strip()

    def _cleanup_duplicate_transcriptions(
        self, session, recording_id: int, existing: Transcription
    ) -> Transcription:
        """清理重复的转录记录

        Args:
            session: 数据库会话
            recording_id: 录音ID
            existing: 现有记录

        Returns:
            保留的记录
        """
        all_records = list(
            session.exec(
                select(Transcription)
                .where(col(Transcription.audio_recording_id) == recording_id)
                .order_by(col(Transcription.id).desc())
            ).all()
        )
        if len(all_records) > 1:
            logger.warning(
                f"[save_transcription] 录音 {recording_id} 发现 {len(all_records)} 条转录记录，"
                f"保留最新的（ID={all_records[0].id}），删除其他 {len(all_records) - 1} 条"
            )
            # 保留第一条（ID最大的），删除其他的
            for old_record in all_records[1:]:
                session.delete(old_record)
            existing = all_records[0]
            session.flush()
        return existing

    def _update_existing_transcription(
        self,
        session,
        existing: Transcription,
        recording_id: int,
        segmented_text: str,
        segment_timestamps_json: str | None = None,
    ) -> tuple[Transcription, bool]:
        """更新现有转录记录

        Args:
            session: 数据库会话
            existing: 现有记录
            recording_id: 录音ID
            segmented_text: 分段文本

        Returns:
            (transcription, should_auto_extract) 元组
        """
        text_changed = self._check_text_changes(existing, segmented_text)

        if not text_changed:
            logger.debug(f"[save_transcription] 录音 {recording_id} 文本未变化，跳过更新")
            return existing, False

        # 文本变化了，更新文本字段（保留提取结果）
        existing.original_text = segmented_text
        # 如果提供了新的时间戳，也更新
        if segment_timestamps_json is not None:
            existing.segment_timestamps = segment_timestamps_json

        has_extraction = self._check_has_extraction(existing)
        should_auto_extract = False

        if not has_extraction:
            existing.extraction_status = "pending"
            should_auto_extract = True
        else:
            logger.info(
                f"[save_transcription] 录音 {recording_id} 文本变化但已有提取结果，"
                f"保留提取结果，不触发自动提取"
            )

        session.add(existing)
        return existing, should_auto_extract

    def _prepare_transcription_data(
        self,
        original_text: str,
        segment_timestamps: list[float] | None,
        recording_id: int,
    ) -> tuple[str, str | None]:
        """准备转录数据（处理文本和时间戳）

        Returns:
            (display_text, segment_timestamps_json)
        """
        display_lines = [line.strip() for line in (original_text or "").split("\n") if line.strip()]
        display_text = "\n".join(display_lines)

        segment_timestamps_json = None
        if segment_timestamps is not None:
            # 严格一致：不做插值/均分/猜测。长度不一致就丢弃时间戳，前端回退到均匀估算。
            if len(segment_timestamps) == len(display_lines):
                segment_timestamps_json = json.dumps(segment_timestamps, ensure_ascii=False)
            else:
                logger.warning(
                    f"[save_transcription] segment_timestamps 行数不匹配，丢弃时间戳以避免错误跳转。"
                    f" recording_id={recording_id}, timestamps={len(segment_timestamps)}, lines={len(display_lines)}"
                )

        return display_text, segment_timestamps_json

    def _create_or_update_transcription(
        self,
        session: Any,
        recording_id: int,
        display_text: str,
        segment_timestamps_json: str | None,
    ) -> tuple[Transcription, bool]:
        """创建或更新转录记录

        Returns:
            (transcription, should_auto_extract)
        """
        # 检查是否已存在转录记录
        existing = session.exec(
            select(Transcription)
            .where(col(Transcription.audio_recording_id) == recording_id)
            .order_by(col(Transcription.id).desc())
        ).first()

        # 清理重复记录
        if existing:
            existing = self._cleanup_duplicate_transcriptions(session, recording_id, existing)

        # 更新或创建记录
        if existing:
            transcription, should_auto_extract = self._update_existing_transcription(
                session,
                existing,
                recording_id,
                display_text,
                segment_timestamps_json,
            )
        else:
            logger.info(f"[save_transcription] 录音 {recording_id} 创建新转录记录")
            transcription = Transcription(
                audio_recording_id=recording_id,
                original_text=display_text,
                extraction_status="pending",
                segment_timestamps=segment_timestamps_json,
            )
            session.add(transcription)
            should_auto_extract = True

        return transcription, should_auto_extract

    def _update_recording_status(self, session: Any, recording_id: int) -> None:
        """更新录音记录的转录状态"""
        recording = session.get(AudioRecording, recording_id)
        if recording:
            recording.transcription_status = "completed"
            session.commit()

    def _trigger_auto_extraction(self, transcription_id: int, display_text: str) -> None:
        """触发自动提取待办（异步执行，不阻塞）"""
        if display_text:
            task = asyncio.create_task(
                self._auto_extract_todos(transcription_id, display_text)
            )
            self._background_tasks.add(task)
            task.add_done_callback(self._background_tasks.discard)

    async def save_transcription(
        self,
        recording_id: int,
        original_text: str,
        segment_timestamps: list[float] | None = None,
    ) -> Transcription:
        """保存转录文本并触发待办提取。

        Args:
            recording_id: 录音ID
            original_text: 原始转录文本（前端展示用文本，final 一句一行）
            segment_timestamps: 每段文本的精确时间戳（秒），相对于录音开始时间

        Returns:
            创建的Transcription对象
        """
        # 准备数据
        display_text, segment_timestamps_json = self._prepare_transcription_data(
            original_text, segment_timestamps, recording_id
        )

        with get_session() as session:
            # 创建或更新转录记录
            transcription, should_auto_extract = self._create_or_update_transcription(
                session, recording_id, display_text, segment_timestamps_json
            )

            session.commit()
            session.refresh(transcription)

            # 更新录音记录的转录状态
            self._update_recording_status(session, recording_id)

            # 自动提取待办和日程（异步执行，不阻塞）
            if should_auto_extract:
                if transcription.id is None:
                    raise ValueError("Transcription must have an id before extraction.")
                self._trigger_auto_extraction(transcription.id, display_text)

            return transcription

    async def _auto_extract_todos(self, transcription_id: int, text: str) -> None:
        """自动提取待办（后台任务）

        Args:
            transcription_id: 转录ID
            text: 要提取的文本
        """
        try:
            segment_timestamps: list[float] | None = None
            with get_session() as session:
                transcription = session.get(Transcription, transcription_id)
                if transcription and transcription.segment_timestamps:
                    try:
                        parsed = json.loads(transcription.segment_timestamps)
                        if isinstance(parsed, list) and parsed and isinstance(parsed[0], (int, float)):
                            segment_timestamps = [float(item) for item in parsed]
                    except Exception:
                        segment_timestamps = None

            result = await self.extraction_service.extract_todos(
                text,
                segment_timestamps=segment_timestamps,
            )
            self.extraction_service.update_extraction(
                transcription_id=transcription_id,
                todos=result.get("todos", []),
            )
        except Exception as e:
            logger.error(f"自动提取待办失败: {e}")

    @property
    def extract_todos_and_schedules(self):
        """兼容旧接口：委托给 extraction_service"""
        return self.extraction_service.extract_todos_and_schedules

    @property
    def update_extraction(self):
        """委托给 extraction_service"""
        return self.extraction_service.update_extraction

    @property
    def link_extracted_items(self):
        """委托给 extraction_service"""
        return self.extraction_service.link_extracted_items

    def get_transcription(self, recording_id: int) -> dict[str, Any] | None:
        """获取转录文本（已序列化）

        注意：不要将 ORM 实例返回到路由层，避免 Session 关闭后访问属性时报
        “Instance <Transcription ...> is not bound to a Session”。

        Args:
            recording_id: 录音ID

        Returns:
            包含转录字段的字典，如果不存在则返回None
        """
        with get_session() as session:
            # 查询转录记录（一个 recording_id 只应该有一条）
            statement = (
                select(Transcription)
                .where(col(Transcription.audio_recording_id) == recording_id)
                .order_by(col(Transcription.id).desc())
            )
            transcription = session.exec(statement).first()
            if not transcription:
                return None

            return {
                "id": transcription.id,
                "audio_recording_id": transcription.audio_recording_id,
                "original_text": transcription.original_text,
                "extracted_todos": transcription.extracted_todos,
                "extracted_schedules": transcription.extracted_schedules,
                "extraction_status": transcription.extraction_status,
                "segment_timestamps": transcription.segment_timestamps,
                "created_at": transcription.created_at,
                "updated_at": transcription.updated_at,
            }
