"""项目管理相关的 Pydantic 模型"""

from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    """创建项目请求模型"""

    name: str = Field(..., min_length=1, max_length=200, description="项目名称")
    goal: str | None = Field(None, description="项目目标")


class ProjectUpdate(BaseModel):
    """更新项目请求模型"""

    name: str | None = Field(None, min_length=1, max_length=200, description="项目名称")
    goal: str | None = Field(None, description="项目目标")


class ProjectResponse(BaseModel):
    """项目响应模型"""

    id: int = Field(..., description="项目ID")
    name: str = Field(..., description="项目名称")
    goal: str | None = Field(None, description="项目目标")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    """项目列表响应模型"""

    total: int = Field(..., description="总数")
    projects: list[ProjectResponse] = Field(..., description="项目列表")
