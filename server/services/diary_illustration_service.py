"""Diary illustration generation service."""

from __future__ import annotations

import asyncio
import base64
import json
import time
from pathlib import Path
from typing import Any, cast

import httpx
from apscheduler.triggers.cron import CronTrigger
from openai import BadRequestError, NotFoundError, OpenAI

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
DEFAULT_VOLCENGINE_IMAGE_MODEL = "doubao-seedream-5-0-260128"
DEFAULT_VOLCENGINE_IMAGE_SIZE = "1024x1024"
DEFAULT_MIN_PIXEL_IMAGE_SIZE = "1024x1024"
DOUBAO_SEEDREAM_MIN_PIXELS = 1_048_576
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
    "1920x1920",
}
PROMPT_LOG_PREVIEW_LEN = 80
DIARY_ILLUSTRATION_JOB_ID = "diary_illustration_job"
DIARY_ILLUSTRATION_JOB_NAME = "日记插画生成"
DEFAULT_DIARY_ILLUSTRATION_CRON = "0 22 * * *"
CRON_FIELD_COUNT = 5
MAX_PARALLEL_PANEL_GENERATIONS = 3

PROMPT_SYSTEM = (
    "You are a manga page artist. Given events from the user's day, create 1 to 3 manga PAGE prompts.\n"
    "Each page should be a FULL manga page layout containing 2 to 4 panels with panel borders.\n\n"
    "Requirements:\n"
    "- Each prompt describes ONE full manga page with multiple panels arranged in a comic grid layout.\n"
    "- Describe the panel layout explicitly (e.g. 'Top half: wide establishing shot of... "
    "Bottom-left panel: close-up of... Bottom-right panel: ...').\n"
    "- Keep the same protagonist appearance across all pages.\n"
    "- Include short dialogue or thought bubbles with text in each panel.\n"
    "- Vary panel sizes: mix wide shots, close-ups, and medium shots.\n"
    "- Each prompt should be 120 to 200 words.\n"
    "- End every prompt with: manga page layout, panel borders, speech bubbles with text, "
    "warm anime style, varied panel sizes, soft lighting, consistent character design.\n\n"
    "Return strict JSON only:\n"
    '[{"page":"page title","prompt":"english prompt describing full manga page layout"}, ...]'
)

PROMPT_USER_TEMPLATE = """Daily event summary:
{events}

Create manga page prompts (each page has multiple panels). Return JSON only."""

DIARY_TEXT_SYSTEM_PROMPT = (
    "你是一个温暖且高效的个人日记助手。"
    "根据用户今天的事件流，生成一段结构化的日记文本。\n"
    "格式要求（严格遵守）：\n"
    "1. 先用一段自然流畅的话描述今天做了什么（不超过 200 字）\n"
    "2. 然后列出接下来可能需要做的 next action（2-5 条，用「📋 接下来可以做：」开头）\n"
    "3. 最后用一句温暖的话鼓励用户（用「💪」开头）\n\n"
    "注意：语言简洁温暖，使用中文，不要冗长，不要加标题。"
)

DIARY_TEXT_USER_TEMPLATE = """今天的事件流：
{events}

请根据以上事件流生成日记文本。"""


