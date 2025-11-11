"""多模态向量数据库服务模块

提供图像和文本联合嵌入的存储和搜索服务。
支持基于CLIP模型的多模态语义搜索。
"""

import logging
import sys
from pathlib import Path
from typing import Any

import numpy as np

# 添加项目根目录到Python路径，以便直接运行此文件
if __name__ == "__main__":
    project_root = Path(__file__).parent.parent
    sys.path.insert(0, str(project_root))

from lifetrace.llm.multimodal_embedding import get_multimodal_embedding
from lifetrace.llm.vector_db import create_vector_db
from lifetrace.storage import DatabaseManager
from lifetrace.storage.models import OCRResult, Screenshot


class MultimodalVectorService:
    """多模态向量数据库服务

    支持图像和文本的联合嵌入存储和搜索。
    每个截图会生成两个向量：
    1. 文本向量：基于OCR识别的文本内容
    2. 图像向量：基于截图图像本身
    """

    def __init__(self, config, db_manager: DatabaseManager):
        """初始化多模态向量服务

        Args:
            config: 配置对象
            db_manager: 数据库管理器
        """
        self.config = config
        self.db_manager = db_manager
        self.logger = logging.getLogger(__name__)

        # 初始化向量数据库（扩展集合名称）
        self.text_vector_db = None
        self.image_vector_db = None
        self.multimodal_embedding = None

        # 配置参数
        self.text_weight = config.get("multimodal.text_weight", 0.6)  # 文本权重
        self.image_weight = config.get("multimodal.image_weight", 0.4)  # 图像权重
        self.enabled = config.get("multimodal.enabled", False)  # 默认禁用以节省内存

        # 只有在启用时才初始化嵌入器和向量数据库
        if self.enabled:
            self.logger.info("正在初始化多模态向量服务...")
            # 初始化多模态嵌入器（会加载 CLIP 模型，占用约 600-800MB 内存）
            self.multimodal_embedding = get_multimodal_embedding()

            if self.multimodal_embedding.is_available():
                self._initialize_vector_databases()
                self.logger.info("多模态向量服务已启用")
            else:
                self.enabled = False
                self.logger.warning("多模态向量服务不可用（缺少依赖或模型加载失败）")
        else:
            self.logger.info("多模态向量服务已禁用（配置中设置为 multimodal.enabled=false）")

    def _initialize_vector_databases(self):
        """初始化向量数据库"""
        try:
            # 创建文本向量数据库
            text_config = self._create_vector_config("text")
            self.text_vector_db = create_vector_db(text_config)

            # 创建图像向量数据库
            image_config = self._create_vector_config("image")
            self.image_vector_db = create_vector_db(image_config)

            if self.text_vector_db and self.image_vector_db:
                self.logger.info("多模态向量数据库初始化成功")
            else:
                self.enabled = False
                self.logger.error("多模态向量数据库初始化失败")

        except Exception as e:
            self.enabled = False
            self.logger.error(f"多模态向量数据库初始化失败: {e}")

    def _create_vector_config(self, modality: str):
        """创建特定模态的向量数据库配置"""

        class ModalityConfig:
            def __init__(self, base_config, modality):
                self.base_config = base_config
                self.modality = modality

            def get(self, key, default=None):
                if key == "vector_db_collection_name":
                    return f"lifetrace_{self.modality}"
                elif key == "vector_db_persist_directory":
                    base_dir = self.base_config.get("vector_db_persist_directory")
                    return f"{base_dir}_{self.modality}"
                else:
                    return self.base_config.get(key, default)

            @property
            def vector_db_enabled(self):
                return self.base_config.get("multimodal.enabled", True)

            @property
            def vector_db_collection_name(self):
                return f"lifetrace_{self.modality}"

            @property
            def vector_db_embedding_model(self):
                # 对于多模态服务，不使用sentence-transformers的模型
                # 返回一个特殊标识，在vector_db.py中会被特殊处理
                return None

            @property
            def vector_db_rerank_model(self):
                return self.base_config.get("vector_db_rerank_model")

            @property
            def vector_db_persist_directory(self):
                base_dir = self.base_config.vector_db_persist_directory
                return f"{base_dir}_{self.modality}"

            @property
            def vector_db_chunk_size(self):
                return self.base_config.vector_db_chunk_size

            @property
            def vector_db_chunk_overlap(self):
                return self.base_config.vector_db_chunk_overlap

            @property
            def vector_db_batch_size(self):
                return self.base_config.vector_db_batch_size

            @property
            def vector_db_auto_sync(self):
                return self.base_config.vector_db_auto_sync

            @property
            def vector_db_sync_interval(self):
                return self.base_config.vector_db_sync_interval

        return ModalityConfig(self.config, modality)

    def is_enabled(self) -> bool:
        """检查多模态向量服务是否可用"""
        return (
            self.enabled
            and self.multimodal_embedding is not None
            and self.multimodal_embedding.is_available()
        )

    def add_multimodal_result(self, ocr_result: OCRResult, screenshot: Screenshot) -> bool:
        """添加多模态结果到向量数据库

        Args:
            ocr_result: OCR 结果对象
            screenshot: 截图对象

        Returns:
            是否添加成功
        """
        if not self.is_enabled():
            return False

        try:
            success_text = self._add_text_vector(ocr_result, screenshot)
            success_image = self._add_image_vector(ocr_result, screenshot)

            # 至少一个成功就算成功
            return success_text or success_image

        except Exception as e:
            self.logger.error(f"添加多模态结果失败: {e}")
            return False

    def _add_text_vector(self, ocr_result: OCRResult, screenshot: Screenshot) -> bool:
        """添加文本向量"""
        if not ocr_result.text_content or not ocr_result.text_content.strip():
            return True  # 空文本不算失败

        try:
            # 生成文本嵌入
            text_embedding = self.multimodal_embedding.encode_text(ocr_result.text_content)
            if text_embedding is None:
                return False

            # 构建文档ID和元数据
            doc_id = f"text_ocr_{ocr_result.id}"
            metadata = self._build_metadata(ocr_result, screenshot, "text")

            # 使用预计算的嵌入添加到文本向量数据库
            return self.text_vector_db.add_document_with_embedding(
                doc_id=doc_id,
                text=ocr_result.text_content,
                embedding=text_embedding.tolist(),
                metadata=metadata,
            )

        except Exception as e:
            self.logger.error(f"添加文本向量失败: {e}")
            return False

    def _add_image_vector(self, ocr_result: OCRResult, screenshot: Screenshot) -> bool:
        """添加图像向量"""
        if not screenshot.file_path or not screenshot.file_path.strip():
            return True  # 无图像路径不算失败

        try:
            # 生成图像嵌入
            image_embedding = self.multimodal_embedding.encode_image(screenshot.file_path)
            if image_embedding is None:
                return False

            # 构建文档ID和元数据
            doc_id = f"image_ocr_{ocr_result.id}"
            metadata = self._build_metadata(ocr_result, screenshot, "image")

            # 使用预计算的嵌入添加到图像向量数据库
            return self.image_vector_db.add_document_with_embedding(
                doc_id=doc_id,
                text=screenshot.file_path,  # 存储图像路径作为"文本"
                embedding=image_embedding.tolist(),
                metadata=metadata,
            )

        except Exception as e:
            self.logger.error(f"添加图像向量失败: {e}")
            return False

    def _build_metadata(
        self, ocr_result: OCRResult, screenshot: Screenshot, modality: str
    ) -> dict[str, Any]:
        """构建元数据"""
        metadata = {
            "modality": modality,
            "ocr_result_id": ocr_result.id,
            "screenshot_id": ocr_result.screenshot_id,
            "confidence": ocr_result.confidence,
            "language": ocr_result.language or "unknown",
            "processing_time": ocr_result.processing_time,
            "created_at": (ocr_result.created_at.isoformat() if ocr_result.created_at else None),
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

        return metadata

    def multimodal_search(
        self,
        query: str,
        top_k: int = 10,
        text_weight: float | None = None,
        image_weight: float | None = None,
        filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """多模态语义搜索

        Args:
            query: 搜索查询
            top_k: 返回结果数量
            text_weight: 文本权重（0-1）
            image_weight: 图像权重（0-1）
            filters: 元数据过滤条件

        Returns:
            搜索结果列表
        """
        if not self.is_enabled():
            return []

        if not query or not query.strip():
            return []

        # 使用配置权重或默认权重
        if text_weight is None:
            text_weight = self.text_weight
        if image_weight is None:
            image_weight = self.image_weight

        # 确保权重和为1
        total_weight = text_weight + image_weight
        if total_weight > 0:
            text_weight = text_weight / total_weight
            image_weight = image_weight / total_weight
        else:
            text_weight = 0.6
            image_weight = 0.4

        try:
            # 生成查询嵌入
            query_text_embedding = self.multimodal_embedding.encode_text(query)
            if query_text_embedding is None:
                return []

            # 搜索文本向量
            text_results = []
            if text_weight > 0:
                text_results = self._search_text_with_embedding(
                    query_text_embedding,
                    top_k * 2,
                    filters,  # 获取更多候选
                )

            # 搜索图像向量（使用文本查询）
            image_results = []
            if image_weight > 0:
                # 需要自定义搜索，因为要用文本向量搜索图像向量
                image_results = self._search_image_with_text(
                    query_text_embedding, top_k * 2, filters
                )

            # 合并和重排序结果
            merged_results = self._merge_multimodal_results(
                text_results, image_results, text_weight, image_weight, top_k
            )

            return merged_results

        except Exception as e:
            self.logger.error(f"多模态搜索失败: {e}")
            return []

    def _search_text_with_embedding(
        self,
        query_embedding: np.ndarray,
        top_k: int,
        filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """使用预计算的嵌入搜索文本向量"""
        try:
            # 直接使用向量搜索文本数据库
            collection = self.text_vector_db.collection

            # 执行向量搜索
            results = collection.query(
                query_embeddings=[query_embedding.tolist()],
                n_results=top_k,
                where=self.text_vector_db._clean_where_clause(filters),
                include=["documents", "metadatas", "distances"],
            )

            # 格式化结果
            formatted_results = []
            for i in range(len(results["ids"][0])):
                formatted_results.append(
                    {
                        "id": results["ids"][0][i],
                        "document": results["documents"][0][i],
                        "metadata": (results["metadatas"][0][i] if results["metadatas"][0] else {}),
                        "distance": (results["distances"][0][i] if results["distances"] else None),
                    }
                )

            return formatted_results

        except Exception as e:
            self.logger.error(f"文本向量搜索失败: {e}")
            return []

    def _search_image_with_text(
        self,
        query_embedding: np.ndarray,
        top_k: int,
        filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """使用文本嵌入搜索图像向量"""
        try:
            # 直接使用向量搜索图像数据库
            # 这里需要自定义实现，因为标准的search方法会重新编码查询

            # 获取所有图像文档
            collection = self.image_vector_db.collection

            # 执行向量搜索
            results = collection.query(
                query_embeddings=[query_embedding.tolist()],
                n_results=top_k,
                where=self.image_vector_db._clean_where_clause(filters),
                include=["documents", "metadatas", "distances"],
            )

            # 格式化结果
            formatted_results = []
            for i in range(len(results["ids"][0])):
                formatted_results.append(
                    {
                        "id": results["ids"][0][i],
                        "document": results["documents"][0][i],
                        "metadata": (results["metadatas"][0][i] if results["metadatas"][0] else {}),
                        "distance": (results["distances"][0][i] if results["distances"] else None),
                    }
                )

            return formatted_results

        except Exception as e:
            self.logger.error(f"图像向量搜索失败: {e}")
            return []

    def _merge_multimodal_results(
        self,
        text_results: list[dict],
        image_results: list[dict],
        text_weight: float,
        image_weight: float,
        top_k: int,
    ) -> list[dict[str, Any]]:
        """合并多模态搜索结果"""
        try:
            # 构建结果字典，按OCR结果ID分组
            merged = {}

            # 处理文本结果
            for result in text_results:
                metadata = result.get("metadata", {})
                ocr_id = metadata.get("ocr_result_id")

                if ocr_id is not None:
                    # 统一转换为字符串类型以确保匹配
                    ocr_id_str = str(ocr_id)
                    if ocr_id_str not in merged:
                        merged[ocr_id_str] = {
                            "ocr_result_id": ocr_id,
                            "metadata": metadata,
                            "text_score": 0.0,
                            "image_score": 0.0,
                            "text_distance": result.get("distance", 1.0),
                            "image_distance": 1.0,
                            "text_content": result.get("document", ""),
                        }

                    # 距离转换为相似度，使用倒数公式以处理大于1的距离
                    distance = result.get("distance", 1.0)
                    similarity = 1.0 / (1.0 + distance)
                    merged[ocr_id_str]["text_score"] = similarity

            # 处理图像结果
            for result in image_results:
                metadata = result.get("metadata", {})
                ocr_id = metadata.get("ocr_result_id")

                if ocr_id is not None:
                    # 统一转换为字符串类型以确保匹配
                    ocr_id_str = str(ocr_id)
                    if ocr_id_str not in merged:
                        merged[ocr_id_str] = {
                            "ocr_result_id": ocr_id,
                            "metadata": metadata,
                            "text_score": 0.0,
                            "image_score": 0.0,
                            "text_distance": 1.0,
                            "image_distance": result.get("distance", 1.0),
                            "text_content": "",
                        }

                    # 距离转换为相似度，使用倒数公式以处理大于1的距离
                    distance = result.get("distance", 1.0)
                    similarity = 1.0 / (1.0 + distance)
                    merged[ocr_id_str]["image_score"] = similarity
                    merged[ocr_id_str]["image_distance"] = result.get("distance", 1.0)

            # 计算综合分数并排序
            final_results = []
            for _ocr_id, data in merged.items():
                # 综合分数 = 文本权重 * 文本分数 + 图像权重 * 图像分数
                combined_score = (
                    text_weight * data["text_score"] + image_weight * data["image_score"]
                )

                data["combined_score"] = combined_score
                data["text_weight"] = text_weight
                data["image_weight"] = image_weight

                # 获取完整的数据库信息
                enhanced_data = self._enhance_result_data(data)
                if enhanced_data:
                    final_results.append(enhanced_data)

            # 按综合分数排序
            final_results.sort(key=lambda x: x["combined_score"], reverse=True)

            return final_results[:top_k]

        except Exception as e:
            self.logger.error(f"合并多模态结果失败: {e}")
            return []

    def _enhance_result_data(self, result_data: dict[str, Any]) -> dict[str, Any] | None:
        """增强结果数据，添加数据库信息"""
        try:
            ocr_result_id = result_data.get("ocr_result_id")
            if not ocr_result_id:
                return None

            # 从数据库获取完整信息
            with self.db_manager.get_session() as session:
                ocr_result = session.query(OCRResult).filter(OCRResult.id == ocr_result_id).first()

                if not ocr_result:
                    return None

                screenshot = (
                    session.query(Screenshot)
                    .filter(Screenshot.id == ocr_result.screenshot_id)
                    .first()
                )

                # 构建增强结果
                enhanced = {
                    "id": f"multimodal_{ocr_result_id}",
                    "text": result_data.get("text_content", ocr_result.text_content or ""),
                    "combined_score": result_data["combined_score"],
                    "text_score": result_data["text_score"],
                    "image_score": result_data["image_score"],
                    "text_weight": result_data["text_weight"],
                    "image_weight": result_data["image_weight"],
                    "metadata": result_data["metadata"],
                    "ocr_result": {
                        "id": ocr_result.id,
                        "screenshot_id": ocr_result.screenshot_id,
                        "text_content": ocr_result.text_content,
                        "confidence": ocr_result.confidence,
                        "language": ocr_result.language,
                        "processing_time": ocr_result.processing_time,
                        "created_at": (
                            ocr_result.created_at.isoformat() if ocr_result.created_at else None
                        ),
                    },
                }

                if screenshot:
                    enhanced["screenshot"] = {
                        "id": screenshot.id,
                        "file_path": screenshot.file_path,
                        "timestamp": (
                            screenshot.created_at.isoformat() if screenshot.created_at else None
                        ),
                        "application": screenshot.app_name,
                        "window_title": screenshot.window_title,
                        "width": screenshot.width,
                        "height": screenshot.height,
                    }

                return enhanced

        except Exception as e:
            self.logger.error(f"增强结果数据失败: {e}")
            return None

    def sync_from_database(self, limit: int | None = None, force_reset: bool = False) -> int:
        """从SQLite数据库同步到多模态向量数据库"""
        if not self.is_enabled():
            return 0

        try:
            # 重置向量数据库（如果需要）
            if force_reset:
                self.reset()

            synced_count = 0

            with self.db_manager.get_session() as session:
                query = session.query(OCRResult).join(
                    Screenshot, OCRResult.screenshot_id == Screenshot.id
                )
                if limit:
                    query = query.limit(limit)

                ocr_results = query.all()

                for ocr_result in ocr_results:
                    screenshot = (
                        session.query(Screenshot)
                        .filter(Screenshot.id == ocr_result.screenshot_id)
                        .first()
                    )

                    if screenshot:
                        if self.add_multimodal_result(ocr_result, screenshot):
                            synced_count += 1

                        if synced_count % 50 == 0:
                            self.logger.info(f"已同步 {synced_count} 个多模态结果")

            self.logger.info(f"多模态同步完成: {synced_count} 个结果")
            return synced_count

        except Exception as e:
            self.logger.error(f"多模态同步失败: {e}")
            return 0

    def reset(self) -> bool:
        """重置多模态向量数据库"""
        try:
            success_text = True
            success_image = True

            if self.text_vector_db:
                success_text = self.text_vector_db.reset_collection()

            if self.image_vector_db:
                success_image = self.image_vector_db.reset_collection()

            success = success_text and success_image
            if success:
                self.logger.info("多模态向量数据库重置成功")

            return success

        except Exception as e:
            self.logger.error(f"多模态向量数据库重置失败: {e}")
            return False

    def get_stats(self) -> dict[str, Any]:
        """获取多模态向量数据库统计信息"""
        try:
            stats = {
                "enabled": self.is_enabled(),
                "multimodal_available": self.multimodal_embedding is not None
                and self.multimodal_embedding.is_available(),
                "text_weight": self.text_weight,
                "image_weight": self.image_weight,
                "text_database": {},
                "image_database": {},
            }

            if self.text_vector_db:
                stats["text_database"] = self.text_vector_db.get_collection_stats()

            if self.image_vector_db:
                stats["image_database"] = self.image_vector_db.get_collection_stats()

            return stats

        except Exception as e:
            self.logger.error(f"获取多模态统计信息失败: {e}")
            return {"enabled": False, "error": str(e)}


def create_multimodal_vector_service(
    config, db_manager: DatabaseManager
) -> MultimodalVectorService:
    """创建多模态向量服务实例

    如果配置中禁用了多模态功能，将创建一个禁用状态的服务实例，
    不会加载任何模型，节省内存。
    """
    # 检查是否启用多模态功能
    if not config.get("multimodal.enabled", False):
        logging.info("多模态功能已在配置中禁用，跳过模型加载")

    return MultimodalVectorService(config, db_manager)
