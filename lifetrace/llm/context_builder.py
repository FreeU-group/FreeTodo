import json
import logging
from datetime import datetime
from typing import Any

logger = logging.getLogger(__name__)


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
            "你是一个智能助手，专门帮助用户分析和总结历史记录数据。",
            "",
            "**强制性要求 - 必须严格遵守：**",
            "- 每当引用或提到任何具体信息时，必须标注截图ID来源，格式为：[截图ID: xxx]",
            "- 不允许提及任何信息而不标注其来源截图ID",
            "- 如果历史数据中包含截图ID信息，必须在相关内容后立即添加引用",
            "- 这是为了确保信息的可追溯性和准确性",
            '- 示例："用户在微信中发送了消息 [截图ID: 12345]"',
            "",
            "请用中文回答，保持简洁明了，重点突出关键信息。",
            "",
            f"用户查询: {query}",
            f"找到 {len(retrieved_data)} 条相关记录:",
            "",
        ]

        # 按应用分组
        app_groups = self._group_by_app(retrieved_data)

        for app_name, records in app_groups.items():
            context_parts.append(f"=== {app_name} ({len(records)} 条记录) ===")

            for i, record in enumerate(records[:5]):  # 每个应用最多显示5条
                timestamp = record.get("timestamp", "未知时间")
                if timestamp and timestamp != "未知时间":
                    try:
                        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                        timestamp = dt.strftime("%Y-%m-%d %H:%M")
                    except:  # noqa: E722
                        pass

                ocr_text = record.get("ocr_text", "无文本内容")
                window_title = record.get("window_title", "")
                screenshot_id = record.get("screenshot_id") or record.get("id")  # 获取截图ID

                # 截断过长的文本
                if len(ocr_text) > 200:
                    ocr_text = ocr_text[:200] + "..."

                record_text = f"{i + 1}. 时间: {timestamp}"
                if window_title:
                    record_text += f", 窗口: {window_title}"
                if screenshot_id:
                    record_text += f", 截图ID: {screenshot_id}"
                record_text += f"\n   内容: {ocr_text}"

                context_parts.append(record_text)

            if len(records) > 5:
                context_parts.append(f"   ... 还有 {len(records) - 5} 条记录")

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
            "你是一个智能助手，专门帮助用户分析和总结历史记录数据。",
            "",
            "**强制性要求 - 必须严格遵守：**",
            "- 每当引用或提到任何具体信息时，必须标注截图ID来源，格式为：[截图ID: xxx]",
            "- 不允许提及任何信息而不标注其来源截图ID",
            "- 如果历史数据中包含截图ID信息，必须在相关内容后立即添加引用",
            "- 这是为了确保信息的可追溯性和准确性",
            '- 示例："用户在微信中发送了消息 [截图ID: 12345]"',
            "",
            "请用中文回答，保持简洁明了，重点突出关键信息。",
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
            if len(ocr_text) > 150:
                ocr_text = ocr_text[:150] + "..."

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
            "你是一个智能助手，专门帮助用户分析和总结历史记录数据。",
            "",
            "**强制性要求 - 必须严格遵守：**",
            "- 每当引用或提到任何具体信息时，必须标注截图ID来源，格式为：[截图ID: xxx]",
            "- 不允许提及任何信息而不标注其来源截图ID",
            "- 如果历史数据中包含截图ID信息，必须在相关内容后立即添加引用",
            "- 这是为了确保信息的可追溯性和准确性",
            '- 示例："用户在微信中发送了消息 [截图ID: 12345]"',
            "",
            "请用中文回答，保持简洁明了，重点突出关键信息。",
            "",
            f"统计查询: {query}",
            "",
        ]

        # 基础统计
        total_count = stats.get("total_screenshots", 0)
        context_parts.append(f"总记录数: {total_count}")

        # 应用分布
        app_distribution = stats.get("app_distribution", {})
        if app_distribution:
            context_parts.append("\n应用分布:")
            sorted_apps = sorted(app_distribution.items(), key=lambda x: x[1], reverse=True)
            for app, count in sorted_apps[:10]:  # 最多显示10个应用
                percentage = (count / total_count * 100) if total_count > 0 else 0
                context_parts.append(f"  {app}: {count} 条 ({percentage:.1f}%)")

        # 时间范围
        time_range = stats.get("time_range", {})
        if time_range.get("earliest") and time_range.get("latest"):
            try:
                earliest = datetime.fromisoformat(time_range["earliest"].replace("Z", "+00:00"))
                latest = datetime.fromisoformat(time_range["latest"].replace("Z", "+00:00"))
                context_parts.append(
                    f"\n时间范围: {earliest.strftime('%Y-%m-%d %H:%M')} 至 {latest.strftime('%Y-%m-%d %H:%M')}"
                )
            except:  # noqa: E722
                context_parts.append(
                    f"\n时间范围: {time_range['earliest']} 至 {time_range['latest']}"
                )

        # 查询条件
        query_conditions = stats.get("query_conditions", {})
        # 安全地检查是否有查询条件
        if hasattr(query_conditions, "app_names"):
            # QueryConditions对象
            has_conditions = (
                query_conditions.app_names
                or query_conditions.keywords
                or query_conditions.start_date
                or query_conditions.end_date
            )
            if has_conditions:
                context_parts.append("\n查询条件:")
                if query_conditions.app_names:
                    app_names = query_conditions.app_names
                    if isinstance(app_names, list):
                        context_parts.append(f"  应用: {', '.join(app_names)}")
                    else:
                        context_parts.append(f"  应用: {app_names}")
                if query_conditions.keywords:
                    context_parts.append(f"  关键词: {', '.join(query_conditions.keywords)}")
                if query_conditions.start_date:
                    context_parts.append(f"  开始时间: {query_conditions.start_date}")
                if query_conditions.end_date:
                    context_parts.append(f"  结束时间: {query_conditions.end_date}")
        elif isinstance(query_conditions, dict):
            # 字典格式
            has_conditions = (
                query_conditions.get("app_names")
                or query_conditions.get("keywords")
                or query_conditions.get("start_date")
                or query_conditions.get("end_date")
            )
            if has_conditions:
                context_parts.append("\n查询条件:")
                if query_conditions.get("app_names"):
                    app_names = query_conditions.get("app_names")
                    if isinstance(app_names, list):
                        context_parts.append(f"  应用: {', '.join(app_names)}")
                    else:
                        context_parts.append(f"  应用: {app_names}")
                if query_conditions.get("keywords"):
                    context_parts.append(f"  关键词: {', '.join(query_conditions.get('keywords'))}")
                if query_conditions.get("start_date"):
                    context_parts.append(f"  开始时间: {query_conditions.get('start_date')}")
                if query_conditions.get("end_date"):
                    context_parts.append(f"  结束时间: {query_conditions.get('end_date')}")

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
            if "ocr_text" in record and len(record["ocr_text"]) > 100:
                record["ocr_text"] = record["ocr_text"][:100] + "..."

        logger.warning(f"上下文过长，已截断至 {len(json.dumps(context, ensure_ascii=False))} 字符")
        return context
