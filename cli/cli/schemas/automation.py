"""自动化任务相关模型"""

from __future__ import annotations

from datetime import datetime  # noqa: TC003 – Pydantic needs runtime access
from typing import Any

from pydantic import BaseModel, Field


class AutomationSchedule(BaseModel):
    """任务调度配置"""

    type: str = Field(..., description="调度类型: interval/cron/once")
    interval_seconds: int | None = Field(None, description="间隔秒数")
    cron: str | None = Field(None, description="Cron 表达式 (分钟 小时 日 月 周)")
    run_at: datetime | None = Field(None, description="一次性执行时间")
    timezone: str | None = Field(None, description="时区")


class AutomationAction(BaseModel):
    """任务动作配置"""

    type: str = Field(..., description="动作类型，例如 web_fetch")
    payload: dict[str, Any] = Field(default_factory=dict, description="动作参数")


class AutomationTaskCreate(BaseModel):
    """创建自动化任务请求"""

    name: str = Field(..., min_length=1, max_length=200, description="任务名称")
    description: str | None = Field(None, description="任务描述")
    enabled: bool = Field(True, description="是否启用")
    schedule: AutomationSchedule = Field(..., description="调度配置")
    action: AutomationAction = Field(..., description="动作配置")


class AutomationTaskUpdate(BaseModel):
    """更新自动化任务请求"""

    name: str | None = Field(None, min_length=1, max_length=200, description="任务名称")
    description: str | None = Field(None, description="任务描述")
    enabled: bool | None = Field(None, description="是否启用")
    schedule: AutomationSchedule | None = Field(None, description="调度配置")
    action: AutomationAction | None = Field(None, description="动作配置")


class AutomationTaskResponse(BaseModel):
    """自动化任务响应"""

    id: int = Field(..., description="任务ID")
    name: str = Field(..., description="任务名称")
    description: str | None = Field(None, description="任务描述")
    enabled: bool = Field(..., description="是否启用")
    schedule: AutomationSchedule = Field(..., description="调度配置")
    action: AutomationAction = Field(..., description="动作配置")
    last_run_at: datetime | None = Field(None, description="最后运行时间")
    last_status: str | None = Field(None, description="最后运行状态")
    last_error: str | None = Field(None, description="最后错误信息")
    last_output: str | None = Field(None, description="最后输出摘要")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class AutomationTaskListResponse(BaseModel):
    """自动化任务列表响应"""

    total: int
    tasks: list[AutomationTaskResponse]
