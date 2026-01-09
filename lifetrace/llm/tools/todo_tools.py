"""Todo管理工具实现"""

import json

from lifetrace.llm.llm_client import LLMClient
from lifetrace.llm.tools.base import Tool, ToolResult
from lifetrace.repositories.interfaces import IProjectRepository, ITodoRepository
from lifetrace.repositories.sql_project_repository import SqlProjectRepository
from lifetrace.repositories.sql_todo_repository import SqlTodoRepository
from lifetrace.services.project_service import ProjectService
from lifetrace.services.todo_service import TodoService
from lifetrace.storage.database import db_base
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


def _get_todo_service() -> TodoService:
    """获取TodoService实例（工具内部使用）"""
    todo_repo: ITodoRepository = SqlTodoRepository(db_base)
    return TodoService(todo_repo)


def _get_project_service() -> ProjectService:
    """获取ProjectService实例（工具内部使用）"""
    from lifetrace.repositories.interfaces import ITaskRepository
    from lifetrace.repositories.sql_task_repository import SqlTaskRepository

    project_repo: IProjectRepository = SqlProjectRepository(db_base)
    task_repo: ITaskRepository = SqlTaskRepository(db_base)
    return ProjectService(project_repo, task_repo)


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
        # 返回待确认信息，不直接执行
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
            todo_service = _get_todo_service()

            # 如果指定了todo_ids，按ID查询
            if todo_ids:
                todos = []
                for todo_id in todo_ids:
                    try:
                        todo = todo_service.get_todo(todo_id)
                        todos.append(todo)
                    except Exception as e:
                        logger.warning(f"[QueryTodoTool] 无法获取todo {todo_id}: {e}")
                        continue
            # 否则按状态查询（如果不指定status，查询所有状态需要分别查询）
            elif status:
                result = todo_service.list_todos(limit=limit, offset=0, status=status)
                todos = result.get("todos", [])
            else:
                # 查询所有状态的todo
                all_todos = []
                for st in ["active", "completed", "canceled", "draft"]:
                    result = todo_service.list_todos(limit=limit, offset=0, status=st)
                    all_todos.extend(result.get("todos", []))
                todos = all_todos[:limit]

            # 按关键词筛选
            if keyword:
                keyword_lower = keyword.lower()
                todos = [
                    t
                    for t in todos
                    if keyword_lower in t.name.lower()
                    or (t.description and keyword_lower in t.description.lower())
                ]

            if not todos:
                return ToolResult(
                    success=True,
                    content="未找到匹配的todo。",
                    metadata={"todos": [], "count": 0},
                )

            # 格式化结果
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
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[QueryTodoTool] 查询失败: {e}", exc_info=True)
            return ToolResult(
                success=False,
                content="",
                error=error_msg,
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
        # 先获取当前todo信息用于预览
        try:
            todo_service = _get_todo_service()
            current_todo = todo_service.get_todo(todo_id)
        except Exception:
            # 如果获取失败，仍然返回待确认信息
            current_todo = None

        # 构建更新参数（只包含非None的字段）
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

        # 构建预览消息
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
        # 先获取todo信息用于预览
        try:
            todo_service = _get_todo_service()
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


class QueryProjectTool(Tool):
    """查询项目工具（辅助工具）"""

    @property
    def name(self) -> str:
        return "query_project"

    @property
    def description(self) -> str:
        return (
            "根据项目名称查找project_id。"
            "用于create_todo时自动匹配项目，或在需要项目信息时使用。"
            "支持模糊匹配项目名称。"
        )

    @property
    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "project_name": {
                    "type": "string",
                    "description": "项目名称（支持模糊匹配）",
                },
                "status": {
                    "type": "string",
                    "enum": ["active", "archived", "completed"],
                    "description": "项目状态筛选，默认为active",
                },
            },
            "required": ["project_name"],
        }

    def execute(
        self,
        project_name: str,
        status: str = "active",
        **kwargs,
    ) -> ToolResult:
        """执行查询项目"""
        try:
            project_service = _get_project_service()

            # 获取所有项目
            result = project_service.list_projects(limit=100, offset=0, status=status)
            projects = result.projects

            # 模糊匹配项目名称
            project_name_lower = project_name.lower()
            matched_projects = [
                p
                for p in projects
                if project_name_lower in p.name.lower() or p.name.lower() in project_name_lower
            ]

            if not matched_projects:
                return ToolResult(
                    success=True,
                    content=f"未找到名称包含'{project_name}'的项目。",
                    metadata={"projects": [], "count": 0},
                )

            # 格式化结果
            project_list = []
            for project in matched_projects:
                project_info = f"- ID: {project.id} | 名称: {project.name} | 状态: {project.status}"
                if project.description:
                    project_info += f" | 描述: {project.description[:50]}"
                project_list.append(project_info)

            content = f"找到 {len(matched_projects)} 个项目：\n" + "\n".join(project_list)

            logger.info(
                f"[QueryProjectTool] 查询成功，找到 {len(matched_projects)} 个项目",
            )

            return ToolResult(
                success=True,
                content=content,
                metadata={
                    "projects": [
                        {
                            "id": p.id,
                            "name": p.name,
                            "status": p.status,
                            "description": p.description,
                        }
                        for p in matched_projects
                    ],
                    "count": len(matched_projects),
                },
            )
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[QueryProjectTool] 查询失败: {e}", exc_info=True)
            return ToolResult(
                success=False,
                content="",
                error=error_msg,
            )


