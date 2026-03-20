"""WeChat screenshot message parser.

Leverages OCR bbox spatial info, bubble color detection, and nickname
line recognition to produce structured dialogue with speaker attribution.
"""

import re
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

from util.logging_config import get_logger

from .models import BBox, ChatContext, ChatMessage, ChatType, OcrLine, OcrRawResult
from .priors.wechat import (
    BUBBLE_COLORS,
    GREEN_HUE_MAX,
    GREEN_HUE_MIN,
    GREEN_SAT_MIN,
    GREEN_VAL_MIN,
    WeChatPrior,
)

logger = get_logger()

_GROUP_SUFFIX_RE = re.compile(r"[(\uff08]\s*\d+\s*[)\uff09]\s*$")

_NICKNAME_HEIGHT_RATIO = 0.92
_NICKNAME_GAP_RATIO = 1.5
_NICKNAME_MAX_CHARS = 20
_NICKNAME_MAX_WIDTH_RATIO = 0.35
_MIN_OCR_SCORE = 0.75
_SELF_LABEL = "我"
_SEND_BUTTON_TEXTS = {"发送"}
_SEND_BUTTON_BOTTOM_RATIO = 0.12
_SEND_BUTTON_RIGHT_RATIO = 0.75

_TIMESTAMP_RE = re.compile(
    r"^("
    r"\d{1,2}:\d{2}"
    r"|[昨前]天\s*\d{1,2}[:\uff1a]\d{2}"
    r"|星期[一二三四五六日天]\s*\d{1,2}[:\uff1a]\d{2}"
    r"|周[一二三四五六日天]\s*\d{1,2}[:\uff1a]\d{2}"
    r"|\d{4}[/\-年]\d{1,2}[/\-月]\d{1,2}日?"
    r"|\d{1,2}月\d{1,2}日"
    r")(\s*\d{1,2}[:\uff1a]\d{2})?$"
)
_TIMESTAMP_CENTER_TOLERANCE = 0.30

_WEEKDAY_MAP = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}
_TIME_HM_RE = re.compile(r"(\d{1,2})[:\uff1a](\d{2})")
_REL_DAY_RE = re.compile(r"^(昨|前)天")
_WEEKDAY_RE = re.compile(r"^(?:星期|周)([一二三四五六日天])")
_ABS_DATE_RE = re.compile(r"^(\d{4})[/\-年](\d{1,2})[/\-月](\d{1,2})日?")
_MONTH_DAY_RE = re.compile(r"^(\d{1,2})月(\d{1,2})日?")

_TITLE_UPPER_RATIO = 0.15


def _normalize_timestamp(raw: str) -> str:
    """Convert relative WeChat timestamp to 'YYYY-MM-DD HH:MM' format."""
    text = raw.strip().replace(" ", "").replace("\u3000", "").replace("\uff1a", ":")
    now = datetime.now()  # noqa: DTZ005  # noqa: DTZ005

    hm = _TIME_HM_RE.search(text)
    hour = int(hm.group(1)) if hm else 0
    minute = int(hm.group(2)) if hm else 0

    m = _ABS_DATE_RE.match(text)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{y:04d}-{mo:02d}-{d:02d} {hour:02d}:{minute:02d}"

    m = _MONTH_DAY_RE.match(text)
    if m:
        return f"{now.year:04d}-{int(m.group(1)):02d}-{int(m.group(2)):02d} {hour:02d}:{minute:02d}"

    m = _REL_DAY_RE.match(text)
    if m:
        offset = 1 if m.group(1) == "昨" else 2
        target = now - timedelta(days=offset)
        return f"{target.year:04d}-{target.month:02d}-{target.day:02d} {hour:02d}:{minute:02d}"

    m = _WEEKDAY_RE.match(text)
    if m:
        target_wd = _WEEKDAY_MAP.get(m.group(1), 0)
        current_wd = now.weekday()
        diff = (current_wd - target_wd) % 7
        if diff == 0:
            diff = 7
        target = now - timedelta(days=diff)
        return f"{target.year:04d}-{target.month:02d}-{target.day:02d} {hour:02d}:{minute:02d}"

    if hm:
        return f"{now.year:04d}-{now.month:02d}-{now.day:02d} {hour:02d}:{minute:02d}"

    return raw


