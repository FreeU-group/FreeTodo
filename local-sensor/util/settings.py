"""Dynaconf 配置模块 - 精简版, 仅包含 Sensor 客户端所需的配置项。"""

import shutil
from pathlib import Path

from dynaconf import Dynaconf, Validator

from util.base_paths import get_config_dir, get_user_config_dir


def _get_config_dir() -> Path:
    return get_user_config_dir()


def _get_default_config_dir() -> Path:
    return get_config_dir()


def _init_config_files() -> list[str]:
    user_config_dir = _get_config_dir()
    default_config_dir = _get_default_config_dir()

    user_config_dir.mkdir(parents=True, exist_ok=True)

    default_config_path = default_config_dir / "default_config.yaml"
    user_default_config_path = user_config_dir / "default_config.yaml"
    user_config_path = user_config_dir / "config.yaml"

    if not user_default_config_path.exists() and default_config_path.exists():
        shutil.copy2(default_config_path, user_default_config_path)

    if not user_config_path.exists():
        source = (
            user_default_config_path if user_default_config_path.exists() else default_config_path
        )
        if source.exists():
            shutil.copy2(source, user_config_path)

    settings_files = []

    if user_default_config_path.exists():
        settings_files.append(str(user_default_config_path))
    elif default_config_path.exists():
        settings_files.append(str(default_config_path))

    if user_config_path.exists():
        settings_files.append(str(user_config_path))

    return settings_files


_settings_files = _init_config_files()

settings = Dynaconf(
    settings_files=_settings_files,
    envvar_prefix="FREETODO_CLIENT",
    nested_separator="__",
    merge_enabled=True,
    load_dotenv=True,
    lowercase_read=True,
    validators=[
        Validator("logging.level", default="INFO"),
        Validator("logging.log_path", default="logs/"),
        Validator("logging.console_level", default="INFO"),
        Validator("logging.file_level", default="INFO"),
        Validator("logging.quiet_modules", default=[], is_type_of=list),
        # Proactive OCR
        Validator("jobs.proactive_ocr.ocr_backend", default="auto"),
        Validator("jobs.proactive_ocr.det_limit_side_len", default=960, is_type_of=int),
        Validator("jobs.proactive_ocr.resize_max_side", default=0, is_type_of=int),
        Validator("jobs.proactive_ocr.rec_batch_num", default=8, is_type_of=int),
        Validator("jobs.proactive_ocr.use_cls", default=False, is_type_of=bool),
        Validator("jobs.proactive_ocr.winrt_lang", default="zh-Hans-CN"),
    ],
)


def get_settings() -> Dynaconf:
    return settings


def reload_settings() -> bool:
    try:
        settings.reload()
        return True
    except Exception:
        return False
