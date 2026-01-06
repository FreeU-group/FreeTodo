"""联网搜索工具实现"""

from lifetrace.llm.iflow_client import IFlowClientWrapper
from lifetrace.llm.tools.base import Tool, ToolResult
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class WebSearchTool(Tool):
    """联网搜索工具"""

    def __init__(self):
        """初始化联网搜索工具"""
        self.iflow_client = IFlowClientWrapper()

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
            if not self.iflow_client.is_available():
                return ToolResult(
                    success=False,
                    content="",
                    error="iFlow CLI 未安装，无法使用联网搜索。请先安装: npm i -g @iflow-ai/iflow-cli@latest",
                )

            # 执行 iFlow 搜索（使用同步方法）
            logger.info(f"[WebSearchTool] 执行搜索: {query}")
            result = self.iflow_client.search_sync(query)
            results = result.get("results", [])
            answer = result.get("answer", "")
            sources = result.get("sources", [])

            if not results and not answer:
                return ToolResult(
                    success=True,
                    content="未找到相关搜索结果。",
                    metadata={"results": [], "sources": []},
                )

            # 格式化搜索结果
            if answer:
                # 如果有 iFlow 生成的完整回答，优先使用
                content = answer
                if sources:
                    content += "\n\n来源：\n"
                    for idx, source in enumerate(sources, start=1):
                        title = source.get("title", "无标题")
                        url = source.get("url", "")
                        content += f"[{idx}] {title}\nURL: {url}\n"
            else:
                # 否则格式化结果列表
                formatted_results = []
                for idx, item in enumerate(results, start=1):
                    title = item.get("title", "无标题")
                    url = item.get("url", "")
                    content_text = item.get("content", "")
                    formatted_results.append(
                        f"[{idx}] {title}\nURL: {url}\n摘要: {content_text}",
                    )
                content = "\n\n".join(formatted_results)

            logger.info(
                f"[WebSearchTool] 搜索完成，找到 {len(results)} 个结果",
            )

            return ToolResult(
                success=True,
                content=content,
                metadata={"results": results, "sources": sources, "answer": answer},
            )
        except Exception as e:
            logger.error(f"[WebSearchTool] 执行失败: {e}", exc_info=True)
            return ToolResult(
                success=False,
                content="",
                error=str(e),
            )

    def is_available(self) -> bool:
        return self.iflow_client.is_available()