class ClarifyTodoTool(Tool):
    """澄清Todo信息工具"""

    @property
    def name(self) -> str:
        return "clarify_todo"

    @property
    def description(self) -> str:
        return (
            "当用户要创建的todo信息不完整或模糊时，"
            "使用此工具生成澄清问题询问用户更多细节。"
            "例如：缺少项目信息、描述过于简单、需要拆解复杂任务等。"
            "此工具生成的问题会被返回给用户，等待用户回答。"
        )

    @property
    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "user_input": {
                    "type": "string",
                    "description": "用户的原始输入",
                },
                "missing_fields": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "缺失的字段列表，如['project_id', 'name']",
                },
            },
            "required": ["user_input", "missing_fields"],
        }

    def execute(
        self,
        user_input: str,
        missing_fields: list[str],
        **kwargs,
    ) -> ToolResult:
        """执行澄清Todo信息"""
        try:
            llm_client = LLMClient()
            if not llm_client.is_available():
                # 如果没有LLM，使用默认问题模板
                questions = self._generate_default_questions(missing_fields)
            else:
                # 使用LLM生成友好的澄清问题
                prompt = get_prompt("agent", "todo_clarification")
                if not prompt:
                    prompt = self._get_default_clarification_prompt()

                system_prompt = prompt
                user_prompt = (
                    f"用户的输入：{user_input}\n\n"
                    f"缺失的信息：{', '.join(missing_fields)}\n\n"
                    f"请生成友好、自然的问题来询问用户这些缺失的信息。"
                    f"问题应该简洁明了，易于理解。"
                )

                response = llm_client.client.chat.completions.create(
                    model=llm_client.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.7,
                    max_tokens=300,
                )

                questions = response.choices[0].message.content.strip()

            logger.info("[ClarifyTodoTool] 生成澄清问题成功")

            return ToolResult(
                success=True,
                content=questions,
                metadata={
                    "missing_fields": missing_fields,
                    "requires_user_input": True,  # 标记需要用户输入
                },
            )
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[ClarifyTodoTool] 执行失败: {e}", exc_info=True)
            return ToolResult(
                success=False,
                content="",
                error=error_msg,
            )

    def _generate_default_questions(self, missing_fields: list[str]) -> str:
        """生成默认问题模板"""
        question_map = {
            "project_id": "请问这个todo属于哪个项目？",
            "name": "请问这个todo的具体名称是什么？",
            "description": "请提供这个todo的详细描述。",
        }
        questions = []
        for field in missing_fields:
            if field in question_map:
                questions.append(question_map[field])
            else:
                questions.append(f"请问关于{field}的信息是什么？")

        return "\n".join([f"{i + 1}. {q}" for i, q in enumerate(questions)])

    def _get_default_clarification_prompt(self) -> str:
        """获取默认澄清提示词"""
        return """你是一个友好的助手，擅长通过提问来帮助用户完善待办事项的信息。
请根据用户的输入和缺失的字段，生成简洁、友好的问题来询问用户。
问题应该自然、易于理解，一次询问一个或几个相关的问题。
直接输出问题，不需要额外的说明。"""


