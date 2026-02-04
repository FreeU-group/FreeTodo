"""Audio transcription and diarization service."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()


@dataclass
class AudioMetadata:
    duration: float | None = None
    sample_rate: int | None = None
    channels: int | None = None


class AudioTranscriptionService:
    """Run faster-whisper transcription with optional diarization."""

    def __init__(self) -> None:
        self._whisper_model = None
        self._diarization_pipeline = None

    def _get_device(self) -> str:
        device = settings.get("audio_transcription.device", "cpu")
        if device == "auto":
            try:
                import torch

                return "cuda" if torch.cuda.is_available() else "cpu"
            except Exception:
                return "cpu"
        return device

    def _get_compute_type(self, device: str) -> str:
        compute_type = settings.get("audio_transcription.compute_type", "int8")
        if compute_type == "auto":
            return "float16" if device == "cuda" else "int8"
        return compute_type

    def _get_whisper_model(self):
        if self._whisper_model is None:
            from faster_whisper import WhisperModel

            model_size = settings.get("audio_transcription.model", "small")
            device = self._get_device()
            compute_type = self._get_compute_type(device)
            logger.info(
                f"Loading faster-whisper model: {model_size}, device={device}, compute_type={compute_type}"
            )
            self._whisper_model = WhisperModel(
                model_size_or_path=model_size,
                device=device,
                compute_type=compute_type,
            )
        return self._whisper_model

    def _get_diarization_pipeline(self):
        if self._diarization_pipeline is None:
            try:
                from pyannote.audio import Pipeline
            except Exception as e:  # pragma: no cover - optional dependency
                logger.warning(f"pyannote.audio not available: {e}")
                return None

            diarization_cfg = settings.get("audio_transcription.diarization", {})
            model_id = diarization_cfg.get("model", "pyannote/speaker-diarization-3.1")
            auth_token = diarization_cfg.get("auth_token") or None
            logger.info(f"Loading diarization model: {model_id}")
            try:
                self._diarization_pipeline = Pipeline.from_pretrained(
                    model_id,
                    use_auth_token=auth_token,
                )
            except Exception as e:
                logger.error(f"Failed to load diarization model: {e}")
                return None
        return self._diarization_pipeline

    def get_audio_metadata(self, file_path: str) -> AudioMetadata:
        try:
            import av

            with av.open(file_path) as container:
                stream = next((s for s in container.streams if s.type == "audio"), None)
                if not stream:
                    return AudioMetadata()
                duration = None
                if stream.duration is not None and stream.time_base is not None:
                    duration = float(stream.duration * stream.time_base)
                return AudioMetadata(
                    duration=duration,
                    sample_rate=getattr(stream, "rate", None),
                    channels=getattr(stream, "channels", None),
                )
        except Exception as e:
            logger.warning(f"Failed to read audio metadata: {e}")
            return AudioMetadata()

    def _run_diarization(
        self, file_path: str, diarization_enabled: bool | None = None
    ) -> list[dict[str, Any]]:
        diarization_cfg = settings.get("audio_transcription.diarization", {})
        if diarization_enabled is None:
            diarization_enabled = diarization_cfg.get("enabled", False)
        if not diarization_enabled:
            return []

        model_id = diarization_cfg.get("model", "pyannote/speaker-diarization-3.1")
        auth_token = diarization_cfg.get("auth_token") or None
        # If using a Hugging Face model id and no token is provided, degrade gracefully.
        if isinstance(model_id, str) and "/" in model_id and not auth_token:
            logger.warning(
                "Diarization enabled but auth_token is missing; skip diarization and return ASR only."
            )
            return []

        pipeline = self._get_diarization_pipeline()
        if pipeline is None:
            return []

        try:
            diarization = pipeline(file_path)
        except Exception as e:
            logger.error(f"Diarization failed: {e}")
            return []

        segments: list[dict[str, Any]] = []
        for turn, _, speaker in diarization.itertracks(yield_label=True):
            segments.append(
                {
                    "start": float(turn.start),
                    "end": float(turn.end),
                    "speaker": str(speaker),
                }
            )
        return segments

    def _assign_speakers(
        self, asr_segments: list[dict[str, Any]], diarization_segments: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        if not diarization_segments:
            for segment in asr_segments:
                segment["speaker"] = "speaker_0"
            return asr_segments

        for segment in asr_segments:
            best_speaker = "speaker_0"
            best_overlap = 0.0
            for diar in diarization_segments:
                overlap = max(
                    0.0,
                    min(segment["end_time"], diar["end"]) - max(segment["start_time"], diar["start"]),
                )
                if overlap > best_overlap:
                    best_overlap = overlap
                    best_speaker = diar["speaker"]
            segment["speaker"] = best_speaker
        return asr_segments

    def transcribe(
        self,
        file_path: str,
        language: str | None = None,
        diarization_enabled: bool | None = None,
    ) -> dict[str, Any]:
        model = self._get_whisper_model()

        beam_size = settings.get("audio_transcription.beam_size", 5)
        vad_filter = settings.get("audio_transcription.vad_filter", True)
        vad_parameters = settings.get("audio_transcription.vad_parameters", None)

        if language in (None, "auto"):
            language = None

        segments, info = model.transcribe(
            file_path,
            language=language,
            beam_size=beam_size,
            vad_filter=vad_filter,
            vad_parameters=vad_parameters if vad_filter else None,
        )

        asr_segments: list[dict[str, Any]] = []
        for segment in segments:
            asr_segments.append(
                {
                    "start_time": float(segment.start),
                    "end_time": float(segment.end),
                    "text_content": segment.text.strip(),
                    "confidence": getattr(segment, "avg_logprob", None),
                    "language": info.language if info else None,
                }
            )

        diarization_segments = self._run_diarization(file_path, diarization_enabled)
        asr_segments = self._assign_speakers(asr_segments, diarization_segments)

        return {
            "segments": asr_segments,
            "language": info.language if info else None,
        }
