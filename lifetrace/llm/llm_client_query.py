"""
LLM 查询解析和摘要生成模块
"""

import json
from datetime import datetime
from typing import Any

from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.token_usage_logger import log_token_usage

logger = get_logger()


def parse_query_with_llm(client, model: str, user_query: str) -> dict[str, Any]:
    """使用LLM解析用户查询

    Args:
        client: OpenAI客户端
        model: 模型名称
        user_query: 用户查询

    Returns:
        解析后的查询条件字典
    """
    current_time = datetime.now()
    current_date_str = current_time.strftime("%Y-%m-%d %H:%M:%S")

    system_prompt = get_prompt("llm_client", "query_parsing")

    try:
        user_message = f"当前时间是：{current_date_str}\n请解析这个查询：{user_query}"
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
            model=model,
            temperature=0.1,
        )

        if hasattr(response, "usage") and response.usage:
            log_token_usage(
                model=model,
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
                endpoint="parse_query",
                user_query=user_query,
                response_type="query_parsing",
                feature_type="event_assistant",
            )

        result_text = response.choices[0].message.content.strip()

        logger.info("=== LLM查询解析响应 ===")
        logger.info(f"用户查询: {user_query}")
        logger.info(f"LLM回复: {result_text}")
        logger.info("=== 响应结束 ===")

        logger.info(f"LLM查询解析 - 用户查询: {user_query}")
        logger.info(f"LLM查询解析 - 原始响应: {result_text}")

        try:
            clean_text = result_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()
            result = json.loads(clean_text)
            return result
        except json.JSONDecodeError:
            logger.warning(f"LLM返回的不是有效JSON: {result_text}")
            return rule_based_parse(user_query)

    except Exception as e:
        logger.error(f"LLM解析失败: {e}")
        return rule_based_parse(user_query)


def rule_based_parse(user_query: str) -> dict[str, Any]:
    """基于规则的查询解析（备用方案）"""
    query_lower = user_query.lower()  # noqa: F841

    keywords = []
    time_keywords = ["今天", "昨天", "本周", "上周", "本月", "上月", "最近"]
    app_keywords = ["微信", "qq", "浏览器", "chrome", "edge", "word", "excel"]

    search_indicators = ["搜索", "查找", "包含", "关于", "找到"]
    has_search_intent = any(indicator in user_query for indicator in search_indicators)

    if has_search_intent:
        function_words = ["聊天", "浏览", "编辑", "查看", "打开", "使用", "运行"]
        words = user_query.split()
        for word in words:
            if (
                len(word) > 1
                and word not in function_words
                and word not in time_keywords
                and word not in app_keywords
            ):
                if word not in [
                    "搜索",
                    "查找",
                    "包含",
                    "关于",
                    "找到",
                    "今天",
                    "昨天",
                    "的",
                    "在",
                    "上",
                    "中",
                    "里",
                ]:
                    keywords.append(word)

    start_date = None
    end_date = None
    if "今天" in user_query:
        now = datetime.now()
        start_date = now.strftime("%Y-%m-%d 00:00:00")
        end_date = now.strftime("%Y-%m-%d 23:59:59")

    apps = []
    for app in app_keywords:
        if app in user_query:
            apps.append(app)

    if any(kw in user_query for kw in ["统计", "数量", "时长"]):
        query_type = "statistics"
    elif any(kw in user_query for kw in ["搜索", "查找", "包含"]):
        query_type = "search"
    else:
        query_type = "summary"

    return {
        "start_date": start_date,
        "end_date": end_date,
        "app_names": apps or None,
        "keywords": keywords or None,
        "query_type": query_type,
    }


