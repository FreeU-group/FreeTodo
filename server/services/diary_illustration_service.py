"""Diary illustration generation service."""

from __future__ import annotations

import asyncio
import base64
import json
import time
from pathlib import Path
from typing import Any, Literal, cast

import httpx
from apscheduler.triggers.cron import CronTrigger
from openai import OpenAI

from jobs.job_manager import get_job_manager
from llm.llm_client import LLMClient
from memory.reader import MemoryReader
from util.base_paths import get_user_data_dir
from util.logging_config import get_logger
from util.settings import settings
from util.time_utils import local_today_str

logger = get_logger()

ILLUSTRATIONS_DIR_NAME = "diary_illustrations"
GEMINI_MODEL = "gemini-3-pro-image-preview"
DEFAULT_VOLCENGINE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
DEFAULT_VOLCENGINE_IMAGE_MODEL = "doubao-seedream-5.0-lite"
DEFAULT_VOLCENGINE_IMAGE_SIZE = "1024x1024"
DEFAULT_DIARY_PROVIDER = "volcengine"
SUPPORTED_DIARY_PROVIDERS = {"volcengine", "gemini"}
SUPPORTED_VOLCENGINE_IMAGE_SIZES = {
    "auto",
    "256x256",
    "512x512",
    "1024x1024",
    "1536x1024",
    "1024x1536",
    "1792x1024",
    "1024x1792",
}
VolcengineImageSize = Literal[
    "auto",
    "256x256",
    "512x512",
    "1024x1024",
    "1536x1024",
    "1024x1536",
    "1792x1024",
    "1024x1792",
]
DIARY_ILLUSTRATION_JOB_ID = "diary_illustration_job"
DIARY_ILLUSTRATION_JOB_NAME = "日记插画生成"
DEFAULT_DIARY_ILLUSTRATION_CRON = "0 22 * * *"
CRON_FIELD_COUNT = 5

PROMPT_SYSTEM = (
    "You are a comic storyboard artist. Split the user's day into 2 to 5 key scenes, "
    "then write one standalone English image prompt for each scene.\n"
    "Requirements:\n"
    "- Each scene should represent a distinct important moment in chronological order.\n"
    "- Each prompt should be 90 to 140 words and describe a single comic panel.\n"
    "- Keep the same protagonist appearance across all panels.\n"
    "- Include action, expression, environment, lighting, composition, and dialogue bubble text.\n"
    "- End every prompt with: manga panel, warm anime style, detailed background, "
    "speech bubbles with text, soft lighting, consistent character.\n"
    "Return strict JSON only:\n"
    '[{"scene":"title","prompt":"english prompt"}, ...]'
)

PROMPT_USER_TEMPLATE = """Daily event summary:
{events}

Split it into multiple comic scenes and return JSON only."""