@dataclass(slots=True)
class _ChatParseCtx:
    image: np.ndarray
    theme_name: str
    roi_width: int
    chat_type: ChatType
    contact_name: str | None


def _color_distance(pixel: np.ndarray, target: tuple[int, int, int]) -> float:
    return float(
        np.sqrt(np.sum((pixel.astype(np.float64) - np.array(target, dtype=np.float64)) ** 2))
    )


def _is_green_hsv(pixel_rgb: np.ndarray) -> bool:
    """Check if an RGB pixel falls in the green hue range (WeChat self-bubble)."""
    r, g, b = float(pixel_rgb[0]), float(pixel_rgb[1]), float(pixel_rgb[2])
    max_c = max(r, g, b)
    min_c = min(r, g, b)
    diff = max_c - min_c

    if max_c < GREEN_VAL_MIN or diff < 1:
        return False

    sat = (diff / max_c) * 255.0
    if sat < GREEN_SAT_MIN:
        return False

    if max_c == g:
        hue = 30.0 * ((b - r) / diff + 2)
    elif max_c == r:
        hue = 30.0 * (((g - b) / diff) % 6)
    else:
        hue = 30.0 * ((r - g) / diff + 4)

    if hue < 0:
        hue += 180.0

    return GREEN_HUE_MIN <= hue <= GREEN_HUE_MAX


def _sample_bubble_pixels(
    image: np.ndarray,
    bbox: BBox,
    is_right: bool,
) -> list[np.ndarray]:
    """Sample multiple pixels at varying distances outside the bbox."""
    h, w = image.shape[:2]
    cy = bbox.y + bbox.height // 2
    if cy < 0 or cy >= h:
        return []

    x_offsets = [5, 12, 20]
    y_offsets = [-3, 0, 3]
    samples: list[np.ndarray] = []

    for xoff in x_offsets:
        sx = (bbox.x + bbox.width + xoff) if is_right else (bbox.x - xoff)
        sx = max(0, min(sx, w - 1))
        pixels = []
        for dy in y_offsets:
            y = max(0, min(cy + dy, h - 1))
            pixels.append(image[y, sx].astype(np.float64))
        samples.append(np.mean(pixels, axis=0))

    return samples


def _classify_side_by_color(
    image: np.ndarray,
    bbox: BBox,
    theme_name: str,
) -> str | None:
    """Return 'self' / 'other' / None using HSV green detection with RGB fallback."""
    right_samples = _sample_bubble_pixels(image, bbox, is_right=True)
    left_samples = _sample_bubble_pixels(image, bbox, is_right=False)

    right_green = any(_is_green_hsv(s) for s in right_samples)
    left_green = any(_is_green_hsv(s) for s in left_samples)

    if right_green and not left_green:
        return "self"
    if left_green and not right_green:
        return "other"

    colors = BUBBLE_COLORS.get(theme_name)
    if colors:
        tolerance = colors["tolerance"]
        for sample in right_samples:
            if _color_distance(sample, colors["green"]) < tolerance:
                return "self"
        for sample in left_samples:
            if _color_distance(sample, colors["gray"]) < tolerance:
                return "other"

    return None


def _classify_side_by_position(
    bbox: BBox,
    roi_width: int,
) -> str:
    """Fallback: classify by x-coordinate relative to chat area center."""
    center_x = bbox.x + bbox.width / 2
    midpoint = roi_width * 0.5
    return "self" if center_x > midpoint else "other"


def _detect_chat_type(title_text: str) -> ChatType:
    if _GROUP_SUFFIX_RE.search(title_text):
        return ChatType.GROUP
    return ChatType.PRIVATE


