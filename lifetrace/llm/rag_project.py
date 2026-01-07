"""
RAG 项目助手模块
包含项目相关的对话处理逻辑
"""

from dataclasses import dataclass
from typing import Any

from lifetrace.storage import chat_mgr, project_mgr, task_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.settings import settings

logger = get_logger()


@dataclass
class ProjectContext:
    """项目上下文信息"""

    project_info: dict | None
    tasks_info_str: str
    selected_tasks_info_str: str | None


@dataclass
class RAGServices:
    """RAG 服务依赖集合"""

    llm_client: Any
    query_parser: Any
    retrieval_service: Any
    context_builder: Any


def get_task_status_emoji(status: str) -> str:
    """获取任务状态对应的 emoji"""
    return {
        "pending": "⏳",
        "in_progress": "🔄",
        "completed": "✅",
        "cancelled": "❌",
    }.get(status, "📝")


def format_task_line(task: dict, truncate_desc: bool = True) -> str:
    """格式化单个任务行"""
    MAX_TASK_DESCRIPTION_LENGTH = 50
    status = task.get("status", "pending")
    status_emoji = get_task_status_emoji(status)
    task_line = f"{status_emoji} [{status}] {task.get('name', '未命名任务')}"

    if task.get("description"):
        description = task.get("description")
        if truncate_desc and len(description) > MAX_TASK_DESCRIPTION_LENGTH:
            description = description[:MAX_TASK_DESCRIPTION_LENGTH] + "..."
        task_line += f"\n   描述: {description}"
    return task_line


def get_project_tasks_info(project_id: int, task_ids: list[int] | None) -> ProjectContext:
    """获取项目和任务信息"""
    project_info = project_mgr.get_project(project_id)
    logger.info(f"[stream] 获取到项目信息: {project_info}")

    tasks_info_str = "暂无任务"
    selected_tasks_info_str = None

    # 获取所有任务
    tasks = task_mgr.list_tasks(project_id, limit=100)
    if tasks:
        tasks_info_str = "\n".join(format_task_line(task, truncate_desc=True) for task in tasks)
        logger.info(f"[stream] 获取到 {len(tasks)} 个任务")
    else:
        logger.info(f"[stream] 项目 {project_id} 暂无任务")

    # 获取选中任务的详细信息
    if task_ids:
        selected_tasks = []
        for task_id in task_ids:
            task = task_mgr.get_task(task_id)
            if task:
                selected_tasks.append(format_task_line(task, truncate_desc=False))
        if selected_tasks:
            selected_tasks_info_str = "\n\n".join(selected_tasks)
            logger.info(f"[stream] 获取到 {len(selected_tasks)} 个选中的任务")

    return ProjectContext(
        project_info=project_info,
        tasks_info_str=tasks_info_str,
        selected_tasks_info_str=selected_tasks_info_str,
    )


def append_history_messages(messages: list, session_id: str, history_limit: int) -> None:
    """添加历史对话消息"""
    try:
        history_messages = chat_mgr.get_messages(session_id, limit=history_limit * 2)
        for msg in history_messages:
            if msg["role"] in ["user", "assistant"]:
                messages.append({"role": msg["role"], "content": msg["content"]})
        if history_messages:
            logger.info(f"[stream] 添加了 {len(history_messages)} 条历史消息")
    except Exception as e:
        logger.warning(f"[stream] 获取历史消息失败: {e}")


def get_system_prompt_for_project(ctx: ProjectContext, with_data: bool = False) -> str:
    """获取项目对话的系统提示词

    Args:
        ctx: 项目上下文
        with_data: 是否包含数据
    """
    project_name = ctx.project_info.get("name", "未命名项目")
    project_goal = ctx.project_info.get("goal", "暂无目标描述")

    if with_data:
        if ctx.selected_tasks_info_str:
            return get_prompt(
                "project_assistant",
                "system_prompt_with_data_and_selected_tasks",
                project_name=project_name,
                project_goal=project_goal,
                selected_tasks_info=ctx.selected_tasks_info_str,
                tasks_info=ctx.tasks_info_str,
            )
        return get_prompt(
            "project_assistant",
            "system_prompt_with_data",
            project_name=project_name,
            project_goal=project_goal,
            tasks_info=ctx.tasks_info_str,
        )

    if ctx.selected_tasks_info_str:
        return get_prompt(
            "project_assistant",
            "system_prompt_with_selected_tasks",
            project_name=project_name,
            project_goal=project_goal,
            selected_tasks_info=ctx.selected_tasks_info_str,
            tasks_info=ctx.tasks_info_str,
        )
    return get_prompt(
        "project_assistant",
        "system_prompt",
        project_name=project_name,
        project_goal=project_goal,
        tasks_info=ctx.tasks_info_str,
    )


