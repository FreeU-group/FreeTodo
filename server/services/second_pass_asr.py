"""Second-pass offline ASR using DashScope Paraformer-v2 file transcription.

After real-time ASR produces v1 (streaming) results, this module re-processes
accumulated audio through the Paraformer-v2 offline API with speaker
diarization, producing higher-quality v2 results with per-speaker attribution.

Audio is uploaded to DashScope's temporary storage (valid 48h) so there is
no need for the server to be publicly reachable.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import struct
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from util.base_paths import get_user_data_dir
from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

SAMPLE_RATE = 16000
NUM_CHANNELS = 1
BITS_PER_SAMPLE = 16
BYTES_PER_SAMPLE = NUM_CHANNELS * (BITS_PER_SAMPLE // 8)

SEGMENT_PAD_MS = 300

DASHSCOPE_UPLOAD_URL = "https://dashscope.aliyuncs.com/api/v1/uploads"
DASHSCOPE_TRANSCRIPTION_SUBMIT_URL = (
    "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription"
)
DASHSCOPE_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}"


@dataclass
class RefinedSegment:
    """A single sentence from second-pass transcription."""

    text: str
    speaker_id: int | None = None
    speaker_name: str | None = None
    begin_time_ms: int = 0
    end_time_ms: int = 0


@dataclass
class SecondPassResult:
    """Aggregated result of a second-pass run."""

    segments: list[RefinedSegment] = field(default_factory=list)
    full_text: str = ""
    duration_ms: int = 0
    processing_time_s: float = 0.0


def _pcm_to_wav(pcm_data: bytes) -> bytes:
    """Wrap raw PCM-16 LE mono data in a WAV header."""
    data_size = len(pcm_data)
    byte_rate = SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE // 8)
    block_align = NUM_CHANNELS * (BITS_PER_SAMPLE // 8)

    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + data_size,
        b"WAVE",
        b"fmt ",
        16,  # chunk size
        1,  # PCM format
        NUM_CHANNELS,
        SAMPLE_RATE,
        byte_rate,
        block_align,
        BITS_PER_SAMPLE,
        b"data",
        data_size,
    )
    return header + pcm_data


class SecondPassASRProcessor:
    """Orchestrates offline ASR via DashScope Paraformer-v2 Transcription API.

    Audio is uploaded to DashScope's temporary OSS storage, eliminating the
    need for a publicly reachable server address.
    """

    def __init__(self) -> None:
        cfg = settings.get("audio.second_pass", {}) or {}
        self.enabled = bool(cfg.get("enabled", False))
        self.model = str(cfg.get("model", "paraformer-v2"))
        self.diarization_enabled = bool(cfg.get("diarization_enabled", True))
        self.speaker_count = int(cfg.get("speaker_count", 0))
        self.language_hints = list(cfg.get("language_hints", ["zh", "en"]))
        self.min_duration_seconds = float(cfg.get("min_duration_seconds", 0.5))
        self.disfluency_removal = bool(cfg.get("disfluency_removal_enabled", False))
        self.temp_dir = Path(get_user_data_dir()) / str(
            cfg.get("temp_audio_dir", "second_pass_audio/")
        )
        self.temp_dir.mkdir(parents=True, exist_ok=True)

        self._api_key: str | None = None

        if not self.enabled:
            logger.debug("[second-pass] 二次处理未启用 (audio.second_pass.enabled=false)")

    def _get_api_key(self) -> str:
        if self._api_key:
            return self._api_key
        key = settings.get("audio.asr.api_key", "")
        invalid = {"", "xxx", "YOUR_API_KEY_HERE", "YOUR_ASR_KEY_HERE", "YOUR_LLM_KEY_HERE", "your-api-key", "your-asr-api-key"}
        if key in invalid:
            key = settings.get("llm.api_key", "")
        self._api_key = key
        return key

    def _save_wav_locally(self, pcm_chunks: list[bytes], session_id: str) -> Path:
        """Save PCM chunks as a local WAV file for upload."""
        pcm_data = b"".join(pcm_chunks)
        wav_data = _pcm_to_wav(pcm_data)

        filename = f"{session_id}_{uuid.uuid4().hex[:8]}.wav"
        local_path = self.temp_dir / filename
        local_path.write_bytes(wav_data)

        logger.info(
            f"[second-pass] Saved WAV: {local_path} "
            f"({len(pcm_data) / (SAMPLE_RATE * 2):.1f}s, {len(wav_data)} bytes)"
        )
        return local_path

    async def process(
        self,
        pcm_chunks: list[bytes],
        session_id: str,
    ) -> SecondPassResult | None:
        """Run second-pass transcription on accumulated audio chunks.

        Returns ``None`` if processing fails or is disabled.
        """
        if not self.enabled or not pcm_chunks:
            return None

        total_bytes = sum(len(c) for c in pcm_chunks)
        duration_s = total_bytes / (SAMPLE_RATE * 2)
        if duration_s < self.min_duration_seconds:
            logger.info(
                "[second-pass] Audio too short (%.1fs < %.1fs), skipping",
                duration_s,
                self.min_duration_seconds,
            )
            return None

        t0 = time.monotonic()

        local_path = self._save_wav_locally(pcm_chunks, session_id)

        try:
            oss_url = await self._upload_to_dashscope(local_path)
            if oss_url is None:
                return None

            raw_result = await self._call_transcription_api(oss_url)
            if raw_result is None:
                return None

            segments = self._parse_transcription_result(raw_result)
            segments = await self._map_speakers(segments, pcm_chunks)

            full_text = "\n".join(
                f"[{s.speaker_name or f'说话人{s.speaker_id}'}] {s.text}" for s in segments
            )

            result = SecondPassResult(
                segments=segments,
                full_text=full_text,
                duration_ms=int(duration_s * 1000),
                processing_time_s=time.monotonic() - t0,
            )
            logger.info(
                f"[second-pass] Done: {len(segments)} segments, "
                f"{duration_s:.1f}s audio in {result.processing_time_s:.1f}s"
            )
            return result
        except Exception:
            logger.exception("[second-pass] Processing failed")
            return None
        finally:
            self._schedule_cleanup(local_path)

    # ---- DashScope upload ----

    async def _upload_to_dashscope(self, local_path: Path) -> str | None:
        """Upload a local WAV file to DashScope temporary storage.

        Returns an ``oss://`` URL on success, or ``None`` on failure.
        """
        api_key = self._get_api_key()
        if not api_key:
            logger.error("[second-pass] No API key configured, cannot upload")
            return None

        loop = asyncio.get_event_loop()
        try:
            policy = await loop.run_in_executor(None, self._get_upload_policy, api_key)
            if policy is None:
                return None
            oss_url = await loop.run_in_executor(None, self._upload_file_to_oss, policy, local_path)
            logger.info(f"[second-pass] Uploaded to DashScope: {oss_url}")
            return oss_url
        except Exception:
            logger.exception("[second-pass] Upload to DashScope failed")
            return None

    def _get_upload_policy(self, api_key: str) -> dict[str, Any] | None:
        """Fetch upload credentials from DashScope."""
        import httpx  # noqa: PLC0415

        try:
            resp = httpx.get(
                DASHSCOPE_UPLOAD_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                params={"action": "getPolicy", "model": self.model},
                timeout=15,
            )
            resp.raise_for_status()
            return resp.json()["data"]
        except Exception as e:
            logger.error(f"[second-pass] Failed to get upload policy: {e}")
            return None

    @staticmethod
    def _upload_file_to_oss(policy: dict[str, Any], local_path: Path) -> str:
        """Upload a file to DashScope's temporary OSS bucket."""
        import httpx  # noqa: PLC0415

        filename = local_path.name
        key = f"{policy['upload_dir']}/{filename}"

        with local_path.open("rb") as f:
            resp = httpx.post(
                policy["upload_host"],
                data={
                    "OSSAccessKeyId": policy["oss_access_key_id"],
                    "Signature": policy["signature"],
                    "policy": policy["policy"],
                    "x-oss-object-acl": policy["x_oss_object_acl"],
                    "x-oss-forbid-overwrite": policy["x_oss_forbid_overwrite"],
                    "key": key,
                    "success_action_status": "200",
                },
                files={"file": (filename, f, "audio/wav")},
                timeout=60,
            )
            resp.raise_for_status()

        return f"oss://{key}"

    # ---- DashScope REST transcription API ----

    async def _call_transcription_api(self, oss_url: str) -> dict[str, Any] | None:
        """Submit audio to DashScope Transcription REST API and wait for result.

        Uses ``oss://`` URLs with ``X-DashScope-OssResourceResolve: enable``
        header so the SDK's oss:// limitation does not apply.
        """
        api_key = self._get_api_key()
        if not api_key:
            logger.error("[second-pass] No API key configured")
            return None

        logger.info(f"[second-pass] Submitting to DashScope: {oss_url}")

        loop = asyncio.get_event_loop()
        task_id = await loop.run_in_executor(None, self._submit_task, api_key, oss_url)
        if task_id is None:
            return None

        return await loop.run_in_executor(None, self._wait_for_task, api_key, task_id)

    def _submit_task(self, api_key: str, oss_url: str) -> str | None:
        """Submit a transcription task via REST API, return task_id."""
        import httpx  # noqa: PLC0415

        body: dict[str, Any] = {
            "model": self.model,
            "input": {"file_urls": [oss_url]},
            "parameters": {
                "language_hints": self.language_hints,
                "diarization_enabled": self.diarization_enabled,
            },
        }
        if self.speaker_count > 0:
            body["parameters"]["speaker_count"] = self.speaker_count
        if self.disfluency_removal:
            body["parameters"]["disfluency_removal_enabled"] = True

        try:
            resp = httpx.post(
                DASHSCOPE_TRANSCRIPTION_SUBMIT_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "X-DashScope-Async": "enable",
                    "X-DashScope-OssResourceResolve": "enable",
                },
                json=body,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            task_id = data.get("output", {}).get("task_id")
            if not task_id:
                logger.error(f"[second-pass] No task_id in response: {data}")
                return None
            logger.debug(f"[second-pass] Task submitted: {task_id}")
            return task_id
        except Exception as e:
            logger.error(f"[second-pass] Task submission failed: {e}")
            return None

    def _wait_for_task(self, api_key: str, task_id: str) -> dict[str, Any] | None:
        """Poll the task until it completes, then fetch transcription JSON."""
        import httpx  # noqa: PLC0415

        url = DASHSCOPE_TASK_URL.format(task_id=task_id)
        headers = {"Authorization": f"Bearer {api_key}"}

        for _ in range(120):  # up to ~10 minutes
            try:
                resp = httpx.get(url, headers=headers, timeout=15)
                resp.raise_for_status()
                data = resp.json()
                status = data.get("output", {}).get("task_status", "")

                if status == "SUCCEEDED":
                    return self._extract_transcription_url(data)
                if status == "FAILED":
                    logger.error(f"[second-pass] Task failed: {data}")
                    return None

                time.sleep(5)
            except Exception as e:
                logger.error(f"[second-pass] Polling error: {e}")
                time.sleep(5)

        logger.error(f"[second-pass] Task {task_id} timed out")
        return None

    @staticmethod
    def _extract_transcription_url(data: dict[str, Any]) -> dict[str, Any] | None:
        results = data.get("output", {}).get("results", [])
        if not results:
            logger.warning("[second-pass] No results returned")
            return None

        first = results[0]
        if first.get("subtask_status") != "SUCCEEDED":
            logger.error(f"[second-pass] Subtask failed: {first.get('code')}")
            return None

        url = first.get("transcription_url")
        if not url:
            logger.error("[second-pass] No transcription_url in result")
            return None

        return SecondPassASRProcessor._fetch_transcription_json(url)

    @staticmethod
    def _fetch_transcription_json(url: str) -> dict[str, Any] | None:
        """Download the transcription result JSON from DashScope's result URL."""
        import urllib.request  # noqa: PLC0415

        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            logger.error(f"[second-pass] Failed to fetch transcription JSON: {e}")
            return None

    @staticmethod
    def _parse_transcription_result(raw: dict[str, Any]) -> list[RefinedSegment]:
        """Parse DashScope transcription JSON into RefinedSegment list."""
        segments: list[RefinedSegment] = []

        for transcript in raw.get("transcripts", []):
            for sentence in transcript.get("sentences", []):
                seg = RefinedSegment(
                    text=sentence.get("text", "").strip(),
                    speaker_id=sentence.get("speaker_id"),
                    begin_time_ms=sentence.get("begin_time", 0),
                    end_time_ms=sentence.get("end_time", 0),
                )
                if seg.text:
                    segments.append(seg)

        return segments

    async def _map_speakers(
        self,
        segments: list[RefinedSegment],
        pcm_chunks: list[bytes],
    ) -> list[RefinedSegment]:
        """Identify each segment's speaker independently via CAM++ embedding.

        Per-segment identification is more robust than grouping by DashScope's
        ``speaker_id``, which can be inaccurate when speakers alternate with
        short gaps.  For segments too short for a reliable embedding, the
        DashScope ``speaker_id`` is used as a fallback key to inherit the
        identity resolved from longer segments in the same group.
        """
        if not segments:
            return segments

        client, store = self._try_init_speaker_services()
        if client is None or store is None:
            _assign_default_speaker_names(segments)
            return segments

        full_pcm = b"".join(pcm_chunks)
        total_pcm_bytes = len(full_pcm)
        min_embed_duration = 0.8

        original_ds_ids = [seg.speaker_id for seg in segments]
        ds_id_votes: dict[int, list[tuple[str, int | None]]] = {}

        pad_bytes = SEGMENT_PAD_MS * SAMPLE_RATE * BYTES_PER_SAMPLE // 1000

        for i, seg in enumerate(segments):
            start_byte = seg.begin_time_ms * SAMPLE_RATE * BYTES_PER_SAMPLE // 1000
            end_byte = seg.end_time_ms * SAMPLE_RATE * BYTES_PER_SAMPLE // 1000
            start_byte = max(0, start_byte - pad_bytes)
            end_byte = min(total_pcm_bytes, end_byte + pad_bytes)
            audio_slice = full_pcm[start_byte:end_byte]
            duration = len(audio_slice) / (SAMPLE_RATE * BYTES_PER_SAMPLE)
            ds_id = original_ds_ids[i]

            if duration < min_embed_duration:
                seg.speaker_name = None
                continue

            name, store_id = await _identify_segment_speaker(
                i, ds_id, audio_slice, duration, client, store
            )
            seg.speaker_name = name
            seg.speaker_id = store_id

            if ds_id is not None and store_id is not None:
                ds_id_votes.setdefault(ds_id, []).append((name, store_id))

        for i, seg in enumerate(segments):
            if seg.speaker_name is not None:
                continue
            ds_id = original_ds_ids[i]
            votes = ds_id_votes.get(ds_id, []) if ds_id is not None else []
            if votes:
                from collections import Counter  # noqa: PLC0415

                seg.speaker_name, seg.speaker_id = Counter(votes).most_common(1)[0][0]
            else:
                seg.speaker_name = f"说话人 {ds_id}"

        return segments

    @staticmethod
    def _try_init_speaker_services() -> tuple[Any, Any]:
        """Try to initialise speaker embedding client and voiceprint store.

        Returns ``(client, store)`` or ``(None, None)`` on failure.
        """
        try:
            from services.speaker_embedding_client import SpeakerEmbeddingClient  # noqa: PLC0415
            from services.speaker_service import VoiceprintStore  # noqa: PLC0415

            client = SpeakerEmbeddingClient()
            if not client.available:
                return None, None
            return client, VoiceprintStore()
        except Exception:
            logger.debug("[second-pass] Speaker services unavailable")
            return None, None

    def _schedule_cleanup(self, path: Path) -> None:
        """Schedule deletion of a temp file after a delay."""
        max_age = settings.get("audio.second_pass.temp_audio_max_age_hours", 24)

        async def _cleanup() -> None:
            await asyncio.sleep(max_age * 3600)
            with contextlib.suppress(Exception):
                path.unlink(missing_ok=True)
                logger.debug(f"[second-pass] Cleaned up temp file: {path}")

        with contextlib.suppress(RuntimeError):
            asyncio.get_event_loop().create_task(_cleanup())


