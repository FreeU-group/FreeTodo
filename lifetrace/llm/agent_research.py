"""调研相关逻辑处理模块"""

from lifetrace.util.logging_config import get_logger

logger = get_logger()


def detect_research_scenario(user_query: str) -> bool:
    """检测是否是调研场景

    调研场景特征：
    - 包含"调研"、"为我调研"、"帮我调研"等关键词
    - 用户明确要求进行信息收集和研究

    Args:
        user_query: 用户查询

    Returns:
        是否是调研场景
    """
    research_keywords = ["调研", "为我调研", "帮我调研", "研究一下", "查找一下"]
    return any(keyword in user_query for keyword in research_keywords)
