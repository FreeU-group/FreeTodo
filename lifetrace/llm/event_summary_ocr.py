"""
事件摘要OCR文本处理模块
包含OCR文本提取、过滤和UI候选分离逻辑
"""

import re
from typing import Any

from lifetrace.storage import get_session
from lifetrace.storage.models import OCRResult, Screenshot
from lifetrace.util.logging_config import get_logger

from .event_summary_config import (
    MIN_OCR_CONFIDENCE,
    MIN_OCR_LINE_LENGTH,
    UI_CANDIDATE_MAX_LENGTH,
    UI_REPEAT_THRESHOLD,
    UI_REPRESENTATIVE_LIMIT,
)

logger = get_logger()


def should_filter_line(line: str, debug_info: dict[str, Any]) -> bool:
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


def process_ocr_block(
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
        if should_filter_line(line, debug_info):
            continue

        ocr_lines.append(line)
        lines_with_meta.append({"text": line, "screenshot_id": screenshot_id})


def get_event_ocr_texts(event_id: int) -> tuple[list[str], dict[str, Any]]:
    """获取事件下所有截图的OCR文本行

    将OCR文本按换行符分割成行（同一水平分组的bounding boxes合并后的文本），
    然后对每行进行聚类。

    Args:
        event_id: 事件ID

    Returns:
        (文本行列表, 调试信息字典)
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
            screenshots = session.query(Screenshot).filter(Screenshot.event_id == event_id).all()

            for screenshot in screenshots:
                ocr_results = (
                    session.query(OCRResult).filter(OCRResult.screenshot_id == screenshot.id).all()
                )

                for ocr in ocr_results:
                    if not ocr.text_content or not ocr.text_content.strip():
                        continue

                    ocr_block = ocr.text_content.strip()
                    original_ocr_blocks.append(ocr_block)

                    if ocr.confidence is not None and ocr.confidence < MIN_OCR_CONFIDENCE:
                        debug_info["filtered_low_confidence_blocks"] += 1
                        continue

                    process_ocr_block(
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


def build_text_to_screenshots_map(lines_with_meta: list[dict[str, Any]]) -> dict[str, set[int]]:
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


def identify_ui_candidates(text_to_screenshots: dict[str, set[int]]) -> set[str]:
    """识别UI候选文本"""
    return {
        text
        for text, screenshots in text_to_screenshots.items()
        if len(screenshots) >= UI_REPEAT_THRESHOLD and len(text) <= UI_CANDIDATE_MAX_LENGTH
    }


def separate_ui_and_body_lines(
    lines_with_meta: list[dict[str, Any]], ui_candidates: set[str]
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


def select_representative_ui_texts(ui_lines: list[str]) -> list[str]:
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


def separate_ui_candidates(
    lines_with_meta: list[dict[str, Any]],
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

    text_to_screenshots = build_text_to_screenshots_map(lines_with_meta)
    ui_candidates = identify_ui_candidates(text_to_screenshots)
    ui_lines, body_lines = separate_ui_and_body_lines(lines_with_meta, ui_candidates)
    ui_kept = select_representative_ui_texts(ui_lines)

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
