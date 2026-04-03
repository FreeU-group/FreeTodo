"""WinRT OCR 引擎封装模块"""

import asyncio
import time
from contextlib import suppress
from typing import Any

import numpy as np

from util.logging_config import get_logger

from .models import BBox, OcrLine, OcrRawResult

logger = get_logger()

IMAGE_NDIM_GRAY = 2
IMAGE_CHANNEL_RGBA = 4
IMAGE_CHANNEL_RGB = 3

try:
    import winocr

    WINOCR_AVAILABLE = True
except ImportError:
    winocr = None
    WINOCR_AVAILABLE = False
    logger.info("winocr not available, WinRT OCR backend disabled")

try:
    from winrt.windows.globalization import Language
    from winrt.windows.media.ocr import OcrEngine as WinOcrEngine
except Exception:
    Language = None
    WinOcrEngine = None


def _safe_picklify(o: object) -> object:
    """Convert a WinRT OCR result object to a plain Python dict/list tree.

    Replaces ``winocr.picklify`` with per-attribute error handling so that
    a single problematic WinRT property (e.g. one that triggers a GBK
    UnicodeDecodeError on Chinese Windows) doesn't crash the whole call.
    """
    try:
        if hasattr(o, "size"):
            return [_safe_picklify(e) for e in o]
    except Exception:
        return []

    try:
        if hasattr(o, "__module__"):
            result = {}
            for name in dir(o):
                if name.startswith("_"):
                    continue
                with suppress(Exception):
                    result[name] = _safe_picklify(getattr(o, name))
            return result
    except Exception:
        return {}

    return o


_CJK_PUNCT = set(
    "\uff0c\u3002\uff01\uff1f\u3001\uff1a\uff1b"
    "\u201c\u201d\u2018\u2019\uff08\uff09"
    "\u3010\u3011\u300a\u300b\u2026\u2014"
    "\uff5e\u00b7\u300c\u300d\u300e\u300f"
    "\u3008\u3009\u3014\u3015\u3016\u3017"
)


def _normalize_winrt_spacing(text: str) -> str:
    """Collapse per-character spacing inserted by WinRT CJK OCR.

    WinRT OCR inserts a space between every CJK character, producing
    "你 好 世 界" instead of "你好世界".  This function detects that
    pattern (space count ≈ char count - 1) and collapses all spaces.
    English text like "hello world" is left untouched because its
    space-to-char ratio is much lower.
    """
    non_space = text.replace(" ", "")
    if len(non_space) <= 1:
        return text
    space_count = text.count(" ")
    expected = len(non_space) - 1
    if expected <= 0:
        return text
    if space_count / expected >= 0.7:  # noqa: PLR2004
        return non_space
    return text


_CHAR_RATIO_THRESHOLDS = [(0.95, 0.92), (0.8, 0.78), (0.6, 0.60)]
_CHAR_RATIO_DEFAULT_SCORE = 0.35
_DENSITY_MIN_WIDTH = 20
_DENSITY_SPARSE = 1.0
_DENSITY_LOW = 2.0


def _is_expected_char(ch: str) -> bool:
    return (
        "\u4e00" <= ch <= "\u9fff"
        or "\u3400" <= ch <= "\u4dbf"
        or ch.isascii()
        or ch in _CJK_PUNCT
        or "\uff00" <= ch <= "\uffef"
        or "\u3000" <= ch <= "\u303f"
        or "\U00020000" <= ch <= "\U0002a6df"
    )


def _estimate_line_confidence(text: str, bbox: BBox) -> float:
    """Heuristic confidence when the engine provides no native score."""
    stripped = text.strip()
    n = len(stripped)
    if n == 0:
        return 0.1

    normal = sum(1 for ch in stripped if _is_expected_char(ch))
    char_ratio = normal / n

    score = _CHAR_RATIO_DEFAULT_SCORE
    for threshold, value in _CHAR_RATIO_THRESHOLDS:
        if char_ratio >= threshold:
            score = value
            break

    if n == 1 and char_ratio < 1.0:
        score -= 0.2

    if bbox.width > _DENSITY_MIN_WIDTH and n > 0:
        chars_per_100px = (n / bbox.width) * 100
        if chars_per_100px < _DENSITY_SPARSE:
            score -= 0.15
        elif chars_per_100px < _DENSITY_LOW:
            score -= 0.05

    return max(0.1, min(0.99, round(score, 2)))


