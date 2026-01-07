"""
OCR 配置模块
包含 OCR 相关的常量、配置函数和初始化逻辑
"""

import os
import sys

import yaml

from lifetrace.util.logging_config import get_logger
from lifetrace.util.path_utils import get_app_root, get_config_dir, get_models_dir
from lifetrace.util.settings import settings

logger = get_logger()

# OCR配置常量
DEFAULT_IMAGE_MAX_SIZE = (1920, 1080)
DEFAULT_CONFIDENCE = 0.8
DEFAULT_PROCESSING_DELAY = 0.1
MIN_CONFIDENCE_THRESHOLD = 0.5


def get_application_path() -> str:
    """获取应用程序路径，兼容PyInstaller打包"""
    return str(get_app_root())


def get_rapidocr_config_path() -> str:
    """获取RapidOCR配置文件路径"""
    return str(get_config_dir() / "rapidocr_config.yaml")


def setup_rapidocr_config():
    """设置RapidOCR配置文件路径"""
    config_path = get_rapidocr_config_path()
    if os.path.exists(config_path):
        os.environ["RAPIDOCR_CONFIG_PATH"] = config_path
        logger.info(f"设置RapidOCR配置路径: {config_path}")
    else:
        logger.warning(f"配置文件不存在: {config_path}")


def get_ocr_config() -> dict:
    """从配置中获取OCR相关参数

    Returns:
        包含OCR配置的字典
    """
    languages = settings.get("jobs.ocr.params.language")
    confidence_threshold = settings.get("jobs.ocr.params.confidence_threshold")

    language = languages[0] if isinstance(languages, list) and languages else "ch"
    if isinstance(languages, str):
        language = languages

    return {
        "confidence_threshold": confidence_threshold,
        "language": language,
        "default_confidence": DEFAULT_CONFIDENCE,
    }


def create_rapidocr_instance():  # noqa: C901, PLR0912
    """创建并初始化RapidOCR实例

    Returns:
        RapidOCR实例
    """
    from rapidocr_onnxruntime import RapidOCR

    config_path = get_rapidocr_config_path()

    # 在 PyInstaller 打包环境中，清除可能干扰的环境变量
    if getattr(sys, "frozen", False) and "RAPIDOCR_CONFIG_PATH" in os.environ:
        del os.environ["RAPIDOCR_CONFIG_PATH"]

    # 配置文件不存在时使用默认配置
    if not os.path.exists(config_path):
        logger.warning(f"配置文件不存在: {config_path}，使用默认配置")
        return _create_default_rapidocr(RapidOCR)

    logger.info(f"使用RapidOCR配置文件: {config_path}")

    try:
        with open(config_path, encoding="utf-8") as f:
            config_data = yaml.safe_load(f)

        if "Models" not in config_data:
            logger.info("未找到外部模型配置，使用默认方式")
            return _create_default_rapidocr_with_cleanup(RapidOCR)

        return _create_rapidocr_with_external_models(RapidOCR, config_data)

    except Exception as e:
        logger.error(f"读取配置文件失败: {e}，使用默认配置")
        return _create_default_rapidocr_with_cleanup(RapidOCR)


def _create_default_rapidocr(rapidocr_cls):
    """创建默认配置的RapidOCR实例"""
    try:
        return rapidocr_cls(
            config_path=None,
            det_use_cuda=False,
            cls_use_cuda=False,
            rec_use_cuda=False,
            print_verbose=False,
        )
    except Exception as e:
        logger.warning(f"RapidOCR 初始化时遇到问题: {e}，尝试使用环境变量修复")
        if "RAPIDOCR_CONFIG_PATH" in os.environ:
            del os.environ["RAPIDOCR_CONFIG_PATH"]
        return rapidocr_cls(
            config_path=None,
            det_use_cuda=False,
            cls_use_cuda=False,
            rec_use_cuda=False,
            print_verbose=False,
        )


def _create_default_rapidocr_with_cleanup(rapidocr_cls):
    """在PyInstaller环境中清除环境变量后创建默认配置的RapidOCR实例"""
    if getattr(sys, "frozen", False) and "RAPIDOCR_CONFIG_PATH" in os.environ:
        del os.environ["RAPIDOCR_CONFIG_PATH"]
    return rapidocr_cls(
        config_path=None,
        det_use_cuda=False,
        cls_use_cuda=False,
        rec_use_cuda=False,
        print_verbose=False,
    )


def _create_rapidocr_with_external_models(rapidocr_cls, config_data: dict):
    """使用外部模型文件创建RapidOCR实例"""
    models_config = config_data["Models"]
    models_dir = get_models_dir()

    det_model_path = str(models_dir / models_config.get("det_model_path", "").lstrip("/"))
    rec_model_path = str(models_dir / models_config.get("rec_model_path", "").lstrip("/"))
    cls_model_path = str(models_dir / models_config.get("cls_model_path", "").lstrip("/"))

    if (
        os.path.exists(det_model_path)
        and os.path.exists(rec_model_path)
        and os.path.exists(cls_model_path)
    ):
        logger.info("使用外部模型文件:")
        logger.info(f"  检测模型: {det_model_path}")
        logger.info(f"  识别模型: {rec_model_path}")
        logger.info(f"  分类模型: {cls_model_path}")

        return rapidocr_cls(
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
        return _create_default_rapidocr_with_cleanup(rapidocr_cls)
