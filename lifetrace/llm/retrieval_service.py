from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, or_

from lifetrace.storage import get_session
from lifetrace.storage.models import OCRResult, Screenshot
from lifetrace.util.logging_config import get_logger
from lifetrace.util.query_parser import QueryConditions, QueryParser

logger = get_logger()

# 常量定义
MAX_LOG_PREVIEW_RECORDS = 3  # 日志预览最大记录数
MAX_APP_DISTRIBUTION_DISPLAY = 5  # 应用分布显示最大数量
TIME_RECENCY_DAY_THRESHOLD = 1  # 时间新近性阈值（天）
TIME_RECENCY_WEEK_THRESHOLD = 7  # 时间新近性阈值（周）


class RetrievalService:
    """检索服务，用于从数据库中检索相关的截图和OCR数据"""

    def __init__(self):
        """
        初始化检索服务
        """
        self.query_parser = QueryParser()
        logger.info("检索服务初始化完成")

    def _build_base_query(self, session: Any, conditions: QueryConditions) -> Any:
        """构建基础查询"""
        query = session.query(Screenshot).join(OCRResult, Screenshot.id == OCRResult.screenshot_id)

        # 添加时间范围过滤
        if conditions.start_date:
            query = query.filter(Screenshot.created_at >= conditions.start_date)
        if conditions.end_date:
            query = query.filter(Screenshot.created_at <= conditions.end_date)

        # 添加应用名称过滤
        if conditions.app_names:
            app_filters = [Screenshot.app_name.ilike(f"%{app}%") for app in conditions.app_names]
            query = query.filter(or_(*app_filters))

        # 添加关键词过滤
        if conditions.keywords:
            keyword_filters = [
                OCRResult.text_content.ilike(f"%{keyword}%") for keyword in conditions.keywords
            ]
            query = query.filter(or_(*keyword_filters))

        return query.order_by(Screenshot.created_at.desc())

    def _convert_screenshot_to_dict(
        self, session: Any, screenshot: Screenshot, conditions: QueryConditions
    ) -> dict[str, Any]:
        """将截图转换为字典格式"""
        ocr_results = (
            session.query(OCRResult).filter(OCRResult.screenshot_id == screenshot.id).all()
        )

        ocr_text = " ".join([ocr.text_content for ocr in ocr_results if ocr.text_content])

        return {
            "screenshot_id": screenshot.id,
            "timestamp": screenshot.created_at.isoformat() if screenshot.created_at else None,
            "app_name": screenshot.app_name,
            "window_title": screenshot.window_title,
            "file_path": screenshot.file_path,
            "ocr_text": ocr_text,
            "ocr_count": len(ocr_results),
            "relevance_score": self._calculate_relevance(screenshot, ocr_text, conditions),
        }

    def _log_query_results(self, data_list: list[dict[str, Any]]) -> None:
        """记录查询结果日志"""
        logger.info("=" * 60)
        logger.info(f"📊 查询结果: 找到 {len(data_list)} 条记录")
        logger.info("=" * 60)

        if not data_list:
            return

        logger.info("📝 OCR内容详情 (前3条):")
        for i, item in enumerate(data_list[:MAX_LOG_PREVIEW_RECORDS]):
            ocr_text = item.get("ocr_text", "")
            logger.info(f"  [{i + 1}] 截图ID: {item['screenshot_id']}")
            logger.info(f"      应用: {item['app_name']}")
            logger.info(f"      时间: {item['timestamp']}")
            logger.info(f"      OCR文本长度: {len(ocr_text)} 字符")
            logger.info(f"      OCR文本预览: {ocr_text[:100] if ocr_text else '❌ 无OCR内容'}")
            if not ocr_text:
                logger.warning("      ⚠️  警告: 这条记录没有OCR文本！")

        # 统计有无OCR内容的记录
        has_ocr = sum(1 for item in data_list if item.get("ocr_text"))
        no_ocr = len(data_list) - has_ocr
        logger.info("📈 OCR统计:")
        logger.info(f"   ✅ 有OCR内容: {has_ocr} 条")
        logger.info(f"   ❌ 无OCR内容: {no_ocr} 条")

        logger.info("=" * 60)
        logger.info("=== 查询完成 ===")
        logger.info("=" * 60)

    def search_by_conditions(
        self, conditions: QueryConditions, limit: int = 50
    ) -> list[dict[str, Any]]:
        """
        根据查询条件检索数据

        Args:
            conditions: 查询条件
            limit: 返回结果的最大数量

        Returns:
            检索到的数据列表
        """
        try:
            logger.info(f"执行数据库查询 - 条件: {conditions}, 限制: {limit}")

            with get_session() as session:
                query = self._build_base_query(session, conditions)

                # 限制结果数量 - 优先使用QueryConditions中的limit
                effective_limit = conditions.limit if conditions.limit else limit
                results = query.limit(effective_limit).all()

                # 转换为字典格式
                data_list = [
                    self._convert_screenshot_to_dict(session, screenshot, conditions)
                    for screenshot in results
                ]

                # 按时间排序
                data_list.sort(key=lambda x: x["timestamp"], reverse=True)

                # 记录查询结果
                self._log_query_results(data_list)

                logger.info(f"检索完成，找到 {len(data_list)} 条记录")
                return data_list

        except Exception as e:
            logger.error(f"数据检索失败: {e}")
            return []

    def search_by_query(self, user_query: str, limit: int = 50) -> list[dict[str, Any]]:
        """
        根据用户查询检索数据

        Args:
            user_query: 用户的自然语言查询
            limit: 返回结果的最大数量

        Returns:
            检索到的数据列表
        """
        # 解析查询
        conditions = self.query_parser.parse_query(user_query)
        logger.info(f"查询解析结果: {conditions}")

        # 执行检索
        return self.search_by_conditions(conditions, limit)

    def search_recent(
        self, hours: int = 24, app_name: str = None, limit: int = 20
    ) -> list[dict[str, Any]]:
        """
        检索最近的记录

        Args:
            hours: 最近多少小时的记录
            app_name: 可选的应用名称过滤
            limit: 返回结果的最大数量

        Returns:
            检索到的数据列表
        """
        end_time = datetime.now()
        start_time = end_time - timedelta(hours=hours)

        conditions = QueryConditions(
            start_date=start_time,
            end_date=end_time,
            app_names=[app_name] if app_name else None,
        )

        return self.search_by_conditions(conditions, limit)

    def search_by_app(self, app_name: str, days: int = 7, limit: int = 50) -> list[dict[str, Any]]:
        """
        按应用名称检索记录

        Args:
            app_name: 应用名称
            days: 检索最近多少天的记录
            limit: 返回结果的最大数量

        Returns:
            检索到的数据列表
        """
        end_time = datetime.now()
        start_time = end_time - timedelta(days=days)

        conditions = QueryConditions(
            start_date=start_time,
            end_date=end_time,
            app_names=[app_name] if app_name else None,
        )

        return self.search_by_conditions(conditions, limit)

    def search_by_keywords(
        self, keywords: list[str], days: int = 30, limit: int = 50
    ) -> list[dict[str, Any]]:
        """
        按关键词检索记录

        Args:
            keywords: 关键词列表
            days: 检索最近多少天的记录
            limit: 返回结果的最大数量

        Returns:
            检索到的数据列表
        """
        end_time = datetime.now()
        start_time = end_time - timedelta(days=days)

        conditions = QueryConditions(start_date=start_time, end_date=end_time, keywords=keywords)

        return self.search_by_conditions(conditions, limit)

    def _apply_stats_conditions(self, query: Any, conditions: QueryConditions | None) -> Any:
        """应用统计查询条件"""
        if not conditions:
            return query

        if conditions.start_date:
            query = query.filter(Screenshot.created_at >= conditions.start_date)
        if conditions.end_date:
            query = query.filter(Screenshot.created_at <= conditions.end_date)
        if conditions.app_names:
            app_filters = [Screenshot.app_name.ilike(f"%{app}%") for app in conditions.app_names]
            query = query.filter(or_(*app_filters))

        return query

    def _build_stats_result(
        self,
        total_count: int,
        app_stats: list[tuple[str, int]],
        time_range: Any,
        conditions: QueryConditions | None,
    ) -> dict[str, Any]:
        """构建统计结果"""
        return {
            "total_screenshots": total_count,
            "app_distribution": dict(app_stats),
            "time_range": {
                "earliest": time_range.earliest.isoformat() if time_range.earliest else None,
                "latest": time_range.latest.isoformat() if time_range.latest else None,
            },
            "query_conditions": {
                "start_date": conditions.start_date.isoformat()
                if conditions and conditions.start_date
                else None,
                "end_date": conditions.end_date.isoformat()
                if conditions and conditions.end_date
                else None,
                "app_names": conditions.app_names if conditions else None,
                "keywords": conditions.keywords if conditions else [],
            },
        }

    def get_statistics(self, conditions: QueryConditions | None = None) -> dict[str, Any]:
        """
        获取统计信息

        Args:
            conditions: 可选的查询条件

        Returns:
            统计信息字典
        """
        try:
            logger.info("=== 数据库查询 - get_statistics ===")
            logger.info(f"统计查询条件: {conditions}")

            with get_session() as session:
                # 基础查询并应用条件
                query = self._apply_stats_conditions(session.query(Screenshot), conditions)
                total_count = query.count()

                # 按应用分组统计
                app_stats_query = session.query(
                    Screenshot.app_name, func.count(Screenshot.id).label("count")
                ).group_by(Screenshot.app_name)
                app_stats_query = self._apply_stats_conditions(app_stats_query, conditions)
                app_stats = app_stats_query.all()

                # 时间范围
                time_range = query.with_entities(
                    func.min(Screenshot.created_at).label("earliest"),
                    func.max(Screenshot.created_at).label("latest"),
                ).first()

                stats = self._build_stats_result(total_count, app_stats, time_range, conditions)

                # 记录统计结果
                logger.info(f"统计结果: 总截图数={total_count}")
                app_dist = stats["app_distribution"]
                app_preview = dict(list(app_dist.items())[:MAX_APP_DISTRIBUTION_DISPLAY])
                logger.info(
                    f"  应用分布: {app_preview}{'...' if len(app_dist) > MAX_APP_DISTRIBUTION_DISPLAY else ''}"
                )
                logger.info("=== 统计查询完成 ===")

                return stats

        except Exception as e:
            logger.error(f"统计信息获取失败: {e}")
            return {
                "total_screenshots": 0,
                "app_distribution": {},
                "time_range": {"earliest": None, "latest": None},
                "query_conditions": {},
            }

    def _calculate_relevance(
        self, screenshot: Screenshot, ocr_text: str, conditions: QueryConditions
    ) -> float:
        """
        计算相关性得分

        Args:
            screenshot: 截图对象
            ocr_text: OCR文本
            conditions: 查询条件

        Returns:
            相关性得分 (0.0 - 1.0)
        """
        score = 0.0

        # 应用名称匹配加分
        if conditions.app_names and screenshot.app_name:
            if any(app.lower() in screenshot.app_name.lower() for app in conditions.app_names):
                score += 0.3

        # 关键词匹配加分
        if conditions.keywords and ocr_text:
            text_lower = ocr_text.lower()
            keyword_matches = 0
            for keyword in conditions.keywords:
                if keyword.lower() in text_lower:
                    keyword_matches += 1

            if keyword_matches > 0:
                score += 0.5 * (keyword_matches / len(conditions.keywords))

        # 时间新近性加分
        if screenshot.created_at:
            now = datetime.now()
            time_diff = now - screenshot.created_at
            if time_diff.days < TIME_RECENCY_DAY_THRESHOLD:
                score += 0.2
            elif time_diff.days < TIME_RECENCY_WEEK_THRESHOLD:
                score += 0.1

        return min(score, 1.0)
