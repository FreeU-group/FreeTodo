from __future__ import annotations

import asyncio
import time

import numpy as np

from perception.models import Modality, PerceptionEvent, SourceType
from sensor_helpers import text_hash
from util.time_utils import get_utc_now

WECHAT_MIN_MESSAGE_HEIGHT = 10
DEBUG_MAX_FILES = 1000
DEBUG_CLEANUP_COUNT = 500
HIGH_OCR_SCORE = 0.8
MEDIUM_OCR_SCORE = 0.6


async def get_target_window(daemon, get_window_capture, get_app_router):
    capture = get_window_capture()
    router = get_app_router()

    window = await asyncio.to_thread(capture.get_foreground_window)
    if window is None:
        return None

    skip = daemon._should_skip_window(window.process_name or "", window.title or "")
    if skip:
        daemon.logger.debug(f"Proactive OCR skipped: {skip}")
        return None

    from proactive_ocr.models import AppType  # noqa: PLC0415

    app_type, _reason = router.identify_app(window)
    if app_type == AppType.UNKNOWN or window.is_minimized:
        return None
    return window, app_type


async def apply_roi(
    frame, app_type, get_roi_extractor, min_roi_area_ratio: float
) -> np.ndarray | None:
    roi_extractor = get_roi_extractor()
    roi_result = await asyncio.to_thread(roi_extractor.extract_with_details, frame.data, app_type)
    if roi_result is None:
        return None
    if roi_result:
        roi_area = roi_result.width * roi_result.height
        full_area = frame.width * frame.height
        if full_area > 0 and roi_area / full_area >= min_roi_area_ratio:
            return roi_result.image
    return frame.data


async def capture_target_window(  # noqa: PLR0913
    daemon,
    get_window_capture,
    get_app_router,
    get_roi_extractor,
    blank_image_std_threshold: float,
    min_roi_area_ratio: float,
):
    capture = get_window_capture()
    target_window = await get_target_window(daemon, get_window_capture, get_app_router)
    if target_window is None:
        return None
    window, app_type = target_window

    frame = await asyncio.to_thread(capture.capture_window, window)
    if frame is None:
        daemon.logger.debug(f"Proactive OCR: window capture failed ({app_type.value})")
        return None

    img_std = float(np.std(frame.data))
    if img_std < blank_image_std_threshold:
        daemon.logger.debug("Proactive OCR: blank image, skipping")
        return None

    image_to_ocr = await apply_roi(frame, app_type, get_roi_extractor, min_roi_area_ratio)
    if image_to_ocr is None:
        return None

    return frame, image_to_ocr, app_type, window


def save_debug_image(daemon, image: np.ndarray, label: str) -> None:
    if not daemon._debug_images:
        return
    from PIL import Image  # noqa: PLC0415

    ts = time.strftime("%Y%m%d_%H%M%S")
    path = daemon._debug_dir / f"{label}_{ts}.png"
    Image.fromarray(image).save(path)
    daemon.logger.debug(f"Debug image saved: {path}")
    maybe_cleanup_debug_dir(daemon)


def maybe_cleanup_debug_dir(daemon) -> None:
    if not hasattr(daemon, "_debug_cleanup_counter"):
        daemon._debug_cleanup_counter = 0
    daemon._debug_cleanup_counter += 1
    if daemon._debug_cleanup_counter % 50 != 0:
        return
    try:
        files = sorted(daemon._debug_dir.glob("*.png"), key=lambda file: file.stat().st_mtime)
        if len(files) > DEBUG_MAX_FILES:
            to_delete = files[:DEBUG_CLEANUP_COUNT]
            for file in to_delete:
                file.unlink(missing_ok=True)
            daemon.logger.info(
                "Debug cleanup: deleted %d oldest files (%d remaining)",
                len(to_delete),
                len(files) - len(to_delete),
            )
    except Exception:
        daemon.logger.debug("Debug cleanup failed", exc_info=True)


