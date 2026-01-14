"""Benchmark相关路由"""

from fastapi import APIRouter, Depends, HTTPException

from lifetrace.core.dependencies import get_db_base
from lifetrace.schemas.benchmark import (
    BenchmarkTestCaseCreate,
    BenchmarkTestCaseResponse,
    BenchmarkTestCaseUpdate,
    BenchmarkTestResultResponse,
    BenchmarkTestResultUpdate,
    BenchmarkTestRunResponse,
    RunBenchmarkResponse,
)
from lifetrace.services.benchmark_service import BenchmarkService
from lifetrace.storage.database_base import DatabaseBase
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])


def get_benchmark_service(
    db_base: DatabaseBase = Depends(get_db_base),
) -> BenchmarkService:
    """获取Benchmark服务实例"""
    return BenchmarkService(db_base)


@router.get("/test-cases", response_model=list[BenchmarkTestCaseResponse])
async def get_test_cases(
    category: str | None = None,
    service: BenchmarkService = Depends(get_benchmark_service),
):
    """获取测试用例列表"""
    try:
        test_cases = service.get_test_cases(category=category)
        return test_cases
    except Exception as e:
        logger.error(f"获取测试用例列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/test-cases", response_model=BenchmarkTestCaseResponse)
async def create_test_case(
    data: BenchmarkTestCaseCreate,
    service: BenchmarkService = Depends(get_benchmark_service),
):
    """创建测试用例"""
    try:
        test_case = service.create_test_case(data)
        return test_case
    except Exception as e:
        logger.error(f"创建测试用例失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/test-cases/{test_case_id}", response_model=BenchmarkTestCaseResponse)
async def update_test_case(
    test_case_id: int,
    data: BenchmarkTestCaseUpdate,
    service: BenchmarkService = Depends(get_benchmark_service),
):
    """更新测试用例"""
    try:
        test_case = service.update_test_case(test_case_id, data)
        if not test_case:
            raise HTTPException(status_code=404, detail="测试用例不存在")
        return test_case
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新测试用例失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/test-cases/{test_case_id}")
async def delete_test_case(
    test_case_id: int,
    service: BenchmarkService = Depends(get_benchmark_service),
):
    """删除测试用例"""
    try:
        success = service.delete_test_case(test_case_id)
        if not success:
            raise HTTPException(status_code=404, detail="测试用例不存在")
        return {"success": True, "message": "测试用例已删除"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除测试用例失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/test-cases/{test_case_id}/run", response_model=RunBenchmarkResponse)
async def run_test_case(
    test_case_id: int,
    service: BenchmarkService = Depends(get_benchmark_service),
):
    """运行单个测试用例"""
    try:
        result = service.run_test_case(test_case_id)
        return RunBenchmarkResponse(
            test_run_id=result["test_run_id"],
            status=result["status"],
            message=result["message"],
        )
    except Exception as e:
        logger.error(f"运行测试用例失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/test-runs/{test_run_id}", response_model=BenchmarkTestRunResponse)
async def get_test_run(
    test_run_id: int,
    service: BenchmarkService = Depends(get_benchmark_service),
):
    """根据ID获取单个测试运行记录"""
    try:
        test_run = service.get_test_run(test_run_id)
        if not test_run:
            raise HTTPException(status_code=404, detail="测试运行记录不存在")
        return test_run
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取测试运行记录失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/test-runs", response_model=list[BenchmarkTestRunResponse])
async def get_test_runs(
    test_case_id: int | None = None,
    limit: int = 50,
    service: BenchmarkService = Depends(get_benchmark_service),
):
    """获取测试运行记录"""
    try:
        test_runs = service.get_test_runs(test_case_id=test_case_id, limit=limit)
        return test_runs
    except Exception as e:
        logger.error(f"获取测试运行记录失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/test-results", response_model=list[BenchmarkTestResultResponse])
async def get_test_results(
    test_run_id: int | None = None,
    service: BenchmarkService = Depends(get_benchmark_service),
):
    """获取测试结果"""
    try:
        test_results = service.get_test_results(test_run_id=test_run_id)
        return test_results
    except Exception as e:
        logger.error(f"获取测试结果失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/test-results/{test_result_id}", response_model=BenchmarkTestResultResponse)
async def update_test_result(
    test_result_id: int,
    data: BenchmarkTestResultUpdate,
    service: BenchmarkService = Depends(get_benchmark_service),
):
    """更新评估结果（手动覆盖）"""
    try:
        test_result = service.update_evaluation(
            test_result_id, manual_override=data.manual_override
        )
        if not test_result:
            raise HTTPException(status_code=404, detail="测试结果不存在")
        return test_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新评估结果失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