class WinRtOcrEngine:
    def __init__(self, lang: str = "zh-Hans-CN", resize_max_side: int = 0):
        if not WINOCR_AVAILABLE:
            raise ImportError("winocr not available")
        self.lang = lang
        self.resize_max_side = resize_max_side
        try:
            if (
                WinOcrEngine is not None
                and Language is not None
                and not WinOcrEngine.is_language_supported(Language(lang))
            ):
                logger.warning(f"WinRT OCR: language '{lang}' not supported, falling back")
                self.lang = "zh-Hans-CN"
        except Exception as e:
            logger.warning(f"WinRT OCR: language check failed: {e}")
        logger.info(f"WinRT OCR engine initialized (lang={self.lang})")

    def _resize_image(self, image: np.ndarray, max_side: int) -> tuple:
        try:
            import cv2  # noqa: PLC0415
        except ImportError:
            return image, 1.0
        h, w = image.shape[:2]
        max_dim = max(h, w)
        if max_dim <= max_side:
            return image, 1.0
        scale = max_side / max_dim
        resized = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
        return resized, scale

    def _rgb_to_rgba(self, image: np.ndarray) -> np.ndarray:
        if image.ndim == IMAGE_NDIM_GRAY:
            rgba = np.zeros((*image.shape, 4), dtype=np.uint8)
            rgba[:, :, 0] = image
            rgba[:, :, 1] = image
            rgba[:, :, 2] = image
            rgba[:, :, 3] = 255
            return rgba
        elif image.shape[2] == IMAGE_CHANNEL_RGBA:
            return image
        elif image.shape[2] == IMAGE_CHANNEL_RGB:
            rgba = np.zeros((image.shape[0], image.shape[1], 4), dtype=np.uint8)
            rgba[:, :, :3] = image
            rgba[:, :, 3] = 255
            return rgba
        return image

    def ocr(self, image: np.ndarray) -> OcrRawResult:
        start_time = time.time()
        scale = 1.0
        if self.resize_max_side > 0:
            image, scale = self._resize_image(image, self.resize_max_side)
        rgba_image = self._rgb_to_rgba(image)
        h, w = rgba_image.shape[:2]
        try:
            result = self._recognize_sync(rgba_image.tobytes(), w, h)
        except Exception as e:
            logger.error(f"WinRT OCR recognize failed: {e}")
            return OcrRawResult(
                lines=[], engine="winrt", latency_ms=(time.time() - start_time) * 1000
            )

        latency_ms = (time.time() - start_time) * 1000
        lines = []
        try:
            lines = self._parse_ocr_result(result, scale)
        except Exception as e:
            logger.warning(f"WinRT OCR result parsing failed: {e}", exc_info=True)

        return OcrRawResult(
            lines=lines,
            engine="winrt",
            latency_ms=latency_ms,
            det_time_ms=0,
            rec_time_ms=latency_ms,
            cls_time_ms=0,
            model_version="windows-media-ocr",
            device="cpu",
        )

    def _parse_ocr_result(self, result: dict, scale: float) -> list[OcrLine]:
        lines: list[OcrLine] = []
        if not result or "lines" not in result:
            return lines
        for line_data in result["lines"]:
            try:
                raw_text = line_data.get("text", "")
                if not raw_text.strip():
                    continue
                text = _normalize_winrt_spacing(raw_text)
                bbox = self._aggregate_word_bboxes(line_data.get("words", []), scale)
                word_confidences = []
                for word in line_data.get("words", []):
                    conf = word.get("confidence", None)
                    if conf is not None:
                        word_confidences.append(float(conf))
                if word_confidences:
                    confidence = sum(word_confidences) / len(word_confidences)
                else:
                    confidence = _estimate_line_confidence(text, bbox)
                lines.append(OcrLine(text=text, score=confidence, bbox_px=bbox))
            except Exception as e:
                logger.debug(f"WinRT OCR: skipped line due to error: {e}")
                continue
        return lines

    @staticmethod
    def _aggregate_word_bboxes(words: list[dict], scale: float) -> BBox:
        """Merge per-word bounding rects into a single line-level bbox."""
        x_min = y_min = float("inf")
        x_max = y_max = 0.0
        for word in words:
            rect = word.get("bounding_rect", {})
            wx = float(rect.get("x", 0))
            wy = float(rect.get("y", 0))
            ww = float(rect.get("width", 0))
            wh = float(rect.get("height", 0))
            if ww == 0 and wh == 0:
                continue
            x_min = min(x_min, wx)
            y_min = min(y_min, wy)
            x_max = max(x_max, wx + ww)
            y_max = max(y_max, wy + wh)
        if x_min == float("inf"):
            return BBox(x=0, y=0, width=0, height=0)
        return BBox(
            x=int(x_min / scale),
            y=int(y_min / scale),
            width=int((x_max - x_min) / scale),
            height=int((y_max - y_min) / scale),
        )

    def _recognize_sync(self, image_bytes: bytes, width: int, height: int) -> dict[str, Any]:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(self._recognize_async(image_bytes, width, height))
        finally:
            loop.close()

    async def _recognize_async(self, image_bytes: bytes, width: int, height: int) -> dict[str, Any]:
        if winocr is None:
            raise RuntimeError("winocr backend unavailable")
        awaitable = winocr.recognize_bytes(image_bytes, width, height, lang=self.lang)
        result = await awaitable
        pickled = _safe_picklify(result)
        if not isinstance(pickled, dict):
            raise RuntimeError("winocr returned unexpected result type")
        return pickled

    def ocr_simple(self, image: np.ndarray) -> list[tuple[str, float]]:
        result = self.ocr(image)
        return [(line.text, line.score) for line in result.lines]
