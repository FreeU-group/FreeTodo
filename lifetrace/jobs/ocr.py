"""
LifeTrace 简化OCR处理器
参考 pad_ocr.py 设计，提供简单高效的OCR功能
"""

import hashlib
import os
import sys
import time

import yaml

from lifetrace.llm.vector_service import create_vector_service
from lifetrace.storage import get_session, ocr_mgr, screenshot_mgr
from lifetrace.storage.models import OCRResult, Screenshot
from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import (
    get_app_root,
    get_config_dir,
    get_database_path,
    get_models_dir,
)
from lifetrace.util.settings import settings

logger = get_logger()

# OCR配置常量
DEFAULT_IMAGE_MAX_SIZE = (1920, 1080)
DEFAULT_CONFIDENCE = 0.8
DEFAULT_PROCESSING_DELAY = 0.1
MIN_CONFIDENCE_THRESHOLD = 0.5


def _get_application_path() -> str:
    """获取应用程序路径，兼容PyInstaller打包"""
    return str(get_app_root())


def _get_rapidocr_config_path() -> str:
    """获取RapidOCR配置文件路径"""
    return str(get_config_dir() / "rapidocr_config.yaml")


def _setup_rapidocr_config():
    """设置RapidOCR配置文件路径"""
    # 设置环境变量，指向我们的外部配置文件
    config_path = _get_rapidocr_config_path()
    if os.path.exists(config_path):
        os.environ["RAPIDOCR_CONFIG_PATH"] = config_path
        logger.info(f"设置RapidOCR配置路径: {config_path}")
    else:
        logger.warning(f"配置文件不存在: {config_path}")


# 设置RapidOCR配置
_setup_rapidocr_config()

try:
    import numpy as np
    from PIL import Image
    from rapidocr_onnxruntime import RapidOCR

    RAPIDOCR_AVAILABLE = True
except ImportError:
    RAPIDOCR_AVAILABLE = False
    logger.error("RapidOCR 未安装！请运行: pip install rapidocr-onnxruntime")
    sys.exit(1)


