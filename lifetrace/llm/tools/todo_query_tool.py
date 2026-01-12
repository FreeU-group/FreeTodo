"""Todo查询工具"""

from lifetrace.llm.tools.base import Tool, ToolResult
from lifetrace.llm.tools.todo_tools_common import get_todo_service
from lifetrace.services.todo_service import TodoService
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class QueryTodoTool(Tool):
    """查询Todo工具"""

    @property
    def name(self) -> str:
        return "query_todo"

    @property
    def description(self) -> str:
        return (
            "查询现有的待办事项。"
            "当用户询问todo列表、查找特定todo时使用。"
            "支持按状态、关键词、ID等条件查询。"
            "如果不指定状态，默认查询所有状态的todo（包括active、completed、canceled、draft）。"
        )

    @property
    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["active", "completed", "canceled", "draft"],
                    "description": "状态筛选（可选），如果不指定则查询所有状态",
                },
                "keyword": {
                    "type": "string",
                    "description": "关键词搜索（可选），在name/description中搜索",
                },
                "todo_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "按ID查询（可选），指定要查询的todo ID列表，如果提供此参数，将优先按ID查询",
                },
                "limit": {
                    "type": "integer",
                    "default": 100,
                    "description": "返回数量限制，默认100（查询所有todo时建议使用较大值）",
                },
            },
        }

    def execute(
        self,
        status: str | None = None,
        keyword: str | None = None,
        todo_ids: list[int] | None = None,
        limit: int = 100,
        **kwargs,
    ) -> ToolResult:
        """执行查询Todo"""
        try:
            todo_service = get_todo_service()
            todos = self._fetch_todos(todo_service, status, todo_ids, limit)
            todos = self._filter_by_keyword(todos, keyword)
            return self._format_query_result(todos, limit)
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[QueryTodoTool] 查询失败: {e}", exc_info=True)
            return ToolResult(
                success=False,
                content="",
                error=error_msg,
            )

    def _fetch_todos(
        self,
        todo_service: TodoService,
        status: str | None,
        todo_ids: list[int] | None,
        limit: int,
    ) -> list:
        """获取待办列表"""
        if todo_ids:
            return self._query_by_ids(todo_service, todo_ids)
        if status:
            return self._query_by_status(todo_service, status, limit)
        return self._query_all_statuses(todo_service, limit)

    def _query_by_ids(self, todo_service: TodoService, todo_ids: list[int]) -> list:
        """按ID查询"""
        todos = []
        for todo_id in todo_ids:
            try:
                todo = todo_service.get_todo(todo_id)
                todos.append(todo)
            except Exception as e:
                logger.warning(f"[QueryTodoTool] 无法获取todo {todo_id}: {e}")
                continue
        return todos

    def _query_by_status(self, todo_service: TodoService, status: str, limit: int) -> list:
        """按状态查询"""
        result = todo_service.list_todos(limit=limit, offset=0, status=status)
        return result.get("todos", [])

    def _query_all_statuses(self, todo_service: TodoService, limit: int) -> list:
        """查询所有状态"""
        all_todos = []
        for st in ["active", "completed", "canceled", "draft"]:
            result = todo_service.list_todos(limit=limit, offset=0, status=st)
            all_todos.extend(result.get("todos", []))
        return all_todos[:limit]

    def _filter_by_keyword(self, todos: list, keyword: str | None) -> list:
        """按关键词筛选"""
        if not keyword:
            return todos
        keyword_lower = keyword.lower()
        return [
            t
            for t in todos
            if keyword_lower in t.name.lower()
            or (t.description and keyword_lower in t.description.lower())
        ]

    def _format_query_result(self, todos: list, limit: int) -> ToolResult:
        """格式化查询结果"""
        if not todos:
            return ToolResult(
                success=True,
                content="未找到匹配的todo。",
                metadata={"todos": [], "count": 0},
            )

        todo_list = []
        for todo in todos[:limit]:
            todo_info = f"- ID: {todo.id} | 名称: {todo.name} | 状态: {todo.status}"
            if todo.description:
                todo_info += f" | 描述: {todo.description[:50]}"
            todo_list.append(todo_info)

        content = f"找到 {len(todos)} 个todo：\n" + "\n".join(todo_list)
        logger.info(f"[QueryTodoTool] 查询成功，找到 {len(todos)} 个todo")

        return ToolResult(
            success=True,
            content=content,
            metadata={
                "todos": [
                    {
                        "id": t.id,
                        "name": t.name,
                        "status": t.status,
                        "description": t.description,
                    }
                    for t in todos[:limit]
                ],
                "count": len(todos),
            },
        )
