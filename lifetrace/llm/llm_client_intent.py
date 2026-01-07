"""
LLM 意图分类模块
包含意图分类和规则匹配逻辑
"""

import json
from typing import Any

from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.token_usage_logger import log_token_usage

logger = get_logger()


def classify_intent_with_llm(client, model: str, user_query: str) -> dict[str, Any]:
    """使用LLM分类用户意图

    Args:
        client: OpenAI客户端
        model: 模型名称
        user_query: 用户查询

    Returns:
        包含意图分类结果的字典
    """
    try:
        prompt = """
请分析以下用户输入，判断用户的意图类型。

用户输入："<USER_QUERY>"

请判断这个输入属于以下哪种类型：
1. "database_query" - 需要查询数据库的请求（如：搜索截图、统计使用情况、查找特定应用等）
2. "general_chat" - 一般对话（如：问候、闲聊、询问功能等）
3. "system_help" - 系统帮助请求（如：如何使用、功能说明等）

请以JSON格式返回结果：
{
    "intent_type": "database_query/general_chat/system_help",
    "needs_database": true/false
}

只返回JSON，不要返回其他任何信息，不要使用markdown代码块标记。
"""
        user_content = prompt.replace("<USER_QUERY>", user_query)

        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "system",
                    "content": get_prompt("llm_client", "intent_classification"),
                },
                {"role": "user", "content": user_content},
            ],
            temperature=0.1,
            max_tokens=200,
        )

        if hasattr(response, "usage") and response.usage:
            log_token_usage(
                model=model,
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
                endpoint="classify_intent",
                user_query=user_query,
                response_type="intent_classification",
                feature_type="event_assistant",
            )

        result_text = response.choices[0].message.content.strip()

        logger.info("=== LLM意图分类响应 ===")
        logger.info(f"用户输入: {user_query}")
        logger.info(f"LLM回复: {result_text}")
        logger.info("=== 响应结束 ===")

        logger.info(f"LLM意图分类 - 用户输入: {user_query}")
        logger.info(f"LLM意图分类 - 原始响应: {result_text}")

        try:
            clean_text = result_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            result = json.loads(clean_text)
            logger.info(
                f"意图分类结果: {result['intent_type']}, 需要数据库: {result['needs_database']}"
            )
            return result
        except json.JSONDecodeError:
            logger.warning(f"LLM返回的不是有效JSON: {result_text}")
            return rule_based_intent_classification(user_query)

    except Exception as e:
        logger.error(f"LLM意图分类失败: {e}")
        return rule_based_intent_classification(user_query)


def rule_based_intent_classification(user_query: str) -> dict[str, Any]:
    """基于规则的意图分类（备用方案）"""
    query_lower = user_query.lower()

    # 数据库查询关键词
    database_keywords = [
        "搜索",
        "查找",
        "统计",
        "显示",
        "截图",
        "应用",
        "使用情况",
        "时间",
        "最近",
        "今天",
        "昨天",
        "本周",
        "上周",
        "本月",
        "上月",
        "search",
        "find",
        "show",
        "statistics",
        "screenshot",
        "app",
        "usage",
    ]

    # 一般对话关键词
    chat_keywords = [
        "你好",
        "谢谢",
        "再见",
        "怎么样",
        "如何",
        "为什么",
        "什么是",
        "hello",
        "hi",
        "thanks",
        "bye",
        "how",
        "what",
        "why",
    ]

    # 系统帮助关键词
    help_keywords = [
        "帮助",
        "功能",
        "使用方法",
        "教程",
        "说明",
        "介绍",
        "help",
        "function",
        "tutorial",
        "guide",
        "instruction",
    ]

    database_score = sum(1 for keyword in database_keywords if keyword in query_lower)
    chat_score = sum(1 for keyword in chat_keywords if keyword in query_lower)
    help_score = sum(1 for keyword in help_keywords if keyword in query_lower)

    if database_score > 0:
        intent_type = "database_query"
        needs_database = True
    elif help_score > 0:
        intent_type = "system_help"
        needs_database = False
    elif chat_score > 0:
        intent_type = "general_chat"
        needs_database = False
    else:
        intent_type = "database_query"
        needs_database = True

    return {"intent_type": intent_type, "needs_database": needs_database}
