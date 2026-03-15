"""OCR引擎封装模块"""

import importlib
import platform
import re
import site
import subprocess
import sys
import time
from dataclasses import dataclass
from typing import Protocol

import numpy as np

from util.logging_config import get_logger

from .models import BBox, OcrLine, OcrRawResult
from .ocr_engine_winrt import WINOCR_AVAILABLE, WinRtOcrEngine

logger = get_logger()

ELAPSE_COMPONENTS = 3


@dataclass(slots=True)
class OcrEngineConfig:
    det_limit_side_len: int = 640
    det_limit_type: str = "max"
    rec_batch_num: int = 8
    use_gpu: bool = False
    resize_max_side: int = 0
    use_cls: bool = False


RapidOCR = None
RAPIDOCR_AVAILABLE = False
_RAPIDOCR_INSTALL_ATTEMPTED = False
_RAPIDOCR_LAST_ERROR: str | None = None

try:
    import cv2

    CV2_AVAILABLE = True
except ImportError:
    cv2 = None
    CV2_AVAILABLE = False
    logger.warning("opencv-python not available, image resizing disabled")


class OcrEngine:
    def __init__(self, config: OcrEngineConfig | None = None):
        rapidocr_cls = _ensure_rapidocr_available(auto_install=True)
        if rapidocr_cls is None:
            raise ImportError("RapidOCR backend is not available")
        resolved_config = config or OcrEngineConfig()

        init_params = {
            "det_limit_side_len": resolved_config.det_limit_side_len,
            "det_limit_type": resolved_config.det_limit_type,
            "rec_batch_num": resolved_config.rec_batch_num,
        }
        if resolved_config.use_gpu:
            init_params["use_cuda"] = True

        self.engine = rapidocr_cls(**init_params)
        self.det_limit_side_len = resolved_config.det_limit_side_len
        self.det_limit_type = resolved_config.det_limit_type
        self.rec_batch_num = resolved_config.rec_batch_num
        self.resize_max_side = resolved_config.resize_max_side
        self.use_cls = resolved_config.use_cls

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
                    x=int(min(x_coords) / scale),
                    y=int(min(y_coords) / scale),
                    width=int((max(x_coords) - min(x_coords)) / scale),
                    height=int((max(y_coords) - min(y_coords)) / scale),
                )
                lines.append(OcrLine(text=text, score=float(score), bbox_px=bbox))

        return OcrRawResult(
            lines=lines,
            engine="rapidocr-onnxruntime",
            latency_ms=latency_ms,
            det_time_ms=det_time_ms,
            rec_time_ms=rec_time_ms,
            cls_time_ms=cls_time_ms,
            model_version="1.4.4",
            device="cpu",
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


def _ensure_rapidocr_available(auto_install: bool) -> type | None:
    global RapidOCR, RAPIDOCR_AVAILABLE, _RAPIDOCR_INSTALL_ATTEMPTED  # noqa: PLW0603

    if RapidOCR is not None:
        RAPIDOCR_AVAILABLE = True
        return RapidOCR

    rapidocr_cls, package_missing = _import_rapidocr_class()
    if rapidocr_cls is not None:
        RapidOCR = rapidocr_cls
        RAPIDOCR_AVAILABLE = True
        return RapidOCR

    if not auto_install or _RAPIDOCR_INSTALL_ATTEMPTED or not package_missing:
        RAPIDOCR_AVAILABLE = False
        return None

    _RAPIDOCR_INSTALL_ATTEMPTED = True
    logger.warning("RapidOCR not installed, attempting automatic install")
    if not _install_python_package("rapidocr-onnxruntime"):
        RAPIDOCR_AVAILABLE = False
        return None

    _refresh_import_state()
    rapidocr_cls, _package_missing = _import_rapidocr_class()
    if rapidocr_cls is None:
        logger.error(f"RapidOCR install finished but import still failed: {_RAPIDOCR_LAST_ERROR}")
        RAPIDOCR_AVAILABLE = False
        return None

    RapidOCR = rapidocr_cls
    RAPIDOCR_AVAILABLE = True
    logger.info("RapidOCR installed and loaded successfully")
    return RapidOCR


def _import_rapidocr_class() -> tuple[type | None, bool]:
    global _RAPIDOCR_LAST_ERROR  # noqa: PLW0603

    try:
        module = importlib.import_module("rapidocr_onnxruntime")
    except ModuleNotFoundError as exc:
        _RAPIDOCR_LAST_ERROR = f"{type(exc).__name__}: {exc}"
        return None, exc.name == "rapidocr_onnxruntime"
    except Exception as exc:
        _RAPIDOCR_LAST_ERROR = f"{type(exc).__name__}: {exc}"
        logger.warning(f"RapidOCR import failed: {_RAPIDOCR_LAST_ERROR}")
        return None, False

    rapidocr_cls = getattr(module, "RapidOCR", None)
    if rapidocr_cls is None:
        _RAPIDOCR_LAST_ERROR = "rapidocr_onnxruntime imported but RapidOCR symbol was missing"
        return None, False

    _RAPIDOCR_LAST_ERROR = None
    return rapidocr_cls, False


def _install_python_package(package_name: str) -> bool:
    command = _pip_install_command(package_name)
    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        error_text = (exc.stderr or exc.stdout or "").strip()
        if "No module named pip" in error_text and _bootstrap_pip():
            try:
                completed = subprocess.run(command, check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError as retry_exc:
                error_text = (retry_exc.stderr or retry_exc.stdout or "").strip()
                logger.error(f"Automatic install failed for {package_name}: {error_text}")
                return False
        else:
            logger.error(f"Automatic install failed for {package_name}: {error_text}")
            return False

    _refresh_import_state()
    output = (completed.stdout or completed.stderr or "").strip()
    if output:
        last_line = output.splitlines()[-1]
        logger.info(f"Automatic install completed for {package_name}: {last_line}")
    return True


def _refresh_import_state() -> None:
    importlib.invalidate_caches()
    sys.path_importer_cache.clear()
    sys.modules.pop("rapidocr_onnxruntime", None)
    try:
        site.main()
    except Exception:
        logger.debug("site.main() refresh skipped", exc_info=True)


def _pip_install_command(package_name: str) -> list[str]:
    return [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        package_name,
    ]


def _bootstrap_pip() -> bool:
    logger.warning("pip is missing in the runtime environment, bootstrapping with ensurepip")
    command = [sys.executable, "-m", "ensurepip", "--upgrade"]
    try:
        completed = subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        error_text = (exc.stderr or exc.stdout or "").strip()
        logger.error(f"Failed to bootstrap pip with ensurepip: {error_text}")
        return False

    output = (completed.stdout or completed.stderr or "").strip()
    if output:
        last_line = output.splitlines()[-1]
        logger.info(f"ensurepip completed: {last_line}")
    return True


def get_ocr_engine(
    backend: str = "auto",
    config: OcrEngineConfig | None = None,
    winrt_lang: str = "zh-Hans-CN",
) -> OcrBackend:
    instance = _engine_state["instance"]
    if instance is not None:
        return instance

    chosen_backend = _resolve_backend(backend)

    if chosen_backend == "winrt":
        resize_max_side = config.resize_max_side if config is not None else 0
        instance = WinRtOcrEngine(lang=winrt_lang, resize_max_side=resize_max_side)
        logger.info("OCR backend: WinRT (Windows.Media.Ocr)")
    else:
        try:
            instance = OcrEngine(config=config)
            logger.info("OCR backend: RapidOCR (ONNX Runtime)")
        except ImportError as exc:
            detail = _RAPIDOCR_LAST_ERROR or str(exc)
            if WINOCR_AVAILABLE:
                resize_max_side = config.resize_max_side if config is not None else 0
                logger.warning(f"RapidOCR unavailable ({detail}), falling back to WinRT OCR")
                instance = WinRtOcrEngine(lang=winrt_lang, resize_max_side=resize_max_side)
                logger.info("OCR backend: WinRT (Windows.Media.Ocr)")
            else:
                raise ImportError(
                    f"RapidOCR is unavailable and no WinRT fallback is available: {detail}"
                ) from exc

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
