# ruff: noqa: TC003
"""Shared crawler router constants, paths, and config helpers."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel

from services.plugin_manager import media_crawler_plugin as plugin
from util.logging_config import get_logger

logger = get_logger()

PLUGIN_NOT_INSTALLED_MSG = (
    "MediaCrawler 插件未安装。请在「插件管理」中安装 MediaCrawler 插件后再使用爬虫功能。"
)

PLATFORM_NAME_MAP = {
    "douyin": "dy",
    "xhs": "xhs",
    "xiaohongshu": "xhs",
    "kuaishou": "ks",
    "bilibili": "bili",
    "weibo": "wb",
    "tieba": "tieba",
    "zhihu": "zhihu",
    "dy": "dy",
    "ks": "ks",
    "wb": "wb",
    "bili": "bili",
}


class CrawlerConfigUpdate(BaseModel):
    """Crawler config update payload."""

    keywords: str | None = None
    platform: str | None = None
    platforms: list[str] | None = None
    crawler_type: str | None = None
    max_notes_count: int | None = None
    enable_comments: bool | None = None
    enable_checkpoint: bool | None = None
    crawler_sleep: float | None = None
    save_data_option: str | None = None
    blacklist_nicknames: str | None = None


class CrawlerConfigResponse(BaseModel):
    """Crawler config response payload."""

    keywords: str
    platform: str
    platforms: list[str] = []
    crawler_type: str
    max_notes_count: int
    enable_comments: bool
    enable_checkpoint: bool
    crawler_sleep: float
    save_data_option: str
    blacklist_nicknames: str = ""


class KdlProxyConfigResponse(BaseModel):
    """KDL proxy config response payload."""

    kdl_secert_id: str = ""
    kdl_signature: str = ""
    kdl_user_name: str = ""
    kdl_user_pwd: str = ""


class KdlProxyConfigUpdate(BaseModel):
    """KDL proxy config update payload."""

    kdl_secert_id: str | None = None
    kdl_signature: str | None = None
    kdl_user_name: str | None = None
    kdl_user_pwd: str | None = None


def default_crawler_config() -> CrawlerConfigResponse:
    """Return default config when the plugin is unavailable."""
    return CrawlerConfigResponse(
        keywords="",
        platform="xhs",
        platforms=[],
        crawler_type="search",
        max_notes_count=40,
        enable_comments=False,
        enable_checkpoint=True,
        crawler_sleep=1.0,
        save_data_option="csv",
        blacklist_nicknames="",
    )


def normalize_platform_name(platform: str) -> str:
    """Normalize platform names for MediaCrawler CLI."""
    return PLATFORM_NAME_MAP.get(platform.lower(), platform)


def get_crawler_dir() -> Path:
    """Resolve the crawler directory or raise 503."""
    resolved = plugin.resolve_crawler_dir()
    if resolved is None:
        raise HTTPException(status_code=503, detail=PLUGIN_NOT_INSTALLED_MSG)
    return resolved


def get_sign_srv_dir() -> Path:
    """Resolve the sign service directory or raise 503."""
    resolved = plugin.resolve_sign_srv_dir()
    if resolved is None:
        raise HTTPException(status_code=503, detail=PLUGIN_NOT_INSTALLED_MSG)
    return resolved


def try_get_crawler_dir() -> Path | None:
    """Resolve the crawler directory if available."""
    return plugin.resolve_crawler_dir()


def try_get_crawler_config_path() -> Path | None:
    """Return the crawler config path when available."""
    crawler_dir = try_get_crawler_dir()
    return crawler_dir / "config" / "base_config.py" if crawler_dir else None


def try_get_proxy_config_path() -> Path | None:
    """Return the proxy config path when available."""
    crawler_dir = try_get_crawler_dir()
    return crawler_dir / "config" / "proxy_config.py" if crawler_dir else None


def try_get_cookies_config_path() -> Path | None:
    """Return the cookies config path when available."""
    crawler_dir = try_get_crawler_dir()
    return crawler_dir / "config" / "accounts_cookies.xlsx" if crawler_dir else None


def try_get_transcripts_dir() -> Path | None:
    """Return the transcripts directory when available."""
    crawler_dir = try_get_crawler_dir()
    return crawler_dir / "data" / "transcripts" if crawler_dir else None


def try_get_videos_download_dir() -> Path | None:
    """Return the video download directory when available."""
    crawler_dir = try_get_crawler_dir()
    return crawler_dir / "data" / "videos" if crawler_dir else None


def get_crawler_config_path() -> Path:
    """Return the crawler config path."""
    return get_crawler_dir() / "config" / "base_config.py"


def get_proxy_config_path() -> Path:
    """Return the proxy config path."""
    return get_crawler_dir() / "config" / "proxy_config.py"


def get_cookies_config_path() -> Path:
    """Return the cookies config path."""
    return get_crawler_dir() / "config" / "accounts_cookies.xlsx"


def get_transcripts_dir() -> Path:
    """Return the transcripts directory."""
    return get_crawler_dir() / "data" / "transcripts"


def get_videos_download_dir() -> Path:
    """Return the video download directory."""
    return get_crawler_dir() / "data" / "videos"


def read_config_file(*, require: bool = True) -> str | None:
    """Read `base_config.py`."""
    config_path = get_crawler_config_path() if require else try_get_crawler_config_path()
    if config_path is None:
        return None
    if not config_path.exists():
        if require:
            raise HTTPException(status_code=404, detail=f"配置文件不存在: {config_path}")
        return None
    return config_path.read_text(encoding="utf-8")


def write_config_file(content: str) -> None:
    """Write `base_config.py`."""
    get_crawler_config_path().write_text(content, encoding="utf-8")


def extract_config_value(content: str, key: str, value_type: str = "str") -> Any:
    """Extract a config value from python-like config text."""
    if value_type == "str":
        pattern = rf'^{key}\s*=\s*["\'](.+?)["\']'
    elif value_type == "bool":
        pattern = rf"^{key}\s*=\s*(True|False)"
    else:
        pattern = rf"^{key}\s*=\s*([^\s#]+)"

    match = re.search(pattern, content, re.MULTILINE)
    if not match:
        return None

    value = match.group(1)
    if value_type == "int":
        return int(value)
    if value_type == "float":
        return float(value)
    if value_type == "bool":
        return value == "True"
    return value


def update_config_value(content: str, key: str, value: Any, value_type: str = "str") -> str:
    """Replace a config assignment inside python-like config text."""
    if value_type == "str":
        new_value = f'{key} = "{value}"'
        pattern = rf'^{key}\s*=\s*["\'].*?["\']'
    elif value_type == "bool":
        new_value = f"{key} = {value}"
        pattern = rf"^{key}\s*=\s*(True|False)"
    else:
        new_value = f"{key} = {value}"
        pattern = rf"^{key}\s*=\s*[^\s#]+"

    new_content, count = re.subn(pattern, new_value, content, flags=re.MULTILINE)
    if count == 0:
        logger.warning("未找到配置项 %s，无法更新", key)
    return new_content


def read_proxy_config_file() -> str | None:
    """Read `proxy_config.py`."""
    proxy_path = try_get_proxy_config_path()
    if proxy_path is None or not proxy_path.exists():
        return None
    return proxy_path.read_text(encoding="utf-8")


def write_proxy_config_file(content: str) -> None:
    """Write `proxy_config.py`."""
    proxy_path = get_proxy_config_path()
    proxy_path.parent.mkdir(parents=True, exist_ok=True)
    proxy_path.write_text(content, encoding="utf-8")


def update_proxy_config_line(content: str, key: str, value: str) -> str:
    """Update or append a proxy config assignment."""
    new_line = f'{key} = "{value}"'
    pattern = rf"^{re.escape(key)}\s*=\s*.+$"
    new_content, count = re.subn(pattern, new_line, content, flags=re.MULTILINE)
    if count != 0:
        return new_content

    lines = new_content.rstrip().split("\n") if new_content.strip() else []
    lines.append(new_line)
    return "\n".join(lines) + "\n"
