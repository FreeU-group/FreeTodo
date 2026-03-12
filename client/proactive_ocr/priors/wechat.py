"""微信先验配置"""

import numpy as np

from .base import AppPrior, ROIResult, ThemeConfig


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

    def extract_chat_roi(self, image: np.ndarray) -> ROIResult:
        h, w = image.shape[:2]
        theme = self.detect_theme(image)
        theme_name = theme.name if theme else "unknown"
        split_x = None
        if theme:
            sample_heights = [h - 80, h - 120, h - 160]
            split_x = self._find_bg_left_edge(
                image, bg_color=theme.chat_bg_color,
                tolerance=theme.color_tolerance, sample_heights=sample_heights,
            )
        if split_x is None or split_x > int(w * 0.7):
            split_x = int(w * 0.35)
        chat_region = image[:, split_x:, :]
        return ROIResult(
            image=chat_region, x=split_x, y=0,
            width=w - split_x, height=h, theme=theme_name,
        )
