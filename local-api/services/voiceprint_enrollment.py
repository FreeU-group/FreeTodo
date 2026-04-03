"""Voiceprint enrollment helpers used by setup and audio sessions."""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

from util.logging_config import get_logger

logger = get_logger()


async def enroll_voiceprint(audio_path: Path) -> dict[str, Any]:  # noqa: PLR0911
    """Decode audio, extract embedding, register/match speaker, set as me."""
    import shutil  # noqa: PLC0415
    import subprocess  # noqa: PLC0415

    if not shutil.which("ffmpeg"):
        logger.warning("ffmpeg 未安装，跳过声纹向量提取")
        return {"enrolled": False, "reason": "ffmpeg not installed"}

    pcm_path = audio_path.with_suffix(".pcm")
    try:
        proc = subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(audio_path),
                "-ar",
                "16000",
                "-ac",
                "1",
                "-f",
                "s16le",
                str(pcm_path),
            ],
            capture_output=True,
            timeout=30,
            check=False,
        )
        if proc.returncode != 0:
            err = proc.stderr.decode(errors="replace")[:200]
            logger.error(f"ffmpeg 转码失败: {err}")
            return {"enrolled": False, "reason": f"ffmpeg error: {err}"}
    except Exception as e:
        logger.error(f"ffmpeg 执行异常: {e}")
        return {"enrolled": False, "reason": str(e)}

    pcm_bytes = pcm_path.read_bytes()
    pcm_path.unlink(missing_ok=True)

    duration = len(pcm_bytes) / (16000 * 2)
    if duration < 1.0:
        logger.warning(f"声纹音频太短: {duration:.1f}s")
        return {"enrolled": False, "reason": f"audio too short ({duration:.1f}s)"}

    try:
        from services.speaker_embedding_client import SpeakerEmbeddingClient  # noqa: PLC0415
        from services.speaker_service import VoiceprintStore  # noqa: PLC0415

        client = SpeakerEmbeddingClient()
        if not client.available:
            return {"enrolled": False, "reason": "funasr not installed"}

        loop = asyncio.get_running_loop()
        embedding = await loop.run_in_executor(None, client.extract_embedding, pcm_bytes, 16000)

        store = VoiceprintStore()
        match = store.find_speaker(embedding)

        if match is not None:
            store.add_voiceprint_sample(match.speaker_id, embedding, duration)
            store.set_as_me(match.speaker_id)
            logger.info(
                f"声纹匹配已有说话人 {match.speaker_name} (id={match.speaker_id})，已设为「我」"
            )
            return {
                "enrolled": True,
                "speaker_id": match.speaker_id,
                "speaker_name": match.speaker_name,
                "matched_existing": True,
            }

        new_match = store.register_speaker(embedding, name="我", audio_duration=duration)
        store.set_as_me(new_match.speaker_id)
        logger.info(f"已创建新说话人「我」(id={new_match.speaker_id})")
        return {
            "enrolled": True,
            "speaker_id": new_match.speaker_id,
            "speaker_name": "我",
            "matched_existing": False,
        }
    except Exception as e:
        logger.exception("声纹注册失败")
        return {"enrolled": False, "reason": str(e)}
