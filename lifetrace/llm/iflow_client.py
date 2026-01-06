"""iFlow CLI SDK 客户端封装模块"""

import asyncio
import re
import shutil
import subprocess
from collections.abc import AsyncGenerator, Generator
from typing import Any

from lifetrace.util.logging_config import get_logger

logger = get_logger()

try:
    from iflow_sdk import AssistantMessage, IFlowClient, TaskFinishMessage

    IFLOW_SDK_AVAILABLE = True
except ImportError:
    IFLOW_SDK_AVAILABLE = False
    logger.warning("iFlow CLI SDK 未安装，联网搜索功能不可用")


class IFlowClientWrapper:
    """iFlow CLI SDK 客户端封装类"""

    _instance = None
    _initialized = False
    _cli_available: bool | None = None
    _cli_version: str | None = None

    def __new__(cls):
        """实现单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化 iFlow 客户端"""
        if not IFlowClientWrapper._initialized:
            self._check_cli_installation()
            IFlowClientWrapper._initialized = True

    def _check_cli_installation(self):
        """检查 iFlow CLI 是否已安装"""
        if IFlowClientWrapper._cli_available is not None:
            return

        try:
            # 检查 iflow 命令是否在 PATH 中
            iflow_path = shutil.which("iflow")
            if not iflow_path:
                logger.warning("iFlow CLI 未安装，联网搜索功能不可用")
                IFlowClientWrapper._cli_available = False
                return

            # 尝试获取版本信息
            try:
                result = subprocess.run(
                    ["iflow", "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    check=False,
                )
                if result.returncode == 0:
                    version_match = re.search(r"(\d+\.\d+\.\d+)", result.stdout)
                    if version_match:
                        IFlowClientWrapper._cli_version = version_match.group(1)
                    IFlowClientWrapper._cli_available = True
                    logger.info(
                        f"iFlow CLI 已安装，版本: {IFlowClientWrapper._cli_version or 'unknown'}"
                    )
                else:
                    IFlowClientWrapper._cli_available = False
                    logger.warning("iFlow CLI 命令执行失败")
            except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
                logger.warning(f"检查 iFlow CLI 版本失败: {e}")
                IFlowClientWrapper._cli_available = False
        except Exception as e:
            logger.error(f"检查 iFlow CLI 安装状态失败: {e}")
            IFlowClientWrapper._cli_available = False

    def is_available(self) -> bool:
        """检查 iFlow 客户端是否可用"""
        if not IFLOW_SDK_AVAILABLE:
            return False
        if IFlowClientWrapper._cli_available is None:
            self._check_cli_installation()
        return IFlowClientWrapper._cli_available is True

    def get_version(self) -> str | None:
        """获取 iFlow CLI 版本"""
        return IFlowClientWrapper._cli_version

    async def search_async(self, query: str) -> AsyncGenerator[str]:
        """
        异步执行 iFlow 搜索，流式返回结果

        Args:
            query: 搜索查询字符串

        Yields:
            文本块（逐 token）

        Raises:
            RuntimeError: 如果客户端未配置或不可用
            Exception: 如果搜索请求失败
        """
        if not self.is_available():
            error_msg = (
                "iFlow CLI 未安装或不可用，请先安装 iFlow CLI: npm i -g @iflow-ai/iflow-cli@latest"
            )
            yield error_msg
            return

        try:
            # 构建搜索查询，使用 iFlow 的 WebSearch 能力
            search_query = f"请搜索并总结以下内容：{query}"
            logger.info(f"开始执行 iFlow 搜索: {query}")

            async with IFlowClient() as client:
                await client.send_message(search_query)
                async for message in client.receive_messages():
                    if isinstance(message, AssistantMessage):
                        if message.chunk and message.chunk.text:
                            yield message.chunk.text
                    elif isinstance(message, TaskFinishMessage):
                        break

            logger.info("iFlow 搜索完成")
        except Exception as e:
            logger.error(f"iFlow 搜索失败: {e}")
            yield f"iFlow 搜索处理时出现错误: {str(e)}"

    def stream_search(self, query: str) -> Generator[str]:
        """
        同步流式执行 iFlow 搜索（内部使用异步）

        Args:
            query: 搜索查询字符串

        Yields:
            文本块（逐 token）
        """
        if not self.is_available():
            error_msg = (
                "iFlow CLI 未安装或不可用，请先安装 iFlow CLI: npm i -g @iflow-ai/iflow-cli@latest"
            )
            yield error_msg
            return

        # 使用队列在线程间传递数据
        import queue
        import threading

        result_queue: queue.Queue[str | None] = queue.Queue()
        exception_queue: queue.Queue[Exception] = queue.Queue()

        async def _async_search():
            try:
                async for chunk in self.search_async(query):
                    result_queue.put(chunk)
                result_queue.put(None)  # 结束标记
            except Exception as e:
                exception_queue.put(e)
                result_queue.put(None)

        # 在新线程中运行异步代码
        def run_async():
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            try:
                new_loop.run_until_complete(_async_search())
            finally:
                new_loop.close()

        thread = threading.Thread(target=run_async, daemon=True)
        thread.start()

        # 从队列中获取结果
        while True:
            try:
                chunk = result_queue.get(timeout=30)  # 30秒超时
                if chunk is None:
                    break
                yield chunk
            except queue.Empty:
                logger.error("iFlow 搜索超时")
                yield "搜索超时，请稍后重试"
                break

        # 检查是否有异常
        if not exception_queue.empty():
            exc = exception_queue.get()
            logger.error(f"iFlow 搜索线程异常: {exc}")
            yield f"搜索处理时出现错误: {str(exc)}"

        thread.join(timeout=1)

    async def search(self, query: str) -> dict[str, Any]:
        """
        执行 iFlow 搜索（同步接口，内部使用异步）

        Args:
            query: 搜索查询字符串

        Returns:
            包含搜索结果的字典，格式：
            {
                "results": [
                    {
                        "url": "https://...",
                        "title": "标题",
                        "content": "内容摘要"
                    },
                    ...
                ],
                "sources": [
                    {"title": "标题", "url": "https://..."},
                    ...
                ],
                "answer": "完整的回答文本"
            }

        Raises:
            RuntimeError: 如果客户端未配置或不可用
            Exception: 如果搜索请求失败
        """
        if not self.is_available():
            raise RuntimeError(
                "iFlow CLI 未安装或不可用，请先安装 iFlow CLI: npm i -g @iflow-ai/iflow-cli@latest"
            )

        try:
            # 构建搜索查询，明确要求提供来源
            search_query = f"请搜索并总结以下内容，并在回答中包含来源链接：{query}"
            logger.info(f"开始执行 iFlow 搜索: {query}")

            answer_parts = []
            sources = []
            results = []

            async with IFlowClient() as client:
                await client.send_message(search_query)
                async for message in client.receive_messages():
                    if isinstance(message, AssistantMessage):
                        if message.chunk and message.chunk.text:
                            answer_parts.append(message.chunk.text)
                    elif isinstance(message, TaskFinishMessage):
                        # 尝试从消息中提取来源信息
                        if hasattr(message, "metadata") and message.metadata:
                            # 解析可能的来源信息
                            pass
                        break
                    # 检查是否有工具调用消息（可能包含来源信息）
                    # iFlow SDK 可能提供 ToolCallMessage 或其他消息类型
                    message_type = type(message).__name__
                    if "Tool" in message_type or "tool" in message_type.lower():
                        # 尝试从工具调用中提取来源
                        if hasattr(message, "result") and message.result:
                            result = message.result
                            if isinstance(result, dict):
                                # 检查结果中是否包含 URL 或来源信息
                                if "url" in result:
                                    sources.append(
                                        {"title": result.get("title", "来源"), "url": result["url"]}
                                    )
                                elif "sources" in result:
                                    sources.extend(result["sources"])

            answer_text = "".join(answer_parts)

            # 尝试从回答文本中提取来源链接
            # iFlow 可能会在回答中包含链接，我们需要解析它们
            # 改进的 URL 模式：匹配各种格式的 URL
            url_patterns = [
                r"https?://[^\s\)\]\[]+[^\s\)\]\[.,;:!?]",  # 标准 URL，排除尾随标点
                r"https?://[^\s\)\]\[]+",  # 标准 URL（备用）
                r"www\.[^\s\)\]\[]+[^\s\)\]\[.,;:!?]",  # www 开头的 URL
            ]

            urls = []
            for pattern in url_patterns:
                found_urls = re.findall(pattern, answer_text)
                urls.extend(found_urls)

            # 清理和去重 URL
            cleaned_urls = []
            seen = set()
            for url in urls:
                # 清理 URL（移除尾随标点）
                clean_url = url.rstrip(".,;:!?)")
                # 如果是 www 开头，添加 https://
                if clean_url.startswith("www."):
                    clean_url = "https://" + clean_url
                # 验证是有效的 URL
                if clean_url.startswith("http") and clean_url not in seen:
                    seen.add(clean_url)
                    cleaned_urls.append(clean_url)

            # 为每个找到的 URL 创建结果项
            for url in cleaned_urls[:10]:  # 限制最多10个结果
                # 尝试从 URL 提取更好的标题
                try:
                    domain = url.split("/")[2] if len(url.split("/")) > 2 else url
                    domain_parts = domain.replace("www.", "").split(".")
                    if len(domain_parts) >= 2:
                        # 使用主域名作为标题
                        title = domain_parts[-2].title()
                    else:
                        title = domain.replace("www.", "").split(".")[0].title()
                except Exception:
                    title = "来源"

                results.append(
                    {
                        "url": url,
                        "title": title,
                        "content": "",  # iFlow 不直接提供摘要，需要从回答中提取
                    }
                )
                sources.append({"title": title, "url": url})

            # 如果没有找到 URL，至少返回回答文本
            if not results:
                # 创建一个虚拟结果，包含整个回答
                results.append(
                    {
                        "url": "",
                        "title": "搜索结果",
                        "content": answer_text[:500],  # 截取前500字符作为摘要
                    }
                )

            logger.info(f"iFlow 搜索完成，找到 {len(results)} 个结果，{len(sources)} 个来源")

            # 如果找到了来源，记录详细信息
            if sources:
                logger.debug(f"提取的来源: {sources[:3]}...")  # 只记录前3个

            return {
                "results": results,
                "sources": sources,
                "answer": answer_text,
            }

        except Exception as e:
            logger.error(f"iFlow 搜索失败: {e}")
            raise

    def search_sync(self, query: str) -> dict[str, Any]:
        """
        同步执行 iFlow 搜索（内部使用异步）

        Args:
            query: 搜索查询字符串

        Returns:
            包含搜索结果的字典，格式与 search() 相同

        Raises:
            RuntimeError: 如果客户端未配置或不可用
            Exception: 如果搜索请求失败
        """
        if not self.is_available():
            raise RuntimeError(
                "iFlow CLI 未安装或不可用，请先安装 iFlow CLI: npm i -g @iflow-ai/iflow-cli@latest"
            )

        # 使用线程在同步上下文中运行异步代码
        # 这样可以避免事件循环冲突
        import concurrent.futures

        def run_async():
            new_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(new_loop)
            try:
                return new_loop.run_until_complete(self.search(query))
            finally:
                new_loop.close()

        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_async)
            try:
                return future.result(timeout=60)  # 60秒超时
            except concurrent.futures.TimeoutError:
                logger.error("iFlow 搜索超时")
                raise RuntimeError("iFlow 搜索超时，请稍后重试")
