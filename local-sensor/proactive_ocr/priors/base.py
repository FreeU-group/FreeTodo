"""先验配置基类"""

from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np


@dataclass
class ThemeConfig:
    name: str
    chat_bg_color: tuple[int, int, int]
    color_tolerance: int = 5


@dataclass
class ROIResult:
    image: np.ndarray
    x: int
    y: int
    width: int
    height: int
    theme: str


class AppPrior(ABC):
    @property
    @abstractmethod
    def app_name(self) -> str:
        pass

    @property
    @abstractmethod
    def themes(self) -> list[ThemeConfig]:
        pass

    def detect_theme(self, image: np.ndarray) -> ThemeConfig | None:
        h, w = image.shape[:2]
        margin = 40
        region_h = min(80, h // 4)
        region_w = min(100, w // 4)
        y1 = max(0, h - margin - region_h)
        y2 = max(y1 + 1, h - margin)
        x1 = max(0, w - margin - region_w)
        x2 = max(x1 + 1, w - margin)

        region = image[y1:y2, x1:x2]
        avg_color = np.mean(region.reshape(-1, region.shape[-1]), axis=0).astype(np.float32)

        best_theme = None
        best_dist = float("inf")
        for theme in self.themes:
            target = np.array(theme.chat_bg_color, dtype=np.float32)
            dist = float(np.sqrt(np.sum((avg_color - target) ** 2)))
            if dist < best_dist:
                best_dist = dist
                best_theme = theme

        if best_theme is not None and best_dist <= best_theme.color_tolerance * 3:
            return best_theme
        return self.themes[0] if self.themes else None

    @abstractmethod
    def extract_chat_roi(self, image: np.ndarray) -> ROIResult | None:
        pass

    def _find_bg_left_edge(
        self,
        image: np.ndarray,
        bg_color: tuple[int, int, int],
        tolerance: int,
        sample_heights: list[int],
    ) -> int | None:
        h, _ = image.shape[:2]
        target = np.array(bg_color, dtype=np.float32)
        valid_heights = [y for y in sample_heights if 0 < y < h]
        if not valid_heights:
            valid_heights = [h // 2]
        left_edges = []
        for y in valid_heights:
            row = image[y, :, :]
            left_x = self._scan_row_left_edge(row, target, tolerance)
            if left_x is not None:
                left_edges.append(left_x)
        return min(left_edges) if left_edges else None

    def _scan_row_left_edge(
        self, row: np.ndarray, target_color: np.ndarray, tolerance: int
    ) -> int | None:
        w = row.shape[0]
        in_target_region = False
        last_target_x = None
        for x in range(w - 1, -1, -1):
            pixel = row[x].astype(np.float32)
            is_target = np.all(np.abs(pixel - target_color) <= tolerance)
            if is_target:
                in_target_region = True
                last_target_x = x
            elif in_target_region:
                return last_target_x
        if in_target_region:
            return 0
        return None
