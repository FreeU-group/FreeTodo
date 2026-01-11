import os
import re
import sys
from datetime import UTC, datetime

from loguru import logger


def _get_utc_date_string() -> str:
    """获取当前 UTC 日期字符串（YYYY-MM-DD）"""
    return datetime.now(UTC).strftime("%Y-%m-%d")


def _generate_log_file_path(log_dir: str, suffix: str = "") -> str:
    """
    生成带日期和序列号的日志文件路径。
    格式：YYYY-MM-DD-N{suffix}.log（N 是当天第几次启动，从 0 开始）

    Args:
        log_dir: 日志目录路径
        suffix: 文件名后缀（如 ".error"）

    Returns:
        完整的日志文件路径
    """
    date_str = _get_utc_date_string()
    # 匹配当天的日志文件，格式：YYYY-MM-DD-N.log 或 YYYY-MM-DD-N.error.log
    pattern = re.compile(rf"^{re.escape(date_str)}-(\d+){re.escape(suffix)}\.log$")

    # 扫描现有日志文件，找出当天的最大序列号
    max_seq = -1
    try:
        if os.path.exists(log_dir):
            for filename in os.listdir(log_dir):
                match = pattern.match(filename)
                if match:
                    seq = int(match.group(1))
                    max_seq = max(max_seq, seq)
    except OSError:
        pass  # 忽略读取错误

    # 新的序列号 = 最大序列号 + 1
    new_seq = max_seq + 1
    filename = f"{date_str}-{new_seq}{suffix}.log"

    return os.path.join(log_dir, filename)


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

        # 控制台格式（使用 UTC 时间）
        console_format = (
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS!UTC}</green> | "
            "<level>{level}</level> | "
            "<cyan>{file}:{line}</cyan> | <cyan>{message}</cyan>"
        )
        logger.add(sys.stderr, level=level, format=console_format)

        if log_path:
            # 如果 log_path 是目录或以 / 结尾，直接使用目录作为日志目录
            if log_path.endswith(os.sep) or log_path.endswith("/"):
                log_dir = log_path.rstrip(os.sep).rstrip("/")
                os.makedirs(log_dir, exist_ok=True)

                # 生成带序列号的日志文件名（每次启动生成新文件）
                log_file_path = _generate_log_file_path(log_dir)
                error_log_path = _generate_log_file_path(log_dir, ".error")
            else:
                raise ValueError("log_path must be a directory")

            # 文件日志格式（使用 UTC 时间）
            file_format = "{time:YYYY-MM-DD HH:mm:ss.SSS!UTC} | {level} | {file}:{line} | {message}"

            # 添加主日志文件（静态文件名，不使用 rotation）
            logger.add(
                log_file_path,
                level=level,
                format=file_format,
                rotation=None,  # 不自动轮转，每次启动一个新文件
                retention=7,
                encoding="utf-8",
            )

            # 添加单独的 error 日志文件
            logger.add(
                error_log_path,
                level="ERROR",
                format=file_format,
                rotation=None,  # 不自动轮转
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
