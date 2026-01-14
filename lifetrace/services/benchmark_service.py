"""Benchmark服务层"""

import json
import uuid
from typing import Any

from sqlalchemy.exc import SQLAlchemyError

from lifetrace.llm.agent_service import AgentService
from lifetrace.schemas.benchmark import (
    BenchmarkTestCaseCreate,
    BenchmarkTestCaseUpdate,
)
from lifetrace.services.benchmark_evaluator import BenchmarkEvaluator
from lifetrace.storage.database_base import DatabaseBase
from lifetrace.storage.models import (
    BenchmarkTestCase,
    BenchmarkTestResult,
    BenchmarkTestRun,
)
from lifetrace.util.logging_config import get_logger
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()


class BenchmarkService:
    """Benchmark服务层"""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base
        self.evaluator = BenchmarkEvaluator()

    def create_test_case(self, data: BenchmarkTestCaseCreate) -> dict[str, Any]:
        """创建测试用例"""
        try:
            with self.db_base.get_session() as session:
                expected_evaluation_points_json = (
                    json.dumps(data.expected_evaluation_points)
                    if data.expected_evaluation_points
                    else None
                )

                test_case = BenchmarkTestCase(
                    category=data.category,
                    query=data.query,
                    description=data.description,
                    expected_evaluation_points=expected_evaluation_points_json,
                    order=data.order,
                )
                session.add(test_case)
                session.commit()
                session.refresh(test_case)

                logger.info(f"创建测试用例: {test_case.id}")
                return self._test_case_to_dict(test_case)
        except SQLAlchemyError as e:
            logger.error(f"创建测试用例失败: {e}")
            raise

    def get_test_cases(self, category: str | None = None) -> list[dict[str, Any]]:
        """获取测试用例列表（可按类别过滤）"""
        try:
            with self.db_base.get_session() as session:
                query = session.query(BenchmarkTestCase).filter(
                    BenchmarkTestCase.deleted_at.is_(None)
                )
                if category:
                    query = query.filter(BenchmarkTestCase.category == category)
                query = query.order_by(BenchmarkTestCase.order, BenchmarkTestCase.created_at)

                test_cases = query.all()
                return [self._test_case_to_dict(tc) for tc in test_cases]
        except SQLAlchemyError as e:
            logger.error(f"获取测试用例列表失败: {e}")
            raise

    def get_test_case(self, test_case_id: int) -> dict[str, Any] | None:
        """获取单个测试用例"""
        try:
            with self.db_base.get_session() as session:
                test_case = (
                    session.query(BenchmarkTestCase)
                    .filter(
                        BenchmarkTestCase.id == test_case_id,
                        BenchmarkTestCase.deleted_at.is_(None),
                    )
                    .first()
                )
                if test_case:
                    return self._test_case_to_dict(test_case)
                return None
        except SQLAlchemyError as e:
            logger.error(f"获取测试用例失败: {e}")
            raise

    def update_test_case(
        self, test_case_id: int, data: BenchmarkTestCaseUpdate
    ) -> dict[str, Any] | None:
        """更新测试用例"""
        try:
            with self.db_base.get_session() as session:
                test_case = (
                    session.query(BenchmarkTestCase)
                    .filter(
                        BenchmarkTestCase.id == test_case_id,
                        BenchmarkTestCase.deleted_at.is_(None),
                    )
                    .first()
                )
                if not test_case:
                    return None

                if data.category is not None:
                    test_case.category = data.category
                if data.query is not None:
                    test_case.query = data.query
                if data.description is not None:
                    test_case.description = data.description
                if data.expected_evaluation_points is not None:
                    test_case.expected_evaluation_points = json.dumps(
                        data.expected_evaluation_points
                    )
                if data.order is not None:
                    test_case.order = data.order

                test_case.updated_at = get_utc_now()
                session.commit()
                session.refresh(test_case)

                logger.info(f"更新测试用例: {test_case_id}")
                return self._test_case_to_dict(test_case)
        except SQLAlchemyError as e:
            logger.error(f"更新测试用例失败: {e}")
            raise

    def delete_test_case(self, test_case_id: int) -> bool:
        """删除测试用例（软删除）"""
        try:
            with self.db_base.get_session() as session:
                test_case = (
                    session.query(BenchmarkTestCase)
                    .filter(
                        BenchmarkTestCase.id == test_case_id,
                        BenchmarkTestCase.deleted_at.is_(None),
                    )
                    .first()
                )
                if not test_case:
                    return False

                test_case.deleted_at = get_utc_now()
                session.commit()

                logger.info(f"删除测试用例: {test_case_id}")
                return True
        except SQLAlchemyError as e:
            logger.error(f"删除测试用例失败: {e}")
            raise

    def run_test_case(self, test_case_id: int) -> dict[str, Any]:
        """运行单个测试用例"""
        try:
            # 获取测试用例
            test_case = self.get_test_case(test_case_id)
            if not test_case:
                raise ValueError(f"测试用例不存在: {test_case_id}")

            # 生成独立的session_id
            session_id = f"benchmark-{uuid.uuid4()}"

            # 创建测试运行记录
            with self.db_base.get_session() as session:
                test_run = BenchmarkTestRun(
                    test_case_id=test_case_id,
                    session_id=session_id,
                    status="running",
                    started_at=get_utc_now(),
                )
                session.add(test_run)
                session.commit()
                session.refresh(test_run)
                test_run_id = test_run.id

            logger.info(f"开始运行测试用例 {test_case_id}, test_run_id: {test_run_id}")

            # 运行Agent
            agent_service = AgentService()
            agent_response = ""
            execution_log: dict[str, Any] = {
                "tool_calls": [],
                "task_type": "unknown",
                "used_planning": False,
                "plan_steps": [],
                "conversation_history": [],
            }

            try:
                # 调用AgentService（非流式，收集完整响应）
                for chunk in agent_service.stream_agent_response(
                    user_query=test_case["query"],
                    todo_context=None,
                    conversation_history=None,
                    lang="zh",
                ):
                    agent_response += chunk
                    # 简单的日志收集（可以从chunk中提取信息）
                    # 这里简化处理，实际可以解析chunk内容

                # 更新测试运行记录
                with self.db_base.get_session() as session:
                    test_run = session.query(BenchmarkTestRun).filter_by(id=test_run_id).first()
                    if test_run:
                        test_run.status = "completed"
                        test_run.completed_at = get_utc_now()
                        test_run.agent_response = agent_response
                        test_run.execution_log = json.dumps(execution_log)
                        session.commit()

                # 自动评估
                evaluation_results = self.evaluator.evaluate(
                    query=test_case["query"],
                    execution_log=execution_log,
                    agent_response=agent_response,
                    category=test_case["category"],
                )

                # 保存评估结果
                with self.db_base.get_session() as session:
                    for eval_point, eval_result in evaluation_results.items():
                        test_result = BenchmarkTestResult(
                            test_run_id=test_run_id,
                            evaluation_point=eval_point,
                            auto_evaluated=eval_result.get("result"),
                            evaluation_details=json.dumps(eval_result),
                        )
                        session.add(test_result)
                    session.commit()

                logger.info(f"测试用例 {test_case_id} 运行完成")
                return {
                    "test_run_id": test_run_id,
                    "status": "completed",
                    "message": "测试运行完成",
                }

            except Exception as e:
                logger.error(f"运行测试用例失败: {e}")
                # 更新测试运行记录为失败
                with self.db_base.get_session() as session:
                    test_run = session.query(BenchmarkTestRun).filter_by(id=test_run_id).first()
                    if test_run:
                        test_run.status = "failed"
                        test_run.completed_at = get_utc_now()
                        session.commit()
                raise

        except Exception as e:
            logger.error(f"运行测试用例失败: {e}")
            raise

    def get_test_runs(
        self, test_case_id: int | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        """获取测试运行记录"""
        try:
            with self.db_base.get_session() as session:
                query = session.query(BenchmarkTestRun)
                if test_case_id:
                    query = query.filter(BenchmarkTestRun.test_case_id == test_case_id)
                query = query.order_by(BenchmarkTestRun.created_at.desc()).limit(limit)

                test_runs = query.all()
                return [self._test_run_to_dict(tr) for tr in test_runs]
        except SQLAlchemyError as e:
            logger.error(f"获取测试运行记录失败: {e}")
            raise

    def get_test_results(self, test_run_id: int | None = None) -> list[dict[str, Any]]:
        """获取测试结果"""
        try:
            with self.db_base.get_session() as session:
                query = session.query(BenchmarkTestResult)
                if test_run_id:
                    query = query.filter(BenchmarkTestResult.test_run_id == test_run_id)
                query = query.order_by(BenchmarkTestResult.created_at)

                test_results = query.all()
                return [self._test_result_to_dict(tr) for tr in test_results]
        except SQLAlchemyError as e:
            logger.error(f"获取测试结果失败: {e}")
            raise

    def update_evaluation(
        self, test_result_id: int, manual_override: bool | None = None
    ) -> dict[str, Any] | None:
        """手动更新评估结果"""
        try:
            with self.db_base.get_session() as session:
                test_result = (
                    session.query(BenchmarkTestResult).filter_by(id=test_result_id).first()
                )
                if not test_result:
                    return None

                if manual_override is not None:
                    test_result.manual_override = manual_override

                test_result.updated_at = get_utc_now()
                session.commit()
                session.refresh(test_result)

                logger.info(f"更新评估结果: {test_result_id}")
                return self._test_result_to_dict(test_result)
        except SQLAlchemyError as e:
            logger.error(f"更新评估结果失败: {e}")
            raise

    def _test_case_to_dict(self, test_case: BenchmarkTestCase) -> dict[str, Any]:
        """将测试用例模型转换为字典"""
        expected_evaluation_points = None
        if test_case.expected_evaluation_points:
            try:
                expected_evaluation_points = json.loads(test_case.expected_evaluation_points)
            except Exception:
                pass

        return {
            "id": test_case.id,
            "category": test_case.category,
            "query": test_case.query,
            "description": test_case.description,
            "expected_evaluation_points": expected_evaluation_points,
            "order": test_case.order,
            "created_at": test_case.created_at,
            "updated_at": test_case.updated_at,
        }

    def _test_run_to_dict(self, test_run: BenchmarkTestRun) -> dict[str, Any]:
        """将测试运行记录模型转换为字典"""
        execution_log = None
        if test_run.execution_log:
            try:
                execution_log = json.loads(test_run.execution_log)
            except Exception:
                pass

        return {
            "id": test_run.id,
            "test_case_id": test_run.test_case_id,
            "session_id": test_run.session_id,
            "status": test_run.status,
            "started_at": test_run.started_at,
            "completed_at": test_run.completed_at,
            "agent_response": test_run.agent_response,
            "execution_log": execution_log,
            "created_at": test_run.created_at,
            "updated_at": test_run.updated_at,
        }

    def _test_result_to_dict(self, test_result: BenchmarkTestResult) -> dict[str, Any]:
        """将测试结果模型转换为字典"""
        evaluation_details = None
        if test_result.evaluation_details:
            try:
                evaluation_details = json.loads(test_result.evaluation_details)
            except Exception:
                pass

        final_result = test_result.manual_override
        if final_result is None:
            final_result = test_result.auto_evaluated

        return {
            "id": test_result.id,
            "test_run_id": test_result.test_run_id,
            "evaluation_point": test_result.evaluation_point,
            "auto_evaluated": test_result.auto_evaluated,
            "manual_override": test_result.manual_override,
            "final_result": final_result,
            "evaluation_details": evaluation_details,
            "created_at": test_result.created_at,
            "updated_at": test_result.updated_at,
        }
