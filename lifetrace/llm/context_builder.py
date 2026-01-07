import json
from datetime import datetime
from typing import Any

from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()

# 常量定义
MAX_RECORDS_PER_APP = 5  # 每个应用最多显示的记录数
MAX_SEARCH_RESULTS = 10  # 搜索结果最大显示数量
MAX_APP_STATS = 10  # 应用统计最大显示数量
OCR_TEXT_SUMMARY_LIMIT = 200  # 总结模式下 OCR 文本截断长度
OCR_TEXT_SEARCH_LIMIT = 150  # 搜索模式下 OCR 文本截断长度
OCR_TEXT_TRUNCATE_LIMIT = 100  # 截断模式下 OCR 文本长度


class ContextBuilder:
    """上下文构建器，将检索到的数据整理成适合LLM处理的格式"""

    def __init__(self, max_context_length: int = 8000):
        """
        初始化上下文构建器

        Args:
            max_context_length: 最大上下文长度（字符数）
        """
        self.max_context_length = max_context_length
        logger.info(f"上下文构建器初始化完成，最大长度: {max_context_length}")

    def build_context(
        self,
        query: str,
        retrieved_data: list[dict[str, Any]],
        query_type: str = "search",
    ) -> dict[str, Any]:
        """
        构建完整的上下文

        Args:
            query: 用户原始查询
            retrieved_data: 检索到的数据
            query_type: 查询类型

        Returns:
            构建好的上下文字典
        """
        context = {
            "query": query,
            "query_type": query_type,
            "data_summary": self._build_data_summary(retrieved_data),
            "detailed_records": self._build_detailed_records(retrieved_data),
            "metadata": self._build_metadata(retrieved_data),
        }

        # 检查并截断过长的上下文
        context = self._truncate_context(context)

        logger.info(f"上下文构建完成，包含 {len(retrieved_data)} 条记录")
        return context

    def _format_timestamp(self, timestamp: str) -> str:
        """格式化时间戳"""
        if not timestamp or timestamp == "未知时间":
            return "未知时间"
        try:
            dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            return dt.strftime("%Y-%m-%d %H:%M")
        except Exception:
            return timestamp

    def _format_record_for_summary(
        self, index: int, record: dict[str, Any], text_limit: int
    ) -> str:
        """格式化单条记录用于总结"""
        timestamp = self._format_timestamp(record.get("timestamp", "未知时间"))
        ocr_text = record.get("ocr_text", "无文本内容")
        window_title = record.get("window_title", "")
        screenshot_id = record.get("screenshot_id") or record.get("id")

        if len(ocr_text) > text_limit:
            ocr_text = ocr_text[:text_limit] + "..."

        record_text = f"{index + 1}. 时间: {timestamp}"
        if window_title:
            record_text += f", 窗口: {window_title}"
        if screenshot_id:
            record_text += f", 截图ID: {screenshot_id}"
        record_text += f"\n   内容: {ocr_text}"
        return record_text

    def build_summary_context(self, query: str, retrieved_data: list[dict[str, Any]]) -> str:
        """
        构建用于总结的上下文文本

        Args:
            query: 用户查询
            retrieved_data: 检索到的数据

        Returns:
            格式化的上下文文本
        """
        if not retrieved_data:
            return "没有找到相关的历史记录数据。"

        context_parts = [
            get_prompt("context_builder", "data_analysis_base"),
            "",
            get_prompt("context_builder", "citation_requirements"),
            "",
            get_prompt("context_builder", "response_format"),
            "",
            f"用户查询: {query}",
            f"找到 {len(retrieved_data)} 条相关记录:",
            "",
        ]

        # 按应用分组
        app_groups = self._group_by_app(retrieved_data)

        for app_name, records in app_groups.items():
            context_parts.append(f"=== {app_name} ({len(records)} 条记录) ===")

            for i, record in enumerate(records[:MAX_RECORDS_PER_APP]):
                record_text = self._format_record_for_summary(i, record, OCR_TEXT_SUMMARY_LIMIT)
                context_parts.append(record_text)

            if len(records) > MAX_RECORDS_PER_APP:
                context_parts.append(f"   ... 还有 {len(records) - MAX_RECORDS_PER_APP} 条记录")

            context_parts.append("")

        context_text = "\n".join(context_parts)

        # 检查长度并截断
        if len(context_text) > self.max_context_length:
            context_text = context_text[: self.max_context_length] + "\n\n[内容过长，已截断]"

        return context_text

    def build_search_context(self, query: str, retrieved_data: list[dict[str, Any]]) -> str:
        """
        构建用于搜索的上下文文本

        Args:
            query: 用户查询
            retrieved_data: 检索到的数据

        Returns:
            格式化的上下文文本
        """
        if not retrieved_data:
            return f"查询: {query}\n\n未找到相关记录。"

        context_parts = [
            get_prompt("context_builder", "data_analysis_base"),
            "",
            get_prompt("context_builder", "citation_requirements"),
            "",
            get_prompt("context_builder", "response_format"),
            "",
            f"搜索查询: {query}",
            f"找到 {len(retrieved_data)} 条匹配结果:",
            "",
        ]

        # 按相关性排序显示
        sorted_data = sorted(
            retrieved_data, key=lambda x: x.get("relevance_score", 0), reverse=True
        )

        for i, record in enumerate(sorted_data[:10]):  # 最多显示10条
            timestamp = record.get("timestamp", "未知时间")
            if timestamp and timestamp != "未知时间":
                try:
                    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                    timestamp = dt.strftime("%Y-%m-%d %H:%M")
                except:  # noqa: E722
                    pass

            app_name = record.get("app_name", "未知应用")
            ocr_text = record.get("ocr_text", "无文本内容")
            relevance = record.get("relevance_score", 0)
            screenshot_id = record.get("screenshot_id") or record.get("id")  # 获取截图ID

            # 截断过长的文本
            if len(ocr_text) > OCR_TEXT_SEARCH_LIMIT:
                ocr_text = ocr_text[:OCR_TEXT_SEARCH_LIMIT] + "..."

            # 构建包含截图ID的上下文信息
            id_info = f" (截图ID: {screenshot_id})" if screenshot_id else ""
            context_parts.append(
                f"{i + 1}. [{app_name}] {timestamp} (相关性: {relevance:.2f}){id_info}\n   {ocr_text}"
            )

        context_text = "\n\n".join(context_parts)

        # 检查长度并截断
        if len(context_text) > self.max_context_length:
            context_text = context_text[: self.max_context_length] + "\n\n[搜索结果过长，已截断]"

        return context_text

    def _build_app_distribution_context(
        self, app_distribution: dict[str, int], total_count: int
    ) -> list[str]:
        """构建应用分布上下文"""
        if not app_distribution:
            return []

        parts = ["\n应用分布:"]
        sorted_apps = sorted(app_distribution.items(), key=lambda x: x[1], reverse=True)
        for app, count in sorted_apps[:MAX_APP_STATS]:
            percentage = (count / total_count * 100) if total_count > 0 else 0
            parts.append(f"  {app}: {count} 条 ({percentage:.1f}%)")
        return parts

    def _build_time_range_context(self, time_range: dict[str, Any]) -> list[str]:
        """构建时间范围上下文"""
        if not time_range.get("earliest") or not time_range.get("latest"):
            return []

        try:
            earliest = datetime.fromisoformat(time_range["earliest"].replace("Z", "+00:00"))
            latest = datetime.fromisoformat(time_range["latest"].replace("Z", "+00:00"))
            return [
                f"\n时间范围: {earliest.strftime('%Y-%m-%d %H:%M')} 至 {latest.strftime('%Y-%m-%d %H:%M')}"
            ]
        except Exception:
            return [f"\n时间范围: {time_range['earliest']} 至 {time_range['latest']}"]

    def _build_query_conditions_context(self, query_conditions: Any) -> list[str]:
        """构建查询条件上下文"""
        parts: list[str] = []

        # 从对象或字典中获取字段
        def get_field(obj: Any, field: str) -> Any:
            if hasattr(obj, field):
                return getattr(obj, field)
            if isinstance(obj, dict):
                return obj.get(field)
            return None

        app_names = get_field(query_conditions, "app_names")
        keywords = get_field(query_conditions, "keywords")
        start_date = get_field(query_conditions, "start_date")
        end_date = get_field(query_conditions, "end_date")

        if not (app_names or keywords or start_date or end_date):
            return parts

        parts.append("\n查询条件:")
        if app_names:
            if isinstance(app_names, list):
                parts.append(f"  应用: {', '.join(app_names)}")
            else:
                parts.append(f"  应用: {app_names}")
        if keywords:
            parts.append(f"  关键词: {', '.join(keywords)}")
        if start_date:
            parts.append(f"  开始时间: {start_date}")
        if end_date:
            parts.append(f"  结束时间: {end_date}")

        return parts

    def build_statistics_context(
        self, query: str, retrieved_data: list[dict[str, Any]], stats: dict[str, Any]
    ) -> str:
        """
        构建用于统计的上下文文本

        Args:
            query: 用户查询
            retrieved_data: 检索到的数据
            stats: 统计信息

        Returns:
            格式化的上下文文本
        """
        context_parts = [
            get_prompt("context_builder", "data_analysis_base"),
            "",
            get_prompt("context_builder", "citation_requirements"),
            "",
            get_prompt("context_builder", "response_format"),
            "",
            f"统计查询: {query}",
            "",
        ]

        # 基础统计
        total_count = stats.get("total_screenshots", 0)
        context_parts.append(f"总记录数: {total_count}")

        # 应用分布
        context_parts.extend(
            self._build_app_distribution_context(stats.get("app_distribution", {}), total_count)
        )

        # 时间范围
        context_parts.extend(self._build_time_range_context(stats.get("time_range", {})))

        # 查询条件
        context_parts.extend(
            self._build_query_conditions_context(stats.get("query_conditions", {}))
        )

        return "\n".join(context_parts)

    def _build_data_summary(self, retrieved_data: list[dict[str, Any]]) -> dict[str, Any]:
        """构建数据摘要"""
        if not retrieved_data:
            return {"total_count": 0, "app_distribution": {}, "time_span": None}

        # 应用分布
        app_counts = {}
        timestamps = []

        for record in retrieved_data:
            app_name = record.get("app_name", "未知应用")
            app_counts[app_name] = app_counts.get(app_name, 0) + 1

            timestamp = record.get("timestamp")
            if timestamp:
                timestamps.append(timestamp)

        # 时间跨度
        time_span = None
        if timestamps:
            timestamps.sort()
            time_span = {"earliest": timestamps[0], "latest": timestamps[-1]}

        return {
            "total_count": len(retrieved_data),
            "app_distribution": app_counts,
            "time_span": time_span,
        }

    def _build_detailed_records(self, retrieved_data: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """构建详细记录"""
        detailed_records = []

        for record in retrieved_data[:20]:  # 最多保留20条详细记录
            detailed_record = {
                "timestamp": record.get("timestamp"),
                "app_name": record.get("app_name"),
                "window_title": record.get("window_title"),
                "ocr_text": record.get("ocr_text", "")[:500],  # 截断OCR文本
                "relevance_score": record.get("relevance_score", 0),
                "screenshot_id": record.get("screenshot_id") or record.get("id"),  # 添加截图ID
            }
            detailed_records.append(detailed_record)

        return detailed_records

    def _build_metadata(self, retrieved_data: list[dict[str, Any]]) -> dict[str, Any]:
        """构建元数据"""
        return {
            "total_retrieved": len(retrieved_data),
            "build_time": datetime.now().isoformat(),
            "context_version": "1.0",
        }

    def _group_by_app(
        self, retrieved_data: list[dict[str, Any]]
    ) -> dict[str, list[dict[str, Any]]]:
        """按应用分组"""
        app_groups = {}

        for record in retrieved_data:
            app_name = record.get("app_name", "未知应用")
            if app_name not in app_groups:
                app_groups[app_name] = []
            app_groups[app_name].append(record)

        # 按记录数量排序
        return dict(sorted(app_groups.items(), key=lambda x: len(x[1]), reverse=True))

    def _truncate_context(self, context: dict[str, Any]) -> dict[str, Any]:
        """截断过长的上下文"""
        context_str = json.dumps(context, ensure_ascii=False)

        if len(context_str) <= self.max_context_length:
            return context

        # 逐步减少详细记录
        detailed_records = context.get("detailed_records", [])
        while (
            len(json.dumps(context, ensure_ascii=False)) > self.max_context_length
            and detailed_records
        ):
            detailed_records.pop()
            context["detailed_records"] = detailed_records

        # 如果还是太长，截断OCR文本
        for record in context.get("detailed_records", []):
            if "ocr_text" in record and len(record["ocr_text"]) > OCR_TEXT_TRUNCATE_LIMIT:
                record["ocr_text"] = record["ocr_text"][:OCR_TEXT_TRUNCATE_LIMIT] + "..."

        logger.warning(f"上下文过长，已截断至 {len(json.dumps(context, ensure_ascii=False))} 字符")
        return context