class DiaryIllustrationService:
    """Generate and serve diary illustration panels."""

    def __init__(self, llm_client: LLMClient):
        self._llm = llm_client
        self._memory_reader = MemoryReader(get_user_data_dir() / "memory")
        self._illustrations_dir = get_user_data_dir() / ILLUSTRATIONS_DIR_NAME
        self._illustrations_dir.mkdir(parents=True, exist_ok=True)
        self._generation_status: dict[str, dict[str, Any]] = {}
        self._generation_tasks: dict[str, asyncio.Task[dict[str, Any]]] = {}

    async def start_generation(self, date_str: str | None = None) -> dict[str, Any]:
        date_str = date_str or local_today_str()
        existing_task = self._generation_tasks.get(date_str)
        if existing_task is not None and not existing_task.done():
            return self.get_generation_status(date_str)

        task = asyncio.create_task(self._run_generation_task(date_str))
        self._generation_tasks[date_str] = task
        await asyncio.sleep(0)
        return self.get_generation_status(date_str)

    async def _run_generation_task(self, date_str: str) -> dict[str, Any]:
        try:
            return await self.generate_for_date(date_str)
        finally:
            self._generation_tasks.pop(date_str, None)

    def get_generation_status(self, date_str: str | None = None) -> dict[str, Any]:
        date_str = date_str or local_today_str()
        paths = self.get_illustration_paths(date_str)
        status = dict(self._generation_status.get(date_str, {}))
        state = str(status.get("state", "idle"))
        is_generating = bool(status.get("is_generating", False))
        completed_panels = int(status.get("completed_panels", len(paths)) or 0)
        total_panels = int(status.get("total_panels", max(completed_panels, len(paths))) or 0)
        return {
            "date": date_str,
            "exists": len(paths) > 0,
            "count": len(paths),
            "state": state,
            "message": status.get("message"),
            "is_generating": is_generating,
            "completed_panels": completed_panels,
            "total_panels": total_panels,
            "error": status.get("error"),
            "started_at": status.get("started_at"),
            "updated_at": status.get("updated_at"),
        }

    def _update_generation_status(self, date_str: str, **patch: Any) -> None:
        now = time.time()
        current = dict(self._generation_status.get(date_str, {}))
        current.update(patch)
        current["updated_at"] = now
        current.setdefault("started_at", now)
        self._generation_status[date_str] = current

    async def generate_for_date(self, date_str: str | None = None) -> dict[str, Any]:
        date_str = date_str or local_today_str()
        logger.info("DiaryIllustration: start generate_for_date date=%s", date_str)
        self._update_generation_status(
            date_str,
            state="preparing",
            message="Loading diary events",
            is_generating=True,
            error=None,
            total_panels=0,
            completed_panels=0,
            started_at=time.time(),
        )
        self._clean_date_images(date_str)

        events_content = self._memory_reader.read_by_date(date_str)
        if not events_content or not events_content.strip():
            logger.warning("DiaryIllustration: no events for date=%s", date_str)
            result = {
                "ok": False,
                "date": date_str,
                "count": 0,
                "paths": [],
                "error": f"No events for {date_str}",
            }
            self._update_generation_status(
                date_str,
                state="failed",
                message="No diary events found",
                is_generating=False,
                error=result["error"],
            )
            return result

        try:
            self._update_generation_status(
                date_str,
                state="storyboarding",
                message="Generating comic storyboard",
            )

        logger.info(
            "DiaryIllustration: loaded events for %s, length=%d chars",
            date_str,
            len(events_content),
        )
        try:
            scenes = await self._build_scene_prompts(events_content)
        except Exception as exc:
            logger.exception(
                "DiaryIllustration: scene prompt generation failed, error=%s",
                exc,
            )
            result = {
                "ok": False,
                "date": date_str,
                "count": 0,
                "paths": [],
                "error": str(exc),
            }
            self._update_generation_status(
                date_str,
                state="failed",
                message="Comic storyboard generation failed",
                is_generating=False,
                error=result["error"],
            )
            return result

        if not scenes:
            logger.warning("DiaryIllustration: LLM returned no scenes for date=%s", date_str)
            return {
                "ok": False,
                "date": date_str,
                "count": 0,
                "paths": [],
                "error": "LLM returned no scenes",
            }

        logger.info(
            "DiaryIllustration: got %d scenes, starting image generation",
            len(scenes),
        )
        saved_paths: list[str] = []
        for idx, scene in enumerate(scenes):
            prompt = str(scene.get("prompt", "")).strip()
            scene_title = scene.get("scene", "?")
            if not prompt:
                logger.warning(
                    "DiaryIllustration: skip panel %d, empty prompt (scene=%s)",
                    idx + 1,
                    scene_title,
                )
                continue
            try:
                logger.info(
                    "DiaryIllustration: generating panel %d/%d scene=%s prompt_len=%d",
                    idx + 1,
                    len(scenes),
                    scene_title,
                    len(prompt),
                )
                image_bytes = await self._call_gemini(prompt)
                out_path = self._illustrations_dir / f"{date_str}_{idx + 1}.png"
                out_path.write_bytes(image_bytes)
                saved_paths.append(str(out_path))
                logger.info(
                    "DiaryIllustration: saved panel %d/%d to %s size=%d bytes",
                    idx + 1,
                    len(scenes),
                    out_path,
                    len(image_bytes),
                )
            except Exception as exc:
                logger.exception(
                    "DiaryIllustration: panel %d generation failed scene=%s error=%s",
                    idx + 1,
                    scene_title,
                    exc,
                )

        ok = len(saved_paths) > 0
        logger.info(
            "DiaryIllustration: generate_for_date done date=%s ok=%s count=%d/%d",
            date_str,
            ok,
            len(saved_paths),
            len(scenes),
        )
        return {
            "ok": ok,
            "date": date_str,
            "count": len(saved_paths),
            "paths": saved_paths,
            "error": None if saved_paths else (last_error or "No images were generated"),
        }
        self._update_generation_status(
            date_str,
            state="completed" if result["ok"] else "failed",
            message="Comic panels ready" if result["ok"] else "Comic panel generation failed",
            is_generating=False,
            completed_panels=completed_panels,
            total_panels=total_panels,
            error=result["error"],
        )
        return result

    async def generate_diary_text(self, date_str: str | None = None) -> dict[str, Any]:
        """Generate diary text (summary + next actions + encouragement) from L2 events."""
        date_str = date_str or local_today_str()
        events_content = self._memory_reader.read_by_date(date_str)
        if not events_content or not events_content.strip():
            return {"ok": False, "date": date_str, "text": "", "error": f"No events for {date_str}"}

        messages = [
            {"role": "system", "content": DIARY_TEXT_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": DIARY_TEXT_USER_TEMPLATE.format(events=events_content[:4000]),
            },
        ]
        try:
            text = await asyncio.to_thread(
                self._llm.chat,
                messages,
                0.5,
                None,
                600,
                log_usage=True,
                log_meta={"endpoint": "diary_text_generation", "feature_type": "diary_text"},
            )
            return {"ok": True, "date": date_str, "text": text.strip()}
        except Exception as exc:
            logger.exception("DiaryIllustration: diary text generation failed")
            return {"ok": False, "date": date_str, "text": "", "error": str(exc)}

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
        events_truncated = events_content[:4000]
        logger.info(
            "DiaryIllustration: calling LLM for scene prompts, events_len=%d",
            len(events_truncated),
        )
        messages = [
            {"role": "system", "content": PROMPT_SYSTEM},
            {
                "role": "user",
                "content": PROMPT_USER_TEMPLATE.format(events=events_truncated),
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
            logger.error("DiaryIllustration: LLM returned empty response")
            raise ValueError("LLM returned empty response")

        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1:
            logger.error(
                "DiaryIllustration: LLM response is not JSON array, preview=%s",
                repr(text[:300]),
            )
            raise ValueError(f"LLM response is not a JSON array: {text[:200]}")

        try:
            scenes = json.loads(text[start : end + 1])
        except json.JSONDecodeError as e:
            logger.exception(
                "DiaryIllustration: JSON parse failed at pos %d, preview=%s",
                e.pos,
                repr(text[max(0, e.pos - 50) : e.pos + 50]),
            )
            raise
        if not isinstance(scenes, list):
            logger.error("DiaryIllustration: LLM returned non-list JSON type=%s", type(scenes))
            raise ValueError("LLM returned non-list JSON")
        logger.info("DiaryIllustration: parsed %d scenes from LLM", len(scenes))
        return scenes[:3]

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
            logger.error("DiaryIllustration: banna2.api_key is not configured")
            raise ValueError("banna2.api_key is not configured")

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{GEMINI_MODEL}:generateContent?key={api_key}"
        )

        parts: list[dict[str, Any]] = []
        ref_path = Path(ref_image_path) if ref_image_path else None
        if ref_path and ref_path.exists():
            logger.info(
                "DiaryIllustration: using ref_image ref=%s prompt_len=%d",
                ref_path,
                len(prompt),
            )
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
            logger.debug(
                "DiaryIllustration: text-only prompt model=%s prompt_preview=%s",
                GEMINI_MODEL,
                prompt[:PROMPT_LOG_PREVIEW_LEN] + "..."
                if len(prompt) > PROMPT_LOG_PREVIEW_LEN
                else prompt,
            )
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
        # Mask API key in logs: only log model and base URL
        log_url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key=***"
        logger.info("DiaryIllustration: Gemini API request model=%s", GEMINI_MODEL)
        with httpx.Client(timeout=180) as client:
            response = client.post(url, json=payload, headers={"Content-Type": "application/json"})
            if not response.is_success:
                body_preview = response.text[:500] if response.text else ""
                logger.error(
                    "DiaryIllustration: Gemini API HTTP error status=%d url=%s body=%s",
                    response.status_code,
                    log_url,
                    body_preview,
                )
                response.raise_for_status()
            data = response.json()

        candidates = data.get("candidates", [])
        if not candidates:
            err_msg = data.get("error", {}) or data
            logger.error(
                "DiaryIllustration: Gemini returned no candidates response=%s",
                json.dumps(err_msg)[:400],
            )
            raise ValueError(f"Gemini returned no candidates: {json.dumps(data)[:300]}")

        parts = candidates[0].get("content", {}).get("parts", [])
        for part in parts:
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                img_len = len(inline.get("data", ""))
                logger.info(
                    "DiaryIllustration: Gemini returned image data_len=%d",
                    img_len,
                )
                return base64.b64decode(inline["data"])

        logger.error(
            "DiaryIllustration: Gemini response has no image data parts_count=%d response_preview=%s",
            len(parts),
            json.dumps(data)[:400],
        )
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
        normalized_size = _normalize_volcengine_image_size(model, size)
        try:
            response = client.images.generate(
                model=model,
                prompt=prompt,
                size=cast("Any", normalized_size),
                response_format="b64_json",
            )
        except NotFoundError as exc:
            raise ValueError(
                f"Volcengine model or endpoint '{model}' was not found or is not accessible. "
                "Please check the image model / endpoint setting and your Ark access permissions."
            ) from exc
        except BadRequestError as exc:
            message = str(exc)
            if "image size must be at least" in message:
                raise ValueError(
                    f"Volcengine model '{model}' requires a larger image size. "
                    f"Please use at least {DEFAULT_MIN_PIXEL_IMAGE_SIZE}."
                ) from exc
            raise

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


def _normalize_volcengine_image_size(model: str, size: str) -> str:
    normalized = size if size in SUPPORTED_VOLCENGINE_IMAGE_SIZES else DEFAULT_VOLCENGINE_IMAGE_SIZE
    if normalized == "auto":
        return DEFAULT_VOLCENGINE_IMAGE_SIZE

    if model == DEFAULT_VOLCENGINE_IMAGE_MODEL:
        width, height = _parse_image_size(normalized)
        if width * height < DOUBAO_SEEDREAM_MIN_PIXELS:
            return DEFAULT_MIN_PIXEL_IMAGE_SIZE

    return normalized


def _parse_image_size(size: str) -> tuple[int, int]:
    try:
        width_text, height_text = size.lower().split("x", maxsplit=1)
        return int(width_text), int(height_text)
    except (AttributeError, ValueError):
        return 0, 0


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


async def _run_daily_diary_job() -> None:
    """Cron callback: generate diary text + illustration for today."""
    service = get_diary_illustration_service()
    if service is None:
        logger.warning("DiaryIllustration: service not available for daily job")
        return

    try:
        text_result = await service.generate_diary_text()
        if text_result["ok"]:
            logger.info("DiaryIllustration: daily diary text generated")
        else:
            logger.warning("DiaryIllustration: diary text failed: %s", text_result.get("error"))
    except Exception:
        logger.exception("DiaryIllustration: diary text error")

    try:
        result = await service.generate_for_date()
        if result["ok"]:
            logger.info("DiaryIllustration: daily job completed, generated=%s", result["count"])
        else:
            logger.warning("DiaryIllustration: daily job failed: %s", result.get("error"))
    except Exception:
        logger.exception("DiaryIllustration: daily job error")


def _remove_job_if_exists(scheduler_manager: Any, job_id: str) -> None:
    if scheduler_manager.get_job(job_id):
        scheduler_manager.remove_job(job_id)


def sync_diary_illustration_job(wait_for_scheduler: bool = False) -> bool:
    scheduler_manager, scheduler = _get_diary_scheduler(wait_for_scheduler=wait_for_scheduler)
    if scheduler_manager is None or scheduler is None:
        logger.warning("DiaryIllustration: scheduler not ready, skipped cron registration")
        return False

    job_cfg = settings.get("jobs.diary_illustration", {}) or {}
    enabled = bool(job_cfg.get("enabled", False))

    if not enabled:
        _remove_job_if_exists(scheduler_manager, DIARY_ILLUSTRATION_JOB_ID)
        logger.info("DiaryIllustration: scheduled job removed because feature is disabled")
        return True

    service = ensure_diary_illustration_service()
    if service is None:
        _remove_job_if_exists(scheduler_manager, DIARY_ILLUSTRATION_JOB_ID)
        return False

    minute, hour, day, month, day_of_week = _parse_diary_cron_expr(job_cfg.get("cron"))
    cron_expr = f"{minute} {hour} {day} {month} {day_of_week}"

    scheduler.add_job(
        _run_daily_diary_job,
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
