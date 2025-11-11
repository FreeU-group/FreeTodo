"""上下文管理相关路由"""

from fastapi import APIRouter, HTTPException, Path, Query

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.context import (
    ContextListResponse,
    ContextResponse,
    ContextUpdateRequest,
)

router = APIRouter(prefix="/api/contexts", tags=["contexts"])


@router.get("", response_model=ContextListResponse)
async def get_contexts(
    associated: bool | None = Query(None, description="是否已关联任务（true/false）"),
    task_id: int | None = Query(None, description="按任务ID过滤"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
):
    """
    获取上下文记录列表

    Args:
        associated: 是否已关联任务（None表示全部，false表示未关联，true表示已关联）
        task_id: 按任务ID过滤
        limit: 返回数量限制
        offset: 偏移量

    Returns:
        上下文记录列表

    Examples:
        GET /api/contexts?associated=false  # 获取所有未关联的上下文
        GET /api/contexts?associated=true   # 获取所有已关联的上下文
        GET /api/contexts?task_id=1         # 获取关联到任务1的所有上下文
        GET /api/contexts                   # 获取所有上下文
    """
    try:
        # 获取上下文列表
        contexts = deps.db_manager.list_contexts(
            associated=associated,
            task_id=task_id,
            limit=limit,
            offset=offset,
        )

        # 统计总数
        total = deps.db_manager.count_contexts(
            associated=associated,
            task_id=task_id,
        )

        deps.logger.info(
            f"获取上下文记录列表，associated={associated}, task_id={task_id}, 返回 {len(contexts)} 条"
        )

        return ContextListResponse(
            total=total,
            contexts=[ContextResponse(**c) for c in contexts],
        )

    except Exception as e:
        deps.logger.error(f"获取上下文记录列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取上下文记录列表失败: {str(e)}") from e


@router.get("/{context_id}", response_model=ContextResponse)
async def get_context(
    context_id: int = Path(..., description="上下文ID"),
):
    """
    获取单个上下文记录详情

    Args:
        context_id: 上下文ID

    Returns:
        上下文记录详情
    """
    try:
        context = deps.db_manager.get_context(context_id)

        if not context:
            raise HTTPException(status_code=404, detail="上下文记录不存在")

        return ContextResponse(**context)

    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"获取上下文记录详情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取上下文记录详情失败: {str(e)}") from e


@router.put("/{context_id}", response_model=ContextResponse)
async def update_context(
    context_id: int = Path(..., description="上下文ID"),
    update_data: ContextUpdateRequest = None,
):
    """
    更新上下文记录的任务关联

    Args:
        context_id: 上下文ID
        update_data: 更新数据，包含task_id

    Returns:
        更新后的上下文记录

    Examples:
        PUT /api/contexts/1
        Body: {"task_id": 5}  # 将上下文1关联到任务5

        PUT /api/contexts/1
        Body: {"task_id": null}  # 解除上下文1的任务关联
    """
    try:
        # 检查上下文是否存在
        existing = deps.db_manager.get_context(context_id)
        if not existing:
            raise HTTPException(status_code=404, detail="上下文记录不存在")

        # 如果指定了task_id，验证任务是否存在
        if update_data.task_id is not None:
            task = deps.db_manager.get_task(update_data.task_id)
            if not task:
                raise HTTPException(status_code=404, detail="任务不存在")

        # 更新上下文的任务关联
        success = deps.db_manager.update_context_task(
            context_id=context_id,
            task_id=update_data.task_id,
        )

        if not success:
            raise HTTPException(status_code=500, detail="更新上下文记录失败")

        # 获取更新后的上下文信息
        updated_context = deps.db_manager.get_context(context_id)
        if not updated_context:
            raise HTTPException(status_code=500, detail="获取更新后的上下文信息失败")

        deps.logger.info(f"成功更新上下文 {context_id} 的任务关联: {update_data.task_id}")
        return ContextResponse(**updated_context)

    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"更新上下文记录失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新上下文记录失败: {str(e)}") from e