class DiaryIllustrationService:
    """Generate and serve diary illustration panels."""

    def __init__(self, llm_client: LLMClient):
        self._llm = llm_client
        self._memory_reader = MemoryReader(get_user_data_dir() / "memory")
        self._illustrations_dir = get_user_data_dir() / ILLUSTRATIONS_DIR_NAME
        self._illustrations_dir.mkdir(parents=True, exist_ok=True)

    async def generate_for_date(self, date_str: str | None = None) -> dict[str, Any]:
        date_str = date_str or local_today_str()
        self._clean_date_images(date_str)

        events_content = self._memory_reader.read_by_date(date_str)
        if not events_content or not events_content.strip():
            return {
                "ok": False,
                "date": date_str,
                "count": 0,
                "paths": [],
                "error": f"No events for {date_str}",
            }

        try:
            scenes = await self._build_scene_prompts(events_content)
        except Exception as exc:
            logger.exception("DiaryIllustration: scene prompt generation failed")
            return {
                "ok": False,
                "date": date_str,
                "count": 0,
                "paths": [],
                "error": str(exc),
            }

        if not scenes:
            return {
                "ok": False,
                "date": date_str,
                "count": 0,
                "paths": [],
                "error": "LLM returned no scenes",
            }

        saved_paths: list[str] = []
        for idx, scene in enumerate(scenes):
            prompt = str(scene.get("prompt", "")).strip()
            if not prompt:
                continue
            try:
                image_bytes = await self._call_image_provider(prompt)
                out_path = self._illustrations_dir / f"{date_str}_{idx + 1}.png"
                out_path.write_bytes(image_bytes)
                saved_paths.append(str(out_path))
                logger.info(
                    "DiaryIllustration: saved panel %d/%d to %s",
                    idx + 1,
                    len(scenes),
                    out_path,
                )
            except Exception:
                logger.exception("DiaryIllustration: panel %d generation failed", idx + 1)

        return {
            "ok": len(saved_paths) > 0,
            "date": date_str,
            "count": len(saved_paths),
            "paths": saved_paths,
            "error": None if saved_paths else "No images were generated",
        }

    def get_illustration_paths(self, date_str: str | None = None) -> list[Path]:
        date_str = date_str or local_today_str()
        return sorted(self._illustrations_dir.glob(f"{date_str}_*.png"))

    def get_illustration_path(self, date_str: str | None = None) -> Path | None:
        paths = self.get_illustration_paths(date_str)
        return paths[0] if paths else None

    def _clean_date_images(self, date_str: str) -> None:
        for path in self._illustrations_dir.glob(f"{date_str}_*.png"):
            path.unlink(missing_ok=True)

    async def _build_scene_prompts(self, events_content: str) -> list[dict[str, Any]]:
        messages = [
            {"role": "system", "content": PROMPT_SYSTEM},
            {
                "role": "user",
                "content": PROMPT_USER_TEMPLATE.format(events=events_content[:4000]),
            },
        ]
        response = await asyncio.to_thread(
            self._llm.chat,
            messages,
            0.7,
            None,
            1200,
            log_usage=True,
            log_meta={
                "endpoint": "diary_illustration_prompt",
                "feature_type": "diary_illustration",
            },
        )
        text = response.strip()
        if not text:
            raise ValueError("LLM returned empty response")

        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1:
            raise ValueError(f"LLM response is not a JSON array: {text[:200]}")

        scenes = json.loads(text[start : end + 1])
        if not isinstance(scenes, list):
            raise ValueError("LLM returned non-list JSON")
        return scenes[:6]

    async def _call_image_provider(self, prompt: str) -> bytes:
        provider = _get_diary_provider()
        if provider == "gemini":
            return await self._call_gemini(prompt)
        if provider == "volcengine":
            return await self._call_volcengine(prompt)
        raise ValueError(f"Unsupported diary illustration provider: {provider}")

    async def _call_gemini(self, prompt: str) -> bytes:
        cfg = _get_banna2_config()
        api_key = str(cfg.get("api_key", "")).strip()
        ref_image_path = str(cfg.get("ref_image_path", "")).strip()

        if not api_key:
            raise ValueError("banna2.api_key is not configured")

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{GEMINI_MODEL}:generateContent?key={api_key}"
        )

        parts: list[dict[str, Any]] = []
        ref_path = Path(ref_image_path) if ref_image_path else None
        if ref_path and ref_path.exists():
            suffix = ref_path.suffix.lower()
            mime_type = (
                "image/jpeg" if suffix in {".jpg", ".jpeg"} else f"image/{suffix.lstrip('.')}"
            )
            img_b64 = base64.b64encode(ref_path.read_bytes()).decode()
            parts.append({"inline_data": {"mime_type": mime_type, "data": img_b64}})
            parts.append(
                {"text": (f"Use the person in the reference image as the main character. {prompt}")}
            )
        else:
            parts.append({"text": prompt})

        payload = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
        }
        return await asyncio.to_thread(self._gemini_request, url, payload)

    async def _call_volcengine(self, prompt: str) -> bytes:
        cfg = _get_volcengine_config()
        api_key = str(cfg.get("api_key", "")).strip()
        base_url = str(cfg.get("base_url", DEFAULT_VOLCENGINE_BASE_URL)).strip()
        model = str(cfg.get("image_model", DEFAULT_VOLCENGINE_IMAGE_MODEL)).strip()
        size = str(cfg.get("image_size", DEFAULT_VOLCENGINE_IMAGE_SIZE)).strip()

        if not api_key:
            raise ValueError("volcengine.api_key is not configured")
        return await asyncio.to_thread(
            self._volcengine_request, base_url, api_key, model, prompt, size
        )

    @staticmethod
    def _gemini_request(url: str, payload: dict[str, Any]) -> bytes:
        with httpx.Client(timeout=180) as client:
            response = client.post(url, json=payload, headers={"Content-Type": "application/json"})
            response.raise_for_status()
            data = response.json()

        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError(f"Gemini returned no candidates: {json.dumps(data)[:300]}")

        for part in candidates[0].get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])

        raise ValueError(f"Gemini response contained no image data: {json.dumps(data)[:300]}")

    @staticmethod
    def _volcengine_request(
        base_url: str,
        api_key: str,
        model: str,
        prompt: str,
        size: str,
    ) -> bytes:
        client = OpenAI(api_key=api_key, base_url=base_url.rstrip("/"))
        normalized_size = (
            size if size in SUPPORTED_VOLCENGINE_IMAGE_SIZES else DEFAULT_VOLCENGINE_IMAGE_SIZE
        )
        response = client.images.generate(
            model=model,
            prompt=prompt,
            size=cast("VolcengineImageSize", normalized_size),
            response_format="b64_json",
        )

        if not response.data:
            raise ValueError("Volcengine returned no image data")

        image = response.data[0]
        b64_json = getattr(image, "b64_json", None)
        if b64_json:
            return base64.b64decode(b64_json)

        image_url = getattr(image, "url", None)
        if image_url:
            with httpx.Client(timeout=180) as http_client:
                download_response = http_client.get(image_url)
                download_response.raise_for_status()
                return download_response.content

        raise ValueError("Volcengine response contained no image payload")


