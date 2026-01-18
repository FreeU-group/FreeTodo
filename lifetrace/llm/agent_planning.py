"""Agent 计划和复杂度检测模块"""

import json
import re

from lifetrace.llm.state import PlanStep
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


class AgentPlanningMixin:
    """Agent 计划和复杂度检测 Mixin"""

    def _should_generate_plan(self, query: str) -> bool:
        """
        判断是否需要生成计划（复杂度检测）

        **冻结节点**：此方法的分流率必须保持稳定，不允许prompt调整影响short/long分流。

        **规则优先级（强制）**：
        1. 明确CRUD操作（创建/删除/更新/查询）→ 强制short
        2. 明确多步语义操作（包含"然后"、"接着"等）→ 强制long
        3. LLM仅在规则完全无法判断时介入，且参数固定（temperature=0.1, max_tokens=100）

        Returns:
            True: 复杂任务，需要生成计划
            False: 简单任务，使用响应式循环
        """
        # ============================================================
        # 规则检查部分（优先级最高，必须优先执行）
        # ============================================================

        # 复杂指示词：包含这些词的查询强制走long路径
        complex_indicators = [
            "然后",
            "then",
            "之后",
            "after",
            "并且",
            "and",
            "接着",
            "再",
            "先",
            "再",
        ]

        # 简单模式：明确CRUD/查询操作，强制走short路径
        # 规则覆盖范围：
        # - 创建操作：创建/添加/新建 todo
        # - 删除操作：删除/移除 todo + ID
        # - 更新操作：更新/修改 todo + ID
        # - 查询操作：查询 todo（单次查询，无后续操作）
        simple_patterns = [
            r"^(创建|添加|新建).*todo",
            r"^(删除|移除).*todo.*ID\s*\d+",
            r"^(更新|修改).*todo.*ID\s*\d+",
            r"^查询.*todo",
        ]

        query_lower = query.lower()

        # 规则1：检查是否匹配简单模式（明确CRUD/查询操作）
        for pattern in simple_patterns:
            if re.search(pattern, query_lower, re.IGNORECASE):
                # 如果没有复杂指示词，强制认为是简单任务
                if not any(indicator in query for indicator in complex_indicators):
                    logger.info(f"[Agent] 规则检测：简单任务（CRUD/查询操作）- {query[:50]}")
                    return False

        # 规则2：检查复杂指示词（多步语义操作）
        if any(indicator in query for indicator in complex_indicators):
            logger.info(f"[Agent] 规则检测：复杂任务（包含复杂指示词）- {query[:50]}")
            return True

        # ============================================================
        # LLM检测部分（仅在规则无法判断时使用）
        # ============================================================
        # **冻结要求**：
        # - 此部分仅在规则完全无法判断时调用
        # - LLM参数固定：temperature=0.1, max_tokens=100（不允许prompt调整影响分流率）
        # - 如果LLM调用失败，默认返回False（简单任务）

        try:
            complexity_prompt = get_prompt("agent", "complexity_detector", user_query=query)
            if not complexity_prompt:
                # 如果没有提示词，使用规则判断（默认简单任务）
                logger.info(
                    f"[Agent] 复杂度检测：无提示词，使用规则判断（默认简单任务）- {query[:50]}"
                )
                return False

            messages = [{"role": "user", "content": complexity_prompt}]
            # 固定参数：确保prompt调整不会影响分流率
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=messages,
                temperature=0.1,  # 固定：低温度确保判断稳定
                max_tokens=100,  # 固定：限制输出长度
            )

            response_text = response.choices[0].message.content.strip()

            # 清理可能的markdown代码块
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            decision = json.loads(response_text)
            is_complex = decision.get("is_complex", False)
            logger.info(
                f"[Agent] LLM复杂度检测（规则无法判断）：{'复杂' if is_complex else '简单'} - {query[:50]}"
            )
            return is_complex

        except Exception as e:
            logger.warning(f"[Agent] 复杂度检测失败，使用规则判断（默认简单任务）: {e}")
            # 默认使用规则判断：如果没有明显复杂指示词，认为是简单任务
            return False

    def _generate_plan(self, query: str) -> list[PlanStep]:
        """
        生成执行计划

        Returns:
            PlanStep列表
        """
        try:
            # 动态获取可用工具列表
            tools_schema = self.tool_registry.get_tools_schema()
            tools_list = "\n".join(
                [f"- {tool['name']}: {tool['description']}" for tool in tools_schema]
            )

            planner_prompt = get_prompt(
                "agent",
                "planner",
                user_query=query,
                tools=tools_list,
            )
            if not planner_prompt:
                # 如果没有提示词，返回单步计划
                return [PlanStep(id=1, instruction=query, suggested_tool="")]

            messages = [{"role": "user", "content": planner_prompt}]
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=messages,
                temperature=0.3,
                max_tokens=1000,
            )

            response_text = response.choices[0].message.content.strip()

            # 清理可能的markdown代码块
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
            response_text = response_text.strip()

            plan_data = json.loads(response_text)

            # 确保是列表
            if isinstance(plan_data, dict) and "steps" in plan_data:
                plan_data = plan_data["steps"]
            elif not isinstance(plan_data, list):
                plan_data = [plan_data]

            plan = [PlanStep(**step) for step in plan_data]
            logger.info(f"[Agent] 生成计划：{len(plan)}个步骤")
            return plan

        except Exception as e:
            logger.warning(f"[Agent] 计划生成失败，使用单步计划: {e}")
            # 失败时返回单步计划
            return [PlanStep(id=1, instruction=query, suggested_tool="")]
