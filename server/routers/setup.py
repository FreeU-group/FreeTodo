"""Setup wizard routes."""

from __future__ import annotations

import asyncio
import audioop
import contextlib
import os
import time
import wave
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from services.config_service import ConfigService
from util.base_paths import get_user_data_dir
from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()
router = APIRouter(prefix="/api/setup", tags=["setup"])

_config_service = ConfigService()
PCM16_SAMPLE_WIDTH = 2
TARGET_SAMPLE_RATE = 16000
MIN_VOICEPRINT_SECONDS = 0.5
_background_tasks: set[asyncio.Task] = set()


class ScanRequest(BaseModel):
    directory: str
    max_files: int = 500


class ScanResult(BaseModel):
    valid: bool = True
    directory: str
    file_count: int
    files: list[dict[str, Any]]
    scan_time_ms: int


class AnalyzeFilesRequest(BaseModel):
    filenames: list[str]
    directory: str = ""


class AnalyzeFilesResult(BaseModel):
    guessed_name: str = ""
    initial_profile: str = ""


class CompleteRequest(BaseModel):
    user_name: str = ""
    agent_name: str = "Free U"
    scan_directories: list[str] = []
    allowed_apps: list[str] = ["微信"]
    initial_profile: str = ""


class EnrollVoiceprintRequest(BaseModel):
    recording_id: int
    user_name: str = ""
    set_as_me: bool = True


def _load_wav_to_pcm16k_mono(path: Path) -> tuple[bytes, float]:
    """Load WAV as PCM16LE mono 16k audio bytes."""
    try:
        with wave.open(str(path), "rb") as wf:
            channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            sample_rate = wf.getframerate()
            frame_count = wf.getnframes()
            raw = wf.readframes(frame_count)
    except wave.Error as exc:
        raise ValueError(f"Unsupported WAV file: {path}") from exc

    if sample_width != PCM16_SAMPLE_WIDTH:
        raw = audioop.lin2lin(raw, sample_width, PCM16_SAMPLE_WIDTH)
        sample_width = PCM16_SAMPLE_WIDTH

    if channels > 1:
        raw = audioop.tomono(raw, sample_width, 0.5, 0.5)
        channels = 1

    if sample_rate != TARGET_SAMPLE_RATE:
        raw, _ = audioop.ratecv(
            raw, sample_width, channels, sample_rate, TARGET_SAMPLE_RATE, None
        )
        sample_rate = TARGET_SAMPLE_RATE

    duration_s = len(raw) / (sample_width * sample_rate) if sample_rate > 0 else 0.0
    if duration_s < MIN_VOICEPRINT_SECONDS:
        raise ValueError(
            f"Voiceprint audio is too short (minimum {MIN_VOICEPRINT_SECONDS:.1f}s)."
        )

    return raw, duration_s


@router.get("/status")
async def get_setup_status() -> dict[str, bool]:
    """Check whether setup wizard has been completed."""
    completed = (
        getattr(settings, "setup", {}).get("completed", False)
        if hasattr(settings, "setup")
        else False
    )
    return {"completed": bool(completed)}


@router.post("/scan-directory")
async def scan_directory(req: ScanRequest) -> ScanResult:
    """Scan recent files under a directory (filenames/metadata only)."""
    target = Path(req.directory).expanduser().resolve()
    if not target.exists() or not target.is_dir():
        return ScanResult(
            valid=False,
            directory=str(target),
            file_count=0,
            files=[],
            scan_time_ms=0,
        )

    t0 = time.perf_counter()
    entries: list[dict[str, Any]] = []

    try:
        for root, _dirs, filenames in os.walk(target):
            for fname in filenames:
                if fname.startswith("."):
                    continue
                fp = Path(root) / fname
                try:
                    stat = fp.stat()
                    entries.append(
                        {
                            "name": fname,
                            "path": str(fp),
                            "size": stat.st_size,
                            "modified": stat.st_mtime,
                            "ext": fp.suffix.lower(),
                        }
                    )
                except OSError:
                    continue
                if len(entries) >= req.max_files * 3:
                    break
            if len(entries) >= req.max_files * 3:
                break
    except PermissionError:
        pass

    entries.sort(key=lambda e: e["modified"], reverse=True)
    entries = entries[: req.max_files]

    elapsed = int((time.perf_counter() - t0) * 1000)
    return ScanResult(
        directory=str(target),
        file_count=len(entries),
        files=entries,
        scan_time_ms=elapsed,
    )


