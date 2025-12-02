"""项目管理相关的 Pydantic 模型"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ProjectStatus(str, Enum):
    """项目状态枚举"""

    ACTIVE = "active"
    ARCHIVED = "archived"
    COMPLETED = "completed"


class ProjectCreate(BaseModel):
    """创建项目请求模型"""

    # 1. 身份锚点
    name: str = Field(..., min_length=1, max_length=200, description="项目名称")
    definition_of_done: str | None = Field(
        None,
        description='项目“完成”的定义',
    )
    status: ProjectStatus = Field(
        ProjectStatus.ACTIVE,
        description="项目状态：active, archived, completed",
    )

    # 2. 语义指纹
    keywords: list[str] | None = Field(
        None,
        description="与项目相关的关键词列表，用于上下文检索",
    )
    whitelist_apps: list[str] | None = Field(
        None,
        description="与项目高度相关的应用白名单（如 VS Code、Chrome）",
    )

    # 3. 里程碑上下文
    milestones: list[dict[str, Any]] | None = Field(
        None,
        description='项目里程碑（例如：[{"stage": "MVP", "status": "in_progress"}]）',
    )

    # 4. AI 与系统上下文
    system_context_prompt: str | None = Field(
        None,
        description="为 AI Advisor 提供的系统级上下文摘要",
    )


class ProjectUpdate(BaseModel):
    """更新项目请求模型"""

    # 1. 身份锚点
    name: str | None = Field(
        None,
        min_length=1,
        max_length=200,
        description="项目名称",
    )
    definition_of_done: str | None = Field(
        None,
        description='项目“完成”的定义',
    )
    status: ProjectStatus | None = Field(
        None,
        description="项目状态：active, archived, completed",
    )

    # 2. 语义指纹
    keywords: list[str] | None = Field(
        None,
        description="与项目相关的关键词列表，用于上下文检索",
    )
    whitelist_apps: list[str] | None = Field(
        None,
        description="与项目高度相关的应用白名单（如 VS Code、Chrome）",
    )

    # 3. 里程碑上下文
    milestones: list[dict[str, Any]] | None = Field(
        None,
        description='项目里程碑（例如：[{"stage": "MVP", "status": "in_progress"}]）',
    )

    # 4. AI 与系统上下文
    system_context_prompt: str | None = Field(
        None,
        description="为 AI Advisor 提供的系统级上下文摘要",
    )


class ProjectResponse(BaseModel):
    """项目响应模型"""

    id: int = Field(..., description="项目ID")

    # 1. 身份锚点
    name: str = Field(..., description="项目名称")
    definition_of_done: str | None = Field(
        None,
        description='项目“完成”的定义',
    )
    status: str = Field(..., description="项目状态：active, archived, completed")

    # 2. 语义指纹
    keywords: list[str] | None = Field(
        None,
        description="与项目相关的关键词列表，用于上下文检索",
    )
    whitelist_apps: list[str] | None = Field(
        None,
        description="与项目高度相关的应用白名单（如 VS Code、Chrome）",
    )

    # 3. 里程碑上下文
    milestones: list[dict[str, Any]] | None = Field(
        None,
        description='项目里程碑（例如：[{"stage": "MVP", "status": "in_progress"}]）',
    )

    # 4. AI 与系统上下文
    system_context_prompt: str | None = Field(
        None,
        description="为 AI Advisor 提供的系统级上下文摘要",
    )

    # 5. 元数据
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    """项目列表响应模型"""

    total: int = Field(..., description="总数")
    projects: list[ProjectResponse] = Field(..., description="项目列表")
