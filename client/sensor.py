"""FreeTodo Sensor — lightweight perception daemon.

Run on the sensing PC to capture screen / proactive-OCR data and forward
PerceptionEvents to the remote Center node via HTTP POST.

The daemon periodically polls the Center for configuration updates
(screenshot/proactive-OCR enable/disable, intervals, blacklist) so the
user can control it from the frontend settings panel.

Usage (run from client/ directory):
    uv run python -m sensor --center-url https://xxx.cpolar.cn --node-id MY-PC
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import hashlib
import json
import os
import platform
import re
import time
from contextlib import suppress
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
import numpy as np

from perception.models import Modality, PerceptionEvent, SourceType
from proactive_ocr.ocr_engine import OcrEngineConfig
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()

# ---------------------------------------------------------------------------
# Self-window exclusion patterns (migrated from server recorder_config.py)
# ---------------------------------------------------------------------------

_SELF_WINDOW_PATTERNS_STR = [
    "lifetrace",
    "freetodo",
]

_SELF_WINDOW_PATTERNS_REGEX = [
    re.compile(r"localhost:80\d{2}"),
    re.compile(r"127\.0\.0\.1:80\d{2}"),
    re.compile(r"localhost:30\d{2}"),
    re.compile(r"127\.0\.0\.1:30\d{2}"),
]

_BROWSER_APPS = ["chrome", "msedge", "firefox", "electron"]
_PYTHON_APPS = ["python", "pythonw"]


def _is_self_window(app_name: str, window_title: str) -> bool:
    """Check whether the foreground window belongs to FreeTodo/LifeTrace itself."""
    title_lower = (window_title or "").lower()
    if any(p in title_lower for p in _SELF_WINDOW_PATTERNS_STR):
        return True
    if any(p.search(title_lower) for p in _SELF_WINDOW_PATTERNS_REGEX):
        return True
    app_lower = (app_name or "").lower()
    if any(b in app_lower for b in _BROWSER_APPS + _PYTHON_APPS) and title_lower:
        if any(p in title_lower for p in _SELF_WINDOW_PATTERNS_STR):
            return True
        if any(p.search(title_lower) for p in _SELF_WINDOW_PATTERNS_REGEX):
            return True
    return False


def _is_local_center(center_url: str) -> bool:
    """Return True when center endpoint points to local machine."""
    host = (urlparse(center_url).hostname or "").lower()
    return host in {"localhost", "127.0.0.1", "::1"}


# ---------------------------------------------------------------------------
# Lazy singletons for heavy components (created on first use)
# ---------------------------------------------------------------------------

_window_capture = None
_app_router = None
_roi_extractor = None
_ocr_engine = None
_WECHAT_MIN_MESSAGE_HEIGHT = 10


def _mss_grab_in_thread() -> np.ndarray | None:
    """Capture primary monitor inside the calling thread."""
    import mss  # noqa: PLC0415

    try:
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            shot = sct.grab(monitor)
            arr = np.array(shot)
            if arr.shape[2] == BGRA_CHANNELS:
                arr = arr[:, :, :3]
            return arr[:, :, ::-1].copy()
    except Exception as exc:
        logger.error(f"mss screenshot failed: {exc}")
        return None


def _get_window_capture():
    global _window_capture  # noqa: PLW0603
    if _window_capture is None:
        from proactive_ocr.capture import WindowCapture  # noqa: PLC0415

        _window_capture = WindowCapture(fps=1.0)
    return _window_capture


def _get_app_router():
    global _app_router  # noqa: PLW0603
    if _app_router is None:
        from proactive_ocr.router import AppRouter  # noqa: PLC0415

        _app_router = AppRouter()
    return _app_router


def _get_roi_extractor():
    global _roi_extractor  # noqa: PLW0603
    if _roi_extractor is None:
        from proactive_ocr.roi import get_roi_extractor  # noqa: PLC0415

        _roi_extractor = get_roi_extractor()
    return _roi_extractor


def _get_ocr_engine():
    global _ocr_engine  # noqa: PLW0603
    if _ocr_engine is None:
        from proactive_ocr.ocr_engine import get_ocr_engine  # noqa: PLC0415
        from util.settings import settings  # noqa: PLC0415

        _ocr_engine = get_ocr_engine(
            backend=settings.get("jobs.proactive_ocr.ocr_backend", "auto"),
            config=OcrEngineConfig(
                det_limit_side_len=settings.get("jobs.proactive_ocr.det_limit_side_len", 960),
                resize_max_side=settings.get("jobs.proactive_ocr.resize_max_side", 0),
                rec_batch_num=settings.get("jobs.proactive_ocr.rec_batch_num", 8),
                use_cls=settings.get("jobs.proactive_ocr.use_cls", False),
            ),
            winrt_lang=settings.get("jobs.proactive_ocr.winrt_lang", "zh-Hans-CN"),
        )
    return _ocr_engine


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BGRA_CHANNELS = 4
_MIN_OCR_CONFIDENCE = 0.8
_MIN_TEXT_LEN = 5
_BLANK_IMAGE_STD_THRESHOLD = 5.0
_MIN_ROI_AREA_RATIO = 0.10
_CONFIG_POLL_INTERVAL = 15.0
_HEARTBEAT_INTERVAL = 30.0


def _text_hash(text: str) -> str:
    return hashlib.md5(text.encode(), usedforsecurity=False).hexdigest()


# ---------------------------------------------------------------------------
# SensorDaemon
# ---------------------------------------------------------------------------


class SensorDaemon:
    """轻量感知守护进程, 采集本地屏幕/OCR 数据并转发到 Center。"""

    def __init__(self, center_url: str, node_id: str, *, debug_images: bool = False):
        self.center_url = center_url.rstrip("/")
        self.node_id = node_id
        self.client = httpx.AsyncClient(timeout=30)
        self._debug_images = debug_images

        self._last_screenshot_hash: str = ""
        self._last_proactive_hash: str = ""
        self._consecutive_post_failures: int = 0
        self._max_backoff: float = 120.0

        self._screenshot_enabled: bool = False
        self._proactive_ocr_enabled: bool = True
        self._audio_enabled: bool = True
        self._audio_loopback_enabled: bool = True
        self._preferred_audio_device: str | int | None = None
        self._screenshot_interval: float = 10.0
        self._proactive_ocr_interval: float = 1.0
        self._blacklist_enabled: bool = False
        self._blacklist_apps: list[str] = []

        self._last_screenshot_at: str | None = None
        self._last_proactive_ocr_at: str | None = None
        self._audio_running: bool = False
        self._audio_loopback_running: bool = False
        self._start_time: float = time.time()

        if self._debug_images:
            from pathlib import Path  # noqa: PLC0415

            self._debug_dir = Path("sensor_debug")
            self._debug_dir.mkdir(exist_ok=True)
            logger.info(f"Debug images will be saved to {self._debug_dir.resolve()}")

    # ------------------------------------------------------------------
    # Network helpers
    # ------------------------------------------------------------------

    async def post_event(self, event: PerceptionEvent) -> None:
        event.metadata["node_id"] = self.node_id
        url = f"{self.center_url}/api/perception/ingest"
        resp = await self.client.post(url, json=event.model_dump(mode="json"))
        resp.raise_for_status()
        self._consecutive_post_failures = 0

    async def post_batch(self, events: list[PerceptionEvent]) -> None:
        if not events:
            return
        for e in events:
            e.metadata["node_id"] = self.node_id
        url = f"{self.center_url}/api/perception/ingest/batch"
        payload = {
            "node_id": self.node_id,
            "events": [e.model_dump(mode="json") for e in events],
        }
        resp = await self.client.post(url, json=payload)
        resp.raise_for_status()
        self._consecutive_post_failures = 0

    async def _safe_post(self, event: PerceptionEvent) -> bool:
        try:
            await self.post_event(event)
            return True
        except Exception as exc:
            self._consecutive_post_failures += 1
            logger.warning(f"POST failed (consecutive {self._consecutive_post_failures}): {exc}")
            return False

    def _post_backoff(self) -> float:
        if self._consecutive_post_failures <= 1:
            return 0
        return min(2 ** (self._consecutive_post_failures - 1), self._max_backoff)

    # ------------------------------------------------------------------
    # Config polling
    # ------------------------------------------------------------------

    async def poll_config(self) -> None:
        url = f"{self.center_url}/api/sensor/config"
        try:
            resp = await self.client.get(url)
            resp.raise_for_status()
            self._apply_config(resp.json())
        except Exception as exc:
            logger.debug(f"Config poll failed: {exc}")

    def _apply_config(self, config: dict[str, Any]) -> None:
        new_ss = bool(config.get("screenshot_enabled", True))
        if new_ss != self._screenshot_enabled:
            logger.info(f"Screenshot OCR: {'enabled' if new_ss else 'disabled'} (remote)")
        self._screenshot_enabled = new_ss

        new_po = bool(config.get("proactive_ocr_enabled", True))
        if new_po != self._proactive_ocr_enabled:
            logger.info(f"Proactive OCR: {'enabled' if new_po else 'disabled'} (remote)")
        self._proactive_ocr_enabled = new_po

        new_ss_int = float(config.get("screenshot_interval", 10.0))
        if new_ss_int != self._screenshot_interval:
            logger.info(f"Screenshot interval: {self._screenshot_interval}s -> {new_ss_int}s")
        self._screenshot_interval = new_ss_int

        new_po_int = float(config.get("proactive_ocr_interval", 1.0))
        if new_po_int != self._proactive_ocr_interval:
            logger.info(f"Proactive OCR interval: {self._proactive_ocr_interval}s -> {new_po_int}s")
        self._proactive_ocr_interval = new_po_int

        new_audio = bool(config.get("audio_enabled", True))
        if new_audio != self._audio_enabled:
            logger.info(f"Audio perception: {'enabled' if new_audio else 'disabled'} (remote)")
        self._audio_enabled = new_audio

        new_audio_device = config.get("audio_device")
        if new_audio_device != getattr(self, "_preferred_audio_device", None):
            logger.info(f"Audio device preference: {new_audio_device or 'auto'}")
        self._preferred_audio_device = new_audio_device

        new_loopback = bool(config.get("audio_loopback_enabled", True))
        if new_loopback != self._audio_loopback_enabled:
            logger.info(f"Audio loopback: {'enabled' if new_loopback else 'disabled'} (remote)")
        self._audio_loopback_enabled = new_loopback

        self._blacklist_enabled = bool(config.get("recorder_blacklist_enabled", False))
        self._blacklist_apps = list(config.get("recorder_blacklist_apps", []))

    # ------------------------------------------------------------------
    # Heartbeat
    # ------------------------------------------------------------------

    def _list_audio_input_devices(self) -> list[dict[str, Any]]:
        """Return a list of available audio input devices (non-blocking best-effort)."""
        try:
            import sounddevice as sd  # noqa: PLC0415

            result = []
            for i, d in enumerate(sd.query_devices()):
                if d["max_input_channels"] > 0:
                    result.append({"id": i, "name": d["name"], "channels": d["max_input_channels"]})
            return result
        except Exception:
            return []

    async def heartbeat(self) -> None:
        url = f"{self.center_url}/api/sensor/heartbeat"
        payload = {
            "node_id": self.node_id,
            "screenshot_running": self._screenshot_enabled,
            "proactive_ocr_running": self._proactive_ocr_enabled,
            "audio_running": self._audio_running,
            "audio_loopback_running": self._audio_loopback_running,
            "screenshot_interval": self._screenshot_interval,
            "proactive_ocr_interval": self._proactive_ocr_interval,
            "last_screenshot_at": self._last_screenshot_at,
            "last_proactive_ocr_at": self._last_proactive_ocr_at,
            "uptime_seconds": round(time.time() - self._start_time, 1),
            "audio_devices": self._list_audio_input_devices(),
            "audio_device_selected": getattr(self, "_preferred_audio_device", None),
        }
        try:
            resp = await self.client.post(url, json=payload)
            resp.raise_for_status()
            logger.debug("Heartbeat OK")
        except Exception as exc:
            logger.warning(f"Heartbeat failed: {exc}")

    # ------------------------------------------------------------------
    # Blacklist / self-window filtering
    # ------------------------------------------------------------------

    def _should_skip_window(self, app_name: str, window_title: str) -> str:
        """Return a skip reason if the window should be excluded, else empty string."""
        if _is_self_window(app_name, window_title):
            return f"self-window: {app_name}/{window_title[:60]}"
        if not self._blacklist_enabled or not self._blacklist_apps:
            return ""
        app_lower = (app_name or "").lower()
        for bl_app in self._blacklist_apps:
            if bl_app.lower() in app_lower:
                return f"blacklisted app: {app_name} (rule: {bl_app})"
        return ""

    # ------------------------------------------------------------------
    # Screenshot + OCR cycle
    # ------------------------------------------------------------------

    async def run_screenshot_ocr_cycle(self) -> None:
        if not self._screenshot_enabled:
            return

        from util.utils import get_active_window_info  # noqa: PLC0415

        win_info = await asyncio.to_thread(get_active_window_info)
        if win_info:
            app_name, window_title = win_info
            skip = self._should_skip_window(app_name or "", window_title or "")
            if skip:
                logger.debug(f"Screenshot OCR skipped: {skip}")
                return

        image = await asyncio.to_thread(_mss_grab_in_thread)
        if image is None:
            return

        engine = _get_ocr_engine()
        ocr_result = await asyncio.to_thread(engine.ocr, image)

        valid_lines = [ln for ln in ocr_result.lines if ln.score >= _MIN_OCR_CONFIDENCE]
        if not valid_lines:
            logger.debug("Screenshot OCR: no valid text")
            return

        text = "\n".join(ln.text for ln in valid_lines)
        if len(text) < _MIN_TEXT_LEN:
            return

        h = _text_hash(text)
        if h == self._last_screenshot_hash:
            logger.debug("Screenshot OCR: text unchanged, skipping")
            return
        self._last_screenshot_hash = h

        event = PerceptionEvent(
            timestamp=get_utc_now(),
            source=SourceType.OCR_SCREEN,
            modality=Modality.TEXT,
            content_text=text,
            metadata={
                "ocr_lines": len(valid_lines),
                "ocr_latency_ms": round(ocr_result.latency_ms, 1),
            },
        )
        ok = await self._safe_post(event)
        if ok:
            self._last_screenshot_at = get_utc_now().isoformat()
            logger.info(f"Screenshot OCR -> Center: {len(valid_lines)} lines, {len(text)} chars")

    # ------------------------------------------------------------------
    # Proactive OCR cycle
    # ------------------------------------------------------------------

    async def _get_target_window(self):
        capture = _get_window_capture()
        router = _get_app_router()

        window = await asyncio.to_thread(capture.get_foreground_window)
        if window is None:
            return None

        skip = self._should_skip_window(window.process_name or "", window.title or "")
        if skip:
            logger.debug(f"Proactive OCR skipped: {skip}")
            return None

        from proactive_ocr.models import AppType  # noqa: PLC0415

        app_type, _reason = router.identify_app(window)
        if app_type == AppType.UNKNOWN or window.is_minimized:
            return None
        return window, app_type

    async def _capture_target_window(self):
        capture = _get_window_capture()
        target_window = await self._get_target_window()
        if target_window is None:
            return None
        window, app_type = target_window

        frame = await asyncio.to_thread(capture.capture_window, window)
        if frame is None:
            logger.debug(f"Proactive OCR: window capture failed ({app_type.value})")
            return None

        img_std = float(np.std(frame.data))
        if img_std < _BLANK_IMAGE_STD_THRESHOLD:
            logger.debug("Proactive OCR: blank image, skipping")
            return None

        image_to_ocr = await self._apply_roi(frame, app_type)
        if image_to_ocr is None:
            return None

        return frame, image_to_ocr, app_type, window

    async def _apply_roi(self, frame, app_type) -> np.ndarray | None:
        roi_extractor = _get_roi_extractor()
        roi_result = await asyncio.to_thread(
            roi_extractor.extract_with_details, frame.data, app_type
        )
        if roi_result is None:
            return None
        if roi_result:
            roi_area = roi_result.width * roi_result.height
            full_area = frame.width * frame.height
            if full_area > 0 and roi_area / full_area >= _MIN_ROI_AREA_RATIO:
                return roi_result.image
        return frame.data

    _DEBUG_MAX_FILES = 1000
    _DEBUG_CLEANUP_COUNT = 500

    def _save_debug_image(self, image: np.ndarray, label: str) -> None:
        if not self._debug_images:
            return
        from PIL import Image  # noqa: PLC0415

        ts = time.strftime("%Y%m%d_%H%M%S")
        path = self._debug_dir / f"{label}_{ts}.png"
        Image.fromarray(image).save(path)
        logger.debug(f"Debug image saved: {path}")
        self._maybe_cleanup_debug_dir()

    def _maybe_cleanup_debug_dir(self) -> None:
        if not hasattr(self, "_debug_cleanup_counter"):
            self._debug_cleanup_counter = 0
        self._debug_cleanup_counter += 1
        if self._debug_cleanup_counter % 50 != 0:
            return
        try:
            files = sorted(self._debug_dir.glob("*.png"), key=lambda f: f.stat().st_mtime)
            if len(files) > self._DEBUG_MAX_FILES:
                to_delete = files[: self._DEBUG_CLEANUP_COUNT]
                for f in to_delete:
                    f.unlink(missing_ok=True)
                logger.info(
                    "Debug cleanup: deleted %d oldest files (%d remaining)",
                    len(to_delete),
                    len(files) - len(to_delete),
                )
        except Exception:
            logger.debug("Debug cleanup failed", exc_info=True)

    @staticmethod
    def _build_ocr_annotated_image(
        image: np.ndarray,
        ocr_lines: list,
    ) -> np.ndarray:
        """Render all OCR bounding boxes with confidence scores on the image.

        Color coding: green (>=0.8), orange (>=0.6), red (<0.6).
        """
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

        _high, _med = 0.8, 0.6
        img_w = image.shape[1]
        for ln in ocr_lines:
            score = ln.score
            if score >= _high:
                color = (80, 220, 80)
            elif score >= _med:
                color = (255, 180, 40)
            else:
                color = (255, 60, 60)

            b = ln.bbox_px
            x1, y1 = max(0, b.x), max(0, b.y)
            x2, y2 = b.x + b.width, b.y + b.height
            draw.rectangle((x1, y1, x2, y2), outline=color, width=2)

            label = f"{score:.2f} {ln.text}"
            try:
                tw = draw.textlength(label, font=label_font)
            except (AttributeError, TypeError):
                tw = len(label) * 9
            ty = max(0, y1 - 18)
            bg_x2 = min(int(x1 + tw + 6), img_w)
            draw.rectangle((x1, ty, bg_x2, ty + 17), fill=(30, 30, 30))
            draw.text((x1 + 3, ty + 1), label, fill=color, font=label_font)

        return np.array(canvas)

    async def run_proactive_ocr_cycle(self) -> None:  # noqa: C901, PLR0912, PLR0911, PLR0915
        if not self._proactive_ocr_enabled:
            return

        result = await self._capture_target_window()
        if result is None:
            return
        _frame, image_to_ocr, app_type, window = result

        if self._blacklist_enabled and self._blacklist_apps:
            app_name = getattr(window, "process_name", "") or getattr(window, "title", "")
            skip = self._should_skip_window(app_name, getattr(window, "title", ""))
            if skip:
                logger.debug(f"Proactive OCR skipped: {skip}")
                return

        self._save_debug_image(_frame.data, f"proactive_{app_type.value}_full")
        self._save_debug_image(image_to_ocr, f"proactive_{app_type.value}_roi")

        ocr_target, wechat_divider_y = self._prepare_ocr_target(image_to_ocr, app_type)
        wechat_title_ocr_text = ""
        if wechat_divider_y is not None:
            title_img = image_to_ocr[:wechat_divider_y, :]
            self._save_debug_image(title_img, "wechat_title")
            self._save_debug_image(ocr_target, "wechat_messages")
            try:
                title_ocr = await asyncio.to_thread(_get_ocr_engine().ocr, title_img)
                if title_ocr.lines:
                    wechat_title_ocr_text = " ".join(
                        ln.text for ln in title_ocr.lines if ln.score >= _MIN_OCR_CONFIDENCE
                    ).strip()
                    if self._debug_images:
                        annotated_title = self._build_ocr_annotated_image(
                            title_img,
                            title_ocr.lines,
                        )
                        self._save_debug_image(annotated_title, "wechat_title_ocr")
                    logger.info(f"WeChat title OCR: '{wechat_title_ocr_text}'")
            except Exception:
                logger.debug("Failed to OCR title area", exc_info=True)

        engine = _get_ocr_engine()
        try:
            ocr_result = await asyncio.to_thread(engine.ocr, ocr_target)
        except Exception as ocr_exc:
            logger.error(
                f"OCR engine.ocr() raised {type(ocr_exc).__name__}: {ocr_exc}",
                exc_info=True,
            )
            return

        if self._debug_images and ocr_result.lines:
            try:
                annotated = self._build_ocr_annotated_image(ocr_target, ocr_result.lines)
                self._save_debug_image(annotated, f"proactive_{app_type.value}_ocr")
            except Exception:
                logger.debug("Failed to build OCR annotated debug image", exc_info=True)

        valid_lines = [ln for ln in ocr_result.lines if ln.score >= _MIN_OCR_CONFIDENCE]
        if not valid_lines:
            return

        title_for_parser = wechat_title_ocr_text or window.title
        text, extra_metadata = self._build_ocr_text(
            ocr_target,
            ocr_result,
            valid_lines,
            app_type,
            window_title=title_for_parser,
        )
        if len(text) < _MIN_TEXT_LEN:
            return

        h = _text_hash(text)
        if h == self._last_proactive_hash:
            return
        self._last_proactive_hash = h

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
        ok = await self._safe_post(event)
        if ok:
            self._last_proactive_ocr_at = get_utc_now().isoformat()
            logger.info(
                f"Proactive OCR ({app_type.value}) -> Center: "
                f"{len(valid_lines)} lines, {len(text)} chars"
            )

    @staticmethod
    def _prepare_ocr_target(
        roi_image: np.ndarray,
        app_type,
    ) -> tuple[np.ndarray, int | None]:
        """For WeChat, crop to message area below the title divider.
        Returns (image_to_ocr, divider_y_or_none)."""
        from proactive_ocr.models import AppType  # noqa: PLC0415

        if app_type != AppType.WECHAT:
            return roi_image, None
        try:
            from proactive_ocr.priors.wechat import WeChatPrior  # noqa: PLC0415

            prior = WeChatPrior()
            dy = prior.find_title_divider_y(roi_image)
            if dy is not None and dy > 0:
                msg_image = roi_image[dy + 2 :, :]
                if msg_image.shape[0] > _WECHAT_MIN_MESSAGE_HEIGHT:
                    logger.debug("WeChat: OCR target cropped to message area (divider_y=%d)", dy)
                    return msg_image, dy
        except Exception:
            logger.debug("WeChat divider detection failed, OCR full ROI", exc_info=True)
        return roi_image, None

    @staticmethod
    def _build_ocr_text(
        image: np.ndarray,
        ocr_result,
        valid_lines: list,
        app_type,
        *,
        window_title: str = "",
    ) -> tuple[str, dict]:
        """Build text and extra metadata; use structured parser for WeChat."""
        from proactive_ocr.models import AppType  # noqa: PLC0415

        if app_type == AppType.WECHAT:
            try:
                from proactive_ocr.priors.wechat import WeChatPrior  # noqa: PLC0415
                from proactive_ocr.wechat_message_parser import (  # noqa: PLC0415
                    parse_wechat_messages,
                )

                theme = WeChatPrior().detect_theme(image)
                theme_name = theme.name if theme else "dark"
                ctx = parse_wechat_messages(
                    image,
                    ocr_result,
                    theme_name,
                    title_hint=window_title,
                )
                if ctx is not None and ctx.messages:
                    structured = ctx.to_structured_text()
                    logger.info(f"WeChat structured OCR ({len(ctx.messages)} msgs):\n{structured}")
                    return structured, ctx.to_metadata_dict()
                logger.debug("WeChat parser returned empty, using flat text")
            except Exception:
                logger.debug("WeChat message parser failed, falling back", exc_info=True)

        flat_text = "\n".join(ln.text for ln in valid_lines)
        return flat_text, {}

    # ------------------------------------------------------------------
    # Internal loops
    # ------------------------------------------------------------------

    async def _screenshot_loop(self) -> None:
        while True:
            try:
                await self.run_screenshot_ocr_cycle()
            except Exception as exc:
                logger.error(f"Screenshot OCR error: {exc}", exc_info=True)
            await asyncio.sleep(self._screenshot_interval + self._post_backoff())

    async def _proactive_ocr_loop(self) -> None:
        while True:
            try:
                await self.run_proactive_ocr_cycle()
            except Exception as exc:
                logger.error(f"Proactive OCR error: {exc}", exc_info=True)
            await asyncio.sleep(self._proactive_ocr_interval + self._post_backoff())

    async def _heartbeat_loop(self) -> None:
        while True:
            await self.heartbeat()
            await asyncio.sleep(_HEARTBEAT_INTERVAL)

    async def _config_poll_loop(self) -> None:
        await asyncio.sleep(5)
        while True:
            await self.poll_config()
            await asyncio.sleep(_CONFIG_POLL_INTERVAL)

    # ------------------------------------------------------------------
    # Audio perception loop
    # ------------------------------------------------------------------

    _AUDIO_SAMPLE_RATE = 16000
    _AUDIO_CHANNELS = 1
    _AUDIO_BLOCK_SIZE = 1024
    _AUDIO_RECONNECT_DELAY = 5.0
    _AUDIO_DISABLE_CHECK_INTERVAL = 3.0

    _AUDIO_DEVICE_POLL_INTERVAL = 3.0
    _AUDIO_NO_DEVICE_LOG_INTERVAL = 30.0

    @staticmethod
    def _find_input_device(  # noqa: C901
        preferred: str | int | None = None,
    ):
        """Find a suitable audio input device.

        Args:
            preferred: Device name (substring match) or numeric index.
                       ``None`` uses the system default.

        Returns:
            ``(device_id, device_info_dict)`` or ``(None, None)`` when
            no input device is available.
        """
        import sounddevice as sd  # noqa: PLC0415

        devices = sd.query_devices()

        if preferred is not None:
            if isinstance(preferred, int):
                if 0 <= preferred < len(devices) and devices[preferred]["max_input_channels"] > 0:
                    return preferred, devices[preferred]
            elif isinstance(preferred, str) and preferred:
                for i, d in enumerate(devices):
                    if d["max_input_channels"] > 0 and preferred.lower() in d["name"].lower():
                        return i, d

        default_id = sd.default.device[0]
        if isinstance(default_id, int) and 0 <= default_id < len(devices):
            d = devices[default_id]
            if d["max_input_channels"] > 0:
                return default_id, d

        for i, d in enumerate(devices):
            if d["max_input_channels"] > 0:
                return i, d

        return None, None

    async def _audio_loop(self) -> None:
        """持续感知 PC 音频流: sounddevice 采集 -> WebSocket 流式发送至 Center ASR."""
        await asyncio.sleep(3)
        _last_no_device_log = 0.0
        while True:
            if not self._audio_enabled:
                self._audio_running = False
                await asyncio.sleep(self._AUDIO_DISABLE_CHECK_INTERVAL)
                continue

            preferred = getattr(self, "_preferred_audio_device", None)
            dev_id, dev_info = self._find_input_device(preferred)
            if dev_id is None:
                import time as _t  # noqa: PLC0415

                now = _t.monotonic()
                if now - _last_no_device_log > self._AUDIO_NO_DEVICE_LOG_INTERVAL:
                    logger.info("[audio] No input device detected, waiting for device...")
                    _last_no_device_log = now
                self._audio_running = False
                await asyncio.sleep(self._AUDIO_DEVICE_POLL_INTERVAL)
                continue

            logger.info(f"[audio] 使用输入设备: [{dev_id}] {dev_info['name']}")
            try:
                await self._run_audio_stream(device=dev_id)
            except Exception as exc:
                logger.error(f"Audio stream error: {exc}")
                self._audio_running = False
            await asyncio.sleep(self._AUDIO_RECONNECT_DELAY)

    async def _run_audio_stream(self, *, device: int | None = None) -> None:
        import sounddevice as sd  # noqa: PLC0415
        import websockets  # noqa: PLC0415

        ws_url = self.center_url.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_url}/api/audio/transcribe?source=mic_pc&node_id={self.node_id}"
        connect_kwargs: dict[str, Any] = {"close_timeout": 5}
        if _is_local_center(self.center_url):
            connect_kwargs["proxy"] = None

        logger.info(f"[audio] Connecting to {ws_url}")
        async with websockets.connect(ws_url, **connect_kwargs) as ws:
            await ws.send(json.dumps({"is_24x7": True}))
            logger.info("[audio] WebSocket connected, starting sounddevice capture")

            audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=200)
            loop = asyncio.get_running_loop()

            def _audio_callback(indata, _frames, _time_info, status) -> None:
                if status:
                    logger.warning(f"[audio] sounddevice status: {status}")
                loop.call_soon_threadsafe(audio_queue.put_nowait, bytes(indata))

            stream = sd.InputStream(
                device=device,
                samplerate=self._AUDIO_SAMPLE_RATE,
                channels=self._AUDIO_CHANNELS,
                dtype="int16",
                blocksize=self._AUDIO_BLOCK_SIZE,
                callback=_audio_callback,
            )
            stream.start()
            self._audio_running = True
            logger.info("[audio] Capture started (sounddevice -> Center ASR)")

            try:
                send_task = asyncio.create_task(self._audio_send_loop(ws, audio_queue))
                recv_task = asyncio.create_task(self._audio_recv_loop(ws))
                stop_task = asyncio.create_task(self._audio_config_watch(ws))

                done, pending = await asyncio.wait(
                    [send_task, recv_task, stop_task],
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for t in pending:
                    t.cancel()
                for t in done:
                    if t.exception() is not None:
                        raise t.exception()  # type: ignore[misc]
            finally:
                stream.stop()
                stream.close()
                self._audio_running = False
                logger.info("[audio] Capture stopped")

    async def _audio_send_loop(self, ws, audio_queue: asyncio.Queue) -> None:
        """从 sounddevice 队列取 PCM 数据并发送至 WebSocket。"""
        while True:
            chunk = await audio_queue.get()
            if chunk is None:
                break
            try:
                await ws.send(chunk)
            except Exception:
                break

    async def _audio_recv_loop(self, ws) -> None:
        """接收 Center 返回的转录结果(日志记录, 用于调试)."""
        try:
            async for raw in ws:
                if isinstance(raw, str):
                    try:
                        msg = json.loads(raw)
                        name = msg.get("header", {}).get("name", "")
                        if name == "TranscriptionResultChanged":
                            payload = msg.get("payload", {})
                            text = payload.get("result", "")
                            is_final = payload.get("is_final", False)
                            if is_final and text.strip():
                                logger.info(f"[audio] ✓ {text}")
                        elif name == "TaskFailed":
                            err = msg.get("payload", {}).get("error", "unknown")
                            logger.error(f"[audio] ASR error: {err}")
                    except json.JSONDecodeError:
                        pass
        except Exception:
            logger.debug("[audio] Receive loop closed", exc_info=True)

    async def _audio_config_watch(self, ws) -> None:
        """监控 audio_enabled 配置, 关闭时主动断开 WebSocket."""
        while self._audio_enabled:
            await asyncio.sleep(2)
        logger.info("[audio] Audio perception disabled by remote config, closing stream")
        with suppress(Exception):
            await ws.close()

    # ------------------------------------------------------------------
    # Audio loopback (speaker) perception loop
    # ------------------------------------------------------------------

    async def _audio_loopback_loop(self) -> None:
        """Continuously capture PC speaker output via WASAPI loopback."""
        await asyncio.sleep(4)
        while True:
            if not self._audio_loopback_enabled:
                self._audio_loopback_running = False
                await asyncio.sleep(self._AUDIO_DISABLE_CHECK_INTERVAL)
                continue
            try:
                await self._run_audio_loopback_stream()
            except Exception as exc:
                logger.error(f"Audio loopback error: {exc}", exc_info=True)
                self._audio_loopback_running = False
            await asyncio.sleep(self._AUDIO_RECONNECT_DELAY)

    @staticmethod
    def _patch_numpy_for_soundcard() -> None:
        """Patch soundcard to use np.frombuffer instead of np.fromstring."""
        np.fromstring = np.frombuffer  # type: ignore[attr-defined]

    @staticmethod
    def _find_loopback_mic():
        """找到默认扬声器对应的 loopback 虚拟麦克风。"""
        SensorDaemon._patch_numpy_for_soundcard()
        import soundcard as sc  # noqa: PLC0415

        speaker = sc.default_speaker()
        if speaker is None:
            return None, None

        all_mics = sc.all_microphones(include_loopback=True)
        for mic in all_mics:
            if mic.isloopback and speaker.id in mic.id:
                return mic, speaker.name

        for mic in all_mics:
            if mic.isloopback:
                return mic, mic.name

        return None, speaker.name

    async def _run_audio_loopback_stream(self) -> None:  # noqa: PLR0915
        """使用 soundcard 库以 loopback 模式录制默认扬声器输出。"""
        import websockets  # noqa: PLC0415

        loopback_mic, speaker_name = await asyncio.to_thread(self._find_loopback_mic)
        if loopback_mic is None:
            logger.warning(
                "[audio-loopback] No loopback mic found for speaker '%s', retrying later",
                speaker_name,
            )
            return

        logger.info(
            f"[audio-loopback] Using loopback: {loopback_mic.name} (speaker: {speaker_name})"
        )

        audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=200)
        loop = asyncio.get_running_loop()
        stop_event = asyncio.Event()

        ready_event = asyncio.Event()

        def _record_thread() -> None:
            try:
                SensorDaemon._patch_numpy_for_soundcard()
                logger.info(f"[audio-loopback] Opening recorder: {loopback_mic.name}")
                with loopback_mic.recorder(
                    samplerate=self._AUDIO_SAMPLE_RATE,
                    channels=1,
                    blocksize=self._AUDIO_BLOCK_SIZE,
                ) as recorder:
                    logger.info("[audio-loopback] Recorder opened, reading first chunk...")
                    first = recorder.record(numframes=self._AUDIO_BLOCK_SIZE)
                    pcm16 = (first[:, 0] * 32767).clip(-32768, 32767).astype(np.int16)
                    loop.call_soon_threadsafe(audio_queue.put_nowait, pcm16.tobytes())
                    loop.call_soon_threadsafe(ready_event.set)
                    logger.info(f"[audio-loopback] First chunk OK ({len(pcm16)} samples)")
                    while not stop_event.is_set():
                        data = recorder.record(numframes=self._AUDIO_BLOCK_SIZE)
                        pcm16 = (data[:, 0] * 32767).clip(-32768, 32767).astype(np.int16)
                        loop.call_soon_threadsafe(audio_queue.put_nowait, pcm16.tobytes())
            except Exception as exc:
                logger.error(f"[audio-loopback] Record thread error: {exc}", exc_info=True)
            finally:
                loop.call_soon_threadsafe(ready_event.set)
                loop.call_soon_threadsafe(audio_queue.put_nowait, None)

        record_future = loop.run_in_executor(None, _record_thread)

        try:
            await asyncio.wait_for(ready_event.wait(), timeout=10.0)
        except TimeoutError:
            logger.error("[audio-loopback] Recording thread did not produce data within 10s")
            stop_event.set()
            return

        if audio_queue.empty():
            logger.error("[audio-loopback] Recording thread failed to start, no data in queue")
            stop_event.set()
            return

        logger.info("[audio-loopback] Recording thread confirmed working")

        ws_url = self.center_url.replace("http://", "ws://").replace("https://", "wss://")
        ws_url = f"{ws_url}/api/audio/transcribe?source=speaker_pc&node_id={self.node_id}"

        try:
            async with websockets.connect(ws_url, close_timeout=5) as ws:
                await ws.send(json.dumps({"is_24x7": True}))
                self._audio_loopback_running = True
                logger.info(f"[audio-loopback] Capture started ({speaker_name} -> Center ASR)")

                try:
                    send_task = asyncio.create_task(self._audio_send_loop(ws, audio_queue))
                    recv_task = asyncio.create_task(self._audio_recv_loop(ws))
                    config_task = asyncio.create_task(self._audio_loopback_config_watch(ws))

                    done, pending = await asyncio.wait(
                        [send_task, recv_task, config_task],
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                    for t in pending:
                        t.cancel()
                    for t in done:
                        if t.exception() is not None:
                            raise t.exception()  # type: ignore[misc]
                finally:
                    self._audio_loopback_running = False
                    logger.info("[audio-loopback] Capture stopped")
        finally:
            stop_event.set()
            with contextlib.suppress(Exception):
                await asyncio.wrap_future(record_future)

    async def _audio_loopback_config_watch(self, ws) -> None:
        """Watch audio_loopback_enabled config flag."""
        while self._audio_loopback_enabled:
            await asyncio.sleep(2)
        logger.info("[audio-loopback] Disabled by remote config, closing stream")
        with suppress(Exception):
            await ws.close()

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------

    async def run(  # noqa: PLR0913
        self,
        screenshot_interval: float,
        proactive_ocr_interval: float,
        *,
        no_screenshot: bool = False,
        no_proactive_ocr: bool = False,
        no_audio: bool = False,
        no_audio_loopback: bool = False,
    ) -> None:
        self._screenshot_interval = screenshot_interval
        self._proactive_ocr_interval = proactive_ocr_interval
        self._screenshot_enabled = not no_screenshot
        self._proactive_ocr_enabled = not no_proactive_ocr
        self._audio_enabled = not no_audio
        self._audio_loopback_enabled = not no_audio_loopback

        if not self._screenshot_enabled:
            logger.info("Screenshot OCR disabled (--no-screenshot)")
        if not self._proactive_ocr_enabled:
            logger.info("Proactive OCR disabled (--no-proactive-ocr)")
        if not self._audio_enabled:
            logger.info("Audio perception disabled (--no-audio)")
        if not self._audio_loopback_enabled:
            logger.info("Audio loopback disabled (--no-audio-loopback)")

        logger.info(
            f"Sensor event loop starting "
            f"(screenshot={self._screenshot_enabled}/{self._screenshot_interval}s, "
            f"proactive_ocr={self._proactive_ocr_enabled}/{self._proactive_ocr_interval}s, "
            f"audio={self._audio_enabled}, audio_loopback={self._audio_loopback_enabled})"
        )

        tasks = [
            asyncio.create_task(self._screenshot_loop()),
            asyncio.create_task(self._proactive_ocr_loop()),
            asyncio.create_task(self._audio_loop()),
            asyncio.create_task(self._audio_loopback_loop()),
            asyncio.create_task(self._heartbeat_loop()),
            asyncio.create_task(self._config_poll_loop()),
        ]
        try:
            await asyncio.gather(*tasks)
        finally:
            await self.close()

    async def close(self) -> None:
        await self.client.aclose()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _load_dotenv() -> None:
    """Load .env file from the client directory into os.environ (without overriding)."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