async def _identify_segment_speaker(
    seg_idx: int,
    ds_speaker_id: int | None,
    audio_slice: bytes,
    duration: float,
    client: Any,
    store: Any,
) -> tuple[str, int | None]:
    """Identify the speaker for a single segment via CAM++ embedding.

    Uses ``find_speaker`` (read-only) for known speakers to avoid adding
    excessive voiceprint samples.  Only calls ``identify_or_create`` when
    no match is found, which may register a new speaker.

    Returns ``(display_name, voiceprint_store_id)``.
    """
    label = ds_speaker_id if ds_speaker_id is not None else "?"
    try:
        embedding = await client.extract_embedding_async(audio_slice, SAMPLE_RATE)

        match = store.find_speaker(embedding)
        if match is not None:
            name = "我" if match.is_me else (match.speaker_name or f"说话人 {match.speaker_id}")
            logger.info(
                f"[second-pass] Seg {seg_idx} (ds={label}) → {name} "
                f"(store_id={match.speaker_id}, conf={match.confidence:.3f})"
            )
            return (name, match.speaker_id)

        new_match = store.identify_or_create(embedding, audio_duration=duration)
        if new_match.speaker_id < 0:
            logger.info(f"[second-pass] Seg {seg_idx} (ds={label}) → unidentified")
            return (f"说话人 {label}", None)

        name = (
            "我"
            if new_match.is_me
            else (new_match.speaker_name or f"说话人 {new_match.speaker_id}")
        )
        tag = "new" if new_match.is_new else f"conf={new_match.confidence:.3f}"
        logger.info(
            f"[second-pass] Seg {seg_idx} (ds={label}) → {name} "
            f"(store_id={new_match.speaker_id}, {tag})"
        )
        return (name, new_match.speaker_id)
    except Exception as e:
        logger.debug(f"[second-pass] Speaker mapping failed for seg {seg_idx}: {e}")
        return (f"说话人 {label}", None)


def _assign_default_speaker_names(segments: list[RefinedSegment]) -> None:
    """Fall back to generic speaker names when voiceprint services are unavailable."""
    for seg in segments:
        if seg.speaker_id is not None:
            seg.speaker_name = f"说话人 {seg.speaker_id}"
