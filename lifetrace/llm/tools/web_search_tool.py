"""联网搜索工具实现"""

from lifetrace.llm.tavily_client import TavilyClientWrapper
from lifetrace.llm.tools.base import Tool, ToolResult
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class WebSearchTool(Tool):
    """联网搜索工具"""

    def __init__(self):
        """初始化联网搜索工具"""
        self.tavily_client = TavilyClientWrapper()

    @property
    def name(self) -> str:
        return "web_search"

    @property
    def description(self) -> str:
        return (
            "使用联网搜索工具查找最新的网络信息。"
            "适用于需要实时信息、最新资讯、技术文档、新闻等场景。"
            "当用户询问当前事件、最新技术、实时数据时应该使用此工具。"
        )

    @property
    def parameters_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "搜索查询字符串",
                },
            },
            "required": ["query"],
        }

    def execute(self, query: str, **kwargs) -> ToolResult:
        """执行搜索"""
        try:
            if not self.tavily_client.is_available():
                return ToolResult(
                    success=False,
                    content="",
                    error="Tavily API 未配置，无法使用联网搜索",
                )

            # 执行 Tavily 搜索
            logger.info(f"[WebSearchTool] 执行搜索: {query}")
            result = self.tavily_client.search(query)
            results = result.get("results", [])

            if not results:
                return ToolResult(
                    success=True,
                    content="未找到相关搜索结果。",
                    metadata={"results": []},
                )

            # 格式化搜索结果
            formatted_results = []
            sources = []
            for idx, item in enumerate(results, start=1):
                title = item.get("title", "无标题")
                url = item.get("url", "")
                content = item.get("content", "")
                formatted_results.append(
                    f"[{idx}] {title}\nURL: {url}\n摘要: {content}",
                )
                sources.append({"title": title, "url": url})

            content = "\n\n".join(formatted_results)

            logger.info(
                f"[WebSearchTool] 搜索完成，找到 {len(results)} 个结果",
            )

            return ToolResult(
                success=True,
                content=content,
                metadata={"results": results, "sources": sources},
            )
        except Exception as e:
            logger.error(f"[WebSearchTool] 执行失败: {e}", exc_info=True)
            return ToolResult(
                success=False,
                content="",
                error=str(e),
            )

    def is_available(self) -> bool:
        return self.tavily_client.is_available()
