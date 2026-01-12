"""联网搜索服务模块 - 整合 Tavily 和 LLM"""

from collections.abc import Generator

from lifetrace.llm.llm_client import LLMClient
from lifetrace.llm.tavily_client import TavilyClientWrapper
from lifetrace.util.language import get_language_instruction
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


class WebSearchService:
    """联网搜索服务，整合 Tavily 搜索结果和 LLM 生成"""

    def __init__(self):
        """初始化联网搜索服务"""
        self.tavily_client = TavilyClientWrapper()
        self.llm_client = LLMClient()
        logger.info("联网搜索服务初始化完成")

    def build_search_prompt(
        self, query: str, tavily_result: dict, todo_context: str | None = None, lang: str = "zh"
    ) -> list[dict[str, str]]:
        """
        构建用于 LLM 的搜索提示词

        Args:
            query: 用户查询
            tavily_result: Tavily 搜索结果
            todo_context: 待办事项上下文（可选）
            lang: 语言代码 ("zh" 或 "en")

        Returns:
            LLM messages 列表
        """
        # 获取 system prompt
        system_prompt = get_prompt("web_search", "system")
        # 注入语言指令
        system_prompt += get_language_instruction(lang)

        # 格式化搜索结果
        results = tavily_result.get("results", [])
        if not results:
            sources_context = "未找到相关搜索结果。"
        else:
            sources_list = []
            for idx, item in enumerate(results, start=1):
                url = item.get("url", "")
                title = item.get("title", "无标题")
                content = item.get("content", "")
                sources_list.append(f"[{idx}] {title}\nURL: {url}\n摘要: {content}")

            sources_context = "\n\n".join(sources_list)

        # 构建用户提示词，包含待办上下文（如果提供）
        user_prompt_parts = []
        if todo_context:
            user_prompt_parts.append("用户当前的待办事项上下文：")
            user_prompt_parts.append(todo_context)
            user_prompt_parts.append("")

        # 获取 user prompt 模板并格式化
        base_user_prompt = get_prompt(
            "web_search", "user_template", query=query, sources_context=sources_context
        )
        user_prompt_parts.append(base_user_prompt)

        user_prompt = "\n".join(user_prompt_parts)

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    def _parse_message_with_context(self, message: str) -> tuple[str, str | None]:
        """
        解析包含待办上下文的消息，提取用户查询和上下文

        Args:
            message: 完整的消息（可能包含待办上下文）

        Returns:
            (用户查询, 待办上下文) 元组
        """
        # 尝试匹配 "用户输入:" 或 "User input:" 标记
        # 支持中英文标签
        markers = ["用户输入:", "User input:"]
        todo_context = None
        actual_query = message
        expected_parts = 2

        for marker in markers:
            if marker in message:
                parts = message.split(marker, 1)
                if len(parts) == expected_parts:
                    # 提取待办上下文（标记前的部分）
                    context_part = parts[0].strip()
                    # 提取用户查询（标记后的部分）
                    actual_query = parts[1].strip()

                    # 如果上下文部分不为空，则作为待办上下文
                    if context_part:
                        todo_context = context_part
                    break

        return actual_query, todo_context

    def stream_answer_with_sources(self, query: str, lang: str = "zh") -> Generator[str]:
        """
        流式生成带来源的回答

        Args:
            query: 用户查询（可能包含待办上下文）
            lang: 语言代码 ("zh" 或 "en")

        Yields:
            文本块（逐 token）
        """
        try:
            # 解析消息，提取实际查询和待办上下文
            actual_query, todo_context = self._parse_message_with_context(query)

            # 检查 Tavily 是否可用
            if not self.tavily_client.is_available():
                error_msg = "当前未配置联网搜索服务，请在设置中填写 Tavily API Key。"
                yield error_msg
                return

            # 执行 Tavily 搜索（使用实际查询）
            logger.info(f"开始执行 Tavily 搜索: {actual_query}")
            if todo_context:
                logger.info("检测到待办上下文，将在生成回答时使用")
            tavily_result = self.tavily_client.search(actual_query)
            logger.info(f"Tavily 搜索完成，找到 {len(tavily_result.get('results', []))} 个结果")

            # 检查 LLM 是否可用
            if not self.llm_client.is_available():
                # LLM 不可用时，返回格式化后的搜索结果
                fallback_text = self._format_fallback_response(actual_query, tavily_result)
                yield fallback_text
                return

            # 构建 prompt（包含待办上下文和语言）
            messages = self.build_search_prompt(actual_query, tavily_result, todo_context, lang)

            # 流式调用 LLM
            logger.info("开始流式生成回答")
            output_chunks: list[str] = []
            for text in self.llm_client.stream_chat(messages=messages, temperature=0.7):
                if text:
                    output_chunks.append(text)
                    yield text

            logger.info("流式生成完成")

        except RuntimeError as e:
            # Tavily 配置错误
            error_msg = str(e)
            logger.error(f"联网搜索失败: {error_msg}")
            yield error_msg
        except Exception as e:
            # 其他错误
            logger.error(f"联网搜索处理失败: {e}", exc_info=True)
            yield f"联网搜索处理时出现错误: {str(e)}"

    def _format_fallback_response(self, query: str, tavily_result: dict) -> str:
        """
        当 LLM 不可用时的备用响应格式

        Args:
            query: 用户查询
            tavily_result: Tavily 搜索结果

        Returns:
            格式化的响应文本
        """
        results = tavily_result.get("results", [])
        if not results:
            return f"抱歉，未找到与 '{query}' 相关的搜索结果。"

        response_parts = [
            f"根据您的查询 '{query}'，我找到了以下信息：",
            "",
        ]

        # 列出搜索结果
        for idx, item in enumerate(results, start=1):
            title = item.get("title", "无标题")
            url = item.get("url", "")
            content = item.get("content", "")
            response_parts.append(f"{idx}. {title}")
            response_parts.append(f"   URL: {url}")
            if content:
                response_parts.append(f"   摘要: {content[:200]}...")
            response_parts.append("")

        response_parts.append("\nSources:")
        for idx, item in enumerate(results, start=1):
            title = item.get("title", "无标题")
            url = item.get("url", "")
            response_parts.append(f"{idx}. {title} ({url})")

        return "\n".join(response_parts)
