"""Real-time speaker diarization with automatic backend selection.

Preferred backend (when enabled): **diart/pyannote** – overlap-aware.
Default backend:                  **CAM++ (FunASR)** – buffered embedding + VoiceprintStore.

The caller only sees a unified interface: ``feed_audio`` / ``identify_current_speaker``.
"""

from __future__ import annotations

import collections
import contextlib
import queue
import re
import threading
import time
import traceback
from typing import Any

import numpy as np

from services.speaker_service import SpeakerMatch
from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2  # 16-bit PCM
_TIMELINE_MAX = 1000
_TIMELINE_TRIM = 500

# ---------------------------------------------------------------------------
# FSMN-VAD singleton (shared across sessions, each session keeps its own cache)
# ---------------------------------------------------------------------------
_vad_model_lock = threading.Lock()
_vad_model_singleton: Any = None
_vad_model_attempted = False


def _load_vad_model() -> Any | None:
    """Load the FSMN-VAD model (lazy singleton, thread-safe)."""
    global _vad_model_singleton, _vad_model_attempted  # noqa: PLW0603
    if _vad_model_singleton is not None:
        return _vad_model_singleton
    if _vad_model_attempted:
        return None
    with _vad_model_lock:
        if _vad_model_singleton is not None:
            return _vad_model_singleton
        if _vad_model_attempted:
            return None
        _vad_model_attempted = True
        try:
            from funasr import AutoModel as FunASRAutoModel  # noqa: PLC0415

            logger.info("正在加载 FSMN-VAD 语音活动检测模型 ...")
            _vad_model_singleton = FunASRAutoModel(
                model="fsmn-vad",
                disable_update=True,
                disable_pbar=True,
                disable_log=True,
                log_level="ERROR",
            )
            logger.info("FSMN-VAD 模型加载完成")
        except Exception as e:
            logger.warning(f"FSMN-VAD 加载失败，将使用原始缓冲: {e}")
        return _vad_model_singleton


