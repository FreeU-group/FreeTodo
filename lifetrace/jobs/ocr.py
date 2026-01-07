"""
LifeTrace 简化OCR处理器
参考 pad_ocr.py 设计，提供简单高效的OCR功能
"""

import os
import time

from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import get_database_path
from lifetrace.util.settings import settings

from .ocr_config import DEFAULT_PROCESSING_DELAY, create_rapidocr_instance, get_ocr_config
from .ocr_processor import (
    RAPIDOCR_AVAILABLE,
    SimpleOCRProcessor,
    extract_text_from_ocr_result,
    preprocess_image,
    save_to_database,
)

# 重新导出以保持向后兼容
__all__ = [
    "SimpleOCRProcessor",
    "RAPIDOCR_AVAILABLE",
    "execute_ocr_task",
    "ocr_service",
    "get_unprocessed_screenshots",
    "process_screenshot_ocr",
]

logger = get_logger()


def get_unprocessed_screenshots(logger_instance=None, limit=50):
    """从数据库获取未处理OCR的截图记录

    Args:
        logger_instance: 日志记录器，如果为None则使用模块级logger
        limit: 限制返回的记录数量，避免内存溢出
    """
    from lifetrace.storage import get_session
    from lifetrace.storage.models import OCRResult, Screenshot

    log = logger_instance if logger_instance is not None else logger

    try:
        with get_session() as session:
            unprocessed = (
                session.query(Screenshot)
                .filter(
                    ~session.query(OCRResult)
                    .filter(OCRResult.screenshot_id == Screenshot.id)
                    .exists()
                )
                .order_by(Screenshot.created_at.desc())
                .limit(limit)
                .all()
            )

            log.info(f"查询到 {len(unprocessed)} 条未处理的截图记录")

            return [
                {
                    "id": screenshot.id,
                    "file_path": screenshot.file_path,
                    "created_at": screenshot.created_at,
                }
                for screenshot in unprocessed
            ]
    except Exception as e:
        log.error(f"查询未处理截图失败: {e}")
        return []


def process_screenshot_ocr(screenshot_info, ocr_engine, vector_service):
    """处理单个截图的OCR"""
    screenshot_id = screenshot_info["id"]
    file_path = screenshot_info["file_path"]

    try:
        if not os.path.exists(file_path):
            return False

        logger.info(f"开始处理截图 ID {screenshot_id}: {os.path.basename(file_path)}")

        start_time = time.time()
        img_array = preprocess_image(file_path)
        result, _ = ocr_engine(img_array)
        elapsed_time = time.time() - start_time

        ocr_config = get_ocr_config()
        ocr_text = extract_text_from_ocr_result(result, ocr_config["confidence_threshold"])

        ocr_result = {
            "text_content": ocr_text,
            "confidence": ocr_config["default_confidence"],
            "language": ocr_config["language"],
            "processing_time": elapsed_time,
        }
        save_to_database(file_path, ocr_result, vector_service)

        logger.info(f"OCR处理完成 ID {screenshot_id}, 用时: {elapsed_time:.2f}秒")
        return True

    except Exception as e:
        logger.error(f"处理截图 {screenshot_id} 失败: {e}")
        return False


# 全局OCR引擎和向量服务（用于调度器模式）
_ocr_engine = None
_vector_service = None


def _ensure_ocr_initialized():  # noqa: C901
    """确保OCR引擎已初始化（用于调度器模式）"""
    global _ocr_engine, _vector_service

    if _ocr_engine is None:
        logger.info("正在初始化RapidOCR引擎...")
        try:
            _ocr_engine = create_rapidocr_instance()
            logger.info("RapidOCR引擎初始化成功")
        except Exception as e:
            logger.error(f"RapidOCR初始化失败: {e}")
            try:
                logger.info("尝试使用最小配置重新初始化 RapidOCR...")
                from rapidocr_onnxruntime import RapidOCR

                _ocr_engine = RapidOCR(
                    config_path=None,
                    det_use_cuda=False,
                    cls_use_cuda=False,
                    rec_use_cuda=False,
                    print_verbose=False,
                )
                logger.info("RapidOCR引擎使用最小配置初始化成功")
            except Exception as e2:
                logger.error(f"RapidOCR使用最小配置也初始化失败: {e2}")
                raise

    if _vector_service is None:
        try:
            from lifetrace.core.lazy_services import get_vector_service as lazy_get_vector_service

            logger.info("正在通过 lazy_services 初始化向量数据库服务...")
            _vector_service = lazy_get_vector_service()
            if _vector_service and _vector_service.is_enabled():
                logger.info("向量数据库服务已启用")
            else:
                logger.info("向量数据库服务未启用或不可用")
        except Exception as e:
            logger.error(f"初始化向量数据库服务失败: {e}")
            _vector_service = None

    return _ocr_engine, _vector_service


