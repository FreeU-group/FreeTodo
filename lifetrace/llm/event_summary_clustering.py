"""
事件摘要聚类模块
包含HDBSCAN聚类相关逻辑
"""

from lifetrace.util.logging_config import get_logger

from .event_summary_config import (
    HDBSCAN_AVAILABLE,
    MIN_CLUSTER_SIZE,
    MIN_TEXT_COUNT_FOR_CLUSTERING,
    SCIPY_AVAILABLE,
    pdist,
    squareform,
)

logger = get_logger()


def check_clustering_prerequisites(ocr_texts: list[str], vector_service) -> tuple[bool, str]:
    """检查聚类前置条件

    Returns:
        (是否满足条件, 错误消息)
    """
    if not HDBSCAN_AVAILABLE:
        return False, "HDBSCAN不可用，回退到简单聚合"

    if not ocr_texts or len(ocr_texts) < MIN_TEXT_COUNT_FOR_CLUSTERING:
        return False, "文本数量不足"

    if not vector_service:
        return False, "向量服务未初始化，回退到简单聚合"

    if not vector_service.is_enabled():
        return (
            False,
            f"向量服务未启用 (enabled={vector_service.enabled}, "
            f"vector_db={'存在' if vector_service.vector_db else '不存在'})，回退到简单聚合",
        )

    if not vector_service.vector_db:
        return False, "向量数据库实例不存在，回退到简单聚合"

    return True, ""


def vectorize_texts(ocr_texts: list[str], vector_service) -> tuple[list[list[float]], list[str]]:
    """对OCR文本进行向量化

    Returns:
        (向量列表, 有效文本列表)
    """
    embeddings = []
    valid_texts = []
    for text in ocr_texts:
        if not text or not text.strip():
            continue
        embedding = vector_service.vector_db.embed_text(text)
        if embedding:
            embeddings.append(embedding)
            valid_texts.append(text)
    return embeddings, valid_texts


def calculate_cluster_params(text_count: int) -> int:
    """计算HDBSCAN聚类参数

    适应行级别的文本数量（通常远大于截图数量），使用更保守的参数。

    Args:
        text_count: 文本数量（对于行级别聚类，通常是文本行数量）

    Returns:
        min_cluster_size
    """
    min_cluster_size = max(MIN_CLUSTER_SIZE, text_count // 20)
    max_cluster_size = max(MIN_CLUSTER_SIZE, text_count // 3)
    min_cluster_size = min(min_cluster_size, max_cluster_size)
    return max(MIN_CLUSTER_SIZE, min_cluster_size)


def select_representative_texts(cluster_labels: list[int], valid_texts: list[str]) -> list[str]:
    """从聚类结果中选择代表性文本

    Returns:
        代表性文本列表
    """
    representative_texts = []
    unique_labels = set(cluster_labels)

    for label in unique_labels:
        indices = [
            idx for idx, cluster_label in enumerate(cluster_labels) if cluster_label == label
        ]
        if not indices:
            continue

        cluster_texts = [valid_texts[i] for i in indices]
        longest_text = max(cluster_texts, key=len)
        representative_texts.append(longest_text)

    return representative_texts


def cluster_ocr_texts_with_hdbscan(ocr_texts: list[str], vector_service) -> list[str]:
    """
    使用HDBSCAN对向量化的OCR文本进行聚类，返回代表性文本
    """
    can_cluster, error_msg = check_clustering_prerequisites(ocr_texts, vector_service)
    if not can_cluster:
        if error_msg and error_msg != "文本数量不足":
            logger.warning(error_msg)
        return ocr_texts

    try:
        import hdbscan
        import numpy as np

        embeddings, valid_texts = vectorize_texts(ocr_texts, vector_service)

        if len(embeddings) < MIN_TEXT_COUNT_FOR_CLUSTERING:
            logger.debug("有效文本数量不足，无法进行聚类")
            return valid_texts

        embeddings_array = np.array(embeddings)
        min_cluster_size = calculate_cluster_params(len(valid_texts))
        logger.info(
            f"使用HDBSCAN聚类: {len(valid_texts)} 个文本, min_cluster_size={min_cluster_size}"
        )

        if SCIPY_AVAILABLE and pdist is not None and squareform is not None:
            cosine_distances = pdist(embeddings_array, metric="cosine")
            distance_matrix = squareform(cosine_distances)
            clusterer = hdbscan.HDBSCAN(
                min_cluster_size=min_cluster_size,
                min_samples=1,
                metric="precomputed",
            )
            cluster_labels = clusterer.fit_predict(distance_matrix)
        else:
            logger.warning("scipy不可用，使用欧氏距离替代余弦距离")
            clusterer = hdbscan.HDBSCAN(
                min_cluster_size=min_cluster_size,
                min_samples=1,
                metric="euclidean",
            )
            cluster_labels = clusterer.fit_predict(embeddings_array)

        representative_texts = select_representative_texts(cluster_labels, valid_texts)
        return representative_texts or valid_texts

    except Exception as e:
        logger.error(f"HDBSCAN聚类失败: {e}", exc_info=True)
        return ocr_texts