def _extract_title_text(
    ocr_lines: list[OcrLine],
    divider_y: int,
) -> str:
    """Collect OCR lines above the divider as the title."""
    title_parts = []
    for ln in ocr_lines:
        if ln.bbox_px.y + ln.bbox_px.height <= divider_y:
            title_parts.append(ln.text)
    return " ".join(title_parts).strip()


def _is_send_button(ln: OcrLine, image_h: int, image_w: int) -> bool:
    """Discard the '发送' button in the bottom-right corner."""
    if ln.text.strip() not in _SEND_BUTTON_TEXTS:
        return False
    b = ln.bbox_px
    return (
        b.y + b.height > image_h * (1 - _SEND_BUTTON_BOTTOM_RATIO)
        and b.x > image_w * _SEND_BUTTON_RIGHT_RATIO
    )


def _find_topmost_title_line(
    ocr_lines: list[OcrLine],
    image_height: int,
) -> OcrLine | None:
    """Find the topmost OCR line in the upper portion as a title fallback."""
    upper_limit = int(image_height * _TITLE_UPPER_RATIO)
    candidates = [
        ln for ln in ocr_lines if ln.bbox_px.y < upper_limit and ln.score >= _MIN_OCR_SCORE
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda ln: ln.bbox_px.y)
    return candidates[0]


def _strip_group_suffix(title: str) -> str:
    return _GROUP_SUFFIX_RE.sub("", title).strip()


def _median_line_height(lines: list[OcrLine]) -> float:
    if not lines:
        return 20.0
    heights = sorted(ln.bbox_px.height for ln in lines)
    mid = len(heights) // 2
    return float(heights[mid])


def parse_wechat_messages(
    image: np.ndarray,
    ocr_result: OcrRawResult,
    theme_name: str = "dark",
) -> ChatContext | None:
    """Parse OCR results from a WeChat chat region into structured messages.

    Args:
        image: The chat region image (after sidebar removal).
        ocr_result: Raw OCR output with bbox information.
        theme_name: 'dark' or 'light' theme.

    Returns:
        ChatContext with speaker-attributed messages, or None on failure.
    """
    if not ocr_result.lines:
        logger.debug("WeChat parser: no OCR lines, skipping")
        return None

    prior = WeChatPrior()
    raw_divider = prior.find_title_divider_y(image)
    divider_y = prior.get_title_divider_y(image)
    h, roi_width = image.shape[:2]
    logger.info(
        "WeChat parser: divider_y=%s (raw=%s), image=%dx%d, theme=%s",
        divider_y,
        raw_divider,
        roi_width,
        h,
        theme_name,
    )

    title_text = _extract_title_text(ocr_result.lines, divider_y)

    if not title_text and raw_divider is None:
        topmost = _find_topmost_title_line(ocr_result.lines, h)
        if topmost:
            title_text = topmost.text.strip()
            divider_y = topmost.bbox_px.y + topmost.bbox_px.height + 2
            logger.info(
                "WeChat parser: fallback to topmost OCR line as title: '%s' (divider_y=%d)",
                title_text,
                divider_y,
            )

    if not title_text:
        logger.warning("WeChat parser: no title text found above divider_y=%d", divider_y)
        return None

    chat_type = _detect_chat_type(title_text)
    chat_name = _strip_group_suffix(title_text) if chat_type == ChatType.GROUP else title_text
    contact_name = title_text if chat_type == ChatType.PRIVATE else None
    logger.info(
        "WeChat parser: type=%s, name='%s', contact='%s'",
        chat_type.value,
        chat_name,
        contact_name,
    )

    msg_lines = [
        ln
        for ln in ocr_result.lines
        if ln.bbox_px.y >= divider_y
        and ln.score >= _MIN_OCR_SCORE
        and not _is_send_button(ln, h, roi_width)
    ]
    msg_lines.sort(key=lambda ln: ln.bbox_px.y)

    ctx = _ChatParseCtx(
        image=image,
        theme_name=theme_name,
        roi_width=roi_width,
        chat_type=chat_type,
        contact_name=contact_name,
    )
    messages = _attribute_messages(msg_lines, ctx)

    for msg in messages:
        tag = ">>> " if msg.is_self else "<<< "
        logger.info("  %s[%s] %s", tag, msg.speaker, msg.text)

    return ChatContext(
        chat_type=chat_type,
        chat_name=chat_name,
        contact_name=contact_name,
        messages=messages,
        divider_y=divider_y,
    )


