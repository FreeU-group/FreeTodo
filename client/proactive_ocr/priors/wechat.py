"""微信先验配置 — 泛化兼容不同版本"""

import numpy as np

from .base import AppPrior, ROIResult, ThemeConfig

_DIVIDER_SEARCH_RATIO = 0.25
_DIVIDER_PULSE_THRESHOLD = 8.0
_DIVIDER_PULSE_WINDOW = 6
_DIVIDER_SAMPLE_X_START = 0.35
_DIVIDER_SAMPLE_X_END = 0.90
_FALLBACK_TITLE_RATIO = 0.08

# ---------------------------------------------------------------------------
# HSV-based green bubble detection (version-agnostic)
# OpenCV convention: H 0-180, S 0-255, V 0-255
# ---------------------------------------------------------------------------
GREEN_HUE_MIN = 35
GREEN_HUE_MAX = 85
GREEN_SAT_MIN = 40
GREEN_VAL_MIN = 50

# Legacy RGB bubble colors (widened tolerance, kept as fallback)
BUBBLE_COLORS = {
    "dark": {
        "green": (87, 190, 71),
        "gray": (44, 44, 44),
        "tolerance": 40,
    },
    "light": {
        "green": (149, 236, 105),
        "gray": (255, 255, 255),
        "tolerance": 40,
    },
}

INPUT_BOX_BG = {
    "dark": {"color": (32, 32, 32), "tolerance": 12},
    "light": {"color": (255, 255, 255), "tolerance": 15},
}

_DARK_BRIGHTNESS_UPPER = 100
_LIGHT_BRIGHTNESS_LOWER = 150


