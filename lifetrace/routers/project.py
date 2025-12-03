"""项目管理相关路由"""

from fastapi import APIRouter, HTTPException, Query

from lifetrace.schemas.project import (
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from lifetrace.storage import project_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=ProjectResponse, status_code=201)
async def create_project(project: ProjectCreate):
    """
    创建新项目

    Args:
        project: 项目创建信息

    Returns:
        创建的项目信息
    """
    try:
        # 创建项目
        project_id = project_mgr.create_project(
            name=project.name,
            definition_of_done=project.definition_of_done,
            status=str(project.status),
            description=project.description,
        )

        if not project_id:
            raise HTTPException(status_code=500, detail="创建项目失败")

        # 获取创建的项目信息
        project_data = project_mgr.get_project(project_id)
        if not project_data:
            raise HTTPException(status_code=500, detail="获取创建的项目信息失败")

        logger.info(f"成功创建项目: {project_id} - {project.name}")
        return ProjectResponse(**project_data)

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
        # 获取项目列表
        projects = project_mgr.list_projects(limit=limit, offset=offset, status=status)

        # 统计总数（这里简化处理，实际应该有单独的count方法）
        total = len(projects)

        logger.info(f"获取项目列表，返回 {len(projects)} 个项目")

        return ProjectListResponse(
            total=total,
            projects=[ProjectResponse(**p) for p in projects],
        )

    except Exception as e:
        logger.error(f"获取项目列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取项目列表失败: {str(e)}") from e


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: int):
    """
    获取单个项目详情

    Args:
        project_id: 项目ID

    Returns:
        项目详情
    """
    try:
        project = project_mgr.get_project(project_id)

        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        return ProjectResponse(**project)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取项目详情失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取项目详情失败: {str(e)}") from e


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: int, project: ProjectUpdate):
    """
    更新项目

    Args:
        project_id: 项目ID
        project: 项目更新信息

    Returns:
        更新后的项目信息
    """
    try:
        # 检查项目是否存在
        existing = project_mgr.get_project(project_id)
        if not existing:
            raise HTTPException(status_code=404, detail="项目不存在")

        # 更新项目
        success = project_mgr.update_project(
            project_id=project_id,
            name=project.name,
            definition_of_done=project.definition_of_done,
            status=str(project.status) if project.status is not None else None,
            description=project.description,
        )

        if not success:
            raise HTTPException(status_code=500, detail="更新项目失败")

        # 获取更新后的项目信息
        updated_project = project_mgr.get_project(project_id)
        if not updated_project:
            raise HTTPException(status_code=500, detail="获取更新后的项目信息失败")

        logger.info(f"成功更新项目: {project_id}")
        return ProjectResponse(**updated_project)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新项目失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"更新项目失败: {str(e)}") from e


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: int):
    """
    删除项目

    Args:
        project_id: 项目ID

    Returns:
        无返回内容
    """
    try:
        # 检查项目是否存在
        existing = project_mgr.get_project(project_id)
        if not existing:
            raise HTTPException(status_code=404, detail="项目不存在")

        # 删除项目
        success = project_mgr.delete_project(project_id)

        if not success:
            raise HTTPException(status_code=500, detail="删除项目失败")

        logger.info(f"成功删除项目: {project_id}")
        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除项目失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"删除项目失败: {str(e)}") from e
