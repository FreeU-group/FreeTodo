"""Agent 服务，管理工具调用工作流"""

import json
from collections.abc import Generator
from typing import Any

# 导入工具模块以触发工具注册
from lifetrace.llm import tools  # noqa: F401
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

        # 构建初始消息
        messages = self._build_initial_messages(
            user_query,
            todo_context,
            conversation_history,
            lang,
        )

        while iteration_count < self.MAX_ITERATIONS:
            iteration_count += 1
            logger.info(f"[Agent] 迭代 {iteration_count}/{self.MAX_ITERATIONS}")

            # 步骤1: 工具选择
            tool_decision = self._decide_tool_usage(messages, tool_call_count)

            if tool_decision["use_tool"]:
                # 步骤2: 执行工具
                if tool_call_count >= self.MAX_TOOL_CALLS:
                    yield "\n[提示] 已达到最大工具调用次数限制，将基于已有信息生成回答。\n\n"
                    break

                tool_name = tool_decision["tool_name"]
                tool_params = tool_decision.get("tool_params", {})

                # 构建工具调用标记，包含参数信息（特别是搜索关键词）
                if tool_name == "web_search" and "query" in tool_params:
                    # 对于 web_search，显示搜索关键词
                    yield f"\n[使用工具: {tool_name} | 关键词: {tool_params['query']}]\n\n"
                else:
                    # 其他工具，显示工具名称和参数（如果有）
                    params_str = ", ".join([f"{k}: {v}" for k, v in tool_params.items()])
                    if params_str:
                        yield f"\n[使用工具: {tool_name} | {params_str}]\n\n"
                    else:
                        yield f"\n[使用工具: {tool_name}]\n\n"

                tool_result = self._execute_tool(tool_name, tool_params)
                tool_call_count += 1

                # 将工具结果添加到上下文
                tool_context = self._format_tool_result(tool_name, tool_result)
                accumulated_context.append(tool_context)

                # 更新消息历史
                messages.append(
                    {
                        "role": "assistant",
                        "content": f"[工具调用: {tool_name}]",
                    }
                )
                messages.append(
                    {
                        "role": "user",
                        "content": f"[工具结果]\n{tool_context}",
                    }
                )

                # 步骤3: 任务评估
                should_continue = self._evaluate_task_completion(
                    user_query,
                    messages,
                    tool_result,
                )

                if not should_continue:
                    logger.info("[Agent] 任务评估：可以生成最终回答")
                    break
            else:
                # 不需要工具，直接生成回答
                logger.info("[Agent] 不需要工具，直接生成回答")
                break

        # 步骤4: 生成最终回答
        yield from self._generate_final_response(
            user_query,
            messages,
            accumulated_context,
        )

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
            decision_messages = self._build_tool_decision_messages(messages, tool_selection_prompt)
            decision = self._call_llm_for_tool_selection(decision_messages)

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
        except Exception as e:
            logger.error(f"[Agent] 工具选择失败: {e}")

        return {"use_tool": False, "tool_name": None, "tool_params": None}

    def _build_tool_decision_messages(
        self, messages: list[dict], tool_selection_prompt: str
    ) -> list[dict]:
        """构建工具选择决策消息，包含完整的上下文但排除工具相关消息"""
        decision_messages = [{"role": "system", "content": tool_selection_prompt}]

        # 添加所有非工具相关的消息（保留待办上下文和对话历史）
        for msg in messages:
            # 跳过系统提示词（使用新的工具选择提示词）
            if msg.get("role") == "system":
                continue
            content = msg.get("content", "")
            # 跳过工具调用和工具结果相关的消息
            if content.startswith("[工具调用:") or content.startswith("[工具结果]"):
                continue
            # 保留待办上下文、对话历史和用户查询
            decision_messages.append(msg)

        return decision_messages

    def _call_llm_for_tool_selection(self, decision_messages: list[dict]) -> dict[str, Any] | None:
        """调用 LLM 进行工具选择并解析响应"""
        response = self.llm_client.client.chat.completions.create(
            model=self.llm_client.model,
            messages=decision_messages,
            temperature=0.1,  # 低温度确保稳定决策
            max_tokens=200,
        )

        decision_text = response.choices[0].message.content.strip()

        # 解析 JSON 响应
        try:
            # 清理可能的 markdown 代码块
            clean_text = decision_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            return json.loads(clean_text)
        except json.JSONDecodeError:
            logger.warning(
                f"[Agent] 工具选择响应解析失败: {decision_text}",
            )
            return None

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

    def _format_tool_result(self, tool_name: str, result: ToolResult) -> str:
        """格式化工具结果"""
        if not result.success:
            return f"工具 {tool_name} 执行失败: {result.error}"

        formatted = f"工具 {tool_name} 执行结果：\n{result.content}"

        # 如果有来源信息，添加到末尾
        if result.metadata and "sources" in result.metadata:
            sources = result.metadata["sources"]
            formatted += "\n\nSources:"
            for idx, source in enumerate(sources, start=1):
                formatted += f"\n{idx}. {source['title']} ({source['url']})"

        return formatted

    def _evaluate_task_completion(
        self,
        user_query: str,
        messages: list[dict],
        tool_result: ToolResult,
    ) -> bool:
        """
        评估任务是否完成

        Returns:
            True: 需要继续使用工具
            False: 可以生成最终回答
        """
        # 如果工具执行失败，继续尝试
        if not tool_result.success:
            return True

        # 使用 LLM 评估
        evaluation_prompt = get_prompt(
            "agent",
            "task_evaluation",
            user_query=user_query,
            tool_result=tool_result.content[:500],  # 限制长度
        )

        if not evaluation_prompt:
            evaluation_prompt = self._get_default_evaluation_prompt()

        try:
            eval_messages = [
                {"role": "system", "content": evaluation_prompt},
                {
                    "role": "user",
                    "content": (f"用户查询: {user_query}\n\n工具结果: {tool_result.content[:500]}"),
                },
            ]

            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=eval_messages,
                temperature=0.1,
                max_tokens=100,
            )

            eval_text = response.choices[0].message.content.strip().lower()

            # 简单判断：如果包含"完成"、"足够"等关键词，认为可以生成回答
            completion_keywords = ["完成", "足够", "可以", "complete", "sufficient"]
            if any(keyword in eval_text for keyword in completion_keywords):
                return False
            return True
        except Exception as e:
            logger.error(f"[Agent] 任务评估失败: {e}")
            # 默认继续
            return True

    def _generate_final_response(
        self,
        user_query: str,
        messages: list[dict],
        accumulated_context: list[str],
    ) -> Generator[str]:
        """生成最终回答"""
        # 构建包含所有工具结果的最终消息
        final_messages = messages.copy()

        # 检查是否使用了 web_search 工具（通过检查消息历史）
        used_web_search = any(
            msg.get("content", "").startswith("[工具调用: web_search]") for msg in messages
        )

        if accumulated_context:
            # 如果有工具结果，构建强调工具结果的用户消息
            context_text = "\n\n".join(accumulated_context)
            logger.info(
                f"[Agent] 生成最终回答，工具结果长度: {len(context_text)} 字符",
            )

            # 构建用户消息
            base_instruction = (
                f"用户问题：{user_query}\n\n"
                f"工具执行结果：\n{context_text}\n\n"
                "请严格基于上述工具执行结果回答用户的问题。"
                "如果工具结果中包含相关信息，必须使用这些信息。"
                "不要使用过时的知识或猜测，只基于工具提供的搜索结果。"
                "当工具结果与你的训练数据冲突时，以工具结果为准（工具结果代表最新的实时信息）。"
            )

            # 如果使用了 web_search，添加 Sources 格式要求
            if used_web_search:
                base_instruction += (
                    "\n\n**重要格式要求（必须严格遵守）：**"
                    "\n1. 在回答中引用信息时，必须使用引用标记格式：[[1]]、[[2]] 等，数字对应搜索结果编号"
                    '\n2. 在回答的末尾，必须添加一个 "Sources:" 段落，列出所有引用的来源'
                    "\n3. Sources 段落的格式必须严格按照以下格式（与工具执行结果中的格式一致）："
                    "\n   Sources:"
                    "\n   1. 标题 (URL)"
                    "\n   2. 标题 (URL)"
                    "\n   ..."
                    "\n4. 工具执行结果中已经包含了 Sources 列表，请直接使用这些来源信息，不要修改格式"
                    '\n5. 确保 Sources 段落与回答正文之间有两个空行（即 "\\n\\nSources:"）'
                )

            final_messages.append(
                {
                    "role": "user",
                    "content": base_instruction,
                }
            )
        else:
            # 没有工具结果，直接基于原始查询回答
            # 重要：明确告诉 LLM 不要假装使用工具
            final_messages.append(
                {
                    "role": "user",
                    "content": (
                        f"{user_query}\n\n"
                        "**重要提示：**\n"
                        "本次回答没有使用任何工具。请直接基于你的知识回答，"
                        "不要提及'正在搜索'、'使用工具'、'工具执行'、'web_search'等词汇，"
                        "不要生成工具调用的描述，不要假装使用了工具。"
                        "如果问题需要最新信息但你无法提供，请诚实说明。"
                    ),
                }
            )

        # 流式生成回答
        try:
            yield from self.llm_client.stream_chat(
                messages=final_messages,
                temperature=0.7,
            )
        except Exception as e:
            logger.error(f"[Agent] 生成最终回答失败: {e}")
            yield f"生成回答时出现错误: {str(e)}"

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

    def _get_default_evaluation_prompt(self) -> str:
        """默认任务评估提示词"""
        return """评估工具执行结果是否足够回答用户的问题。

如果工具结果已经包含足够信息来回答用户问题，返回"完成"。
如果需要更多信息，返回"继续"。

只返回"完成"或"继续"。"""
