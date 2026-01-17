"""Agent 步骤执行模块"""

import json
import time
from collections.abc import Generator
from typing import Any

from lifetrace.llm.agent_response_generator import generate_final_response
from lifetrace.llm.agent_tool_formatter import format_tool_result
from lifetrace.llm.agent_tool_param_extractor import AgentToolParamExtractor
from lifetrace.llm.state import AgentState, PlanStep, QuestionData
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


class AgentStepExecutorMixin:
    """Agent 步骤执行 Mixin"""

    def __init__(self):
        """初始化参数提取器"""
        self._param_extractor = None

    @property
    def param_extractor(self) -> AgentToolParamExtractor:
        """获取参数提取器实例（延迟初始化）"""
        if self._param_extractor is None:
            self._param_extractor = AgentToolParamExtractor(self.llm_client, self.tool_registry)
        return self._param_extractor

    @staticmethod
    def _clean_json_response(response_text: str) -> str:
        """清理LLM返回的JSON响应，移除markdown代码块标记"""
        response_text = response_text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        return response_text.strip()

    def _try_tool_first(self, step: PlanStep, state: AgentState) -> dict[str, Any] | None:
        """
        优先尝试使用建议的工具（即使LLM说不需要）

        Returns:
            Tool execution result if tool exists and can be executed, None otherwise
        """
        if not step.suggested_tool:
            return None

        tool = self.tool_registry.get_tool(step.suggested_tool)
        if not tool:
            logger.warning(f"[Agent] 建议的工具 {step.suggested_tool} 不存在")
            return None

        # 提取并验证工具参数
        tool_params = self.param_extractor.extract_and_validate_tool_params(step, state, tool)
        if tool_params is None:
            return None

        # 执行工具
        try:
            tool_result = tool.execute(**tool_params)
            # 使用统一的工具结果处理方法，确保正确处理 requires_confirmation
            return self._process_tool_execution_result(step.suggested_tool, tool_result)
        except Exception as e:
            logger.warning(f"[Agent] 工具 {step.suggested_tool} 执行异常: {e}")
            return {
                "status": "failed",
                "output": "",
                "error": str(e),
            }

    def _generate_structured_question(
        self, step: PlanStep, state: AgentState, tool_failure_reason: str
    ) -> QuestionData:
        """生成结构化问题，包含问题文本和可能的答案选项"""
        # 调用LLM生成结构化问题
        question_prompt = get_prompt(
            "agent",
            "question_generator",
            step_instruction=step.instruction,
            tool_failure=tool_failure_reason,
            context=self.param_extractor._format_scratchpad(state.scratchpad),
        )

        if not question_prompt:
            # 如果没有提示词，生成默认问题
            return QuestionData(
                question_text=f"执行步骤 {step.id} 时需要您的输入：{step.instruction}",
                question_id=f"q_{step.id}_{int(time.time())}",
                step_id=step.id,
                suggested_answers=[],
                allow_custom=True,
            )

        try:
            messages = [{"role": "user", "content": question_prompt}]
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=messages,
                temperature=0.3,
                max_tokens=500,
            )

            response_text = response.choices[0].message.content.strip()
            response_text = self._clean_json_response(response_text)
            question_data = json.loads(response_text)

            return QuestionData(
                question_text=question_data["question_text"],
                question_id=f"q_{step.id}_{int(time.time())}",
                step_id=step.id,
                suggested_answers=question_data.get("suggested_answers", []),
                allow_custom=question_data.get("allow_custom", True),
                context=question_data.get("context"),
            )
        except Exception as e:
            logger.warning(f"[Agent] 生成结构化问题失败: {e}，使用默认问题")
            return QuestionData(
                question_text=f"执行步骤 {step.id} 时需要您的输入：{step.instruction}",
                question_id=f"q_{step.id}_{int(time.time())}",
                step_id=step.id,
                suggested_answers=[],
                allow_custom=True,
            )

    def _execute_with_best_effort(self, step: PlanStep, state: AgentState) -> dict[str, Any]:
        """问题预算已用完，使用最佳猜测继续执行"""
        logger.info(f"[Agent] 使用最佳猜测执行步骤 {step.id}")
        if not step.suggested_tool:
            return {"status": "failed", "output": "", "error": "问题预算已用完且最佳猜测执行失败"}

        tool = self.tool_registry.get_tool(step.suggested_tool)
        if not tool:
            return {"status": "failed", "output": "", "error": "问题预算已用完且最佳猜测执行失败"}

        try:
            params = {"query": step.instruction[:50]} if step.suggested_tool == "web_search" else {}
            tool_result = tool.execute(**params)
            if tool_result.success:
                formatted_result = format_tool_result(step.suggested_tool, tool_result)
                return {
                    "status": "success",
                    "output": formatted_result,
                    "tool_name": step.suggested_tool,
                }
        except Exception as e:
            logger.warning(f"[Agent] 最佳猜测执行失败: {e}")

        return {"status": "failed", "output": "", "error": "问题预算已用完且最佳猜测执行失败"}

    def _try_web_search_fallback(self, step: PlanStep, state: AgentState) -> dict[str, Any] | None:
        """尝试使用 web_search 作为后备工具"""
        # 格式化scratchpad上下文
        scratchpad_context = self.param_extractor._format_scratchpad(state.scratchpad)

        # 获取工具列表
        tools_schema = self.tool_registry.get_tools_schema()
        tools_json = json.dumps(tools_schema, ensure_ascii=False, indent=2)

        # 加载步骤执行器提示词，用于判断是否需要 web_search
        executor_prompt = get_prompt(
            "agent",
            "step_executor",
            current_instruction=step.instruction,
            scratchpad_context=scratchpad_context,
            tools=tools_json,
        )

        if not executor_prompt:
            return None

        try:
            # 调用LLM决定是否需要使用 web_search
            messages = [{"role": "user", "content": executor_prompt}]
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=messages,
                temperature=0.1,
                max_tokens=500,
            )

            response_text = response.choices[0].message.content.strip()
            response_text = self._clean_json_response(response_text)
            decision = json.loads(response_text)
            use_tool = decision.get("use_tool", False)
            tool_name = decision.get("tool_name")

            # 如果 LLM 认为需要 web_search，允许执行
            if use_tool and tool_name == "web_search":
                tool_params = decision.get("tool_params", {})
                logger.info(f"[Agent] 步骤 {step.id} 建议工具失败，LLM 决策使用 web_search")
                web_search_result = self._execute_tool("web_search", tool_params)

                if web_search_result.success:
                    formatted_result = format_tool_result("web_search", web_search_result)
                    return {
                        "status": "success",
                        "output": formatted_result,
                        "tool_name": "web_search",
                    }
                # web_search 也失败，继续到问题生成流程
                logger.info("[Agent] web_search 执行失败，继续到问题生成流程")
        except Exception as e:
            logger.warning(f"[Agent] 检查是否需要 web_search 时出错: {e}，继续到问题生成流程")

        return None

    def _handle_tool_failure_with_question(
        self, step: PlanStep, state: AgentState, tool_result: dict[str, Any] | None
    ) -> dict[str, Any]:
        """处理工具失败并生成问题"""
        # 如果工具执行失败且 web_search 不可用或也失败，检查是否可以使用问题预算
        if state.questions_asked < state.question_budget:
            # 生成结构化问题
            tool_failure_reason = (
                tool_result.get("error", "工具执行失败") if tool_result else "工具执行失败"
            )
            question_data = self._generate_structured_question(step, state, tool_failure_reason)
            state.questions_asked += 1
            state.pending_question = question_data.model_dump()

            # 格式化问题输出（包含JSON标记供前端解析）
            question_json = json.dumps(question_data.model_dump(), ensure_ascii=False)
            question_output = (
                f"{question_data.question_text}\n\n<!-- AGENT_QUESTION: {question_json} -->"
            )

            return {
                "status": "needs_question",
                "output": question_output,
                "question_data": question_data.model_dump(),
            }
        # 问题预算已用完，使用最佳猜测继续
        logger.info(f"[Agent] 问题预算已用完，使用最佳猜测继续执行步骤 {step.id}")
        return self._execute_with_best_effort(step, state)

    def _call_llm_for_tool_decision(
        self, step: PlanStep, state: AgentState
    ) -> dict[str, Any] | None:
        """调用LLM决定使用哪个工具"""
        # 格式化scratchpad上下文
        scratchpad_context = self.param_extractor._format_scratchpad(state.scratchpad)

        # 获取工具列表
        tools_schema = self.tool_registry.get_tools_schema()
        tools_json = json.dumps(tools_schema, ensure_ascii=False, indent=2)

        # 加载步骤执行器提示词
        executor_prompt = get_prompt(
            "agent",
            "step_executor",
            current_instruction=step.instruction,
            scratchpad_context=scratchpad_context,
            tools=tools_json,
        )

        if not executor_prompt:
            return None

        try:
            # 调用LLM决定使用哪个工具
            messages = [{"role": "user", "content": executor_prompt}]
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=messages,
                temperature=0.1,
                max_tokens=500,
            )

            response_text = response.choices[0].message.content.strip()
            response_text = self._clean_json_response(response_text)
            decision = json.loads(response_text)
            return decision
        except json.JSONDecodeError as e:
            logger.error(f"[Agent] 步骤执行器响应解析失败: {e}")
            return None
        except Exception as e:
            logger.error(f"[Agent] 步骤执行失败: {e}")
            return None

    def _process_tool_execution_result(self, tool_name: str, tool_result: Any) -> dict[str, Any]:
        """处理工具执行结果"""
        if tool_name == "clarify_todo" and tool_result.success:
            logger.info(f"[Agent] 工具 {tool_name} 需要用户确认")
            return {"status": "needs_confirmation", "output": tool_result.content}

        if tool_result.metadata and tool_result.metadata.get("requires_confirmation"):
            logger.info(f"[Agent] 工具 {tool_name} 需要用户确认")
            formatted_result = format_tool_result(tool_name, tool_result)
            result_content = formatted_result.replace(f"工具 {tool_name} 执行结果：\n", "")
            return {"status": "needs_confirmation", "output": result_content}

        if tool_result.success:
            formatted_result = format_tool_result(tool_name, tool_result)
            return {"status": "success", "output": formatted_result, "tool_name": tool_name}

        return {"status": "failed", "output": "", "error": tool_result.error or "工具执行失败"}

    def _execute_step_without_suggested_tool(
        self, step: PlanStep, state: AgentState
    ) -> dict[str, Any]:
        """执行没有建议工具的步骤"""
        decision = self._call_llm_for_tool_decision(step, state)
        if decision is None:
            return {
                "status": "failed",
                "output": "",
                "error": "无法加载步骤执行器提示词或LLM调用失败",
            }

        use_tool = decision.get("use_tool", False)
        if not use_tool:
            return {"status": "success", "output": "步骤完成，无需工具"}

        tool_name = decision.get("tool_name")
        if not tool_name:
            return {
                "status": "failed",
                "output": "",
                "error": "LLM返回了use_tool=true但没有提供tool_name",
            }

        tool_result = self._execute_tool(tool_name, decision.get("tool_params", {}))
        return self._process_tool_execution_result(tool_name, tool_result)

    def _execute_step(self, state: AgentState, step: PlanStep) -> dict[str, Any]:
        """执行单个步骤（工具优先策略）"""
        # 1. 如果步骤有建议的工具，优先尝试使用
        if step.suggested_tool:
            tool_result = self._try_tool_first(step, state)
            if tool_result:
                # 如果工具需要确认，直接返回确认状态
                if tool_result["status"] == "needs_confirmation":
                    return tool_result
                # 如果工具执行成功，直接返回
                if tool_result["status"] == "success":
                    return tool_result

            # 如果工具执行失败，在询问用户之前，先检查是否需要 web_search
            # 这允许 LLM 在执行失败时尝试联网搜索获取实时信息
            if step.suggested_tool != "web_search":
                web_search_result = self._try_web_search_fallback(step, state)
                if web_search_result:
                    return web_search_result

            # 如果工具执行失败且 web_search 不可用或也失败，处理失败情况
            return self._handle_tool_failure_with_question(step, state, tool_result)

        # 2. 如果没有建议的工具，使用原有LLM决策逻辑
        return self._execute_step_without_suggested_tool(step, state)

    def _continue_executing_remaining_steps(self, state: AgentState) -> Generator[str]:
        """继续执行剩余的步骤"""
        while state.current_step_index < len(state.plan):
            next_step = state.plan[state.current_step_index]
            yield f"[Step {next_step.id}] {next_step.instruction}\n\n"

            result = self._execute_step(state, next_step)

            if result["status"] == "success":
                next_step.status = "completed"
                next_step.result_summary = str(result["output"])[:200]
                state.scratchpad.append(
                    {
                        "step_id": next_step.id,
                        "tool": result.get("tool_name", next_step.suggested_tool),
                        "content": result["output"],
                    }
                )
                state.current_step_index += 1
            elif result["status"] == "needs_confirmation":
                yield result["output"]
                return
            elif result["status"] == "needs_question":
                yield result["output"]
                return
            else:
                next_step.status = "failed"
                yield f"[Error] Step {next_step.id} failed: {result.get('error', 'Unknown error')}\n\n"
                break

    def _execute_tool_with_user_answer(
        self, step: PlanStep, state: AgentState, user_answer: str
    ) -> Generator[str]:
        """使用用户答案执行工具"""
        # 从用户答案中提取工具参数
        tool_params = self._extract_tool_params_from_answer(step, user_answer)

        tool = self.tool_registry.get_tool(step.suggested_tool)
        if not tool:
            yield f"[Error] 工具 {step.suggested_tool} 不存在\n\n"
            return

        try:
            tool_result = tool.execute(**tool_params)
            if tool_result.success:
                formatted_result = format_tool_result(step.suggested_tool, tool_result)
                step.status = "completed"
                step.result_summary = str(formatted_result)[:200]
                state.scratchpad.append(
                    {
                        "step_id": step.id,
                        "tool": step.suggested_tool,
                        "content": formatted_result,
                    }
                )
                state.current_step_index += 1

                # 继续执行后续步骤
                yield from self._continue_executing_remaining_steps(state)

                # 生成最终响应
                yield from self._generate_final_response_from_state(state)
            else:
                yield f"[Error] 工具执行失败: {tool_result.error}\n\n"
        except Exception as e:
            yield f"[Error] 工具执行异常: {str(e)}\n\n"

    def resume_after_question(
        self,
        state: AgentState,
        question_id: str,
        user_answer: str,
    ) -> Generator[str]:
        """
        在用户回答问题后恢复执行

        Args:
            state: AgentState对象（需要从会话存储中恢复）
            question_id: 问题的ID
            user_answer: 用户的答案
        """
        # 将用户答案添加到scratchpad
        if state.pending_question:
            state.scratchpad.append(
                {
                    "step_id": state.pending_question["step_id"],
                    "tool": "user_answer",
                    "content": f"用户回答: {user_answer}",
                }
            )
            state.pending_question = None

        # 使用用户答案重新尝试工具执行
        if state.current_step_index < len(state.plan):
            step = state.plan[state.current_step_index]

            # 如果有建议的工具，使用用户答案作为参数重新尝试
            if step.suggested_tool:
                yield from self._execute_tool_with_user_answer(step, state, user_answer)
                return

        # 如果恢复失败，生成最终响应
        yield from self._generate_final_response_from_state(state)

    def _extract_tool_params_from_answer(self, step: PlanStep, user_answer: str) -> dict[str, Any]:
        """从用户答案中提取工具参数"""
        params = {}

        # 对于web_search，用户答案可能是查询关键词
        if step.suggested_tool == "web_search":
            if user_answer.strip():
                params["query"] = user_answer.strip()
            else:
                params["query"] = step.instruction[:50]

        return params

    def _generate_final_response_from_state(self, state: AgentState) -> Generator[str]:
        """
        从AgentState生成最终响应
        """
        # 从scratchpad构建accumulated_context
        accumulated_context = []
        for s in state.scratchpad:
            accumulated_context.append(s.get("content", ""))

        # 使用现有的generate_final_response函数
        yield from generate_final_response(
            self.llm_client,
            state.user_query,
            state.messages,
            accumulated_context,
        )
