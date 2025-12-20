"""Project 业务逻辑层

处理 Project 相关的业务逻辑，与数据访问层解耦。
"""

import json
from typing import Any

from fastapi import HTTPException

from lifetrace.repositories.interfaces import IProjectRepository, ITaskRepository
from lifetrace.schemas.project import (
    GeneratedTaskItem,
    GenerateTasksResponse,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class ProjectService:
    """Project 业务逻辑层"""

    def __init__(self, project_repository: IProjectRepository, task_repository: ITaskRepository):
        self.project_repo = project_repository
        self.task_repo = task_repository

    def get_project(self, project_id: int) -> ProjectResponse:
        """获取单个项目详情"""
        project = self.project_repo.get_by_id(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        return ProjectResponse(**project)

    def list_projects(self, limit: int, offset: int, status: str | None) -> ProjectListResponse:
        """获取所有项目列表"""
        projects = self.project_repo.list_projects(limit=limit, offset=offset, status=status)
        total = len(projects)

        logger.info(f"获取项目列表，返回 {len(projects)} 个项目")

        return ProjectListResponse(
            total=total,
            projects=[ProjectResponse(**p) for p in projects],
        )

    def create_project(self, data: ProjectCreate) -> ProjectResponse:
        """创建新项目"""
        project_id = self.project_repo.create(
            name=data.name,
            definition_of_done=data.definition_of_done,
            status=data.status.value,
            description=data.description,
        )

        if not project_id:
            raise HTTPException(status_code=500, detail="创建项目失败")

        logger.info(f"成功创建项目: {project_id} - {data.name}")
        return self.get_project(project_id)

    def update_project(self, project_id: int, data: ProjectUpdate) -> ProjectResponse:
        """更新项目"""
        if not self.project_repo.get_by_id(project_id):
            raise HTTPException(status_code=404, detail="项目不存在")

        success = self.project_repo.update(
            project_id,
            name=data.name,
            definition_of_done=data.definition_of_done,
            status=data.status.value if data.status is not None else None,
            description=data.description,
        )

        if not success:
            raise HTTPException(status_code=500, detail="更新项目失败")

        logger.info(f"成功更新项目: {project_id}")
        return self.get_project(project_id)

    def delete_project(self, project_id: int) -> None:
        """删除项目"""
        if not self.project_repo.get_by_id(project_id):
            raise HTTPException(status_code=404, detail="项目不存在")

        if not self.project_repo.delete(project_id):
            raise HTTPException(status_code=500, detail="删除项目失败")

        logger.info(f"成功删除项目: {project_id}")

    def generate_tasks(self, project_id: int) -> GenerateTasksResponse:
        """AI任务拆解：根据项目信息自动生成任务列表"""
        project = self.project_repo.get_by_id(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")

        # 延迟导入避免循环依赖
        from lifetrace.llm.llm_client import LLMClient
        from lifetrace.util.prompt_loader import get_prompt

        llm_client = LLMClient()
        if not llm_client.is_available():
            raise HTTPException(status_code=500, detail="LLM服务不可用，请检查配置")

        system_prompt = get_prompt("task_decomposition", "system_prompt")
        user_prompt_template = get_prompt("task_decomposition", "user_prompt")

        user_prompt = user_prompt_template.format(
            project_name=project.get("name", "未命名项目"),
            project_description=project.get("description") or "无描述",
            definition_of_done=project.get("definition_of_done") or "无明确完成标准",
        )

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
        self._log_token_usage(response, llm_client.model, project_id, "generate-tasks")

        # 解析JSON响应
        tasks_data = self._parse_tasks_response(result_text)

        if not tasks_data:
            raise HTTPException(status_code=500, detail="AI未能生成任务，请重试")

        # 创建任务并保存到数据库
        created_tasks = self._create_tasks(project_id, tasks_data)

        if not created_tasks:
            raise HTTPException(status_code=500, detail="创建任务失败，请重试")

        logger.info(f"成功为项目 {project_id} 生成 {len(created_tasks)} 个任务")

        return GenerateTasksResponse(
            tasks=created_tasks,
            message=f"成功生成 {len(created_tasks)} 个任务",
        )

    def _log_token_usage(
        self, response: Any, model: str, project_id: int, endpoint_suffix: str
    ) -> None:
        """记录token使用量"""
        try:
            from lifetrace.util.token_usage_logger import log_token_usage

            if hasattr(response, "usage") and response.usage:
                log_token_usage(
                    model=model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint=f"/api/projects/{project_id}/{endpoint_suffix}",
                    response_type="task_decomposition",
                    feature_type="project_assistant",
                    user_query=f"AI任务拆解 - 项目ID: {project_id}",
                )
        except Exception as e:
            logger.warning(f"记录token使用量失败: {e}")

    def _parse_tasks_response(self, result_text: str) -> list[dict]:
        """解析LLM返回的任务JSON"""
        try:
            clean_text = result_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            parsed_result = json.loads(clean_text)
            return parsed_result.get("tasks", [])
        except json.JSONDecodeError as e:
            logger.error(f"解析LLM响应失败: {e}, 原始响应: {result_text}")
            raise HTTPException(status_code=500, detail="AI返回的任务格式无法解析，请重试") from e

    def _create_tasks(self, project_id: int, tasks_data: list[dict]) -> list[GeneratedTaskItem]:
        """创建任务并保存到数据库"""
        created_tasks = []
        for task_item in tasks_data:
            task_name = task_item.get("name", "").strip()
            task_description = task_item.get("description", "").strip() or None

            if not task_name:
                continue

            task_id = self.task_repo.create(
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

        return created_tasks