def _create_rapidocr_instance() -> RapidOCR:  # noqa: C901, PLR0912
    """创建并初始化RapidOCR实例

    Returns:
        RapidOCR实例
    """
    config_path = _get_rapidocr_config_path()

    # 在 PyInstaller 打包环境中，RapidOCR 可能会尝试查找自己的 config.yaml
    # 我们需要清除环境变量，防止它查找错误的路径
    if getattr(sys, "frozen", False):
        # 清除可能干扰的环境变量
        if "RAPIDOCR_CONFIG_PATH" in os.environ:
            del os.environ["RAPIDOCR_CONFIG_PATH"]

    # 检查配置文件是否存在
    if not os.path.exists(config_path):
        logger.warning(f"配置文件不存在: {config_path}，使用默认配置")
        # 使用默认配置，不传递 config_path
        try:
            return RapidOCR(
                config_path=None,
                det_use_cuda=False,
                cls_use_cuda=False,
                rec_use_cuda=False,
                print_verbose=False,
            )
        except Exception as e:
            # 如果初始化失败，可能是 RapidOCR 内部查找配置文件失败
            # 再次清除环境变量并重试
            logger.warning(f"RapidOCR 初始化时遇到问题: {e}，尝试使用环境变量修复")
            if "RAPIDOCR_CONFIG_PATH" in os.environ:
                del os.environ["RAPIDOCR_CONFIG_PATH"]
            # 再次尝试初始化
            return RapidOCR(
                config_path=None,
                det_use_cuda=False,
                cls_use_cuda=False,
                rec_use_cuda=False,
                print_verbose=False,
            )

    logger.info(f"使用RapidOCR配置文件: {config_path}")

    try:
        with open(config_path, encoding="utf-8") as f:
            config_data = yaml.safe_load(f)

        # 检查是否有外部模型路径配置
        if "Models" not in config_data:
            logger.info("未找到外部模型配置，使用默认方式")
            # 在 PyInstaller 环境中，确保清除环境变量
            if getattr(sys, "frozen", False) and "RAPIDOCR_CONFIG_PATH" in os.environ:
                del os.environ["RAPIDOCR_CONFIG_PATH"]
            return RapidOCR(
                config_path=None,
                det_use_cuda=False,
                cls_use_cuda=False,
                rec_use_cuda=False,
                print_verbose=False,
            )

        models_config = config_data["Models"]
        models_dir = get_models_dir()
        # 模型路径配置应该是相对于 models 目录的文件名
        # 例如：'ch_PP-OCRv4_det_infer.onnx' 而不是 'lifetrace/models/ch_PP-OCRv4_det_infer.onnx'
        det_model_path = str(models_dir / models_config.get("det_model_path", "").lstrip("/"))
        rec_model_path = str(models_dir / models_config.get("rec_model_path", "").lstrip("/"))
        cls_model_path = str(models_dir / models_config.get("cls_model_path", "").lstrip("/"))

        # 验证外部模型文件是否存在
        if (
            os.path.exists(det_model_path)
            and os.path.exists(rec_model_path)
            and os.path.exists(cls_model_path)
        ):
            logger.info("使用外部模型文件:")
            logger.info(f"  检测模型: {det_model_path}")
            logger.info(f"  识别模型: {rec_model_path}")
            logger.info(f"  分类模型: {cls_model_path}")

            # 在 PyInstaller 环境中，确保清除环境变量，防止 RapidOCR 查找内部配置文件
            if getattr(sys, "frozen", False) and "RAPIDOCR_CONFIG_PATH" in os.environ:
                del os.environ["RAPIDOCR_CONFIG_PATH"]

            return RapidOCR(
                det_model_path=det_model_path,
                rec_model_path=rec_model_path,
                cls_model_path=cls_model_path,
                det_use_cuda=False,
                cls_use_cuda=False,
                rec_use_cuda=False,
                print_verbose=False,
            )
        else:
            logger.warning("外部模型文件不存在，使用默认配置")
            # 在 PyInstaller 环境中，确保清除环境变量
            if getattr(sys, "frozen", False) and "RAPIDOCR_CONFIG_PATH" in os.environ:
                del os.environ["RAPIDOCR_CONFIG_PATH"]
            return RapidOCR(
                config_path=None,
                det_use_cuda=False,
                cls_use_cuda=False,
                rec_use_cuda=False,
                print_verbose=False,
            )

    except Exception as e:
        logger.error(f"读取配置文件失败: {e}，使用默认配置")
        # 在 PyInstaller 环境中，确保清除环境变量
        if getattr(sys, "frozen", False) and "RAPIDOCR_CONFIG_PATH" in os.environ:
            del os.environ["RAPIDOCR_CONFIG_PATH"]
        return RapidOCR(
            config_path=None,
            det_use_cuda=False,
            cls_use_cuda=False,
            rec_use_cuda=False,
            print_verbose=False,
        )


def _preprocess_image(image_path: str) -> np.ndarray:
    """预处理图像，转换为RGB并缩放到合适大小

    Args:
        image_path: 图像文件路径

    Returns:
        预处理后的图像数组
    """
    with Image.open(image_path) as img:
        img = img.convert("RGB")
        img.thumbnail(DEFAULT_IMAGE_MAX_SIZE, Image.Resampling.LANCZOS)
        return np.array(img)


def _extract_text_from_ocr_result(result, confidence_threshold: float = None) -> str:
    """从OCR结果中提取文本内容

    Args:
        result: OCR识别结果
        confidence_threshold: 置信度阈值，如果为None则从配置读取

    Returns:
        提取的文本内容
    """
    if confidence_threshold is None:
        confidence_threshold = settings.get("jobs.ocr.params.confidence_threshold")

    # OCR结果通常是 [坐标, 文本, 置信度] 的三元组
    MIN_OCR_RESULT_FIELDS = 3

    ocr_text = ""
    if result:
        for item in result:
            if len(item) >= MIN_OCR_RESULT_FIELDS:
                text = item[1]
                confidence = float(item[2])
                if text and text.strip() and confidence > confidence_threshold:
                    ocr_text += text.strip() + "\n"

    return ocr_text


def _get_ocr_config() -> dict:
    """从配置中获取OCR相关参数

    Returns:
        包含OCR配置的字典
    """
    # 直接从settings获取，不使用默认值
    languages = settings.get("jobs.ocr.params.language")
    confidence_threshold = settings.get("jobs.ocr.params.confidence_threshold")

    # 如果language是列表，取第一个；如果是字符串，直接使用
    language = languages[0] if isinstance(languages, list) and languages else "ch"
    if isinstance(languages, str):
        language = languages

    return {
        "confidence_threshold": confidence_threshold,
        "language": language,
        "default_confidence": DEFAULT_CONFIDENCE,
    }


