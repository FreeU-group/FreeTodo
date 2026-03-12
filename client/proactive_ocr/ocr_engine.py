"""OCR引擎封装模块"""

import platform
import re
import time
from typing import Protocol

import numpy as np

from util.logging_config import get_logger

from .models import BBox, OcrLine, OcrRawResult
from .ocr_engine_winrt import WINOCR_AVAILABLE, WinRtOcrEngine

logger = get_logger()

ELAPSE_COMPONENTS = 3

try:
    from rapidocr_onnxruntime import RapidOCR

    RAPIDOCR_AVAILABLE = True
except ImportError:
    RapidOCR = None
    RAPIDOCR_AVAILABLE = False
    logger.error("rapidocr-onnxruntime not available")

try:
    import cv2

    CV2_AVAILABLE = True
except ImportError:
    cv2 = None
    CV2_AVAILABLE = False
    logger.warning("opencv-python not available, image resizing disabled")


class OcrEngine:
    def __init__(
        self,
        det_limit_side_len: int = 640,
        det_limit_type: str = "max",
        rec_batch_num: int = 8,
        use_gpu: bool = False,
        resize_max_side: int = 0,
        use_cls: bool = False,
    ):
        if not RAPIDOCR_AVAILABLE:
            raise ImportError("rapidocr-onnxruntime not available")
        if RapidOCR is None:
            raise ImportError("RapidOCR backend is not available")

        init_params = {
            "det_limit_side_len": det_limit_side_len,
            "det_limit_type": det_limit_type,
            "rec_batch_num": rec_batch_num,
        }
        if use_gpu:
            init_params["use_cuda"] = True

        self.engine = RapidOCR(**init_params)
        self.det_limit_side_len = det_limit_side_len
        self.det_limit_type = det_limit_type
        self.rec_batch_num = rec_batch_num
        self.resize_max_side = resize_max_side
        self.use_cls = use_cls

    def _resize_image(self, image: np.ndarray, max_side: int) -> tuple:
        if not CV2_AVAILABLE or cv2 is None:
            return image, 1.0
        h, w = image.shape[:2]
        max_dim = max(h, w)
        if max_dim <= max_side:
            return image, 1.0
        scale = max_side / max_dim
        new_w = int(w * scale)
        new_h = int(h * scale)
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)
        return resized, scale

    def ocr(self, image: np.ndarray) -> OcrRawResult:
        start_time = time.time()
        scale = 1.0
        if self.resize_max_side > 0:
            image, scale = self._resize_image(image, self.resize_max_side)

        result, elapse = self.engine(image, use_cls=self.use_cls)
        latency_ms = (time.time() - start_time) * 1000
        det_time_ms, rec_time_ms, cls_time_ms = self._parse_elapse(elapse)

        lines = []
        if result:
            for item in result:
                bbox_points = item[0]
                text = item[1]
                score = item[2]
                x_coords = [float(p[0]) for p in bbox_points]
                y_coords = [float(p[1]) for p in bbox_points]
                bbox = BBox(
                    x=int(min(x_coords) / scale), y=int(min(y_coords) / scale),
                    width=int((max(x_coords) - min(x_coords)) / scale),
                    height=int((max(y_coords) - min(y_coords)) / scale),
                )
                lines.append(OcrLine(text=text, score=float(score), bbox_px=bbox))

        return OcrRawResult(
            lines=lines, engine="rapidocr-onnxruntime", latency_ms=latency_ms,
            det_time_ms=det_time_ms, rec_time_ms=rec_time_ms, cls_time_ms=cls_time_ms,
            model_version="1.4.4", device="cpu",
        )

    @staticmethod
    def _parse_elapse(elapse: object) -> tuple[float, float, float]:
        det_time_ms = rec_time_ms = cls_time_ms = 0.0
        if not elapse:
            return det_time_ms, rec_time_ms, cls_time_ms
        if isinstance(elapse, list | tuple) and len(elapse) >= ELAPSE_COMPONENTS:
            det_time_ms = float(elapse[0]) * 1000
            cls_time_ms = float(elapse[1]) * 1000
            rec_time_ms = float(elapse[2]) * 1000
        elif isinstance(elapse, str):
            det_match = re.search(r"det[:\s]+(\d+\.?\d*)s?", elapse)
            rec_match = re.search(r"rec[:\s]+(\d+\.?\d*)s?", elapse)
            cls_match = re.search(r"cls[:\s]+(\d+\.?\d*)s?", elapse)
            if det_match:
                det_time_ms = float(det_match.group(1)) * 1000
            if rec_match:
                rec_time_ms = float(rec_match.group(1)) * 1000
            if cls_match:
                cls_time_ms = float(cls_match.group(1)) * 1000
        elif isinstance(elapse, dict):
            det_time_ms = float(elapse.get("det", 0)) * 1000
            rec_time_ms = float(elapse.get("rec", 0)) * 1000
            cls_time_ms = float(elapse.get("cls", 0)) * 1000
        return det_time_ms, rec_time_ms, cls_time_ms

    def ocr_simple(self, image: np.ndarray) -> list[tuple[str, float]]:
        result = self.ocr(image)
        return [(line.text, line.score) for line in result.lines]


class OcrBackend(Protocol):
    def ocr(self, image: np.ndarray) -> OcrRawResult: ...
    def ocr_simple(self, image: np.ndarray) -> list[tuple[str, float]]: ...


_engine_state: dict[str, OcrBackend | None] = {"instance": None}


def get_ocr_engine(
    backend: str = "auto",
    det_limit_side_len: int = 640,
    det_limit_type: str = "max",
    rec_batch_num: int = 8,
    resize_max_side: int = 0,
    use_cls: bool = False,
    winrt_lang: str = "zh-Hans-CN",
) -> OcrBackend:
    instance = _engine_state["instance"]
    if instance is not None:
        return instance

    chosen_backend = _resolve_backend(backend)

    if chosen_backend == "winrt":
        instance = WinRtOcrEngine(lang=winrt_lang, resize_max_side=resize_max_side)
        logger.info("OCR backend: WinRT (Windows.Media.Ocr)")
    else:
        instance = OcrEngine(
            det_limit_side_len=det_limit_side_len, det_limit_type=det_limit_type,
            rec_batch_num=rec_batch_num, resize_max_side=resize_max_side, use_cls=use_cls,
        )
        logger.info("OCR backend: RapidOCR (ONNX Runtime)")

    _engine_state["instance"] = instance
    return instance


def _resolve_backend(backend: str) -> str:
    if backend == "rapidocr":
        return "rapidocr"
    if backend == "winrt":
        if WINOCR_AVAILABLE:
            return "winrt"
        logger.warning("WinRT OCR requested but not available, falling back to RapidOCR")
        return "rapidocr"
    if backend == "auto":
        if platform.system() == "Windows" and WINOCR_AVAILABLE:
            return "winrt"
        return "rapidocr"
    logger.warning(f"Unknown OCR backend '{backend}', falling back to RapidOCR")
    return "rapidocr"
