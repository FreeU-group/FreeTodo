"""项目管理相关路由"""

import json

from fastapi import APIRouter, HTTPException, Query

from lifetrace.llm.llm_client import LLMClient
from lifetrace.schemas.project import (
    GeneratedTaskItem,
    GenerateTasksResponse,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from lifetrace.storage import project_mgr, task_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

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
            status=project.status.value,
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
            status=project.status.value if project.status is not None else None,
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


@router.post("/{project_id}/generate-tasks", response_model=GenerateTasksResponse)
async def generate_tasks(project_id: int):
    """
    AI任务拆解：根据项目信息自动生成任务列表

    Args:
        project_id: 项目ID

    Returns:
        生成的任务列表
    """
    try:
        # 检查项目是否存在
        project = project_mgr.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        # 检查LLM服务是否可用
        llm_client = LLMClient()
        if not llm_client.is_available():
            raise HTTPException(status_code=500, detail="LLM服务不可用，请检查配置")

        # 获取prompt模板
        system_prompt = get_prompt("task_decomposition", "system_prompt")
        user_prompt_template = get_prompt("task_decomposition", "user_prompt")

        # 构建用户提示词
        user_prompt = user_prompt_template.format(
            project_name=project.get("name", "未命名项目"),
            project_description=project.get("description") or "无描述",
            definition_of_done=project.get("definition_of_done") or "无明确完成标准",
        )

        # 调用LLM生成任务
        response = llm_client.client.chat.completions.create(
            model=llm_client.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=2000,
        )

        result_text = response.choices[0].message.content.strip()

        # 记录token使用量
        try:
            from lifetrace.util.token_usage_logger import log_token_usage

            if hasattr(response, "usage") and response.usage:
                log_token_usage(
                    model=llm_client.model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint=f"/api/projects/{project_id}/generate-tasks",
                    response_type="task_decomposition",
                    feature_type="project_assistant",
                    user_query=f"AI任务拆解 - 项目ID: {project_id}",
                )
        except Exception as e:
            logger.warning(f"记录token使用量失败: {e}")

        # 解析JSON响应
        try:
            # 清理可能的markdown代码块标记
            clean_text = result_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            parsed_result = json.loads(clean_text)
            tasks_data = parsed_result.get("tasks", [])
        except json.JSONDecodeError as e:
            logger.error(f"解析LLM响应失败: {e}, 原始响应: {result_text}")
            raise HTTPException(
                status_code=500, detail="AI返回的任务格式无法解析，请重试"
            ) from e

        if not tasks_data:
            raise HTTPException(status_code=500, detail="AI未能生成任务，请重试")

        # 创建任务并保存到数据库
        created_tasks = []
        for task_item in tasks_data:
            task_name = task_item.get("name", "").strip()
            task_description = task_item.get("description", "").strip() or None

            if not task_name:
                continue

            # 创建任务
            task_id = task_mgr.create_task(
                project_id=project_id,
                name=task_name,
                description=task_description,
                status="pending",
            )

            if task_id:
                created_tasks.append(
                    GeneratedTaskItem(
                        id=task_id,
                        name=task_name,
                        description=task_description,
                    )
                )

        if not created_tasks:
            raise HTTPException(status_code=500, detail="创建任务失败，请重试")

        logger.info(
            f"成功为项目 {project_id} 生成 {len(created_tasks)} 个任务"
        )

        return GenerateTasksResponse(
            tasks=created_tasks,
            message=f"成功生成 {len(created_tasks)} 个任务",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI任务拆解失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI任务拆解失败: {str(e)}") from e
