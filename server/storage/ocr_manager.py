"""OCR管理器 - 负责OCR结果相关的数据库操作"""

import hashlib
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from storage.database_base import DatabaseBase
from storage.models import OCRResult, Screenshot
from util.logging_config import get_logger
from util.time_utils import get_utc_now

logger = get_logger()


def _normalize_text(text: str | None) -> str:
    """标准化 OCR 文本，用于稳定哈希计算。"""
    if not text:
        return ""
    return " ".join(text.strip().split())


class OCRManager:
    """OCR结果管理类"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def add_ocr_result(
        self,
        screenshot_id: int,
        text_content: str,
        confidence: float = 0.0,
        language: str = "ch",
        processing_time: float = 0.0,
    ) -> int | None:
        """添加OCR结果"""
        try:
            normalized = _normalize_text(text_content)
            text_hash = (
                hashlib.md5(normalized.encode("utf-8"), usedforsecurity=False).hexdigest()
                if normalized
                else None
            )

            with self.db_base.get_session() as session:
                ocr_result = OCRResult(
                    screenshot_id=screenshot_id,
                    text_content=text_content,
                    confidence=confidence,
                    language=language,
                    processing_time=processing_time,
                    text_hash=text_hash,
                )

                session.add(ocr_result)
                session.flush()

                # 更新截图处理状态
                screenshot = session.query(Screenshot).filter_by(id=screenshot_id).first()
                if screenshot:
                    screenshot.is_processed = True
                    screenshot.processed_at = get_utc_now()

                logger.debug(f"添加OCR结果: {ocr_result.id}, text_hash={text_hash}")
                return ocr_result.id

        except SQLAlchemyError as e:
            logger.error(f"添加OCR结果失败: {e}")
            return None

    def get_ocr_results_by_screenshot(self, screenshot_id: int) -> list[dict[str, Any]]:
        """根据截图ID获取OCR结果"""
        try:
            with self.db_base.get_session() as session:
                ocr_results = session.query(OCRResult).filter_by(screenshot_id=screenshot_id).all()

                # 转换为字典列表
                results = []
                for ocr in ocr_results:
                    results.append(
                        {
                            "id": ocr.id,
                            "screenshot_id": ocr.screenshot_id,
                            "text_content": ocr.text_content,
                            "confidence": ocr.confidence,
                            "language": ocr.language,
                            "processing_time": ocr.processing_time,
                            "created_at": ocr.created_at,
                            "text_hash": ocr.text_hash,
                        }
                    )

                return results

        except SQLAlchemyError as e:
            logger.error(f"获取OCR结果失败: {e}")
            return []

    def get_ocr_by_id(self, ocr_result_id: int) -> dict[str, Any] | None:
        """根据 OCR 结果 ID 获取单条记录。"""
        try:
            with self.db_base.get_session() as session:
                ocr = session.query(OCRResult).filter_by(id=ocr_result_id).first()
                if not ocr:
                    return None

                return {
                    "id": ocr.id,
                    "screenshot_id": ocr.screenshot_id,
                    "text_content": ocr.text_content,
                    "confidence": ocr.confidence,
                    "language": ocr.language,
                    "processing_time": ocr.processing_time,
                    "created_at": ocr.created_at,
                    "text_hash": ocr.text_hash,
                }
        except SQLAlchemyError as e:
            logger.error(f"根据ID获取OCR结果失败: {e}")
            return None

    def get_by_text_hash(self, text_hash: str) -> dict[str, Any] | None:
        """根据文本哈希获取一条 OCR 结果，用于判断是否已处理过相同文本。"""
        if not text_hash:
            return None

        try:
            with self.db_base.get_session() as session:
                ocr = session.query(OCRResult).filter_by(text_hash=text_hash).first()
                if not ocr:
                    return None

                return {
                    "id": ocr.id,
                    "screenshot_id": ocr.screenshot_id,
                    "text_content": ocr.text_content,
                    "confidence": ocr.confidence,
                    "language": ocr.language,
                    "processing_time": ocr.processing_time,
                    "created_at": ocr.created_at,
                    "text_hash": ocr.text_hash,
                }
        except SQLAlchemyError as e:
            logger.error(f"根据文本哈希获取OCR结果失败: {e}")
            return None
