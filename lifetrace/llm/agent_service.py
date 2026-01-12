"""Agent 服务，管理工具调用工作流"""

import json
from collections.abc import Generator
from typing import Any

# 导入工具模块以触发工具注册
from lifetrace.llm import tools  # noqa: F401
from lifetrace.llm.agent_batch_delete import (
    build_batch_delete_confirmation,
    detect_batch_delete_scenario,
    extract_todo_name_from_context,
)
from lifetrace.llm.agent_response_generator import generate_final_response
from lifetrace.llm.agent_task_evaluation import evaluate_task_completion
from lifetrace.llm.agent_tool_decision import (
    build_tool_decision_messages,
    call_llm_for_tool_selection,
)
from lifetrace.llm.agent_tool_formatter import format_tool_result
from lifetrace.llm.llm_client import LLMClient
from lifetrace.llm.tools.base import ToolResult
from lifetrace.llm.tools.registry import ToolRegistry
from lifetrace.util.language import get_language_instruction
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


class AgentService:
    """Agent 服务，管理工具调用工作流"""

    MAX_TOOL_CALLS = 5  # 最大工具调用次数
    MAX_ITERATIONS = 10  # 最大迭代次数

    def __init__(self):
        """初始化 Agent 服务"""
        self.llm_client = LLMClient()
        # 使用单例模式的工具注册表（工具已在 tools/__init__.py 中注册）
        self.tool_registry = ToolRegistry()

    def stream_agent_response(
        self,
        user_query: str,
        todo_context: str | None = None,
        conversation_history: list[dict] | None = None,
        lang: str = "zh",
    ) -> Generator[str]:
        """
        流式生成 Agent 回答

        工作流：
        1. 工具选择：LLM 判断是否需要工具
        2. 工具执行：执行选中的工具
        3. 任务评估：LLM 评估任务是否完成
        4. 循环控制：如果未完成，重新进入工具选择
        """
        tool_call_count = 0
        iteration_count = 0
        accumulated_context = []

        # 批量删除状态跟踪
        batch_delete_mode = False
        batch_delete_todo_ids = []
        batch_delete_results = []

        # 构建初始消息
        messages = self._build_initial_messages(
            user_query,
            todo_context,
            conversation_history,
            lang,
        )

        # 检测批量删除场景
        batch_delete_mode, batch_delete_todo_ids = detect_batch_delete_scenario(
            user_query, todo_context
        )

        # 如果是批量删除场景，直接生成确认面板
        if batch_delete_mode:
            yield from self._handle_initial_batch_delete(batch_delete_todo_ids, todo_context)
            return

        # 主循环：工具选择 -> 工具执行 -> 任务评估
        while iteration_count < self.MAX_ITERATIONS:
            iteration_count += 1
            logger.info(f"[Agent] 迭代 {iteration_count}/{self.MAX_ITERATIONS}")

            # 步骤1: 工具选择
            tool_decision = self._decide_tool_usage(
                messages,
                tool_call_count,
                batch_delete_mode,
                batch_delete_results,
                batch_delete_todo_ids,
            )

            if not tool_decision["use_tool"]:
                logger.info("[Agent] 不需要工具，直接生成回答")
                break

            # 步骤2: 执行工具
            if tool_call_count >= self.MAX_TOOL_CALLS:
                yield "\n[提示] 已达到最大工具调用次数限制，将基于已有信息生成回答。\n\n"
                break

            tool_name = tool_decision["tool_name"]
            tool_params = tool_decision.get("tool_params", {})

            # 显示工具调用标记
            yield from self._yield_tool_call_marker(tool_name, tool_params)

            tool_result = self._execute_tool(tool_name, tool_params)
            tool_call_count += 1

            # 检查是否是clarify_todo工具，如果是且成功，直接返回结果
            if tool_name == "clarify_todo" and tool_result.success:
                logger.info("[Agent] clarify_todo工具返回，需要用户输入，直接返回结果")
                yield tool_result.content
                return

            # 检查是否需要用户确认
            if tool_result.metadata and tool_result.metadata.get("requires_confirmation"):
                confirmation_gen = self._handle_tool_confirmation(
                    tool_name,
                    tool_result,
                    batch_delete_mode,
                    batch_delete_todo_ids,
                    batch_delete_results,
                    todo_context,
                    accumulated_context,
                )
                # 先 yield 确认内容
                confirmation_content = next(confirmation_gen)
                yield confirmation_content
                # 然后获取是否应该返回
                should_return = next(confirmation_gen)
                if should_return:
                    return

            # 将工具结果添加到上下文
            tool_context = format_tool_result(tool_name, tool_result)
            accumulated_context.append(tool_context)

            # 更新消息历史
            messages.append({"role": "assistant", "content": f"[工具调用: {tool_name}]"})
            messages.append({"role": "user", "content": f"[工具结果]\n{tool_context}"})

            # 步骤3: 任务评估
            should_continue = self._should_continue_after_tool_execution(
                batch_delete_mode,
                tool_name,
                batch_delete_results,
                batch_delete_todo_ids,
                user_query,
                messages,
                tool_result,
            )

            if not should_continue:
                logger.info("[Agent] 任务评估：可以生成最终回答")
                break

        # 步骤4: 生成最终回答
        yield from generate_final_response(
            self.llm_client,
            user_query,
            messages,
            accumulated_context,
        )

    def _handle_initial_batch_delete(
        self, batch_delete_todo_ids: list[int], todo_context: str | None
    ) -> Generator[str]:
        """处理初始批量删除场景，直接生成确认面板"""
        todos_info = []
        for todo_id in batch_delete_todo_ids:
            todo_name = extract_todo_name_from_context(todo_id, todo_context or "")
            todos_info.append({"id": todo_id, "name": todo_name})

        batch_confirmation_json = json.dumps(
            {
                "type": "batch_todo_confirmation",
                "operation": "batch_delete_todos",
                "todos": todos_info,
                "preview": f"准备批量删除 {len(todos_info)} 个待办事项",
            },
            ensure_ascii=False,
        )

        preview_text = f"准备批量删除以下 {len(todos_info)} 个待办事项：\n" + "\n".join(
            [f"- ID: {t['id']} | 名称: {t['name']}" for t in todos_info]
        )

        confirmation_content = (
            f"{preview_text}\n\n<!-- TODO_CONFIRMATION: {batch_confirmation_json} -->"
        )
        yield confirmation_content

    def _yield_tool_call_marker(self, tool_name: str, tool_params: dict) -> Generator[str]:
        """生成工具调用标记"""
        if tool_name == "clarify_todo":
            # clarify_todo的结果会直接返回，不显示工具调用标记
            return

        if tool_name == "web_search" and "query" in tool_params:
            yield f"\n[使用工具: {tool_name} | 关键词: {tool_params['query']}]\n\n"
        else:
            params_str = ", ".join([f"{k}: {v}" for k, v in tool_params.items()])
            if params_str:
                yield f"\n[使用工具: {tool_name} | {params_str}]\n\n"
            else:
                yield f"\n[使用工具: {tool_name}]\n\n"

    def _handle_tool_confirmation(
        self,
        tool_name: str,
        tool_result: ToolResult,
        batch_delete_mode: bool,
        batch_delete_todo_ids: list[int],
        batch_delete_results: list[dict],
        todo_context: str | None,
        accumulated_context: list[str],
    ) -> Generator[str | bool]:
        """
        处理工具确认需求

        Yields:
            先 yield 确认内容（str），然后 yield 是否应该返回（bool）
        """
        # 批量删除场景：收集所有确认结果，最后统一返回批量确认面板
        if batch_delete_mode and tool_name == "delete_todo":
            confirmation_data = tool_result.metadata.get("confirmation_data", {})
            batch_delete_results.append(confirmation_data)
            logger.info(
                f"[Agent] 批量删除中，已收集{len(batch_delete_results)}/{len(batch_delete_todo_ids)}个待删除确认"
            )

            # 如果还有待办没处理，继续循环
            if len(batch_delete_results) < len(batch_delete_todo_ids):
                formatted_result = format_tool_result(tool_name, tool_result)
                result_content = formatted_result.replace(f"工具 {tool_name} 执行结果：\n", "")
                yield result_content
                yield False  # 不返回，继续循环
                return

            # 所有待办都已收集，生成批量删除确认面板
            logger.info("[Agent] 批量删除收集完成，生成批量确认面板")
            confirmation_content = build_batch_delete_confirmation(
                batch_delete_todo_ids,
                todo_context,
                batch_delete_results,
                accumulated_context,
            )
            yield confirmation_content
            yield True  # 返回，结束流程
            return

        # 非批量场景，立即返回确认
        logger.info(f"[Agent] {tool_name}工具需要用户确认，直接返回结果")
        formatted_result = format_tool_result(tool_name, tool_result)
        result_content = formatted_result.replace(f"工具 {tool_name} 执行结果：\n", "")
        yield result_content
        yield True  # 返回，结束流程

    def _should_continue_after_tool_execution(
        self,
        batch_delete_mode: bool,
        tool_name: str,
        batch_delete_results: list[dict],
        batch_delete_todo_ids: list[int],
        user_query: str,
        messages: list[dict],
        tool_result: ToolResult,
    ) -> bool:
        """判断工具执行后是否应该继续"""
        # 批量删除场景：如果还有待办没处理，强制继续
        if batch_delete_mode and tool_name == "delete_todo":
            processed_ids = {r.get("todo_id") for r in batch_delete_results}
            remaining_ids = [tid for tid in batch_delete_todo_ids if tid not in processed_ids]

            if remaining_ids:
                logger.info(
                    f"[Agent] 批量删除模式：已处理{len(processed_ids)}/{len(batch_delete_todo_ids)}个待办，"
                    f"剩余待处理ID: {remaining_ids}，强制继续"
                )
                # 在消息中添加提示
                remaining_hint = (
                    f"\n[提示] 批量删除进行中，还需要删除以下待办的ID: "
                    f"{', '.join(map(str, remaining_ids))}。请继续为每个ID调用 delete_todo 工具。"
                )
                messages.append({"role": "user", "content": remaining_hint})
                return True

        # 使用任务评估模块
        return evaluate_task_completion(self.llm_client, user_query, messages, tool_result)

    def _build_initial_messages(
        self,
        user_query: str,
        todo_context: str | None,
        conversation_history: list[dict] | None,
        lang: str = "zh",
    ) -> list[dict]:
        """构建初始消息列表"""
        messages = []

        # 系统提示词
        system_prompt = get_prompt("agent", "system")
        if not system_prompt:
            system_prompt = self._get_default_system_prompt()
        # 注入语言指令
        system_prompt += get_language_instruction(lang)
        messages.append({"role": "system", "content": system_prompt})

        # 添加待办上下文（如果有）
        if todo_context:
            messages.append(
                {
                    "role": "user",
                    "content": f"用户当前的待办事项上下文：\n{todo_context}\n\n",
                }
            )

        # 添加对话历史（如果有）
        if conversation_history:
            messages.extend(conversation_history)

        # 添加当前用户查询
        messages.append({"role": "user", "content": user_query})

        return messages

    def _decide_tool_usage(
        self,
        messages: list[dict],
        tool_call_count: int,
        batch_delete_mode: bool,
        batch_delete_results: list[dict],
        batch_delete_todo_ids: list[int],
    ) -> dict[str, Any]:
        """
        决定是否需要使用工具

        Returns:
            {
                "use_tool": bool,
                "tool_name": str | None,
                "tool_params": dict | None
            }
        """
        if tool_call_count >= self.MAX_TOOL_CALLS:
            return {"use_tool": False, "tool_name": None, "tool_params": None}

        # 获取可用工具列表
        available_tools = self.tool_registry.get_available_tools()
        if not available_tools:
            return {"use_tool": False, "tool_name": None, "tool_params": None}

        # 构建工具选择提示词
        tools_schema = self.tool_registry.get_tools_schema()
        tool_selection_prompt = get_prompt(
            "agent",
            "tool_selection",
            tools=json.dumps(tools_schema, ensure_ascii=False, indent=2),
            user_query=messages[-1]["content"] if messages else "",
        )

        if not tool_selection_prompt:
            tool_selection_prompt = self._get_default_tool_selection_prompt(
                tools_schema,
            )

        # 调用 LLM 进行工具选择
        try:
            # 在批量删除模式下，传递已处理和剩余ID信息
            processed_ids_list = []
            remaining_ids_list = []
            if batch_delete_mode:
                processed_ids_set = {r.get("todo_id") for r in batch_delete_results}
                processed_ids_list = list(processed_ids_set)
                remaining_ids_list = [
                    tid for tid in batch_delete_todo_ids if tid not in processed_ids_set
                ]

            decision_messages = build_tool_decision_messages(
                messages,
                tool_selection_prompt,
                batch_delete_mode=batch_delete_mode,
                processed_ids=processed_ids_list,
                remaining_ids=remaining_ids_list,
            )
            decision = call_llm_for_tool_selection(self.llm_client, decision_messages)

            if decision:
                use_tool = decision.get("use_tool", False)
                tool_name = decision.get("tool_name")
                tool_params = decision.get("tool_params", {})

                if use_tool and tool_name:
                    logger.info(
                        f"[Agent] 选择工具: {tool_name}, 参数: {tool_params}",
                    )
                    return {
                        "use_tool": True,
                        "tool_name": tool_name,
                        "tool_params": tool_params,
                    }

            # 如果在批量删除模式下，LLM 没有返回可用工具决策，则进行规则兜底
            if batch_delete_mode and remaining_ids_list:
                next_id = remaining_ids_list[0]
                logger.info(
                    f"[Agent] 批量删除兜底逻辑生效，为剩余ID {next_id} 强制调用 delete_todo"
                )
                return {
                    "use_tool": True,
                    "tool_name": "delete_todo",
                    "tool_params": {"todo_id": next_id},
                }
        except Exception as e:
            logger.error(f"[Agent] 工具选择失败: {e}")

        return {"use_tool": False, "tool_name": None, "tool_params": None}

    def _execute_tool(self, tool_name: str, tool_params: dict) -> ToolResult:
        """执行工具"""
        tool = self.tool_registry.get_tool(tool_name)
        if not tool:
            return ToolResult(
                success=False,
                content="",
                error=f"工具 {tool_name} 不存在",
            )

        try:
            return tool.execute(**tool_params)
        except Exception as e:
            logger.error(f"[Agent] 工具执行失败: {e}")
            return ToolResult(
                success=False,
                content="",
                error=str(e),
            )

    def _get_default_system_prompt(self) -> str:
        """默认系统提示词"""
        return """你是一个智能助手，可以使用工具来帮助用户完成任务。
你可以使用以下工具：
- web_search: 联网搜索最新信息

当用户需要实时信息、最新资讯时，你应该使用 web_search 工具。
使用工具后，基于工具返回的结果生成准确、有用的回答。"""

    def _get_default_tool_selection_prompt(
        self,
        tools_schema: list[dict],
    ) -> str:
        """默认工具选择提示词"""
        tools_desc = "\n".join(
            [f"- {tool['name']}: {tool['description']}" for tool in tools_schema]
        )
        return f"""分析用户查询，判断是否需要使用工具。

可用工具：
{tools_desc}

请以 JSON 格式返回：
{{
    "use_tool": true/false,
    "tool_name": "工具名称" 或 null,
    "tool_params": {{"参数名": "参数值"}} 或 {{}}
}}

只返回 JSON，不要返回其他信息。"""

    @staticmethod
    def _get_default_evaluation_prompt() -> str:
        """默认任务评估提示词"""
        return """评估工具执行结果是否足够回答用户的问题。

如果工具结果已经包含足够信息来回答用户问题，返回"完成"。
如果需要更多信息，返回"继续"。

只返回"完成"或"继续"。"""
