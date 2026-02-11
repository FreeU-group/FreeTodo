#!/usr/bin/env python3
"""批量重新提取转录记录的待办。

查找转录记录，检查每条记录是否需要重新提取：
- 有 original_text 但 extracted_todos 为空或 "[]"
为需要提取的记录重新提取待办

支持命令行参数：
  --days N          只处理最近 N 天的记录
  --start-date DATE 指定开始日期 (YYYY-MM-DD)
  --end-date DATE   指定结束日期 (YYYY-MM-DD)
  --ids ID1,ID2,... 指定特定的 transcription_id 列表
"""

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

# 添加项目根目录到路径（必须在导入之前）
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# 延迟导入以避免 E402 错误
if True:
    from sqlmodel import select

    from lifetrace.llm.llm_client import LLMClient
    from lifetrace.services.audio_extraction_service import AudioExtractionService
    from lifetrace.storage import get_session
    from lifetrace.storage.models import Transcription
    from lifetrace.storage.sql_utils import col
    from lifetrace.util.logging_config import get_logger

logger = get_logger()


def is_empty_extraction(extracted: str | None) -> bool:
    """检查提取结果是否为空"""
    if not extracted:
        return True
    extracted = extracted.strip()
    if not extracted or extracted in {"[]", "null"}:
        return True
    try:
        parsed = json.loads(extracted)
        if isinstance(parsed, list) and len(parsed) == 0:
            return True
    except (json.JSONDecodeError, TypeError):
        pass
    return False


def needs_extraction(transcription: Transcription) -> bool:
    """检查转录记录是否需要提取"""
    return bool(
        transcription.original_text
        and transcription.original_text.strip()
        and is_empty_extraction(transcription.extracted_todos)
    )


async def re_extract_transcription(
    transcription: Transcription,
    extraction_service: AudioExtractionService,
) -> dict[str, Any]:
    """重新提取单个转录记录

    Returns:
        包含提取结果的字典
    """
    results = {
        "transcription_id": transcription.id,
        "recording_id": transcription.audio_recording_id,
        "original_extracted": False,
        "errors": [],
    }

    try:
        if transcription.id is None:
            raise ValueError("Transcription must have an id before updating.")
        logger.info(
            f"提取原文: transcription_id={transcription.id}, "
            f"recording_id={transcription.audio_recording_id}, "
            f"text_length={len(transcription.original_text or '')}"
        )
        result = await extraction_service.extract_todos(transcription.original_text or "")
        extraction_service.update_extraction(
            transcription_id=transcription.id,
            todos=result.get("todos", []),
        )
        results["original_extracted"] = True
        logger.info(
            f"✓ 原文提取完成: transcription_id={transcription.id}, "
            f"todos={len(result.get('todos', []))}"
        )
    except Exception as e:
        error_msg = f"原文提取失败: {e}"
        logger.error(f"✗ {error_msg}")
        results["errors"].append(error_msg)

    return results


def parse_date(date_str: str) -> datetime:
    """解析日期字符串 (YYYY-MM-DD)"""
    try:
        # 转换为 UTC 时间（假设输入是本地时间）
        return datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=UTC)
    except ValueError as e:
        raise argparse.ArgumentTypeError(f"无效的日期格式: {date_str} (应为 YYYY-MM-DD)") from e


def parse_ids(ids_str: str) -> list[int]:
    """解析 ID 列表字符串"""
    try:
        return [int(id_str.strip()) for id_str in ids_str.split(",") if id_str.strip()]
    except ValueError as e:
        raise argparse.ArgumentTypeError(f"无效的 ID 列表: {ids_str}") from e


def setup_argument_parser() -> argparse.ArgumentParser:
    """设置命令行参数解析器"""
    parser = argparse.ArgumentParser(
        description="批量重新提取转录记录的待办",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--days",
        type=int,
        help="只处理最近 N 天的记录",
    )
    parser.add_argument(
        "--start-date",
        type=parse_date,
        help="指定开始日期 (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--end-date",
        type=parse_date,
        help="指定结束日期 (YYYY-MM-DD)",
    )
    parser.add_argument(
        "--ids",
        type=parse_ids,
        help="指定特定的 transcription_id 列表，用逗号分隔，例如: --ids 1,2,3",
    )
    return parser