class DiartDiarizer:
    """Real-time speaker diarizer – diart (opt-in) with CAM++ fallback.

    Usage::

        diarizer = DiartDiarizer()
        diarizer.start()           # loads model(s), may spawn bg thread
        diarizer.feed_audio(pcm)   # from WebSocket receive loop
        match = await diarizer.identify_current_speaker()  # async
        diarizer.stop()            # on disconnect
    """

    def __init__(self) -> None:
        cfg = settings.get("audio.speaker", {}) or {}
        self._enabled = bool(cfg.get("enabled", False))

        # --- Diart config ---
        dcfg: dict[str, Any] = cfg.get("diart", {}) or {}
        self._diart_enabled = bool(dcfg.get("enabled", False))
        self._step = float(dcfg.get("step", 0.5))
        self._latency = float(dcfg.get("latency", 0.5))
        self._tau_active = float(dcfg.get("tau_active", 0.5))
        self._rho_update = float(dcfg.get("rho_update", 0.3))
        self._delta_new = float(dcfg.get("delta_new", 1.0))
        self._seg_model = str(dcfg.get("segmentation_model", "pyannote/segmentation-3.0"))
        self._emb_model = str(dcfg.get("embedding_model", "pyannote/embedding"))

        # --- CAM++ fallback config ---
        self._min_audio_duration = float(cfg.get("min_audio_duration", 2.0))
        self._buffer_duration = float(cfg.get("buffer_duration", 5.0))

        # --- Runtime state ---
        self._backend: str = "none"  # "diart" | "campp" | "none"
        self._available = False

        # Diart state
        self._audio_queue: queue.Queue[bytes | None] = queue.Queue()
        self._timeline_lock = threading.Lock()
        self._current_speaker: str | None = None
        self._speaker_timeline: list[tuple[str, float, float]] = []
        self._thread: threading.Thread | None = None
        self._pipeline: Any = None
        self._source: Any = None

        # CAM++ state
        self._campp_client: Any = None
        self._voiceprint_store: Any = None
        self._audio_buffer = bytearray()
        self._buffer_lock = threading.Lock()
        self._last_match: SpeakerMatch | None = None
        # Pending unknown embeddings: (embedding, duration, monotonic_timestamp)
        # A new speaker is created when a later embedding matches one in the pool.
        # Entries expire after _pending_expiry_sec without being re-confirmed.
        self._pending_embeddings: list[tuple[np.ndarray, float, float]] = []
        self._max_pending: int = 10
        self._pending_expiry_sec: float = 120.0

        # VAD-based speech segmentation (active when backend == "campp" and VAD loaded)
        self._vad_enabled = bool(cfg.get("vad_enabled", True))
        self._vad_model: Any = None
        self._vad_cache: dict = {}
        self._vad_chunk_ms: int = 200
        self._vad_accumulator = bytearray()
        self._in_speech: bool = False
        self._current_speech_buf = bytearray()
        self._completed_segments: collections.deque[bytes] = collections.deque(maxlen=5)

    @property
    def enabled(self) -> bool:
        return self._enabled and self._available

    @property
    def backend(self) -> str:
        return self._backend

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self) -> None:
        """Load models: try diart first (if enabled), fall back to CAM++."""
        if not self._enabled:
            return

        if self._diart_enabled and self._start_diart():
            return

        self._start_campp()

    def stop(self) -> None:
        if self._backend == "diart":
            self._stop_diart()
        elif self._backend == "campp":
            self._vad_cache = {}
            self._vad_accumulator = bytearray()
            self._in_speech = False
            self._current_speech_buf = bytearray()
            self._completed_segments.clear()
            self._audio_buffer.clear()
            self._pending_embeddings.clear()
            logger.debug("CAM++ 说话人识别已停止")
        self._backend = "none"
        self._available = False

    # ------------------------------------------------------------------
    # Unified feed / identify API
    # ------------------------------------------------------------------

    def feed_audio(self, pcm_chunk: bytes) -> None:
        """Feed raw 16-bit PCM audio from the WebSocket receive loop."""
        if not self._available:
            return

        if self._backend == "diart":
            with contextlib.suppress(queue.Full):
                self._audio_queue.put_nowait(pcm_chunk)
        elif self._backend == "campp":
            with self._buffer_lock:
                # Raw rolling buffer (fallback when VAD is unavailable)
                self._audio_buffer.extend(pcm_chunk)
                max_bytes = int(self._buffer_duration * SAMPLE_RATE * BYTES_PER_SAMPLE)
                if len(self._audio_buffer) > max_bytes:
                    self._audio_buffer = self._audio_buffer[-max_bytes:]

                # VAD: accumulate into fixed-size chunks and process
                if self._vad_model is not None:
                    self._vad_accumulator.extend(pcm_chunk)
                    vad_chunk_bytes = self._vad_chunk_ms * SAMPLE_RATE * BYTES_PER_SAMPLE // 1000
                    while len(self._vad_accumulator) >= vad_chunk_bytes:
                        chunk = bytes(self._vad_accumulator[:vad_chunk_bytes])
                        self._vad_accumulator = self._vad_accumulator[vad_chunk_bytes:]
                        self._process_vad_chunk(chunk)

    def get_current_speaker(self) -> SpeakerMatch | None:
        """Sync speaker lookup."""
        if self._backend == "diart":
            return self._get_diart_speaker()
        if self._backend == "campp":
            return self._get_campp_speaker()
        return None

    async def identify_current_speaker(self) -> SpeakerMatch | None:
        """Async speaker lookup (matches old API signature)."""
        if self._backend == "campp":
            return await self._identify_campp_async()
        return self.get_current_speaker()

    # ==================================================================
    # Diart backend
    # ==================================================================

    def _start_diart(self) -> bool:
        try:
            from diart import SpeakerDiarization, SpeakerDiarizationConfig  # noqa: PLC0415
            from diart.models import EmbeddingModel, SegmentationModel  # noqa: PLC0415

            segmentation = SegmentationModel.from_pretrained(self._seg_model)
            embedding = EmbeddingModel.from_pretrained(self._emb_model)

            config = SpeakerDiarizationConfig(
                segmentation=segmentation,
                embedding=embedding,
                step=self._step,
                latency=self._latency,
                tau_active=self._tau_active,
                rho_update=self._rho_update,
                delta_new=self._delta_new,
            )
            self._pipeline = SpeakerDiarization(config)
            self._source = _build_queue_audio_source(self._audio_queue, sample_rate=SAMPLE_RATE)
            self._thread = threading.Thread(target=self._run_diart, daemon=True, name="diart")
            self._thread.start()

            self._backend = "diart"
            self._available = True
            logger.info(
                f"Diart 说话人分离已启动 (step={self._step}s, latency={self._latency}s, "
                f"seg={self._seg_model}, emb={self._emb_model})"
            )
            return True
        except Exception as e:
            tb = traceback.format_exc()
            logger.info(f"Diart 不可用，回退到 CAM++: {type(e).__name__}: {e}\n{tb}")
            return False

    def _stop_diart(self) -> None:
        if self._source is not None:
            self._audio_queue.put(None)
            self._source.close()
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=5.0)
        logger.debug("Diart 说话人分离已停止")

    def _run_diart(self) -> None:
        try:
            from diart.inference import StreamingInference  # noqa: PLC0415

            if self._pipeline is None or self._source is None:
                raise RuntimeError("Diart pipeline/source not initialized")
            inference = StreamingInference(
                self._pipeline, self._source, batch_size=1, do_plot=False
            )
            inference.attach_hooks(self._on_diarization_result)
            inference()
        except Exception as e:
            logger.error(f"Diart 管道异常退出: {e}", exc_info=True)

    def _on_diarization_result(self, result: tuple) -> None:
        annotation, _audio = result
        if annotation is None:
            return
        if not annotation.get_labels():
            return
        with self._timeline_lock:
            for segment, _track, label in annotation.itertracks(yield_label=True):
                self._speaker_timeline.append((str(label), segment.start, segment.end))
                self._current_speaker = str(label)
            if len(self._speaker_timeline) > _TIMELINE_MAX:
                self._speaker_timeline = self._speaker_timeline[-_TIMELINE_TRIM:]

    def _get_diart_speaker(self) -> SpeakerMatch | None:
        with self._timeline_lock:
            if self._current_speaker is None:
                return None
            speaker_id, speaker_name = _parse_diart_label(self._current_speaker)
            return SpeakerMatch(speaker_id=speaker_id, speaker_name=speaker_name, confidence=1.0)

    # ==================================================================
    # CAM++ fallback backend  (with optional FSMN-VAD segmentation)
    # ==================================================================

    def _start_campp(self) -> None:
        try:
            from services.speaker_embedding_client import (  # noqa: PLC0415
                SpeakerEmbeddingClient,
            )
            from services.speaker_service import VoiceprintStore  # noqa: PLC0415

            client = SpeakerEmbeddingClient()
            if not client.available:
                logger.warning("说话人识别不可用: funasr 未安装 (pip install funasr modelscope)")
                self._available = False
                return

            self._campp_client = client
            self._voiceprint_store = VoiceprintStore()

            # Try loading FSMN-VAD for speech-turn segmentation
            if self._vad_enabled:
                self._vad_model = _load_vad_model()
                self._vad_cache = {}

            self._backend = "campp"
            self._available = True
            vad_tag = "VAD 切分已启用" if self._vad_model else "无 VAD"
            logger.info(f"CAM++ 说话人识别已启动 (FunASR + VoiceprintStore, {vad_tag})")
        except Exception as e:
            logger.warning(f"CAM++ 说话人识别初始化失败: {e}")
            self._available = False

    # ---- VAD chunk processing (called inside _buffer_lock) ----

    def _process_vad_chunk(self, chunk_bytes: bytes) -> None:
        """Process one VAD-sized chunk through FSMN-VAD.

        Must be called with ``_buffer_lock`` held.
        """
        samples = np.frombuffer(chunk_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        try:
            result = self._vad_model.generate(
                input=samples,
                cache=self._vad_cache,
                is_final=False,
                chunk_size=self._vad_chunk_ms,
            )
            segments = result[0].get("value", []) if result else []
        except Exception as e:
            logger.debug(f"VAD 处理异常: {e}")
            if self._in_speech:
                self._current_speech_buf.extend(chunk_bytes)
            return

        started, ended = _classify_vad_events(segments)
        if started and not self._in_speech:
            self._in_speech = True
            self._current_speech_buf = bytearray()

        if self._in_speech:
            self._current_speech_buf.extend(chunk_bytes)

        if ended and self._in_speech:
            self._finalize_speech_segment()

    def _finalize_speech_segment(self) -> None:
        """Save the current speech buffer as a completed segment.

        Must be called with ``_buffer_lock`` held.
        """
        self._in_speech = False
        seg_duration = len(self._current_speech_buf) / (SAMPLE_RATE * BYTES_PER_SAMPLE)
        if seg_duration >= self._min_audio_duration:
            self._completed_segments.append(bytes(self._current_speech_buf))
            logger.debug(f"VAD: 语音段完成 ({seg_duration:.1f}s)")
        else:
            logger.debug(
                f"VAD: 语音段太短 ({seg_duration:.1f}s < {self._min_audio_duration}s), 丢弃"
            )
        self._current_speech_buf = bytearray()

    # ---- pick the best audio segment for embedding extraction ----

    def _pick_best_segment(self) -> tuple[bytes, str]:
        """Return ``(pcm_bytes, source_tag)`` for the best available audio.

        Must be called with ``_buffer_lock`` held.  Priority order:
        1. Most recent completed VAD segment (pure speech turn)
        2. Ongoing speech buffer (long enough)
        3. Raw rolling buffer (fallback)
        """
        min_bytes = int(self._min_audio_duration * SAMPLE_RATE * BYTES_PER_SAMPLE)

        if self._completed_segments:
            seg = self._completed_segments[-1]
            return seg, "vad_segment"

        if len(self._current_speech_buf) >= min_bytes:
            tail_bytes = int(self._buffer_duration * SAMPLE_RATE * BYTES_PER_SAMPLE)
            buf = bytes(self._current_speech_buf[-tail_bytes:])
            return buf, "vad_ongoing"

        buf = bytes(self._audio_buffer)
        return buf, "raw_buffer"

    # ---- core identification with pending-voiceprint confirmation ----

    def _prune_expired_pending(self, now: float) -> None:
        """Remove pending embeddings older than ``_pending_expiry_sec``."""
        cutoff = now - self._pending_expiry_sec
        self._pending_embeddings = [
            entry for entry in self._pending_embeddings if entry[2] >= cutoff
        ]

    def _identify_with_confirmation(
        self, embedding: np.ndarray, duration: float, source: str
    ) -> SpeakerMatch | None:
        """Identify a speaker.

        If no existing speaker matches, the embedding is added to a *pending*
        pool.  A new speaker is created only when a later embedding matches
        one already in the pool (i.e. the same unknown voice is heard twice).

        Pending entries expire after ``_pending_expiry_sec`` seconds of not
        being re-confirmed.  Matching a known speaker does **not** clear the
        pool — other unknown voices keep accumulating independently.
        """
        now = time.monotonic()
        self._prune_expired_pending(now)

        store = self._voiceprint_store
        match = store.find_speaker(embedding)

        if match is not None:
            store.add_voiceprint_sample(match.speaker_id, embedding, duration)
            self._last_match = match
            logger.info(
                f"说话人识别 [{source}] {duration:.1f}s → "
                f"匹配 {match.speaker_name} (conf={match.confidence:.3f})"
            )
            return match

        # Check against pending unknown embeddings
        threshold = store._similarity_threshold
        for idx, (pending_emb, pending_dur, _ts) in enumerate(self._pending_embeddings):
            sim = _cosine_similarity(embedding, pending_emb)
            if sim >= threshold:
                avg_emb = (embedding + pending_emb) * 0.5
                norm = np.linalg.norm(avg_emb)
                if norm > 0:
                    avg_emb = avg_emb / norm
                new_match = store.register_speaker(
                    avg_emb, audio_duration=max(duration, pending_dur)
                )
                self._last_match = new_match
                # Only remove the matched entry, keep others
                self._pending_embeddings.pop(idx)
                logger.info(
                    f"说话人识别 [{source}] {duration:.1f}s → "
                    f"新建 {new_match.speaker_name} (同一声纹二次确认 sim={sim:.3f})"
                )
                return new_match

        # No match anywhere — stash this embedding for future confirmation.
        # Return None so the caller shows "unknown" instead of stale speaker.
        self._pending_embeddings.append((embedding, duration, now))
        if len(self._pending_embeddings) > self._max_pending:
            self._pending_embeddings.pop(0)

        logger.info(
            f"说话人识别 [{source}] {duration:.1f}s → "
            f"未匹配，等待二次确认 (pending={len(self._pending_embeddings)})"
        )
        return None

    # ---- sync / async identification ----

    def _get_campp_speaker(self) -> SpeakerMatch | None:
        with self._buffer_lock:
            segment, source = self._pick_best_segment()

        duration = len(segment) / (SAMPLE_RATE * BYTES_PER_SAMPLE)
        if duration < self._min_audio_duration:
            return self._last_match

        try:
            embedding = self._campp_client.extract_embedding(segment, SAMPLE_RATE)
            return self._identify_with_confirmation(embedding, duration, source)
        except Exception as e:
            logger.debug(f"CAM++ 声纹提取失败: {e}")
            return self._last_match

    async def _identify_campp_async(self) -> SpeakerMatch | None:
        with self._buffer_lock:
            segment, source = self._pick_best_segment()

        duration = len(segment) / (SAMPLE_RATE * BYTES_PER_SAMPLE)
        if duration < self._min_audio_duration:
            return self._last_match

        try:
            embedding = await self._campp_client.extract_embedding_async(segment, SAMPLE_RATE)
            return self._identify_with_confirmation(embedding, duration, source)
        except Exception as e:
            logger.debug(f"CAM++ 声纹提取失败: {e}")
            return self._last_match


# --------------------------------------------------------------------------
# Diart audio source (lazy, only used when diart backend is active)
# --------------------------------------------------------------------------


def _build_queue_audio_source(audio_queue: queue.Queue, *, sample_rate: int = 16000) -> Any:
    """Factory – keeps diart import lazy."""
    from diart.sources import AudioSource  # noqa: PLC0415

    class _QueueAudioSource(AudioSource):
        def __init__(self) -> None:
            super().__init__(uri="websocket_stream", sample_rate=sample_rate)
            self._queue = audio_queue
            self._closed = False
            self._current_time = 0.0

        @property
        def duration(self) -> float:
            return float("inf")

        def read(self) -> None:
            from pyannote.core import SlidingWindow, SlidingWindowFeature  # noqa: PLC0415

            while not self._closed:
                try:
                    pcm_bytes = self._queue.get(timeout=1.0)
                except queue.Empty:
                    continue
                if pcm_bytes is None:
                    break
                samples = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32) / 32768.0
                num_samples = len(samples)
                if num_samples == 0:
                    continue
                waveform = samples[:, np.newaxis]  # (N, 1) mono
                sw = SlidingWindow(
                    start=self._current_time,
                    duration=1.0 / self.sample_rate,
                    step=1.0 / self.sample_rate,
                )
                self.stream.on_next(SlidingWindowFeature(waveform, sw))
                self._current_time += num_samples / self.sample_rate
            self.stream.on_completed()

        def close(self) -> None:
            self._closed = True

    return _QueueAudioSource()


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two embeddings."""
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a / na, b / nb))


def _classify_vad_events(segments: list) -> tuple[bool, bool]:
    """Return ``(speech_started, speech_ended)`` from FSMN-VAD segment list."""
    started = False
    ended = False
    for s, e in segments:
        if s >= 0 and e == -1:
            started = True
        elif s == -1 and e >= 0:
            ended = True
        elif s >= 0 and e >= 0:
            started = True
            ended = True
    return started, ended


_LABEL_NUM_RE = re.compile(r"(\d+)")


def _parse_diart_label(label: str) -> tuple[int, str]:
    """Convert a diart speaker label (e.g. ``'SPEAKER_01'``) to ``(id, name)``."""
    m = _LABEL_NUM_RE.search(label)
    speaker_id = int(m.group(1)) if m else abs(hash(label)) % 1000
    return speaker_id, f"说话人 {speaker_id}"
