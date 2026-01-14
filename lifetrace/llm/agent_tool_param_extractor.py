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

    def _extract_search_query(self, instruction: str, state: AgentState) -> str:
        """从步骤指令和上下文中提取搜索查询词"""
        query = instruction.strip()

        # 如果指令太长，尝试提取关键词
        if len(query) > self.MAX_QUERY_LENGTH:
            preview_len = self.QUERY_PREVIEW_LENGTH
            query = query[:preview_len] if "." not in query[:preview_len] else query.split(".")[0]

        return query

    def extract_tool_params_from_context(self, step: PlanStep, state: AgentState) -> dict[str, Any]:
        """从上下文和步骤指令中提取工具参数（使用规则优先）"""
        params = {}

        # 提取查询关键词（用于web_search）
        if step.suggested_tool == "web_search":
            params["query"] = self._extract_search_query(step.instruction, state)
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

        prompt = f"""你是一个工具参数提取器。
当前步骤指令：{step.instruction}
先前上下文：{scratchpad_context}
用户原始查询：{state.user_query}

需要为工具 "{tool.name}" 提取参数。

工具参数Schema：
{tool_schema_json}

**提取规则：**
1. 仔细分析步骤指令和先前上下文，找出所有可用的信息
2. 对于必需参数，必须从上下文中提取或推断出合理的值
3. 如果参数是数组类型（如 missing_fields），请根据上下文推断应该包含哪些值
4. 如果参数是字符串类型（如 user_input, text），请从用户查询或步骤指令中提取
5. 如果确实无法提取某个必需参数，可以使用空字符串或空数组作为默认值，但尽量提取有意义的值

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