@router.post("/analyze-files")
async def analyze_files(req: AnalyzeFilesRequest) -> AnalyzeFilesResult:  # noqa: C901, PLR0912
    """Guess username and bootstrap profile from recent filenames."""
    if not req.filenames:
        return AnalyzeFilesResult()

    try:
        from llm.llm_client import LLMClient  # noqa: PLC0415
    except ImportError:
        logger.warning("LLM module unavailable, skip setup filename analysis")
        return AnalyzeFilesResult()

    llm = LLMClient()
    if not llm.is_available():
        logger.warning("LLM client unavailable, skip setup filename analysis")
        return AnalyzeFilesResult()

    filenames_text = "\n".join(f"- {name}" for name in req.filenames[:300])
    prompt = (
        "You are a setup assistant. Based on file names only, infer a likely user name and a short"
        " profile in Markdown.\n\n"
        "Output format strictly:\n"
        "NAME: <name or empty>\n"
        "---PROFILE---\n"
        "<markdown profile>\n\n"
        f"Directory: {req.directory or 'unknown'}\n"
        f"Filenames:\n{filenames_text}"
    )
    messages = [
        {"role": "system", "content": "Infer profile from filenames only. Keep uncertainty explicit."},
        {"role": "user", "content": prompt},
    ]

    try:
        resp = await asyncio.to_thread(
            llm.chat,
            messages,
            0.3,
            None,
            2048,
            log_usage=True,
            log_meta={"endpoint": "setup_analyze_files", "feature_type": "setup"},
        )
    except Exception:
        logger.exception("analyze-files LLM call failed")
        return AnalyzeFilesResult()

    guessed_name = ""
    initial_profile = ""

    if resp:
        lines = resp.strip().split("\n")
        profile_start = -1
        for i, line in enumerate(lines):
            if line.strip().upper().startswith("NAME:"):
                guessed_name = line.split(":", 1)[1].strip()
            if line.strip() == "---PROFILE---":
                profile_start = i + 1
                break

        if profile_start >= 0:
            initial_profile = "\n".join(lines[profile_start:]).strip()
        else:
            initial_profile = resp.strip()

        if initial_profile.startswith("```"):
            initial_profile = initial_profile[3:].strip()
        if initial_profile.endswith("```"):
            initial_profile = initial_profile[:-3].strip()

    if initial_profile and not initial_profile.startswith("# "):
        initial_profile = f"# 用户画像\n\n{initial_profile}"

    logger.info(
        "setup filename analysis done: guessed_name=%s, profile_len=%d",
        guessed_name or "(empty)",
        len(initial_profile),
    )
    return AnalyzeFilesResult(guessed_name=guessed_name, initial_profile=initial_profile)


class AddWorkspaceRequest(BaseModel):
    directory: str


class AddWorkspaceResult(BaseModel):
    success: bool = True
    directory: str = ""
    error: str = ""


