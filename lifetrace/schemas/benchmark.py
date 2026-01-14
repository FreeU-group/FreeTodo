"""Benchmark相关的 Pydantic 模型"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class BenchmarkTestCaseCreate(BaseModel):
    """创建测试用例请求"""

    category: str = Field(
        ..., description="测试类别：intent_ambiguous, short_long_boundary, tool_conflict"
    )
    query: str = Field(..., description="测试查询文本")
    description: str | None = Field(None, description="测试描述")
    expected_evaluation_points: dict[str, Any] | None = Field(
        None, description="期望的评估点（JSON格式）"
    )
    order: int = Field(0, description="排序字段")


class BenchmarkTestCaseUpdate(BaseModel):
    """更新测试用例请求"""

    category: str | None = None
    query: str | None = None
    description: str | None = None
    expected_evaluation_points: dict[str, Any] | None = None
    order: int | None = None


class BenchmarkTestCaseResponse(BaseModel):
    """测试用例响应"""

    id: int
    category: str
    query: str
    description: str | None
    expected_evaluation_points: dict[str, Any] | None
    order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BenchmarkTestRunResponse(BaseModel):
    """测试运行记录响应"""

    id: int
    test_case_id: int
    session_id: str
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    agent_response: str | None
    execution_log: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BenchmarkTestResultResponse(BaseModel):
    """测试结果响应"""

    id: int
    test_run_id: int
    evaluation_point: str
    auto_evaluated: bool | None
    manual_override: bool | None
    evaluation_details: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @property
    def final_result(self) -> bool | None:
        """最终结果（优先使用manual_override，否则使用auto_evaluated）"""
        if self.manual_override is not None:
            return self.manual_override
        return self.auto_evaluated


class RunBenchmarkRequest(BaseModel):
    """运行benchmark测试请求"""

    test_case_id: int


class RunBenchmarkResponse(BaseModel):
    """运行benchmark测试响应"""

    test_run_id: int
    status: str
    message: str


class BenchmarkTestResultUpdate(BaseModel):
    """更新测试结果请求（手动覆盖）"""

    manual_override: bool | None = None
    evaluation_details: dict[str, Any] | None = None
