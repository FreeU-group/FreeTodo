"""联网搜索服务模块 - 整合 iFlow CLI 和 LLM"""

from collections.abc import Generator

from lifetrace.llm.iflow_client import IFlowClientWrapper
from lifetrace.llm.llm_client import LLMClient
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()


class WebSearchService:
    """联网搜索服务，整合 iFlow CLI 搜索结果和 LLM 生成"""

    def __init__(self):
        """初始化联网搜索服务"""
        self.iflow_client = IFlowClientWrapper()
        self.llm_client = LLMClient()
        logger.info("联网搜索服务初始化完成")

    def build_search_prompt(
        self, query: str, iflow_result: dict, todo_context: str | None = None
    ) -> list[dict[str, str]]:
        """
        构建用于 LLM 的搜索提示词

        Args:
            query: 用户查询
            iflow_result: iFlow 搜索结果
            todo_context: 待办事项上下文（可选）

        Returns:
            LLM messages 列表
        """
        # 获取 system prompt
        system_prompt = get_prompt("web_search", "system")

        # 格式化搜索结果
        results = iflow_result.get("results", [])
        sources = iflow_result.get("sources", [])
        answer = iflow_result.get("answer", "")

        if not results and not answer:
            sources_context = "未找到相关搜索结果。"
        elif answer:
            # 如果有 iFlow 生成的回答，直接使用
            sources_context = answer
            if sources:
                sources_list = []
                for idx, source in enumerate(sources, start=1):
                    title = source.get("title", "无标题")
                    url = source.get("url", "")
                    sources_list.append(f"[{idx}] {title}\nURL: {url}")
                sources_context += "\n\n来源：\n" + "\n".join(sources_list)
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

    def stream_answer_with_sources(self, query: str) -> Generator[str]:
        """
        流式生成带来源的回答

        Args:
            query: 用户查询（可能包含待办上下文）

        Yields:
            文本块（逐 token）
        """
        try:
            # 解析消息，提取实际查询和待办上下文
            actual_query, todo_context = self._parse_message_with_context(query)

            # 检查 iFlow CLI 是否可用
            if not self.iflow_client.is_available():
                error_msg = "当前未配置联网搜索服务，请先安装 iFlow CLI: npm i -g @iflow-ai/iflow-cli@latest"
                yield error_msg
                return

            # 执行 iFlow 搜索（使用实际查询）
            logger.info(f"开始执行 iFlow 搜索: {actual_query}")
            if todo_context:
                logger.info("检测到待办上下文，将在生成回答时使用")

            # 使用 iFlow 的流式搜索
            # iFlow 已经提供了完整的回答，我们可以直接流式返回
            answer_parts = []
            sources = []

            # 首先尝试直接使用 iFlow 的流式输出
            for chunk in self.iflow_client.stream_search(actual_query):
                if chunk:
                    answer_parts.append(chunk)
                    yield chunk

            answer_text = "".join(answer_parts)

            # 如果 iFlow 返回了完整回答，获取完整结果以提取来源
            if answer_text and len(answer_text) > 100:
                # iFlow 已经提供了较好的回答，现在获取完整结果以提取来源
                try:
                    # 获取完整的搜索结果（包含来源信息）
                    iflow_result = self.iflow_client.search_sync(actual_query)
                    sources = iflow_result.get("sources", [])
                    results = iflow_result.get("results", [])

                    # 如果 sources 为空，尝试从 results 构建
                    if not sources and results:
                        sources = [
                            {"title": item.get("title", "无标题"), "url": item.get("url", "")}
                            for item in results
                            if item.get("url")
                        ]

                    # 如果仍然没有 sources，尝试从文本中提取 URL
                    if not sources:
                        import re

                        url_pattern = r"https?://[^\s\)\]\[]+"
                        urls = re.findall(url_pattern, answer_text)
                        # 去重并保持顺序
                        seen = set()
                        unique_urls = []
                        for url in urls:
                            # 清理 URL（移除可能的尾随标点）
                            clean_url = url.rstrip(".,;:!?)")
                            if clean_url not in seen and clean_url.startswith("http"):
                                seen.add(clean_url)
                                unique_urls.append(clean_url)

                        if unique_urls:
                            for url in unique_urls[:10]:
                                # 尝试从 URL 提取更好的标题
                                try:
                                    domain = url.split("/")[2] if len(url.split("/")) > 2 else url
                                    domain_parts = domain.replace("www.", "").split(".")
                                    if len(domain_parts) >= 2:
                                        title = domain_parts[-2].title()
                                    else:
                                        title = domain.replace("www.", "").split(".")[0].title()
                                except Exception:
                                    title = "来源"

                                sources.append({"title": title, "url": url})

                    # 添加来源部分
                    if sources:
                        yield "\n\nSources:\n"
                        for idx, source in enumerate(sources[:10], start=1):
                            title = source.get("title", "无标题")
                            url = source.get("url", "")
                            if url:
                                yield f"{idx}. {title} ({url})\n"

                    logger.info(f"iFlow 搜索完成，使用 iFlow 直接回答，找到 {len(sources)} 个来源")
                except Exception as e:
                    logger.warning(f"获取完整搜索结果失败，尝试从文本提取来源: {e}")
                    # 如果获取完整结果失败，至少尝试从文本中提取 URL
                    import re

                    url_pattern = r"https?://[^\s\)\]\[]+"
                    urls = re.findall(url_pattern, answer_text)
                    if urls:
                        yield "\n\nSources:\n"
                        seen = set()
                        for idx, url in enumerate(urls[:10], start=1):
                            clean_url = url.rstrip(".,;:!?)")
                            if clean_url not in seen and clean_url.startswith("http"):
                                seen.add(clean_url)
                                domain = (
                                    clean_url.split("/")[2]
                                    if len(clean_url.split("/")) > 2
                                    else clean_url
                                )
                                title = domain.replace("www.", "").split(".")[0].title()
                                yield f"{idx}. {title} ({clean_url})\n"
            else:
                # iFlow 回答不够完整，使用 LLM 进一步处理
                logger.info("iFlow 返回结果较短，使用 LLM 进一步处理")

                # 获取完整的搜索结果
                try:
                    iflow_result = self.iflow_client.search(actual_query)
                    sources = iflow_result.get("sources", [])

                    # 检查 LLM 是否可用
                    if not self.llm_client.is_available():
                        # LLM 不可用时，返回格式化后的搜索结果
                        fallback_text = self._format_fallback_response(actual_query, iflow_result)
                        yield fallback_text
                        return

                    # 构建 prompt（包含待办上下文）
                    messages = self.build_search_prompt(actual_query, iflow_result, todo_context)

                    # 流式调用 LLM
                    logger.info("开始流式生成回答")
                    for text in self.llm_client.stream_chat(messages=messages, temperature=0.7):
                        if text:
                            yield text

                    # 添加来源
                    if sources:
                        yield "\n\nSources:\n"
                        for idx, source in enumerate(sources, start=1):
                            title = source.get("title", "无标题")
                            url = source.get("url", "")
                            yield f"{idx}. {title} ({url})\n"

                    logger.info("流式生成完成")
                except Exception as e:
                    logger.warning(f"获取完整搜索结果失败，使用已有回答: {e}")
                    # 如果获取完整结果失败，至少返回已有的回答

        except RuntimeError as e:
            # iFlow CLI 配置错误
            error_msg = str(e)
            logger.error(f"联网搜索失败: {error_msg}")
            yield error_msg
        except Exception as e:
            # 其他错误
            logger.error(f"联网搜索处理失败: {e}", exc_info=True)
            yield f"联网搜索处理时出现错误: {str(e)}"

    def _format_fallback_response(self, query: str, iflow_result: dict) -> str:
        """
        当 LLM 不可用时的备用响应格式

        Args:
            query: 用户查询
            iflow_result: iFlow 搜索结果

        Returns:
            格式化的响应文本
        """
        results = iflow_result.get("results", [])
        answer = iflow_result.get("answer", "")
        sources = iflow_result.get("sources", [])

        if answer:
            # 如果有 iFlow 生成的回答，直接返回
            response_parts = [answer]
            if sources:
                response_parts.append("\n\nSources:")
                for idx, source in enumerate(sources, start=1):
                    title = source.get("title", "无标题")
                    url = source.get("url", "")
                    response_parts.append(f"{idx}. {title} ({url})")
            return "\n".join(response_parts)

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