def build_ocr_annotated_image(image: np.ndarray, ocr_lines: list) -> np.ndarray:
    """Render OCR bounding boxes and confidence labels on the image."""
    from PIL import Image, ImageDraw, ImageFont  # noqa: PLC0415

    canvas = Image.fromarray(image.copy())
    draw = ImageDraw.Draw(canvas)

    label_font = ImageFont.load_default()
    for name in ("msyh.ttc", "msyhl.ttc", "simhei.ttf", "arial.ttf"):
        try:
            label_font = ImageFont.truetype(name, 14)
            break
        except OSError:
            continue

    img_w = image.shape[1]
    for line in ocr_lines:
        score = line.score
        if score >= HIGH_OCR_SCORE:
            color = (80, 220, 80)
        elif score >= MEDIUM_OCR_SCORE:
            color = (255, 180, 40)
        else:
            color = (255, 60, 60)

        bbox = line.bbox_px
        x1, y1 = max(0, bbox.x), max(0, bbox.y)
        x2, y2 = bbox.x + bbox.width, bbox.y + bbox.height
        draw.rectangle((x1, y1, x2, y2), outline=color, width=2)

        label = f"{score:.2f} {line.text}"
        try:
            text_width = draw.textlength(label, font=label_font)
        except (AttributeError, TypeError):
            text_width = len(label) * 9
        text_y = max(0, y1 - 18)
        bg_x2 = min(int(x1 + text_width + 6), img_w)
        draw.rectangle((x1, text_y, bg_x2, text_y + 17), fill=(30, 30, 30))
        draw.text((x1 + 3, text_y + 1), label, fill=color, font=label_font)

    return np.array(canvas)


def prepare_ocr_target(roi_image: np.ndarray, app_type, logger) -> tuple[np.ndarray, int | None]:
    """For WeChat, crop to the message area below the title divider."""
    from proactive_ocr.models import AppType  # noqa: PLC0415

    if app_type != AppType.WECHAT:
        return roi_image, None
    try:
        from proactive_ocr.priors.wechat import WeChatPrior  # noqa: PLC0415

        prior = WeChatPrior()
        divider_y = prior.find_title_divider_y(roi_image)
        if divider_y is not None and divider_y > 0:
            msg_image = roi_image[divider_y + 2 :, :]
            if msg_image.shape[0] > WECHAT_MIN_MESSAGE_HEIGHT:
                logger.debug("WeChat: OCR target cropped to message area (divider_y=%d)", divider_y)
                return msg_image, divider_y
    except Exception:
        logger.debug("WeChat divider detection failed, OCR full ROI", exc_info=True)
    return roi_image, None


def build_ocr_text(  # noqa: PLR0913
    image: np.ndarray,
    ocr_result,
    valid_lines: list,
    app_type,
    *,
    window_title: str,
    logger,
) -> tuple[str, dict]:
    """Build OCR text and metadata, using structured WeChat parsing when available."""
    from proactive_ocr.models import AppType  # noqa: PLC0415

    if app_type == AppType.WECHAT:
        try:
            from proactive_ocr.priors.wechat import WeChatPrior  # noqa: PLC0415
            from proactive_ocr.wechat_message_parser import parse_wechat_messages  # noqa: PLC0415

            theme = WeChatPrior().detect_theme(image)
            theme_name = theme.name if theme else "dark"
            ctx = parse_wechat_messages(image, ocr_result, theme_name, title_hint=window_title)
            if ctx is not None and ctx.messages:
                structured = ctx.to_structured_text()
                logger.info("WeChat structured OCR (%d msgs):\n%s", len(ctx.messages), structured)
                return structured, ctx.to_metadata_dict()
            logger.debug("WeChat parser returned empty, using flat text")
        except Exception:
            logger.debug("WeChat message parser failed, falling back", exc_info=True)

    flat_text = "\n".join(line.text for line in valid_lines)
    return flat_text, {}


