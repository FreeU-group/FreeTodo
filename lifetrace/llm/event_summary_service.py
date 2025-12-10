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
from lifetrace.storage.models import Event, OCRResult, Screenshot
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()

# 常量定义
MIN_SCREENSHOTS_FOR_LLM = 3  # 使用LLM生成摘要的最小截图数量
MIN_OCR_TEXT_LENGTH = 10  # OCR文本的最小长度阈值
MAX_COMBINED_TEXT_LENGTH = 3000  # 合并OCR文本的最大长度
MIN_CLUSTER_SIZE = 2  # HDBSCAN聚类的最小聚类大小
MIN_TEXT_COUNT_FOR_CLUSTERING = 2  # 进行聚类的最小文本数量
MAX_TITLE_LENGTH = 10  # 标题最大长度
OCR_PREVIEW_LENGTH = 100  # OCR预览文本长度
RESPONSE_PREVIEW_LENGTH = 500  # 响应预览文本长度

# 尝试导入HDBSCAN
try:
    import hdbscan
    import numpy as np

    HDBSCAN_AVAILABLE = True
except ImportError:
    HDBSCAN_AVAILABLE = False
    logger.warning("HDBSCAN not available, clustering will fallback to simple aggregation")


class EventSummaryService:
    """事件摘要生成服务"""

    def __init__(self, vector_service=None):
        """初始化服务

        Args:
            vector_service: 向量服务实例（可选），如果未提供则尝试从dependencies导入
        """
        self.llm_client = LLMClient()
        self.vector_service = vector_service
        # 不在初始化时获取，而是在使用时动态获取（因为dependencies可能在模块导入时还未初始化）

    def _get_vector_service(self):
        """动态获取向量服务实例"""
        if self.vector_service is not None:
            logger.debug("使用初始化时提供的vector_service")
            return self.vector_service

        try:
            from lifetrace.routers import dependencies

            vector_svc = dependencies.vector_service
            if vector_svc is not None:
                logger.info(
                    f"从dependencies获取到vector_service: "
                    f"enabled={vector_svc.enabled}, "
                    f"vector_db={'存在' if vector_svc.vector_db else '不存在'}"
                )
                return vector_svc
            else:
                logger.warning("dependencies.vector_service为None，可能还未初始化")
                return None
        except ImportError as e:
            logger.warning(f"无法导入dependencies模块: {e}")
            return None
        except AttributeError as e:
            logger.warning(f"dependencies模块中没有vector_service属性: {e}")
            return None

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

            # 获取事件的截图数量
            screenshots = event_mgr.get_event_screenshots(event_id)
            screenshot_count = len(screenshots)

            # 如果截图少于指定数量，直接使用fallback summary，不调用LLM
            if screenshot_count < MIN_SCREENSHOTS_FOR_LLM:
                logger.info(f"事件 {event_id} 只有 {screenshot_count} 张截图，使用fallback summary")
                result = self._generate_fallback_summary(
                    app_name=event_info["app_name"],
                    window_title=event_info["window_title"],
                )
            else:
                # 获取事件下所有截图的OCR结果
                ocr_texts = self._get_event_ocr_texts(event_id)

                # 对于长事件（>=指定数量截图），使用向量化聚类处理OCR文本
                combined_ocr_length = len("".join(ocr_texts).strip()) if ocr_texts else 0
                if ocr_texts and combined_ocr_length > MIN_OCR_TEXT_LENGTH:
                    # 使用HDBSCAN聚类处理OCR文本
                    clustered_texts = self._cluster_ocr_texts_with_hdbscan(ocr_texts)
                    if not clustered_texts:
                        # 如果聚类失败，回退到原始文本
                        clustered_texts = ocr_texts

                    # 使用LLM生成摘要
                    result = self._generate_summary_with_llm(
                        ocr_texts=clustered_texts,
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
                success = event_mgr.update_event_summary(
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

    def _get_event_ocr_texts(self, event_id: int) -> list[str]:
        """获取事件下所有截图的OCR文本"""
        ocr_texts = []

        try:
            with get_session() as session:
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

    def _prepare_ocr_text(self, ocr_texts: list[str]) -> str | None:
        """准备OCR文本，合并并限制长度

        Returns:
            合并后的文本，如果太短则返回None
        """
        combined_text = "\n".join(ocr_texts)
        if len(combined_text) > MAX_COMBINED_TEXT_LENGTH:
            combined_text = combined_text[:MAX_COMBINED_TEXT_LENGTH] + "..."

        if not combined_text or len(combined_text.strip()) < MIN_OCR_TEXT_LENGTH:
            return None
        return combined_text

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
                title = result["title"][:20]
                summary = result["summary"][:60]
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
        """
        使用LLM生成标题和摘要

        Returns:
            {'title': str, 'summary': str} 或 None
        """
        # 前置检查：如果LLM不可用或文本不足，直接返回fallback
        if not self.llm_client.is_available():
            logger.warning("LLM客户端不可用，使用后备方案")
            return self._generate_fallback_summary(app_name, window_title)

        combined_text = self._prepare_ocr_text(ocr_texts)
        if not combined_text:
            logger.warning("OCR文本内容太少，使用后备方案")
            return self._generate_fallback_summary(app_name, window_title)

        # 尝试使用LLM生成，失败则返回fallback
        result = None
        try:
            # 格式化时间
            start_str = start_time.strftime("%Y-%m-%d %H:%M:%S") if start_time else "未知"
            end_str = end_time.strftime("%Y-%m-%d %H:%M:%S") if end_time else "进行中"

            # 从配置文件加载提示词
            system_prompt = get_prompt("event_summary", "activity_assistant")
            user_prompt = get_prompt(
                "event_summary",
                "activity_summary",
                app_name=app_name or "未知应用",
                window_title=window_title or "未知窗口",
                start_time=start_str,
                end_time=end_str,
                ocr_text=combined_text,
            )

            # 调用LLM
            response = self.llm_client.client.chat.completions.create(
                model=self.llm_client.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=200,
            )

            # 记录token使用量
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

            # 解析响应
            content = response.choices[0].message.content.strip()
            if content:
                extracted_content, original_content = self._extract_json_from_response(content)
                if extracted_content:
                    result = self._parse_llm_response(extracted_content, original_content)
                else:
                    logger.warning(f"提取JSON后内容为空，原始响应: {original_content[:200]}")
            else:
                logger.warning("LLM返回空内容，使用后备方案")

        except Exception as e:
            logger.error(f"LLM生成摘要失败: {e}", exc_info=True)

        # 如果LLM生成成功，返回结果；否则返回fallback
        return result if result else self._generate_fallback_summary(app_name, window_title)

    def _check_clustering_prerequisites(self, ocr_texts: list[str]) -> tuple[bool, str]:
        """检查聚类前置条件

        Returns:
            (是否满足条件, 错误消息)
        """
        if not HDBSCAN_AVAILABLE:
            return False, "HDBSCAN不可用，回退到简单聚合"

        if not ocr_texts or len(ocr_texts) < MIN_TEXT_COUNT_FOR_CLUSTERING:
            return False, "文本数量不足"

        vector_service = self._get_vector_service()
        if not vector_service:
            return False, "向量服务未初始化，回退到简单聚合"

        if not vector_service.is_enabled():
            return (
                False,
                f"向量服务未启用 (enabled={vector_service.enabled}, "
                f"vector_db={'存在' if vector_service.vector_db else '不存在'})，回退到简单聚合",
            )

        if not vector_service.vector_db:
            return False, "向量数据库实例不存在，回退到简单聚合"

        return True, ""

    def _vectorize_texts(
        self, ocr_texts: list[str], vector_service
    ) -> tuple[list[list[float]], list[str]]:
        """对OCR文本进行向量化

        Returns:
            (向量列表, 有效文本列表)
        """
        embeddings = []
        valid_texts = []
        for text in ocr_texts:
            if not text or not text.strip():
                continue
            embedding = vector_service.vector_db.embed_text(text)
            if embedding:
                embeddings.append(embedding)
                valid_texts.append(text)
        return embeddings, valid_texts

    def _calculate_cluster_params(self, text_count: int) -> int:
        """计算HDBSCAN聚类参数

        Returns:
            min_cluster_size
        """
        min_cluster_size = max(MIN_CLUSTER_SIZE, text_count // 10)
        max_cluster_size = max(MIN_CLUSTER_SIZE, text_count // 2)
        min_cluster_size = min(min_cluster_size, max_cluster_size)
        return max(MIN_CLUSTER_SIZE, min_cluster_size)

    def _select_representative_texts(
        self, cluster_labels: list[int], valid_texts: list[str]
    ) -> list[str]:
        """从聚类结果中选择代表性文本

        Returns:
            代表性文本列表
        """
        representative_texts = []
        unique_labels = set(cluster_labels)

        for label in unique_labels:
            indices = [
                idx for idx, cluster_label in enumerate(cluster_labels) if cluster_label == label
            ]
            if not indices:
                continue

            cluster_texts = [valid_texts[i] for i in indices]
            longest_text = max(cluster_texts, key=len)
            representative_texts.append(longest_text)

        return representative_texts

    def _cluster_ocr_texts_with_hdbscan(self, ocr_texts: list[str]) -> list[str]:
        """
        使用HDBSCAN对向量化的OCR文本进行聚类，返回代表性文本

        Args:
            ocr_texts: OCR文本列表

        Returns:
            聚类后的代表性文本列表
        """
        # 检查前置条件
        can_cluster, error_msg = self._check_clustering_prerequisites(ocr_texts)
        if not can_cluster:
            if error_msg and error_msg != "文本数量不足":
                logger.warning(error_msg)
            return ocr_texts

        try:
            vector_service = self._get_vector_service()
            # 向量化文本
            embeddings, valid_texts = self._vectorize_texts(ocr_texts, vector_service)

            if len(embeddings) < MIN_TEXT_COUNT_FOR_CLUSTERING:
                logger.debug("有效文本数量不足，无法进行聚类")
                return valid_texts

            # 转换为numpy数组
            embeddings_array = np.array(embeddings)

            # 计算聚类参数
            min_cluster_size = self._calculate_cluster_params(len(valid_texts))
            logger.info(
                f"使用HDBSCAN聚类: {len(valid_texts)} 个文本, min_cluster_size={min_cluster_size}"
            )

            # 使用HDBSCAN进行聚类
            clusterer = hdbscan.HDBSCAN(
                min_cluster_size=min_cluster_size,
                min_samples=1,
                metric="cosine",
            )
            cluster_labels = clusterer.fit_predict(embeddings_array)

            # 选择代表性文本
            representative_texts = self._select_representative_texts(cluster_labels, valid_texts)

            logger.info(
                f"HDBSCAN聚类完成: {len(valid_texts)} 个文本 -> "
                f"{len(set(cluster_labels))} 个聚类/噪声点 -> {len(representative_texts)} 个代表性文本"
            )

            return representative_texts

        except Exception as e:
            logger.error(f"HDBSCAN聚类失败: {e}", exc_info=True)
            return ocr_texts

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
        if len(title) > MAX_TITLE_LENGTH:
            title = title[:MAX_TITLE_LENGTH]

        # 生成简单摘要
        summary = f"在**{app_display}**中活动"
        if window_title and window_title != "未知窗口":
            summary = f"使用**{app_display}**: {window_title[:50]}"

        return {"title": title, "summary": summary}


# 全局实例
event_summary_service = EventSummaryService()


def generate_event_summary_async(event_id: int):
    """
    异步生成事件摘要（在单独线程中调用）

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
