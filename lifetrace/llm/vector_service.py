"""向量数据库服务模块

提供 OCR 结果的向量化存储和语义搜索服务。
与现有的 SQLite 数据库并行工作。
"""

from datetime import datetime
from typing import Any

from lifetrace.llm.vector_db import create_vector_db
from lifetrace.storage import event_mgr, get_session
from lifetrace.storage.models import OCRResult, Screenshot
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class VectorService:
    """向量数据库服务

    负责将 OCR 结果存储到向量数据库，并提供语义搜索功能。
    """

    def __init__(self):
        """初始化向量服务"""
        self.logger = logger

        # 初始化向量数据库
        self.vector_db = create_vector_db()
        if self.vector_db is None:
            self.logger.warning("Vector database not available")
            self.enabled = False
        else:
            self.enabled = True
            self.logger.info("Vector service initialized successfully")

    def is_enabled(self) -> bool:
        """检查向量服务是否可用"""
        return self.enabled and self.vector_db is not None

    def add_ocr_result(self, ocr_result: OCRResult, screenshot: Screenshot | None = None) -> bool:
        """添加 OCR 结果到向量数据库

        Args:
            ocr_result: OCR 结果对象
            screenshot: 关联的截图对象（可选）

        Returns:
            是否添加成功
        """
        if not self.is_enabled():
            return False

        if not ocr_result.text_content or not ocr_result.text_content.strip():
            self.logger.debug(f"Skipping empty OCR result {ocr_result.id}")
            return False

        try:
            # 构建文档 ID
            doc_id = f"ocr_{ocr_result.id}"

            # 构建元数据
            metadata = {
                "ocr_result_id": ocr_result.id,
                "screenshot_id": ocr_result.screenshot_id,
                "confidence": ocr_result.confidence,
                "language": ocr_result.language or "unknown",
                "processing_time": ocr_result.processing_time,
                "created_at": (
                    ocr_result.created_at.isoformat() if ocr_result.created_at else None
                ),
                "text_length": len(ocr_result.text_content),
            }

            # 添加截图与事件相关信息
            if screenshot:
                metadata.update(
                    {
                        "screenshot_path": screenshot.file_path,
                        "screenshot_timestamp": (
                            screenshot.created_at.isoformat() if screenshot.created_at else None
                        ),
                        "application": screenshot.app_name,
                        "window_title": screenshot.window_title,
                        "width": screenshot.width,
                        "height": screenshot.height,
                        "event_id": getattr(screenshot, "event_id", None),
                    }
                )

            # 添加到向量数据库
            success = self.vector_db.add_document(
                doc_id=doc_id, text=ocr_result.text_content, metadata=metadata
            )

            if success:
                self.logger.debug(f"Added OCR result {ocr_result.id} to vector database")
            else:
                self.logger.warning(f"Failed to add OCR result {ocr_result.id} to vector database")

            return success

        except Exception as e:
            self.logger.error(f"Error adding OCR result {ocr_result.id} to vector database: {e}")
            return False

    def update_ocr_result(
        self, ocr_result: OCRResult, screenshot: Screenshot | None = None
    ) -> bool:
        """更新向量数据库中的 OCR 结果

        Args:
            ocr_result: OCR 结果对象
            screenshot: 关联的截图对象（可选）

        Returns:
            是否更新成功
        """
        if not self.is_enabled():
            return False

        try:
            doc_id = f"ocr_{ocr_result.id}"

            # 构建元数据
            metadata = {
                "ocr_result_id": ocr_result.id,
                "screenshot_id": ocr_result.screenshot_id,
                "confidence": ocr_result.confidence,
                "language": ocr_result.language or "unknown",
                "processing_time": ocr_result.processing_time,
                "created_at": (
                    ocr_result.created_at.isoformat() if ocr_result.created_at else None
                ),
                "updated_at": datetime.now().isoformat(),
                "text_length": len(ocr_result.text_content or ""),
            }

            if screenshot:
                metadata.update(
                    {
                        "screenshot_path": screenshot.file_path,
                        "screenshot_timestamp": (
                            screenshot.created_at.isoformat() if screenshot.created_at else None
                        ),
                        "application": screenshot.app_name,
                        "window_title": screenshot.window_title,
                        "width": screenshot.width,
                        "height": screenshot.height,
                    }
                )

            success = self.vector_db.update_document(
                doc_id=doc_id, text=ocr_result.text_content or "", metadata=metadata
            )

            if success:
                self.logger.debug(f"Updated OCR result {ocr_result.id} in vector database")

            return success

        except Exception as e:
            self.logger.error(f"Error updating OCR result {ocr_result.id} in vector database: {e}")
            return False

    def delete_ocr_result(self, ocr_result_id: int) -> bool:
        """从向量数据库中删除 OCR 结果

        Args:
            ocr_result_id: OCR 结果 ID

        Returns:
            是否删除成功
        """
        if not self.is_enabled():
            return False

        try:
            doc_id = f"ocr_{ocr_result_id}"
            success = self.vector_db.delete_document(doc_id)

            if success:
                self.logger.debug(f"Deleted OCR result {ocr_result_id} from vector database")

            return success

        except Exception as e:
            self.logger.error(
                f"Error deleting OCR result {ocr_result_id} from vector database: {e}"
            )
            return False

    def _compute_score(self, result: dict[str, Any]) -> float:
        """计算统一的相似度分数"""
        if "rerank_score" in result:
            return result["rerank_score"]
        if "distance" in result:
            return max(0, 1 - result["distance"])
        return 0.0

    def _fetch_db_records(
        self, ocr_result_id: int | None, screenshot_id: int | None
    ) -> dict[str, Any]:
        """获取数据库中的 OCR 和截图记录"""
        result: dict[str, Any] = {}
        if not ocr_result_id:
            return result

        with get_session() as session:
            ocr_result = session.query(OCRResult).filter(OCRResult.id == ocr_result_id).first()
            if ocr_result:
                result["ocr_result"] = {
                    "id": ocr_result.id,
                    "text_content": ocr_result.text_content,
                    "confidence": ocr_result.confidence,
                    "language": ocr_result.language,
                    "processing_time": ocr_result.processing_time,
                    "created_at": (
                        ocr_result.created_at.isoformat() if ocr_result.created_at else None
                    ),
                }

            if screenshot_id:
                screenshot = (
                    session.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
                )
                if screenshot:
                    result["screenshot"] = {
                        "id": screenshot.id,
                        "file_path": screenshot.file_path,
                        "app_name": screenshot.app_name,
                        "window_title": screenshot.window_title,
                        "width": screenshot.width,
                        "height": screenshot.height,
                        "created_at": (
                            screenshot.created_at.isoformat() if screenshot.created_at else None
                        ),
                    }
        return result

    def _enhance_result(self, result: dict[str, Any]) -> dict[str, Any]:
        """增强单个搜索结果"""
        enhanced = result.copy()
        enhanced["score"] = self._compute_score(result)

        metadata = result.get("metadata", {})
        try:
            db_records = self._fetch_db_records(
                metadata.get("ocr_result_id"), metadata.get("screenshot_id")
            )
            enhanced.update(db_records)
        except Exception as db_error:
            self.logger.warning(f"无法获取相关数据库记录: {db_error}")

        return enhanced

    def semantic_search(
        self,
        query: str,
        top_k: int = 10,
        use_rerank: bool = True,
        retrieve_k: int | None = None,
        filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """语义搜索 OCR 结果

        Args:
            query: 搜索查询
            top_k: 返回结果数量
            use_rerank: 是否使用重排序
            retrieve_k: 初始检索数量（用于重排序）
            filters: 元数据过滤条件

        Returns:
            搜索结果列表
        """
        if not self.is_enabled() or not query or not query.strip():
            return []

        try:
            if use_rerank:
                if retrieve_k is None:
                    retrieve_k = min(top_k * 3, 50)
                results = self.vector_db.search_and_rerank(
                    query=query, retrieve_k=retrieve_k, rerank_k=top_k, where=filters
                )
            else:
                results = self.vector_db.search(query=query, top_k=top_k, where=filters)

            return [self._enhance_result(r) for r in results]

        except Exception as e:
            self.logger.error(f"语义搜索失败: {e}")
            return []

    # 事件级索引与搜索
    def upsert_event_document(self, event_id: int) -> bool:
        """将事件聚合文本写入向量库，文档ID: event_{event_id}"""
        if not self.is_enabled():
            return False
        try:
            # 聚合事件文本
            event_text = event_mgr.get_event_text(event_id) or ""
            if not event_text or not event_text.strip():
                self.logger.debug(f"事件{event_id}无文本，跳过索引")
                return False

            # 元数据（基本信息）
            # 为了简化，这里不再重复查事件信息，向上层调用者可扩展
            doc_id = f"event_{event_id}"
            return self.vector_db.update_document(doc_id, event_text, {"event_id": event_id})
        except Exception as e:
            self.logger.error(f"事件{event_id}写入向量库失败: {e}")
            return False

    def _aggregate_event_scores(self, results: list[dict[str, Any]]) -> dict[int, dict[str, float]]:
        """按 event_id 聚合结果，保留最高分数"""
        event_scores: dict[int, dict[str, float]] = {}
        for result in results:
            event_id = result.get("metadata", {}).get("event_id")
            if not event_id:
                continue

            semantic_score = self._compute_score(result)
            if event_id not in event_scores or semantic_score > event_scores[event_id]["score"]:
                event_scores[event_id] = {
                    "score": semantic_score,
                    "distance": result.get("distance", 1.0),
                }
        return event_scores

    def _fetch_event_details(
        self, event_id: int, score_info: dict[str, float]
    ) -> dict[str, Any] | None:
        """获取事件详细信息"""
        from lifetrace.storage.models import Event, Screenshot

        with get_session() as session:
            event = session.query(Event).filter(Event.id == event_id).first()
            if not event:
                return None

            screenshot_count = (
                session.query(Screenshot).filter(Screenshot.event_id == event_id).count()
            )
            first_screenshot = (
                session.query(Screenshot)
                .filter(Screenshot.event_id == event_id)
                .order_by(Screenshot.created_at.asc())
                .first()
            )

            return {
                "id": event.id,
                "app_name": event.app_name,
                "window_title": event.window_title,
                "start_time": event.start_time.isoformat() if event.start_time else None,
                "end_time": event.end_time.isoformat() if event.end_time else None,
                "screenshot_count": screenshot_count,
                "first_screenshot_id": first_screenshot.id if first_screenshot else None,
                "semantic_score": score_info["score"],
                "distance": score_info["distance"],
            }

    def semantic_search_events(self, query: str, top_k: int = 10) -> list[dict[str, Any]]:
        """对事件文档进行语义搜索（基于 event_{id} 文档）"""
        if not self.is_enabled():
            return []

        try:
            search_limit = max(top_k * 3, 50)
            all_results = self.vector_db.search(query=query, top_k=search_limit)
            if not all_results:
                return []

            event_scores = self._aggregate_event_scores(all_results)

            event_results = []
            for event_id, score_info in event_scores.items():
                try:
                    event_data = self._fetch_event_details(event_id, score_info)
                    if event_data:
                        event_results.append(event_data)
                except Exception as db_error:
                    self.logger.warning(f"获取事件{event_id}详细信息失败: {db_error}")

            event_results.sort(key=lambda x: x.get("semantic_score", 0.0), reverse=True)
            return event_results[:top_k]

        except Exception as e:
            self.logger.error(f"事件语义搜索失败: {e}")
            return []

    def _should_reset_vector_db(
        self, total_ocr_count: int, vector_doc_count: int, force_reset: bool
    ) -> bool:
        """判断是否需要重置向量数据库"""
        if force_reset:
            return True
        # SQLite 为空但向量数据库不为空
        return total_ocr_count == 0 and vector_doc_count > 0

    def _sync_ocr_results(self, session, ocr_results: list) -> int:
        """同步 OCR 结果到向量数据库"""
        synced_count = 0
        for ocr_result in ocr_results:
            screenshot = (
                session.query(Screenshot).filter(Screenshot.id == ocr_result.screenshot_id).first()
            )
            if screenshot is None:
                self.logger.warning(f"Screenshot not found for OCR result {ocr_result.id}")
                continue

            if self.add_ocr_result(ocr_result, screenshot):
                synced_count += 1
                if synced_count % 100 == 0:
                    self.logger.info(f"Synced {synced_count} OCR results to vector database")

        return synced_count

    def sync_from_database(self, limit: int | None = None, force_reset: bool = False) -> int:
        """从 SQLite 数据库同步 OCR 结果到向量数据库

        Args:
            limit: 同步的最大记录数，None 表示同步全部
            force_reset: 是否先重置向量数据库

        Returns:
            同步的记录数
        """
        if not self.is_enabled():
            return 0

        try:
            with get_session() as session:
                total_ocr_count = session.query(OCRResult).count()
                vector_doc_count = self.vector_db.get_collection_stats().get("document_count", 0)
                self.logger.info(
                    f"SQLite: {total_ocr_count} OCR results, Vector: {vector_doc_count} documents"
                )

                if self._should_reset_vector_db(total_ocr_count, vector_doc_count, force_reset):
                    self.logger.info("Resetting vector database")
                    self.reset()
                    if total_ocr_count == 0:
                        return 0

                if total_ocr_count == 0:
                    self.logger.info("Both databases are empty, no sync needed")
                    return 0

                query = session.query(OCRResult).join(
                    Screenshot, OCRResult.screenshot_id == Screenshot.id
                )
                if limit:
                    query = query.limit(limit)
                ocr_results = query.all()

                if not limit and len(ocr_results) != vector_doc_count:
                    self.logger.info("Document count mismatch, resetting vector database")
                    self.reset()

                synced_count = self._sync_ocr_results(session, ocr_results)
                self.logger.info(
                    f"Completed sync: {synced_count} OCR results added to vector database"
                )
                return synced_count

        except Exception as e:
            self.logger.error(f"Error syncing from database: {e}")
            return 0

    def get_stats(self) -> dict[str, Any]:
        """获取向量数据库统计信息

        Returns:
            统计信息字典
        """
        if not self.is_enabled():
            return {"enabled": False, "reason": "Vector database not available"}

        try:
            stats = self.vector_db.get_collection_stats()
            stats["enabled"] = True
            return stats
        except Exception as e:
            self.logger.error(f"Error getting vector database stats: {e}")
            return {"enabled": True, "error": str(e)}

    def reset(self) -> bool:
        """重置向量数据库

        Returns:
            是否重置成功
        """
        if not self.is_enabled():
            return False

        try:
            success = self.vector_db.reset_collection()
            if success:
                self.logger.info("Vector database reset successfully")
            return success
        except Exception as e:
            self.logger.error(f"Error resetting vector database: {e}")
            return False


def create_vector_service() -> VectorService:
    """创建向量服务实例

    Returns:
        向量服务实例
    """
    return VectorService()