def parse_args() -> argparse.Namespace:
    _load_dotenv()

    parser = argparse.ArgumentParser(description="FreeTodo Sensor daemon")
    parser.add_argument(
        "--center-url",
        default=os.environ.get("CENTER_URL"),
        help="Center node URL, e.g. https://xxx.cpolar.cn (fallback: CENTER_URL in .env)",
    )
    parser.add_argument(
        "--node-id",
        default=os.environ.get("NODE_ID", platform.node()),
        help="Node ID (fallback: NODE_ID in .env, then hostname)",
    )
    parser.add_argument(
        "--screenshot-interval",
        type=float,
        default=10.0,
        help="Screenshot OCR interval in seconds (default 10)",
    )
    parser.add_argument(
        "--proactive-ocr-interval",
        type=float,
        default=1.0,
        help="Proactive OCR interval in seconds (default 1)",
    )
    parser.add_argument(
        "--no-screenshot",
        action="store_true",
        help="Disable screenshot OCR",
    )
    parser.add_argument(
        "--no-proactive-ocr",
        action="store_true",
        help="Disable proactive OCR",
    )
    parser.add_argument(
        "--no-audio",
        action="store_true",
        help="Disable PC microphone audio perception",
    )
    parser.add_argument(
        "--no-audio-loopback",
        action="store_true",
        help="Disable PC speaker loopback audio perception",
    )
    parser.add_argument(
        "--debug-images",
        action="store_true",
        help="Save debug images to sensor_debug/ folder",
    )
    return parser.parse_args()


async def _run(args: argparse.Namespace) -> None:
    if not args.center_url:
        logger.error(
            "Center URL is required. Provide --center-url or set CENTER_URL in client/.env"
        )
        raise SystemExit(1)

    daemon = SensorDaemon(
        center_url=args.center_url,
        node_id=args.node_id,
        debug_images=args.debug_images,
    )
    logger.info(f"Sensor starting: node_id={args.node_id}, center={args.center_url}")
    await daemon.run(
        screenshot_interval=args.screenshot_interval,
        proactive_ocr_interval=args.proactive_ocr_interval,
        no_screenshot=args.no_screenshot,
        no_proactive_ocr=args.no_proactive_ocr,
        no_audio=args.no_audio,
        no_audio_loopback=args.no_audio_loopback,
    )


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(_run(args))
