import os
import sys

from loguru import logger


class LoggerManager:
    def __init__(self):
        logger.remove()

    def configure(self, config: dict):
        if "level" not in config:
            raise KeyError("配置中缺少 'level' 键")
        if "log_path" not in config:
            raise KeyError("配置中缺少 'log_path' 键")

        level = config["level"]
        log_path = config["log_path"]

        console_format = (
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
            "<level>{level}</level> | "
            "<cyan>{file}:{line}</cyan> | <cyan>{message}</cyan>"
        )
        logger.add(sys.stderr, level=level, format=console_format)

        if log_path:
            # 如果 log_path 是目录或以 / 结尾，直接使用目录作为日志目录
            if log_path.endswith(os.sep) or log_path.endswith("/"):
                log_dir = log_path.rstrip(os.sep).rstrip("/")
                os.makedirs(log_dir, exist_ok=True)
                # 直接使用日期作为文件名，格式：YYYY-MM-DD.log
                dated_log_path = os.path.join(log_dir, "{time:YYYY-MM-DD}.log")
            else:
                raise ValueError("log_path must be a directory")

            # 添加文件名和行号信息到日志格式
            file_format = "{time:YYYY-MM-DD HH:mm:ss.SSS} | {level} | {file}:{line} | {message}"

            logger.add(
                dated_log_path,
                level=level,
                format=file_format,
                rotation="100 MB",
                retention=7,
                encoding="utf-8",
            )

            # 添加单独的 error 日志文件
            error_log_path = dated_log_path.replace(".log", ".error.log")

            # 只记录 ERROR 及以上级别
            logger.add(
                error_log_path,
                level="ERROR",
                format=file_format,
                rotation="10 MB",
                retention=30,
                encoding="utf-8",
            )

    def get_logger(self):
        return logger


def setup_logging(config: dict):
    logger_manager = LoggerManager()
    logger_manager.configure(config)
    logger.info("Logging setup completed")


def get_logger():
    return logger
