"""工作空间相关的 Pydantic 模型定义。"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


ActorMode = Literal["human", "ai"]


class WorkspaceFileSummary(BaseModel):
    path: str = Field(..., description="相对路径，如 notes/today.md")
    name: str = Field(..., description="文件名")
    size: int = Field(..., ge=0, description="文件大小（字节）")
    updated_at: datetime = Field(..., description="最后更新时间")


class WorkspaceFileListResponse(BaseModel):
    files: list[WorkspaceFileSummary]


class WorkspaceFileResponse(WorkspaceFileSummary):
    content: str = Field(..., description="Markdown 内容")


class SaveWorkspaceFileRequest(BaseModel):
    path: str = Field(..., description="相对路径")
    content: str = Field(..., description="新的Markdown 内容")
    actor: ActorMode = Field("human", description="编辑来源")
    last_known_modification: datetime | None = Field(
        None, description="客户端所知的最后修改时间，用于冲突检测"
    )
    lock_id: str | None = Field(None, description="可选的锁ID")


class AcquireWorkspaceLockRequest(BaseModel):
    path: str = Field(..., description="相对路径")
    owner: str = Field(..., description="拥有者标识，例如用户ID或会话ID")
    mode: ActorMode = Field(..., description="编辑模式")
    duration_seconds: int | None = Field(
        None, ge=5, le=3600, description="锁存活时间（秒），留空使用默认值"
    )


class ReleaseWorkspaceLockRequest(BaseModel):
    path: str
    owner: str
    lock_id: str | None = None
    force: bool = False


class WorkspaceLockResponse(BaseModel):
    path: str
    lock_id: str
    owner: str
    mode: ActorMode
    acquired_at: datetime
    expires_at: datetime


class WorkspaceLockStatusResponse(BaseModel):
    lock: WorkspaceLockResponse | None = Field(None, description="当前锁信息")
