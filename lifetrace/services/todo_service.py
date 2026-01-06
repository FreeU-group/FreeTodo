"""Todo 业务逻辑层

处理 Todo 相关的业务逻辑，与数据访问层解耦。
"""

from typing import Any

from fastapi import HTTPException

from lifetrace.repositories.interfaces import ITodoRepository
from lifetrace.schemas.todo import (
    TodoCreate,
    TodoOrganizeResponse,
    TodoResponse,
    TodoUpdate,
)
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class TodoService:
    """Todo 业务逻辑层"""

    def __init__(self, repository: ITodoRepository):
        self.repository = repository

    def get_todo(self, todo_id: int) -> TodoResponse:
        """获取单个 Todo"""
        todo = self.repository.get_by_id(todo_id)
        if not todo:
            raise HTTPException(status_code=404, detail="todo 不存在")
        return TodoResponse(**todo)

    def list_todos(self, limit: int, offset: int, status: str | None) -> dict[str, Any]:
        """获取 Todo 列表"""
        todos = self.repository.list_todos(limit, offset, status)
        total = self.repository.count(status)
        return {"total": total, "todos": [TodoResponse(**t) for t in todos]}

    def create_todo(self, data: TodoCreate) -> TodoResponse:
        """创建 Todo"""
        todo_id = self.repository.create(
            name=data.name,
            description=data.description,
            user_notes=data.user_notes,
            parent_todo_id=data.parent_todo_id,
            deadline=data.deadline,
            start_time=data.start_time,
            status=data.status.value if data.status else "active",
            priority=data.priority.value if data.priority else "none",
            order=data.order,
            tags=data.tags,
            related_activities=data.related_activities,
        )
        if not todo_id:
            raise HTTPException(status_code=500, detail="创建 todo 失败")

        return self.get_todo(todo_id)

    def update_todo(self, todo_id: int, data: TodoUpdate) -> TodoResponse:
        """更新 Todo"""
        # 检查是否存在
        if not self.repository.get_by_id(todo_id):
            raise HTTPException(status_code=404, detail="todo 不存在")

        # 提取有效字段（只更新请求中携带的字段）
        fields_set = (
            getattr(data, "model_fields_set", None)
            or getattr(data, "__fields_set__", None)
            or set()
        )
        kwargs = {field: getattr(data, field) for field in fields_set}

        # 枚举转字符串
        if "status" in kwargs and kwargs["status"] is not None:
            kwargs["status"] = kwargs["status"].value
        if "priority" in kwargs and kwargs["priority"] is not None:
            kwargs["priority"] = kwargs["priority"].value

        if not self.repository.update(todo_id, **kwargs):
            raise HTTPException(status_code=500, detail="更新 todo 失败")

        return self.get_todo(todo_id)

    def delete_todo(self, todo_id: int) -> None:
        """删除 Todo"""
        if not self.repository.get_by_id(todo_id):
            raise HTTPException(status_code=404, detail="todo 不存在")
        if not self.repository.delete(todo_id):
            raise HTTPException(status_code=500, detail="删除 todo 失败")

    def reorder_todos(self, items: list[dict[str, Any]]) -> dict[str, Any]:
        """批量重排序 Todo"""
        if not self.repository.reorder(items):
            raise HTTPException(status_code=500, detail="批量重排序失败")
        return {"success": True, "message": f"成功更新 {len(items)} 个待办的排序"}

    def organize_todos(self, parent_title: str, todo_ids: list[int]) -> TodoOrganizeResponse:
        """
        整理待办：创建父任务并将多个待办移动到其下
        注意：如果选中的待办之间存在层级关系（父-子关系），这些关系会被维护。
        只有那些没有父任务，或者父任务不在选中列表中的待办，才会被设置为新父任务的子任务。

        Args:
            parent_title: 父任务标题
            todo_ids: 要整理的待办ID列表

        Returns:
            包含父任务信息和更新数量的字典
        """
        # 获取所有选中待办的详细信息（包括它们的parent_todo_id）
        selected_todos_map: dict[int, dict[str, Any]] = {}
        for todo_id in todo_ids:
            todo_data = self.repository.get_by_id(todo_id)
            if not todo_data:
                raise HTTPException(status_code=404, detail=f"待办 ID {todo_id} 不存在")
            selected_todos_map[todo_id] = todo_data

        # 构建选中待办ID集合，用于快速查找
        selected_ids_set = set(todo_ids)

        # 筛选出应该被设置为新父任务子任务的待办：
        # 1. 没有父任务的待办（parent_todo_id 为 None）
        # 2. 或者父任务不在选中列表中的待办
        todos_to_update: list[int] = []
        for todo_id, todo_data in selected_todos_map.items():
            parent_todo_id = todo_data.get("parent_todo_id")
            if parent_todo_id is None:
                # 没有父任务，应该被设置为新父任务的子任务
                todos_to_update.append(todo_id)
            elif parent_todo_id not in selected_ids_set:
                # 父任务不在选中列表中，应该被设置为新父任务的子任务
                todos_to_update.append(todo_id)
            # 如果 parent_todo_id 在 selected_ids_set 中，说明该待办的父任务也在选中列表中
            # 这种情况下，保持原有的父子关系，不更新该待办的 parent_todo_id

        if not todos_to_update:
            # 如果没有待办需要更新，说明所有选中的待办都已经有父任务，且父任务也在选中列表中
            # 这种情况下，仍然创建父任务，但不更新任何待办的parent_todo_id
            logger.info(
                "[TodoService] 选中的待办之间已存在层级关系，无需更新任何待办的父任务ID",
            )

        # 创建父任务
        parent_todo_id = self.repository.create(
            name=parent_title,
            description=None,
            user_notes=None,
            parent_todo_id=None,  # 父任务本身没有父任务
            deadline=None,
            start_time=None,
            status="active",
            priority="none",
            order=0,
            tags=[],
            related_activities=[],
        )

        if not parent_todo_id:
            raise HTTPException(status_code=500, detail="创建父任务失败")

        # 只更新那些应该被设置为新父任务子任务的待办
        updated_count = 0
        for todo_id in todos_to_update:
            if self.repository.update(todo_id, parent_todo_id=parent_todo_id):
                updated_count += 1
            else:
                logger.warning(f"[TodoService] 更新待办 {todo_id} 的父任务ID失败")

        if todos_to_update and updated_count != len(todos_to_update):
            raise HTTPException(
                status_code=500,
                detail=f"部分待办更新失败：成功更新 {updated_count}/{len(todos_to_update)} 个待办",
            )

        # 获取创建的父任务
        parent_todo = self.get_todo(parent_todo_id)

        preserved_count = len(todo_ids) - len(todos_to_update)
        logger.info(
            f"[TodoService] 成功创建父任务 {parent_todo_id} ({parent_title})，"
            f"更新了 {updated_count} 个待办的父任务ID，"
            f"保留了 {preserved_count} 个待办的原有层级关系",
        )

        return TodoOrganizeResponse(
            parent_todo=parent_todo,
            updated_count=updated_count,
        )
