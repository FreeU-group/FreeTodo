"""批量删除相关逻辑处理模块"""

import json
import re

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 常量定义
MAX_TODO_NAMES_DISPLAY = 10  # 最多显示的待办名称数量


def _deduplicate_ids(id_list: list[int]) -> list[int]:
    """去重ID列表，保持顺序"""
    seen = set()
    unique_ids = []
    for id_val in id_list:
        if id_val not in seen:
            seen.add(id_val)
            unique_ids.append(id_val)
    return unique_ids


def _extract_ids_by_pattern(todo_context: str) -> list[int]:
    """方法1：提取每个"选中待办"或"Selected Todo"标记后的第一个ID"""
    pattern = r"(?:选中待办|Selected Todo|【当前选中待办】|\[Selected Todo\])[\s\S]*?ID:\s*(\d+)"
    matches = re.findall(pattern, todo_context, re.IGNORECASE)
    if matches:
        return _deduplicate_ids([int(id_str) for id_str in matches])
    return []


def _extract_ids_by_sections(todo_context: str) -> list[int]:
    """方法2：使用分隔符"---"分割，提取每个部分第一个ID"""
    selected_todo_ids = []
    sections = todo_context.split("---")
    for section in sections:
        id_match = re.search(r"ID:\s*(\d+)", section)
        if id_match:
            todo_id = int(id_match.group(1))
            if todo_id not in selected_todo_ids:
                selected_todo_ids.append(todo_id)
    return selected_todo_ids


def _extract_ids_fallback(todo_context: str) -> list[int]:
    """fallback方法：提取所有ID"""
    id_matches = re.findall(r"ID:\s*(\d+)", todo_context)
    return _deduplicate_ids([int(id_str) for id_str in id_matches])


def extract_selected_todo_ids(todo_context: str) -> list[int]:
    """
    从待办上下文中提取选中待办的ID列表

    Args:
        todo_context: 待办上下文字符串

    Returns:
        选中待办的ID列表
    """
    # 方法1：提取每个"选中待办"或"Selected Todo"标记后的第一个ID
    selected_todo_ids = _extract_ids_by_pattern(todo_context)

    # 方法2：如果方法1没找到，使用分隔符"---"分割
    if not selected_todo_ids and "---" in todo_context:
        selected_todo_ids = _extract_ids_by_sections(todo_context)

    # 如果还是没有找到，fallback到旧方法
    if not selected_todo_ids:
        selected_todo_ids = _extract_ids_fallback(todo_context)

    return selected_todo_ids


def extract_todo_name_from_context(todo_id: int, todo_context: str) -> str:
    """
    从待办上下文中提取指定ID的待办名称

    Args:
        todo_id: 待办ID
        todo_context: 待办上下文字符串

    Returns:
        待办名称，如果找不到则返回默认名称
    """
    todo_name = f"待办 {todo_id}"
    name_pattern = rf"【当前选中待办】[\s\S]*?ID:\s*{todo_id}[\s\S]*?名称:\s*([^\n]+)"
    name_match = re.search(name_pattern, todo_context)
    if name_match:
        todo_name = name_match.group(1).strip()
    return todo_name


def _extract_todos_from_context(
    todo_context: str, batch_delete_todo_ids: list[int]
) -> tuple[list[dict], set[int]]:
    """从待办上下文中提取待办信息"""
    todos_info = []
    seen_ids = set()
    selected_pattern = (
        r"(?:【当前选中待办】|\[Selected Todo\])[\s\S]*?ID:\s*(\d+)[\s\S]*?名称:\s*([^\n]+)"
    )
    selected_matches = re.findall(selected_pattern, todo_context, re.IGNORECASE)

    for todo_id_str, todo_name in selected_matches:
        todo_id = int(todo_id_str)
        if todo_id not in seen_ids and todo_id in batch_delete_todo_ids:
            seen_ids.add(todo_id)
            todos_info.append({"id": todo_id, "name": todo_name.strip()})

    return todos_info, seen_ids


def _extract_todos_from_results(
    batch_delete_results: list[dict],
    accumulated_context: list[str] | None,
    seen_ids: set[int],
) -> list[dict]:
    """从工具结果中提取待办信息"""
    todos_info = []
    for result in batch_delete_results:
        todo_id = result.get("todo_id")
        if todo_id in seen_ids:
            continue

        todo_name = f"待办 {todo_id}"
        # 尝试从accumulated_context中查找
        if accumulated_context:
            for ctx in accumulated_context:
                if f"ID: {todo_id}" in ctx:
                    name_match = re.search(rf"ID:\s*{todo_id}[\s\S]*?名称:\s*([^\n|]+)", ctx)
                    if name_match:
                        todo_name = name_match.group(1).strip()
                        break
        seen_ids.add(todo_id)
        todos_info.append({"id": todo_id, "name": todo_name})

    return todos_info


def build_batch_delete_confirmation(
    batch_delete_todo_ids: list[int],
    todo_context: str | None = None,
    batch_delete_results: list[dict] | None = None,
    accumulated_context: list[str] | None = None,
) -> str:
    """
    构建批量删除确认面板内容

    Args:
        batch_delete_todo_ids: 待删除的待办ID列表
        todo_context: 待办上下文（可选）
        batch_delete_results: 已收集的删除确认结果（可选）
        accumulated_context: 累积的上下文信息（可选）

    Returns:
        批量删除确认面板的字符串内容
    """
    todos_info = []
    seen_ids = set()

    # 优先从待办上下文中提取选中待办的信息
    if todo_context:
        context_todos, context_seen = _extract_todos_from_context(
            todo_context, batch_delete_todo_ids
        )
        todos_info.extend(context_todos)
        seen_ids.update(context_seen)

    # 对于没有从上下文中找到的待办，从工具结果中提取
    if batch_delete_results:
        result_todos = _extract_todos_from_results(
            batch_delete_results, accumulated_context, seen_ids
        )
        todos_info.extend(result_todos)

    # 确保所有待删除的ID都在列表中
    for todo_id in batch_delete_todo_ids:
        if todo_id not in seen_ids:
            todos_info.append({"id": todo_id, "name": f"待办 {todo_id}"})

    # 生成批量确认JSON
    batch_confirmation_json = json.dumps(
        {
            "type": "batch_todo_confirmation",
            "operation": "batch_delete_todos",
            "todos": todos_info,
            "preview": f"准备批量删除 {len(todos_info)} 个待办事项",
        },
        ensure_ascii=False,
    )

    preview_text = f"准备批量删除以下 {len(todos_info)} 个待办事项：\n" + "\n".join(
        [f"- ID: {t['id']} | 名称: {t['name']}" for t in todos_info]
    )

    return f"{preview_text}\n\n<!-- TODO_CONFIRMATION: {batch_confirmation_json} -->"


def detect_batch_delete_scenario(
    user_query: str, todo_context: str | None
) -> tuple[bool, list[int]]:
    """
    检测是否是批量删除场景

    Args:
        user_query: 用户查询
        todo_context: 待办上下文

    Returns:
        (是否是批量删除场景, 待删除的待办ID列表)
    """
    if not (
        any(word in user_query for word in ["这些", "它们", "这些待办"]) and "删除" in user_query
    ):
        return False, []

    if not todo_context:
        return False, []

    selected_todo_ids = extract_selected_todo_ids(todo_context)

    if len(selected_todo_ids) > 1:
        logger.info(
            f"[Agent] 检测到批量删除场景，待删除{len(selected_todo_ids)}个待办: {selected_todo_ids}"
        )
        return True, selected_todo_ids

    return False, []
