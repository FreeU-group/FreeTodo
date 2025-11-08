"""任务管理相关路由"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Path, Query

from lifetrace.routers import dependencies as deps
from lifetrace.schemas.task import (
    TaskCreate,
    TaskListResponse,
    TaskResponse,
    TaskUpdate,
)

router = APIRouter(tags=["tasks"])


@router.post(
    "/api/projects/{project_id}/tasks",
    response_model=TaskResponse,
    status_code=201,
)
async def create_task(
    project_id: int = Path(..., description="项目ID"),
    task: TaskCreate = None,
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
        # 验证项目是否存在
        project = deps.db_manager.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        # 创建任务
        task_id = deps.db_manager.create_task(
            project_id=project_id,
            name=task.name,
            description=task.description,
            status=task.status.value if task.status else "pending",
            parent_task_id=task.parent_task_id,
        )

        if not task_id:
            raise HTTPException(status_code=500, detail="创建任务失败")

        # 获取创建的任务信息
        task_data = deps.db_manager.get_task(task_id)
        if not task_data:
            raise HTTPException(status_code=500, detail="获取创建的任务信息失败")

        deps.logger.info(f"成功创建任务: {task_id} - {task.name} (项目: {project_id})")
        return TaskResponse(**task_data)

    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"创建任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"创建任务失败: {str(e)}")


@router.get("/api/projects/{project_id}/tasks", response_model=TaskListResponse)
async def get_project_tasks(
    project_id: int = Path(..., description="项目ID"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    parent_task_id: Optional[int] = Query(None, description="父任务ID（获取子任务）"),
    include_subtasks: bool = Query(True, description="是否包含所有子任务"),
):
    """
    获取项目的任务列表

    Args:
        project_id: 项目ID
        limit: 返回数量限制
        offset: 偏移量
        parent_task_id: 父任务ID，用于获取特定任务的子任务
        include_subtasks: 是否包含所有子任务（如果parent_task_id为None）

    Returns:
        任务列表
    """
    try:
        # 验证项目是否存在
        project = deps.db_manager.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        # 获取任务列表
        tasks = deps.db_manager.list_tasks(
            project_id=project_id,
            limit=limit,
            offset=offset,
            parent_task_id=parent_task_id,
            include_subtasks=include_subtasks,
        )

        # 统计总数
        total = deps.db_manager.count_tasks(
            project_id=project_id, parent_task_id=parent_task_id
        )

        deps.logger.info(f"获取项目 {project_id} 的任务列表，返回 {len(tasks)} 个任务")

        return TaskListResponse(
            total=total,
            tasks=[TaskResponse(**t) for t in tasks],
        )

    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"获取任务列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取任务列表失败: {str(e)}")


@router.get(
    "/api/projects/{project_id}/tasks/{task_id}",
    response_model=TaskResponse,
)
async def get_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
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
        task = deps.db_manager.get_task(task_id)

        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 验证任务是否属于指定项目
        if task["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

        return TaskResponse(**task)

    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"获取任务详情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取任务详情失败: {str(e)}")


@router.put(
    "/api/projects/{project_id}/tasks/{task_id}",
    response_model=TaskResponse,
)
async def update_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
    task: TaskUpdate = None,
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
        # 检查任务是否存在
        existing = deps.db_manager.get_task(task_id)
        if not existing:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 验证任务是否属于指定项目
        if existing["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

        # 更新任务
        success = deps.db_manager.update_task(
            task_id=task_id,
            name=task.name,
            description=task.description,
            status=task.status.value if task.status else None,
            parent_task_id=task.parent_task_id,
        )

        if not success:
            raise HTTPException(status_code=500, detail="更新任务失败")

        # 获取更新后的任务信息
        updated_task = deps.db_manager.get_task(task_id)
        if not updated_task:
            raise HTTPException(status_code=500, detail="获取更新后的任务信息失败")

        deps.logger.info(f"成功更新任务: {task_id}")
        return TaskResponse(**updated_task)

    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"更新任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新任务失败: {str(e)}")


@router.delete(
    "/api/projects/{project_id}/tasks/{task_id}",
    status_code=204,
)
async def delete_task(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
):
    """
    删除任务（包括其所有子任务）

    Args:
        project_id: 项目ID
        task_id: 任务ID

    Returns:
        无返回内容
    """
    try:
        # 检查任务是否存在
        existing = deps.db_manager.get_task(task_id)
        if not existing:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 验证任务是否属于指定项目
        if existing["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

        # 删除任务
        success = deps.db_manager.delete_task(task_id)

        if not success:
            raise HTTPException(status_code=500, detail="删除任务失败")

        deps.logger.info(f"成功删除任务及其子任务: {task_id}")
        return None

    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"删除任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除任务失败: {str(e)}")


@router.get(
    "/api/projects/{project_id}/tasks/{task_id}/children",
    response_model=TaskListResponse,
)
async def get_task_children(
    project_id: int = Path(..., description="项目ID"),
    task_id: int = Path(..., description="任务ID"),
):
    """
    获取任务的所有直接子任务

    Args:
        project_id: 项目ID
        task_id: 任务ID

    Returns:
        子任务列表
    """
    try:
        # 检查任务是否存在
        task = deps.db_manager.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 验证任务是否属于指定项目
        if task["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

        # 获取子任务
        children = deps.db_manager.get_task_children(task_id)

        deps.logger.info(f"获取任务 {task_id} 的子任务，共 {len(children)} 个")

        return TaskListResponse(
            total=len(children),
            tasks=[TaskResponse(**t) for t in children],
        )

    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"获取子任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取子任务失败: {str(e)}")

