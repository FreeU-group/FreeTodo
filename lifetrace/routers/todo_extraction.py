"""待办提取相关路由"""

from datetime import datetime

from fastapi import APIRouter, HTTPException

from lifetrace.llm.todo_extraction_service import todo_extraction_service
from lifetrace.schemas.todo_extraction import (
    ExtractedTodo,
    TodoExtractionRequest,
    TodoExtractionResponse,
)
from lifetrace.storage import event_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/todo-extraction", tags=["todo-extraction"])


@router.post("/extract", response_model=TodoExtractionResponse)
async def extract_todos_from_event(request: TodoExtractionRequest):
    """
    从事件中提取待办事项

    针对白名单应用（微信、飞书等）的事件，使用多模态大模型分析截图，
    提取用户承诺的待办事项，特别是带时间信息的待办。

    Args:
        request: 待办提取请求，包含事件ID和可选的截图采样比例

    Returns:
        待办提取响应，包含提取的待办列表和元信息

    Raises:
        HTTPException: 当请求参数无效或提取失败时
    """
    try:
        event_id = request.event_id

        # 验证事件是否存在
        event_info = event_mgr.get_event_summary(event_id)
        if not event_info:
            raise HTTPException(status_code=404, detail=f"事件 {event_id} 不存在")

        app_name = event_info.get("app_name")
        logger.info(f"开始提取事件 {event_id} 的待办事项，应用: {app_name}")

        # 调用待办提取服务
        result = todo_extraction_service.extract_todos_from_event(
            event_id=event_id,
            screenshot_sample_ratio=request.screenshot_sample_ratio,
        )

        # 检查是否有错误
        if result.get("error_message"):
            error_msg = result["error_message"]
            # 如果是白名单检查失败，返回400；其他错误返回500
            if "不在待办提取白名单中" in error_msg:
                raise HTTPException(status_code=400, detail=error_msg)
            else:
                logger.warning(f"待办提取返回错误: {error_msg}")
                # 仍然返回结果，但包含错误信息

        # 构建响应
        todos = []
        for todo_dict in result.get("todos", []):
            try:
                # 构建时间信息
                time_info_dict = todo_dict.get("time_info", {})
                from lifetrace.schemas.todo_extraction import TodoTimeInfo

                time_info = TodoTimeInfo(**time_info_dict)

                # 构建待办项
                todo = ExtractedTodo(
                    title=todo_dict.get("title", ""),
                    description=todo_dict.get("description"),
                    time_info=time_info,
                    scheduled_time=todo_dict.get("scheduled_time"),
                    source_text=todo_dict.get("source_text", ""),
                    confidence=todo_dict.get("confidence"),
                    screenshot_ids=todo_dict.get("screenshot_ids", []),
                )
                todos.append(todo)
            except Exception as e:
                logger.warning(f"构建待办项失败，跳过: {e}")

        response = TodoExtractionResponse(
            event_id=event_id,
            app_name=result.get("app_name"),
            window_title=result.get("window_title"),
            event_start_time=result.get("event_start_time"),
            event_end_time=result.get("event_end_time"),
            todos=todos,
            extraction_timestamp=datetime.now(),
            screenshot_count=result.get("screenshot_count", 0),
            error_message=result.get("error_message"),
        )

        logger.info(f"待办提取完成: 事件 {event_id}, 提取到 {len(todos)} 个待办事项")

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"提取待办事项失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"提取待办事项时发生错误: {str(e)}",
        ) from e
