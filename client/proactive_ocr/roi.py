"""ROI (Region of Interest) 提取模块"""

from functools import lru_cache

import numpy as np

from .models import AppType, BBox
from .priors import get_prior
from .priors.base import ROIResult


class ROIExtractor:
    def extract_chat_region(self, image: np.ndarray, app_type: AppType) -> tuple[np.ndarray, BBox]:
        prior = get_prior(app_type)
        if prior is None:
            h, w = image.shape[:2]
            return image, BBox(x=0, y=0, width=w, height=h)

        result = prior.extract_chat_roi(image)
        if result is None:
            h, w = image.shape[:2]
            return image, BBox(x=0, y=0, width=w, height=h)

        bbox = BBox(x=result.x, y=result.y, width=result.width, height=result.height)
        return result.image, bbox

    def extract_with_details(self, image: np.ndarray, app_type: AppType) -> ROIResult | None:
        prior = get_prior(app_type)
        if prior is None:
            h, w = image.shape[:2]
            return ROIResult(image=image, x=0, y=0, width=w, height=h, theme="unknown")
        return prior.extract_chat_roi(image)


@lru_cache(maxsize=1)
def get_roi_extractor() -> ROIExtractor:
    return ROIExtractor()
