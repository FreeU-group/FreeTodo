"""
RAG 回退响应模块
包含备用响应生成逻辑
"""

from datetime import datetime
from typing import Any

from lifetrace.util.logging_config import get_logger

logger = get_logger()


def summarize_retrieved_data(retrieved_data: list[dict[str, Any]]) -> dict[str, Any]:
    """总结检索到的数据"""
    if not retrieved_data:
        return {"apps": {}, "time_range": None, "total": 0}

    app_counts = {}
    timestamps = []

    for record in retrieved_data:
        app_name = record.get("app_name", "未知应用")
        app_counts[app_name] = app_counts.get(app_name, 0) + 1

        timestamp = record.get("timestamp")
        if timestamp:
            timestamps.append(timestamp)

    time_range = None
    if timestamps:
        timestamps.sort()
        time_range = {"earliest": timestamps[0], "latest": timestamps[-1]}

    return {
        "apps": app_counts,
        "time_range": time_range,
        "total": len(retrieved_data),
    }


def fallback_response(
    user_query: str,
    retrieved_data: list[dict[str, Any]],
    stats: dict[str, Any] = None,
) -> str:
    """备用响应生成（当LLM不可用时）"""
    if not retrieved_data:
        return f"抱歉，没有找到与查询 '{user_query}' 相关的历史记录。"

    response_parts = [f"根据您的查询 '{user_query}'，我找到了以下信息：", ""]

    response_parts.append(f"📊 总共找到 {len(retrieved_data)} 条相关记录")

    app_summary = summarize_retrieved_data(retrieved_data)
    if app_summary["apps"]:
        response_parts.append("\n📱 应用分布：")
        for app, count in sorted(app_summary["apps"].items(), key=lambda x: x[1], reverse=True):
            response_parts.append(f"  • {app}: {count} 条记录")

    if app_summary["time_range"]:
        try:
            earliest = datetime.fromisoformat(
                app_summary["time_range"]["earliest"].replace("Z", "+00:00")
            )
            latest = datetime.fromisoformat(
                app_summary["time_range"]["latest"].replace("Z", "+00:00")
            )
            response_parts.append(
                f"\n⏰ 时间范围: {earliest.strftime('%Y-%m-%d %H:%M')} 至 {latest.strftime('%Y-%m-%d %H:%M')}"
            )
        except:  # noqa: E722
            pass

    if retrieved_data:
        response_parts.append("\n📝 最新记录示例：")
        latest_record = retrieved_data[0]
        timestamp = latest_record.get("timestamp", "未知时间")
        app_name = latest_record.get("app_name", "未知应用")
        ocr_text = latest_record.get("ocr_text", "无内容")[:100]

        response_parts.append(f"  时间: {timestamp}")
        response_parts.append(f"  应用: {app_name}")
        response_parts.append(f"  内容: {ocr_text}...")

    response_parts.append("\n💡 提示：您可以使用更具体的关键词来获得更精确的结果。")

    return "\n".join(response_parts)


def generate_direct_response(llm_client, user_query: str, intent_result: dict[str, Any]) -> str:
    """为不需要数据库查询的用户输入生成直接回复"""
    try:
        intent_type = intent_result.get("intent_type", "general_chat")

        if intent_type == "system_help":
            system_prompt = """
你是LifeTrace的智能助手。LifeTrace是一个生活轨迹记录和分析系统，主要功能包括：
1. 自动截图记录用户的屏幕活动
2. OCR文字识别和内容分析
3. 应用使用情况统计
4. 智能搜索和查询功能

请根据用户的问题提供有用的帮助信息。
"""
        else:
            system_prompt = """
你是LifeTrace的智能助手，请以友好、自然的方式与用户对话。
如果用户需要查询数据或统计信息，请引导他们使用具体的查询语句。
"""

        response = llm_client.client.chat.completions.create(
            model=llm_client.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_query},
            ],
            temperature=0.7,
            max_tokens=500,
        )

        llm_response = response.choices[0].message.content.strip()
        logger.info(f"[LLM Direct Response] {llm_response}")
        logger.info(f"LLM直接响应: {llm_response}")

        return llm_response

    except Exception as e:
        logger.error(f"直接响应生成失败: {e}")
        return fallback_direct_response(user_query, intent_result)


def fallback_direct_response(user_query: str, intent_result: dict[str, Any]) -> str:
    """当LLM不可用时的直接回复备用方案"""
    intent_type = intent_result.get("intent_type", "general_chat")

    if intent_type == "system_help":
        return """
LifeTrace是一个生活轨迹记录和分析系统，主要功能包括：

📸 **自动截图记录**
- 定期捕获屏幕内容
- 记录应用使用情况

🔍 **智能搜索**
- 搜索历史截图
- 基于OCR文字内容查找

📊 **使用统计**
- 应用使用时长统计
- 活动模式分析

💬 **智能问答**
- 自然语言查询
- 个性化数据分析

如需查询具体数据，请使用如"搜索包含编程的截图"或"统计最近一周的应用使用情况"等语句。
"""
    elif intent_type == "general_chat":
        greetings = [
            "你好！我是LifeTrace的智能助手，很高兴为您服务！",
            "您好！有什么可以帮助您的吗？",
            "欢迎使用LifeTrace！我可以帮您查询和分析您的生活轨迹数据。",
        ]

        if any(word in user_query.lower() for word in ["你好", "hello", "hi"]):
            return greetings[0] + "\n\n您可以询问我关于LifeTrace的功能，或者直接查询您的数据。"
        elif any(word in user_query.lower() for word in ["谢谢", "thanks"]):
            return "不客气！如果还有其他问题，随时可以问我。"
        else:
            return greetings[1] + "\n\n您可以尝试搜索截图、查询应用使用情况，或者询问系统功能。"
    else:
        return "我理解您的问题，但可能需要更多信息才能提供准确的回答。您可以尝试更具体的查询，比如搜索特定内容或统计使用情况。"
