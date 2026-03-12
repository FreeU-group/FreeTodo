"""FreeTodo Sensor — lightweight perception daemon.

Run on the sensing PC to capture screen / proactive-OCR data and forward
PerceptionEvents to the remote Center node via HTTP POST.

The daemon periodically polls the Center for configuration updates
(screenshot/proactive-OCR enable/disable, intervals, blacklist) so the
user can control it from the frontend settings panel.

Usage:
    python -m sensor --center-url https://xxx.cpolar.cn --node-id MY-PC
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import platform
import re
import time
from typing import Any

import httpx
import numpy as np

from perception.models import Modality, PerceptionEvent, SourceType
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

# ---------------------------------------------------------------------------
# Lazy singletons for heavy components (created on first use)
# ---------------------------------------------------------------------------

_window_capture = None
_app_router = None
_roi_extractor = None
_ocr_engine = None


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
            det_limit_side_len=settings.get("jobs.proactive_ocr.det_limit_side_len", 960),
            resize_max_side=settings.get("jobs.proactive_ocr.resize_max_side", 0),
            rec_batch_num=settings.get("jobs.proactive_ocr.rec_batch_num", 8),
            use_cls=settings.get("jobs.proactive_ocr.use_cls", False),
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
    """轻量感知守护进程，采集本地屏幕/OCR 数据并转发到 Center。"""

    def __init__(self, center_url: str, node_id: str, *, debug_images: bool = False):
        self.center_url = center_url.rstrip("/")
        self.node_id = node_id
        self.client = httpx.AsyncClient(timeout=30)
        self._debug_images = debug_images

        self._last_screenshot_hash: str = ""
        self._last_proactive_hash: str = ""
        self._consecutive_post_failures: int = 0
        self._max_backoff: float = 120.0

        self._screenshot_enabled: bool = True
        self._proactive_ocr_enabled: bool = True
        self._screenshot_interval: float = 10.0
        self._proactive_ocr_interval: float = 1.0
        self._blacklist_enabled: bool = False
        self._blacklist_apps: list[str] = []

        self._last_screenshot_at: str | None = None
        self._last_proactive_ocr_at: str | None = None
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

        self._blacklist_enabled = bool(config.get("recorder_blacklist_enabled", False))
        self._blacklist_apps = list(config.get("recorder_blacklist_apps", []))

    # ------------------------------------------------------------------
    # Heartbeat
    # ------------------------------------------------------------------

    async def heartbeat(self) -> None:
        url = f"{self.center_url}/api/sensor/heartbeat"
        payload = {
            "node_id": self.node_id,
            "screenshot_running": self._screenshot_enabled,
            "proactive_ocr_running": self._proactive_ocr_enabled,
            "screenshot_interval": self._screenshot_interval,
            "proactive_ocr_interval": self._proactive_ocr_interval,
            "last_screenshot_at": self._last_screenshot_at,
            "last_proactive_ocr_at": self._last_proactive_ocr_at,
            "uptime_seconds": round(time.time() - self._start_time, 1),
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

    async def _capture_target_window(self):
        capture = _get_window_capture()
        router = _get_app_router()

        window = await asyncio.to_thread(capture.get_foreground_window)
        if window is None:
            return None

        skip = self._should_skip_window(window.app_name or "", window.title or "")
        if skip:
            logger.debug(f"Proactive OCR skipped: {skip}")
            return None

        from proactive_ocr.models import AppType  # noqa: PLC0415

        app_type, _reason = router.identify_app(window)
        if app_type == AppType.UNKNOWN or window.is_minimized:
            return None

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

    def _save_debug_image(self, image: np.ndarray, label: str) -> None:
        if not self._debug_images:
            return
        from PIL import Image  # noqa: PLC0415

        ts = time.strftime("%Y%m%d_%H%M%S")
        path = self._debug_dir / f"{label}_{ts}.png"
        Image.fromarray(image).save(path)
        logger.debug(f"Debug image saved: {path}")

    async def run_proactive_ocr_cycle(self) -> None:
        if not self._proactive_ocr_enabled:
            return

        result = await self._capture_target_window()
        if result is None:
            return
        _frame, image_to_ocr, app_type, window = result

        self._save_debug_image(_frame.data, f"proactive_{app_type.value}_full")
        self._save_debug_image(image_to_ocr, f"proactive_{app_type.value}_roi")

        engine = _get_ocr_engine()
        ocr_result = await asyncio.to_thread(engine.ocr, image_to_ocr)

        valid_lines = [ln for ln in ocr_result.lines if ln.score >= _MIN_OCR_CONFIDENCE]
        if not valid_lines:
            return

        text = "\n".join(ln.text for ln in valid_lines)
        if len(text) < _MIN_TEXT_LEN:
            return

        h = _text_hash(text)
        if h == self._last_proactive_hash:
            return
        self._last_proactive_hash = h

        event = PerceptionEvent(
            timestamp=get_utc_now(),
            source=SourceType.OCR_PROACTIVE,
            modality=Modality.TEXT,
            content_text=text,
            metadata={
                "app_name": app_type.value,
                "window_title": window.title[:100],
                "ocr_lines": len(valid_lines),
                "ocr_latency_ms": round(ocr_result.latency_ms, 1),
                "todo_relevant": True,
            },
        )
        ok = await self._safe_post(event)
        if ok:
            self._last_proactive_ocr_at = get_utc_now().isoformat()
            logger.info(
                f"Proactive OCR ({app_type.value}) -> Center: "
                f"{len(valid_lines)} lines, {len(text)} chars"
            )

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
    # Main loop
    # ------------------------------------------------------------------

    async def run(
        self,
        screenshot_interval: float,
        proactive_ocr_interval: float,
        *,
        no_screenshot: bool = False,
        no_proactive_ocr: bool = False,
    ) -> None:
        self._screenshot_interval = screenshot_interval
        self._proactive_ocr_interval = proactive_ocr_interval
        self._screenshot_enabled = not no_screenshot
        self._proactive_ocr_enabled = not no_proactive_ocr

        if not self._screenshot_enabled:
            logger.info("Screenshot OCR disabled (--no-screenshot)")
        if not self._proactive_ocr_enabled:
            logger.info("Proactive OCR disabled (--no-proactive-ocr)")

        logger.info(
            f"Sensor event loop starting "
            f"(screenshot={self._screenshot_enabled}/{self._screenshot_interval}s, "
            f"proactive_ocr={self._proactive_ocr_enabled}/{self._proactive_ocr_interval}s)"
        )

        tasks = [
            asyncio.create_task(self._screenshot_loop()),
            asyncio.create_task(self._proactive_ocr_loop()),
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="FreeTodo Sensor daemon")
    parser.add_argument(
        "--center-url", required=True,
        help="Center node URL, e.g. https://xxx.cpolar.cn",
    )
    parser.add_argument(
        "--node-id", default=platform.node(),
        help="Node ID (defaults to hostname)",
    )
    parser.add_argument(
        "--screenshot-interval", type=float, default=10.0,
        help="Screenshot OCR interval in seconds (default 10)",
    )
    parser.add_argument(
        "--proactive-ocr-interval", type=float, default=1.0,
        help="Proactive OCR interval in seconds (default 1)",
    )
    parser.add_argument(
        "--no-screenshot", action="store_true",
        help="Disable screenshot OCR",
    )
    parser.add_argument(
        "--no-proactive-ocr", action="store_true",
        help="Disable proactive OCR",
    )
    parser.add_argument(
        "--debug-images", action="store_true",
        help="Save debug images to sensor_debug/ folder",
    )
    return parser.parse_args()


async def _run(args: argparse.Namespace) -> None:
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
    )


if __name__ == "__main__":
    args = parse_args()
    asyncio.run(_run(args))
