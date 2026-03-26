"""Generation helpers for diary illustration service."""

from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path
from typing import Any

from util.logging_config import get_logger

logger = get_logger()


async def build_scene_prompts(
    llm_client, *, events_content: str, system_prompt: str, user_template: str
) -> list[dict[str, Any]]:
    events_truncated = events_content[:4000]
    logger.info(
        "DiaryIllustration: calling LLM for scene prompts, events_len=%d", len(events_truncated)
    )
    response = await asyncio.to_thread(
        llm_client.chat,
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_template.format(events=events_truncated)},
        ],
        0.7,
        None,
        1200,
        log_usage=True,
        log_meta={"endpoint": "diary_illustration_prompt", "feature_type": "diary_illustration"},
    )
    text = response.strip()
    if not text:
        logger.error("DiaryIllustration: LLM returned empty response")
        raise ValueError("LLM returned empty response")
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        logger.error(
            "DiaryIllustration: LLM response is not JSON array, preview=%s", repr(text[:300])
        )
        raise ValueError(f"LLM response is not a JSON array: {text[:200]}")
    try:
        scenes = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        logger.exception(
            "DiaryIllustration: JSON parse failed at pos %d, preview=%s",
            exc.pos,
            repr(text[max(0, exc.pos - 50) : exc.pos + 50]),
        )
        raise
    if not isinstance(scenes, list):
        logger.error("DiaryIllustration: LLM returned non-list JSON type=%s", type(scenes))
        raise ValueError("LLM returned non-list JSON")
    logger.info("DiaryIllustration: parsed %d scenes from LLM", len(scenes))
    return scenes[:3]


async def call_gemini(
    prompt: str, *, config: dict[str, Any], model_name: str, prompt_log_preview_len: int, request_fn
) -> bytes:
    api_key = str(config.get("api_key", "")).strip()
    ref_image_path = str(config.get("ref_image_path", "")).strip()
    if not api_key:
        logger.error("DiaryIllustration: banna2.api_key is not configured")
        raise ValueError("banna2.api_key is not configured")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
    parts: list[dict[str, Any]] = []
    ref_path = Path(ref_image_path) if ref_image_path else None
    if ref_path and ref_path.exists():
        logger.info(
            "DiaryIllustration: using ref_image ref=%s prompt_len=%d", ref_path, len(prompt)
        )
        suffix = ref_path.suffix.lower()
        mime_type = "image/jpeg" if suffix in {".jpg", ".jpeg"} else f"image/{suffix.lstrip('.')}"
        img_b64 = base64.b64encode(ref_path.read_bytes()).decode()
        parts.append({"inline_data": {"mime_type": mime_type, "data": img_b64}})
        parts.append(
            {"text": f"Use the person in the reference image as the main character. {prompt}"}
        )
    else:
        logger.debug(
            "DiaryIllustration: text-only prompt model=%s prompt_preview=%s",
            model_name,
            prompt[:prompt_log_preview_len] + "..."
            if len(prompt) > prompt_log_preview_len
            else prompt,
        )
        parts.append({"text": prompt})
    payload = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseModalities": ["IMAGE", "TEXT"]},
    }
    return await asyncio.to_thread(request_fn, url, payload)


async def call_volcengine(
    prompt: str,
    *,
    config: dict[str, Any],
    default_base_url: str,
    default_model: str,
    default_size: str,
    request_fn,
) -> bytes:
    api_key = str(config.get("api_key", "")).strip()
    base_url = str(config.get("base_url", default_base_url)).strip()
    model = str(config.get("image_model", default_model)).strip()
    size = str(config.get("image_size", default_size)).strip()
    if not api_key:
        raise ValueError("volcengine.api_key is not configured")
    return await asyncio.to_thread(request_fn, base_url, api_key, model, prompt, size)


async def call_image_provider(
    prompt: str, *, provider_order: list[str], gemini_factory, volcengine_factory
) -> bytes:
    provider_errors: list[str] = []
    for provider in provider_order:
        try:
            if provider == "gemini":
                return await gemini_factory(prompt)
            if provider == "volcengine":
                return await volcengine_factory(prompt)
        except Exception as exc:
            logger.warning(
                "DiaryIllustration: provider=%s failed, trying fallback if available: %s",
                provider,
                exc,
            )
            provider_errors.append(f"{provider}: {exc}")
    if provider_errors:
        raise ValueError("; ".join(provider_errors))
    raise ValueError("No diary illustration provider is configured")