def build_context_text(context_data: list[dict[str, Any]]) -> str:
    """构建上下文文本用于摘要生成"""
    MAX_OCR_TEXT_LENGTH = 200
    MAX_DISPLAYED_RECORDS = 10

    if not context_data:
        return "没有找到相关的历史记录数据。"

    context_parts = [f"找到 {len(context_data)} 条相关记录:"]

    for i, record in enumerate(context_data[:MAX_DISPLAYED_RECORDS]):
        timestamp = record.get("timestamp", "未知时间")
        if timestamp and timestamp != "未知时间":
            try:
                dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                timestamp = dt.strftime("%Y-%m-%d %H:%M")
            except:  # noqa: E722
                pass

        app_name = record.get("app_name", "未知应用")
        ocr_text = record.get("ocr_text", "无文本内容")
        window_title = record.get("window_title", "")
        screenshot_id = record.get("screenshot_id") or record.get("id")

        if len(ocr_text) > MAX_OCR_TEXT_LENGTH:
            ocr_text = ocr_text[:MAX_OCR_TEXT_LENGTH] + "..."

        record_text = f"{i + 1}. [{app_name}] {timestamp}"
        if window_title:
            record_text += f" - {window_title}"
        if screenshot_id:
            record_text += f" [截图ID: {screenshot_id}]"
        record_text += f"\n   内容: {ocr_text}"

        context_parts.append(record_text)

    if len(context_data) > MAX_DISPLAYED_RECORDS:
        context_parts.append(f"... 还有 {len(context_data) - MAX_DISPLAYED_RECORDS} 条记录")

    return "\n\n".join(context_parts)


def generate_summary_with_llm(
    client, model: str, query: str, context_data: list[dict[str, Any]]
) -> str:
    """使用LLM生成摘要

    Args:
        client: OpenAI客户端
        model: 模型名称
        query: 用户查询
        context_data: 上下文数据

    Returns:
        生成的摘要文本
    """
    system_prompt = get_prompt("llm_client", "summary_generation")
    context_text = build_context_text(context_data)

    user_prompt = f"""
用户查询：{query}

相关历史数据：
{context_text}

请基于以上数据回答用户的查询。
"""

    try:
        response = client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=model,
            temperature=0.3,
            extra_body={"enable_thinking": True},
        )

        if hasattr(response, "usage") and response.usage:
            log_token_usage(
                model=model,
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
                endpoint="generate_summary",
                user_query=query,
                response_type="summary_generation",
                feature_type="event_assistant",
                additional_info={"context_records": len(context_data)},
            )

        result = response.choices[0].message.content.strip()

        logger.info("=== LLM总结生成响应 ===")
        logger.info(f"用户查询: {query}")
        logger.info(f"LLM回复: {result}")
        logger.info("=== 响应结束 ===")

        logger.info(f"LLM总结生成 - 用户查询: {query}")
        logger.info(f"LLM总结生成 - 生成结果: {result}")
        logger.info(f"LLM生成总结成功，长度: {len(result)}")
        return result

    except Exception as e:
        logger.error(f"LLM总结生成失败: {e}")
        return fallback_summary(query, context_data)


def fallback_summary(query: str, context_data: list[dict[str, Any]]) -> str:
    """在LLM不可用或失败时的总结备选方案"""
    summary_parts = [
        "以下是根据历史数据的简要总结：",
        "- 共检索到相关记录若干条",
        "- 涉及多个应用和时间点",
        "- 建议进一步细化查询条件以获得更精确的结果",
    ]
    return "\n".join(summary_parts)


def build_context(context_data: list[dict[str, Any]]) -> str:
    """构建用于LLM生成的上下文文本"""
    context_parts = []
    for i, item in enumerate(context_data[:50], start=1):
        text = item.get("text", "")
        if not text:
            text = (
                item.get("ocr_result", {}).get("text", "")
                if isinstance(item.get("ocr_result"), dict)
                else ""
            )
        app_name = (
            item.get("metadata", {}).get("app_name", "")
            if isinstance(item.get("metadata"), dict)
            else ""
        )
        timestamp = (
            item.get("metadata", {}).get("created_at", "")
            if isinstance(item.get("metadata"), dict)
            else ""
        )
        context_parts.append(f"[{i}] 应用: {app_name}, 时间: {timestamp}\n{text}\n")
    return "\n".join(context_parts)
