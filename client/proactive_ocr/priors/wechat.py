"""微信先验配置"""

import numpy as np

from .base import AppPrior, ROIResult, ThemeConfig

_DIVIDER_SEARCH_RATIO = 0.20
_DIVIDER_PULSE_THRESHOLD = 10.0
_DIVIDER_PULSE_WINDOW = 4
_DIVIDER_SAMPLE_X_START = 0.40
_DIVIDER_SAMPLE_X_END = 0.85
_FALLBACK_TITLE_RATIO = 0.08
_VERTICAL_DIVIDER_SEARCH_START = 0.16
_VERTICAL_DIVIDER_SEARCH_END = 0.60
_VERTICAL_DIVIDER_TOP_RATIO = 0.14
_VERTICAL_DIVIDER_BOTTOM_RATIO = 0.84
_VERTICAL_DIVIDER_SAMPLE_STEP = 4
_VERTICAL_DIVIDER_WINDOW_RATIO = 0.008
_VERTICAL_DIVIDER_MIN_WINDOW = 4
_VERTICAL_DIVIDER_MAX_WINDOW = 12
_VERTICAL_DIVIDER_SMOOTH_WINDOW = 9
_VERTICAL_DIVIDER_MIN_SCORE = 12.0
_VERTICAL_DIVIDER_LEFT_PADDING = 12
_MIN_IMAGE_HEIGHT = 40
_MIN_IMAGE_WIDTH = 80
_MIN_DIVIDER_SCAN_HEIGHT = 20
_MIN_SMOOTH_WINDOW = 3
_FALLBACK_CHAT_START_RATIO = 0.35

BUBBLE_COLORS = {
    "dark": {
        "green": (87, 190, 71),
        "gray": (44, 44, 44),
        "tolerance": 25,
    },
    "light": {
        "green": (149, 236, 105),
        "gray": (255, 255, 255),
        "tolerance": 25,
    },
}


class WeChatPrior(AppPrior):
    @property
    def app_name(self) -> str:
        return "wechat"

    @property
    def themes(self) -> list[ThemeConfig]:
        return [
            ThemeConfig(name="dark", chat_bg_color=(25, 25, 25), color_tolerance=5),
            ThemeConfig(name="light", chat_bg_color=(237, 237, 237), color_tolerance=5),
        ]

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

    def find_chat_divider_x(self, image: np.ndarray) -> int | None:
        """Detect the sidebar/chat vertical divider using persistent column contrast."""
        h, w = image.shape[:2]
        if h < _MIN_IMAGE_HEIGHT or w < _MIN_IMAGE_WIDTH:
            return None

        title_divider_y = self.get_title_divider_y(image)
        y_start = max(title_divider_y + 8, int(h * _VERTICAL_DIVIDER_TOP_RATIO))
        y_end = min(int(h * _VERTICAL_DIVIDER_BOTTOM_RATIO), h - 1)
        if y_end - y_start < _MIN_DIVIDER_SCAN_HEIGHT:
            return None

        sample = image[y_start:y_end:_VERTICAL_DIVIDER_SAMPLE_STEP, :, :].astype(np.float64)
        if sample.size == 0:
            return None

        window = int(w * _VERTICAL_DIVIDER_WINDOW_RATIO)
        window = max(_VERTICAL_DIVIDER_MIN_WINDOW, window)
        window = min(_VERTICAL_DIVIDER_MAX_WINDOW, window)

        x_start = max(window, int(w * _VERTICAL_DIVIDER_SEARCH_START))
        x_end = min(w - window, int(w * _VERTICAL_DIVIDER_SEARCH_END))
        if x_end <= x_start:
            return None

        scores = np.zeros(w, dtype=np.float64)
        for x in range(x_start, x_end):
            left_band = np.mean(sample[:, x - window : x, :], axis=1)
            right_band = np.mean(sample[:, x : x + window, :], axis=1)
            row_scores = np.linalg.norm(right_band - left_band, axis=1)
            scores[x] = float(np.median(row_scores))

        smooth_window = min(_VERTICAL_DIVIDER_SMOOTH_WINDOW, x_end - x_start)
        if smooth_window >= _MIN_SMOOTH_WINDOW:
            if smooth_window % 2 == 0:
                smooth_window -= 1
            kernel = np.ones(smooth_window, dtype=np.float64) / smooth_window
            scores = np.convolve(scores, kernel, mode="same")

        best_x = int(np.argmax(scores[x_start:x_end]) + x_start)
        if scores[best_x] < _VERTICAL_DIVIDER_MIN_SCORE:
            return None
        return best_x

    def extract_chat_roi(self, image: np.ndarray) -> ROIResult:
        h, w = image.shape[:2]
        theme = self.detect_theme(image)
        theme_name = theme.name if theme else "unknown"
        split_x = self.find_chat_divider_x(image)
        if split_x is None and theme:
            sample_heights = [h - 80, h - 120, h - 160]
            split_x = self._find_bg_left_edge(
                image,
                bg_color=theme.chat_bg_color,
                tolerance=theme.color_tolerance,
                sample_heights=sample_heights,
            )
        if split_x is None or split_x > int(w * 0.7):
            split_x = int(w * _FALLBACK_CHAT_START_RATIO)

        # Keep a small margin left of the divider so top-bar chat names are not clipped.
        crop_x = max(0, split_x - _VERTICAL_DIVIDER_LEFT_PADDING)
        chat_region = image[:, crop_x:, :]
        return ROIResult(
            image=chat_region,
            x=crop_x,
            y=0,
            width=w - crop_x,
            height=h,
            theme=theme_name,
        )
