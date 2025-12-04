"""任务管理相关路由"""

from fastapi import APIRouter, HTTPException, Path, Query

from lifetrace.llm.llm_client import LLMClient
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
from lifetrace.storage import context_mgr, project_mgr, task_mgr
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
        project = project_mgr.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        # 创建任务
        task_id = task_mgr.create_task(
            project_id=project_id,
            name=task.name,
            description=task.description,
            status=task.status.value if task.status else "pending",
        )

        if not task_id:
            raise HTTPException(status_code=500, detail="创建任务失败")

        # 获取创建的任务信息
        task_data = task_mgr.get_task(task_id)
        if not task_data:
            raise HTTPException(status_code=500, detail="获取创建的任务信息失败")

        logger.info(f"成功创建任务: {task_id} - {task.name} (项目: {project_id})")
        return TaskResponse(**task_data)

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
        # 验证项目是否存在
        project = project_mgr.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        # 获取任务列表
        tasks = task_mgr.list_tasks(
            project_id=project_id,
            limit=limit,
            offset=offset,
        )

        # 统计总数
        total = task_mgr.count_tasks(project_id=project_id)

        logger.info(f"获取项目 {project_id} 的任务列表，返回 {len(tasks)} 个任务")

        return TaskListResponse(
            total=total,
            tasks=[TaskResponse(**t) for t in tasks],
        )

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
        task = task_mgr.get_task(task_id)

        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 验证任务是否属于指定项目
        if task["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

        return TaskResponse(**task)

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
        existing = task_mgr.get_task(task_id)
        if not existing:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 验证任务是否属于指定项目
        if existing["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

        # 更新任务
        success = task_mgr.update_task(
            task_id=task_id,
            name=task.name,
            description=task.description,
            status=task.status.value if task.status else None,
        )

        if not success:
            raise HTTPException(status_code=500, detail="更新任务失败")

        # 获取更新后的任务信息
        updated_task = task_mgr.get_task(task_id)
        if not updated_task:
            raise HTTPException(status_code=500, detail="获取更新后的任务信息失败")

        logger.info(f"成功更新任务: {task_id}")
        return TaskResponse(**updated_task)

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
        # 检查任务是否存在
        existing = task_mgr.get_task(task_id)
        if not existing:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 验证任务是否属于指定项目
        if existing["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

        # 删除任务
        success = task_mgr.delete_task(task_id)

        if not success:
            raise HTTPException(status_code=500, detail="删除任务失败")

        logger.info(f"成功删除任务: {task_id}")
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
        # 验证项目是否存在
        project = project_mgr.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        # 批量删除任务
        result = task_mgr.delete_tasks_batch(request.task_ids, project_id)

        logger.info(
            f"批量删除任务完成: 项目 {project_id}, "
            f"成功 {result['deleted_count']} 个, "
            f"失败 {len(result['failed_ids'])} 个"
        )

        return TaskBatchDeleteResponse(**result)

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
        # 检查任务是否存在
        task = task_mgr.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 验证任务是否属于指定项目
        if task["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

        # 获取进展记录列表
        progress_list = task_mgr.get_task_progress_list(
            task_id=task_id,
            limit=limit,
            offset=offset,
        )

        # 统计总数
        total = task_mgr.count_task_progress(task_id=task_id)

        logger.info(f"获取任务 {task_id} 的进展记录，返回 {len(progress_list)} 条")

        return TaskProgressListResponse(
            total=total,
            progress_list=[TaskProgressResponse(**p) for p in progress_list],
        )

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
        # 检查任务是否存在
        task = task_mgr.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 验证任务是否属于指定项目
        if task["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

        # 获取最新进展记录
        progress = task_mgr.get_task_progress_latest(task_id=task_id)

        if progress:
            logger.info(f"获取任务 {task_id} 的最新进展记录")
            return TaskProgressResponse(**progress)
        else:
            logger.info(f"任务 {task_id} 暂无进展记录")
            return None

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
        # 检查任务是否存在
        task = task_mgr.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 验证任务是否属于指定项目
        if task["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

        # 获取任务关联的未使用上下文
        contexts = context_mgr.list_contexts(
            task_id=task_id,
            used_in_summary=False,
            limit=1000,
        )

        # 如果没有未使用的上下文，获取所有上下文（允许重新生成）
        if not contexts:
            contexts = context_mgr.list_contexts(
                task_id=task_id,
                limit=1000,
            )

        # 如果仍然没有上下文，返回友好的提示
        if not contexts:
            raise HTTPException(
                status_code=400,
                detail="该任务还没有关联任何上下文。请先在「关联上下文」标签页关联相关的工作记录。",
            )

        # 准备上下文信息
        context_summaries = []
        for ctx in contexts:
            summary = f"[{ctx.get('ai_title', '未命名')}] {ctx.get('ai_summary', '无摘要')}"
            context_summaries.append(summary)

        # 构建 LLM prompt
        prompt = f"""请基于以下上下文信息，生成任务「{task["name"]}」的进展摘要。

任务描述：{task.get("description", "无描述")}

相关上下文（共 {len(contexts)} 个）：
{chr(10).join(f"{i + 1}. {s}" for i, s in enumerate(context_summaries))}

要求：
1. 摘要应简洁明了，突出重点进展
2. 长度控制在 200 字以内
3. 使用 Markdown 格式
4. 关注任务的完成情况和关键成果
"""

        # 调用 LLM 生成摘要
        llm_client = LLMClient()

        if not llm_client.is_available():
            raise HTTPException(status_code=500, detail="LLM 服务不可用")

        response = llm_client.client.chat.completions.create(
            model=llm_client.model,
            messages=[
                {
                    "role": "system",
                    "content": "你是一个专业的任务进展分析助手，擅长从上下文信息中总结任务进展。",
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=500,
        )

        summary = response.choices[0].message.content.strip()

        # 记录 token 使用量
        try:
            from lifetrace.util.token_usage_logger import log_token_usage

            if hasattr(response, "usage") and response.usage:
                log_token_usage(
                    model=llm_client.model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint="/api/projects/{project_id}/tasks/{task_id}/generate-summary",
                    response_type="task_progress",
                    feature_type="task_summary",
                    user_query=f"生成任务进展摘要 - 任务ID: {task_id}",
                )
        except Exception as e:
            logger.warning(f"记录token使用量失败: {e}")

        # 保存进展记录
        progress_id = task_mgr.create_task_progress(
            task_id=task_id,
            summary=summary,
            context_count=len(contexts),
        )

        if not progress_id:
            raise HTTPException(status_code=500, detail="保存进展记录失败")

        # 标记上下文为已使用
        for ctx in contexts:
            if "id" in ctx:
                context_mgr.mark_context_as_used_in_summary(ctx["id"])

        # 获取保存的进展记录
        progress = task_mgr.get_task_progress_latest(task_id=task_id)
        if not progress:
            raise HTTPException(status_code=500, detail="获取保存的进展记录失败")

        logger.info(f"成功生成任务 {task_id} 的进展摘要，基于 {len(contexts)} 个上下文")
        return TaskProgressResponse(**progress)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"生成任务进展摘要失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"生成任务进展摘要失败: {str(e)}") from e
