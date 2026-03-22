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
        """Detect the thin horizontal divider line between title bar and chat
        content by scanning for a brightness pulse in the top portion."""
        h, w = image.shape[:2]
        search_limit = max(int(h * _DIVIDER_SEARCH_RATIO), 10)

        x_start = int(w * _DIVIDER_SAMPLE_X_START)
        x_end = int(w * _DIVIDER_SAMPLE_X_END)
        if x_end <= x_start:
            return None

        strip = image[:search_limit, x_start:x_end]
        row_mean = np.mean(strip.reshape(search_limit, -1).astype(np.float64), axis=1)

        diff = np.diff(row_mean)
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

    def get_title_divider_y(self, image: np.ndarray) -> int:
        """Return title divider y with fallback."""
        y = self.find_title_divider_y(image)
        if y is not None:
            return y
        return int(image.shape[0] * _FALLBACK_TITLE_RATIO)

    # ------------------------------------------------------------------
    # Sidebar-chat boundary — structural edge detection
    # ------------------------------------------------------------------

    def _find_sidebar_boundary(self, image: np.ndarray) -> int | None:
        """Find the vertical boundary between conversation list and chat area
        by detecting the column with the strongest consistent horizontal
        gradient (the sidebar divider line)."""
        h, w = image.shape[:2]
        if len(image.shape) == 3:  # noqa: PLR2004
            gray = np.mean(image, axis=2).astype(np.float64)
        else:
            gray = image.astype(np.float64)

        x_start = int(w * 0.15)
        x_end = int(w * 0.55)
        if x_end <= x_start + 2:
            return None

        y_start = int(h * 0.15)
        y_end = int(h * 0.85)
        if y_end <= y_start:
            return None

        region = gray[y_start:y_end, x_start : x_end + 1]
        h_grad = np.abs(np.diff(region, axis=1))
        col_grad_sum = np.sum(h_grad, axis=0)

        if len(col_grad_sum) == 0:
            return None

        peak_idx = int(np.argmax(col_grad_sum))
        peak_val = col_grad_sum[peak_idx]
        mean_val = float(np.mean(col_grad_sum))

        if mean_val > 0 and peak_val > mean_val * 1.8:
            boundary = x_start + peak_idx + 1
            return max(0, boundary - 3)

        return None

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

        if split_x is None or split_x > int(w * 0.7) or split_x < int(w * 0.1):
            split_x = int(w * 0.35)

        chat_region = image[:, split_x:, :]
        return ROIResult(
            image=chat_region,
            x=split_x,
            y=0,
            width=w - split_x,
            height=h,
            theme=theme_name,
        )
