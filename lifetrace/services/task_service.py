"""Task 业务逻辑层

处理 Task 相关的业务逻辑，与数据访问层解耦。
"""

from typing import Any

from fastapi import HTTPException

from lifetrace.repositories.interfaces import IProjectRepository, ITaskRepository
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
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class TaskService:
    """Task 业务逻辑层"""

    def __init__(self, task_repository: ITaskRepository, project_repository: IProjectRepository):
        self.task_repo = task_repository
        self.project_repo = project_repository

    def _validate_project_exists(self, project_id: int) -> None:
        """验证项目是否存在"""
        if not self.project_repo.get_by_id(project_id):
            raise HTTPException(status_code=404, detail="项目不存在")

    def _validate_task_belongs_to_project(self, task: dict[str, Any], project_id: int) -> None:
        """验证任务是否属于指定项目"""
        if task["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="任务不属于该项目")

    def get_task(self, project_id: int, task_id: int) -> TaskResponse:
        """获取单个任务详情"""
        task = self.task_repo.get_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        self._validate_task_belongs_to_project(task, project_id)
        return TaskResponse(**task)

    def list_tasks(self, project_id: int, limit: int, offset: int) -> TaskListResponse:
        """获取项目的任务列表"""
        self._validate_project_exists(project_id)

        tasks = self.task_repo.list_tasks(
            project_id=project_id,
            limit=limit,
            offset=offset,
        )
        total = self.task_repo.count_tasks(project_id=project_id)

        logger.info(f"获取项目 {project_id} 的任务列表，返回 {len(tasks)} 个任务")

        return TaskListResponse(
            total=total,
            tasks=[TaskResponse(**t) for t in tasks],
        )

    def create_task(self, project_id: int, data: TaskCreate) -> TaskResponse:
        """创建新任务"""
        self._validate_project_exists(project_id)

        task_id = self.task_repo.create(
            project_id=project_id,
            name=data.name,
            description=data.description,
            status=data.status.value if data.status else "pending",
        )

        if not task_id:
            raise HTTPException(status_code=500, detail="创建任务失败")

        logger.info(f"成功创建任务: {task_id} - {data.name} (项目: {project_id})")
        return self.get_task(project_id, task_id)

    def update_task(self, project_id: int, task_id: int, data: TaskUpdate) -> TaskResponse:
        """更新任务"""
        existing = self.task_repo.get_by_id(task_id)
        if not existing:
            raise HTTPException(status_code=404, detail="任务不存在")

        self._validate_task_belongs_to_project(existing, project_id)

        success = self.task_repo.update(
            task_id,
            name=data.name,
            description=data.description,
            status=data.status.value if data.status else None,
        )

        if not success:
            raise HTTPException(status_code=500, detail="更新任务失败")

        logger.info(f"成功更新任务: {task_id}")
        return self.get_task(project_id, task_id)

    def delete_task(self, project_id: int, task_id: int) -> None:
        """删除任务"""
        existing = self.task_repo.get_by_id(task_id)
        if not existing:
            raise HTTPException(status_code=404, detail="任务不存在")

        self._validate_task_belongs_to_project(existing, project_id)

        if not self.task_repo.delete(task_id):
            raise HTTPException(status_code=500, detail="删除任务失败")

        logger.info(f"成功删除任务: {task_id}")

    def batch_delete_tasks(
        self, project_id: int, request: TaskBatchDeleteRequest
    ) -> TaskBatchDeleteResponse:
        """批量删除任务"""
        self._validate_project_exists(project_id)

        result = self.task_repo.delete_batch(request.task_ids, project_id)

        logger.info(
            f"批量删除任务完成: 项目 {project_id}, "
            f"成功 {result['deleted_count']} 个, "
            f"失败 {len(result['failed_ids'])} 个"
        )

        return TaskBatchDeleteResponse(**result)

    def get_task_progress(
        self, project_id: int, task_id: int, limit: int, offset: int
    ) -> TaskProgressListResponse:
        """获取任务的进展记录列表"""
        task = self.task_repo.get_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        self._validate_task_belongs_to_project(task, project_id)

        progress_list = self.task_repo.get_progress_list(
            task_id=task_id,
            limit=limit,
            offset=offset,
        )
        total = self.task_repo.count_progress(task_id=task_id)

        logger.info(f"获取任务 {task_id} 的进展记录，返回 {len(progress_list)} 条")

        return TaskProgressListResponse(
            total=total,
            progress_list=[TaskProgressResponse(**p) for p in progress_list],
        )

    def get_task_progress_latest(
        self, project_id: int, task_id: int
    ) -> TaskProgressResponse | None:
        """获取任务最新的进展记录"""
        task = self.task_repo.get_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        self._validate_task_belongs_to_project(task, project_id)

        progress = self.task_repo.get_progress_latest(task_id=task_id)

        if progress:
            logger.info(f"获取任务 {task_id} 的最新进展记录")
            return TaskProgressResponse(**progress)
        else:
            logger.info(f"任务 {task_id} 暂无进展记录")
            return None

    def generate_task_summary(self, project_id: int, task_id: int) -> TaskProgressResponse:
        """手动触发生成任务进展摘要"""
        task = self.task_repo.get_by_id(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        self._validate_task_belongs_to_project(task, project_id)

        # 延迟导入避免循环依赖
        from lifetrace.llm.llm_client import LLMClient
        from lifetrace.storage import context_mgr

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
        self._log_token_usage(response, llm_client.model, project_id, task_id)

        # 保存进展记录
        progress_id = self.task_repo.create_progress(
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
        progress = self.task_repo.get_progress_latest(task_id=task_id)
        if not progress:
            raise HTTPException(status_code=500, detail="获取保存的进展记录失败")

        logger.info(f"成功生成任务 {task_id} 的进展摘要，基于 {len(contexts)} 个上下文")
        return TaskProgressResponse(**progress)

    def _log_token_usage(self, response: Any, model: str, project_id: int, task_id: int) -> None:
        """记录token使用量"""
        try:
            from lifetrace.util.token_usage_logger import log_token_usage

            if hasattr(response, "usage") and response.usage:
                log_token_usage(
                    model=model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint=f"/api/projects/{project_id}/tasks/{task_id}/generate-summary",
                    response_type="task_progress",
                    feature_type="task_summary",
                    user_query=f"生成任务进展摘要 - 任务ID: {task_id}",
                )
        except Exception as e:
            logger.warning(f"记录token使用量失败: {e}")
