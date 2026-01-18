"""Agent 简单任务模块"""

import json
from collections.abc import Generator

from lifetrace.llm.agent_batch_delete import detect_batch_delete_scenario
from lifetrace.llm.agent_response_generator import generate_final_response
from lifetrace.llm.agent_tool_formatter import format_tool_result
from lifetrace.llm.state import ShortTaskDecision, validate_short_task_decision
from lifetrace.util.language import get_language_instruction
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


class AgentSimpleTaskMixin:
    """Agent 简单任务 Mixin"""

    def _execute_simple_task_loop(
        self,
        user_query: str,
        todo_context: str | None,
        conversation_history: list[dict] | None,
        lang: str,
    ) -> Generator[str]:
        """
        执行简单任务（使用响应式循环，不生成计划）
        这是原有的响应式循环逻辑，保持不变以确保向后兼容
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

    def _decide_short_task_action(
        self,
        user_query: str,
        todo_context: str | None,
        conversation_history: list[dict] | None,
        lang: str,
    ) -> ShortTaskDecision | None:
        """调用 LLM 进行短任务一次性决策（最大 1 次 LLM 调用）。"""
        prompt = get_prompt(
            "agent",
            "short_task_decision",
            user_query=user_query,
            todo_context=todo_context or "",
        )
        if not prompt:
            logger.warning("[Agent] 未找到 short_task_decision 提示词，放弃短任务决策")
            return None

        messages: list[dict[str, str]] = []

        # 系统提示词 + 语言指令
        system_prompt = get_prompt("agent", "system") or self._get_default_system_prompt()
        system_prompt += get_language_instruction(lang)
        messages.append({"role": "system", "content": system_prompt})

        # 待办上下文（如果有）
        if todo_context:
            messages.append(
                {
                    "role": "user",
                    "content": f"用户当前的待办事项上下文：\n{todo_context}\n\n",
                }
            )

        # 最近历史简单拼接到决策前（可选，不触发额外 LLM 调用）
        if conversation_history:
            messages.extend(conversation_history[-3:])

        # 决策主体
        messages.append({"role": "user", "content": prompt})

        try:
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=messages,
                temperature=0.1,
                max_tokens=800,
            )
        except Exception as exc:  # noqa: BLE001
            logger.error(f"[Agent] 短任务决策 LLM 调用失败: {exc}")
            return None

        response_text = response.choices[0].message.content.strip()
        # 清理 markdown 代码块包装
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        try:
            raw_decision = json.loads(response_text)
        except json.JSONDecodeError as exc:
            logger.error(f"[Agent] 短任务决策 JSON 解析失败: {exc} | text={response_text}")
            return None

        try:
            decision = validate_short_task_decision(raw_decision)
        except Exception as exc:  # noqa: BLE001
            logger.warning(f"[Agent] 短任务决策未通过 schema 校验，判定为 unsupported: {exc}")
            return None

        return decision

    def execute_short_task_entry(
        self,
        user_query: str,
        todo_context: str | None,
        conversation_history: list[dict] | None,
        lang: str,
    ) -> Generator[str]:
        """
        短任务入口：
        - 根据配置选择使用 one_step 执行器或 legacy 简单任务循环

        注意：此方法只负责路由，不做 LLM 复杂度判断。
        """
        if self.short_task_mode == "legacy":
            logger.info("[Agent] 短任务使用 legacy 简单任务循环(_execute_simple_task_loop)")
            yield from self._execute_simple_task_loop(
                user_query, todo_context, conversation_history, lang
            )
            return

        # 默认使用新的 one-step 短任务执行路径
        logger.info("[Agent] 短任务使用 one-step 执行器路径")

        # 检测批量删除场景（在one-step路径中也要检测）
        batch_delete_mode, batch_delete_todo_ids = detect_batch_delete_scenario(
            user_query, todo_context
        )
        if batch_delete_mode:
            logger.info(
                f"[Agent] one-step路径检测到批量删除场景，待删除{len(batch_delete_todo_ids)}个待办: {batch_delete_todo_ids}"
            )
            yield from self._handle_initial_batch_delete(batch_delete_todo_ids, todo_context)
            return

        decision = self._decide_short_task_action(
            user_query=user_query,
            todo_context=todo_context,
            conversation_history=conversation_history or [],
            lang=lang,
        )

        if decision is None:
            # 决策失败或 schema 校验失败：按架构约定，直接返回 unsupported，而不是再次调用 LLM
            yield "当前请求超出了短任务一次性决策能力范围，请改写请求或尝试更复杂的任务模式。"
            return

        # 交给短任务执行器，保证执行阶段不再调用 LLM
        result = self._short_task_executor.execute(decision)
        status = result.get("status")
        payload = result.get("payload", "")

        if status == "success":
            yield payload
            return

        if status == "tool_error":
            yield f"[短任务执行失败] {payload}"
            return

        # 兜底：理论上不应该到这里
        yield "短任务执行遇到未知错误，请稍后重试或改写请求。"