async def _background_scan_and_update_profile(directory: str) -> None:
    """后台静默执行：扫描目录文件 → LLM 分析 → 追加写入用户画像。"""
    try:
        scan_result = await scan_directory(ScanRequest(directory=directory, max_files=500))
        if not scan_result.files:
            logger.info("目录 %s 无文件，跳过画像分析", directory)
            return

        filenames = [f["name"] for f in scan_result.files]
        analyze_result = await analyze_files(
            AnalyzeFilesRequest(filenames=filenames, directory=directory)
        )
        if not analyze_result.initial_profile:
            logger.info("目录 %s 画像分析无结果", directory)
            return

        memory_dir = get_user_data_dir() / "memory"
        profile_dir = memory_dir / "profile_L4"
        profile_dir.mkdir(parents=True, exist_ok=True)
        profile_file = profile_dir / "user_profile.md"

        existing = ""
        if profile_file.exists():
            existing = profile_file.read_text(encoding="utf-8").strip()
        separator = f"\n\n---\n\n## 工作目录分析：{directory}\n\n"
        updated = (
            existing + separator + analyze_result.initial_profile
            if existing
            else analyze_result.initial_profile
        )
        profile_file.write_text(updated, encoding="utf-8")
        logger.info("用户画像已更新（追加目录分析）: %s", profile_file)
    except Exception:
        logger.exception("后台扫描/分析工作目录失败: %s", directory)


@router.post("/add-workspace")
async def add_workspace(req: AddWorkspaceRequest) -> AddWorkspaceResult:
    """从设置页添加工作目录。

    配置立即写入并返回，扫描文件 + 画像分析在后台静默执行。
    """
    target = Path(req.directory).expanduser().resolve()
    if not target.exists() or not target.is_dir():
        return AddWorkspaceResult(success=False, error=f"目录不存在: {target}")

    dir_str = str(target)

    current_dirs: list[str] = list(settings.get("setup.scan_directories", []) or [])
    if dir_str not in current_dirs:
        current_dirs.append(dir_str)

    config_updates: dict[str, Any] = {
        "setup.scan_directories": current_dirs,
        "agno.default_workspace": dir_str,
    }
    _config_service.save_config(config_updates)

    task = asyncio.create_task(_background_scan_and_update_profile(dir_str))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return AddWorkspaceResult(success=True, directory=dir_str)


@router.post("/complete")
async def complete_setup(req: CompleteRequest) -> dict[str, bool]:
    """Mark setup complete and persist setup-related config."""
    config_updates: dict[str, Any] = {
        "setup.completed": True,
        "setup.user_name": req.user_name,
        "setup.agent_name": req.agent_name,
        "setup.scan_directories": req.scan_directories,
        "setup.allowed_apps": req.allowed_apps,
    }

    if req.scan_directories:
        workspace = req.scan_directories[0]
        config_updates["agno.default_workspace"] = workspace
        logger.info("Set Agno default workspace: %s", workspace)

    _config_service.save_config(config_updates)

    if req.initial_profile:
        try:
            memory_dir = get_user_data_dir() / "memory"
            profile_dir = memory_dir / "profile_L4"
            profile_dir.mkdir(parents=True, exist_ok=True)
            profile_file = profile_dir / "user_profile.md"
            if not profile_file.exists():
                profile_file.write_text(req.initial_profile, encoding="utf-8")
                logger.info("Wrote initial user profile: %s", profile_file)
        except Exception:
            logger.exception("Failed writing initial user profile")

    logger.info("Setup completed: user=%s, agent=%s", req.user_name, req.agent_name)
    return {"success": True}