class WeChatPrior(AppPrior):
    @property
    def app_name(self) -> str:
        return "wechat"

    @property
    def themes(self) -> list[ThemeConfig]:
        return [
            ThemeConfig(name="dark", chat_bg_color=(25, 25, 25), color_tolerance=30),
            ThemeConfig(name="light", chat_bg_color=(237, 237, 237), color_tolerance=30),
        ]

    # ------------------------------------------------------------------
    # Theme detection — brightness-based (robust across versions)
    # ------------------------------------------------------------------

    def detect_theme(self, image: np.ndarray) -> ThemeConfig | None:
        h, w = image.shape[:2]
        margin = 40
        sample_h = min(120, h // 3)
        sample_w = min(150, w // 4)
        y1 = max(0, h - margin - sample_h)
        y2 = max(y1 + 1, h - margin)
        x1 = max(0, w - margin - sample_w)
        x2 = max(x1 + 1, w - margin)

        region = image[y1:y2, x1:x2]
        avg_brightness = float(np.mean(region))

        themes = self.themes
        if not themes:
            return None
        dark = next((t for t in themes if t.name == "dark"), themes[0])
        light = next((t for t in themes if t.name == "light"), themes[-1])
        return dark if avg_brightness < _DARK_BRIGHTNESS_UPPER else light

    # ------------------------------------------------------------------
    # Title-bar divider
    # ------------------------------------------------------------------

    def find_title_divider_y(self, image: np.ndarray) -> int | None:
        """Detect the boundary between title bar and chat content.

        Strategy 1 (pulse): a thin bright/dark line where brightness jumps
        and returns within a few rows — sign reversal in diff.
        Strategy 2 (step): a sustained brightness level change — the title
        bar brightness (~40) drops to chat background (~25-30) and stays.
        Step detection starts from 5% height to skip window chrome.
        """
        h, w = image.shape[:2]
        search_limit = max(int(h * _DIVIDER_SEARCH_RATIO), 10)

        x_start = int(w * _DIVIDER_SAMPLE_X_START)
        x_end = int(w * _DIVIDER_SAMPLE_X_END)
        if x_end <= x_start:
            return None

        strip = image[:search_limit, x_start:x_end]
        row_mean = np.mean(strip.reshape(search_limit, -1).astype(np.float64), axis=1)
        diff = np.diff(row_mean)

        pulse = self._find_pulse(diff)
        if pulse is not None:
            return pulse

        step = self._find_step(row_mean, min_y=max(10, search_limit // 4))
        if step is not None:
            return step

        return None

    @staticmethod
    def _find_pulse(diff: np.ndarray) -> int | None:
        for y in range(len(diff)):
            if abs(diff[y]) < _DIVIDER_PULSE_THRESHOLD:
                continue
            for offset in range(1, _DIVIDER_PULSE_WINDOW + 1):
                y2 = y + offset
                if y2 >= len(diff):
                    break
                if abs(diff[y2]) < _DIVIDER_PULSE_THRESHOLD:
                    continue
                if diff[y] * diff[y2] < 0:
                    return y + 1
        return None

    @staticmethod
    def _find_step(row_mean: np.ndarray, min_y: int = 10) -> int | None:
        sustain = 8
        for y in range(min_y, len(row_mean) - sustain - 1):
            jump = abs(float(row_mean[y + 1]) - float(row_mean[y]))
            if jump < _DIVIDER_PULSE_THRESHOLD:
                continue
            after = float(np.mean(row_mean[y + 1 : y + 1 + sustain]))
            if abs(after - float(row_mean[y])) > _DIVIDER_PULSE_THRESHOLD * 0.6:
                return y + 1
        return None

    def get_title_divider_y(self, image: np.ndarray) -> int:
        """Return title divider y with fallback.

        When pulse detection fails, estimate by finding where the top
        region's row brightness pattern changes — the title bar has a
        relatively uniform brightness, then transitions to the chat content
        which has a different level.
        """
        y = self.find_title_divider_y(image)
        if y is not None:
            return y

        h, w = image.shape[:2]
        search_limit = int(h * _DIVIDER_SEARCH_RATIO)
        if search_limit < 5:
            return int(h * _FALLBACK_TITLE_RATIO)

        if len(image.shape) == 3:  # noqa: PLR2004
            gray = np.mean(image, axis=2).astype(np.float64)
        else:
            gray = image.astype(np.float64)

        x_start = int(w * 0.3)
        x_end = int(w * 0.7)
        row_means = np.mean(gray[:search_limit, x_start:x_end], axis=1)

        top_level = float(np.mean(row_means[:max(3, search_limit // 10)]))

        for y_pos in range(search_limit // 5, search_limit):
            local = float(np.mean(row_means[max(0, y_pos - 2) : y_pos + 3]))
            if abs(local - top_level) > 10:
                return y_pos

        return int(h * _FALLBACK_TITLE_RATIO)

    # ------------------------------------------------------------------
    # Sidebar-chat boundary — structural edge detection
    # ------------------------------------------------------------------

    def _find_sidebar_boundary(self, image: np.ndarray) -> int | None:
        """Find the vertical boundary between conversation list and chat area.

        The sidebar has a brighter background (~45-50) than the chat area (~25).
        Compute the median brightness of each column (robust to avatars, text,
        highlighted items) and find the sharpest drop from sidebar to chat area.
        """
        h, w = image.shape[:2]
        if len(image.shape) == 3:  # noqa: PLR2004
            gray = np.mean(image, axis=2).astype(np.float64)
        else:
            gray = image.astype(np.float64)

        x_start = int(w * 0.05)
        x_end = int(w * 0.55)
        if x_end <= x_start + 2:
            return None

        y_start = int(h * 0.10)
        y_end = int(h * 0.90)
        if y_end <= y_start:
            return None

        region = gray[y_start:y_end, x_start:x_end]
        col_bg = np.percentile(region, 25, axis=0)

        kernel = max(5, len(col_bg) // 40)
        if kernel % 2 == 0:
            kernel += 1
        smoothed = np.convolve(col_bg, np.ones(kernel) / kernel, mode="same")

        sidebar_level = float(np.max(smoothed))
        chat_level = float(np.min(smoothed[len(smoothed) // 2 :]))
        if sidebar_level - chat_level < 8:
            return None
        threshold = (sidebar_level + chat_level) / 2

        boundary = None
        for i in range(len(smoothed) - 1):
            if smoothed[i] >= threshold and smoothed[i + 1] < threshold:
                boundary = i

        if boundary is None:
            return None
        return x_start + boundary + 1

    # ------------------------------------------------------------------
    # Chat ROI extraction
    # ------------------------------------------------------------------

    def extract_chat_roi(self, image: np.ndarray) -> ROIResult:
        h, w = image.shape[:2]
        theme = self.detect_theme(image)
        theme_name = theme.name if theme else "unknown"

        split_x = self._find_sidebar_boundary(image)

        if split_x is None and theme:
            sample_heights = [h - 80, h - 120, h - 160, h - 200, h // 2]
            split_x = self._find_bg_left_edge(
                image,
                bg_color=theme.chat_bg_color,
                tolerance=theme.color_tolerance,
                sample_heights=sample_heights,
            )

        if split_x is not None and split_x > int(w * 0.45):
            split_x = None

        if split_x is None:
            split_x = 0

        chat_region = image[:, split_x:, :]
        return ROIResult(
            image=chat_region,
            x=split_x,
            y=0,
            width=w - split_x,
            height=h,
            theme=theme_name,
        )