class SimpleOCRProcessor:
    """简化的OCR处理器类"""

    def __init__(self):
        self.ocr = None
        self.vector_service = None
        self.is_running = False

    def is_available(self):
        """检查OCR引擎是否可用"""
        return RAPIDOCR_AVAILABLE

    def start(self):
        """启动OCR处理服务"""
        self.is_running = True
        # 注意：这里不应该调用main()，因为main()会启动独立的服务进程
        # 如果需要在server中使用OCR功能，应该直接调用process_image方法

    def stop(self):
        """停止OCR处理服务"""
        self.is_running = False

    def get_statistics(self):
        """获取OCR处理统计信息"""
        try:
            with get_session() as session:
                total_screenshots = session.query(Screenshot).count()
                ocr_results = session.query(OCRResult).count()
                unprocessed = total_screenshots - ocr_results

                return {
                    "status": "running" if self.is_running else "stopped",
                    "total_screenshots": total_screenshots,
                    "processed": ocr_results,
                    "unprocessed": unprocessed,
                    "interval": settings.get("jobs.ocr.interval"),
                }
        except Exception as e:
            logger.error(f"获取OCR统计信息失败: {e}")
            return {"status": "error", "error": str(e)}

    def _ensure_ocr_initialized(self):
        """确保OCR引擎已初始化"""
        if self.ocr is None:
            self.ocr = _create_rapidocr_instance()

    def process_image(self, image_path):
        """处理单个图像文件"""
        try:
            # 初始化OCR引擎（如果还没有初始化）
            self._ensure_ocr_initialized()

            # 记录开始时间
            start_time = time.time()

            # 图像预处理
            img_array = _preprocess_image(image_path)

            # 执行OCR
            result, _ = self.ocr(img_array)

            # 计算处理时间
            processing_time = time.time() - start_time

            # 提取文本内容
            ocr_config = _get_ocr_config()
            ocr_text = _extract_text_from_ocr_result(result, ocr_config["confidence_threshold"])

            # 保存到数据库
            ocr_result = {
                "text_content": ocr_text,
                "confidence": ocr_config["default_confidence"],
                "language": ocr_config["language"],
                "processing_time": processing_time,
            }

            save_to_database(image_path, ocr_result, self.vector_service)

            return {
                "success": True,
                "text_content": ocr_text,
                "processing_time": processing_time,
            }

        except Exception as e:
            logger.error(f"处理图像失败: {e}")
            return {"success": False, "error": str(e)}


def save_to_database(image_path: str, ocr_result: dict, vector_service=None):
    """保存OCR结果到数据库"""
    try:
        # 查找对应的截图记录
        screenshot = screenshot_mgr.get_screenshot_by_path(image_path)
        if not screenshot:
            # 如果没有找到截图记录，为外部文件创建一个记录
            logger.info(f"为外部截图文件创建数据库记录: {image_path}")
            screenshot_id = create_screenshot_record(image_path)
            if not screenshot_id:
                logger.warning(f"无法为外部文件创建截图记录: {image_path}")
                return
        else:
            screenshot_id = screenshot["id"]

        # 添加OCR结果到SQLite数据库
        ocr_result_id = ocr_mgr.add_ocr_result(
            screenshot_id=screenshot_id,
            text_content=ocr_result["text_content"],
            confidence=ocr_result["confidence"],
            language=ocr_result.get("language", "ch"),
            processing_time=ocr_result["processing_time"],
        )

        # 更新截图状态
        screenshot_mgr.update_screenshot_processed(screenshot_id)

        # 添加到向量数据库
        if vector_service and vector_service.is_enabled() and ocr_result_id:
            try:
                # 获取完整的OCR结果对象
                with get_session() as session:
                    ocr_obj = session.query(OCRResult).filter(OCRResult.id == ocr_result_id).first()
                    screenshot_obj = (
                        session.query(Screenshot).filter(Screenshot.id == screenshot_id).first()
                    )

                    if ocr_obj:
                        success = vector_service.add_ocr_result(ocr_obj, screenshot_obj)
                        if success:
                            logger.debug(f"OCR结果已添加到向量数据库: {ocr_result_id}")
                        else:
                            logger.warning(f"向量数据库添加失败: {ocr_result_id}")
                    # 同步事件文档（事件级）
                    if screenshot_obj and getattr(screenshot_obj, "event_id", None):
                        try:
                            vector_service.upsert_event_document(screenshot_obj.event_id)
                        except Exception:
                            pass
            except Exception as ve:
                logger.error(f"向量数据库操作失败: {ve}")

    except Exception as e:
        logger.error(f"保存OCR结果到数据库失败: {e}")


