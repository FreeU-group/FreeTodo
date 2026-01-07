"""
RAG 流式处理模块
包含流式查询处理逻辑
"""

from collections.abc import Callable, Generator
from dataclasses import dataclass
from typing import Any

from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.query_parser import QueryConditions

logger = get_logger()


@dataclass
class RAGStreamContext:
    """RAG 流式处理上下文，封装所有服务依赖"""

    llm_client: Any
    retrieval_service: Any
    context_builder: Any
    query_parser: Any
    post_stream_callback: Callable[[str, str], None]
    fallback_response_func: Callable[..., str]
    get_statistics_func: Callable[..., dict | None]


def stream_direct_response(
    llm_client,
    user_query: str,
    intent_result: dict,
    temperature: float,
    post_stream_callback: Callable[[str, str], None],
    fallback_response_func: Callable[..., str],
) -> Generator[str]:
    """流式处理直接对话（不需要数据库）"""
    if not llm_client.is_available():
        fallback_text = fallback_response_func(user_query, intent_result)
        yield fallback_text
        post_stream_callback(user_query, fallback_text)
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
    for text in llm_client.stream_chat(messages=messages, temperature=temperature):
        if text:
            output_chunks.append(text)
            yield text
    post_stream_callback(user_query, "".join(output_chunks))


def stream_with_retrieval(
    ctx: RAGStreamContext,
    user_query: str,
    max_results: int,
    temperature: float,
) -> Generator[str]:
    """流式处理带检索的查询

    Args:
        ctx: RAG 流式处理上下文
        user_query: 用户查询
        max_results: 最大结果数
        temperature: 温度参数
    """
    parsed_query = ctx.query_parser.parse_query(user_query)
    query_type = "statistics" if "统计" in user_query else "search"
    retrieved_data = ctx.retrieval_service.search_by_conditions(parsed_query, max_results)

    # 获取统计信息
    stats = None
    if query_type == "statistics" or "统计" in user_query:
        try:
            stats = ctx.get_statistics_func(query_type, user_query, parsed_query)
        except Exception:
            stats = None

    # 构建上下文
    context_text = _build_context_for_query(
        ctx.context_builder, query_type, user_query, retrieved_data, stats
    )

    # LLM 不可用时返回备选
    if not ctx.llm_client.is_available():
        fallback_text = ctx.fallback_response_func(user_query, retrieved_data, stats)
        yield fallback_text
        ctx.post_stream_callback(user_query, fallback_text)
        return

    # 流式生成
    system_prompt = get_prompt("rag", "history_analysis")
    user_prompt = get_prompt("rag", "user_query_template", query=user_query, context=context_text)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    output_chunks: list[str] = []
    for text in ctx.llm_client.stream_chat(messages=messages, temperature=temperature):
        if text:
            output_chunks.append(text)
            yield text
    ctx.post_stream_callback(user_query, "".join(output_chunks))


def _build_context_for_query(
    context_builder, query_type: str, user_query: str, retrieved_data: list, stats: dict | None
) -> str:
    """根据查询类型构建上下文"""
    logger.info("开始构建上下文")
    if query_type == "statistics":
        return context_builder.build_statistics_context(user_query, retrieved_data, stats)
    if query_type == "search":
        return context_builder.build_search_context(user_query, retrieved_data)
    return context_builder.build_summary_context(user_query, retrieved_data)


def get_statistics_if_needed(
    retrieval_service, query_type: str, user_query: str, parsed_query
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
    return retrieval_service.get_statistics(conditions)
