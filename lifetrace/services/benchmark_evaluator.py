"""Benchmark评估逻辑"""

from typing import Any

from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 简单任务使用planning时的最大步骤数阈值
MAX_PLAN_STEPS_FOR_SIMPLE_TASK = 3


class BenchmarkEvaluator:
    """Benchmark自动评估器"""

    def __init__(self):
        """初始化评估器"""
        pass

    def evaluate(
        self,
        query: str,
        execution_log: dict[str, Any],
        agent_response: str,
        category: str,
    ) -> dict[str, dict[str, Any]]:
        """
        评估测试结果

        Args:
            query: 用户查询
            execution_log: 执行日志（包含工具调用、决策过程等）
            agent_response: Agent的完整响应
            category: 测试类别

        Returns:
            评估结果字典，key为评估点名称，value为评估详情
        """
        results: dict[str, dict[str, Any]] = {}

        # 根据类别和查询内容，决定需要评估哪些点
        evaluation_points = self._get_evaluation_points_for_category(category)

        for point in evaluation_points:
            if point == "misuse_web_search":
                results[point] = self.evaluate_misuse_web_search(
                    query, execution_log, agent_response
                )
            elif point == "force_todo_creation":
                results[point] = self.evaluate_force_todo_creation(
                    query, execution_log, agent_response
                )
            elif point == "task_type_misjudge":
                results[point] = self.evaluate_task_type_misjudge(
                    query, execution_log, agent_response
                )
            elif point == "over_planning":
                results[point] = self.evaluate_over_planning(query, execution_log, agent_response)
            elif point == "redundant_search":
                results[point] = self.evaluate_redundant_search(
                    query, execution_log, agent_response
                )
            elif point == "context_reuse":
                results[point] = self.evaluate_context_reuse(query, execution_log, agent_response)

        return results

    def _get_evaluation_points_for_category(self, category: str) -> list[str]:
        """根据测试类别获取需要评估的点"""
        if category == "intent_ambiguous":
            return ["misuse_web_search", "force_todo_creation"]
        elif category == "short_long_boundary":
            return ["task_type_misjudge", "over_planning"]
        elif category == "tool_conflict":
            return ["redundant_search", "context_reuse"]
        return []

    def evaluate_misuse_web_search(
        self,
        query: str,
        execution_log: dict[str, Any],
        agent_response: str,
    ) -> dict[str, Any]:
        """
        评估是否乱用web search

        判断标准：
        - 如果查询明显不需要web search（如查询本地todo），但调用了web_search工具，则为True（乱用）
        """
        tool_calls = execution_log.get("tool_calls", [])
        web_search_calls = [call for call in tool_calls if call.get("tool_name") == "web_search"]

        # 判断查询是否需要web search
        needs_web_search_keywords = [
            "查一下",
            "搜索",
            "找",
            "租房",
            "天气",
            "新闻",
            "最新",
        ]
        query_lower = query.lower()
        needs_web_search = any(keyword in query_lower for keyword in needs_web_search_keywords)

        # 如果查询不需要web search但调用了，则为乱用
        misuse = len(web_search_calls) > 0 and not needs_web_search

        return {
            "result": misuse,
            "web_search_call_count": len(web_search_calls),
            "needs_web_search": needs_web_search,
            "details": {
                "query": query,
                "tool_calls": web_search_calls,
            },
        }

    def evaluate_force_todo_creation(
        self,
        query: str,
        execution_log: dict[str, Any],
        agent_response: str,
    ) -> dict[str, Any]:
        """
        评估是否强行写todo

        判断标准：
        - 如果查询是查询类（如"查一下明天要做什么"），不应该创建todo
        - 如果调用了create_todo工具，则为强行创建
        """
        tool_calls = execution_log.get("tool_calls", [])
        create_todo_calls = [call for call in tool_calls if call.get("tool_name") == "create_todo"]

        # 判断查询是否是查询类（不应该创建todo）
        query_keywords = ["查", "看", "什么", "哪些", "了解"]
        query_lower = query.lower()
        is_query = any(keyword in query_lower for keyword in query_keywords)

        # 如果查询是查询类但创建了todo，则为强行创建
        force_create = len(create_todo_calls) > 0 and is_query

        return {
            "result": force_create,
            "create_todo_call_count": len(create_todo_calls),
            "is_query": is_query,
            "details": {
                "query": query,
                "tool_calls": create_todo_calls,
            },
        }

    def evaluate_task_type_misjudge(
        self,
        query: str,
        execution_log: dict[str, Any],
        agent_response: str,
    ) -> dict[str, Any]:
        """
        评估是否误判任务类型（Short vs Long）

        判断标准：
        - 简单任务（如"提醒我晚上九点看论文"）应该走short路径
        - 复杂任务（如"帮我规划一下这周的学习"）应该走long路径
        - 如果简单任务走了long路径，或复杂任务走了short路径，则为误判
        """
        task_type = execution_log.get("task_type", "unknown")  # "short" or "long"
        used_planning = execution_log.get("used_planning", False)

        # 判断查询的复杂度
        simple_keywords = ["提醒", "提醒我", "设置", "记住"]
        complex_keywords = ["规划", "计划", "安排", "组织"]
        query_lower = query.lower()

        is_simple = any(keyword in query_lower for keyword in simple_keywords)
        is_complex = any(keyword in query_lower for keyword in complex_keywords)

        misjudge = False
        if is_simple and (task_type == "long" or used_planning):
            misjudge = True  # 简单任务但走了long路径
        elif is_complex and task_type == "short" and not used_planning:
            misjudge = True  # 复杂任务但走了short路径

        return {
            "result": misjudge,
            "detected_complexity": "complex"
            if is_complex
            else ("simple" if is_simple else "unknown"),
            "actual_task_type": task_type,
            "used_planning": used_planning,
            "details": {
                "query": query,
                "is_simple": is_simple,
                "is_complex": is_complex,
            },
        }

    def evaluate_over_planning(
        self,
        query: str,
        execution_log: dict[str, Any],
        agent_response: str,
    ) -> dict[str, Any]:
        """
        评估是否过度plan

        判断标准：
        - 简单任务不应该使用planning
        - 如果简单任务使用了planning，则为过度plan
        """
        used_planning = execution_log.get("used_planning", False)
        plan_steps = execution_log.get("plan_steps", [])

        # 判断查询的复杂度
        simple_keywords = ["提醒", "提醒我", "设置", "记住"]
        query_lower = query.lower()
        is_simple = any(keyword in query_lower for keyword in simple_keywords)

        over_planning = (
            used_planning and is_simple and len(plan_steps) > MAX_PLAN_STEPS_FOR_SIMPLE_TASK
        )

        return {
            "result": over_planning,
            "used_planning": used_planning,
            "plan_steps_count": len(plan_steps),
            "is_simple": is_simple,
            "details": {
                "query": query,
                "plan_steps": plan_steps,
            },
        }

    def evaluate_redundant_search(
        self,
        query: str,
        execution_log: dict[str, Any],
        agent_response: str,
    ) -> dict[str, Any]:
        """
        评估是否错误再次search

        判断标准：
        - 如果查询中提到"之前查的"、"之前找的"等，说明应该复用已有上下文
        - 如果仍然调用了web_search，则为冗余搜索
        """
        tool_calls = execution_log.get("tool_calls", [])
        web_search_calls = [call for call in tool_calls if call.get("tool_name") == "web_search"]

        # 判断查询是否提到之前查的信息
        context_keywords = ["之前", "之前查", "之前找", "刚才", "刚才查", "之前搜索"]
        query_lower = query.lower()
        mentions_previous_search = any(keyword in query_lower for keyword in context_keywords)

        redundant = mentions_previous_search and len(web_search_calls) > 0

        return {
            "result": redundant,
            "web_search_call_count": len(web_search_calls),
            "mentions_previous_search": mentions_previous_search,
            "details": {
                "query": query,
                "tool_calls": web_search_calls,
            },
        }

    def evaluate_context_reuse(
        self,
        query: str,
        execution_log: dict[str, Any],
        agent_response: str,
    ) -> dict[str, Any]:
        """
        评估是否能复用已有上下文

        判断标准：
        - 如果查询中提到"之前查的"、"之前找的"等，说明应该复用已有上下文
        - 如果响应中没有体现复用上下文，或重新调用了工具，则为未复用
        """
        tool_calls = execution_log.get("tool_calls", [])
        conversation_history = execution_log.get("conversation_history", [])

        # 判断查询是否提到之前查的信息
        context_keywords = ["之前", "之前查", "之前找", "刚才", "刚才查", "之前搜索"]
        query_lower = query.lower()
        mentions_previous_search = any(keyword in query_lower for keyword in context_keywords)

        # 如果提到之前的搜索，应该复用上下文（不应该重新调用工具）
        if mentions_previous_search:
            reused_context = len(conversation_history) > 0 and len(tool_calls) == 0
        else:
            # 如果没有提到之前的搜索，不需要评估
            reused_context = True

        return {
            "result": not reused_context if mentions_previous_search else None,
            "mentions_previous_search": mentions_previous_search,
            "conversation_history_count": len(conversation_history),
            "tool_calls_count": len(tool_calls),
            "details": {
                "query": query,
                "conversation_history": conversation_history,
                "tool_calls": tool_calls,
            },
        }
