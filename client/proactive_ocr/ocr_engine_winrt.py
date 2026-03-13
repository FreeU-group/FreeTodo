"""WinRT OCR 引擎封装模块"""

import asyncio
import time
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
            logger.error(f"WinRT OCR failed: {e}")
            return OcrRawResult(
                lines=[], engine="winrt", latency_ms=(time.time() - start_time) * 1000
            )

        latency_ms = (time.time() - start_time) * 1000
        lines = []
        if result and "lines" in result:
            for line_data in result["lines"]:
                text = line_data.get("text", "")
                if not text.strip():
                    continue
                rect = line_data.get("bounding_rect", {})
                bbox = BBox(
                    x=int(float(rect.get("x", 0)) / scale),
                    y=int(float(rect.get("y", 0)) / scale),
                    width=int(float(rect.get("width", 0)) / scale),
                    height=int(float(rect.get("height", 0)) / scale),
                )
                word_confidences = []
                for word in line_data.get("words", []):
                    conf = word.get("confidence", None)
                    if conf is not None:
                        word_confidences.append(float(conf))
                avg_confidence = (
                    sum(word_confidences) / len(word_confidences) if word_confidences else 0.95
                )
                lines.append(OcrLine(text=text, score=avg_confidence, bbox_px=bbox))

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
        pickled = winocr.picklify(result)
        if not isinstance(pickled, dict):
            raise RuntimeError("winocr returned unexpected result type")
        return pickled

    def ocr_simple(self, image: np.ndarray) -> list[tuple[str, float]]:
        result = self.ocr(image)
        return [(line.text, line.score) for line in result.lines]
