"""Todo整理工具"""

from lifetrace.llm.llm_client import LLMClient
from lifetrace.llm.tools.base import Tool, ToolResult
from lifetrace.llm.tools.todo_tools_common import MAX_TITLE_LENGTH, get_todo_service
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class OrganizeTodosTool(Tool):
    """整理待办工具 - 将多个待办整理到父任务下"""

    @property
    def name(self) -> str:
        return "organize_todos"

    @property
    def description(self) -> str:
        return (
            "将多个待办整理到一个父任务下。"
            "当用户要求整理多个待办、创建父任务、归类待办时使用此工具。"
            "需要提供待办ID列表，父任务标题可以自动生成或由用户提供。"
        )

    @property
    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "todo_ids": {
                    "type": "array",
                    "items": {"type": "integer"},
                    "description": "要整理的待办ID列表",
                },
                "parent_title": {
                    "type": "string",
                    "description": "父任务标题（可选，如果不提供则自动生成）",
                },
            },
            "required": ["todo_ids"],
        }

    def execute(
        self,
        todo_ids: list[int],
        parent_title: str | None = None,
        **kwargs,
    ) -> ToolResult:
        """执行整理待办"""
        try:
            todo_service = get_todo_service()

            todos_info = self._validate_todos(todo_service, todo_ids)
            if not todos_info:
                return ToolResult(
                    success=False,
                    content="",
                    error="无法验证待办信息",
                )

            suggested_title = parent_title or self._generate_parent_title(todos_info)

            confirmation_data = {
                "operation": "organize_todos",
                "todo_ids": todo_ids,
                "todos": todos_info,
                "parent_title": suggested_title,
            }

            preview_message = (
                f"准备将以下 {len(todos_info)} 个待办整理到父任务下：\n"
                + "\n".join([f"- ID: {t['id']} | 名称: {t['name']}" for t in todos_info])
                + f"\n\n父任务标题：{suggested_title}"
            )

            logger.info(
                f"[OrganizeTodosTool] 准备整理 {len(todos_info)} 个待办，父任务标题: {suggested_title}",
            )

            return ToolResult(
                success=True,
                content=preview_message,
                metadata={
                    "requires_confirmation": True,
                    "confirmation_data": confirmation_data,
                },
            )
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[OrganizeTodosTool] 整理失败: {e}", exc_info=True)
            return ToolResult(
                success=False,
                content="",
                error=error_msg,
            )

    def _validate_todos(self, todo_service, todo_ids: list[int]) -> list[dict] | None:
        """验证待办是否存在"""
        todos_info = []
        for todo_id in todo_ids:
            try:
                todo = todo_service.get_todo(todo_id)
                todos_info.append({"id": todo.id, "name": todo.name})
            except Exception as e:
                logger.warning(f"[OrganizeTodosTool] 待办 {todo_id} 不存在: {e}")
                return None
        return todos_info

    def _generate_parent_title(self, todos_info: list[dict]) -> str:
        """使用LLM生成父任务标题建议"""
        try:
            llm_client = LLMClient()
            if not llm_client.is_available():
                return "待整理任务"

            todo_names = [t["name"] for t in todos_info]
            todo_names_text = "\n".join([f"- {name}" for name in todo_names])

            prompt = f"""请为以下待办事项生成一个简洁的父任务标题。

待办事项列表：
{todo_names_text}

要求：
1. 标题要简洁，2-10个字符
2. 能够概括这些待办的共同主题
3. 使用中文
4. 只返回标题文本，不要返回其他说明

例如：
- "代码开发任务"
- "项目管理相关"
- "学习计划"
- "日常工作"

标题："""

            response = llm_client.client.chat.completions.create(
                model=llm_client.model,
                messages=[
                    {"role": "system", "content": "你是一个专业的任务分类助手。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=50,
            )

            title = response.choices[0].message.content.strip()
            title = title.strip('"').strip("'").strip()
            if len(title) > MAX_TITLE_LENGTH:
                title = title[:MAX_TITLE_LENGTH]

            return title if title else "待整理任务"
        except Exception as e:
            logger.warning(f"[OrganizeTodosTool] LLM生成标题失败: {e}，使用默认标题")
            return "待整理任务"