def build_messages_without_db(
    user_query: str,
    intent_result: dict,
    ctx: ProjectContext,
) -> list[dict]:
    """构建不需要数据库查询的消息

    Args:
        user_query: 用户查询
        intent_result: 意图识别结果
        ctx: 项目上下文
    """
    intent_type = intent_result.get("intent_type", "general_chat")

    if ctx.project_info:
        system_prompt = get_system_prompt_for_project(ctx, with_data=False)
    elif intent_type == "system_help":
        system_prompt = get_prompt("rag", "system_help")
    else:
        system_prompt = get_prompt("rag", "general_chat")

    return [{"role": "system", "content": system_prompt}]


def build_messages_with_db(
    user_query: str,
    project_id: int | None,
    ctx: ProjectContext,
    services: RAGServices,
) -> list[dict]:
    """构建需要数据库查询的消息

    Args:
        user_query: 用户查询
        project_id: 项目 ID
        ctx: 项目上下文
        services: RAG 服务依赖集合
    """
    from lifetrace.util.query_parser import QueryConditions

    parsed_query = services.query_parser.parse_query(user_query)
    if project_id:
        parsed_query.project_id = project_id

    query_type = "statistics" if "统计" in user_query else "search"
    retrieved_data = services.retrieval_service.search_by_conditions(parsed_query, 500)

    # 构建上下文
    if query_type == "statistics":
        stats = None
        if isinstance(parsed_query, QueryConditions):
            stats = services.retrieval_service.get_statistics(parsed_query)
        context_text = services.context_builder.build_statistics_context(
            user_query, retrieved_data, stats
        )
    else:
        context_text = services.context_builder.build_search_context(user_query, retrieved_data)
    logger.debug(f"构建的上下文内容: {context_text}")

    # 确定系统内容
    if ctx.project_info:
        project_context = get_system_prompt_for_project(ctx, with_data=True)
        system_content = f"{project_context}\n\n{context_text}"
    else:
        system_content = context_text

    return [{"role": "system", "content": system_content}]


async def process_query_stream(
    user_query: str,
    project_id: int | None,
    task_ids: list[int] | None,
    session_id: str | None,
    services: RAGServices,
) -> dict[str, Any]:
    """为流式接口处理查询，返回构建好的messages和temperature

    Args:
        user_query: 用户查询
        project_id: 项目 ID
        task_ids: 任务 ID 列表
        session_id: 会话 ID
        services: RAG 服务依赖集合
    """
    try:
        logger.info(
            f"[stream] 开始处理查询: {user_query}, project_id: {project_id}, "
            f"task_ids: {task_ids}, session_id: {session_id}"
        )
        intent_result = services.llm_client.classify_intent(user_query)
        needs_db = intent_result.get("needs_database", True)

        # 获取历史对话配置
        enable_history = settings.chat.enable_history
        history_limit = settings.chat.history_limit

        # 获取项目和任务信息
        ctx = ProjectContext(
            project_info=None, tasks_info_str="暂无任务", selected_tasks_info_str=None
        )
        if project_id:
            ctx = get_project_tasks_info(project_id, task_ids)

        # 构建消息
        if needs_db:
            messages = build_messages_with_db(user_query, project_id, ctx, services)
            temperature = 0.3
        else:
            messages = build_messages_without_db(user_query, intent_result, ctx)
            temperature = 0.7

        # 添加历史对话
        if enable_history and session_id and history_limit > 0:
            append_history_messages(messages, session_id, history_limit)

        # 添加当前用户消息
        messages.append({"role": "user", "content": user_query})

        return {
            "success": True,
            "messages": messages,
            "temperature": temperature,
            "intent_result": intent_result,
        }

    except Exception as e:
        logger.error(f"[stream] 处理查询失败: {e}")
        return {
            "success": False,
            "response": f"处理查询时出现错误: {str(e)}",
            "messages": [],
            "temperature": 0.7,
        }
