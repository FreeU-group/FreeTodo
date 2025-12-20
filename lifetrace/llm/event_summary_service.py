"""
事件摘要生成服务
使用LLM为事件生成标题和摘要
"""

import json
import re
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
MIN_OCR_LINE_LENGTH = 3  # OCR文本行的最小长度阈值（用于过滤噪声行）
MIN_OCR_CONFIDENCE = 0.6  # OCR结果最低置信度，低于此阈值的块跳过
UI_REPEAT_THRESHOLD = 3  # 将文本标记为UI候选的跨截图重复次数阈值
UI_CANDIDATE_MAX_LENGTH = 25  # UI候选的最大长度（字符）
UI_REPRESENTATIVE_LIMIT = 2  # 保留的代表性UI文本数量上限
MAX_TITLE_LENGTH = 20  # 标题最大长度（字符数）
MAX_SUMMARY_LENGTH = 50  # 摘要最大长度（字符数，对应提示词要求）
OCR_PREVIEW_LENGTH = 100  # OCR预览文本长度
RESPONSE_PREVIEW_LENGTH = 500  # 响应预览文本长度

# 尝试导入HDBSCAN
try:
    import hdbscan
    import numpy as np
    from scipy.spatial.distance import pdist, squareform

    HDBSCAN_AVAILABLE = True
    SCIPY_AVAILABLE = True