def _get_banna2_config() -> dict[str, Any]:
    raw = settings.get("banna2", {}) or {}
    return dict(raw) if isinstance(raw, dict) else {}


def _get_volcengine_config() -> dict[str, Any]:
    raw = settings.get("volcengine", {}) or {}
    return dict(raw) if isinstance(raw, dict) else {}


def _get_diary_provider() -> str:
    job_cfg = settings.get("jobs.diary_illustration", {}) or {}
    provider = str(job_cfg.get("provider", DEFAULT_DIARY_PROVIDER)).strip().lower()
    if provider in SUPPORTED_DIARY_PROVIDERS:
        return provider
    return DEFAULT_DIARY_PROVIDER


_SERVICE_HOLDER: dict[str, DiaryIllustrationService | None] = {"service": None}


def get_diary_illustration_service() -> DiaryIllustrationService | None:
    return _SERVICE_HOLDER["service"]


def init_diary_illustration_service(llm_client: LLMClient) -> DiaryIllustrationService:
    service = DiaryIllustrationService(llm_client)
    _SERVICE_HOLDER["service"] = service
    return service


def clear_diary_illustration_service() -> None:
    _SERVICE_HOLDER["service"] = None


def ensure_diary_illustration_service() -> DiaryIllustrationService | None:
    llm = LLMClient()
    if not llm.is_available():
        clear_diary_illustration_service()
        logger.info("DiaryIllustration: LLM not available, service not initialized")
        return None

    service = get_diary_illustration_service()
    if service is None:
        service = init_diary_illustration_service(llm)
        logger.info("DiaryIllustration: service initialized")
    return service


def _parse_diary_cron_expr(cron_expr: str | None) -> tuple[str, str, str, str, str]:
    parts = str(cron_expr or DEFAULT_DIARY_ILLUSTRATION_CRON).strip().split()
    if len(parts) != CRON_FIELD_COUNT:
        parts = DEFAULT_DIARY_ILLUSTRATION_CRON.split()
    minute, hour, day, month, day_of_week = parts
    return minute, hour, day, month, day_of_week


def _get_diary_scheduler(wait_for_scheduler: bool = False):
    manager = get_job_manager()
    retry_times = 20 if wait_for_scheduler else 1

    for _ in range(retry_times):
        scheduler_manager = getattr(manager, "scheduler_manager", None)
        scheduler = getattr(scheduler_manager, "scheduler", None)
        if scheduler is not None:
            return scheduler_manager, scheduler
        if wait_for_scheduler:
            time.sleep(0.25)

    return None, None


def sync_diary_illustration_job(wait_for_scheduler: bool = False) -> bool:
    scheduler_manager, scheduler = _get_diary_scheduler(wait_for_scheduler=wait_for_scheduler)
    if scheduler_manager is None or scheduler is None:
        logger.warning("DiaryIllustration: scheduler not ready, skipped cron registration")
        return False

    job_cfg = settings.get("jobs.diary_illustration", {}) or {}
    enabled = bool(job_cfg.get("enabled", False))

    if not enabled:
        if scheduler_manager.get_job(DIARY_ILLUSTRATION_JOB_ID):
            scheduler_manager.remove_job(DIARY_ILLUSTRATION_JOB_ID)
            logger.info("DiaryIllustration: scheduled job removed because feature is disabled")
        return True

    service = ensure_diary_illustration_service()
    if service is None:
        if scheduler_manager.get_job(DIARY_ILLUSTRATION_JOB_ID):
            scheduler_manager.remove_job(DIARY_ILLUSTRATION_JOB_ID)
        return False

    minute, hour, day, month, day_of_week = _parse_diary_cron_expr(job_cfg.get("cron"))
    cron_expr = f"{minute} {hour} {day} {month} {day_of_week}"

    async def _run_daily_illustration() -> None:
        try:
            result = await service.generate_for_date()
            if result["ok"]:
                logger.info(
                    "DiaryIllustration: daily job completed, generated=%s",
                    result["count"],
                )
            else:
                logger.warning(
                    "DiaryIllustration: daily job failed: %s",
                    result.get("error"),
                )
        except Exception:
            logger.exception("DiaryIllustration: daily job error")

    scheduler.add_job(
        _run_daily_illustration,
        trigger=CronTrigger(
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
        ),
        id=DIARY_ILLUSTRATION_JOB_ID,
        name=DIARY_ILLUSTRATION_JOB_NAME,
        replace_existing=True,
    )
    logger.info("DiaryIllustration: scheduled job registered (cron=%s)", cron_expr)
    return True
