"""Shared audio processing session: speaker diarization + second-pass + perception.

Both ``/api/audio/transcribe`` and ``/v4/listen`` instantiate a
``SharedAudioProcessor`` so the capabilities (speaker recognition,
second-pass refinement, perception publishing) are identical regardless
of the audio entry point.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from perception.models import Modality, PerceptionEvent, SourceType
from util.logging_config import get_logger
from util.settings import settings
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from services.second_pass_asr import SecondPassASRProcessor, SecondPassResult
    from services.speaker_service import SpeakerMatch

logger = get_logger()

_auto_enrollment_done = False
_background_tasks: set = set()


class SharedAudioProcessor:
    """Unified audio processing shared by all audio WebSocket endpoints.

    Handles:
    - Speaker diarization (DiartDiarizer: CAM++ or Diart backend)
    - Second-pass offline ASR (DashScope Paraformer-v2)
    - Perception event publishing
    """

    def __init__(
        self,
        *,
        source_type: SourceType,
        session_id: str = "",
        endpoint: str = "",
        node_id: str = "local",
        uid: str = "",
        extra_metadata: dict[str, Any] | None = None,
    ) -> None:
        self.source_type = source_type
        self.session_id = session_id
        self.endpoint = endpoint
        self.node_id = node_id
        self.uid = uid
        self.extra_metadata = extra_metadata or {}

        self.speaker_diarizer: Any = None
        self.second_pass_processor: SecondPassASRProcessor | None = None

        self._init_speaker_diarizer()
        self._init_second_pass()
        self._maybe_auto_enroll()

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    def _init_speaker_diarizer(self) -> None:
        try:
            from services.diart_diarizer import DiartDiarizer  # noqa: PLC0415

            diarizer = DiartDiarizer()
            diarizer.start()
            if diarizer.enabled:
                self.speaker_diarizer = diarizer
                logger.info(f"[{self.endpoint}] 说话人识别已启用 (backend={diarizer.backend})")
            else:
                logger.debug(f"[{self.endpoint}] 说话人识别未启用 (DiartDiarizer 不可用)")
        except Exception as e:
            logger.debug(f"[{self.endpoint}] 说话人识别初始化失败: {e}")

    def _init_second_pass(self) -> None:
        try:
            from services.second_pass_asr import SecondPassASRProcessor  # noqa: PLC0415

            sp = SecondPassASRProcessor()
            if sp.enabled:
                self.second_pass_processor = sp
                logger.info(f"[{self.endpoint}] 二次处理 (second-pass) 已启用")
            else:
                logger.debug(f"[{self.endpoint}] 二次处理未启用 (audio.second_pass.enabled=false)")
        except Exception as e:
            logger.debug(f"[{self.endpoint}] 二次处理初始化失败: {e}")

    def _maybe_auto_enroll(self) -> None:
        """Auto-enroll voiceprint if audio exists but no speaker is marked as 'me'."""
        global _auto_enrollment_done  # noqa: PLW0603
        if _auto_enrollment_done:
            return
        _auto_enrollment_done = True

        try:
            import asyncio  # noqa: PLC0415

            loop = asyncio.get_running_loop()
            _task = loop.create_task(_auto_enroll_voiceprint_if_needed())  # prevent GC
            _background_tasks.add(_task)
            _task.add_done_callback(_background_tasks.discard)
        except RuntimeError:
            pass

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def speaker_enabled(self) -> bool:
        return self.speaker_diarizer is not None and self.speaker_diarizer.enabled

    @property
    def second_pass_enabled(self) -> bool:
        return self.second_pass_processor is not None

    @property
    def sp_debounce(self) -> int:
        return int(settings.get("audio.second_pass.debounce_seconds", 3) or 3)

    @property
    def sp_max_wait(self) -> int:
        return int(settings.get("audio.second_pass.interval_seconds", 30) or 30)

    # ------------------------------------------------------------------
    # Speaker diarization
    # ------------------------------------------------------------------

    def feed_audio(self, chunk: bytes) -> None:
        """Feed raw PCM audio to the speaker diarizer."""
        if self.speaker_diarizer is not None:
            self.speaker_diarizer.feed_audio(chunk)

    async def identify_current_speaker(self) -> SpeakerMatch | None:
        """Identify the current speaker from buffered audio."""
        if self.speaker_diarizer is None:
            return None
        try:
            return await self.speaker_diarizer.identify_current_speaker()
        except Exception as e:
            logger.debug(f"Speaker identification failed: {e}")
            return None

    @staticmethod
    def resolve_speaker(
        speaker_info: SpeakerMatch | None,
    ) -> tuple[str | None, int | None]:
        """Resolve ``SpeakerMatch`` to ``(display_tag, numeric_id)``.

        Returns ``("me", id)`` when ``is_me``, ``(name, id)`` for known
        speakers, and ``(None, None)`` when unidentified.
        """
        if speaker_info is None:
            return None, None
        sid = speaker_info.speaker_id
        if speaker_info.is_me:
            return "me", sid
        if speaker_info.speaker_name:
            return speaker_info.speaker_name, sid
        return f"SPEAKER_{sid:02d}", sid

    # ------------------------------------------------------------------
    # Perception publishing
    # ------------------------------------------------------------------

    async def publish_perception(
        self,
        text: str,
        *,
        is_realtime: bool = True,
        speaker_tag: str | None = None,
        speaker_id: int | None = None,
        priority: int | None = None,
    ) -> None:
        """Publish a transcription event to the perception stream."""
        from perception.manager import try_get_perception_manager  # noqa: PLC0415

        mgr = try_get_perception_manager()
        if mgr is None:
            return

        text = text.strip()
        if not text:
            return

        meta: dict[str, Any] = {
            "source_endpoint": self.endpoint,
            "is_realtime": is_realtime,
            **self.extra_metadata,
        }
        if self.session_id:
            meta["session_id"] = self.session_id
        if self.uid:
            meta["uid"] = self.uid
        if self.node_id:
            meta["node_id"] = self.node_id

        if is_realtime:
            meta["speaker"] = speaker_tag or "realtime"
        else:
            meta["speaker"] = speaker_tag or "unknown"
        if speaker_id is not None:
            meta["speaker_id"] = speaker_id

        if priority is None:
            priority = 2 if is_realtime else 3

        try:
            event = PerceptionEvent(
                timestamp=get_utc_now(),
                source=self.source_type,
                modality=Modality.AUDIO,
                content_text=text,
                metadata=meta,
                priority=priority,
            )
            await mgr.publish_event(event)
            tag = "realtime" if is_realtime else "refined"
            logger.info(f"[{self.endpoint}] Published {tag} perception: {text[:50]}")
        except Exception:
            logger.exception(f"[{self.endpoint}] Failed to publish perception event")

    # ------------------------------------------------------------------
    # Second-pass processing
    # ------------------------------------------------------------------

    async def run_second_pass(self, pcm_chunks: list[bytes]) -> SecondPassResult | None:
        """Run second-pass offline ASR on accumulated audio chunks."""
        if self.second_pass_processor is None or not pcm_chunks:
            return None
        try:
            result = await self.second_pass_processor.process(pcm_chunks, self.session_id)
            if result is None or not result.segments:
                logger.info(
                    f"[{self.endpoint}] Second-pass returned no segments "
                    "(audio may be too short or processing failed)"
                )
            return result
        except Exception:
            logger.exception(f"[{self.endpoint}] Second-pass processing error")
            return None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def stop(self) -> None:
        """Release resources (call on disconnect)."""
        if self.speaker_diarizer is not None and hasattr(self.speaker_diarizer, "stop"):
            self.speaker_diarizer.stop()


async def _auto_enroll_voiceprint_if_needed() -> None:
    """Check if voiceprint audio exists but no 'me' speaker, and auto-enroll."""
    try:
        from services.speaker_service import VoiceprintStore  # noqa: PLC0415

        store = VoiceprintStore()
        store._ensure_cache()
        for _sid, _sname, _emb, is_me in store._cache:
            if is_me:
                logger.debug("已有「我」的声纹，跳过自动注册")
                return
    except Exception:
        return

    from util.base_paths import get_user_data_dir  # noqa: PLC0415

    voiceprint_dir = get_user_data_dir() / "voiceprint"
    if not voiceprint_dir.exists():
        return
    files = sorted(
        voiceprint_dir.glob("voiceprint_*.*"), key=lambda p: p.stat().st_mtime, reverse=True
    )
    if not files:
        return

    latest = files[0]
    logger.info(f"发现声纹音频但没有「我」的向量，自动提取: {latest}")

    try:
        from services.voiceprint_enrollment import enroll_voiceprint  # noqa: PLC0415

        result = await enroll_voiceprint(latest)
        if result.get("enrolled"):
            logger.info(f"声纹自动注册成功: speaker_id={result.get('speaker_id')}")
        else:
            logger.warning(f"声纹自动注册失败: {result.get('reason')}")
    except Exception:
        logger.exception("声纹自动注册异常")