def calculate_date_range(args: argparse.Namespace) -> tuple[datetime | None, datetime | None]:
    """计算日期范围"""
    end_date = args.end_date
    start_date = args.start_date

    if args.days:
        if start_date or end_date:
            logger.warning("--days 参数与 --start-date/--end-date 同时指定，将使用 --days")
        end_date = datetime.now(UTC)
        start_date = end_date - timedelta(days=args.days)

    return start_date, end_date


def log_start_info(
    start_date: datetime | None, end_date: datetime | None, ids: list[int] | None
) -> None:
    """记录开始信息"""
    logger.info("=" * 60)
    logger.info("开始批量重新提取转录记录的待办")
    if start_date or end_date:
        logger.info(f"日期范围: {start_date or '无限制'} 至 {end_date or '无限制'}")
    if ids:
        logger.info(f"指定 ID 列表: {ids}")
    logger.info("=" * 60)


def find_transcriptions_needing_extraction(
    start_date: datetime | None,
    end_date: datetime | None,
    ids: list[int] | None,
) -> list[int]:
    """查找需要提取的转录记录"""
    needs_extraction_list = []
    with get_session() as session:
        statement = select(Transcription)

        # 应用日期过滤
        if start_date:
            statement = statement.where(Transcription.created_at >= start_date)
        if end_date:
            statement = statement.where(Transcription.created_at <= end_date)

        # 应用 ID 过滤
        if ids:
            statement = statement.where(col(Transcription.id).in_(ids))

        transcriptions = list(session.exec(statement).all())

        logger.info(f"找到 {len(transcriptions)} 条转录记录")

        # 在会话内检查需要提取的记录
        for transcription in transcriptions:
            # 在会话内访问所有属性，避免延迟加载问题
            if needs_extraction(transcription):
                # 保存 transcription_id 而不是对象本身，避免会话分离问题
                needs_extraction_list.append(transcription.id)

    return needs_extraction_list


async def process_extractions(
    needs_extraction_list: list[int],
    extraction_service: AudioExtractionService,
) -> dict[str, int]:
    """处理提取任务"""
    stats = {
        "total": len(needs_extraction_list),
        "original_extracted": 0,
        "errors": 0,
    }

    # 逐个提取
    for idx, transcription_id in enumerate(needs_extraction_list, 1):
        # 重新获取转录记录（在新的会话中）
        with get_session() as session:
            transcription = session.get(Transcription, transcription_id)
            if not transcription:
                logger.warning(f"转录记录不存在: transcription_id={transcription_id}")
                continue

            logger.info(
                f"\n[{idx}/{len(needs_extraction_list)}] "
                f"处理 transcription_id={transcription.id}, "
                f"recording_id={transcription.audio_recording_id}"
            )

            result = await re_extract_transcription(transcription, extraction_service)

            # 在会话内更新统计
            if result["original_extracted"]:
                stats["original_extracted"] += 1
            if result["errors"]:
                stats["errors"] += 1

    return stats


def log_final_stats(stats: dict[str, int]) -> None:
    """记录最终统计信息"""
    logger.info("\n" + "=" * 60)
    logger.info("提取完成统计:")
    logger.info(f"  总记录数: {stats['total']}")
    logger.info(f"  原文提取成功: {stats['original_extracted']}")
    logger.info(f"  错误数: {stats['errors']}")
    logger.info("=" * 60)


async def main():
    """主函数"""
    parser = setup_argument_parser()
    args = parser.parse_args()

    # 计算日期范围
    start_date, end_date = calculate_date_range(args)

    # 记录开始信息
    log_start_info(start_date, end_date, args.ids)

    # 初始化服务
    llm_client = LLMClient()
    extraction_service = AudioExtractionService(llm_client)

    # 检查 LLM 客户端是否可用
    if not llm_client.is_available():
        logger.error("LLM 客户端不可用，无法进行提取")
        return

    # 查找需要提取的转录记录
    needs_extraction_list = find_transcriptions_needing_extraction(start_date, end_date, args.ids)

    logger.info(f"需要重新提取的记录数: {len(needs_extraction_list)}")

    if len(needs_extraction_list) == 0:
        logger.info("所有记录都已提取完成，无需重新提取")
        return

    # 处理提取任务
    stats = await process_extractions(needs_extraction_list, extraction_service)

    # 输出统计信息
    log_final_stats(stats)


if __name__ == "__main__":
    asyncio.run(main())