def execute_ocr_task():
    """执行一次OCR处理任务（用于调度器调用）

    Returns:
        处理成功的截图数量
    """
    try:
        ocr, vector_service = _ensure_ocr_initialized()
        unprocessed_screenshots = get_unprocessed_screenshots(logger)

        if not unprocessed_screenshots:
            logger.debug("没有待处理的截图")
            return 0

        logger.info(f"发现 {len(unprocessed_screenshots)} 个未处理的截图")

        processed_count = 0
        for screenshot_info in unprocessed_screenshots:
            success = process_screenshot_ocr(screenshot_info, ocr, vector_service)
            if success:
                processed_count += 1
                time.sleep(DEFAULT_PROCESSING_DELAY)

        logger.info(f"OCR任务完成，成功处理 {processed_count} 张截图")
        return processed_count

    except Exception as e:
        logger.error(f"执行OCR任务失败: {e}")
        return 0


def ocr_service():
    """主函数 - 基于数据库驱动的OCR处理（传统模式，独立运行）"""
    logger.info("LifeTrace 简化OCR处理器启动...")

    _ensure_database_initialized()

    check_interval = settings.get("jobs.ocr.interval")
    ocr, vector_service = _initialize_ocr_and_vector_service()

    logger.info(f"数据库检查间隔: {check_interval}秒")
    logger.info("开始基于数据库的OCR处理...")
    logger.info("按 Ctrl+C 停止服务")
    logger.info(f"OCR服务启动完成，检查间隔: {check_interval}秒")

    try:
        _run_ocr_loop(check_interval, ocr, vector_service)
    except KeyboardInterrupt:
        logger.error("收到停止信号，结束OCR处理")
    except Exception as e:
        logger.error(f"OCR处理过程中发生错误: {e}")
        raise Exception(e) from e
    finally:
        logger.error("OCR服务已停止")


def _ensure_database_initialized() -> None:
    """确保数据库已初始化，否则抛出异常。"""
    if not get_database_path().exists():
        raise Exception("数据库未初始化，无法启动OCR服务")


def _initialize_ocr_and_vector_service():
    """初始化 RapidOCR 引擎和向量数据库服务。"""

    try:
        logger.info("正在初始化RapidOCR引擎...")
        ocr = create_rapidocr_instance()
        logger.info("RapidOCR引擎初始化成功")
    except Exception as e:
        logger.error(f"RapidOCR初始化失败: {e}")
        raise Exception(e) from e

    try:
        from lifetrace.core.lazy_services import get_vector_service as lazy_get_vector_service

        logger.info("正在通过 lazy_services 初始化向量数据库服务...")
        vector_service = lazy_get_vector_service()
        if vector_service and vector_service.is_enabled():
            logger.info("向量数据库服务已启用")
        else:
            logger.info("向量数据库服务未启用或不可用")
    except Exception as e:
        logger.error(f"初始化向量数据库服务失败: {e}")
        vector_service = None

    return ocr, vector_service


def _run_ocr_loop(check_interval: float, ocr, vector_service) -> None:
    """主循环：持续从数据库读取未处理截图并执行 OCR。"""
    processed_count = 0  # noqa: F841

    while True:
        start_time = time.time()  # noqa: F841

        unprocessed_screenshots = get_unprocessed_screenshots(logger)

        if unprocessed_screenshots:
            logger.info(f"发现 {len(unprocessed_screenshots)} 个未处理的截图")

            for screenshot_info in unprocessed_screenshots:
                success = process_screenshot_ocr(screenshot_info, ocr, vector_service)
                if success:
                    processed_count += 1
                    time.sleep(DEFAULT_PROCESSING_DELAY)
        else:
            time.sleep(check_interval)


if __name__ == "__main__":
    ocr_service()
    logger.info("OCR服务已启动")