def create_screenshot_record(image_path: str):
    """为外部截图文件创建数据库记录"""
    try:
        # 检查文件是否存在
        if not os.path.exists(image_path):
            return None

        # 计算文件哈希
        with open(image_path, "rb") as f:
            file_hash = hashlib.md5(f.read()).hexdigest()

        # 获取图像尺寸
        try:
            with Image.open(image_path) as img:
                width, height = img.size
        except Exception:
            width, height = 0, 0

        # 从文件名推断应用信息
        filename = os.path.basename(image_path)
        app_name = "外部工具"
        window_title = filename

        # 如果是Snipaste文件，标记为Snipaste
        if filename.startswith("Snipaste_"):
            app_name = "Snipaste"
            window_title = f"Snipaste截图 - {filename}"

        # 添加截图记录
        screenshot_id = screenshot_mgr.add_screenshot(
            file_path=image_path,
            file_hash=file_hash,
            width=width,
            height=height,
            metadata={
                "screen_id": 0,  # 外部文件默认屏幕ID为0
                "app_name": app_name,
                "window_title": window_title,
            },
        )

        return screenshot_id

    except Exception as e:
        logger.error(f"创建外部截图记录失败: {e}")
        return None


# 日志配置已移至统一的logging_config.py中


def get_unprocessed_screenshots(logger_instance=None, limit=50):
    """从数据库获取未处理OCR的截图记录

    Args:
        logger_instance: 日志记录器，如果为None则使用模块级logger
        limit: 限制返回的记录数量，避免内存溢出
    """
    # 如果没有传入logger，使用模块级logger
    log = logger_instance if logger_instance is not None else logger

    try:
        with get_session() as session:
            # 优化查询：使用NOT EXISTS子查询替代LEFT JOIN
            # 这种方式在大数据量时性能更好
            # 按创建时间降序排列，优先处理最新的截图
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
        # 检查文件是否存在
        if not os.path.exists(file_path):
            # log.warning(f"截图文件不存在，跳过处理: {file_path}")
            return False

        logger.info(f"开始处理截图 ID {screenshot_id}: {os.path.basename(file_path)}")

        # 记录开始时间
        start_time = time.time()

        # 图像预处理
        img_array = _preprocess_image(file_path)

        # 使用RapidOCR进行识别
        result, _ = ocr_engine(img_array)

        # 计算推理时间
        elapsed_time = time.time() - start_time

        # 提取OCR识别结果
        ocr_config = _get_ocr_config()
        ocr_text = _extract_text_from_ocr_result(result, ocr_config["confidence_threshold"])

        # 保存到数据库
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
            # 在 PyInstaller 环境中，RapidOCR 可能会尝试查找它自己的配置文件
            # 我们需要确保它使用默认配置
            if getattr(sys, "frozen", False):
                # 清除可能干扰的环境变量
                if "RAPIDOCR_CONFIG_PATH" in os.environ:
                    del os.environ["RAPIDOCR_CONFIG_PATH"]
            _ocr_engine = _create_rapidocr_instance()
            logger.info("RapidOCR引擎初始化成功")
        except Exception as e:
            logger.error(f"RapidOCR初始化失败: {e}")
            # 如果初始化失败，尝试使用更简单的配置
            try:
                logger.info("尝试使用最小配置重新初始化 RapidOCR...")
                # 确保清除环境变量，防止 RapidOCR 查找内部配置文件
                if "RAPIDOCR_CONFIG_PATH" in os.environ:
                    del os.environ["RAPIDOCR_CONFIG_PATH"]
                # 尝试设置一个不存在的路径，强制 RapidOCR 使用默认配置
                # 但这样可能会失败，所以我们直接使用 None
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
                # 最后一次尝试：完全清除所有可能的环境变量
                for key in list(os.environ.keys()):
                    if "RAPIDOCR" in key.upper() or "ONNX" in key.upper():
                        del os.environ[key]
                        logger.info(f"已清除环境变量: {key}")
                raise

    if _vector_service is None:
        logger.info("正在初始化向量数据库服务...")
        _vector_service = create_vector_service()
        if _vector_service.is_enabled():
            logger.info("向量数据库服务已启用")
        else:
            logger.info("向量数据库服务未启用或不可用")

    return _ocr_engine, _vector_service


