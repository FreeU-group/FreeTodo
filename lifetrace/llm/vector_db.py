"""向量数据库模块

提供文本嵌入、向量存储、语义检索和重排序功能。
支持与现有 SQLite 数据库并行使用。
"""

import hashlib
from datetime import datetime
from typing import Any

from lifetrace.util.logging_config import get_logger

logger = get_logger()

try:
    import chromadb
    import numpy as np
    from chromadb.config import Settings
    from sentence_transformers import CrossEncoder, SentenceTransformer
except ImportError as e:
    logger.warning(f"Vector database dependencies not installed: {e}")
    logger.warning("Please install with: pip install -r requirements_vector.txt")
    SentenceTransformer = None
    CrossEncoder = None
    chromadb = None
    np = None


class VectorDatabase:
    """向量数据库管理器

    提供文本嵌入、向量存储和语义检索功能。
    使用 ChromaDB 作为向量数据库后端。
    """

    def __init__(self):
        """初始化向量数据库"""
        from lifetrace.util.path_utils import get_vector_db_dir
        from lifetrace.util.settings import settings

        self.logger = logger

        # 检查依赖
        if not self._check_dependencies():
            raise ImportError("Vector database dependencies not available")

        # 初始化模型和数据库
        self.embedding_model = None
        self.cross_encoder = None
        self.chroma_client = None
        self.collection = None

        # 配置参数
        self.vector_db_path = get_vector_db_dir()
        self.embedding_model_name = settings.get("vector_db.embedding_model")
        self.cross_encoder_model_name = settings.get("vector_db.rerank_model")
        self.collection_name = settings.vector_db.collection_name

        # 初始化
        self._initialize()

    def _check_dependencies(self) -> bool:
        """检查依赖是否可用"""
        return all(
            [
                SentenceTransformer is not None,
                CrossEncoder is not None,
                chromadb is not None,
                np is not None,
            ]
        )

    def _initialize(self):
        """初始化模型和数据库"""
        try:
            # 创建数据目录
            self.vector_db_path.mkdir(parents=True, exist_ok=True)

            # 初始化嵌入模型
            if self.embedding_model_name:
                self.logger.info(f"Loading embedding model: {self.embedding_model_name}")
                self.embedding_model = SentenceTransformer(self.embedding_model_name)
            else:
                self.logger.info("Skipping embedding model initialization (multimodal mode)")
                self.embedding_model = None

            # 初始化 ChromaDB
            self.logger.info(f"Initializing ChromaDB at: {self.vector_db_path}")
            self.chroma_client = chromadb.PersistentClient(
                path=str(self.vector_db_path),
                settings=Settings(anonymized_telemetry=False, allow_reset=True),
            )

            # 获取或创建集合
            self.collection = self.chroma_client.get_or_create_collection(
                name=self.collection_name,
                metadata={"description": "LifeTrace OCR text embeddings"},
            )

            self.logger.info("Vector database initialized successfully")

        except Exception as e:
            self.logger.error(f"Failed to initialize vector database: {e}")
            raise

    def _get_cross_encoder(self) -> CrossEncoder:
        """延迟加载交叉编码器"""
        if self.cross_encoder is None:
            self.logger.info(f"Loading cross-encoder model: {self.cross_encoder_model_name}")
            self.cross_encoder = CrossEncoder(self.cross_encoder_model_name)
        return self.cross_encoder

    def embed_text(self, text: str) -> list[float]:
        """将文本转换为向量嵌入

        Args:
            text: 输入文本

        Returns:
            文本的向量嵌入
        """
        if not text or not text.strip():
            return []

        if not self.embedding_model:
            raise RuntimeError("Embedding model not available (multimodal mode)")

        try:
            embedding = self.embedding_model.encode(text.strip(), normalize_embeddings=True)
            return embedding.tolist()
        except Exception as e:
            self.logger.error(f"Failed to embed text: {e}")
            return []

    def add_document(self, doc_id: str, text: str, metadata: dict[str, Any] | None = None) -> bool:
        """添加文档到向量数据库

        Args:
            doc_id: 文档唯一标识符
            text: 文档文本内容
            metadata: 文档元数据

        Returns:
            是否添加成功
        """
        if not text or not text.strip():
            self.logger.warning(f"Empty text for document {doc_id}")
            return False

        try:
            # 生成嵌入
            embedding = self.embed_text(text)
            if not embedding:
                return False

            # 准备元数据
            doc_metadata = {
                "timestamp": datetime.now().isoformat(),
                "text_length": len(text),
                "text_hash": hashlib.md5(text.encode()).hexdigest(),
            }
            if metadata:
                doc_metadata.update(metadata)

            # 过滤掉 None 值（ChromaDB 不接受 None）
            doc_metadata = {k: v for k, v in doc_metadata.items() if v is not None}

            # 添加到集合
            self.collection.add(
                documents=[text],
                embeddings=[embedding],
                metadatas=[doc_metadata],
                ids=[doc_id],
            )

            self.logger.debug(f"Added document {doc_id} to vector database")
            return True

        except Exception as e:
            self.logger.error(f"Failed to add document {doc_id}: {e}")
            return False

    def add_document_with_embedding(
        self,
        doc_id: str,
        text: str,
        embedding: list[float],
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        """使用预计算的嵌入向量添加文档到向量数据库

        Args:
            doc_id: 文档唯一标识符
            text: 文档文本内容
            embedding: 预计算的嵌入向量
            metadata: 文档元数据

        Returns:
            是否添加成功
        """
        if not text or not text.strip():
            self.logger.warning(f"Empty text for document {doc_id}")
            return False

        if not embedding:
            self.logger.warning(f"Empty embedding for document {doc_id}")
            return False

        try:
            # 准备元数据
            doc_metadata = {
                "timestamp": datetime.now().isoformat(),
                "text_length": len(text),
                "text_hash": hashlib.md5(text.encode()).hexdigest(),
            }
            if metadata:
                doc_metadata.update(metadata)

            # 过滤掉 None 值（ChromaDB 不接受 None）
            doc_metadata = {k: v for k, v in doc_metadata.items() if v is not None}

            # 添加到集合
            self.collection.add(
                documents=[text],
                embeddings=[embedding],
                metadatas=[doc_metadata],
                ids=[doc_id],
            )

            self.logger.debug(f"Added document {doc_id} with pre-computed embedding")
            return True

        except Exception as e:
            self.logger.error(f"Failed to add document {doc_id} with embedding: {e}")
            return False

    def update_document(
        self, doc_id: str, text: str, metadata: dict[str, Any] | None = None
    ) -> bool:
        """更新文档

        Args:
            doc_id: 文档唯一标识符
            text: 新的文档文本内容
            metadata: 新的文档元数据

        Returns:
            是否更新成功
        """
        try:
            # 先删除旧文档
            self.delete_document(doc_id)
            # 添加新文档
            return self.add_document(doc_id, text, metadata)
        except Exception as e:
            self.logger.error(f"Failed to update document {doc_id}: {e}")
            return False

    def delete_document(self, doc_id: str) -> bool:
        """删除文档

        Args:
            doc_id: 文档唯一标识符

        Returns:
            是否删除成功
        """
        try:
            self.collection.delete(ids=[doc_id])
            self.logger.debug(f"Deleted document {doc_id} from vector database")
            return True
        except Exception as e:
            self.logger.error(f"Failed to delete document {doc_id}: {e}")
            return False

    def search(
        self, query: str, top_k: int = 10, where: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """语义搜索

        Args:
            query: 查询文本
            top_k: 返回结果数量
            where: 元数据过滤条件

        Returns:
            搜索结果列表，每个结果包含 id, document, metadata, distance
        """
        if not query or not query.strip():
            return []

        try:
            # 生成查询嵌入
            query_embedding = self.embed_text(query)
            if not query_embedding:
                return []

            # 清理和验证 where 条件
            cleaned_where = self._clean_where_clause(where)

            # 执行搜索
            results = self.collection.query(
                query_embeddings=[query_embedding], n_results=top_k, where=cleaned_where
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

            self.logger.debug(f"Found {len(formatted_results)} results for query: {query[:50]}...")
            return formatted_results

        except Exception as e:
            self.logger.error(f"Failed to search: {e}")
            return []

    def _clean_where_clause(self, where: dict[str, Any] | None) -> dict[str, Any] | None:
        """清理和验证 where 条件，移除空对象和无效操作符

        Args:
            where: 原始的 where 条件

        Returns:
            清理后的 where 条件，如果没有有效条件则返回 None
        """
        if not where:
            return None

        cleaned = {}
        for key, value in where.items():
            # 跳过空对象或无效值
            if value is None or (isinstance(value, dict) and not value):
                continue

            # 如果是字典，递归清理
            if isinstance(value, dict):
                cleaned_value = self._clean_where_clause(value)
                if cleaned_value:
                    cleaned[key] = cleaned_value
            else:
                cleaned[key] = value

        return cleaned if cleaned else None

    def rerank(
        self, query: str, documents: list[str], top_k: int | None = None
    ) -> list[tuple[str, float]]:
        """使用交叉编码器重排序文档

        Args:
            query: 查询文本
            documents: 文档列表
            top_k: 返回的文档数量，None 表示返回全部

        Returns:
            重排序后的文档列表，每个元素为 (document, score)
        """
        if not query or not documents:
            return []

        try:
            cross_encoder = self._get_cross_encoder()

            # 构建查询-文档对
            pairs = [(query, doc) for doc in documents]

            # 计算相关性分数
            scores = cross_encoder.predict(pairs)

            # 排序
            scored_docs = list(zip(documents, scores, strict=False))
            scored_docs.sort(key=lambda x: x[1], reverse=True)

            # 返回指定数量
            if top_k is not None:
                scored_docs = scored_docs[:top_k]

            self.logger.debug(f"Reranked {len(documents)} documents, returning {len(scored_docs)}")
            return scored_docs

        except Exception as e:
            self.logger.error(f"Failed to rerank documents: {e}")
            return [(doc, 0.0) for doc in documents]

    def search_and_rerank(
        self,
        query: str,
        retrieve_k: int = 20,
        rerank_k: int = 5,
        where: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """搜索并重排序

        Args:
            query: 查询文本
            retrieve_k: 初始检索数量
            rerank_k: 重排序后返回数量
            where: 元数据过滤条件

        Returns:
            重排序后的搜索结果
        """
        # 初始检索
        search_results = self.search(query, retrieve_k, where)
        if not search_results:
            return []

        # 提取文档文本
        documents = [result["document"] for result in search_results]

        # 重排序
        reranked_docs = self.rerank(query, documents, rerank_k)

        # 构建最终结果
        final_results = []
        for doc, score in reranked_docs:
            # 找到对应的原始结果
            for result in search_results:
                if result["document"] == doc:
                    result["rerank_score"] = float(score)
                    final_results.append(result)
                    break

        return final_results

    def get_collection_stats(self) -> dict[str, Any]:
        """获取集合统计信息

        Returns:
            集合统计信息
        """
        try:
            count = self.collection.count()
            return {
                "collection_name": self.collection_name,
                "document_count": count,
                "embedding_model": self.embedding_model_name,
                "cross_encoder_model": self.cross_encoder_model_name,
                "vector_db_path": str(self.vector_db_path),
            }
        except Exception as e:
            self.logger.error(f"Failed to get collection stats: {e}")
            return {}

    def reset_collection(self) -> bool:
        """重置集合（删除所有数据）

        Returns:
            是否重置成功
        """
        try:
            self.chroma_client.delete_collection(self.collection_name)
            self.collection = self.chroma_client.create_collection(
                name=self.collection_name,
                metadata={"description": "LifeTrace OCR text embeddings"},
            )
            self.logger.info(f"Reset collection {self.collection_name}")
            return True
        except Exception as e:
            self.logger.error(f"Failed to reset collection: {e}")
            return False


def create_vector_db() -> VectorDatabase | None:
    """创建向量数据库实例

    Returns:
        向量数据库实例，如果依赖不可用则返回 None
    """
    from lifetrace.util.settings import settings

    # 检查依赖
    if not all([SentenceTransformer, CrossEncoder, chromadb, np]):
        logger.warning("Vector database dependencies not available")
        return None

    # 检查是否启用向量数据库
    if not settings.vector_db.enabled:
        logger.info("Vector database is disabled in configuration")
        return None

    try:
        return VectorDatabase()
    except ImportError:
        logger.warning("Vector database not available, skipping initialization")
        return None
    except Exception as e:
        logger.error(f"Failed to create vector database: {e}")
        return None
