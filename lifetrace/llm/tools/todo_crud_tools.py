"""Todo CRUD工具 - 创建、更新、删除"""

from lifetrace.llm.tools.base import Tool, ToolResult
from lifetrace.llm.tools.todo_tools_common import get_todo_service
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class CreateTodoTool(Tool):
    """创建Todo工具"""

    @property
    def name(self) -> str:
        return "create_todo"

    @property
    def description(self) -> str:
        return (
            "创建新的待办事项(todo)。"
            "当用户要求添加todo、创建待办时使用此工具。"
            "Todo不关联项目，只需提供名称即可创建。"
        )

    @property
    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Todo的名称/标题（必填）",
                },
                "description": {
                    "type": "string",
                    "description": "Todo的详细描述（可选）",
                },
                "status": {
                    "type": "string",
                    "enum": ["active", "completed", "canceled", "draft"],
                    "description": "初始状态，默认为active",
                },
                "priority": {
                    "type": "string",
                    "enum": ["high", "medium", "low", "none"],
                    "description": "优先级，默认为none",
                },
            },
            "required": ["name"],
        }

    def execute(
        self,
        name: str,
        description: str | None = None,
        status: str = "active",
        priority: str = "none",
        **kwargs,
    ) -> ToolResult:
        """执行创建Todo - 返回待确认信息"""
        confirmation_data = {
            "operation": "create_todo",
            "params": {
                "name": name,
                "description": description,
                "status": status,
                "priority": priority,
            },
        }

        preview_message = f"准备创建Todo：\n- 名称: {name}\n- 状态: {status}\n- 优先级: {priority}"
        if description:
            preview_message += f"\n- 描述: {description}"

        logger.info(f"[CreateTodoTool] 准备创建Todo，等待用户确认: {name}")

        return ToolResult(
            success=True,
            content=preview_message,
            metadata={
                "requires_confirmation": True,
                "confirmation_data": confirmation_data,
            },
        )


class UpdateTodoTool(Tool):
    """更新Todo工具"""

    @property
    def name(self) -> str:
        return "update_todo"

    @property
    def description(self) -> str:
        return "更新现有todo的信息。当用户要求修改todo名称、描述、状态时使用。需要提供todo_id。"

    @property
    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "todo_id": {
                    "type": "integer",
                    "description": "待办ID",
                },
                "name": {
                    "type": "string",
                    "description": "新名称（可选）",
                },
                "description": {
                    "type": "string",
                    "description": "新描述（可选）",
                },
                "status": {
                    "type": "string",
                    "enum": ["active", "completed", "canceled", "draft"],
                    "description": "新状态（可选）",
                },
                "priority": {
                    "type": "string",
                    "enum": ["high", "medium", "low", "none"],
                    "description": "新优先级（可选）",
                },
            },
            "required": ["todo_id"],
        }

    def execute(
        self,
        todo_id: int,
        name: str | None = None,
        description: str | None = None,
        status: str | None = None,
        priority: str | None = None,
        **kwargs,
    ) -> ToolResult:
        """执行更新Todo - 返回待确认信息"""
        try:
            todo_service = get_todo_service()
            current_todo = todo_service.get_todo(todo_id)
        except Exception:
            current_todo = None

        update_params = {}
        if name is not None:
            update_params["name"] = name
        if description is not None:
            update_params["description"] = description
        if status is not None:
            update_params["status"] = status
        if priority is not None:
            update_params["priority"] = priority

        confirmation_data = {
            "operation": "update_todo",
            "todo_id": todo_id,
            "params": update_params,
        }

        changes = []
        if name is not None:
            changes.append(f"名称: {current_todo.name if current_todo else '未知'} → {name}")
        if description is not None:
            changes.append("描述: 更新")
        if status is not None:
            old_status = current_todo.status if current_todo else "未知"
            changes.append(f"状态: {old_status} → {status}")
        if priority is not None:
            old_priority = current_todo.priority if current_todo else "未知"
            changes.append(f"优先级: {old_priority} → {priority}")

        preview_message = f"准备更新Todo (ID: {todo_id})：\n" + "\n".join(
            [f"- {c}" for c in changes]
        )

        logger.info(f"[UpdateTodoTool] 准备更新Todo，等待用户确认: {todo_id}")

        return ToolResult(
            success=True,
            content=preview_message,
            metadata={
                "requires_confirmation": True,
                "confirmation_data": confirmation_data,
            },
        )


class DeleteTodoTool(Tool):
    """删除Todo工具"""

    @property
    def name(self) -> str:
        return "delete_todo"

    @property
    def description(self) -> str:
        return "删除指定的待办事项。当用户明确要求删除todo时使用。需要提供todo_id。"

    @property
    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "todo_id": {
                    "type": "integer",
                    "description": "待办ID",
                },
            },
            "required": ["todo_id"],
        }

    def execute(self, todo_id: int, **kwargs) -> ToolResult:
        """执行删除Todo - 返回待确认信息"""
        try:
            todo_service = get_todo_service()
            todo = todo_service.get_todo(todo_id)
            todo_name = todo.name
        except Exception:
            todo_name = "未知"

        confirmation_data = {
            "operation": "delete_todo",
            "todo_id": todo_id,
        }

        preview_message = f"准备删除Todo：\n- 名称: {todo_name}\n- ID: {todo_id}"

        logger.info(f"[DeleteTodoTool] 准备删除Todo，等待用户确认: {todo_id}")

        return ToolResult(
            success=True,
            content=preview_message,
            metadata={
                "requires_confirmation": True,
                "confirmation_data": confirmation_data,
            },
        )
