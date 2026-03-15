"""微信先验配置"""

import numpy as np

from .base import AppPrior, ROIResult, ThemeConfig

_DIVIDER_SEARCH_RATIO = 0.20
_DIVIDER_PULSE_THRESHOLD = 3.0
_DIVIDER_SAMPLE_X_START = 0.40
_DIVIDER_SAMPLE_X_END = 0.85
_FALLBACK_TITLE_RATIO = 0.08

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
        for y in range(1, len(diff) - 1):
            above_threshold = (
                abs(diff[y]) > _DIVIDER_PULSE_THRESHOLD
                and abs(diff[y + 1]) > _DIVIDER_PULSE_THRESHOLD
            )
            if above_threshold and diff[y] * diff[y + 1] < 0:
                return y + 1
        return None

    def get_title_divider_y(self, image: np.ndarray) -> int:
        """Return title divider y with fallback."""
        y = self.find_title_divider_y(image)
        if y is not None:
            return y
        return int(image.shape[0] * _FALLBACK_TITLE_RATIO)

    def extract_chat_roi(self, image: np.ndarray) -> ROIResult:
        h, w = image.shape[:2]
        theme = self.detect_theme(image)
        theme_name = theme.name if theme else "unknown"
        split_x = None
        if theme:
            sample_heights = [h - 80, h - 120, h - 160]
            split_x = self._find_bg_left_edge(
                image,
                bg_color=theme.chat_bg_color,
                tolerance=theme.color_tolerance,
                sample_heights=sample_heights,
            )
        if split_x is None or split_x > int(w * 0.7):
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
