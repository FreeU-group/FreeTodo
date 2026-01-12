"""工具结果格式化相关逻辑处理模块"""

import json

from lifetrace.llm.tools.base import ToolResult
from lifetrace.util.logging_config import get_logger

logger = get_logger()


def format_tool_result(tool_name: str, result: ToolResult) -> str:
    """格式化工具结果"""
    if not result.success:
        return f"工具 {tool_name} 执行失败: {result.error}"

    # 检查是否需要用户确认
    if result.metadata and result.metadata.get("requires_confirmation"):
        return format_confirmation_result(tool_name, result)

    formatted = f"工具 {tool_name} 执行结果：\n{result.content}"

    # 如果是 extract_todo 工具，将结构化 todos 数据一并输出
    if tool_name == "extract_todo" and result.metadata:
        todos = result.metadata.get("todos")
        if todos:
            try:
                todos_json = json.dumps(todos, ensure_ascii=False, indent=2)
                formatted += (
                    "\n\n提取到的待办数据结构（JSON，供后续批量创建使用）：\n"
                    "```json\n"
                    f"{todos_json}\n"
                    "```"
                )
            except Exception:
                logger.exception("[Agent] 序列化 extract_todo 结果失败，忽略结构化部分")

    # 如果有来源信息，添加到末尾
    if result.metadata and "sources" in result.metadata:
        sources = result.metadata["sources"]
        formatted += "\n\nSources:"
        for idx, source in enumerate(sources, start=1):
            formatted += f"\n{idx}. {source['title']} ({source['url']})"

    return formatted


def format_confirmation_result(tool_name: str, result: ToolResult) -> str:
    """格式化需要确认的工具结果"""
    confirmation_data = result.metadata.get("confirmation_data", {})
    operation = confirmation_data.get("operation", "")

    if operation == "batch_create_todos":
        todos = confirmation_data.get("todos", [])
        confirmation_json = json.dumps(
            {
                "type": "batch_todo_confirmation",
                "operation": "batch_create_todos",
                "todos": todos,
                "preview": result.content,
            },
            ensure_ascii=False,
        )
        return f"{result.content}\n\n<!-- TODO_CONFIRMATION: {confirmation_json} -->"

    if operation == "organize_todos":
        todos = confirmation_data.get("todos", [])
        parent_title = confirmation_data.get("parent_title", "")
        todo_ids = confirmation_data.get("todo_ids", [])
        confirmation_json = json.dumps(
            {
                "type": "organize_todos_confirmation",
                "operation": "organize_todos",
                "todos": todos,
                "parent_title": parent_title,
                "todo_ids": todo_ids,
                "preview": result.content,
            },
            ensure_ascii=False,
        )
        return f"{result.content}\n\n<!-- TODO_CONFIRMATION: {confirmation_json} -->"

    # 单个todo确认（create/update/delete）
    confirmation_json = json.dumps(
        {
            "type": "todo_confirmation",
            "operation": operation,
            "data": confirmation_data,
            "preview": result.content,
        },
        ensure_ascii=False,
    )
    return f"{result.content}\n\n<!-- TODO_CONFIRMATION: {confirmation_json} -->"
