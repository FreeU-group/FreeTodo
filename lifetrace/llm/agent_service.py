"""Agent 服务，管理工具调用工作流"""

from collections.abc import Generator

# 导入工具模块以触发工具注册
from lifetrace.llm import tools  # noqa: F401
from lifetrace.llm.agent_batch_delete import detect_batch_delete_scenario
from lifetrace.llm.agent_planning import AgentPlanningMixin
from lifetrace.llm.agent_simple_task import AgentSimpleTaskMixin
from lifetrace.llm.agent_step_executor import AgentStepExecutorMixin
from lifetrace.llm.agent_tool_helpers import AgentToolHelpersMixin
from lifetrace.llm.llm_client import LLMClient
from lifetrace.llm.short_task_executor import ShortTaskExecutor
from lifetrace.llm.state import AgentState
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
        state = AgentState(user_query=user_query)
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
