"""聊天相关的辅助/管理路由。"""

import importlib

from fastapi import Depends, HTTPException, Query

from core.dependencies import get_chat_service, get_rag_service
from schemas.chat import AddMessageRequest, NewChatRequest, NewChatResponse
from services.chat_service import ChatService
from util.time_utils import get_utc_now

from .base import logger, router


@router.post("/new", response_model=NewChatResponse)
async def create_new_chat(
    request: NewChatRequest | None = None,
    chat_service: ChatService = Depends(get_chat_service),
):
    """创建新对话会话"""
    try:
        # 如果提供了session_id，清除其上下文；否则创建新会话
        if request and request.session_id:
            if chat_service.clear_session_context(request.session_id):
                session_id = request.session_id
                message = "会话上下文已清除"
            else:
                # 会话不存在，创建新的
                session_id = chat_service.create_new_session()
                message = "创建新对话会话"
        else:
            session_id = chat_service.create_new_session()
            message = "创建新对话会话"

        logger.info(f"新对话会话: {session_id}")
        return NewChatResponse(session_id=session_id, message=message, timestamp=get_utc_now())
    except Exception as e:
        logger.error(f"创建新对话失败: {e}")
        raise HTTPException(status_code=500, detail="创建新对话失败") from e


@router.post("/session/{session_id}/message")
async def add_message_to_session(
    session_id: str,
    request: AddMessageRequest,
    chat_service: ChatService = Depends(get_chat_service),
):
    """添加消息到会话（消息已在流式聊天中自动保存，此接口保持兼容性）"""
    _ = session_id
    _ = request
    _ = chat_service
    try:
        # 消息在流式聊天接口中已经自动保存，这里只是为了API兼容性
        # 如果需要手动保存，可以取消注释以下代码
        # chat_service.add_message(
        #     session_id=session_id,
        #     role=request.role,
        #     content=request.content,
        # )
        return {
            "success": True,
            "message": "消息已保存",
            "timestamp": get_utc_now(),
        }
    except Exception as e:
        logger.error(f"保存消息失败: {e}")
        raise HTTPException(status_code=500, detail="保存消息失败") from e


@router.delete("/session/{session_id}")
async def clear_chat_session(
    session_id: str,
    chat_service: ChatService = Depends(get_chat_service),
):
    """清除指定会话的上下文"""
    try:
        success = chat_service.clear_session_context(session_id)
        if success:
            return {
                "success": True,
                "message": f"会话 {session_id} 的上下文已清除",
                "timestamp": get_utc_now(),
            }
        else:
            raise HTTPException(status_code=404, detail="会话不存在")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"清除会话上下文失败: {e}")
        raise HTTPException(status_code=500, detail="清除会话上下文失败") from e


@router.get("/history")
async def get_chat_history(
    session_id: str | None = Query(None),
    chat_type: str | None = Query(None, description="聊天类型过滤：event, project, general"),
    chat_service: ChatService = Depends(get_chat_service),
):
    """获取聊天历史记录（从数据库读取）"""
    try:
        return chat_service.get_chat_history(session_id=session_id, chat_type=chat_type)
    except Exception as e:
        logger.error(f"获取聊天历史失败: {e}")
        raise HTTPException(status_code=500, detail="获取聊天历史失败") from e


@router.get("/suggestions")
async def get_query_suggestions(
    partial_query: str = Query("", description="部分查询文本"),
):
    """获取查询建议"""
    try:
        suggestions = get_rag_service().get_query_suggestions(partial_query)
        return {"suggestions": suggestions, "partial_query": partial_query}
    except Exception as e:
        logger.error(f"获取查询建议失败: {e}")
        raise HTTPException(status_code=500, detail="获取查询建议失败") from e


@router.get("/query-types")
async def get_supported_query_types():
    """获取支持的查询类型"""
    try:
        return get_rag_service().get_supported_query_types()
    except Exception as e:
        logger.error(f"获取查询类型失败: {e}")
        raise HTTPException(status_code=500, detail="获取查询类型失败") from e


@router.get("/agno/tools")
async def get_available_agno_tools():
    """获取可用的 Agno Agent 工具列表

    返回两种类型的工具：
    1. Lifetrace 工具：待办管理相关（create_todo, list_todos 等）
    2. 外部工具：联网搜索等（duckduckgo 等）
    """
    try:
        # Lifetrace 工具列表（与 toolkit.py 中的 all_tools 保持同步）
        agno_module = importlib.import_module("llm.agno_agent")
        lifetrace_tools = [
            {
                "name": "create_todo",
                "category": "todo",
                "description": "创建新的待办事项",
                "description_en": "Create a new todo item",
            },
            {
                "name": "complete_todo",
                "category": "todo",
                "description": "完成待办事项",
                "description_en": "Mark a todo as completed",
            },
            {
                "name": "update_todo",
                "category": "todo",
                "description": "更新待办事项",
                "description_en": "Update a todo item",
            },
            {
                "name": "list_todos",
                "category": "todo",
                "description": "列出待办事项",
                "description_en": "List todo items",
            },
            {
                "name": "search_todos",
                "category": "todo",
                "description": "搜索待办事项",
                "description_en": "Search todo items",
            },
            {
                "name": "delete_todo",
                "category": "todo",
                "description": "删除待办事项",
                "description_en": "Delete a todo item",
            },
            {
                "name": "breakdown_task",
                "category": "breakdown",
                "description": "分解复杂任务为子任务",
                "description_en": "Break down complex tasks into subtasks",
            },
            {
                "name": "parse_time",
                "category": "time",
                "description": "解析自然语言时间表达",
                "description_en": "Parse natural language time expressions",
            },
            {
                "name": "check_schedule_conflict",
                "category": "conflict",
                "description": "检查时间冲突",
                "description_en": "Check schedule conflicts",
            },
            {
                "name": "get_todo_stats",
                "category": "stats",
                "description": "获取待办统计信息",
                "description_en": "Get todo statistics",
            },
            {
                "name": "get_overdue_todos",
                "category": "stats",
                "description": "获取逾期待办",
                "description_en": "Get overdue todos",
            },
            {
                "name": "list_tags",
                "category": "tags",
                "description": "列出所有标签",
                "description_en": "List all tags",
            },
            {
                "name": "get_todos_by_tag",
                "category": "tags",
                "description": "按标签获取待办",
                "description_en": "Get todos by tag",
            },
            {
                "name": "suggest_tags",
                "category": "tags",
                "description": "建议标签",
                "description_en": "Suggest tags for a todo",
            },
        ]

        # 外部工具列表
        available_external = agno_module.get_available_external_tools()
        external_tools = []

        if "duckduckgo" in available_external:
            external_tools.append(
                {
                    "name": "duckduckgo",
                    "category": "search",
                    "description": "DuckDuckGo 联网搜索",
                    "description_en": "DuckDuckGo web search",
                }
            )

        return {
            "lifetrace_tools": lifetrace_tools,
            "external_tools": external_tools,
        }
    except Exception as e:
        logger.error(f"获取 Agno 工具列表失败: {e}")
        raise HTTPException(status_code=500, detail="获取 Agno 工具列表失败") from e
