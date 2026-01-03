"""Tavily API 客户端封装模块"""

from typing import Any

from tavily import TavilyClient

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings

logger = get_logger()


class TavilyClientWrapper:
    """Tavily API 客户端封装类"""

    _instance = None
    _initialized = False

    def __new__(cls):
        """实现单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化 Tavily 客户端"""
        if not TavilyClientWrapper._initialized:
            self._initialize_client()
            TavilyClientWrapper._initialized = True

    def _initialize_client(self):
        """内部方法：初始化或重新初始化客户端"""
        try:
            self.api_key = settings.tavily.api_key
            self.search_depth = settings.tavily.search_depth
            self.max_results = settings.tavily.max_results
            self.include_domains = settings.tavily.include_domains
            self.exclude_domains = settings.tavily.exclude_domains

            # 检查 API key 是否配置
            invalid_values = [
                "xxx",
                "YOUR_API_KEY_HERE",
                "YOUR_TAVILY_API_KEY_HERE",
            ]
            if not self.api_key or self.api_key in invalid_values:
                logger.warning("Tavily API Key 未配置或为默认占位符，联网搜索功能不可用")
                self.client = None
                return

            # 初始化 Tavily 客户端
            self.client = TavilyClient(api_key=self.api_key)
            logger.info("Tavily 客户端初始化成功")
        except Exception as e:
            logger.error(f"Tavily 客户端初始化失败: {e}")
            self.client = None

    def is_available(self) -> bool:
        """检查 Tavily 客户端是否可用"""
        return self.client is not None

    def search(self, query: str, **kwargs) -> dict[str, Any]:
        """
        执行 Tavily 搜索

        Args:
            query: 搜索查询字符串
            **kwargs: 额外的搜索参数

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
                "raw_response": {...}  # 原始 Tavily 响应
            }

        Raises:
            RuntimeError: 如果客户端未配置或不可用
            Exception: 如果搜索请求失败
        """
        if not self.is_available():
            raise RuntimeError("Tavily 客户端未配置或不可用，请在设置中填写 Tavily API Key")

        try:
            # 构建搜索参数
            search_kwargs = {
                "query": query,
                "search_depth": kwargs.get("search_depth", self.search_depth),
                "max_results": kwargs.get("max_results", self.max_results),
            }

            # 添加域名过滤（如果配置了）
            if self.include_domains:
                search_kwargs["include_domains"] = self.include_domains
            if self.exclude_domains:
                search_kwargs["exclude_domains"] = self.exclude_domains

            # 合并用户提供的额外参数
            search_kwargs.update(
                {k: v for k, v in kwargs.items() if k not in ["search_depth", "max_results"]}
            )

            # 调用 Tavily search API
            response = self.client.search(**search_kwargs)

            # 格式化返回结果
            results = []
            if "results" in response:
                for item in response["results"]:
                    results.append(
                        {
                            "url": item.get("url", ""),
                            "title": item.get("title", ""),
                            "content": item.get("content", ""),
                        }
                    )

            return {
                "results": results,
                "raw_response": response,
            }

        except Exception as e:
            logger.error(f"Tavily 搜索失败: {e}")
            raise

    def research(self, query: str, **kwargs) -> dict[str, Any]:
        """
        执行 Tavily research（深度研究）

        Args:
            query: 研究查询字符串
            **kwargs: 额外的研究参数

        Returns:
            包含研究结果的字典，格式与 search 相同

        Raises:
            RuntimeError: 如果客户端未配置或不可用
            Exception: 如果研究请求失败
        """
        if not self.is_available():
            raise RuntimeError("Tavily 客户端未配置或不可用，请在设置中填写 Tavily API Key")

        try:
            # 构建研究参数
            research_kwargs = {
                "query": query,
                "search_depth": kwargs.get("search_depth", "advanced"),
                "max_results": kwargs.get("max_results", self.max_results),
            }

            # 添加域名过滤（如果配置了）
            if self.include_domains:
                research_kwargs["include_domains"] = self.include_domains
            if self.exclude_domains:
                research_kwargs["exclude_domains"] = self.exclude_domains

            # 合并用户提供的额外参数
            research_kwargs.update(
                {k: v for k, v in kwargs.items() if k not in ["search_depth", "max_results"]}
            )

            # 调用 Tavily research API
            response = self.client.research(**research_kwargs)

            # 格式化返回结果
            results = []
            if "results" in response:
                for item in response["results"]:
                    results.append(
                        {
                            "url": item.get("url", ""),
                            "title": item.get("title", ""),
                            "content": item.get("content", ""),
                        }
                    )

            return {
                "results": results,
                "raw_response": response,
            }

        except Exception as e:
            logger.error(f"Tavily 研究失败: {e}")
            raise