def execute_ocr_task():
    """执行一次OCR处理任务（用于调度器调用）

    Returns:
        处理成功的截图数量
    """
    try:
        # 确保OCR引擎已初始化
        ocr, vector_service = _ensure_ocr_initialized()

        # 从数据库获取未处理的截图
        unprocessed_screenshots = get_unprocessed_screenshots(logger)

        if not unprocessed_screenshots:
            logger.debug("没有待处理的截图")
            return 0

        logger.info(f"发现 {len(unprocessed_screenshots)} 个未处理的截图")

        processed_count = 0
        # 处理每个未处理的截图
        for screenshot_info in unprocessed_screenshots:
            success = process_screenshot_ocr(screenshot_info, ocr, vector_service)
            if success:
                processed_count += 1
                # 处理成功后稍作停顿，避免过度占用资源
                time.sleep(DEFAULT_PROCESSING_DELAY)

        logger.info(f"OCR任务完成，成功处理 {processed_count} 张截图")
        return processed_count

    except Exception as e:
        logger.error(f"执行OCR任务失败: {e}")
        return 0


def ocr_service():
    """主函数 - 基于数据库驱动的OCR处理（传统模式，独立运行）"""
    logger.info("LifeTrace 简化OCR处理器启动...")

    # 检查配置
    if not get_database_path().exists():
        raise Exception("数据库未初始化，无法启动OCR服务")

    # 检查间隔配置
    check_interval = settings.get("jobs.ocr.interval")

    # 初始化RapidOCR
    logger.info("正在初始化RapidOCR引擎...")
    try:
        ocr = _create_rapidocr_instance()
        logger.info("RapidOCR引擎初始化成功")
    except Exception as e:
        logger.error(f"RapidOCR初始化失败: {e}")
        raise Exception(e) from e

    # 初始化向量数据库服务
    logger.info("正在初始化向量数据库服务...")
    vector_service = create_vector_service()
    if vector_service.is_enabled():
        logger.info("向量数据库服务已启用")
    else:
        logger.info("向量数据库服务未启用或不可用")

    # 获取检查间隔配置
    logger.info(f"数据库检查间隔: {check_interval}秒")

    logger.info("开始基于数据库的OCR处理...")
    logger.info("按 Ctrl+C 停止服务")
    logger.info(f"OCR服务启动完成，检查间隔: {check_interval}秒")

    processed_count = 0

    try:
        while True:
            start_time = time.time()  # noqa: F841

            # 从数据库获取未处理的截图
            unprocessed_screenshots = get_unprocessed_screenshots(logger)

            if unprocessed_screenshots:
                logger.info(f"发现 {len(unprocessed_screenshots)} 个未处理的截图")

                # 数据库查询已经按创建时间降序排列，无需再次排序
                # 直接处理，优先处理最新的截图

                # 处理每个未处理的截图
                for screenshot_info in unprocessed_screenshots:
                    success = process_screenshot_ocr(screenshot_info, ocr, vector_service)
                    if success:
                        processed_count += 1
                        # 处理成功后稍作停顿，避免过度占用资源
                        time.sleep(DEFAULT_PROCESSING_DELAY)
            else:
                # 没有未处理的截图，等待一段时间再检查
                time.sleep(check_interval)

    except KeyboardInterrupt:
        logger.error("收到停止信号，结束OCR处理")
    except Exception as e:
        logger.error(f"OCR处理过程中发生错误: {e}")
        raise Exception(e) from e
    finally:
        logger.error("OCR服务已停止")


if __name__ == "__main__":
    ocr_service()
    logger.info("OCR服务已启动")
