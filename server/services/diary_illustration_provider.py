"""Provider and scheduling helpers for diary illustration service."""

from __future__ import annotations

import base64
import json
import time
from typing import Any, cast

import httpx
from apscheduler.triggers.cron import CronTrigger
from openai import BadRequestError, NotFoundError, OpenAI

from jobs.job_manager import get_job_manager
from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()


def get_banna2_config() -> dict[str, Any]:
    raw = settings.get("banna2", {}) or {}
    return dict(raw) if isinstance(raw, dict) else {}


def get_volcengine_config() -> dict[str, Any]:
    raw = settings.get("volcengine", {}) or {}
    return dict(raw) if isinstance(raw, dict) else {}


def get_diary_provider(default_provider: str, supported_providers: set[str]) -> str:
    job_cfg = settings.get("jobs.diary_illustration", {}) or {}
    provider = str(job_cfg.get("provider", default_provider)).strip().lower()
    if provider in supported_providers:
        return provider
    return default_provider


def has_gemini_config(config: dict[str, Any] | None = None) -> bool:
    cfg = config if config is not None else get_banna2_config()
    api_key = str(cfg.get("api_key", "")).strip()
    return bool(api_key and not api_key.startswith("YOUR_"))


def has_volcengine_config(config: dict[str, Any] | None = None) -> bool:
    cfg = config if config is not None else get_volcengine_config()
    api_key = str(cfg.get("api_key", "")).strip()
    return bool(api_key and not api_key.startswith("YOUR_"))


def get_diary_provider_order(default_provider: str, supported_providers: set[str]) -> list[str]:
    preferred = get_diary_provider(default_provider, supported_providers)
    fallback = "volcengine" if preferred == "gemini" else "gemini"
    provider_order: list[str] = []
    if preferred == "gemini":
        if has_gemini_config():
            provider_order.append("gemini")
        if has_volcengine_config():
            provider_order.append("volcengine")
    else:
        if has_volcengine_config():
            provider_order.append("volcengine")
        if has_gemini_config():
            provider_order.append("gemini")
    return provider_order or [preferred, fallback]


def parse_image_size(size: str) -> tuple[int, int]:
    try:
        width_text, height_text = size.lower().split("x", maxsplit=1)
        return int(width_text), int(height_text)
    except (AttributeError, ValueError):
        return 0, 0


def normalize_volcengine_image_size(
    model: str,
    size: str,
    *,
    supported_sizes: set[str],
    default_size: str,
    min_pixel_model: str,
    min_pixels: int,
    min_pixel_size: str,
) -> str:
    normalized = size if size in supported_sizes else default_size
    if normalized == "auto":
        return default_size
    if model == min_pixel_model:
        width, height = parse_image_size(normalized)
        if width * height < min_pixels:
            return min_pixel_size
    return normalized


def gemini_request(url: str, payload: dict[str, Any], *, model_name: str) -> bytes:
    log_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key=***"
    logger.info("DiaryIllustration: Gemini API request model=%s", model_name)
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
            return base64.b64decode(inline["data"])
    logger.error(
        "DiaryIllustration: Gemini response has no image data parts_count=%d response_preview=%s",
        len(parts),
        json.dumps(data)[:400],
    )
    raise ValueError(f"Gemini response contained no image data: {json.dumps(data)[:300]}")


def volcengine_request(  # noqa: PLR0913
    base_url: str,
    api_key: str,
    model: str,
    prompt: str,
    size: str,
    *,
    supported_sizes: set[str],
    default_size: str,
    min_pixel_model: str,
    min_pixels: int,
    min_pixel_size: str,
) -> bytes:
    client = OpenAI(api_key=api_key, base_url=base_url.rstrip("/"))
    normalized_size = normalize_volcengine_image_size(
        model,
        size,
        supported_sizes=supported_sizes,
        default_size=default_size,
        min_pixel_model=min_pixel_model,
        min_pixels=min_pixels,
        min_pixel_size=min_pixel_size,
    )
    try:
        response = client.images.generate(
            model=model,
            prompt=prompt,
            size=cast("Any", normalized_size),
            response_format="b64_json",
        )
    except NotFoundError as exc:
        raise ValueError(
            f"Volcengine model or endpoint '{model}' was not found or is not accessible. Please check the image model / endpoint setting and your Ark access permissions."
        ) from exc
    except BadRequestError as exc:
        message = str(exc)
        if "image size must be at least" in message:
            raise ValueError(
                f"Volcengine model '{model}' requires a larger image size. Please use at least {min_pixel_size}."
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


def parse_diary_cron_expr(
    cron_expr: str | None, default_cron: str, cron_field_count: int
) -> tuple[str, str, str, str, str]:
    parts = str(cron_expr or default_cron).strip().split()
    if len(parts) != cron_field_count:
        parts = default_cron.split()
    minute, hour, day, month, day_of_week = parts
    return minute, hour, day, month, day_of_week


def get_diary_scheduler(wait_for_scheduler: bool = False):
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


def remove_job_if_exists(scheduler_manager: Any, job_id: str) -> None:
    if scheduler_manager.get_job(job_id):
        scheduler_manager.remove_job(job_id)


def register_diary_job(
    scheduler, *, job_id: str, job_name: str, cron_expr: tuple[str, str, str, str, str], callback
) -> None:
    minute, hour, day, month, day_of_week = cron_expr
    scheduler.add_job(
        callback,
        trigger=CronTrigger(
            minute=minute, hour=hour, day=day, month=month, day_of_week=day_of_week
        ),
        id=job_id,
        name=job_name,
        replace_existing=True,
    )
