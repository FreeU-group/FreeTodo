"""
事件摘要生成服务
使用LLM为事件生成标题和摘要
"""

import json
import logging
from datetime import datetime
from typing import Any

from lifetrace.llm.llm_client import LLMClient
from lifetrace.storage import db_manager
from lifetrace.storage.models import Event, OCRResult, Screenshot

logger = logging.getLogger(__name__)


class EventSummaryService:
    """事件摘要生成服务"""

    def __init__(self):
        """初始化服务"""
        self.llm_client = LLMClient()
        self.db_manager = db_manager

    def generate_event_summary(self, event_id: int) -> bool:
        """
        为单个事件生成摘要

        Args:
            event_id: 事件ID

        Returns:
            生成是否成功
        """
        try:
            # 获取事件信息
            event_info = self._get_event_info(event_id)
            if not event_info:
                logger.warning(f"事件 {event_id} 不存在")
                return False

            # 获取事件下所有截图的OCR结果
            ocr_texts = self._get_event_ocr_texts(event_id)

            # 生成标题和摘要
            if ocr_texts and len("".join(ocr_texts).strip()) > 10:
                # 有足够的OCR数据，使用LLM生成
                result = self._generate_summary_with_llm(
                    ocr_texts=ocr_texts,
                    app_name=event_info["app_name"],
                    window_title=event_info["window_title"],
                    start_time=event_info["start_time"],
                    end_time=event_info["end_time"],
                )
            else:
                # 无OCR数据或数据太少，使用后备方案
                result = self._generate_fallback_summary(
                    app_name=event_info["app_name"],
                    window_title=event_info["window_title"],
                )

            if result:
                # 更新事件表
                success = self.db_manager.update_event_summary(
                    event_id=event_id,
                    ai_title=result["title"],
                    ai_summary=result["summary"],
                )

                if success:
                    logger.info(f"事件 {event_id} 摘要生成成功: {result['title']}")
                    return True
                else:
                    logger.error(f"事件 {event_id} 摘要更新失败")
                    return False
            else:
                logger.error(f"事件 {event_id} 摘要生成失败")
                return False

        except Exception as e:
            logger.error(f"生成事件 {event_id} 摘要时出错: {e}", exc_info=True)
            return False

    def _get_event_info(self, event_id: int) -> dict[str, Any] | None:
        """获取事件信息"""
        try:
            with self.db_manager.get_session() as session:
                event = session.query(Event).filter(Event.id == event_id).first()
                if not event:
                    return None

                return {
                    "id": event.id,
                    "app_name": event.app_name,
                    "window_title": event.window_title,
                    "start_time": event.start_time,
                    "end_time": event.end_time,
                }
        except Exception as e:
            logger.error(f"获取事件信息失败: {e}")
            return None

    def _get_event_ocr_texts(self, event_id: int) -> list[str]:
        """获取事件下所有截图的OCR文本"""
        ocr_texts = []

        try:
            with self.db_manager.get_session() as session:
                # 查询事件下的所有截图
                screenshots = (
                    session.query(Screenshot).filter(Screenshot.event_id == event_id).all()
                )

                # 获取每个截图的OCR结果
                for screenshot in screenshots:
                    ocr_results = (
                        session.query(OCRResult)
                        .filter(OCRResult.screenshot_id == screenshot.id)
                        .all()
                    )

                    for ocr in ocr_results:
                        if ocr.text_content and ocr.text_content.strip():
                            ocr_texts.append(ocr.text_content.strip())

            return ocr_texts

        except Exception as e:
            logger.error(f"获取事件OCR文本失败: {e}")
            return []

    def _generate_summary_with_llm(
        self,
        ocr_texts: list[str],
        app_name: str,
        window_title: str,
        start_time: datetime,
        end_time: datetime | None,
    ) -> dict[str, str] | None:
        """
        使用LLM生成标题和摘要

        Returns:
            {'title': str, 'summary': str} 或 None
        """
        if not self.llm_client.is_available():
            logger.warning("LLM客户端不可用，使用后备方案")
            return self._generate_fallback_summary(app_name, window_title)

        try:
            # 合并OCR文本（限制长度避免token超限）
            combined_text = "\n".join(ocr_texts)
            # 限制为最多3000字符
            if len(combined_text) > 3000:
                combined_text = combined_text[:3000] + "..."

            # 格式化时间
            start_str = start_time.strftime("%Y-%m-%d %H:%M:%S") if start_time else "未知"
            end_str = end_time.strftime("%Y-%m-%d %H:%M:%S") if end_time else "进行中"

            # 构建prompt
            prompt = f"""你是一个活动摘要助手。根据用户在应用中的操作截图OCR文本，生成简洁的标题和摘要。

应用名称：{app_name or "未知应用"}
窗口标题：{window_title or "未知窗口"}
时间范围：{start_str} 至 {end_str}

OCR文本内容：
{combined_text}

要求：
1. 生成一个标题（不超过10个字），概括用户在做什么
2. 生成一个摘要（不超过30个字），描述活动的关键内容，重点部分用**加粗**标记
3. 标题要简洁有力，摘要要突出核心信息
4. 如果OCR文本内容较杂乱，提取最重要的主题

请以JSON格式返回：
{{
  "title": "标题内容",
  "summary": "摘要内容，**重点部分**"
}}"""

            # 调用LLM
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一个专业的活动摘要助手，擅长从文本中提取关键信息并生成简洁摘要。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=200,
            )

            # 解析响应
            content = response.choices[0].message.content.strip()

            # 尝试提取JSON
            # 如果响应包含```json标记，提取其中的内容
            if "```json" in content:
                json_start = content.find("```json") + 7
                json_end = content.find("```", json_start)
                content = content[json_start:json_end].strip()
            elif "```" in content:
                json_start = content.find("```") + 3
                json_end = content.find("```", json_start)
                content = content[json_start:json_end].strip()

            result = json.loads(content)

            # 验证结果
            if "title" in result and "summary" in result:
                # 确保长度限制
                title = result["title"][:20]  # 最多20字符（约10个中文字）
                summary = result["summary"][:60]  # 最多60字符（约30个中文字）

                return {"title": title, "summary": summary}
            else:
                logger.warning(f"LLM返回格式不正确: {result}")
                return self._generate_fallback_summary(app_name, window_title)

        except json.JSONDecodeError as e:
            logger.error(f"解析LLM响应JSON失败: {e}, 响应内容: {content}")
            return self._generate_fallback_summary(app_name, window_title)
        except Exception as e:
            logger.error(f"LLM生成摘要失败: {e}", exc_info=True)
            return self._generate_fallback_summary(app_name, window_title)

    def _generate_fallback_summary(
        self, app_name: str | None, window_title: str | None
    ) -> dict[str, str]:
        """
        无OCR数据时的后备方案
        基于应用名和窗口标题生成简单描述
        """
        app_name = app_name or "未知应用"
        window_title = window_title or "未知窗口"

        # 简化应用名（去除.exe等后缀）
        app_display = app_name.replace(".exe", "").replace(".EXE", "")

        # 生成简单标题
        title = f"{app_display}使用"
        if len(title) > 10:
            title = title[:10]

        # 生成简单摘要
        summary = f"在**{app_display}**中活动"
        if window_title and window_title != "未知窗口" and len(window_title) < 20:
            summary = f"使用**{app_display}**: {window_title[:15]}"

        return {"title": title, "summary": summary}


# 全局实例
event_summary_service = EventSummaryService()


def generate_event_summary_async(event_id: int):
    """
    异步生成事件摘要（在单独线程中调用）

    Args:
        event_id: 事件ID
    """
    import threading

    def _generate():
        try:
            event_summary_service.generate_event_summary(event_id)
        except Exception as e:
            logger.error(f"异步生成事件摘要失败: {e}", exc_info=True)

    thread = threading.Thread(target=_generate, daemon=True)
    thread.start()
