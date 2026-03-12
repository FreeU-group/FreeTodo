"""Plan side effects: tool execution and rollback helpers."""

from __future__ import annotations

import json
import shutil
import uuid
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from storage.agent_plan_manager import AgentPlanJournalPayload, AgentPlanManager
from util.logging_config import get_logger
from util.time_utils import get_utc_now

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable

    from repositories.sql_todo_repository import SqlTodoRepository

logger = get_logger()


@dataclass(frozen=True)
class CompletedStep:
    step_id: str
    completed_at: float


class PlanActionExecutor:
    """Handle tool execution and rollback journaling."""

    def __init__(
        self,
        plan_manager: AgentPlanManager,
        todo_repo: SqlTodoRepository,
        workspace_path: str | None = None,
    ) -> None:
        self.plan_manager = plan_manager
        self.todo_repo = todo_repo
        self.workspace_path = Path(workspace_path) if workspace_path else None

    def execute_tool(self, step, run_id: str) -> dict[str, Any]:
        tool_name = step.tool or ""
        handler = self._tool_handlers().get(tool_name)
        if not handler:
            raise ValueError(f"tool not found: {tool_name}")
        return handler(step.inputs, run_id, step.step_id)

    def is_side_effect(self, step) -> bool:
        if step.is_side_effect is not None:
            return step.is_side_effect
        if step.type != "tool":
            return False
        return step.tool in {
            "create_todo",
            "update_todo",
            "delete_todo",
            "write_file",
            "delete_file",
            "move_file",
        }

    def requires_rollback(self, step) -> bool:
        if step.type != "tool":
            return False
        return step.tool in {"write_file", "delete_file", "move_file"}

    async def rollback(
        self,
        run_id: str,
        completed_steps: Iterable[CompletedStep],
        emit: Callable[[dict[str, Any]], Any],
    ) -> None:
        completed = list(completed_steps)
        if not completed:
            return

        self.plan_manager.update_run(run_id, rollback_status="running")
        await emit(
            {
                "type": "rollback_started",
                "run_id": run_id,
                "timestamp": get_utc_now().isoformat(),
            }
        )

        journals = self.plan_manager.list_journals(run_id)
        journals_by_step: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for journal in journals:
            journals_by_step[journal["step_id"]].append(journal)

        for step in sorted(completed, key=lambda s: s.completed_at, reverse=True):
            step_journals = journals_by_step.get(step.step_id, [])
            if not step_journals:
                continue
            await emit(
                {
                    "type": "step_rollback_started",
                    "run_id": run_id,
                    "step_id": step.step_id,
                }
            )

            for journal in step_journals:
                try:
                    self._execute_rollback(journal)
                    self.plan_manager.update_journal(journal["journal_id"], status="rolled_back")
                except Exception as exc:
                    self.plan_manager.update_journal(
                        journal["journal_id"], status="failed", error=str(exc)
                    )
                    logger.error(f"Rollback failed: {exc}")

            await emit(
                {
                    "type": "step_rollback_completed",
                    "run_id": run_id,
                    "step_id": step.step_id,
                }
            )

        self.plan_manager.update_run(run_id, rollback_status="completed")
        await emit(
            {
                "type": "rollback_completed",
                "run_id": run_id,
                "timestamp": get_utc_now().isoformat(),
            }
        )

    def _tool_handlers(self):
        return {
            "list_todos": self._tool_list_todos,
            "create_todo": self._tool_create_todo,
            "update_todo": self._tool_update_todo,
            "delete_todo": self._tool_delete_todo,
            "write_file": self._tool_write_file,
            "delete_file": self._tool_delete_file,
            "move_file": self._tool_move_file,
        }

    def _tool_list_todos(self, inputs: dict[str, Any], *_args) -> dict[str, Any]:
        status = inputs.get("status")
        limit = int(inputs.get("limit", 50))
        offset = int(inputs.get("offset", 0))
        todos = self.todo_repo.list_todos(limit=limit, offset=offset, status=status)
        return {"todos": todos}

    def _tool_create_todo(self, inputs: dict[str, Any], *_args) -> dict[str, Any]:
        todo_id = self.todo_repo.create(**inputs)
        if todo_id is None:
            raise RuntimeError("create_todo failed")
        return {"todo_id": todo_id}

    def _tool_update_todo(self, inputs: dict[str, Any], *_args) -> dict[str, Any]:
        todo_id = inputs.get("todo_id") or inputs.get("id")
        if not todo_id:
            raise ValueError("todo_id required")
        payload = dict(inputs)
        payload.pop("todo_id", None)
        payload.pop("id", None)
        ok = self.todo_repo.update(todo_id, **payload)
        if not ok:
            raise RuntimeError("update_todo failed")
        return {"updated": True}

    def _tool_delete_todo(self, inputs: dict[str, Any], *_args) -> dict[str, Any]:
        todo_id = inputs.get("todo_id") or inputs.get("id")
        if not todo_id:
            raise ValueError("todo_id required")
        ok = self.todo_repo.delete(int(todo_id))
        if not ok:
            raise RuntimeError("delete_todo failed")
        return {"deleted": True}

    def _tool_write_file(self, inputs: dict[str, Any], run_id: str, step_id: str) -> dict[str, Any]:
        target_path = self._resolve_path(inputs.get("path"))
        if not target_path:
            raise ValueError("path required")
        content = inputs.get("content", "")

        journal_id = self._prepare_write_journal(run_id, step_id, target_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(content, encoding="utf-8")
        self.plan_manager.update_journal(journal_id, status="applied")
        return {"path": str(target_path)}

    def _tool_delete_file(
        self, inputs: dict[str, Any], run_id: str, step_id: str
    ) -> dict[str, Any]:
        target_path = self._resolve_path(inputs.get("path"))
        if not target_path:
            raise ValueError("path required")
        if not target_path.exists():
            raise FileNotFoundError(str(target_path))

        journal_id, trash_path = self._prepare_delete_journal(run_id, step_id, target_path)
        trash_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(target_path), str(trash_path))
        self.plan_manager.update_journal(journal_id, status="applied")
        return {"path": str(target_path)}

    def _tool_move_file(self, inputs: dict[str, Any], run_id: str, step_id: str) -> dict[str, Any]:
        from_path = self._resolve_path(inputs.get("from_path"))
        to_path = self._resolve_path(inputs.get("to_path"))
        if not from_path or not to_path:
            raise ValueError("from_path/to_path required")
        if not from_path.exists():
            raise FileNotFoundError(str(from_path))

        journal_id = self._prepare_move_journal(run_id, step_id, from_path, to_path)
        to_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(from_path), str(to_path))
        self.plan_manager.update_journal(journal_id, status="applied")
        return {"from": str(from_path), "to": str(to_path)}

    def _execute_rollback(self, journal: dict[str, Any]) -> None:
        op_type = journal["op_type"]
        if op_type == "write":
            self._rollback_write(journal)
        elif op_type == "delete":
            self._rollback_delete(journal)
        elif op_type == "move":
            self._rollback_move(journal)
        else:
            raise ValueError(f"unsupported rollback op: {op_type}")

    def _rollback_write(self, journal: dict[str, Any]) -> None:
        target_path = journal.get("target_path")
        backup_path = journal.get("backup_path")
        created_paths = json.loads(journal.get("created_paths_json") or "[]")
        if backup_path and target_path:
            shutil.copy2(backup_path, target_path)
        else:
            for created in created_paths:
                path = Path(created)
                if path.exists():
                    if path.is_dir():
                        shutil.rmtree(path)
                    else:
                        path.unlink()

    def _rollback_delete(self, journal: dict[str, Any]) -> None:
        target_path = journal.get("target_path")
        trash_path = journal.get("trash_path")
        if not target_path or not trash_path:
            return
        Path(target_path).parent.mkdir(parents=True, exist_ok=True)
        shutil.move(trash_path, target_path)

    def _rollback_move(self, journal: dict[str, Any]) -> None:
        from_path = journal.get("from_path")
        to_path = journal.get("to_path")
        if not from_path or not to_path:
            return
        Path(from_path).parent.mkdir(parents=True, exist_ok=True)
        shutil.move(to_path, from_path)

    def _prepare_write_journal(self, run_id: str, step_id: str, target_path: Path) -> str:
        backup_dir = self._rollback_base_dir(run_id) / "files"
        backup_path = None
        created_paths = []
        if target_path.exists():
            backup_dir.mkdir(parents=True, exist_ok=True)
            backup_path = backup_dir / f"{uuid.uuid4().hex}_{target_path.name}"
            shutil.copy2(target_path, backup_path)
        else:
            created_paths.append(str(target_path))
        journal_id = f"jrnl_{uuid.uuid4().hex[:12]}"
        self.plan_manager.create_journal(
            AgentPlanJournalPayload(
                journal_id=journal_id,
                run_id=run_id,
                step_id=step_id,
                op_type="write",
                target_path=str(target_path),
                backup_path=str(backup_path) if backup_path else None,
                created_paths_json=json.dumps(created_paths) if created_paths else None,
                status="prepared",
            )
        )
        return journal_id

    def _prepare_delete_journal(
        self, run_id: str, step_id: str, target_path: Path
    ) -> tuple[str, Path]:
        trash_dir = self._rollback_base_dir(run_id) / "trash"
        trash_path = trash_dir / f"{uuid.uuid4().hex}_{target_path.name}"
        journal_id = f"jrnl_{uuid.uuid4().hex[:12]}"
        self.plan_manager.create_journal(
            AgentPlanJournalPayload(
                journal_id=journal_id,
                run_id=run_id,
                step_id=step_id,
                op_type="delete",
                target_path=str(target_path),
                trash_path=str(trash_path),
                status="prepared",
            )
        )
        return journal_id, trash_path

    def _prepare_move_journal(
        self, run_id: str, step_id: str, from_path: Path, to_path: Path
    ) -> str:
        journal_id = f"jrnl_{uuid.uuid4().hex[:12]}"
        self.plan_manager.create_journal(
            AgentPlanJournalPayload(
                journal_id=journal_id,
                run_id=run_id,
                step_id=step_id,
                op_type="move",
                from_path=str(from_path),
                to_path=str(to_path),
                status="prepared",
            )
        )
        return journal_id

    def _rollback_base_dir(self, run_id: str) -> Path:
        base_dir = self.workspace_path or Path.cwd()
        return base_dir / ".agno" / "rollback" / run_id

    def _resolve_path(self, raw_path: str | None) -> Path | None:
        if not raw_path:
            return None
        path = Path(raw_path)
        if not path.is_absolute():
            base = self.workspace_path or Path.cwd()
            path = base / path
        return path
