"""工具决策相关逻辑处理模块"""

import json
import re

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 常量定义
MAX_TODO_NAMES_DISPLAY = 10  # 最多显示的待办名称数量


def extract_extract_todo_summary(content: str) -> str | None:
    """
    从工具结果内容中提取 extract_todo 的摘要信息

    Args:
        content: 工具结果内容

    Returns:
        extract_todo 摘要字符串，如果提取失败则返回 None
    """
    if "extract_todo" not in content and "提取的待办数据结构" not in content:
        return None

    try:
        json_match = re.search(r"```json\n(.*?)\n```", content, re.DOTALL)
        if json_match:
            todos_json_str = json_match.group(1)
            todos_data = json.loads(todos_json_str)
            if todos_data:
                todos_list = todos_data.get("todos", [])
                if todos_list:
                    todo_names = [t.get("name", "") for t in todos_list[:MAX_TODO_NAMES_DISPLAY]]
                    extract_todo_summary = (
                        f"之前已通过extract_todo工具提取了{len(todos_list)}个待办事项，"
                        f"包括：{', '.join(todo_names)}{'...' if len(todos_list) > MAX_TODO_NAMES_DISPLAY else ''}。"
                        f"完整的待办数据结构：\n```json\n{json.dumps(todos_list, ensure_ascii=False, indent=2)}\n```"
                    )
                    logger.info(f"[Agent] 提取到extract_todo结果，包含{len(todos_list)}个待办")
                    return extract_todo_summary
    except Exception:
        if "提取的待办数据结构" in content:
            logger.warning("[Agent] extract_todo结果解析失败，使用原始内容片段")
            return content[:500]  # 保留前500字符

    return None


def build_tool_decision_messages(
    messages: list[dict],
    tool_selection_prompt: str,
    batch_delete_mode: bool = False,
    processed_ids: list[int] | None = None,
    remaining_ids: list[int] | None = None,
) -> list[dict]:
    """
    构建工具选择决策消息，包含完整的上下文但排除工具相关消息

    Args:
        messages: 消息列表
        tool_selection_prompt: 工具选择提示词
        batch_delete_mode: 是否是批量删除模式
        processed_ids: 已处理的ID列表
        remaining_ids: 剩余待处理的ID列表

    Returns:
        决策消息列表
    """
    decision_messages = [{"role": "system", "content": tool_selection_prompt}]

    # 添加所有非工具相关的消息（保留待办上下文和对话历史）
    extract_todo_summary = None

    for msg in messages:
        # 跳过系统提示词（使用新的工具选择提示词）
        if msg.get("role") == "system":
            continue
        content = msg.get("content", "")

        # 特殊处理：检查是否是extract_todo的结果
        if content.startswith("[工具结果]"):
            summary = extract_extract_todo_summary(content)
            if summary:
                extract_todo_summary = summary
            # 对于其他工具结果，跳过
            continue

        # 跳过工具调用消息
        if content.startswith("[工具调用:"):
            continue

        # 保留待办上下文、对话历史和用户查询
        decision_messages.append(msg)

    # 如果有extract_todo的摘要，添加到消息列表末尾
    if extract_todo_summary:
        decision_messages.append(
            {
                "role": "user",
                "content": f"[上下文信息] {extract_todo_summary}",
            }
        )
        logger.info("[Agent] 已将extract_todo结果添加到工具决策上下文")

    # 批量删除模式：添加明确的提示，避免重复选择已处理的ID
    if batch_delete_mode and remaining_ids:
        batch_delete_hint = (
            f"\n\n⚠️ **批量删除模式进行中** ⚠️\n"
            f"- 已处理的待办ID: {', '.join(map(str, processed_ids or []))}\n"
            f"- **必须删除的剩余待办ID**: {', '.join(map(str, remaining_ids))}\n"
            f"- **重要**：请仅从剩余ID列表中选择，不要选择已处理的ID。\n"
            f"- 如果使用 delete_todo 工具，todo_id 参数必须从剩余ID列表中选择。\n"
        )
        decision_messages.append(
            {
                "role": "user",
                "content": batch_delete_hint,
            }
        )

    return decision_messages


def call_llm_for_tool_selection(llm_client, decision_messages: list[dict]) -> dict[str, any] | None:
    """
    调用 LLM 进行工具选择并解析响应

    Args:
        llm_client: LLM客户端实例
        decision_messages: 决策消息列表

    Returns:
        工具选择决策字典，如果解析失败则返回 None
    """
    response = llm_client.client.chat.completions.create(
        model=llm_client.model,
        messages=decision_messages,
        temperature=0.1,  # 低温度确保稳定决策
        max_tokens=200,
    )

    decision_text = response.choices[0].message.content.strip()

    # 解析 JSON 响应
    try:
        # 清理可能的 markdown 代码块
        clean_text = decision_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()

        return json.loads(clean_text)
    except json.JSONDecodeError:
        logger.warning(f"[Agent] 工具选择响应解析失败: {decision_text}")
        return None
