"""Agent plan manager - plan/run/step/journal persistence."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from sqlalchemy.exc import SQLAlchemyError

from storage.models import AgentPlan, AgentPlanJournal, AgentPlanRun, AgentPlanStep
from storage.sql_utils import col
from util.logging_config import get_logger
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from datetime import datetime

    from storage.database_base import DatabaseBase

logger = get_logger()


@dataclass(slots=True)
class AgentPlanStepPayload:
    run_id: str
    step_id: str
    step_name: str
    status: str
    retry_count: int = 0
    input_json: str | None = None
    output_json: str | None = None
    error: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    is_side_effect: bool = False
    rollback_required: bool = False


@dataclass(slots=True)
class AgentPlanJournalPayload:
    journal_id: str
    run_id: str
    step_id: str
    op_type: str
    target_path: str | None = None
    backup_path: str | None = None
    trash_path: str | None = None
    from_path: str | None = None
    to_path: str | None = None
    created_paths_json: str | None = None
    status: str = "applied"
    error: str | None = None


class AgentPlanManager:
    """Agent plan manager."""

    def __init__(self, db_base: DatabaseBase):
        self.db_base = db_base

    def create_plan(
        self,
        *,
        plan_id: str,
        title: str,
        spec: dict[str, Any],
        todo_id: int | None = None,
        session_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Create plan."""
        try:
            with self.db_base.get_session() as session:
                plan = AgentPlan(
                    plan_id=plan_id,
                    title=title,
                    spec_json=json.dumps(spec, ensure_ascii=False),
                    todo_id=todo_id,
                    session_id=session_id,
                )
                session.add(plan)
                session.flush()
                return self._plan_to_dict(plan)
        except SQLAlchemyError as exc:
            logger.error(f"Failed to create plan: {exc}")
            return None

    def get_plan(self, plan_id: str) -> dict[str, Any] | None:
        """Get plan."""
        try:
            with self.db_base.get_session() as session:
                plan = session.query(AgentPlan).filter_by(plan_id=plan_id).first()
                return self._plan_to_dict(plan) if plan else None
        except SQLAlchemyError as exc:
            logger.error(f"Failed to get plan: {exc}")
            return None

    def get_latest_plan_for_todo(self, todo_id: int) -> dict[str, Any] | None:
        """Get latest plan for todo."""
        try:
            with self.db_base.get_session() as session:
                plan = (
                    session.query(AgentPlan)
                    .filter(col(AgentPlan.todo_id) == todo_id)
                    .order_by(col(AgentPlan.created_at).desc())
                    .first()
                )
                return self._plan_to_dict(plan) if plan else None
        except SQLAlchemyError as exc:
            logger.error(f"Failed to get plan for todo: {exc}")
            return None

    def create_run(
        self,
        *,
        run_id: str,
        plan_id: str,
        status: str,
        session_id: str | None,
    ) -> dict[str, Any] | None:
        """Create plan run."""
        try:
            with self.db_base.get_session() as session:
                run = AgentPlanRun(
                    run_id=run_id,
                    plan_id=plan_id,
                    status=status,
                    session_id=session_id,
                    started_at=get_utc_now(),
                )
                session.add(run)
                session.flush()
                return self._run_to_dict(run)
        except SQLAlchemyError as exc:
            logger.error(f"Failed to create plan run: {exc}")
            return None

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        """Get plan run."""
        try:
            with self.db_base.get_session() as session:
                run = session.query(AgentPlanRun).filter_by(run_id=run_id).first()
                return self._run_to_dict(run) if run else None
        except SQLAlchemyError as exc:
            logger.error(f"Failed to get plan run: {exc}")
            return None

    def get_latest_run_for_plan(self, plan_id: str) -> dict[str, Any] | None:
        """Get latest run for plan."""
        try:
            with self.db_base.get_session() as session:
                run = (
                    session.query(AgentPlanRun)
                    .filter(col(AgentPlanRun.plan_id) == plan_id)
                    .order_by(col(AgentPlanRun.started_at).desc())
                    .first()
                )
                return self._run_to_dict(run) if run else None
        except SQLAlchemyError as exc:
            logger.error(f"Failed to get plan run: {exc}")
            return None

    def update_run(self, run_id: str, **fields: Any) -> bool:
        """Update plan run."""
        try:
            with self.db_base.get_session() as session:
                run = session.query(AgentPlanRun).filter_by(run_id=run_id).first()
                if not run:
                    return False
                for key, value in fields.items():
                    if hasattr(run, key):
                        setattr(run, key, value)
                run.updated_at = get_utc_now()
                session.flush()
                return True
        except SQLAlchemyError as exc:
            logger.error(f"Failed to update plan run: {exc}")
            return False

    def request_cancel(self, run_id: str) -> bool:
        """Request plan cancellation."""
        return self.update_run(
            run_id, cancel_requested=True, status="cancelled", ended_at=get_utc_now()
        )

    def upsert_step(self, payload: AgentPlanStepPayload) -> dict[str, Any] | None:
        """Upsert plan step."""
        try:
            with self.db_base.get_session() as session:
                step = (
                    session.query(AgentPlanStep)
                    .filter(
                        col(AgentPlanStep.run_id) == payload.run_id,
                        col(AgentPlanStep.step_id) == payload.step_id,
                    )
                    .first()
                )
                if not step:
                    step = AgentPlanStep(
                        run_id=payload.run_id,
                        step_id=payload.step_id,
                        step_name=payload.step_name,
                        status=payload.status,
                        retry_count=payload.retry_count,
                        input_json=payload.input_json,
                        output_json=payload.output_json,
                        error=payload.error,
                        started_at=payload.started_at,
                        ended_at=payload.ended_at,
                        is_side_effect=payload.is_side_effect,
                        rollback_required=payload.rollback_required,
                    )
                    session.add(step)
                else:
                    step.step_name = payload.step_name
                    step.status = payload.status
                    step.retry_count = payload.retry_count
                    if payload.input_json is not None:
                        step.input_json = payload.input_json
                    if payload.output_json is not None:
                        step.output_json = payload.output_json
                    step.error = payload.error
                    if payload.started_at is not None:
                        step.started_at = payload.started_at
                    if payload.ended_at is not None:
                        step.ended_at = payload.ended_at
                    step.is_side_effect = payload.is_side_effect
                    step.rollback_required = payload.rollback_required
                    step.updated_at = get_utc_now()
                session.flush()
                return self._step_to_dict(step)
        except SQLAlchemyError as exc:
            logger.error(f"Failed to update plan step: {exc}")
            return None

    def list_steps(self, run_id: str) -> list[dict[str, Any]]:
        """List plan steps."""
        try:
            with self.db_base.get_session() as session:
                steps = (
                    session.query(AgentPlanStep)
                    .filter(col(AgentPlanStep.run_id) == run_id)
                    .order_by(col(AgentPlanStep.created_at).asc())
                    .all()
                )
                return [self._step_to_dict(step) for step in steps]
        except SQLAlchemyError as exc:
            logger.error(f"Failed to list plan steps: {exc}")
            return []

    def create_journal(self, payload: AgentPlanJournalPayload) -> dict[str, Any] | None:
        """Create rollback journal entry."""
        try:
            with self.db_base.get_session() as session:
                journal = AgentPlanJournal(
                    journal_id=payload.journal_id,
                    run_id=payload.run_id,
                    step_id=payload.step_id,
                    op_type=payload.op_type,
                    target_path=payload.target_path,
                    backup_path=payload.backup_path,
                    trash_path=payload.trash_path,
                    from_path=payload.from_path,
                    to_path=payload.to_path,
                    created_paths_json=payload.created_paths_json,
                    status=payload.status,
                    error=payload.error,
                )
                session.add(journal)
                session.flush()
                return self._journal_to_dict(journal)
        except SQLAlchemyError as exc:
            logger.error(f"Failed to create rollback journal: {exc}")
            return None

    def update_journal(self, journal_id: str, **fields: Any) -> bool:
        """Update rollback journal."""
        try:
            with self.db_base.get_session() as session:
                journal = session.query(AgentPlanJournal).filter_by(journal_id=journal_id).first()
                if not journal:
                    return False
                for key, value in fields.items():
                    if hasattr(journal, key):
                        setattr(journal, key, value)
                journal.updated_at = get_utc_now()
                session.flush()
                return True
        except SQLAlchemyError as exc:
            logger.error(f"Failed to update rollback journal: {exc}")
            return False

    def list_journals(self, run_id: str) -> list[dict[str, Any]]:
        """List rollback journals."""
        try:
            with self.db_base.get_session() as session:
                journals = (
                    session.query(AgentPlanJournal)
                    .filter(col(AgentPlanJournal.run_id) == run_id)
                    .order_by(col(AgentPlanJournal.created_at).asc())
                    .all()
                )
                return [self._journal_to_dict(journal) for journal in journals]
        except SQLAlchemyError as exc:
            logger.error(f"Failed to list rollback journals: {exc}")
            return []

    def _plan_to_dict(self, plan: AgentPlan) -> dict[str, Any]:
        return {
            "plan_id": plan.plan_id,
            "title": plan.title,
            "spec_json": plan.spec_json,
            "todo_id": plan.todo_id,
            "session_id": plan.session_id,
            "created_at": plan.created_at,
            "updated_at": plan.updated_at,
        }

    def _run_to_dict(self, run: AgentPlanRun) -> dict[str, Any]:
        return {
            "run_id": run.run_id,
            "plan_id": run.plan_id,
            "status": run.status,
            "session_id": run.session_id,
            "error": run.error,
            "rollback_status": run.rollback_status,
            "rollback_error": run.rollback_error,
            "started_at": run.started_at,
            "ended_at": run.ended_at,
            "cancel_requested": run.cancel_requested,
            "created_at": run.created_at,
            "updated_at": run.updated_at,
        }

    def _step_to_dict(self, step: AgentPlanStep) -> dict[str, Any]:
        return {
            "id": step.id,
            "run_id": step.run_id,
            "step_id": step.step_id,
            "step_name": step.step_name,
            "status": step.status,
            "retry_count": step.retry_count,
            "input_json": step.input_json,
            "output_json": step.output_json,
            "error": step.error,
            "started_at": step.started_at,
            "ended_at": step.ended_at,
            "is_side_effect": step.is_side_effect,
            "rollback_required": step.rollback_required,
            "created_at": step.created_at,
            "updated_at": step.updated_at,
        }

    def _journal_to_dict(self, journal: AgentPlanJournal) -> dict[str, Any]:
        return {
            "journal_id": journal.journal_id,
            "run_id": journal.run_id,
            "step_id": journal.step_id,
            "op_type": journal.op_type,
            "target_path": journal.target_path,
            "backup_path": journal.backup_path,
            "trash_path": journal.trash_path,
            "from_path": journal.from_path,
            "to_path": journal.to_path,
            "created_paths_json": journal.created_paths_json,
            "status": journal.status,
            "error": journal.error,
            "created_at": journal.created_at,
            "updated_at": journal.updated_at,
        }
