"""Diary illustration generation service."""

from __future__ import annotations

import asyncio
import base64
import time
from pathlib import Path
from typing import Any

from llm.llm_client import LLMClient
from memory.reader import MemoryReader
from services.diary_illustration_generation import (
    build_scene_prompts,
    call_gemini,
    call_image_provider,
    call_volcengine,
)
from services.diary_illustration_provider import (
    gemini_request,
    get_banna2_config,
    get_diary_provider_order,
    get_diary_scheduler,
    get_volcengine_config,
    parse_diary_cron_expr,
    register_diary_job,
    remove_job_if_exists,
    volcengine_request,
)
from util.base_paths import get_user_data_dir
from util.logging_config import get_logger
from util.settings import settings
from util.time_utils import local_today_str

logger = get_logger()

ILLUSTRATIONS_DIR_NAME = "diary_illustrations"
GEMINI_MODEL = "gemini-3-pro-image-preview"
DEFAULT_VOLCENGINE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
DEFAULT_VOLCENGINE_IMAGE_MODEL = "doubao-seedream-5-0-260128"
DEFAULT_VOLCENGINE_IMAGE_SIZE = "2048x2048"
DEFAULT_MIN_PIXEL_IMAGE_SIZE = "2048x2048"
DOUBAO_SEEDREAM_MIN_PIXELS = 4_194_304
DEFAULT_DIARY_PROVIDER = "gemini"
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
    "2048x2048",
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
        last_error: str | None = None
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
                image_bytes = await self._call_image_provider(prompt)
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
                last_error = str(exc)
                logger.exception(
                    "DiaryIllustration: panel %d generation failed scene=%s error=%s",
                    idx + 1,
                    scene_title,
                    exc,
                )

        ok = len(saved_paths) > 0
        result = {
            "ok": ok,
            "date": date_str,
            "count": len(saved_paths),
            "paths": saved_paths,
            "error": None if saved_paths else (last_error or "No images were generated"),
        }
        logger.info(
            "DiaryIllustration: generate_for_date done date=%s ok=%s count=%d/%d",
            date_str,
            ok,
            len(saved_paths),
            len(scenes),
        )
        result = {
            "ok": ok,
            "date": date_str,
            "count": len(saved_paths),
            "paths": saved_paths,
            "error": None if saved_paths else "No images were generated",
        }
        self._update_generation_status(
            date_str,
            state="completed" if result["ok"] else "failed",
            message="Comic panels ready" if result["ok"] else "Comic panel generation failed",
            is_generating=False,
            completed_panels=len(saved_paths),
            total_panels=len(scenes),
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
        return await build_scene_prompts(
            self._llm,
            events_content=events_content,
            system_prompt=PROMPT_SYSTEM,
            user_template=PROMPT_USER_TEMPLATE,
        )

    async def _call_image_provider(self, prompt: str) -> bytes:
        return await call_image_provider(
            prompt,
            provider_order=_get_diary_provider_order(),
            gemini_factory=self._call_gemini,
            volcengine_factory=self._call_volcengine,
        )

    async def _call_gemini(self, prompt: str) -> bytes:
        return await call_gemini(
            prompt,
            config=get_banna2_config(),
            model_name=GEMINI_MODEL,
            prompt_log_preview_len=PROMPT_LOG_PREVIEW_LEN,
            request_fn=self._gemini_request,
        )

    async def _call_volcengine(self, prompt: str) -> bytes:
        return await call_volcengine(
            prompt,
            config=get_volcengine_config(),
            default_base_url=DEFAULT_VOLCENGINE_BASE_URL,
            default_model=DEFAULT_VOLCENGINE_IMAGE_MODEL,
            default_size=DEFAULT_VOLCENGINE_IMAGE_SIZE,
            request_fn=self._volcengine_request,
        )

    @staticmethod
    def _gemini_request(url: str, payload: dict[str, Any]) -> bytes:
        return gemini_request(url, payload, model_name=GEMINI_MODEL)

    @staticmethod
    def _volcengine_request(
        base_url: str, api_key: str, model: str, prompt: str, size: str
    ) -> bytes:
        return volcengine_request(
            base_url,
            api_key,
            model,
            prompt,
            size,
            supported_sizes=SUPPORTED_VOLCENGINE_IMAGE_SIZES,
            default_size=DEFAULT_VOLCENGINE_IMAGE_SIZE,
            min_pixel_model=DEFAULT_VOLCENGINE_IMAGE_MODEL,
            min_pixels=DOUBAO_SEEDREAM_MIN_PIXELS,
            min_pixel_size=DEFAULT_MIN_PIXEL_IMAGE_SIZE,
        )


def _get_diary_provider_order() -> list[str]:
    return get_diary_provider_order(DEFAULT_DIARY_PROVIDER, SUPPORTED_DIARY_PROVIDERS)


def test_diary_provider_config(
    provider: str,
    config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    provider_name = provider.strip().lower()

    if provider_name == "gemini":
        cfg = config if config is not None else get_banna2_config()
        api_key = str(cfg.get("api_key", "")).strip()
        ref_image_path = str(cfg.get("ref_image_path", "")).strip()
        if not api_key:
            raise ValueError("banna2.api_key is not configured")

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{GEMINI_MODEL}:generateContent?key={api_key}"
        )
        parts = [{"text": "Generate a tiny test image of a blue circle."}]

        ref_path = Path(ref_image_path) if ref_image_path else None
        if ref_path and ref_path.exists():
            suffix = ref_path.suffix.lower()
            mime_type = (
                "image/jpeg" if suffix in {".jpg", ".jpeg"} else f"image/{suffix.lstrip('.')}"
            )
            img_b64 = base64.b64encode(ref_path.read_bytes()).decode()
            parts.insert(0, {"inline_data": {"mime_type": mime_type, "data": img_b64}})

        payload = {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
        }
        DiaryIllustrationService._gemini_request(url, payload)
        return {"provider": "gemini", "message": "Gemini image generation is available"}

    if provider_name == "volcengine":
        cfg = config if config is not None else get_volcengine_config()
        api_key = str(cfg.get("api_key", "")).strip()
        base_url = str(cfg.get("base_url", DEFAULT_VOLCENGINE_BASE_URL)).strip()
        model = str(cfg.get("image_model", DEFAULT_VOLCENGINE_IMAGE_MODEL)).strip()
        size = str(cfg.get("image_size", DEFAULT_VOLCENGINE_IMAGE_SIZE)).strip()
        if not api_key:
            raise ValueError("volcengine.api_key is not configured")

        DiaryIllustrationService._volcengine_request(
            base_url,
            api_key,
            model,
            "Generate a tiny test image of a blue circle.",
            size,
        )
        return {"provider": "volcengine", "message": "Volcengine image generation is available"}

    raise ValueError(f"Unsupported diary illustration provider: {provider}")


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


def sync_diary_illustration_job(wait_for_scheduler: bool = False) -> bool:
    scheduler_manager, scheduler = get_diary_scheduler(wait_for_scheduler=wait_for_scheduler)
    if scheduler_manager is None or scheduler is None:
        logger.warning("DiaryIllustration: scheduler not ready, skipped cron registration")
        return False

    job_cfg = settings.get("jobs.diary_illustration", {}) or {}
    enabled = bool(job_cfg.get("enabled", False))

    if not enabled:
        remove_job_if_exists(scheduler_manager, DIARY_ILLUSTRATION_JOB_ID)
        logger.info("DiaryIllustration: scheduled job removed because feature is disabled")
        return True

    service = ensure_diary_illustration_service()
    if service is None:
        remove_job_if_exists(scheduler_manager, DIARY_ILLUSTRATION_JOB_ID)
        return False

    minute, hour, day, month, day_of_week = parse_diary_cron_expr(
        job_cfg.get("cron"),
        DEFAULT_DIARY_ILLUSTRATION_CRON,
        CRON_FIELD_COUNT,
    )
    cron_expr = f"{minute} {hour} {day} {month} {day_of_week}"

    register_diary_job(
        scheduler,
        job_id=DIARY_ILLUSTRATION_JOB_ID,
        job_name=DIARY_ILLUSTRATION_JOB_NAME,
        cron_expr=(minute, hour, day, month, day_of_week),
        callback=_run_daily_diary_job,
    )
    logger.info("DiaryIllustration: scheduled job registered (cron=%s)", cron_expr)
    return True
