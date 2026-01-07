"""
事件摘要生成服务
使用LLM为事件生成标题和摘要
"""

import json
import threading
from datetime import datetime
from typing import Any

from lifetrace.llm.llm_client import LLMClient
from lifetrace.storage import event_mgr, get_session
from lifetrace.storage.models import Event
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

from .event_summary_clustering import cluster_ocr_texts_with_hdbscan
from .event_summary_config import (
    MAX_COMBINED_TEXT_LENGTH,
    MAX_SUMMARY_LENGTH,
    MAX_TITLE_LENGTH,
    MIN_OCR_TEXT_LENGTH,
    MIN_SCREENSHOTS_FOR_LLM,
    OCR_PREVIEW_LENGTH,
)
from .event_summary_ocr import get_event_ocr_texts, separate_ui_candidates

logger = get_logger()


class EventSummaryService:
    """事件摘要生成服务"""

    def __init__(self, vector_service=None):
        """初始化服务

        Args:
            vector_service: 向量服务实例（可选），如果未提供则尝试从dependencies导入
        """
        self.llm_client = LLMClient()
        self.vector_service = vector_service

    def _get_vector_service(self):
        """动态获取向量服务实例"""
        if self.vector_service is not None:
            logger.debug("使用初始化时提供的vector_service")
            return self.vector_service

        try:
            from lifetrace.core.dependencies import get_vector_service

            vector_svc = get_vector_service()
            if vector_svc is not None:
                logger.info(
                    f"从core.dependencies获取到vector_service: "
                    f"enabled={vector_svc.enabled}, "
                    f"vector_db={'存在' if vector_svc.vector_db else '不存在'}"
                )
                return vector_svc
            else:
                logger.warning("get_vector_service()返回None，可能还未初始化")
                return None
        except ImportError as e:
            logger.warning(f"无法导入core.dependencies模块: {e}")
            return None
        except Exception as e:
            logger.warning(f"获取vector_service时出错: {e}")
            return None

    def _process_event_with_few_screenshots(
        self, event_id: int, event_info: dict[str, Any], screenshot_count: int
    ) -> dict[str, Any]:
        """处理截图数量较少的事件"""
        logger.info(f"事件 {event_id} 只有 {screenshot_count} 张截图，使用fallback summary")
        ocr_lines, ocr_debug_info = get_event_ocr_texts(event_id)
        result = self._generate_fallback_summary(
            app_name=event_info["app_name"],
            window_title=event_info["window_title"],
        )
        return {
            "result": result,
            "ocr_lines": ocr_lines,
            "ocr_debug_info": ocr_debug_info,
            "clustering_info": None,
            "llm_info": None,
        }

    def _process_event_with_sufficient_screenshots(
        self, event_id: int, event_info: dict[str, Any]
    ) -> dict[str, Any]:
        """处理有足够截图的事件"""
        ocr_lines, ocr_debug_info = get_event_ocr_texts(event_id)
        body_lines, ui_info = separate_ui_candidates(ocr_debug_info.get("lines_with_meta", []))
        ocr_debug_info["ui_info"] = ui_info
        effective_lines = body_lines if body_lines else ocr_lines
        combined_ocr_length = len("".join(effective_lines).strip()) if effective_lines else 0

        clustering_info = None
        llm_info = None

        if effective_lines and combined_ocr_length > MIN_OCR_TEXT_LENGTH:
            vector_service = self._get_vector_service()
            clustered_texts = cluster_ocr_texts_with_hdbscan(effective_lines, vector_service)
            clustering_info = None

            if not clustered_texts:
                clustered_texts = effective_lines

            ui_kept = ui_info.get("ui_kept", []) if ui_info else []
            llm_input_texts = clustered_texts + ui_kept if ui_kept else clustered_texts

            result = self._generate_summary_with_llm(
                ocr_texts=llm_input_texts,
                app_name=event_info["app_name"],
                window_title=event_info["window_title"],
                start_time=event_info["start_time"],
                end_time=event_info["end_time"],
            )
            llm_info = None
        else:
            result = self._generate_fallback_summary(
                app_name=event_info["app_name"],
                window_title=event_info["window_title"],
            )

        return {
            "result": result,
            "ocr_lines": ocr_lines,
            "ocr_debug_info": ocr_debug_info,
            "clustering_info": clustering_info,
            "llm_info": llm_info,
        }

    def _update_event_summary_in_db(self, event_id: int, result: dict[str, str] | None) -> bool:
        """更新数据库中的事件摘要"""
        if not result:
            logger.error(f"事件 {event_id} 摘要生成失败")
            return False

        success = event_mgr.update_event_summary(
            event_id=event_id,
            ai_title=result["title"],
            ai_summary=result["summary"],
        )

        if success:
            logger.info(f"事件 {event_id} 摘要生成成功: {result['title']}")
            return True
        logger.error(f"事件 {event_id} 摘要更新失败")
        return False

    def generate_event_summary(self, event_id: int) -> bool:
        """为单个事件生成摘要

        Args:
            event_id: 事件ID

        Returns:
            生成是否成功
        """
        event_info = None

        try:
            event_info = self._get_event_info(event_id)
            if not event_info:
                logger.warning(f"事件 {event_id} 不存在")
                return False

            screenshots = event_mgr.get_event_screenshots(event_id)
            screenshot_count = len(screenshots)

            if screenshot_count < MIN_SCREENSHOTS_FOR_LLM:
                process_result = self._process_event_with_few_screenshots(
                    event_id, event_info, screenshot_count
                )
                result = process_result["result"]
            else:
                process_result = self._process_event_with_sufficient_screenshots(
                    event_id, event_info
                )
                result = process_result["result"]

            return self._update_event_summary_in_db(event_id, result)

        except Exception as e:
            logger.error(f"生成事件 {event_id} 摘要时出错: {e}", exc_info=True)
            return False

    def _get_event_info(self, event_id: int) -> dict[str, Any] | None:
        """获取事件信息"""
        try:
            with get_session() as session:
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

    def _prepare_ocr_text(self, ocr_texts: list[str]) -> str | None:
        """准备OCR文本，合并并限制长度"""
        combined_text = "\n".join(ocr_texts)
        if len(combined_text) > MAX_COMBINED_TEXT_LENGTH:
            combined_text = combined_text[:MAX_COMBINED_TEXT_LENGTH] + "..."

        if not combined_text or len(combined_text.strip()) < MIN_OCR_TEXT_LENGTH:
            return None
        return combined_text

    def _extract_json_from_response(self, content: str) -> tuple[str, str]:
        """从LLM响应中提取JSON内容"""
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
        """解析LLM响应为字典"""
        try:
            result = json.loads(content)
            if "title" in result and "summary" in result:
                title = result["title"][:MAX_TITLE_LENGTH]
                summary = result["summary"][:MAX_SUMMARY_LENGTH]
                return {"title": title, "summary": summary}
            logger.warning(f"LLM返回格式不正确: {result}")
            return None
        except json.JSONDecodeError as e:
            ocr_preview = (
                original_content[:OCR_PREVIEW_LENGTH]
                if len(original_content) > OCR_PREVIEW_LENGTH
                else original_content
            )
            logger.error(f"解析LLM响应JSON失败: {e}\n原始响应: {ocr_preview[:200]}")
            return None

    def _generate_summary_with_llm(
        self,
        ocr_texts: list[str],
        app_name: str,
        window_title: str,
        start_time: datetime,
        end_time: datetime | None,
    ) -> dict[str, str] | None:
        """使用LLM生成标题和摘要"""
        if not self.llm_client.is_available():
            logger.warning("LLM客户端不可用，使用后备方案")
            return self._generate_fallback_summary(app_name, window_title)

        combined_text = self._prepare_ocr_text(ocr_texts)
        if not combined_text:
            logger.warning("OCR文本内容太少，使用后备方案")
            return self._generate_fallback_summary(app_name, window_title)

        try:
            start_str = start_time.strftime("%Y-%m-%d %H:%M:%S") if start_time else "未知"
            end_str = end_time.strftime("%Y-%m-%d %H:%M:%S") if end_time else "进行中"

            system_prompt = get_prompt("event_summary", "system_assistant")
            user_prompt = get_prompt(
                "event_summary",
                "user_prompt",
                app_name=app_name or "未知应用",
                window_title=window_title or "未知窗口",
                start_time=start_str,
                end_time=end_str,
                ocr_text=combined_text,
            )

            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=200,
            )

            if hasattr(response, "usage") and response.usage:
                from lifetrace.util.token_usage_logger import log_token_usage

                log_token_usage(
                    model=self.llm_client.model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint="event_summary",
                    response_type="summary_generation",
                    feature_type="event_summary",
                )

            content = response.choices[0].message.content.strip()
            if content:
                extracted_content, original_content = self._extract_json_from_response(content)
                if extracted_content:
                    result = self._parse_llm_response(extracted_content, original_content)
                    if result:
                        return result
                logger.warning("LLM响应解析失败，使用后备方案")
            else:
                logger.warning("LLM返回空内容，使用后备方案")

        except Exception as e:
            logger.error(f"LLM生成摘要失败: {e}", exc_info=True)

        return self._generate_fallback_summary(app_name, window_title)

    def _generate_fallback_summary(
        self, app_name: str | None, window_title: str | None
    ) -> dict[str, str]:
        """无OCR数据时的后备方案"""
        app_name = app_name or "未知应用"
        window_title = window_title or "未知窗口"

        app_display = app_name.replace(".exe", "").replace(".EXE", "")

        title = f"{app_display}使用"
        if len(title) > MAX_TITLE_LENGTH:
            title = title[:MAX_TITLE_LENGTH]

        summary = f"在**{app_display}**中活动"
        if window_title and window_title != "未知窗口":
            summary = f"使用**{app_display}**: {window_title[:50]}"

        return {"title": title, "summary": summary}


# 全局实例
event_summary_service = EventSummaryService()


def generate_event_summary_async(event_id: int):
    """异步生成事件摘要（在单独线程中调用）

    Args:
        event_id: 事件ID
    """

    def _generate():
        try:
            event_summary_service.generate_event_summary(event_id)
        except Exception as e:
            logger.error(f"异步生成事件摘要失败: {e}", exc_info=True)

    thread = threading.Thread(target=_generate, daemon=True)
    thread.start()
