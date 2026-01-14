"""Agent 步骤执行模块"""

import json
import time
from collections.abc import Generator
from typing import Any

from lifetrace.llm.agent_response_generator import generate_final_response
from lifetrace.llm.agent_tool_formatter import format_tool_result
from lifetrace.llm.state import AgentState, PlanStep, QuestionData
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


class AgentStepExecutorMixin:
    """Agent 步骤执行 Mixin"""

    # 常量定义
    MAX_QUERY_LENGTH = 100  # 最大查询长度
    QUERY_PREVIEW_LENGTH = 50  # 查询预览长度

    def _extract_search_query(self, instruction: str, state: AgentState) -> str:
        """
        从步骤指令和上下文中提取搜索查询词
        """
        # 简单规则：使用指令作为查询词，或从上下文中提取
        # 可以后续用LLM优化
        query = instruction.strip()

        # 如果指令太长，尝试提取关键词
        if len(query) > self.MAX_QUERY_LENGTH:
            # 简单提取：取前50个字符或到第一个句号
            preview_len = self.QUERY_PREVIEW_LENGTH
            query = query[:preview_len] if "." not in query[:preview_len] else query.split(".")[0]

        return query

    def _extract_tool_params_from_context(
        self, step: PlanStep, state: AgentState
    ) -> dict[str, Any]:
        """
        从上下文和步骤指令中提取工具参数
        使用LLM或规则来提取参数
        """
        params = {}

        # 提取查询关键词（用于web_search）
        if step.suggested_tool == "web_search":
            params["query"] = self._extract_search_query(step.instruction, state)

        # 其他工具的参数提取可以根据需要扩展
        # 例如：从scratchpad中提取之前步骤的结果作为参数

        return params

    def _check_required_params(self, tool, tool_params: dict[str, Any]) -> bool:
        """
        检查工具参数是否满足必需参数要求

        Args:
            tool: 工具对象
            tool_params: 提取的工具参数

        Returns:
            True if all required parameters are provided, False otherwise
        """
        schema = tool.parameters_schema
        required_params = schema.get("required", [])

        # 检查所有必需参数是否都已提供
        for param in required_params:
            if param not in tool_params:
                logger.debug(f"[Agent] 工具 {tool.name} 缺少必需参数: {param}")
                return False

        return True

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

        # 尝试使用默认参数或从上下文中提取参数
        tool_params = self._extract_tool_params_from_context(step, state)

        # 检查必需参数是否都已提供
        if not self._check_required_params(tool, tool_params):
            logger.info(
                f"[Agent] 工具 {step.suggested_tool} 缺少必需参数，跳过工具优先执行，交由LLM决策流程处理"
            )
            return None

        try:
            tool_result = tool.execute(**tool_params)
            if tool_result.success:
                formatted_result = format_tool_result(step.suggested_tool, tool_result)
                logger.info(f"[Agent] 工具优先执行成功: {step.suggested_tool}")
                return {
                    "status": "success",
                    "output": formatted_result,
                    "tool_name": step.suggested_tool,
                }
            # 如果工具执行失败，返回None让后续逻辑处理
            logger.warning(
                f"[Agent] 工具优先执行失败: {step.suggested_tool}, 错误: {tool_result.error}"
            )
            return {
                "status": "failed",
                "output": "",
                "error": tool_result.error or "工具执行失败",
            }
        except Exception as e:
            logger.warning(f"[Agent] 工具 {step.suggested_tool} 执行异常: {e}")
            return {
                "status": "failed",
                "output": "",
                "error": str(e),
            }

    def _format_scratchpad(self, scratchpad: list[dict[str, Any]]) -> str:
        """格式化scratchpad为可读的上下文字符串"""
        if not scratchpad:
            return "无先前步骤"

        parts = []
        for s in scratchpad:
            content_preview = str(s.get("content", ""))[:200]
            parts.append(f"步骤 {s['step_id']}: {s.get('tool', 'unknown')} → {content_preview}...")
        return "先前步骤:\n" + "\n".join(parts)

    def _generate_structured_question(
        self, step: PlanStep, state: AgentState, tool_failure_reason: str
    ) -> QuestionData:
        """
        生成结构化问题，包含问题文本和可能的答案选项
        """
        # 调用LLM生成结构化问题
        question_prompt = get_prompt(
            "agent",
            "question_generator",
            step_instruction=step.instruction,
            tool_failure=tool_failure_reason,
            context=self._format_scratchpad(state.scratchpad),
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

            # 清理可能的markdown代码块
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

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
        """
        问题预算已用完，使用最佳猜测继续执行
        """
        logger.info(f"[Agent] 使用最佳猜测执行步骤 {step.id}")

        # 尝试使用默认参数执行工具
        if step.suggested_tool:
            tool = self.tool_registry.get_tool(step.suggested_tool)
            if tool:
                # 使用最小参数集尝试执行
                try:
                    # 对于web_search，至少需要query参数
                    if step.suggested_tool == "web_search":
                        params = {"query": step.instruction[:50]}
                    else:
                        params = {}

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

        # 如果最佳猜测也失败，返回失败状态
        return {
            "status": "failed",
            "output": "",
            "error": "问题预算已用完且最佳猜测执行失败",
        }

    def _try_web_search_fallback(self, step: PlanStep, state: AgentState) -> dict[str, Any] | None:
        """尝试使用 web_search 作为后备工具"""
        # 格式化scratchpad上下文
        scratchpad_context = self._format_scratchpad(state.scratchpad)

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

            # 清理可能的markdown代码块
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

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
        scratchpad_context = self._format_scratchpad(state.scratchpad)

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

            # 清理可能的markdown代码块
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

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
        # 处理clarify_todo特殊情况
        if tool_name == "clarify_todo" and tool_result.success:
            return {
                "status": "needs_confirmation",
                "output": tool_result.content,
            }

        # 处理需要确认的情况
        if tool_result.metadata and tool_result.metadata.get("requires_confirmation"):
            formatted_result = format_tool_result(tool_name, tool_result)
            result_content = formatted_result.replace(f"工具 {tool_name} 执行结果：\n", "")
            return {
                "status": "needs_confirmation",
                "output": result_content,
            }

        # 成功执行
        if tool_result.success:
            formatted_result = format_tool_result(tool_name, tool_result)
            return {
                "status": "success",
                "output": formatted_result,
                "tool_name": tool_name,
            }

        # 执行失败
        return {
            "status": "failed",
            "output": "",
            "error": tool_result.error or "工具执行失败",
        }

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
            return {
                "status": "success",
                "output": "步骤完成，无需工具",
            }

        tool_name = decision.get("tool_name")
        tool_params = decision.get("tool_params", {})

        if not tool_name:
            return {
                "status": "failed",
                "output": "",
                "error": "LLM返回了use_tool=true但没有提供tool_name",
            }

        # 执行工具
        tool_result = self._execute_tool(tool_name, tool_params)
        return self._process_tool_execution_result(tool_name, tool_result)

    def _execute_step(self, state: AgentState, step: PlanStep) -> dict[str, Any]:
        """
        执行单个步骤（工具优先策略）

        Returns:
            {
                "status": "success" | "needs_confirmation" | "needs_question" | "failed",
                "output": str,
                "tool_name": str (可选),
                "error": str (可选),
                "question_data": dict (可选，当status为needs_question时)
            }
        """
        # 1. 如果步骤有建议的工具，优先尝试使用
        if step.suggested_tool:
            tool_result = self._try_tool_first(step, state)
            if tool_result and tool_result["status"] == "success":
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
        tool_params = self._extract_tool_params_from_answer(step, state, user_answer)

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

    def _extract_tool_params_from_answer(
        self, step: PlanStep, state: AgentState, user_answer: str
    ) -> dict[str, Any]:
        """
        从用户答案中提取工具参数
        """
        params = {}

        # 对于web_search，用户答案可能是查询关键词
        if step.suggested_tool == "web_search":
            # 结合步骤指令和用户答案
            if user_answer.strip():
                params["query"] = user_answer.strip()
            else:
                params["query"] = step.instruction[:50]

        # 其他工具的参数提取可以根据需要扩展

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
