"""
RAG (检索增强生成) 服务
整合查询解析、数据检索、上下文构建和LLM生成
"""

from collections.abc import Generator
from datetime import datetime
from typing import Any

from lifetrace.llm.context_builder import ContextBuilder
from lifetrace.llm.llm_client import LLMClient
from lifetrace.llm.retrieval_service import RetrievalService
from lifetrace.util.logging_config import get_logger
from lifetrace.util.query_parser import QueryParser
from lifetrace.util.time_utils import get_utc_now

from .rag_fallback import (
    fallback_direct_response,
    fallback_response,
    generate_direct_response,
    summarize_retrieved_data,
)
from .rag_project import RAGServices
from .rag_project import process_query_stream as _process_query_stream
from .rag_stream import (
    RAGStreamContext,
    get_statistics_if_needed,
    stream_direct_response,
    stream_with_retrieval,
)

logger = get_logger()


class RAGService:
    """RAG (检索增强生成) 服务"""

    def __init__(self):
        """初始化RAG服务"""
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
            response_text = generate_direct_response(self.llm_client, user_query, intent_result)
        else:
            response_text = fallback_direct_response(user_query, intent_result)

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
        return get_statistics_if_needed(
            self.retrieval_service, query_type, user_query, parsed_query
        )

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

            if not intent_result.get("needs_database", True):
                return self._handle_direct_query(user_query, intent_result, start_time)

            logger.info("需要数据库查询，开始查询解析")
            parsed_query = self.query_parser.parse_query(user_query)
            query_type = "statistics" if "统计" in user_query else "search"

            logger.info("开始数据检索")
            retrieved_data = self.retrieval_service.search_by_conditions(parsed_query, max_results)

            stats = self._get_statistics_if_needed(query_type, user_query, parsed_query)
            context_text = self._build_context_for_query(
                query_type, user_query, retrieved_data, stats
            )

            logger.info("开始LLM生成")
            if self.llm_client.is_available():
                response_text = self.llm_client.generate_summary(user_query, retrieved_data)
            else:
                response_text = fallback_response(user_query, retrieved_data, stats)

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
                    "data_summary": summarize_retrieved_data(retrieved_data),
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
        """同步版本的查询处理"""
        import asyncio

        return asyncio.run(self.process_query(user_query, max_results))

    def post_stream_decision(self, user_query: str, output_text: str) -> None:
        """流式输出完成后的判定/记录钩子"""
        try:
            if not output_text:
                return
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
        """流式处理用户查询"""
        try:
            intent_result = self.llm_client.classify_intent(user_query)
            needs_db = intent_result.get("needs_database", True)

            if not needs_db:
                yield from stream_direct_response(
                    self.llm_client,
                    user_query,
                    intent_result,
                    temperature_direct,
                    self.post_stream_decision,
                    fallback_direct_response,
                )
                return

            ctx = RAGStreamContext(
                llm_client=self.llm_client,
                retrieval_service=self.retrieval_service,
                context_builder=self.context_builder,
                query_parser=self.query_parser,
                post_stream_callback=self.post_stream_decision,
                fallback_response_func=fallback_response,
                get_statistics_func=self._get_statistics_if_needed,
            )
            yield from stream_with_retrieval(ctx, user_query, max_results, temperature_rag)

        except Exception as e:
            logger.error(f"RAG 流式处理失败: {e}")
            error_text = "\n[提示] 流式处理出现异常，已结束。"
            yield error_text
            try:
                self.post_stream_decision(user_query, error_text)
            except Exception:
                pass

    def get_query_suggestions(self, partial_query: str = "") -> list[str]:
        """获取查询建议"""
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
            filtered_suggestions = [
                s for s in suggestions if any(word in s for word in partial_query.split())
            ]
            return filtered_suggestions[:5]

        return suggestions[:5]

    def get_supported_query_types(self) -> dict[str, Any]:
        """获取支持的查询类型信息"""
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

    def health_check(self) -> dict[str, Any]:
        """健康检查"""
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

    async def process_query_stream(
        self,
        user_query: str,
        project_id: int | None = None,
        task_ids: list[int] | None = None,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        """为流式接口处理查询"""
        services = RAGServices(
            llm_client=self.llm_client,
            query_parser=self.query_parser,
            retrieval_service=self.retrieval_service,
            context_builder=self.context_builder,
        )
        return await _process_query_stream(
            user_query,
            project_id,
            task_ids,
            session_id,
            services,
        )