def _is_timestamp_line(ln: OcrLine, roi_width: int) -> bool:
    """Centered small text matching time patterns."""
    text = ln.text.strip().replace(" ", "")
    if not _TIMESTAMP_RE.match(text):
        return False
    cx = ln.bbox_px.x + ln.bbox_px.width / 2
    mid = roi_width / 2
    if mid <= 0:
        return False
    return abs(cx - mid) / mid < _TIMESTAMP_CENTER_TOLERANCE


def _attribute_messages(
    msg_lines: list[OcrLine],
    ctx: _ChatParseCtx,
) -> list[ChatMessage]:
    """Assign speaker labels to each OCR message line."""
    if not msg_lines:
        return []

    median_h = _median_line_height(msg_lines)
    messages: list[ChatMessage] = []
    pending_nickname: str | None = None
    current_timestamp: str | None = None
    i = 0

    while i < len(msg_lines):
        ln = msg_lines[i]

        if _is_timestamp_line(ln, ctx.roi_width):
            current_timestamp = _normalize_timestamp(ln.text)
            logger.info("  [TS] %s → %s", ln.text.strip(), current_timestamp)
            i += 1
            continue

        side = _classify_side_by_color(ctx.image, ln.bbox_px, ctx.theme_name)
        if side is None:
            side = _classify_side_by_position(ln.bbox_px, ctx.roi_width)
        is_self = side == "self"

        if ctx.chat_type == ChatType.GROUP and _is_nickname_line(
            ln,
            is_self,
            median_h,
            msg_lines,
            i,
            ctx.roi_width,
        ):
            pending_nickname = ln.text.rstrip(":").rstrip("\uff1a").strip()
            i += 1
            continue

        speaker = _resolve_speaker(is_self, pending_nickname, ctx)
        pending_nickname = None

        messages.append(
            ChatMessage(
                speaker=speaker,
                text=ln.text,
                bbox_px=ln.bbox_px,
                is_self=is_self,
                timestamp=current_timestamp,
            )
        )
        i += 1

    return messages


def _is_nickname_line(  # noqa: PLR0913
    ln: OcrLine,
    is_self: bool,
    median_h: float,
    msg_lines: list[OcrLine],
    idx: int,
    roi_width: int = 0,
) -> bool:
    if is_self:
        return False
    if idx + 1 >= len(msg_lines):
        return False
    text = ln.text.strip()
    b = ln.bbox_px

    is_short_text = len(text) <= _NICKNAME_MAX_CHARS
    is_small_height = b.height < median_h * _NICKNAME_HEIGHT_RATIO
    is_narrow = roi_width > 0 and b.width < roi_width * _NICKNAME_MAX_WIDTH_RATIO

    if not (is_small_height or (is_short_text and is_narrow)):
        return False

    next_ln = msg_lines[idx + 1]
    gap = next_ln.bbox_px.y - (b.y + b.height)
    return gap < median_h * _NICKNAME_GAP_RATIO


def _resolve_speaker(
    is_self: bool,
    pending_nickname: str | None,
    ctx: _ChatParseCtx,
) -> str:
    if is_self:
        return _SELF_LABEL
    if pending_nickname:
        return pending_nickname
    if ctx.chat_type == ChatType.PRIVATE and ctx.contact_name:
        return ctx.contact_name
    return "对方"
