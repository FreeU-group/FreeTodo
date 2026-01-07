"""
事件摘要服务配置模块
包含常量定义和可选依赖检查
"""

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 常量定义
MIN_SCREENSHOTS_FOR_LLM = 3  # 使用LLM生成摘要的最小截图数量
MIN_OCR_TEXT_LENGTH = 10  # OCR文本的最小长度阈值
MAX_COMBINED_TEXT_LENGTH = 3000  # 合并OCR文本的最大长度
MIN_CLUSTER_SIZE = 2  # HDBSCAN聚类的最小聚类大小
MIN_TEXT_COUNT_FOR_CLUSTERING = 2  # 进行聚类的最小文本数量
MIN_OCR_LINE_LENGTH = 3  # OCR文本行的最小长度阈值（用于过滤噪声行）
MIN_OCR_CONFIDENCE = 0.6  # OCR结果最低置信度，低于此阈值的块跳过
UI_REPEAT_THRESHOLD = 3  # 将文本标记为UI候选的跨截图重复次数阈值
UI_CANDIDATE_MAX_LENGTH = 25  # UI候选的最大长度（字符）
UI_REPRESENTATIVE_LIMIT = 2  # 保留的代表性UI文本数量上限
MAX_TITLE_LENGTH = 20  # 标题最大长度（字符数）
MAX_SUMMARY_LENGTH = 50  # 摘要最大长度（字符数，对应提示词要求）
OCR_PREVIEW_LENGTH = 100  # OCR预览文本长度
RESPONSE_PREVIEW_LENGTH = 500  # 响应预览文本长度

# 尝试导入HDBSCAN
try:
    import hdbscan  # noqa: F401
    import numpy as np  # noqa: F401
    from scipy.spatial.distance import pdist, squareform

    HDBSCAN_AVAILABLE = True
    SCIPY_AVAILABLE = True
except ImportError:
    HDBSCAN_AVAILABLE = False
    SCIPY_AVAILABLE = False
    pdist = None
    squareform = None
    logger.warning("HDBSCAN or scipy not available, clustering will fallback to simple aggregation")