class ExtractTodoTool(Tool):
    """提取Todo工具"""

    @property
    def name(self) -> str:
        return "extract_todo"

    @property
    def description(self) -> str:
        return (
            "从大段文本中提取潜在的todo事项。"
            "当用户输入了一堆文本，或从搜索结果中需要提取todo时使用。"
            "返回结构化的todo列表，可以批量创建。"
        )

    @property
    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "text": {
                    "type": "string",
                    "description": "需要提取的文本内容",
                },
            },
            "required": ["text"],
        }

    def execute(
        self,
        text: str,
        **kwargs,
    ) -> ToolResult:
        """执行提取Todo"""
        try:
            llm_client = LLMClient()
            if not llm_client.is_available():
                return ToolResult(
                    success=False,
                    content="",
                    error="LLM服务不可用，无法提取todo",
                )

            prompt = get_prompt("agent", "todo_extraction")
            if not prompt:
                prompt = self._get_default_extraction_prompt()

            system_prompt = prompt
            user_prompt = (
                f"请从以下文本中提取待办事项(todo)：\n\n{text}\n\n"
                f"请以JSON格式返回，每个todo包含name（必填）和description（可选）字段。"
                f"如果没有找到todo，返回空数组。"
            )

            response = llm_client.client.chat.completions.create(
                model=llm_client.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=1000,
            )

            result_text = response.choices[0].message.content.strip()

            # 解析JSON
            try:
                clean_text = result_text.strip()
                if clean_text.startswith("```json"):
                    clean_text = clean_text[7:]
                if clean_text.startswith("```"):
                    clean_text = clean_text[3:]
                if clean_text.endswith("```"):
                    clean_text = clean_text[:-3]
                clean_text = clean_text.strip()

                extracted_data = json.loads(clean_text)
                todos = extracted_data.get("todos", [])

                if not todos:
                    return ToolResult(
                        success=True,
                        content="未能从文本中提取到todo事项。",
                        metadata={"todos": [], "count": 0},
                    )

                # 格式化结果
                todo_list = []
                for i, todo in enumerate(todos, 1):
                    todo_info = f"{i}. {todo.get('name', '未命名')}"
                    if todo.get("description"):
                        todo_info += f"\n   描述: {todo.get('description')}"
                    todo_list.append(todo_info)

                content = f"从文本中提取到 {len(todos)} 个todo：\n" + "\n".join(todo_list)

                logger.info(f"[ExtractTodoTool] 提取成功，找到 {len(todos)} 个todo")

                # 返回待确认信息，不直接执行批量创建
                confirmation_data = {
                    "operation": "batch_create_todos",
                    "todos": todos,
                }

                return ToolResult(
                    success=True,
                    content=content,
                    metadata={
                        "todos": todos,
                        "count": len(todos),
                        "requires_confirmation": True,
                        "confirmation_data": confirmation_data,
                    },
                )
            except json.JSONDecodeError as e:
                logger.error(f"[ExtractTodoTool] JSON解析失败: {e}, 响应: {result_text}")
                return ToolResult(
                    success=False,
                    content="",
                    error=f"提取结果格式错误: {str(e)}",
                )
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[ExtractTodoTool] 提取失败: {e}", exc_info=True)
            return ToolResult(
                success=False,
                content="",
                error=error_msg,
            )

    def _get_default_extraction_prompt(self) -> str:
        """获取默认提取提示词"""
        return """你是一个专业的待办事项提取助手。
请从用户提供的文本中提取出所有待办事项(todo)。
每个todo应该包含：
- name: 待办名称（必填，简洁明确）
- description: 待办描述（可选，详细说明）

请以JSON格式返回：
{
  "todos": [
    {
      "name": "待办名称",
      "description": "待办描述（可选）"
    }
  ]
}

如果没有找到todo，返回 {"todos": []}。
只返回JSON，不要返回其他信息。"""


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
            todo_service = _get_todo_service()

            # 验证待办是否存在
            todos_info = []
            for todo_id in todo_ids:
                try:
                    todo = todo_service.get_todo(todo_id)
                    todos_info.append({"id": todo.id, "name": todo.name})
                except Exception as e:
                    logger.warning(f"[OrganizeTodosTool] 待办 {todo_id} 不存在: {e}")
                    return ToolResult(
                        success=False,
                        content="",
                        error=f"待办 ID {todo_id} 不存在",
                    )

            # 如果没有提供标题，使用LLM生成建议
            suggested_title = parent_title
            if not suggested_title:
                suggested_title = self._generate_parent_title(todos_info)

            # 构建确认数据
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

    def _generate_parent_title(self, todos_info: list[dict]) -> str:
        """使用LLM生成父任务标题建议"""
        try:
            llm_client = LLMClient()
            if not llm_client.is_available():
                # LLM不可用时，使用简单的默认标题
                return "待整理任务"

            # 构建提示词
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
            # 清理可能的引号
            title = title.strip('"').strip("'").strip()
            # 限制长度
            if len(title) > 20:
                title = title[:20]

            return title if title else "待整理任务"
        except Exception as e:
            logger.warning(f"[OrganizeTodosTool] LLM生成标题失败: {e}，使用默认标题")
            return "待整理任务"
