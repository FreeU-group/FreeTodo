import os
import re
import sys

from loguru import logger


def _get_local_date_string() -> str:
    from util.time_utils import local_today_str  # noqa: PLC0415

    return local_today_str()


def _generate_log_file_path(log_dir: str, suffix: str = "") -> str:
    date_str = _get_local_date_string()
    pattern = re.compile(rf"^{re.escape(date_str)}-(\d+){re.escape(suffix)}\.log$")

    max_seq = -1
    try:
        if os.path.exists(log_dir):
            for filename in os.listdir(log_dir):
                match = pattern.match(filename)
                if match:
                    seq = int(match.group(1))
                    max_seq = max(max_seq, seq)
    except OSError:
        pass

    new_seq = max_seq + 1
    filename = f"{date_str}-{new_seq}{suffix}.log"
    return os.path.join(log_dir, filename)


class LoggerManager:
    def __init__(self):
        logger.remove()

    def _build_filter(self, quiet_modules: list[str] | None):
        if not quiet_modules:
            return None

        lowered = [item.lower() for item in quiet_modules if isinstance(item, str)]
        if not lowered:
            return None

        def _filter(record):
            name = str(record.get("name", "")).lower()
            module = str(record.get("module", "")).lower()
            function = str(record.get("function", "")).lower()
            file_path = ""
            file_info = record.get("file")
            if file_info is not None:
                file_path = str(getattr(file_info, "path", "")).lower()
            target = f"{name} {module} {function} {file_path}"
            return not any(item in target for item in lowered)

        return _filter

    def configure(self, config: dict):
        if "level" not in config:
            raise KeyError("配置中缺少 'level' 键")
        if "log_path" not in config:
            raise KeyError("配置中缺少 'log_path' 键")

        level = config["level"]
        console_level = config.get("console_level", level)
        file_level = config.get("file_level", level)
        log_path = config["log_path"]
        quiet_modules = config.get("quiet_modules", [])
        log_filter = self._build_filter(quiet_modules)

        console_format = (
            "<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | "
            "<level>{level}</level> | "
            "<cyan>{file}:{line}</cyan> | <cyan>{message}</cyan>"
        )
        logger.add(sys.stderr, level=console_level, format=console_format, filter=log_filter)

        if log_path:
            if log_path.endswith(os.sep) or log_path.endswith("/"):
                log_dir = log_path.rstrip(os.sep).rstrip("/")
                os.makedirs(log_dir, exist_ok=True)

                log_file_path = _generate_log_file_path(log_dir)
                error_log_path = _generate_log_file_path(log_dir, ".error")
            else:
                raise ValueError("log_path must be a directory")

            file_format = "{time:YYYY-MM-DD HH:mm:ss.SSS} | {level} | {file}:{line} | {message}"

            logger.add(
                log_file_path,
                level=file_level,
                format=file_format,
                rotation=None,
                retention=7,
                encoding="utf-8",
                filter=log_filter,
            )

            logger.add(
                error_log_path,
                level="ERROR",
                format=file_format,
                rotation=None,
                retention=30,
                encoding="utf-8",
                filter=log_filter,
            )

    def get_logger(self):
        return logger


def setup_logging(config: dict):
    logger_manager = LoggerManager()
    logger_manager.configure(config)
    logger.info("Logging setup completed")


def get_logger():
    return logger
