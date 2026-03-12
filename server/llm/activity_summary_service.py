"""
活动摘要生成服务
使用LLM为活动（聚合的事件）生成标题和摘要
"""

import json
from datetime import UTC, datetime
from typing import Any, cast

from llm.llm_client import LLMClient
from util.logging_config import get_logger
from util.prompt_loader import get_prompt
from util.token_usage_logger import log_token_usage

logger = get_logger()

# 常量定义
MAX_TITLE_LENGTH = 50  # 活动标题最大长度
RESPONSE_PREVIEW_LENGTH = 500  # 响应预览文本长度
MAX_FALLBACK_TITLES = 3  # 后备方案中最多显示的事件标题数量


class ActivitySummaryService:
    """活动摘要生成服务"""

    def __init__(self):
        """初始化服务"""
        self.llm_client = LLMClient()

    def generate_activity_summary(
        self,
        events: list[dict[str, Any]],
        start_time: datetime,
        end_time: datetime,
    ) -> dict[str, str] | None:
        """
        为活动生成摘要

        Args:
            events: 事件列表，每个事件包含 ai_title 和 ai_summary
            start_time: 活动开始时间
            end_time: 活动结束时间

        Returns:
            {'title': str, 'summary': str} 或 None
        """
        try:
            if not events:
                logger.warning("事件列表为空，无法生成活动摘要")
                return None

            # 如果LLM不可用，使用后备方案
            if not self.llm_client.is_available():
                logger.warning("LLM客户端不可用，使用后备方案")
                return self._generate_fallback_summary(events, start_time, end_time)

            # 准备输入数据，支持时间信息
            event_summaries = []
            for event in events:
                title = event.get("ai_title", "")
                summary = event.get("ai_summary", "")
                # 支持 start_time 或 time 字段
                event_time = event.get("start_time") or event.get("time")
                if title or summary:
                    event_data = {"title": title, "summary": summary}
                    if event_time:
                        event_data["time"] = event_time
                    event_summaries.append(event_data)

            if not event_summaries:
                logger.warning("所有事件都没有AI总结，使用后备方案")
                return self._generate_fallback_summary(events, start_time, end_time)

            # 如果有时间信息，按时间排序
            if any("time" in e for e in event_summaries):
                event_summaries.sort(
                    key=lambda x: x.get("time") or datetime.min.replace(tzinfo=UTC)
                )

            # 使用LLM生成总结
            result = self._generate_summary_with_llm(
                event_summaries=event_summaries,
                start_time=start_time,
                end_time=end_time,
            )

            # 如果LLM生成成功，返回结果；否则返回fallback
            return (
                result if result else self._generate_fallback_summary(events, start_time, end_time)
            )

        except Exception as e:
            logger.error(f"生成活动摘要时出错: {e}", exc_info=True)
            return self._generate_fallback_summary(events, start_time, end_time)

    def _generate_summary_with_llm(
        self,
        event_summaries: list[dict[str, str]],
        start_time: datetime,
        end_time: datetime,
    ) -> dict[str, str] | None:
        """
        使用LLM生成活动标题和摘要

        Args:
            event_summaries: 事件摘要列表，每个包含 title 和 summary
            start_time: 活动开始时间
            end_time: 活动结束时间

        Returns:
            {'title': str, 'summary': str} 或 None
        """
        try:
            # 格式化时间
            start_str = start_time.strftime("%Y-%m-%d %H:%M:%S") if start_time else "未知"
            end_str = end_time.strftime("%Y-%m-%d %H:%M:%S") if end_time else "进行中"

            # 构建事件摘要文本（按时间线格式）
            events_text = ""
            has_time_info = any("time" in e for e in event_summaries)

            for i, event in enumerate(event_summaries, 1):
                title = event.get("title", "无标题")
                summary = event.get("summary", "无摘要")

                if has_time_info and "time" in event:
                    # 如果有时间信息，按时间线格式呈现
                    event_time = event.get("time")
                    if isinstance(event_time, datetime):
                        time_str = event_time.strftime("%H:%M:%S")
                    else:
                        time_str = str(event_time)
                    events_text += f"{i}. [{time_str}] {title}\n   {summary}\n\n"
                else:
                    # 无时间信息，使用原有格式
                    events_text += f"{i}. 标题：{title}\n   摘要：{summary}\n\n"

            # 从配置文件加载提示词
            system_prompt = get_prompt("activity_summary", "system_assistant")
            user_prompt = get_prompt(
                "activity_summary",
                "user_prompt",
                start_time=start_str,
                end_time=end_str,
                events_text=events_text,
                event_count=len(event_summaries),
            )

            # 调用LLM（增加max_tokens以支持结构化摘要）
            client = self.llm_client._get_client()
            response = cast(
                "Any",
                client.chat.completions.create(
                    model=self.llm_client.model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.3,
                    max_tokens=1000,  # 增加token限制以支持结构化摘要（500字中文约需1000 tokens）
                ),
            )

            # 记录token使用量
            usage = getattr(response, "usage", None)
            if usage:
                log_token_usage(
                    model=self.llm_client.model,
                    input_tokens=usage.prompt_tokens,
                    output_tokens=usage.completion_tokens,
                    endpoint="activity_summary",
                    response_type="summary_generation",
                    feature_type="activity_summary",
                )

            # 解析响应
            content = (response.choices[0].message.content or "").strip()
            if content:
                extracted_content, original_content = self._extract_json_from_response(content)
                if extracted_content:
                    result = self._parse_llm_response(extracted_content, original_content)
                    if result:
                        return result
                else:
                    logger.warning(f"提取JSON后内容为空，原始响应: {original_content[:200]}")
            else:
                logger.warning("LLM返回空内容，使用后备方案")

        except Exception as e:
            logger.error(f"LLM生成活动摘要失败: {e}", exc_info=True)

        return None

    def _extract_json_from_response(self, content: str) -> tuple[str, str]:
        """从LLM响应中提取JSON内容

        Returns:
            (提取的JSON内容, 原始内容)
        """
        original_content = content
        if "```json" in content:
            json_start = content.find("```json") + 7
            json_end = content.find("```", json_start)
            content = content[json_start:json_end].strip()
        elif "```" in content:
            json_start = content.find("```") + 3
            json_end = content.find("```", json_start)
            content = content[json_start:json_end].strip()
        return content, original_content

    def _parse_llm_response(self, content: str, original_content: str) -> dict[str, str] | None:
        """解析LLM响应为字典

        Returns:
            解析后的结果，如果失败则返回None
        """
        try:
            result = json.loads(content)
            if "title" in result and "summary" in result:
                title = result["title"][:MAX_TITLE_LENGTH]
                summary = result["summary"][:1500]  # 摘要限制在1500字符（约500-750中文字）
                return {"title": title, "summary": summary}
            logger.warning(f"LLM返回格式不正确: {result}")
            return None
        except json.JSONDecodeError as e:
            preview = (
                original_content[:RESPONSE_PREVIEW_LENGTH]
                if len(original_content) > RESPONSE_PREVIEW_LENGTH
                else original_content
            )
            logger.error(f"解析LLM响应JSON失败: {e}\n原始响应: {preview[:200]}")
            return None

    def _generate_fallback_summary(
        self,
        events: list[dict[str, Any]],
        start_time: datetime,
        end_time: datetime,
    ) -> dict[str, str]:
        """
        无LLM时的后备方案
        基于事件标题生成简单描述
        """
        _ = start_time
        _ = end_time
        if not events:
            return {"title": "无活动", "summary": "该时间段内无活动记录"}

        # 收集所有事件的标题
        titles = []
        for event in events:
            title = event.get("ai_title", "")
            if title:
                titles.append(title)

        if not titles:
            return {"title": "活动记录", "summary": f"包含 {len(events)} 个事件"}

        # 生成简单标题（取第一个标题或合并）
        title = titles[0] if len(titles) == 1 else f"{titles[0]}等{len(titles)}项活动"

        # 生成简单摘要
        summary = f"包含 {len(events)} 个事件："
        for i, t in enumerate(titles[:MAX_FALLBACK_TITLES], 1):  # 最多显示MAX_FALLBACK_TITLES个
            summary += f"{i}. {t}；"
        if len(titles) > MAX_FALLBACK_TITLES:
            summary += f"等共{len(titles)}项"

        return {"title": title[:MAX_TITLE_LENGTH], "summary": summary}


# 全局实例
activity_summary_service = ActivitySummaryService()
