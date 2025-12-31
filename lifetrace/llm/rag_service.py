import asyncio
from collections.abc import Generator
from datetime import datetime
from typing import Any

from lifetrace.llm.context_builder import ContextBuilder
from lifetrace.llm.llm_client import LLMClient
from lifetrace.llm.retrieval_service import RetrievalService
from lifetrace.storage import chat_mgr, project_mgr, task_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.query_parser import QueryConditions, QueryParser
from lifetrace.util.settings import settings
from lifetrace.util.time_utils import get_utc_now

logger = get_logger()


class RAGService:
    """RAG (检索增强生成) 服务，整合查询解析、数据检索、上下文构建和LLM生成"""

    def __init__(self):
        """
        初始化RAG服务
        """
        self.llm_client = LLMClient()
        self.retrieval_service = RetrievalService()
        self.context_builder = ContextBuilder()
        self.query_parser = QueryParser(self.llm_client)

        logger.info("RAG服务初始化完成")

    def _handle_direct_query(
        self, user_query: str, intent_result: dict, start_time: datetime
    ) -> dict[str, Any]:
        """处理不需要数据库查询的直接回复"""
        logger.info(f"用户意图不需要数据库查询: {intent_result['intent_type']}")
        if self.llm_client.is_available():
            response_text = self._generate_direct_response(user_query, intent_result)
        else:
            response_text = self._fallback_direct_response(user_query, intent_result)

        processing_time = (get_utc_now() - start_time).total_seconds()
        return {
            "success": True,
            "response": response_text,
            "query_info": {
                "original_query": user_query,
                "intent_classification": intent_result,
                "requires_database": False,
            },
            "performance": {
                "processing_time_seconds": processing_time,
                "timestamp": start_time.isoformat(),
            },
        }

    def _get_statistics_if_needed(
        self, query_type: str, user_query: str, parsed_query
    ) -> dict | None:
        """根据查询类型获取统计信息"""
        if query_type != "statistics" and "统计" not in user_query:
            return None

        if isinstance(parsed_query, QueryConditions):
            conditions = parsed_query
        else:
            conditions = QueryConditions(
                start_date=parsed_query.get("start_date"),
                end_date=parsed_query.get("end_date"),
                app_names=parsed_query.get("app_names", []),
                keywords=parsed_query.get("keywords", []),
            )
        return self.retrieval_service.get_statistics(conditions)

    def _build_context_for_query(
        self, query_type: str, user_query: str, retrieved_data: list, stats: dict | None
    ) -> str:
        """根据查询类型构建上下文"""
        logger.info("开始构建上下文")
        if query_type == "statistics":
            return self.context_builder.build_statistics_context(user_query, retrieved_data, stats)
        if query_type == "search":
            return self.context_builder.build_search_context(user_query, retrieved_data)
        return self.context_builder.build_summary_context(user_query, retrieved_data)

    async def process_query(self, user_query: str, max_results: int = 50) -> dict[str, Any]:
        """处理用户查询的完整RAG流水线"""
        start_time = get_utc_now()

        try:
            logger.info(f"开始处理查询: {user_query}")
            intent_result = self.llm_client.classify_intent(user_query)

            # 不需要数据库查询时直接返回
            if not intent_result.get("needs_database", True):
                return self._handle_direct_query(user_query, intent_result, start_time)

            # 查询解析和检索
            logger.info("需要数据库查询，开始查询解析")
            parsed_query = self.query_parser.parse_query(user_query)
            query_type = "statistics" if "统计" in user_query else "search"

            logger.info("开始数据检索")
            retrieved_data = self.retrieval_service.search_by_conditions(parsed_query, max_results)

            # 获取统计和构建上下文
            stats = self._get_statistics_if_needed(query_type, user_query, parsed_query)
            context_text = self._build_context_for_query(
                query_type, user_query, retrieved_data, stats
            )

            # LLM生成
            logger.info("开始LLM生成")
            if self.llm_client.is_available():
                response_text = self.llm_client.generate_summary(user_query, retrieved_data)
            else:
                response_text = self._fallback_response(user_query, retrieved_data, stats)

            processing_time = (get_utc_now() - start_time).total_seconds()
            logger.info(f"查询处理完成，耗时 {processing_time:.2f} 秒")

            return {
                "success": True,
                "response": response_text,
                "query_info": {
                    "original_query": user_query,
                    "intent_classification": intent_result,
                    "parsed_query": parsed_query,
                    "query_type": query_type,
                    "requires_database": True,
                },
                "retrieval_info": {
                    "total_found": len(retrieved_data),
                    "data_summary": self._summarize_retrieved_data(retrieved_data),
                },
                "context_info": {
                    "context_length": len(context_text),
                    "llm_available": self.llm_client.is_available(),
                },
                "performance": {
                    "processing_time_seconds": processing_time,
                    "timestamp": start_time.isoformat(),
                },
                "statistics": stats,
            }

        except Exception as e:
            logger.error(f"RAG查询处理失败: {e}")
            return {
                "success": False,
                "error": str(e),
                "response": "抱歉，处理您的查询时出现了错误。请稍后重试。",
                "query_info": {"original_query": user_query},
                "performance": {
                    "processing_time_seconds": (datetime.now() - start_time).total_seconds(),
                    "timestamp": start_time.isoformat(),
                },
            }

    def process_query_sync(self, user_query: str, max_results: int = 50) -> dict[str, Any]:
        """
        同步版本的查询处理

        Args:
            user_query: 用户的自然语言查询
            max_results: 最大检索结果数量

        Returns:
            包含生成结果和相关信息的字典
        """
        return asyncio.run(self.process_query(user_query, max_results))

    def post_stream_decision(self, user_query: str, output_text: str) -> None:
        """
        流式输出完成后的判定/记录钩子：
        - 用于执行那些“必须拿到完整输出才能判断”的逻辑（例如：是否需要追加免责声明、是否触发某些后续动作等）
        - 默认实现仅做日志记录，后续可按需扩展
        """
        try:
            if not output_text:
                return
            # 示例：如果输出包含特定提示词，则记录到日志或触发后续处理
            keywords = ["免责声明", "敏感内容", "注意", "总结"]
            if any(kw in output_text for kw in keywords):
                logger.info(
                    f"[post_stream] 输出包含关键提示，query='{user_query[:50]}...' 触发标记"
                )
            else:
                logger.debug("[post_stream] 无特殊标记")
        except Exception as e:
            logger.debug(f"[post_stream] 处理异常已忽略: {e}")

    def stream_query(
        self,
        user_query: str,
        max_results: int = 50,
        temperature_direct: float = 0.7,
        temperature_rag: float = 0.3,
    ) -> Generator[str]:
        """流式处理用户查询，逐token yield 文本"""
        try:
            intent_result = self.llm_client.classify_intent(user_query)
            needs_db = intent_result.get("needs_database", True)

            # 不需要数据库：直接对话
            if not needs_db:
                yield from self._stream_direct_response(
                    user_query, intent_result, temperature_direct
                )
                return

            # 需要数据库：检索 + 生成
            yield from self._stream_with_retrieval(user_query, max_results, temperature_rag)

        except Exception as e:
            logger.error(f"RAG 流式处理失败: {e}")
            error_text = "\n[提示] 流式处理出现异常，已结束。"
            yield error_text
            try:
                self.post_stream_decision(user_query, error_text)
            except Exception:
                pass

    def _stream_direct_response(
        self, user_query: str, intent_result: dict, temperature: float
    ) -> Generator[str]:
        """流式处理直接对话（不需要数据库）"""
        if not self.llm_client.is_available():
            fallback_text = self._fallback_direct_response(user_query, intent_result)
            yield fallback_text
            self.post_stream_decision(user_query, fallback_text)
            return

        intent_type = intent_result.get("intent_type", "general_chat")
        system_prompt = get_prompt(
            "rag", "system_help" if intent_type == "system_help" else "general_chat"
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query},
        ]

        output_chunks: list[str] = []
        for text in self.llm_client.stream_chat(messages=messages, temperature=temperature):
            if text:
                output_chunks.append(text)
                yield text
        self.post_stream_decision(user_query, "".join(output_chunks))

    def _stream_with_retrieval(
        self, user_query: str, max_results: int, temperature: float
    ) -> Generator[str]:
        """流式处理带检索的查询"""
        parsed_query = self.query_parser.parse_query(user_query)
        query_type = "statistics" if "统计" in user_query else "search"
        retrieved_data = self.retrieval_service.search_by_conditions(parsed_query, max_results)

        # 获取统计信息
        stats = None
        if query_type == "statistics" or "统计" in user_query:
            try:
                stats = self._get_statistics_if_needed(query_type, user_query, parsed_query)
            except Exception:
                stats = None

        # 构建上下文
        context_text = self._build_context_for_query(query_type, user_query, retrieved_data, stats)

        # LLM 不可用时返回备选
        if not self.llm_client.is_available():
            fallback_text = self._fallback_response(user_query, retrieved_data, stats)
            yield fallback_text
            self.post_stream_decision(user_query, fallback_text)
            return

        # 流式生成
        system_prompt = get_prompt("rag", "history_analysis")
        user_prompt = get_prompt(
            "rag", "user_query_template", query=user_query, context=context_text
        )
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        output_chunks: list[str] = []
        for text in self.llm_client.stream_chat(messages=messages, temperature=temperature):
            if text:
                output_chunks.append(text)
                yield text
        self.post_stream_decision(user_query, "".join(output_chunks))

    def get_query_suggestions(self, partial_query: str = "") -> list[str]:
        """
        获取查询建议

        Args:
            partial_query: 部分查询文本

        Returns:
            查询建议列表
        """
        suggestions = [
            "总结今天的微信聊天记录",
            "查找包含'会议'的所有记录",
            "统计最近一周各应用的使用情况",
            "搜索昨天浏览器中的内容",
            "总结最近的工作相关截图",
            "查找包含'项目'关键词的记录",
            "统计本月QQ聊天记录数量",
            "搜索最近3天的学习资料",
            "总结上周的网页浏览记录",
            "查找包含'文档'的所有应用记录",
        ]

        if partial_query:
            # 简单的模糊匹配
            filtered_suggestions = [
                s for s in suggestions if any(word in s for word in partial_query.split())
            ]
            return filtered_suggestions[:5]

        return suggestions[:5]

    def get_supported_query_types(self) -> dict[str, Any]:
        """
        获取支持的查询类型信息

        Returns:
            查询类型信息字典
        """
        return {
            "query_types": {
                "summary": {
                    "name": "总结",
                    "description": "对历史记录进行总结和概括",
                    "examples": ["总结今天的微信聊天", "概括最近的工作记录"],
                },
                "search": {
                    "name": "搜索",
                    "description": "搜索包含特定关键词的记录",
                    "examples": ["查找包含'会议'的记录", "搜索项目相关内容"],
                },
                "statistics": {
                    "name": "统计",
                    "description": "统计和分析历史记录数据",
                    "examples": ["统计各应用使用情况", "分析最近一周的活动"],
                },
            },
            "supported_apps": [
                "WeChat",
                "QQ",
                "Browser",
                "Chrome",
                "Firefox",
                "Edge",
                "Word",
                "Excel",
                "PowerPoint",
                "Notepad",
                "VSCode",
            ],
            "time_expressions": [
                "今天",
                "昨天",
                "最近3天",
                "本周",
                "上周",
                "本月",
                "上月",
            ],
        }

    def _summarize_retrieved_data(self, retrieved_data: list[dict[str, Any]]) -> dict[str, Any]:
        """总结检索到的数据"""
        if not retrieved_data:
            return {"apps": {}, "time_range": None, "total": 0}

        app_counts = {}
        timestamps = []

        for record in retrieved_data:
            app_name = record.get("app_name", "未知应用")
            app_counts[app_name] = app_counts.get(app_name, 0) + 1

            timestamp = record.get("timestamp")
            if timestamp:
                timestamps.append(timestamp)

        time_range = None
        if timestamps:
            timestamps.sort()
            time_range = {"earliest": timestamps[0], "latest": timestamps[-1]}

        return {
            "apps": app_counts,
            "time_range": time_range,
            "total": len(retrieved_data),
        }

    def _fallback_response(
        self,
        user_query: str,
        retrieved_data: list[dict[str, Any]],
        stats: dict[str, Any] = None,
    ) -> str:
        """
        备用响应生成（当LLM不可用时）

        Args:
            user_query: 用户查询
            retrieved_data: 检索到的数据
            stats: 统计信息

        Returns:
            备用响应文本
        """
        if not retrieved_data:
            return f"抱歉，没有找到与查询 '{user_query}' 相关的历史记录。"

        response_parts = [f"根据您的查询 '{user_query}'，我找到了以下信息：", ""]

        # 基础统计
        response_parts.append(f"📊 总共找到 {len(retrieved_data)} 条相关记录")

        # 应用分布
        app_summary = self._summarize_retrieved_data(retrieved_data)
        if app_summary["apps"]:
            response_parts.append("\n📱 应用分布：")
            for app, count in sorted(app_summary["apps"].items(), key=lambda x: x[1], reverse=True):
                response_parts.append(f"  • {app}: {count} 条记录")

        # 时间范围
        if app_summary["time_range"]:
            try:
                earliest = datetime.fromisoformat(
                    app_summary["time_range"]["earliest"].replace("Z", "+00:00")
                )
                latest = datetime.fromisoformat(
                    app_summary["time_range"]["latest"].replace("Z", "+00:00")
                )
                response_parts.append(
                    f"\n⏰ 时间范围: {earliest.strftime('%Y-%m-%d %H:%M')} 至 {latest.strftime('%Y-%m-%d %H:%M')}"
                )
            except:  # noqa: E722
                pass

        # 最新记录示例
        if retrieved_data:
            response_parts.append("\n📝 最新记录示例：")
            latest_record = retrieved_data[0]
            timestamp = latest_record.get("timestamp", "未知时间")
            app_name = latest_record.get("app_name", "未知应用")
            ocr_text = latest_record.get("ocr_text", "无内容")[:100]

            response_parts.append(f"  时间: {timestamp}")
            response_parts.append(f"  应用: {app_name}")
            response_parts.append(f"  内容: {ocr_text}...")

        response_parts.append("\n💡 提示：您可以使用更具体的关键词来获得更精确的结果。")

        return "\n".join(response_parts)

    def health_check(self) -> dict[str, Any]:
        """
        健康检查

        Returns:
            服务状态信息
        """
        return {
            "rag_service": "healthy",
            "llm_client": ("available" if self.llm_client.is_available() else "unavailable"),
            "database": "connected",
            "components": {
                "retrieval_service": "ready",
                "context_builder": "ready",
                "query_parser": "ready",
            },
            "timestamp": get_utc_now().isoformat(),
        }

    def _generate_direct_response(self, user_query: str, intent_result: dict[str, Any]) -> str:
        """
        为不需要数据库查询的用户输入生成直接回复

        Args:
            user_query: 用户查询
            intent_result: 意图识别结果

        Returns:
            生成的回复文本
        """
        try:
            intent_type = intent_result.get("intent_type", "general_chat")

            if intent_type == "system_help":
                system_prompt = """
你是LifeTrace的智能助手。LifeTrace是一个生活轨迹记录和分析系统，主要功能包括：
1. 自动截图记录用户的屏幕活动
2. OCR文字识别和内容分析
3. 应用使用情况统计
4. 智能搜索和查询功能

请根据用户的问题提供有用的帮助信息。
"""
            else:
                system_prompt = """
你是LifeTrace的智能助手，请以友好、自然的方式与用户对话。
如果用户需要查询数据或统计信息，请引导他们使用具体的查询语句。
"""

            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_query},
                ],
                temperature=0.7,
                max_tokens=500,
            )

            # 记录LLM响应到日志
            llm_response = response.choices[0].message.content.strip()
            logger.info(f"[LLM Direct Response] {llm_response}")
            logger.info(f"LLM直接响应: {llm_response}")

            return llm_response

        except Exception as e:
            logger.error(f"直接响应生成失败: {e}")
            return self._fallback_direct_response(user_query, intent_result)

    def _fallback_direct_response(self, user_query: str, intent_result: dict[str, Any]) -> str:
        """
        当LLM不可用时的直接回复备用方案

        Args:
            user_query: 用户查询
            intent_result: 意图识别结果

        Returns:
            备用回复文本
        """
        intent_type = intent_result.get("intent_type", "general_chat")

        if intent_type == "system_help":
            return """
LifeTrace是一个生活轨迹记录和分析系统，主要功能包括：

📸 **自动截图记录**
- 定期捕获屏幕内容
- 记录应用使用情况

🔍 **智能搜索**
- 搜索历史截图
- 基于OCR文字内容查找

📊 **使用统计**
- 应用使用时长统计
- 活动模式分析

💬 **智能问答**
- 自然语言查询
- 个性化数据分析

如需查询具体数据，请使用如"搜索包含编程的截图"或"统计最近一周的应用使用情况"等语句。
"""
        elif intent_type == "general_chat":
            greetings = [
                "你好！我是LifeTrace的智能助手，很高兴为您服务！",
                "您好！有什么可以帮助您的吗？",
                "欢迎使用LifeTrace！我可以帮您查询和分析您的生活轨迹数据。",
            ]

            if any(word in user_query.lower() for word in ["你好", "hello", "hi"]):
                return greetings[0] + "\n\n您可以询问我关于LifeTrace的功能，或者直接查询您的数据。"
            elif any(word in user_query.lower() for word in ["谢谢", "thanks"]):
                return "不客气！如果还有其他问题，随时可以问我。"
            else:
                return greetings[1] + "\n\n您可以尝试搜索截图、查询应用使用情况，或者询问系统功能。"
        else:
            return "我理解您的问题，但可能需要更多信息才能提供准确的回答。您可以尝试更具体的查询，比如搜索特定内容或统计使用情况。"

    def _get_task_status_emoji(self, status: str) -> str:
        """获取任务状态对应的 emoji"""
        return {
            "pending": "⏳",
            "in_progress": "🔄",
            "completed": "✅",
            "cancelled": "❌",
        }.get(status, "📝")

    def _format_task_line(self, task: dict, truncate_desc: bool = True) -> str:
        """格式化单个任务行"""
        MAX_TASK_DESCRIPTION_LENGTH = 50
        status = task.get("status", "pending")
        status_emoji = self._get_task_status_emoji(status)
        task_line = f"{status_emoji} [{status}] {task.get('name', '未命名任务')}"

        if task.get("description"):
            description = task.get("description")
            if truncate_desc and len(description) > MAX_TASK_DESCRIPTION_LENGTH:
                description = description[:MAX_TASK_DESCRIPTION_LENGTH] + "..."
            task_line += f"\n   描述: {description}"
        return task_line

    def _get_project_tasks_info(
        self, project_id: int, task_ids: list[int] | None
    ) -> tuple[dict | None, str, str | None]:
        """获取项目和任务信息"""
        project_info = project_mgr.get_project(project_id)
        logger.info(f"[stream] 获取到项目信息: {project_info}")

        tasks_info_str = "暂无任务"
        selected_tasks_info_str = None

        # 获取所有任务
        tasks = task_mgr.list_tasks(project_id, limit=100)
        if tasks:
            tasks_info_str = "\n".join(
                self._format_task_line(task, truncate_desc=True) for task in tasks
            )
            logger.info(f"[stream] 获取到 {len(tasks)} 个任务")
        else:
            logger.info(f"[stream] 项目 {project_id} 暂无任务")

        # 获取选中任务的详细信息
        if task_ids:
            selected_tasks = []
            for task_id in task_ids:
                task = task_mgr.get_task(task_id)
                if task:
                    selected_tasks.append(self._format_task_line(task, truncate_desc=False))
            if selected_tasks:
                selected_tasks_info_str = "\n\n".join(selected_tasks)
                logger.info(f"[stream] 获取到 {len(selected_tasks)} 个选中的任务")

        return project_info, tasks_info_str, selected_tasks_info_str

    def _append_history_messages(self, messages: list, session_id: str, history_limit: int) -> None:
        """添加历史对话消息"""
        try:
            history_messages = chat_mgr.get_messages(session_id, limit=history_limit * 2)
            for msg in history_messages:
                if msg["role"] in ["user", "assistant"]:
                    messages.append({"role": msg["role"], "content": msg["content"]})
            if history_messages:
                logger.info(f"[stream] 添加了 {len(history_messages)} 条历史消息")
        except Exception as e:
            logger.warning(f"[stream] 获取历史消息失败: {e}")

    def _get_system_prompt_for_project(
        self,
        project_info: dict,
        tasks_info_str: str,
        selected_tasks_info_str: str | None,
        with_data: bool = False,
    ) -> str:
        """获取项目对话的系统提示词"""
        project_name = project_info.get("name", "未命名项目")
        project_goal = project_info.get("goal", "暂无目标描述")

        if with_data:
            if selected_tasks_info_str:
                return get_prompt(
                    "project_assistant",
                    "system_prompt_with_data_and_selected_tasks",
                    project_name=project_name,
                    project_goal=project_goal,
                    selected_tasks_info=selected_tasks_info_str,
                    tasks_info=tasks_info_str,
                )
            return get_prompt(
                "project_assistant",
                "system_prompt_with_data",
                project_name=project_name,
                project_goal=project_goal,
                tasks_info=tasks_info_str,
            )

        if selected_tasks_info_str:
            return get_prompt(
                "project_assistant",
                "system_prompt_with_selected_tasks",
                project_name=project_name,
                project_goal=project_goal,
                selected_tasks_info=selected_tasks_info_str,
                tasks_info=tasks_info_str,
            )
        return get_prompt(
            "project_assistant",
            "system_prompt",
            project_name=project_name,
            project_goal=project_goal,
            tasks_info=tasks_info_str,
        )

    def _build_messages_without_db(
        self,
        user_query: str,
        intent_result: dict,
        project_info: dict | None,
        tasks_info_str: str,
        selected_tasks_info_str: str | None,
    ) -> list[dict]:
        """构建不需要数据库查询的消息"""
        intent_type = intent_result.get("intent_type", "general_chat")

        if project_info:
            system_prompt = self._get_system_prompt_for_project(
                project_info, tasks_info_str, selected_tasks_info_str, with_data=False
            )
        elif intent_type == "system_help":
            system_prompt = get_prompt("rag", "system_help")
        else:
            system_prompt = get_prompt("rag", "general_chat")

        return [{"role": "system", "content": system_prompt}]

    def _build_messages_with_db(
        self,
        user_query: str,
        project_id: int | None,
        project_info: dict | None,
        tasks_info_str: str,
        selected_tasks_info_str: str | None,
    ) -> list[dict]:
        """构建需要数据库查询的消息"""
        parsed_query = self.query_parser.parse_query(user_query)
        if project_id:
            parsed_query.project_id = project_id

        query_type = "statistics" if "统计" in user_query else "search"
        retrieved_data = self.retrieval_service.search_by_conditions(parsed_query, 500)

        # 构建上下文
        if query_type == "statistics":
            stats = None
            if isinstance(parsed_query, QueryConditions):
                stats = self.retrieval_service.get_statistics(parsed_query)
            context_text = self.context_builder.build_statistics_context(
                user_query, retrieved_data, stats
            )
        else:
            context_text = self.context_builder.build_search_context(user_query, retrieved_data)
        logger.debug(f"构建的上下文内容: {context_text}")

        # 确定系统内容
        if project_info:
            project_context = self._get_system_prompt_for_project(
                project_info, tasks_info_str, selected_tasks_info_str, with_data=True
            )
            system_content = f"{project_context}\n\n{context_text}"
        else:
            system_content = context_text

        return [{"role": "system", "content": system_content}]

    async def process_query_stream(
        self,
        user_query: str,
        project_id: int | None = None,
        task_ids: list[int] | None = None,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        """为流式接口处理查询，返回构建好的messages和temperature"""
        try:
            logger.info(
                f"[stream] 开始处理查询: {user_query}, project_id: {project_id}, "
                f"task_ids: {task_ids}, session_id: {session_id}"
            )
            intent_result = self.llm_client.classify_intent(user_query)
            needs_db = intent_result.get("needs_database", True)

            # 获取历史对话配置
            enable_history = settings.chat.enable_history
            history_limit = settings.chat.history_limit

            # 获取项目和任务信息
            project_info, tasks_info_str, selected_tasks_info_str = None, "暂无任务", None
            if project_id:
                project_info, tasks_info_str, selected_tasks_info_str = (
                    self._get_project_tasks_info(project_id, task_ids)
                )

            # 构建消息
            if needs_db:
                messages = self._build_messages_with_db(
                    user_query, project_id, project_info, tasks_info_str, selected_tasks_info_str
                )
                temperature = 0.3
            else:
                messages = self._build_messages_without_db(
                    user_query, intent_result, project_info, tasks_info_str, selected_tasks_info_str
                )
                temperature = 0.7

            # 添加历史对话
            if enable_history and session_id and history_limit > 0:
                self._append_history_messages(messages, session_id, history_limit)

            # 添加当前用户消息
            messages.append({"role": "user", "content": user_query})

            return {
                "success": True,
                "messages": messages,
                "temperature": temperature,
                "intent_result": intent_result,
            }

        except Exception as e:
            logger.error(f"[stream] 处理查询失败: {e}")
            return {
                "success": False,
                "response": f"处理查询时出现错误: {str(e)}",
                "messages": [],
                "temperature": 0.7,
            }
