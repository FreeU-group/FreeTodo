"""聊天相关的辅助/管理路由。"""

from datetime import datetime

from fastapi import Depends, HTTPException, Query

from lifetrace.core.dependencies import get_chat_service, get_rag_service
from lifetrace.schemas.chat import AddMessageRequest, NewChatRequest, NewChatResponse
from lifetrace.services.chat_service import ChatService

from .base import logger, router


@router.post("/new", response_model=NewChatResponse)
async def create_new_chat(
    request: NewChatRequest = None,
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
        return NewChatResponse(session_id=session_id, message=message, timestamp=datetime.now())
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
            "timestamp": datetime.now(),
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
                "timestamp": datetime.now(),
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