@router.post("/enroll-voiceprint")
async def enroll_voiceprint(req: EnrollVoiceprintRequest) -> dict[str, Any]:
    """Enroll a setup voiceprint recording into speaker store and mark as me."""
    if req.recording_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid recording_id")

    try:
        from services.speaker_embedding_client import SpeakerEmbeddingClient  # noqa: PLC0415
        from services.speaker_service import VoiceprintStore  # noqa: PLC0415
        from storage import get_session  # noqa: PLC0415
        from storage.models import AudioRecording  # noqa: PLC0415

        with get_session() as session:
            recording = session.get(AudioRecording, req.recording_id)

        if not recording or not recording.file_path:
            raise HTTPException(status_code=404, detail="Recording not found")

        audio_path = Path(recording.file_path).expanduser().resolve()
        if not audio_path.exists():
            raise HTTPException(status_code=404, detail="Recording file not found")

        pcm_bytes, duration_s = _load_wav_to_pcm16k_mono(audio_path)

        embedding_client = SpeakerEmbeddingClient()
        if not embedding_client.available:
            raise HTTPException(status_code=503, detail="Speaker embedding service unavailable")

        embedding = await embedding_client.extract_embedding_async(
            pcm_bytes, sample_rate=TARGET_SAMPLE_RATE
        )
        store = VoiceprintStore()

        user_name = req.user_name.strip()
        matched = store.find_speaker(embedding)
        created = False

        if matched is not None:
            speaker_id = matched.speaker_id
            store.add_voiceprint_sample(speaker_id, embedding, audio_duration=duration_s)
        else:
            created_match = store.register_speaker(
                embedding,
                name=user_name or None,
                audio_duration=duration_s,
            )
            speaker_id = created_match.speaker_id
            created = True

        if user_name:
            with contextlib.suppress(Exception):
                store.rename_speaker(speaker_id, user_name)

        is_me = store.set_as_me(speaker_id) if req.set_as_me else False

        logger.info(
            "setup voiceprint enrolled: recording_id=%s, speaker_id=%s, created=%s, is_me=%s",
            req.recording_id,
            speaker_id,
            created,
            is_me,
        )

        return {
            "success": True,
            "recording_id": req.recording_id,
            "speaker_id": speaker_id,
            "duration_seconds": round(duration_s, 2),
            "created": created,
            "is_me": is_me,
        }
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to enroll setup voiceprint")
        raise HTTPException(status_code=500, detail=f"Enroll voiceprint failed: {exc}") from exc


@router.post("/save-voiceprint")
async def save_voiceprint(file: UploadFile) -> dict[str, Any]:
    """Store raw uploaded voiceprint audio as backup asset."""
    voiceprint_dir = get_user_data_dir() / "voiceprint"
    voiceprint_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    dest = voiceprint_dir / f"voiceprint_{timestamp}.webm"
    content = await file.read()
    dest.write_bytes(content)
    logger.info("Saved setup voiceprint file: %s (%d bytes)", dest, len(content))
    return {"success": True, "path": str(dest), "size": len(content)}


@router.get("/voiceprint-status")
async def voiceprint_status():
    """返回当前声纹录制状态。"""
    voiceprint_dir = get_user_data_dir() / "voiceprint"
    if not voiceprint_dir.exists():
        return {"exists": False}
    files = sorted(
        voiceprint_dir.glob("voiceprint_*.*"), key=lambda p: p.stat().st_mtime, reverse=True
    )
    if not files:
        return {"exists": False}
    latest = files[0]
    return {
        "exists": True,
        "path": str(latest),
        "size": latest.stat().st_size,
    }


@router.post("/delete-voiceprint")
async def delete_voiceprint():
    """删除所有已录制的声纹文件。"""
    voiceprint_dir = get_user_data_dir() / "voiceprint"
    if not voiceprint_dir.exists():
        return {"success": True}
    deleted = 0
    for f in voiceprint_dir.glob("voiceprint_*.*"):
        try:
            f.unlink()
            deleted += 1
        except Exception:
            logger.exception("删除声纹文件失败: %s", f)
    logger.info("已删除 %d 个声纹文件", deleted)
    return {"success": True, "deleted": deleted}


@router.post("/reset")
async def reset_setup() -> dict[str, bool]:
    """Reset setup flag and backup memory directory."""
    _config_service.save_config({"setup.completed": False})

    memory_dir = get_user_data_dir() / "memory"
    if memory_dir.exists() and memory_dir.is_dir():
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        backup_dir = get_user_data_dir() / f"memory_backup_{timestamp}"
        try:
            os.rename(memory_dir, backup_dir)
            logger.info("Backed up memory directory to: %s", backup_dir)
            memory_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            logger.error("Failed to backup memory directory: %s", exc)

    return {"success": True}
