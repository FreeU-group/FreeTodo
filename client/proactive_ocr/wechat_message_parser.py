"""WeChat screenshot message parser.

Leverages OCR bbox spatial info, bubble color detection, and nickname
line recognition to produce structured dialogue with speaker attribution.
"""

import re
from dataclasses import dataclass

import numpy as np

from .models import BBox, ChatContext, ChatMessage, ChatType, OcrLine, OcrRawResult
from .priors.wechat import BUBBLE_COLORS, WeChatPrior

_GROUP_SUFFIX_RE = re.compile(r"\(\d+\)\s*$")

_NICKNAME_HEIGHT_RATIO = 0.70
_NICKNAME_GAP_RATIO = 1.5
_MIN_OCR_SCORE = 0.5
_SELF_LABEL = "我"


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


def _sample_bubble_color(
    image: np.ndarray,
    bbox: BBox,
    is_right: bool,
) -> np.ndarray | None:
    """Sample a few pixels just outside the bbox on the bubble side."""
    h, w = image.shape[:2]
    cy = bbox.y + bbox.height // 2
    if cy < 0 or cy >= h:
        return None

    sx = bbox.x + bbox.width + 5 if is_right else bbox.x - 5

    sx = max(0, min(sx, w - 1))
    offsets = [-2, 0, 2]
    pixels = []
    for dy in offsets:
        y = max(0, min(cy + dy, h - 1))
        pixels.append(image[y, sx].astype(np.float64))
    return np.mean(pixels, axis=0)


def _classify_side_by_color(
    image: np.ndarray,
    bbox: BBox,
    theme_name: str,
) -> str | None:
    """Return 'self' / 'other' / None based on bubble color near the bbox."""
    colors = BUBBLE_COLORS.get(theme_name)
    if colors is None:
        return None
    tolerance = colors["tolerance"]

    for is_right, label in [(True, "self"), (False, "other")]:
        sample = _sample_bubble_color(image, bbox, is_right)
        if sample is None:
            continue
        target = colors["green"] if label == "self" else colors["gray"]
        if _color_distance(sample, target) < tolerance:
            return label
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
        return None

    prior = WeChatPrior()
    divider_y = prior.get_title_divider_y(image)
    roi_width = image.shape[1]

    title_text = _extract_title_text(ocr_result.lines, divider_y)
    if not title_text:
        return None

    chat_type = _detect_chat_type(title_text)
    chat_name = _strip_group_suffix(title_text) if chat_type == ChatType.GROUP else title_text
    contact_name = title_text if chat_type == ChatType.PRIVATE else None

    msg_lines = [
        ln for ln in ocr_result.lines if ln.bbox_px.y >= divider_y and ln.score >= _MIN_OCR_SCORE
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

    return ChatContext(
        chat_type=chat_type,
        chat_name=chat_name,
        contact_name=contact_name,
        messages=messages,
        divider_y=divider_y,
    )


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
    i = 0

    while i < len(msg_lines):
        ln = msg_lines[i]

        side = _classify_side_by_color(ctx.image, ln.bbox_px, ctx.theme_name)
        if side is None:
            side = _classify_side_by_position(ln.bbox_px, ctx.roi_width)
        is_self = side == "self"

        if ctx.chat_type == ChatType.GROUP and _is_nickname_line(
            ln, is_self, median_h, msg_lines, i
        ):
            pending_nickname = ln.text.rstrip(":")
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
            )
        )
        i += 1

    return messages


def _is_nickname_line(
    ln: OcrLine,
    is_self: bool,
    median_h: float,
    msg_lines: list[OcrLine],
    idx: int,
) -> bool:
    if is_self:
        return False
    if ln.bbox_px.height >= median_h * _NICKNAME_HEIGHT_RATIO:
        return False
    if idx + 1 >= len(msg_lines):
        return False
    next_ln = msg_lines[idx + 1]
    gap = next_ln.bbox_px.y - (ln.bbox_px.y + ln.bbox_px.height)
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
