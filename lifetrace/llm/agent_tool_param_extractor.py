"""Agent 工具参数提取模块"""

import json
from typing import Any

from lifetrace.llm.state import AgentState, PlanStep
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class AgentToolParamExtractor:
    """Agent 工具参数提取器"""

    MAX_QUERY_LENGTH = 100  # 最大查询长度
    QUERY_PREVIEW_LENGTH = 50  # 查询预览长度
    MIN_GENERIC_CONTENT_LENGTH = 10  # 泛化模式的最小具体内容长度

    def __init__(self, llm_client, tool_registry):
        self.llm_client = llm_client
        self.tool_registry = tool_registry

    def _format_scratchpad(self, scratchpad: list[dict[str, Any]]) -> str:
        """格式化scratchpad为可读的上下文字符串"""
        if not scratchpad:
            return "无先前步骤"

        parts = []
        for s in scratchpad:
            content_preview = str(s.get("content", ""))[:200]
            parts.append(f"步骤 {s['step_id']}: {s.get('tool', 'unknown')} → {content_preview}...")
        return "先前步骤:\n" + "\n".join(parts)

    def _extract_search_query(self, instruction: str, state: AgentState) -> str | None:
        """从步骤指令和上下文中提取搜索查询词

        保守策略：
        - 如果instruction已经很具体（不包含代词），直接使用
        - 如果instruction包含代词或太泛化，返回None标记，触发LLM提取
        - 避免简单的关键词提取，防止破坏用户意图

        Returns:
            str: 具体的查询词（如果规则可以提取）
            None: 表示需要LLM提取（instruction包含代词或太泛化）
        """
        instruction_text = instruction.strip()

        # 检测是否包含代词，表示需要从上下文中解析
        pronoun_indicators = ["该任务", "这个任务", "上述任务", "该todo", "这个todo"]
        has_pronoun = any(indicator in instruction_text for indicator in pronoun_indicators)

        # 检测是否太泛化（只包含通用搜索动词，没有具体内容）
        generic_patterns = [
            "搜索关于",
            "搜索如何",
            "查找相关信息",
            "搜索方法和最佳实践",
            "搜索相关信息",
        ]
        is_too_generic = any(
            pattern in instruction_text
            and len(instruction_text) - len(pattern) < self.MIN_GENERIC_CONTENT_LENGTH
            for pattern in generic_patterns
        )

        # 如果包含代词或太泛化，标记为需要LLM提取
        if has_pronoun or is_too_generic:
            logger.info(
                f"[Agent] instruction包含代词或过于泛化，将使用LLM提取查询: {instruction_text[:50]}"
            )
            return None  # 返回None，让系统fallback到LLM提取

        # 如果instruction已经很具体，直接使用（但要限制长度）
        query = instruction_text
        if len(query) > self.MAX_QUERY_LENGTH:
            preview_len = self.QUERY_PREVIEW_LENGTH
            query = query[:preview_len] if "." not in query[:preview_len] else query.split(".")[0]

        logger.info(f"[Agent] 规则提取查询成功: {query[:50]}")
        return query

    def extract_tool_params_from_context(self, step: PlanStep, state: AgentState) -> dict[str, Any]:
        """从上下文和步骤指令中提取工具参数（使用规则优先）"""
        params = {}

        # 提取查询关键词（用于web_search）
        if step.suggested_tool == "web_search":
            query = self._extract_search_query(step.instruction, state)
            if query is None:
                # 返回空字典，触发LLM提取（它已有完整的上下文：user_query、instruction、scratchpad）
                logger.info("[Agent] web_search查询需要LLM提取，返回空字典触发fallback")
                return {}
            params["query"] = query
            return params

        # 对于 extract_todo，如果上一步是 web_search，直接提取完整的搜索结果内容
        if step.suggested_tool == "extract_todo":
            # 查找上一步的 web_search 结果
            if state.scratchpad:
                last_step = state.scratchpad[-1]
                if last_step.get("tool") == "web_search":
                    # 提取完整的搜索结果内容
                    search_content = last_step.get("content", "")
                    if search_content:
                        params["text"] = search_content
                        logger.info(
                            f"[Agent] 从web_search结果中提取完整内容，长度: {len(search_content)} 字符",
                        )
                        return params

        # 对于其他工具，如果规则无法提取，返回空字典
        return params

    def extract_tool_params_with_llm(
        self, step: PlanStep, state: AgentState, tool
    ) -> dict[str, Any] | None:
        """使用LLM从上下文和步骤指令中提取工具参数"""
        scratchpad_context = self._format_scratchpad(state.scratchpad)
        tool_schema = tool.parameters_schema
        tool_schema_json = json.dumps(tool_schema, ensure_ascii=False, indent=2)

        # 格式化待办上下文（如果有）
        todo_context_text = state.todo_context if state.todo_context else "无"

        prompt = f"""你是一个工具参数提取器。
当前步骤指令：{step.instruction}
先前上下文：{scratchpad_context}
用户原始查询：{state.user_query}
待办上下文：{todo_context_text}

需要为工具 "{tool.name}" 提取参数。

工具参数Schema：
{tool_schema_json}

**提取规则：**
1. 仔细分析步骤指令、先前上下文和待办上下文，找出所有可用的信息
2. 对于必需参数，必须从上下文中提取或推断出合理的值
3. 如果参数是数组类型（如 missing_fields），请根据上下文推断应该包含哪些值
4. 如果参数是字符串类型（如 user_input, text, query），请从用户查询、步骤指令或待办上下文中提取
5. **重要**：当用户查询包含"这个任务"、"该任务"等代词时，必须参考待办上下文来理解具体任务内容
6. 如果确实无法提取某个必需参数，可以使用空字符串或空数组作为默认值，但尽量提取有意义的值

**返回格式（JSON）：**
{{
    "tool_params": {{"参数名": "参数值"}}
}}

只返回JSON，不要返回其他信息。"""

        try:
            messages = [{"role": "user", "content": prompt}]
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
            if response_text.startswith("```"):
                response_text = response_text[3:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            decision = json.loads(response_text)
            tool_params = decision.get("tool_params", {})
            logger.info(f"[Agent] LLM提取工具 {tool.name} 参数成功: {list(tool_params.keys())}")
            return tool_params
        except json.JSONDecodeError as e:
            logger.warning(f"[Agent] LLM参数提取响应解析失败: {e}")
            return None
        except Exception as e:
            logger.warning(f"[Agent] LLM参数提取失败: {e}")
            return None

    def check_required_params(self, tool, tool_params: dict[str, Any]) -> bool:
        """检查工具参数是否满足必需参数要求"""
        schema = tool.parameters_schema
        required_params = schema.get("required", [])

        for param in required_params:
            if param not in tool_params:
                logger.debug(f"[Agent] 工具 {tool.name} 缺少必需参数: {param}")
                return False

        return True

    def extract_and_validate_tool_params(
        self, step: PlanStep, state: AgentState, tool
    ) -> dict[str, Any] | None:
        """提取并验证工具参数，如果缺少参数则尝试使用LLM提取"""
        tool_params = self.extract_tool_params_from_context(step, state)

        if not self.check_required_params(tool, tool_params):
            logger.info(f"[Agent] 工具 {step.suggested_tool} 缺少必需参数，尝试使用LLM提取参数")
            llm_params = self.extract_tool_params_with_llm(step, state, tool)
            if llm_params:
                tool_params = llm_params
            else:
                logger.info("[Agent] LLM参数提取失败，跳过工具优先执行，交由LLM决策流程处理")
                return None

        if not self.check_required_params(tool, tool_params):
            logger.info(
                f"[Agent] 工具 {step.suggested_tool} LLM提取后仍缺少必需参数，跳过工具优先执行"
            )
            return None

        return tool_params