except ImportError:
    HDBSCAN_AVAILABLE = False
    SCIPY_AVAILABLE = False
    pdist = None
    squareform = None
    logger.warning("HDBSCAN or scipy not available, clustering will fallback to simple aggregation")


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
        """处理截图数量较少的事件

        Returns:
            包含result和调试信息的字典
        """
        logger.info(f"事件 {event_id} 只有 {screenshot_count} 张截图，使用fallback summary")
        ocr_lines, ocr_debug_info = self._get_event_ocr_texts(event_id)
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
        """处理有足够截图的事件

        Returns:
            包含result和调试信息的字典
        """
        ocr_lines, ocr_debug_info = self._get_event_ocr_texts(event_id)
        body_lines, ui_info = self._separate_ui_candidates(
            ocr_debug_info.get("lines_with_meta", [])
        )
        ocr_debug_info["ui_info"] = ui_info
        effective_lines = body_lines if body_lines else ocr_lines
        combined_ocr_length = len("".join(effective_lines).strip()) if effective_lines else 0

        clustering_info = None
        llm_info = None

        if effective_lines and combined_ocr_length > MIN_OCR_TEXT_LENGTH:
            clustered_texts = self._cluster_ocr_texts_with_hdbscan(effective_lines)
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
        """更新数据库中的事件摘要

        Returns:
            更新是否成功
        """
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
        """
        为单个事件生成摘要

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

    def _should_filter_line(self, line: str, debug_info: dict[str, Any]) -> bool:
        """判断是否应该过滤掉某行文本

        Returns:
            True表示应该过滤，False表示保留
        """
        if not line:
            return True

        debug_info["raw_lines_count"] += 1

        if len(line) < MIN_OCR_LINE_LENGTH:
            debug_info["filtered_short_count"] += 1
            return True

        if line.isdigit() or re.fullmatch(r"[^\w\s]+", line):
            debug_info["filtered_symbol_or_digit_count"] += 1
            return True

        return False

    def _process_ocr_block(
        self,
        ocr_block: str,
        screenshot_id: int,
        ocr_lines: list[str],
        lines_with_meta: list[dict[str, Any]],
        debug_info: dict[str, Any],
    ) -> None:
        """处理单个OCR块，提取并过滤文本行"""
        lines = ocr_block.split("\n")
        for line in lines:
            line = line.strip()
            if self._should_filter_line(line, debug_info):
                continue

            ocr_lines.append(line)
            lines_with_meta.append({"text": line, "screenshot_id": screenshot_id})

    def _get_event_ocr_texts(self, event_id: int) -> tuple[list[str], dict[str, Any]]:
        """获取事件下所有截图的OCR文本行

        将OCR文本按换行符分割成行（同一水平分组的bounding boxes合并后的文本），
        然后对每行进行聚类。

        Args:
            event_id: 事件ID

        Returns:
            (文本行列表, 调试信息字典)
            调试信息包含：
            - original_ocr_blocks: 原始OCR块列表
            - original_ocr_blocks_count: 原始OCR块数量
            - ocr_lines_count: 文本行数量
            - lines_per_block_avg: 平均每个块的行数
            - raw_lines_count: 分割后的总行数（过滤前）
            - filtered_short_count: 过滤掉的过短行数
            - filtered_symbol_or_digit_count: 过滤掉的纯符号/纯数字行数
            - filtered_low_confidence_blocks: 因低置信度跳过的OCR块数量
            - lines_with_meta: 行级元数据（文本 + screenshot_id）
        """
        ocr_lines = []
        original_ocr_blocks = []
        lines_with_meta: list[dict[str, Any]] = []
        debug_info = {
            "original_ocr_blocks": [],
            "original_ocr_blocks_count": 0,
            "ocr_lines_count": 0,
            "lines_per_block_avg": 0.0,
            "raw_lines_count": 0,
            "filtered_short_count": 0,
            "filtered_symbol_or_digit_count": 0,
            "filtered_low_confidence_blocks": 0,
            "lines_with_meta": [],
        }

        try:
            with get_session() as session:
                screenshots = (
                    session.query(Screenshot).filter(Screenshot.event_id == event_id).all()
                )

                for screenshot in screenshots:
                    ocr_results = (
                        session.query(OCRResult)
                        .filter(OCRResult.screenshot_id == screenshot.id)
                        .all()
                    )

                    for ocr in ocr_results:
                        if not ocr.text_content or not ocr.text_content.strip():
                            continue

                        ocr_block = ocr.text_content.strip()
                        original_ocr_blocks.append(ocr_block)

                        if ocr.confidence is not None and ocr.confidence < MIN_OCR_CONFIDENCE:
                            debug_info["filtered_low_confidence_blocks"] += 1
                            continue

                        self._process_ocr_block(
                            ocr_block, screenshot.id, ocr_lines, lines_with_meta, debug_info
                        )

            debug_info["original_ocr_blocks"] = original_ocr_blocks
            debug_info["original_ocr_blocks_count"] = len(original_ocr_blocks)
            debug_info["ocr_lines_count"] = len(ocr_lines)
            debug_info["lines_with_meta"] = lines_with_meta
            if len(original_ocr_blocks) > 0:
                debug_info["lines_per_block_avg"] = len(ocr_lines) / len(original_ocr_blocks)

            return ocr_lines, debug_info

        except Exception as e:
            logger.error(f"获取事件OCR文本失败: {e}")
            return [], debug_info

    def _build_text_to_screenshots_map(
        self, lines_with_meta: list[dict[str, Any]]
    ) -> dict[str, set[int]]:
        """构建文本到截图ID集合的映射"""
        text_to_screenshots: dict[str, set[int]] = {}
        for item in lines_with_meta:
            text = item.get("text")
            screenshot_id = item.get("screenshot_id")
            if not text:
                continue
            if text not in text_to_screenshots:
                text_to_screenshots[text] = set()
            screenshot_id = screenshot_id if screenshot_id is not None else -1
            text_to_screenshots[text].add(screenshot_id)
        return text_to_screenshots

    def _identify_ui_candidates(self, text_to_screenshots: dict[str, set[int]]) -> set[str]:
        """识别UI候选文本"""
        return {
            text
            for text, screenshots in text_to_screenshots.items()
            if len(screenshots) >= UI_REPEAT_THRESHOLD and len(text) <= UI_CANDIDATE_MAX_LENGTH
        }

    def _separate_ui_and_body_lines(
        self, lines_with_meta: list[dict[str, Any]], ui_candidates: set[str]
    ) -> tuple[list[str], list[str]]:
        """将行分为UI行和正文行"""
        ui_lines: list[str] = []
        body_lines: list[str] = []
        for item in lines_with_meta:
            text = item.get("text")
            if not text:
                continue
            if text in ui_candidates:
                ui_lines.append(text)
            else:
                body_lines.append(text)
        return ui_lines, body_lines

    def _select_representative_ui_texts(self, ui_lines: list[str]) -> list[str]:
        """选择代表性UI文本（去重）"""
        seen_ui: set[str] = set()
        ui_kept: list[str] = []
        for line in ui_lines:
            if line in seen_ui:
                continue
            ui_kept.append(line)
            seen_ui.add(line)
            if len(ui_kept) >= UI_REPRESENTATIVE_LIMIT:
                break
        return ui_kept

    def _separate_ui_candidates(
        self, lines_with_meta: list[dict[str, Any]]
    ) -> tuple[list[str], dict[str, Any]]:
        """识别跨截图重复的UI候选文本，并返回正文行

        Args:
            lines_with_meta: 包含文本及其来源截图ID的行级元数据

        Returns:
            (正文行列表, ui调试信息)
        """
        ui_info = {
            "ui_candidates": [],
            "ui_candidates_count": 0,
            "ui_lines_total": 0,
            "ui_kept": [],
            "body_lines_count": 0,
            "repeat_threshold": UI_REPEAT_THRESHOLD,
            "length_cutoff": UI_CANDIDATE_MAX_LENGTH,
        }

        if not lines_with_meta:
            return [], ui_info

        text_to_screenshots = self._build_text_to_screenshots_map(lines_with_meta)
        ui_candidates = self._identify_ui_candidates(text_to_screenshots)
        ui_lines, body_lines = self._separate_ui_and_body_lines(lines_with_meta, ui_candidates)
        ui_kept = self._select_representative_ui_texts(ui_lines)

        ui_info.update(
            {
                "ui_candidates": list(ui_candidates),
                "ui_candidates_count": len(ui_candidates),
                "ui_lines_total": len(ui_lines),
                "ui_kept": ui_kept,
                "body_lines_count": len(body_lines),
            }
        )

        return body_lines, ui_info

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
        """
        使用LLM生成标题和摘要
        """
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

        适应行级别的文本数量（通常远大于截图数量），使用更保守的参数。

        Args:
            text_count: 文本数量（对于行级别聚类，通常是文本行数量）

        Returns:
            min_cluster_size
        """
        # 对于行级别的聚类，文本数量通常很大，使用更小的比例
        # 但保持最小聚类大小不变，确保聚类有意义
        min_cluster_size = max(MIN_CLUSTER_SIZE, text_count // 20)  # 从 //10 改为 //20，适应更多行
        max_cluster_size = max(MIN_CLUSTER_SIZE, text_count // 3)  # 从 //2 改为 //3，适应更多行
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
        """
        can_cluster, error_msg = self._check_clustering_prerequisites(ocr_texts)
        if not can_cluster:
            if error_msg and error_msg != "文本数量不足":
                logger.warning(error_msg)
            return ocr_texts

        try:
            vector_service = self._get_vector_service()
            embeddings, valid_texts = self._vectorize_texts(ocr_texts, vector_service)

            if len(embeddings) < MIN_TEXT_COUNT_FOR_CLUSTERING:
                logger.debug("有效文本数量不足，无法进行聚类")
                return valid_texts

            embeddings_array = np.array(embeddings)
            min_cluster_size = self._calculate_cluster_params(len(valid_texts))
            logger.info(
                f"使用HDBSCAN聚类: {len(valid_texts)} 个文本, min_cluster_size={min_cluster_size}"
            )

            if SCIPY_AVAILABLE and pdist is not None and squareform is not None:
                cosine_distances = pdist(embeddings_array, metric="cosine")
                distance_matrix = squareform(cosine_distances)
                clusterer = hdbscan.HDBSCAN(
                    min_cluster_size=min_cluster_size,
                    min_samples=1,
                    metric="precomputed",
                )
                cluster_labels = clusterer.fit_predict(distance_matrix)
            else:
                logger.warning("scipy不可用，使用欧氏距离替代余弦距离")
                clusterer = hdbscan.HDBSCAN(
                    min_cluster_size=min_cluster_size,
                    min_samples=1,
                    metric="euclidean",
                )
                cluster_labels = clusterer.fit_predict(embeddings_array)

            representative_texts = self._select_representative_texts(cluster_labels, valid_texts)
            return representative_texts or valid_texts

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
