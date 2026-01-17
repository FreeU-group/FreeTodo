"""Todo提取和澄清工具"""

import json

from lifetrace.llm.llm_client import LLMClient
from lifetrace.llm.tools.base import Tool, ToolResult
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


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
                questions = self._generate_default_questions(missing_fields)
            else:
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
                    "requires_user_input": True,
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

            result_text = self._call_llm_for_extraction(llm_client, text)
            todos = self._parse_extraction_result(result_text)
            return self._format_extraction_results(todos)
        except Exception as e:
            error_msg = str(e)
            logger.error(f"[ExtractTodoTool] 提取失败: {e}", exc_info=True)
            return ToolResult(
                success=False,
                content="",
                error=error_msg,
            )

    def _call_llm_for_extraction(self, llm_client: LLMClient, text: str) -> str:
        """调用LLM提取待办"""
        prompt = get_prompt("agent", "todo_extraction")
        if not prompt:
            prompt = self._get_default_extraction_prompt()

        system_prompt = prompt
        user_prompt = (
            f"请从以下文本中提取待办事项(todo)：\n\n{text}\n\n"
            f"请以JSON格式返回，每个todo包含name（必填）、description（可选）和parent_name（可选）字段。"
            f"如果文本中包含多个相关任务，应该全部提取出来，并识别主任务和子任务的层级关系。"
            f"如果没有找到todo，返回空数组。"
        )

        response = llm_client.client.chat.completions.create(
            model=llm_client.model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=2000,  # 增加token限制，支持提取多个任务
        )

        return response.choices[0].message.content.strip()

    def _parse_extraction_result(self, result_text: str) -> list:
        """解析提取结果"""
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
            return extracted_data.get("todos", [])
        except json.JSONDecodeError as e:
            logger.error(f"[ExtractTodoTool] JSON解析失败: {e}, 响应: {result_text}")
            raise ValueError(f"提取结果格式错误: {str(e)}") from e

    def _format_extraction_results(self, todos: list) -> ToolResult:
        """格式化提取结果"""
        if not todos:
            return ToolResult(
                success=True,
                content="未能从文本中提取到todo事项。",
                metadata={"todos": [], "count": 0},
            )

        todo_list = []
        for i, todo in enumerate(todos, 1):
            todo_info = f"{i}. {todo.get('name', '未命名')}"
            if todo.get("description"):
                todo_info += f"\n   描述: {todo.get('description')}"
            if todo.get("parent_name"):
                todo_info += f"\n   父任务: {todo.get('parent_name')}"
            todo_list.append(todo_info)

        content = f"从文本中提取到 {len(todos)} 个todo：\n" + "\n".join(todo_list)
        logger.info(f"[ExtractTodoTool] 提取成功，找到 {len(todos)} 个todo")

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

    def _get_default_extraction_prompt(self) -> str:
        """获取默认提取提示词"""
        return """你是一个专业的待办事项提取助手。
请从用户提供的文本中提取出所有待办事项(todo)。

**要求：**
- 每个todo应该包含：name（必填，简洁明确）和description（可选，详细说明）
- 只提取明确的、可执行的待办事项
- 如果文本中包含多个todo，全部提取出来
- **如果任务有层级关系，使用 parent_name 字段表示父任务名称**
- **当文本中提到主任务和子任务时，应该组织成层级结构**

**请以JSON格式返回：**
{
  "todos": [
    {
      "name": "待办名称（简洁明确）",
      "description": "待办描述（可选，详细说明）",
      "parent_name": "父任务名称（可选，如果该待办是某个任务的子任务）"
    }
  ]
}

**层级任务示例：**
如果文本提到"学习新技能"作为主任务，包含"阅读相关书籍"、"完成实践项目"等子任务，应该这样组织：
{
  "todos": [
    {
      "name": "学习新技能",
      "description": "整体学习计划",
      "parent_name": null
    },
    {
      "name": "阅读相关书籍",
      "description": "阅读基础理论书籍",
      "parent_name": "学习新技能"
    },
    {
      "name": "完成实践项目",
      "description": "通过实际项目巩固知识",
      "parent_name": "学习新技能"
    }
  ]
}

**注意：**
- 如果文本中没有明确的层级关系，所有待办的 parent_name 都应该是 null
- parent_name 必须与某个待办的 name 完全匹配
- 一个待办最多只能有一个父任务

如果没有找到todo，返回 {"todos": []}。
只返回JSON，不要返回其他信息。"""
