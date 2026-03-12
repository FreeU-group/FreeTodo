"""飞书先验配置"""

from __future__ import annotations

import numpy as np

from util.logging_config import get_logger

from .base import AppPrior, ROIResult, ThemeConfig

logger = get_logger()


class FeishuPrior(AppPrior):
    _MSG_HIGHLIGHT = np.array([248, 250, 253], dtype=np.float32)
    _MSG_HIGHLIGHT_TOL = 12
    _BRIGHTNESS_JUMP_MIN = 30
    _DIVIDER_GRAY_LO = 200
    _DIVIDER_GRAY_HI = 240
    _DIVIDER_NEIGHBOR_DIFF = 5
    _MSG_HIGHLIGHT_MIN_RATIO = 0.003

    @property
    def app_name(self) -> str:
        return "feishu"

    @property
    def themes(self) -> list[ThemeConfig]:
        return [
            ThemeConfig(name="light", chat_bg_color=(255, 255, 255), color_tolerance=10),
            ThemeConfig(name="dark", chat_bg_color=(30, 30, 30), color_tolerance=10),
        ]

    def _is_message_mode(self, image: np.ndarray) -> bool:
        h, w = image.shape[:2]
        scan_w = max(1, int(w * 0.10))
        sidebar = image[:, :scan_w, :].astype(np.float32)
        diffs = np.abs(sidebar - self._MSG_HIGHLIGHT)
        matches = np.all(diffs <= self._MSG_HIGHLIGHT_TOL, axis=2)
        if float(np.mean(matches)) < self._MSG_HIGHLIGHT_MIN_RATIO:
            return False
        hit_rows = np.where(matches.any(axis=1))[0]
        if len(hit_rows) == 0:
            return False

        pad = 5
        y1 = max(0, int(hit_rows[0]) - pad)
        y2 = min(h, int(hit_rows[-1]) + pad + 1)
        highlight_crop = image[y1:y2, 0:scan_w, :]

        from ..ocr_engine import get_ocr_engine  # noqa: PLC0415

        try:
            result = get_ocr_engine().ocr(highlight_crop)
        except Exception:
            logger.debug("FeishuPrior: sidebar OCR failed, assuming not message mode")
            return False
        return any("消息" in line.text for line in result.lines)

    def _find_sidebar_edge(self, image: np.ndarray) -> int:
        h, w = image.shape[:2]
        max_scan = min(int(w * 0.12), w)
        sample_ys = [int(h * r) for r in (0.3, 0.5, 0.7)]
        edges: list[int] = []
        for y in sample_ys:
            if y >= h:
                continue
            row_brightness = np.mean(image[y, :max_scan, :].astype(np.float32), axis=1)
            row_diffs = np.diff(row_brightness)
            for i, d in enumerate(row_diffs):
                if d > self._BRIGHTNESS_JUMP_MIN:
                    edges.append(i + 1)
                    break
        if edges:
            return int(np.median(edges))
        return int(w * 0.04)

    _DIVIDER_DIP_MIN = 3

    def _find_panel_divider(self, image: np.ndarray, start_x: int) -> int | None:
        h, w = image.shape[:2]
        begin = start_x + 10
        end_x = min(int(w * 0.50), w)
        if begin >= end_x:
            return None
        step = max(1, h // 30)
        region = image[::step, begin:end_x, :].astype(np.float32)
        col_brightness = np.mean(region, axis=(0, 2))
        radius = 3
        for i in range(radius, len(col_brightness) - radius):
            val = col_brightness[i]
            left_avg = float(np.mean(col_brightness[i - radius : i]))
            right_avg = float(np.mean(col_brightness[i + 1 : i + radius + 1]))
            if left_avg > val + self._DIVIDER_DIP_MIN and right_avg > val + self._DIVIDER_DIP_MIN:
                return begin + i
        return None

    def extract_chat_roi(self, image: np.ndarray) -> ROIResult | None:
        h, w = image.shape[:2]
        theme = self.detect_theme(image)
        theme_name = theme.name if theme else "unknown"
        if not self._is_message_mode(image):
            return None
        sidebar_x = self._find_sidebar_edge(image)
        split_x = self._find_panel_divider(image, sidebar_x)
        if split_x is None:
            split_x = sidebar_x + int(w * 0.22)
        split_x = min(split_x, int(w * 0.6))
        chat_region = image[:, split_x:, :]
        return ROIResult(
            image=chat_region, x=split_x, y=0,
            width=w - split_x, height=h, theme=theme_name,
        )
