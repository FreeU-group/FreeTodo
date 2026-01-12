"""任务评估相关逻辑处理模块"""

import re

from lifetrace.llm.tools.base import ToolResult
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


def extract_todo_ids_from_context(messages: list[dict]) -> list[int]:
    """
    从消息列表中提取待办上下文中的ID列表

    Args:
        messages: 消息列表

    Returns:
        待办ID列表
    """
    for msg in messages:
        content = msg.get("content", "")
        if "用户当前的待办事项上下文" in content:
            id_matches = re.findall(r"ID:\s*(\d+)", content)
            return [int(id_str) for id_str in id_matches]
    return []


def count_delete_todo_calls(messages: list[dict]) -> int:
    """
    统计消息历史中 delete_todo 工具调用的次数

    Args:
        messages: 消息列表

    Returns:
        delete_todo 调用次数
    """
    return sum(
        1 for msg in messages if msg.get("content", "").startswith("[工具调用: delete_todo]")
    )


def extract_delete_todo_ids_from_messages(messages: list[dict]) -> list[int]:
    """
    从消息历史中提取已调用 delete_todo 的待办ID列表

    Args:
        messages: 消息列表

    Returns:
        已删除的待办ID列表
    """
    delete_todo_calls = []
    for i, msg in enumerate(messages):
        content = msg.get("content", "")
        if content.startswith("[工具调用: delete_todo]"):
            # 尝试从下一个消息（工具结果）中提取todo_id
            if i + 1 < len(messages):
                next_content = messages[i + 1].get("content", "")
                id_match = re.search(r"todo_id[:\s]+(\d+)", next_content)
                if id_match:
                    delete_todo_calls.append(int(id_match.group(1)))
    return delete_todo_calls


def check_batch_delete_in_progress(user_query: str, messages: list[dict]) -> bool:
    """
    检查批量删除是否还在进行中

    Args:
        user_query: 用户查询
        messages: 消息列表

    Returns:
        如果批量删除还在进行中则返回 True
    """
    if "删除" not in user_query:
        return False

    if not any(word in user_query for word in ["这些", "它们", "这些待办"]):
        return False

    todo_ids_in_context = extract_todo_ids_from_context(messages)

    if len(todo_ids_in_context) <= 1:
        return False

    # 检查是否所有待办都已调用delete_todo
    delete_todo_count = count_delete_todo_calls(messages)

    if delete_todo_count < len(todo_ids_in_context):
        logger.info(
            f"[Agent] 批量删除检测：上下文中{len(todo_ids_in_context)}个待办，"
            f"已调用{delete_todo_count}次delete_todo，继续循环"
        )
        return True

    return False


def evaluate_task_completion_with_llm(
    llm_client,
    user_query: str,
    messages: list[dict],
    tool_result: ToolResult,
    evaluation_prompt: str,
) -> bool:
    """
    使用 LLM 评估任务是否完成

    Args:
        llm_client: LLM客户端实例
        user_query: 用户查询
        messages: 消息列表
        tool_result: 工具执行结果
        evaluation_prompt: 评估提示词

    Returns:
        True 表示需要继续使用工具，False 表示可以生成最终回答
    """
    # 在评估消息中包含更多上下文，特别是待办上下文信息
    context_info = ""
    for msg in messages:
        content = msg.get("content", "")
        if "用户当前的待办事项上下文" in content:
            context_info = f"\n\n待办上下文摘要: {content[:200]}"
            break

    eval_messages = [
        {"role": "system", "content": evaluation_prompt},
        {
            "role": "user",
            "content": (
                f"用户查询: {user_query}\n\n工具结果: {tool_result.content[:500]}{context_info}"
            ),
        },
    ]

    response = llm_client.client.chat.completions.create(
        model=llm_client.model,
        messages=eval_messages,
        temperature=0.1,
        max_tokens=100,
    )

    eval_text = response.choices[0].message.content.strip().lower()

    # 简单判断：如果包含"完成"、"足够"等关键词，认为可以生成回答
    completion_keywords = ["完成", "足够", "可以", "complete", "sufficient"]
    return not any(keyword in eval_text for keyword in completion_keywords)


def evaluate_task_completion(
    llm_client,
    user_query: str,
    messages: list[dict],
    tool_result: ToolResult,
) -> bool:
    """
    评估任务是否完成

    Args:
        llm_client: LLM客户端实例
        user_query: 用户查询
        messages: 消息列表
        tool_result: 工具执行结果

    Returns:
        True: 需要继续使用工具
        False: 可以生成最终回答
    """
    # 如果工具执行失败，继续尝试
    if not tool_result.success:
        return True

    # 特殊处理：检测批量删除场景
    if check_batch_delete_in_progress(user_query, messages):
        return True

    # 使用 LLM 评估
    evaluation_prompt = get_prompt(
        "agent",
        "task_evaluation",
        user_query=user_query,
        tool_result=tool_result.content[:500],  # 限制长度
    )

    if not evaluation_prompt:
        evaluation_prompt = """评估工具执行结果是否足够回答用户的问题。

如果工具结果已经包含足够信息来回答用户问题，返回"完成"。
如果需要更多信息，返回"继续"。

只返回"完成"或"继续"。"""

    try:
        return evaluate_task_completion_with_llm(
            llm_client, user_query, messages, tool_result, evaluation_prompt
        )
    except Exception as e:
        logger.error(f"[Agent] 任务评估失败: {e}")
        # 默认继续
        return True
