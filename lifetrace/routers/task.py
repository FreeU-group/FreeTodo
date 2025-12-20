"""任务管理相关路由"""

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from lifetrace.core.dependencies import get_task_service
from lifetrace.schemas.task import (
    TaskBatchDeleteRequest,
    TaskBatchDeleteResponse,
    TaskCreate,
    TaskListResponse,
    TaskProgressListResponse,
    TaskProgressResponse,
    TaskResponse,
    TaskUpdate,
)
from lifetrace.services.task_service import TaskService
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(tags=["tasks"])


@router.post(
    "/api/projects/{project_id}/tasks",
    response_model=TaskResponse,
    status_code=201,
)
async def create_task(
    project_id: int = Path(..., description="项目ID"),
    task: TaskCreate = None,
    service: TaskService = Depends(get_task_service),
):
    """
    创建新任务

    Args:
        project_id: 项目ID
        task: 任务创建信息

    Returns:
        创建的任务信息
    """
    try:
        return service.create_task(project_id, task)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"创建任务失败: {str(e)}") from e


@router.get("/api/projects/{project_id}/tasks", response_model=TaskListResponse)
async def get_project_tasks(
    project_id: int = Path(..., description="项目ID"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    service: TaskService = Depends(get_task_service),
):
    """
    获取项目的任务列表

    Args:
        project_id: 项目ID
        limit: 返回数量限制
        offset: 偏移量

    Returns:
        任务列表
    """
    try:
        return service.list_tasks(project_id, limit, offset)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取任务列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取任务列表失败: {str(e)}") from e


@router.get(
    "/api/projects/{project_id}/tasks/{task_id}",
    response_model=TaskResponse,
)
async def get_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    service: TaskService = Depends(get_task_service),
):
    """
    获取单个任务详情

    Args:
        project_id: 项目ID
        task_id: 任务ID

    Returns:
        任务详情
    """
    try:
        return service.get_task(project_id, task_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取任务详情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取任务详情失败: {str(e)}") from e


@router.put(
    "/api/projects/{project_id}/tasks/{task_id}",
    response_model=TaskResponse,
)
async def update_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    task: TaskUpdate = None,
    service: TaskService = Depends(get_task_service),
):
    """
    更新任务

    Args:
        project_id: 项目ID
        task_id: 任务ID
        task: 任务更新信息

    Returns:
        更新后的任务信息
    """
    try:
        return service.update_task(project_id, task_id, task)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新任务失败: {str(e)}") from e


@router.delete(
    "/api/projects/{project_id}/tasks/{task_id}",
    status_code=204,
)
async def delete_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    service: TaskService = Depends(get_task_service),
):
    """
    删除任务

    Args:
        project_id: 项目ID
        task_id: 任务ID

    Returns:
        无返回内容
    """
    try:
        service.delete_task(project_id, task_id)
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除任务失败: {str(e)}") from e


@router.post(
    "/api/projects/{project_id}/tasks/batch-delete",
    response_model=TaskBatchDeleteResponse,
)
async def batch_delete_tasks(
    project_id: int = Path(..., description="项目ID"),
    request: TaskBatchDeleteRequest = None,
    service: TaskService = Depends(get_task_service),
):
    """
    批量删除任务

    Args:
        project_id: 项目ID
        request: 批量删除请求，包含要删除的任务ID列表

    Returns:
        批量删除结果
    """
    try:
        return service.batch_delete_tasks(project_id, request)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"批量删除任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"批量删除任务失败: {str(e)}") from e


@router.get(
    "/api/projects/{project_id}/tasks/{task_id}/progress",
    response_model=TaskProgressListResponse,
)
async def get_task_progress(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    limit: int = Query(10, ge=1, le=100, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    service: TaskService = Depends(get_task_service),
):
    """
    获取任务的进展记录列表

    Args:
        project_id: 项目ID
        task_id: 任务ID
        limit: 返回数量限制
        offset: 偏移量

    Returns:
        任务进展记录列表
    """
    try:
        return service.get_task_progress(project_id, task_id, limit, offset)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取任务进展记录失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取任务进展记录失败: {str(e)}") from e


@router.get(
    "/api/projects/{project_id}/tasks/{task_id}/progress/latest",
    response_model=TaskProgressResponse | None,
)
async def get_task_progress_latest(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    service: TaskService = Depends(get_task_service),
):
    """
    获取任务最新的进展记录

    Args:
        project_id: 项目ID
        task_id: 任务ID

    Returns:
        最新的进展记录，无记录返回null
    """
    try:
        return service.get_task_progress_latest(project_id, task_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取任务最新进展记录失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取任务最新进展记录失败: {str(e)}") from e


@router.post(
    "/api/projects/{project_id}/tasks/{task_id}/generate-summary",
    response_model=TaskProgressResponse,
)
async def generate_task_summary(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    service: TaskService = Depends(get_task_service),
):
    """
    手动触发生成任务进展摘要

    Args:
        project_id: 项目ID
        task_id: 任务ID

    Returns:
        生成的进展记录
    """
    try:
        return service.generate_task_summary(project_id, task_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成任务进展摘要失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"生成任务进展摘要失败: {str(e)}") from e
