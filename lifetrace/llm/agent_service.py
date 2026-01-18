"""Agent 服务，管理工具调用工作流"""

import json
from collections.abc import Generator
from typing import Any

# 导入工具模块以触发工具注册
from lifetrace.llm import tools  # noqa: F401
from lifetrace.llm.agent_batch_delete import detect_batch_delete_scenario
from lifetrace.llm.agent_planning import AgentPlanningMixin
from lifetrace.llm.agent_research import detect_research_scenario
from lifetrace.llm.agent_response_generator import generate_final_response
from lifetrace.llm.agent_simple_task import AgentSimpleTaskMixin
from lifetrace.llm.agent_step_executor import AgentStepExecutorMixin
from lifetrace.llm.agent_tool_helpers import AgentToolHelpersMixin
from lifetrace.llm.llm_client import LLMClient
from lifetrace.llm.short_task_executor import ShortTaskExecutor
from lifetrace.llm.state import AgentState, PlanStep
from lifetrace.llm.tools.registry import ToolRegistry
from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()


class AgentService(
    AgentPlanningMixin,
    AgentStepExecutorMixin,
    AgentSimpleTaskMixin,
    AgentToolHelpersMixin,
):
    """Agent 服务，管理工具调用工作流"""

    MAX_TOOL_CALLS = 5  # 最大工具调用次数
    MAX_ITERATIONS = 10  # 最大迭代次数

    def __init__(self):
        """初始化 Agent 服务"""
        self.llm_client = LLMClient()
        # 使用单例模式的工具注册表（工具已在 tools/__init__.py 中注册）
        self.tool_registry = ToolRegistry()
        # 短任务执行模式（one_step 或 legacy）
        # one_step: 使用 ShortTaskExecutor 单步执行路径
        # legacy: 使用原有的 _execute_simple_task_loop（仅用于紧急回退）
        self.short_task_mode: str = settings.get("agent.short_task_mode", "one_step")
        self._short_task_executor = ShortTaskExecutor(self.tool_registry)
        # 初始化参数提取器（延迟初始化，由 property 管理）
        self._param_extractor = None

    def execute_long_task_entry(
        self,
        user_query: str,
        todo_context: str | None,
        conversation_history: list[dict] | None,
        lang: str,
    ) -> Generator[str]:
        """
        长任务入口：
        - 使用 planner 生成线性计划
        - 顺序执行计划步骤
        """
        logger.info("[Agent] 复杂任务，使用计划-执行架构")

        # 检测批量删除场景（在计划生成之前）
        batch_delete_mode, batch_delete_todo_ids = detect_batch_delete_scenario(
            user_query, todo_context
        )
        if batch_delete_mode:
            yield from self._handle_initial_batch_delete(batch_delete_todo_ids, todo_context)
            return

        # 生成计划
        state = AgentState(user_query=user_query, todo_context=todo_context)
        state.plan = self._generate_plan(user_query)

        # 构建初始消息（用于最终响应生成）
        state.messages = self._build_initial_messages(
            user_query,
            todo_context,
            conversation_history,
            lang,
        )

        yield f"[Plan] Generated {len(state.plan)} steps.\n\n"

        # 执行计划
        while state.current_step_index < len(state.plan):
            step = state.plan[state.current_step_index]
            yield f"[Step {step.id}] {step.instruction}\n\n"

            result = self._execute_step(state, step)

            if result["status"] == "success":
                step.status = "completed"
                step.result_summary = str(result["output"])[:200]  # 截断用于摘要
                state.scratchpad.append(
                    {
                        "step_id": step.id,
                        "tool": result.get("tool_name", step.suggested_tool),
                        "content": result["output"],
                    }
                )

                # 检测是否是调研场景：web_search成功后
                if result.get("tool_name") == "web_search" and detect_research_scenario(
                    state.user_query
                ):
                    # 生成调研总结并询问用户
                    yield from self._handle_research_result_and_ask(state, result)
                    return  # 停止执行，等待用户确认

                state.current_step_index += 1
            elif result["status"] == "needs_confirmation":
                yield result["output"]
                return  # 停止等待用户输入
            elif result["status"] == "needs_question":
                yield result["output"]
                return  # 暂停执行，等待用户回答问题
            else:
                step.status = "failed"
                yield f"[Error] Step {step.id} failed: {result.get('error', 'Unknown error')}\n\n"
                break

        # 生成最终响应
        yield from self._generate_final_response_from_state(state)

    def stream_agent_response(
        self,
        user_query: str,
        todo_context: str | None = None,
        conversation_history: list[dict] | None = None,
        lang: str = "zh",
    ) -> Generator[str]:
        """
        流式生成 Agent 回答

        双系统架构：
        1. 简单任务：使用响应式循环（不生成计划）
        2. 复杂任务：使用计划-执行架构（生成计划后逐步执行）
        """
        # 1. 复杂度检测
        should_plan = self._should_generate_plan(user_query)

        if not should_plan:
            # 简单任务：走短任务入口
            logger.info("[Agent] 简单任务，走短任务入口")
            yield from self.execute_short_task_entry(
                user_query=user_query,
                todo_context=todo_context,
                conversation_history=conversation_history,
                lang=lang,
            )
            return

        # 2. 复杂任务：走长任务入口（计划-执行架构）
        yield from self.execute_long_task_entry(
            user_query=user_query,
            todo_context=todo_context,
            conversation_history=conversation_history,
            lang=lang,
        )

    def _handle_research_result_and_ask(
        self, state: AgentState, web_search_result: dict[str, Any]
    ) -> Generator[str]:
        """处理调研结果：生成总结并询问用户是否需要整理成待办

        流程：
        1. 使用generate_final_response生成调研总结
        2. 生成确认面板，询问用户是否需要整理成待办
        3. 保存web_search结果到state，以便用户确认后使用
        """
        # 1. 生成调研总结
        # 从 scratchpad 获取原始的 web_search 内容（避免格式化前缀）
        web_search_content = ""
        if state.scratchpad:
            last_step = state.scratchpad[-1]
            if last_step.get("tool") == "web_search":
                # 获取原始内容，去除格式化前缀
                formatted_output = last_step.get("content", "")
                # 移除 "工具 web_search 执行结果：" 前缀
                if formatted_output.startswith("工具 web_search 执行结果：\n"):
                    web_search_content = formatted_output[len("工具 web_search 执行结果：\n") :]
                else:
                    web_search_content = formatted_output

        if not web_search_content:
            # 如果 scratchpad 中没有，尝试从 result 中获取（fallback）
            formatted_output = web_search_result.get("output", "")
            if formatted_output.startswith("工具 web_search 执行结果：\n"):
                web_search_content = formatted_output[len("工具 web_search 执行结果：\n") :]
            else:
                web_search_content = formatted_output

        accumulated_context = [web_search_content]

        yield from generate_final_response(
            self.llm_client,
            state.user_query,
            state.messages,
            accumulated_context,
        )

        # 2. 生成确认面板
        confirmation_data = {
            "type": "research_to_todos_confirmation",
            "operation": "research_to_todos",
            "web_search_content": web_search_content,  # 保存搜索结果，确认后使用
            "preview": "是否需要将调研结果整理成待办事项？",
        }

        confirmation_json = json.dumps(confirmation_data, ensure_ascii=False)
        confirmation_text = (
            "\n\n是否需要将调研结果整理成待办事项？\n\n"
            f"<!-- TODO_CONFIRMATION: {confirmation_json} -->"
        )

        yield confirmation_text

        # 3. 保存状态（在AgentState中保存web_search结果）
        state.pending_research_confirmation = {
            "web_search_content": web_search_content,
            "step_id": state.current_step_index,
        }

    def resume_after_research_confirmation(
        self,
        state: AgentState,
        user_confirmed: bool,
    ) -> Generator[str]:
        """用户确认调研结果后继续执行

        Args:
            state: AgentState对象（需要从会话存储中恢复）
            user_confirmed: 用户是否确认整理成待办
        """
        if not user_confirmed:
            # 用户拒绝，结束流程
            yield "已取消整理待办事项。"
            return

        # 用户确认，执行extract_todo
        if not state.pending_research_confirmation:
            yield "无法找到调研结果，请重新开始。"
            return

        web_search_content = state.pending_research_confirmation.get("web_search_content", "")
        state.pending_research_confirmation = None

        # 确保 scratchpad 中包含 web_search 结果（供参数提取器使用）
        # 参数提取器会从 scratchpad 的最后一步中提取 web_search 的内容
        if not state.scratchpad or state.scratchpad[-1].get("tool") != "web_search":
            state.scratchpad.append(
                {
                    "step_id": state.current_step_index,
                    "tool": "web_search",
                    "content": web_search_content,
                }
            )

        # 创建extract_todo步骤
        extract_step = PlanStep(
            id=state.current_step_index + 1,
            instruction="从调研结果中提取可操作的待办事项",
            suggested_tool="extract_todo",
        )

        # 执行extract_todo
        result = self._execute_step(state, extract_step)

        if result["status"] == "success":
            # extract_todo成功，继续后续流程
            state.scratchpad.append(
                {
                    "step_id": extract_step.id,
                    "tool": "extract_todo",
                    "content": result["output"],
                }
            )
            # 生成最终响应（如果需要）
            yield from self._generate_final_response_from_state(state)
        elif result["status"] == "needs_confirmation":
            # extract_todo需要确认（批量创建确认）
            yield result["output"]
        else:
            yield f"[Error] 提取待办失败: {result.get('error', 'Unknown error')}"