async def run_proactive_ocr_cycle(  # noqa: C901, PLR0912, PLR0913
    daemon,
    *,
    get_window_capture,
    get_app_router,
    get_roi_extractor,
    get_ocr_engine,
    min_ocr_confidence: float,
    min_text_len: int,
    blank_image_std_threshold: float,
    min_roi_area_ratio: float,
) -> None:
    if not daemon._proactive_ocr_enabled:
        return

    result = await capture_target_window(
        daemon,
        get_window_capture,
        get_app_router,
        get_roi_extractor,
        blank_image_std_threshold,
        min_roi_area_ratio,
    )
    if result is None:
        return
    frame, image_to_ocr, app_type, window = result

    save_debug_image(daemon, frame.data, f"proactive_{app_type.value}_full")
    save_debug_image(daemon, image_to_ocr, f"proactive_{app_type.value}_roi")

    ocr_target, wechat_divider_y = prepare_ocr_target(image_to_ocr, app_type, daemon.logger)
    wechat_title_ocr_text = ""
    if wechat_divider_y is not None:
        title_img = image_to_ocr[:wechat_divider_y, :]
        save_debug_image(daemon, title_img, "wechat_title")
        save_debug_image(daemon, ocr_target, "wechat_messages")
        try:
            title_ocr = await asyncio.to_thread(get_ocr_engine().ocr, title_img)
            if title_ocr.lines:
                wechat_title_ocr_text = " ".join(
                    line.text for line in title_ocr.lines if line.score >= min_ocr_confidence
                ).strip()
                if daemon._debug_images:
                    annotated_title = build_ocr_annotated_image(title_img, title_ocr.lines)
                    save_debug_image(daemon, annotated_title, "wechat_title_ocr")
                daemon.logger.info("WeChat title OCR: '%s'", wechat_title_ocr_text)
        except Exception:
            daemon.logger.debug("Failed to OCR title area", exc_info=True)

    engine = get_ocr_engine()
    try:
        ocr_result = await asyncio.to_thread(engine.ocr, ocr_target)
    except Exception as ocr_exc:
        daemon.logger.error(
            f"OCR engine.ocr() raised {type(ocr_exc).__name__}: {ocr_exc}",
            exc_info=True,
        )
        return

    if daemon._debug_images and ocr_result.lines:
        try:
            annotated = build_ocr_annotated_image(ocr_target, ocr_result.lines)
            save_debug_image(daemon, annotated, f"proactive_{app_type.value}_ocr")
        except Exception:
            daemon.logger.debug("Failed to build OCR annotated debug image", exc_info=True)

    valid_lines = [line for line in ocr_result.lines if line.score >= min_ocr_confidence]
    if not valid_lines:
        return

    title_for_parser = wechat_title_ocr_text or window.title
    text, extra_metadata = build_ocr_text(
        ocr_target,
        ocr_result,
        valid_lines,
        app_type,
        window_title=title_for_parser,
        logger=daemon.logger,
    )
    if len(text) < min_text_len:
        return

    hashed_text = text_hash(text)
    if hashed_text == daemon._last_proactive_hash:
        return
    daemon._last_proactive_hash = hashed_text

    metadata = {
        "app_name": app_type.value,
        "window_title": window.title[:100],
        "ocr_lines": len(valid_lines),
        "ocr_latency_ms": round(ocr_result.latency_ms, 1),
        "todo_relevant": True,
        **extra_metadata,
    }

    event = PerceptionEvent(
        timestamp=get_utc_now(),
        source=SourceType.OCR_PROACTIVE,
        modality=Modality.TEXT,
        content_text=text,
        metadata=metadata,
    )
    ok = await daemon._safe_post(event)
    if ok:
        daemon._last_proactive_ocr_at = get_utc_now().isoformat()
        daemon.logger.info(
            f"Proactive OCR ({app_type.value}) -> Center: "
            f"{len(valid_lines)} lines, {len(text)} chars"
        )
