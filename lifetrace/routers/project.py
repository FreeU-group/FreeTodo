"""项目管理相关路由"""

from fastapi import APIRouter, Depends, HTTPException, Query

from lifetrace.core.dependencies import get_project_service
from lifetrace.schemas.project import (
    GenerateTasksResponse,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from lifetrace.services.project_service import ProjectService
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(
    project: ProjectCreate,
    service: ProjectService = Depends(get_project_service),
):
    """
    创建新项目

    Args:
        project: 项目创建信息

    Returns:
        创建的项目信息
    """
    try:
        return service.create_project(project)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建项目失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"创建项目失败: {str(e)}") from e


@router.get("", response_model=ProjectListResponse)
async def get_projects(
    limit: int = Query(100, ge=1, le=1000, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    status: str | None = Query(None, description="项目状态筛选（active/archived/completed）"),
    service: ProjectService = Depends(get_project_service),
):
    """
    获取所有项目列表

    Args:
        limit: 返回数量限制
        offset: 偏移量
        status: 项目状态筛选

    Returns:
        项目列表
    """
    try:
        return service.list_projects(limit=limit, offset=offset, status=status)
    except Exception as e:
        logger.error(f"获取项目列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取项目列表失败: {str(e)}") from e


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    service: ProjectService = Depends(get_project_service),
):
    """
    获取单个项目详情

    Args:
        project_id: 项目ID

    Returns:
        项目详情
    """
    try:
        return service.get_project(project_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取项目详情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取项目详情失败: {str(e)}") from e


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project: ProjectUpdate,
    service: ProjectService = Depends(get_project_service),
):
    """
    更新项目

    Args:
        project_id: 项目ID
        project: 项目更新信息

    Returns:
        更新后的项目信息
    """
    try:
        return service.update_project(project_id, project)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新项目失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新项目失败: {str(e)}") from e


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: int,
    service: ProjectService = Depends(get_project_service),
):
    """
    删除项目

    Args:
        project_id: 项目ID

    Returns:
        无返回内容
    """
    try:
        service.delete_project(project_id)
        return None
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除项目失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除项目失败: {str(e)}") from e


@router.post("/{project_id}/generate-tasks", response_model=GenerateTasksResponse)
async def generate_tasks(
    project_id: int,
    service: ProjectService = Depends(get_project_service),
):
    """
    AI任务拆解：根据项目信息自动生成任务列表

    Args:
        project_id: 项目ID

    Returns:
        生成的任务列表
    """
    try:
        return service.generate_tasks(project_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI任务拆解失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI任务拆解失败: {str(e)}") from e
