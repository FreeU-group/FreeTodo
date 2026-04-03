"""爬虫配置相关路由"""

import asyncio
import csv
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.plugin_manager import media_crawler_plugin as _plugin
from util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/crawler", tags=["crawler"])

_PLUGIN_NOT_INSTALLED_MSG = (
    "MediaCrawler 插件未安装。请在「插件管理」中安装 MediaCrawler 插件后再使用爬虫功能。"
)


def _get_crawler_dir() -> Path:
    """动态获取爬虫引擎目录（插件模式优先，开发模式兜底）。

    写操作端点使用此函数——插件不可用时抛出 503。
    """
    resolved = _plugin.resolve_crawler_dir()
    if resolved is None:
        raise HTTPException(status_code=503, detail=_PLUGIN_NOT_INSTALLED_MSG)
    return resolved


def _get_sign_srv_dir() -> Path:
    """动态获取签名服务目录。"""
    resolved = _plugin.resolve_sign_srv_dir()
    if resolved is None:
        raise HTTPException(status_code=503, detail=_PLUGIN_NOT_INSTALLED_MSG)
    return resolved


# ---------------------------------------------------------------------------
# 以下 _try_* 系列函数用于 **只读** 端点，插件不可用时返回 None 而非抛异常，
# 使前端设置页面在插件缺失时仍能正常渲染（显示空数据）。
# ---------------------------------------------------------------------------


def _try_get_crawler_dir() -> Path | None:
    """尝试获取爬虫引擎目录，不可用时返回 None。"""
    return _plugin.resolve_crawler_dir()


def _try_get_crawler_config_path() -> Path | None:
    """尝试获取爬虫配置文件路径，不可用时返回 None。"""
    d = _try_get_crawler_dir()
    return d / "config" / "base_config.py" if d else None


def _try_get_cookies_config_path() -> Path | None:
    """尝试获取 Cookies 配置文件路径，不可用时返回 None。"""
    d = _try_get_crawler_dir()
    return d / "config" / "accounts_cookies.xlsx" if d else None


def _try_get_transcripts_dir() -> Path | None:
    """尝试获取视频转写文本目录，不可用时返回 None。"""
    d = _try_get_crawler_dir()
    return d / "data" / "transcripts" if d else None


def _try_get_videos_download_dir() -> Path | None:
    """尝试获取视频下载目录，不可用时返回 None。"""
    d = _try_get_crawler_dir()
    return d / "data" / "videos" if d else None


# ---------------------------------------------------------------------------
# 以下保留原有的 _get_* 函数（会抛 503），供写操作端点使用。
# ---------------------------------------------------------------------------


def _get_crawler_config_path() -> Path:
    """动态获取爬虫配置文件路径（写操作用）。"""
    return _get_crawler_dir() / "config" / "base_config.py"


def _get_proxy_config_path() -> Path:
    """获取代理配置文件路径（proxy_config.py）。"""
    return _get_crawler_dir() / "config" / "proxy_config.py"


def _try_get_proxy_config_path() -> Path | None:
    """尝试获取代理配置文件路径，不可用时返回 None。"""
    d = _try_get_crawler_dir()
    return d / "config" / "proxy_config.py" if d else None


def _get_cookies_config_path() -> Path:
    """动态获取 Cookies 配置文件路径（写操作用）。"""
    return _get_crawler_dir() / "config" / "accounts_cookies.xlsx"


def _get_transcripts_dir() -> Path:
    """动态获取视频转写文本目录（写操作用）。"""
    return _get_crawler_dir() / "data" / "transcripts"


def _get_videos_download_dir() -> Path:
    """动态获取视频下载目录（写操作用）。"""
    return _get_crawler_dir() / "data" / "videos"


# 全局进程管理
_sign_srv_process: subprocess.Popen | None = None
_crawler_process: subprocess.Popen | None = None
_crawler_status = "idle"  # idle, starting, running, stopping, error

# 循环爬取控制
_stop_loop_flag = False  # 停止循环爬取的标志
_loop_crawler_task: asyncio.Task | None = None  # 循环爬取任务
_current_platform_index = 0  # 当前爬取的平台索引
_excluded_keywords: list[str] = []  # 排除关键词列表

# 平台名称映射（前端/配置文件使用的名称 -> MediaCrawlerPro 命令行接受的名称）
PLATFORM_NAME_MAP = {
    "douyin": "dy",
    "xhs": "xhs",
    "xiaohongshu": "xhs",
    "kuaishou": "ks",
    "bilibili": "bili",
    "weibo": "wb",
    "tieba": "tieba",
    "zhihu": "zhihu",
    # 已经是正确格式的也保留
    "dy": "dy",
    "ks": "ks",
    "wb": "wb",
    "bili": "bili",
}


def normalize_platform_name(platform: str) -> str:
    """将平台名称规范化为 MediaCrawlerPro 命令行接受的格式"""
    return PLATFORM_NAME_MAP.get(platform.lower(), platform)


class CrawlerConfigUpdate(BaseModel):
    """爬虫配置更新请求"""

    keywords: str | None = None
    platform: str | None = None
    platforms: list[str] | None = None  # 多平台支持
    crawler_type: str | None = None
    max_notes_count: int | None = None
    enable_comments: bool | None = None
    enable_checkpoint: bool | None = None
    crawler_sleep: float | None = None
    save_data_option: str | None = None
    blacklist_nicknames: str | None = None  # 博主黑名单（逗号分隔的昵称列表）


class CrawlerConfigResponse(BaseModel):
    """爬虫配置响应"""

    keywords: str
    platform: str
    platforms: list[str] = []  # 多平台支持
    crawler_type: str
    max_notes_count: int
    enable_comments: bool
    enable_checkpoint: bool
    crawler_sleep: float
    save_data_option: str
    blacklist_nicknames: str = ""  # 博主黑名单（逗号分隔的昵称列表）


def read_config_file(*, require: bool = True) -> str | None:
    """读取配置文件内容。

    Args:
        require: 为 True 时使用 _get_crawler_config_path()（不可用则 503）；
                 为 False 时使用 _try_get_crawler_config_path()（不可用返回 None）。
    """
    if require:
        config_path = _get_crawler_config_path()
    else:
        config_path = _try_get_crawler_config_path()
        if config_path is None:
            return None
    if not config_path.exists():
        if require:
            raise HTTPException(status_code=404, detail=f"配置文件不存在: {config_path}")
        return None
    return config_path.read_text(encoding="utf-8")


def write_config_file(content: str) -> None:
    """写入配置文件内容"""
    config_path = _get_crawler_config_path()
    config_path.write_text(content, encoding="utf-8")


def extract_config_value(content: str, key: str, value_type: str = "str") -> Any:
    """从配置文件内容中提取配置值

    Args:
        content: 配置文件内容
        key: 配置键名
        value_type: 值类型 (str, int, float, bool)
    """
    # 匹配 KEY = "value" 或 KEY = value 格式
    if value_type == "str":
        pattern = rf'^{key}\s*=\s*["\'](.+?)["\']'
    elif value_type == "bool":
        pattern = rf"^{key}\s*=\s*(True|False)"
    else:
        pattern = rf"^{key}\s*=\s*([^\s#]+)"

    match = re.search(pattern, content, re.MULTILINE)
    if match:
        value = match.group(1)
        if value_type == "int":
            return int(value)
        elif value_type == "float":
            return float(value)
        elif value_type == "bool":
            return value == "True"
        return value
    return None


def update_config_value(content: str, key: str, value: Any, value_type: str = "str") -> str:
    """更新配置文件中的配置值

    Args:
        content: 配置文件内容
        key: 配置键名
        value: 新值
        value_type: 值类型 (str, int, float, bool)
    """
    if value_type == "str":
        new_value = f'{key} = "{value}"'
        # 匹配带引号的字符串值（使用 .*? 以支持空字符串）
        pattern = rf'^{key}\s*=\s*["\'].*?["\']'
    elif value_type == "bool":
        new_value = f"{key} = {value}"
        pattern = rf"^{key}\s*=\s*(True|False)"
    else:
        new_value = f"{key} = {value}"
        pattern = rf"^{key}\s*=\s*[^\s#]+"

    new_content, count = re.subn(pattern, new_value, content, flags=re.MULTILINE)

    if count == 0:
        logger.warning(f"未找到配置项 {key}，无法更新")

    return new_content


@router.get("/config", response_model=CrawlerConfigResponse)
async def get_crawler_config():
    """获取爬虫配置"""
    try:
        content = read_config_file(require=False)

        # 插件不可用或配置文件不存在时返回默认值
        if content is None:
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

        # 读取平台配置
        platform = extract_config_value(content, "PLATFORM", "str") or "xhs"
        # 读取多平台配置（逗号分隔的字符串）
        platforms_str = extract_config_value(content, "PLATFORMS", "str") or ""
        if platforms_str:
            platforms = [p.strip() for p in platforms_str.split(",") if p.strip()]
        else:
            # 如果没有 PLATFORMS 配置，则使用单个 platform
            platforms = [platform]

        config = CrawlerConfigResponse(
            keywords=extract_config_value(content, "KEYWORDS", "str") or "",
            platform=platform,
            platforms=platforms,
            crawler_type=extract_config_value(content, "CRAWLER_TYPE", "str") or "search",
            max_notes_count=extract_config_value(content, "CRAWLER_MAX_NOTES_COUNT", "int") or 40,
            enable_comments=extract_config_value(content, "ENABLE_GET_COMMENTS", "bool") or False,
            enable_checkpoint=extract_config_value(content, "ENABLE_CHECKPOINT", "bool") or True,
            crawler_sleep=extract_config_value(content, "CRAWLER_TIME_SLEEP", "float") or 1.0,
            save_data_option=extract_config_value(content, "SAVE_DATA_OPTION", "str") or "csv",
            blacklist_nicknames=extract_config_value(content, "BLACKLIST_NICKNAMES", "str") or "",
        )

        return config
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取爬虫配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取爬虫配置失败: {e!s}") from e


@router.post("/config")
async def update_crawler_config(config: CrawlerConfigUpdate):
    """更新爬虫配置"""
    try:
        content = read_config_file()

        # 更新各配置项
        if config.keywords is not None:
            content = update_config_value(content, "KEYWORDS", config.keywords, "str")
            logger.info(f"更新爬虫关键词: {config.keywords}")

        if config.platforms is not None:
            # 保存多平台配置（逗号分隔的字符串）
            platforms_str = ",".join(config.platforms)
            content = update_config_value(content, "PLATFORMS", platforms_str, "str")
            # 同时更新单平台配置（兼容旧逻辑）
            if config.platforms:
                content = update_config_value(content, "PLATFORM", config.platforms[0], "str")
            logger.info(f"更新爬虫平台: {config.platforms}")
        elif config.platform is not None:
            content = update_config_value(content, "PLATFORM", config.platform, "str")
            logger.info(f"更新爬虫平台: {config.platform}")

        if config.crawler_type is not None:
            content = update_config_value(content, "CRAWLER_TYPE", config.crawler_type, "str")
            logger.info(f"更新爬取类型: {config.crawler_type}")

        if config.max_notes_count is not None:
            content = update_config_value(
                content, "CRAWLER_MAX_NOTES_COUNT", config.max_notes_count, "int"
            )
            logger.info(f"更新最大爬取数量: {config.max_notes_count}")

        if config.enable_comments is not None:
            content = update_config_value(
                content, "ENABLE_GET_COMMENTS", config.enable_comments, "bool"
            )
            logger.info(f"更新是否爬取评论: {config.enable_comments}")

        if config.enable_checkpoint is not None:
            content = update_config_value(
                content, "ENABLE_CHECKPOINT", config.enable_checkpoint, "bool"
            )
            logger.info(f"更新断点续爬: {config.enable_checkpoint}")

        if config.crawler_sleep is not None:
            content = update_config_value(
                content, "CRAWLER_TIME_SLEEP", config.crawler_sleep, "float"
            )
            logger.info(f"更新爬虫间隔: {config.crawler_sleep}")

        if config.save_data_option is not None:
            content = update_config_value(
                content, "SAVE_DATA_OPTION", config.save_data_option, "str"
            )
            logger.info(f"更新数据保存方式: {config.save_data_option}")

        if config.blacklist_nicknames is not None:
            content = update_config_value(
                content, "BLACKLIST_NICKNAMES", config.blacklist_nicknames, "str"
            )
            logger.info(f"更新博主黑名单: {config.blacklist_nicknames}")

        # 写入配置文件
        write_config_file(content)

        return {"success": True, "message": "配置更新成功"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新爬虫配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新爬虫配置失败: {e!s}") from e


@router.post("/config/keywords")
async def update_keywords(data: dict[str, str]):
    """快速更新关键词（简化接口）"""
    try:
        keywords = data.get("keywords", "")
        content = read_config_file()
        content = update_config_value(content, "KEYWORDS", keywords, "str")
        write_config_file(content)
        logger.info(f"更新爬虫关键词: {keywords}")
        return {"success": True, "keywords": keywords}
    except Exception as e:
        logger.error(f"更新关键词失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新关键词失败: {e!s}") from e


# ============== 快代理 (KDL) 配置 ==============


def _read_proxy_config_file() -> str | None:
    """读取 proxy_config.py 内容，不可用时返回 None。"""
    path = _try_get_proxy_config_path()
    if path is None or not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def _write_proxy_config_file(content: str) -> None:
    """写入 proxy_config.py 内容"""
    path = _get_proxy_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _update_proxy_config_line(content: str, key: str, value: str) -> str:
    """更新或追加 proxy_config 中的 KEY = "value" 行。"""
    new_line = f'{key} = "{value}"'
    # 匹配 KEY = "..." 或 KEY = os.getenv(...) 等格式
    pattern = rf"^{re.escape(key)}\s*=\s*.+$"
    new_content, count = re.subn(pattern, new_line, content, flags=re.MULTILINE)
    if count == 0:
        # 键不存在，在文件末尾追加（在空行之前）
        lines = new_content.rstrip().split("\n")
        lines.append(new_line)
        return "\n".join(lines) + "\n"
    return new_content


class KdlProxyConfigResponse(BaseModel):
    """快代理配置响应"""

    kdl_secert_id: str = ""
    kdl_signature: str = ""
    kdl_user_name: str = ""
    kdl_user_pwd: str = ""


class KdlProxyConfigUpdate(BaseModel):
    """快代理配置更新请求"""

    kdl_secert_id: str | None = None
    kdl_signature: str | None = None
    kdl_user_name: str | None = None
    kdl_user_pwd: str | None = None


@router.get("/proxy-config", response_model=KdlProxyConfigResponse)
async def get_proxy_config():
    """获取快代理 (KDL) 配置"""
    try:
        content = _read_proxy_config_file()
        if content is None:
            return KdlProxyConfigResponse()
        return KdlProxyConfigResponse(
            kdl_secert_id=extract_config_value(content, "KDL_SECERT_ID", "str") or "",
            kdl_signature=extract_config_value(content, "KDL_SIGNATURE", "str") or "",
            kdl_user_name=extract_config_value(content, "KDL_USER_NAME", "str") or "",
            kdl_user_pwd=extract_config_value(content, "KDL_USER_PWD", "str") or "",
        )
    except Exception as e:
        logger.error(f"获取代理配置失败: {e}")
        return KdlProxyConfigResponse()


@router.post("/proxy-config")
async def update_proxy_config(config: KdlProxyConfigUpdate):
    """更新快代理 (KDL) 配置"""
    try:
        content = _read_proxy_config_file()
        if content is None:
            raise HTTPException(status_code=503, detail=_PLUGIN_NOT_INSTALLED_MSG)
        if config.kdl_secert_id is not None:
            content = _update_proxy_config_line(content, "KDL_SECERT_ID", config.kdl_secert_id)
        if config.kdl_signature is not None:
            content = _update_proxy_config_line(content, "KDL_SIGNATURE", config.kdl_signature)
        if config.kdl_user_name is not None:
            content = _update_proxy_config_line(content, "KDL_USER_NAME", config.kdl_user_name)
        if config.kdl_user_pwd is not None:
            content = _update_proxy_config_line(content, "KDL_USER_PWD", config.kdl_user_pwd)
        _write_proxy_config_file(content)
        logger.info("快代理配置已更新")
        return {"success": True, "message": "快代理配置已保存"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新代理配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新代理配置失败: {e!s}") from e


# ============== Cookies 管理 ==============

# 支持的平台列表（与 Excel sheet 名称对应）
SUPPORTED_PLATFORMS = ["xhs", "dy", "ks", "wb", "bili", "tieba", "zhihu"]

# 平台显示名称映射
PLATFORM_DISPLAY_NAMES = {
    "xhs": "小红书",
    "dy": "抖音",
    "ks": "快手",
    "wb": "微博",
    "bili": "哔哩哔哩",
    "tieba": "百度贴吧",
    "zhihu": "知乎",
}


class CookieAccount(BaseModel):
    """单个账号的 Cookie 信息"""

    id: int | None = None
    account_name: str
    cookies: str


class PlatformCookies(BaseModel):
    """单个平台的所有 Cookie 信息"""

    platform: str
    platform_name: str
    accounts: list[CookieAccount]


class AllCookiesResponse(BaseModel):
    """所有平台的 Cookies 响应"""

    platforms: list[PlatformCookies]


class UpdateCookieRequest(BaseModel):
    """更新单个平台 Cookie 的请求"""

    platform: str
    account_name: str
    cookies: str


def read_cookies_from_xlsx(*, require: bool = True) -> dict[str, list[dict]]:
    """从 Excel 文件读取所有平台的 cookies。

    Args:
        require: 为 True 时使用 _get_cookies_config_path()（不可用则 503）；
                 为 False 时使用 _try_get_cookies_config_path()（不可用返回空字典）。
    """
    if require:
        cookies_path = _get_cookies_config_path()
    else:
        cookies_path = _try_get_cookies_config_path()
        if cookies_path is None:
            return {}
    if not cookies_path.exists():
        logger.warning(f"Cookies 配置文件不存在: {cookies_path}")
        return {}

    all_cookies = {}
    try:
        # 读取 Excel 文件中的所有 sheet
        xlsx = pd.ExcelFile(cookies_path, engine="openpyxl")

        for platform in SUPPORTED_PLATFORMS:
            if platform in xlsx.sheet_names:
                df = pd.read_excel(xlsx, sheet_name=platform, engine="openpyxl")
                accounts = []
                for idx, row in df.iterrows():
                    account = {
                        "id": int(row.get("id", idx + 1)) if pd.notna(row.get("id")) else idx + 1,
                        "account_name": str(row.get("account_name", ""))
                        if pd.notna(row.get("account_name"))
                        else "",
                        "cookies": str(row.get("cookies", ""))
                        if pd.notna(row.get("cookies"))
                        else "",
                    }
                    accounts.append(account)
                all_cookies[platform] = accounts
            else:
                # 如果 sheet 不存在，返回空列表
                all_cookies[platform] = []

        xlsx.close()
        return all_cookies
    except Exception as e:
        logger.warning(f"读取 Cookies 配置文件失败（文件可能损坏，将返回空数据）: {e}")
        # 文件损坏时删除并返回空数据，下次保存时会自动重建
        try:
            cookies_path.unlink(missing_ok=True)
            logger.info("已删除损坏的 Cookies 配置文件，下次保存时将自动重建")
        except OSError as del_err:
            logger.warning(f"无法删除损坏的 Cookies 配置文件: {del_err}")
        return {}


def write_cookies_to_xlsx(platform: str, accounts: list[dict]) -> None:
    """将指定平台的 cookies 写入 Excel 文件"""
    cookies_path = _get_cookies_config_path()
    try:
        # 先读取现有数据并关闭文件，避免 Windows 文件锁定冲突
        existing_data: dict[str, pd.DataFrame] = {}
        if cookies_path.exists():
            try:
                xlsx = pd.ExcelFile(cookies_path, engine="openpyxl")
                for p in SUPPORTED_PLATFORMS:
                    if p in xlsx.sheet_names:
                        existing_data[p] = pd.read_excel(xlsx, sheet_name=p, engine="openpyxl")
                xlsx.close()
            except Exception as read_err:
                logger.warning(f"读取现有 Cookies 文件失败，将重新创建: {read_err}")
                existing_data = {}

        # 写入文件（此时文件句柄已完全释放）
        with pd.ExcelWriter(cookies_path, engine="openpyxl") as writer:
            for p in SUPPORTED_PLATFORMS:
                if p == platform:
                    # 更新指定平台的数据
                    df = pd.DataFrame(accounts)
                elif p in existing_data:
                    # 保持其他平台的数据不变
                    df = existing_data[p]
                else:
                    # 创建空的 sheet
                    df = pd.DataFrame(columns=["id", "account_name", "cookies"])
                df.to_excel(writer, sheet_name=p, index=False)

        logger.info(f"成功写入平台 {platform} 的 cookies 配置")
    except Exception as e:
        logger.error(f"写入 Cookies 配置文件失败: {e}")
        raise


@router.get("/cookies", response_model=AllCookiesResponse)
async def get_all_cookies():
    """获取所有平台的 cookies 配置"""
    try:
        all_cookies = read_cookies_from_xlsx(require=False)

        platforms = []
        for platform in SUPPORTED_PLATFORMS:
            accounts = all_cookies.get(platform, [])
            platforms.append(
                PlatformCookies(
                    platform=platform,
                    platform_name=PLATFORM_DISPLAY_NAMES.get(platform, platform),
                    accounts=[CookieAccount(**acc) for acc in accounts],
                )
            )

        return AllCookiesResponse(platforms=platforms)
    except Exception as e:
        logger.error(f"获取 Cookies 配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取 Cookies 配置失败: {e!s}") from e


@router.get("/cookies/{platform}")
async def get_platform_cookies(platform: str):
    """获取指定平台的 cookies 配置"""
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=400, detail=f"不支持的平台: {platform}")

    try:
        all_cookies = read_cookies_from_xlsx(require=False)
        accounts = all_cookies.get(platform, [])

        return {
            "success": True,
            "platform": platform,
            "platform_name": PLATFORM_DISPLAY_NAMES.get(platform, platform),
            "accounts": accounts,
        }
    except Exception as e:
        logger.error(f"获取平台 {platform} 的 Cookies 配置失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取 Cookies 配置失败: {e!s}") from e


@router.post("/cookies/{platform}")
async def update_platform_cookies(platform: str, request: UpdateCookieRequest):
    """更新指定平台的 cookies（单账号模式，会覆盖现有配置）"""
    logger.info(
        f"[Cookies API] 收到更新请求 - 平台: {platform}, 账号: {request.account_name}, cookies长度: {len(request.cookies) if request.cookies else 0}"
    )

    if platform not in SUPPORTED_PLATFORMS:
        logger.error(f"[Cookies API] 不支持的平台: {platform}")
        raise HTTPException(status_code=400, detail=f"不支持的平台: {platform}")

    try:
        # 创建新的账号列表（只保留一个账号）
        accounts = [
            {
                "id": 1,
                "account_name": request.account_name or f"{platform}_account",
                "cookies": request.cookies,
            }
        ]

        logger.info("[Cookies API] 准备写入 cookies 到文件...")
        write_cookies_to_xlsx(platform, accounts)

        logger.info(f"[Cookies API] 更新平台 {platform} 的 cookies 成功")
        return {
            "success": True,
            "message": f"平台 {PLATFORM_DISPLAY_NAMES.get(platform, platform)} 的 Cookies 已更新",
            "platform": platform,
        }
    except Exception as e:
        logger.error(f"[Cookies API] 更新平台 {platform} 的 Cookies 失败: {e}")
        raise HTTPException(status_code=500, detail=f"更新 Cookies 失败: {e!s}") from e


@router.put("/cookies/{platform}")
async def save_platform_cookies(platform: str, accounts: list[CookieAccount]):
    """保存指定平台的所有 cookies（多账号模式）"""
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=400, detail=f"不支持的平台: {platform}")

    try:
        # 转换为字典列表
        accounts_data = []
        for idx, acc in enumerate(accounts):
            accounts_data.append(
                {
                    "id": acc.id or idx + 1,
                    "account_name": acc.account_name,
                    "cookies": acc.cookies,
                }
            )

        write_cookies_to_xlsx(platform, accounts_data)

        logger.info(f"保存平台 {platform} 的 {len(accounts_data)} 个账号 cookies 成功")
        return {
            "success": True,
            "message": f"平台 {PLATFORM_DISPLAY_NAMES.get(platform, platform)} 的 Cookies 已保存",
            "platform": platform,
            "count": len(accounts_data),
        }
    except Exception as e:
        logger.error(f"保存平台 {platform} 的 Cookies 失败: {e}")
        raise HTTPException(status_code=500, detail=f"保存 Cookies 失败: {e!s}") from e


class ExtractKeywordsRequest(BaseModel):
    """提取关键词请求"""

    text: str


class ExtractKeywordsResponse(BaseModel):
    """提取关键词响应"""

    keywords: list[str]
    excluded_keywords: list[str] = []  # 用户不感兴趣的关键词
    original_text: str


@router.post("/extract-keywords", response_model=ExtractKeywordsResponse)
async def extract_keywords_from_text(request: ExtractKeywordsRequest):
    """使用LLM从自然语言中提取搜索关键词

    分析用户输入的自然语言，提取出用户感兴趣的核心关键词和不感兴趣的关键词，
    用于后续的内容搜索和爬取。
    """
    import json

    from llm.llm_client import LLMClient

    try:
        text = request.text.strip()
        if not text:
            return ExtractKeywordsResponse(keywords=[], excluded_keywords=[], original_text="")

        # 初始化LLM客户端
        llm_client = LLMClient()

        if not llm_client.is_available():
            logger.warning("LLM客户端不可用，使用简单分词提取关键词")
            # 简单的备用方案：基于标点符号分割
            import jieba

            words = jieba.lcut(text)
            # 过滤停用词（允许单字关键词，但排除常见虚词）
            stopwords = {
                "的",
                "了",
                "是",
                "在",
                "我",
                "有",
                "和",
                "就",
                "不",
                "人",
                "都",
                "一个",
                "上",
                "也",
                "很",
                "到",
                "说",
                "要",
                "去",
                "你",
                "会",
                "着",
                "没有",
                "看",
                "好",
                "自己",
                "这",
                "那",
                "什么",
                "想",
                "知道",
                "些",
                "吗",
                "吧",
                "呢",
                "啊",
                "哦",
                "嗯",
                "对",
                "把",
                "被",
                "让",
                "给",
                "从",
                "向",
                "跟",
                "比",
                "为",
                "因",
                "而",
                "但",
                "或",
                "与",
                "及",
                "等",
                "即",
                "如",
                "若",
                "虽",
                "既",
                "所",
                "者",
                "之",
                "其",
                "此",
                "彼",
                "信息",
                "内容",
                "资料",
                "方法",
                "技巧",
                "推荐",
                "教程",
                "攻略",
                "分享",
                "了解",
                "怎么",
                "如何",
                "关于",
                "有关",
            }
            keywords = [w for w in words if len(w) >= 1 and w not in stopwords][:5]
            return ExtractKeywordsResponse(
                keywords=keywords, excluded_keywords=[], original_text=text
            )

        # 构建提示词
        messages = [
            {
                "role": "system",
                "content": """你是一个关键词提取专家。你的任务是从用户输入的自然语言中提取出两类关键词：
1. 用户感兴趣的关键词（interested）：用户想要搜索或了解的内容
2. 用户不感兴趣的关键词（excluded）：用户明确表示不想要、排除、不喜欢的内容

【重要规则】
1. 只提取有实际搜索价值的关键词，每类通常是1-3个
2. 优先提取：人名、地名、品牌名、产品名、事件名、专业术语、具体事物
3. 绝对不要提取这些无意义的泛词：信息、内容、资料、方法、技巧、推荐、教程、攻略、分享、了解、知道、什么、怎么、如何
4. 识别否定词和排除意图：不要、不想、排除、除了、不喜欢、不包括、别、不需要、不考虑
5. 输出JSON格式，必须严格按照格式输出，不要有任何其他内容

【示例】
用户输入："我想了解有关周杰伦的信息"
输出：{"interested": ["周杰伦"], "excluded": []}

用户输入："我想知道怎么学习Python，但不要太基础的入门教程"
输出：{"interested": ["Python"], "excluded": ["入门"]}

用户输入："推荐一些好看的韩剧，不要悲剧结尾的"
输出：{"interested": ["韩剧"], "excluded": ["悲剧"]}

用户输入："我想了解护肤品，特别是美白的，但不要含酒精的产品"
输出：{"interested": ["护肤品", "美白"], "excluded": ["酒精"]}

用户输入："北京有什么好吃的火锅店，不要太辣的，也不要连锁店"
输出：{"interested": ["北京", "火锅"], "excluded": ["辣", "连锁店"]}

用户输入："我想了解周杰伦和林俊杰，但不要汪苏泷"
输出：{"interested": ["周杰伦", "林俊杰"], "excluded": ["汪苏泷"]}""",
            },
            {"role": "user", "content": f"请从以下内容中提取感兴趣和不感兴趣的关键词：\n{text}"},
        ]

        # 调用LLM
        response = llm_client.chat(messages, temperature=0.3, max_tokens=200)

        # 解析JSON响应
        response_text = response.strip()

        # 尝试提取JSON部分
        try:
            # 如果响应包含JSON，尝试解析
            if "{" in response_text and "}" in response_text:
                json_start = response_text.find("{")
                json_end = response_text.rfind("}") + 1
                json_str = response_text[json_start:json_end]
                result = json.loads(json_str)
                keywords = result.get("interested", [])
                excluded_keywords = result.get("excluded", [])
            else:
                # 兼容旧格式：如果不是JSON，按逗号分割作为感兴趣的关键词
                keywords = [
                    k.strip() for k in response_text.replace("，", ",").split(",") if k.strip()
                ]
                excluded_keywords = []
        except json.JSONDecodeError:
            # JSON解析失败，使用旧格式
            keywords = [k.strip() for k in response_text.replace("，", ",").split(",") if k.strip()]
            excluded_keywords = []

        # 确保是列表类型
        if isinstance(keywords, str):
            keywords = [keywords]
        if isinstance(excluded_keywords, str):
            excluded_keywords = [excluded_keywords]

        # 限制关键词数量
        keywords = keywords[:5]
        excluded_keywords = excluded_keywords[:5]

        logger.info(
            f"从文本提取关键词: {text[:50]}... -> 感兴趣: {keywords}, 不感兴趣: {excluded_keywords}"
        )

        return ExtractKeywordsResponse(
            keywords=keywords, excluded_keywords=excluded_keywords, original_text=text
        )

    except Exception as e:
        logger.warning(f"LLM提取关键词失败: {e}，使用备用正则方案")

        # 备用方案：使用正则表达式提取关键词
        keywords = []
        excluded_keywords = []

        # 注意：使用 [^对，,不]+ 来避免跨越多个短语匹配
        # 先匹配"不感兴趣"的模式（更长的模式优先）
        excluded_patterns = [
            r"对([^对，,不]+)不感兴趣",
            r"不喜欢([^，,。！]+)",
            r"不要([^，,。！]+)",
            r"排除([^，,。！]+)",
        ]
        for pattern in excluded_patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                clean = match.strip().rstrip("的了吗呢啊哦")
                if clean and len(clean) <= 10 and clean:
                    excluded_keywords.append(clean)

        # 再匹配"感兴趣"的模式
        # 使用 [^对，,]+ 避免跨越"对"字或逗号
        interested_patterns = [
            r"对([^对，,]+)感兴趣",
            r"喜欢([^，,。！不]+)",
            r"想(?:了解|知道|看|搜)([^，,。！]+)",
            r"关于([^，,。！的]+)",
        ]
        for pattern in interested_patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                # 清理匹配结果
                clean = match.strip().rstrip("的了吗呢啊哦")
                if clean and len(clean) <= 10:
                    keywords.append(clean)

        # 去重并限制数量
        keywords = list(dict.fromkeys(keywords))[:5]
        excluded_keywords = list(dict.fromkeys(excluded_keywords))[:5]

        # 如果正则也提取不到，使用分词方法
        if not keywords:
            import jieba

            words = list(jieba.cut(text))
            stopwords = {
                "的",
                "了",
                "是",
                "在",
                "我",
                "有",
                "和",
                "就",
                "不",
                "人",
                "都",
                "一个",
                "上",
                "也",
                "很",
                "到",
                "说",
                "要",
                "去",
                "你",
                "会",
                "着",
                "没有",
                "看",
                "好",
                "自己",
                "这",
                "那",
                "什么",
                "想",
                "知道",
                "些",
                "吗",
                "吧",
                "呢",
                "啊",
                "哦",
                "嗯",
                "对",
                "把",
                "被",
                "让",
                "给",
                "从",
                "向",
                "跟",
                "比",
                "为",
                "因",
                "而",
                "但",
                "或",
                "与",
                "及",
                "等",
                "即",
                "如",
                "若",
                "虽",
                "既",
                "所",
                "者",
                "之",
                "其",
                "此",
                "彼",
                "感兴趣",
                "不感兴趣",
                "喜欢",
                "不喜欢",
            }
            keywords = [w for w in words if len(w) >= 1 and w not in stopwords][:3]

        logger.info(
            f"备用方案提取关键词: {text[:50]}... -> 感兴趣: {keywords}, 不感兴趣: {excluded_keywords}"
        )

        return ExtractKeywordsResponse(
            keywords=keywords, excluded_keywords=excluded_keywords, original_text=text
        )


# ============== 爬虫进程管理 ==============


def is_sign_srv_running() -> bool:
    """检查签名服务是否在运行"""
    global _sign_srv_process

    # 首先检查进程变量
    if _sign_srv_process is not None and _sign_srv_process.poll() is None:
        return True

    # 如果进程变量为空，检查端口 8989 是否被占用（可能是之前启动的服务还在运行）
    import socket

    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            result = s.connect_ex(("127.0.0.1", 8989))
            if result == 0:
                logger.info("签名服务正在正常运行（端口 8989）")
                return True
    except Exception:
        pass

    return False


def is_crawler_running() -> bool:
    """检查爬虫是否在运行"""
    global _crawler_process
    if _crawler_process is None:
        return False
    return _crawler_process.poll() is None


def start_sign_service() -> bool:
    """启动签名服务"""
    global _sign_srv_process

    if is_sign_srv_running():
        logger.info("签名服务已在运行")
        return True

    try:
        sign_srv_dir = _get_sign_srv_dir()

        # 检查目录是否存在
        if not sign_srv_dir.exists():
            logger.error(f"签名服务目录不存在: {sign_srv_dir}")
            return False

        # 获取 venv 的 Python 路径
        if sys.platform == "win32":
            python_exe = sign_srv_dir / ".venv" / "Scripts" / "python.exe"
        else:
            python_exe = sign_srv_dir / ".venv" / "bin" / "python"

        if not python_exe.exists():
            logger.error(
                f"SignSrv 虚拟环境 Python 不存在: {python_exe}，请先创建虚拟环境并安装依赖"
            )
            return False

        # 读取 pyvenv.cfg 获取 conda 环境的基础路径
        # Windows: .venv 是基于 MediaCrawlerPro conda 环境创建的，
        # 需要把 conda 环境的路径添加到 PATH 中，以便能找到底层 DLL（如 OpenSSL）
        env = os.environ.copy()
        # 设置 UTF-8 编码，避免 Windows GBK 编码导致的 UnicodeEncodeError
        env["PYTHONIOENCODING"] = "utf-8"
        if sys.platform == "win32":
            pyvenv_cfg = sign_srv_dir / ".venv" / "pyvenv.cfg"
            conda_base = None
            if pyvenv_cfg.exists():
                with open(pyvenv_cfg) as f:
                    for line in f:
                        if line.startswith("home = "):
                            conda_base = line.split("=", 1)[1].strip()
                            break

            if conda_base:
                # 添加 conda 环境的路径到 PATH（这些路径在 conda activate 时会被添加）
                conda_paths = [
                    conda_base,
                    os.path.join(conda_base, "Library", "mingw-w64", "bin"),
                    os.path.join(conda_base, "Library", "usr", "bin"),
                    os.path.join(conda_base, "Library", "bin"),
                    os.path.join(conda_base, "Scripts"),
                    os.path.join(conda_base, "bin"),
                ]
                existing_path = env.get("PATH", "")
                env["PATH"] = ";".join(conda_paths) + ";" + existing_path
                logger.info(f"添加 conda 环境路径到 PATH: {conda_base}")

        # 启动签名服务
        logger.info(f"启动签名服务: {sign_srv_dir}，使用 Python: {python_exe}")
        _sign_srv_process = subprocess.Popen(
            [str(python_exe), "app.py"],
            cwd=str(sign_srv_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
        )

        # 等待一小段时间确保服务启动
        import time

        time.sleep(2)

        if _sign_srv_process.poll() is not None:
            # 进程已退出，读取错误信息
            _, stderr = _sign_srv_process.communicate()
            logger.error(f"签名服务启动失败: {stderr.decode('utf-8', errors='ignore')}")
            return False

        logger.info("签名服务启动成功")
        return True
    except Exception as e:
        logger.error(f"启动签名服务失败: {e}")
        return False


def start_crawler_process(platform: str, crawler_type: str) -> bool:
    """启动爬虫进程"""
    global _crawler_process, _crawler_status

    if is_crawler_running():
        logger.info("爬虫已在运行")
        return True

    try:
        crawler_dir = _get_crawler_dir()

        # 检查目录是否存在
        if not crawler_dir.exists():
            logger.error(f"爬虫目录不存在: {crawler_dir}")
            return False

        # 使用 MediaCrawlerPro-Python 项目自己的虚拟环境中的 Python 解释器
        if sys.platform == "win32":
            python_exe = crawler_dir / ".venv" / "Scripts" / "python.exe"
        else:
            python_exe = crawler_dir / ".venv" / "bin" / "python"

        if not python_exe.exists():
            logger.error(f"爬虫虚拟环境 Python 不存在: {python_exe}，请先创建虚拟环境并安装依赖")
            return False

        # 规范化平台名称（例如：douyin -> dy）
        normalized_platform = normalize_platform_name(platform)
        if normalized_platform != platform:
            logger.info(f"平台名称已规范化: {platform} -> {normalized_platform}")

        # 构建命令
        cmd = [
            str(python_exe),
            "main.py",
            "--platform",
            normalized_platform,
            "--type",
            crawler_type,
        ]

        # 设置 UTF-8 编码，避免 Windows GBK 编码导致的 UnicodeEncodeError
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"

        logger.info(f"启动爬虫: {' '.join(cmd)} in {crawler_dir}")

        # 将爬虫输出重定向到日志文件，避免 PIPE 缓冲区满导致阻塞
        crawler_log_file = crawler_dir / "logs" / "crawler_output.log"
        crawler_log_file.parent.mkdir(parents=True, exist_ok=True)

        with open(crawler_log_file, "a", encoding="utf-8") as log_file:
            log_file.write(f"\n{'=' * 50}\n")
            log_file.write(f"启动时间: {__import__('datetime').datetime.now()}\n")
            log_file.write(f"命令: {' '.join(cmd)}\n")
            log_file.write(f"{'=' * 50}\n")

        _crawler_process = subprocess.Popen(
            cmd,
            cwd=str(crawler_dir),
            stdout=open(crawler_log_file, "a", encoding="utf-8"),
            stderr=subprocess.STDOUT,  # 合并 stderr 到 stdout
            env=env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
        )

        _crawler_status = "running"
        logger.info("爬虫启动成功")
        return True
    except Exception as e:
        logger.error(f"启动爬虫失败: {e}")
        _crawler_status = "error"
        return False


def stop_sign_service() -> bool:
    """停止签名服务"""
    global _sign_srv_process

    if not is_sign_srv_running():
        logger.info("签名服务未运行")
        return True

    try:
        if sys.platform == "win32":
            _sign_srv_process.terminate()
        else:
            _sign_srv_process.terminate()

        _sign_srv_process.wait(timeout=5)
        _sign_srv_process = None
        logger.info("签名服务已停止")
        return True
    except Exception as e:
        logger.error(f"停止签名服务失败: {e}")
        # 强制终止
        try:
            _sign_srv_process.kill()
            _sign_srv_process = None
        except:
            pass
        return False


def stop_crawler_process() -> bool:
    """停止爬虫进程"""
    global _crawler_process, _crawler_status

    if not is_crawler_running():
        logger.info("爬虫未运行")
        _crawler_status = "idle"
        return True

    try:
        _crawler_status = "stopping"

        if sys.platform == "win32":
            _crawler_process.terminate()
        else:
            _crawler_process.terminate()

        _crawler_process.wait(timeout=10)
        _crawler_process = None
        _crawler_status = "idle"
        logger.info("爬虫已停止")
        return True
    except Exception as e:
        logger.error(f"停止爬虫失败: {e}")
        # 强制终止
        try:
            _crawler_process.kill()
            _crawler_process = None
            _crawler_status = "idle"
        except:
            pass
        return False


@router.get("/status")
async def get_crawler_status():
    """获取爬虫状态"""
    global \
        _crawler_status, \
        _stop_loop_flag, \
        _current_platform_index, \
        _loop_crawler_task, \
        _excluded_keywords

    # 检查循环任务是否在运行
    loop_task_running = _loop_crawler_task is not None and not _loop_crawler_task.done()

    # 更新状态：如果循环任务还在运行，保持 running 状态
    if _crawler_status == "running" and not is_crawler_running() and not loop_task_running:
        _crawler_status = "idle"

    # 插件可用性检查（不抛异常，只返回状态）
    plugin_available = _plugin.is_available()
    plugin_installed = _plugin.is_installed()
    plugin_mode = (
        "plugin"
        if plugin_installed
        else ("dev" if _plugin.resolve_crawler_dir() is not None else "none")
    )

    return {
        "status": _crawler_status,
        "sign_srv_running": is_sign_srv_running(),
        "crawler_running": is_crawler_running(),
        # 插件状态
        "plugin_installed": plugin_installed,
        "plugin_available": plugin_available,
        "plugin_mode": plugin_mode,  # "plugin" | "dev" | "none"
        # 循环爬取相关状态
        "loop_mode": loop_task_running,  # 是否处于循环爬取模式
        "loop_stopped": _stop_loop_flag,  # 是否收到停止信号
        "current_platform_index": _current_platform_index,  # 当前爬取的平台索引
        "excluded_keywords": _excluded_keywords,  # 当前的排除关键词
    }


@router.post("/start")
async def start_crawler(data: dict[str, Any] | None = None):
    """启动爬虫（先启动签名服务，再启动爬虫，支持多平台循环轮询爬取）

    多平台循环爬取模式：
    - 每个平台爬取1条内容后切换到下一个平台
    - 循环进行，直到用户点击停止按钮
    - 支持排除关键词过滤
    """
    global \
        _crawler_status, \
        _stop_loop_flag, \
        _loop_crawler_task, \
        _current_platform_index, \
        _excluded_keywords

    try:
        _crawler_status = "starting"
        _stop_loop_flag = False  # 重置停止标志
        _current_platform_index = 0  # 重置平台索引

        # 从配置文件读取平台和爬取类型
        content = read_config_file()

        # 支持多平台：优先使用请求中的 platforms 数组，否则从配置文件读取
        platforms = data.get("platforms") if data else None
        if not platforms:
            # 优先从 PLATFORMS 配置读取（多平台）
            platforms_str = extract_config_value(content, "PLATFORMS", "str") or ""
            if platforms_str:
                platforms = [p.strip() for p in platforms_str.split(",") if p.strip()]

            # 如果还是没有，尝试从单平台配置读取
            if not platforms:
                platform = data.get("platform") if data else None
                if not platform:
                    platform = extract_config_value(content, "PLATFORM", "str") or "xhs"
                platforms = [platform]

        crawler_type = data.get("crawler_type") if data else None
        if not crawler_type:
            crawler_type = extract_config_value(content, "CRAWLER_TYPE", "str") or "search"

        # 获取排除关键词（从请求参数中获取）
        excluded_keywords = data.get("excluded_keywords") if data else None
        if excluded_keywords:
            _excluded_keywords = (
                excluded_keywords if isinstance(excluded_keywords, list) else [excluded_keywords]
            )
            logger.info(f"设置排除关键词: {_excluded_keywords}")
        else:
            _excluded_keywords = []

        # 保存用户选择的平台配置到文件（用于重启后恢复）
        if platforms:
            platforms_str = ",".join(platforms)
            content = update_config_value(content, "PLATFORMS", platforms_str, "str")
            if platforms:
                content = update_config_value(content, "PLATFORM", platforms[0], "str")
            write_config_file(content)
            logger.info(f"保存平台配置: {platforms}")

        logger.info(
            f"准备启动循环爬虫 - 平台: {platforms}, 类型: {crawler_type}, 排除关键词: {_excluded_keywords}"
        )

        # 1. 启动签名服务（卸载到线程池避免 time.sleep 阻塞事件循环）
        if not await asyncio.to_thread(start_sign_service):
            _crawler_status = "error"
            return {"success": False, "error": "启动签名服务失败"}

        # 等待签名服务完全启动
        await asyncio.sleep(3)

        # 2. 启动循环爬取任务
        _loop_crawler_task = asyncio.create_task(loop_crawl_platforms(platforms, crawler_type))

        return {
            "success": True,
            "message": f"循环爬虫启动成功，将轮流爬取 {len(platforms)} 个平台，直到手动停止",
            "platforms": platforms,
            "crawler_type": crawler_type,
            "excluded_keywords": _excluded_keywords,
            "mode": "loop",  # 标识循环爬取模式
        }
    except Exception as e:
        logger.error(f"启动爬虫失败: {e}")
        _crawler_status = "error"
        raise HTTPException(status_code=500, detail=f"启动爬虫失败: {e!s}") from e


# 所有平台的固定爬取顺序：小红书 → 抖音 → 哔哩哔哩 → 微博 → 快手 → 知乎 → 贴吧
ALL_PLATFORMS_CRAWL_ORDER = ["xhs", "douyin", "bilibili", "weibo", "kuaishou", "zhihu", "tieba"]


async def loop_crawl_platforms(platforms: list[str], crawler_type: str):
    """循环爬取多个平台（核心循环逻辑）

    流程：
    1. 如果选择了所有平台，按固定顺序爬取：小红书 → 抖音 → 哔哩哔哩 → 微博 → 快手 → 知乎 → 贴吧
    2. 每个平台之间随机间隔 3-5 秒
    3. 完成一轮所有平台的爬取后，随机等待 50-70 分钟
    4. 重复步骤1-3，直到用户手动点击停止按钮

    容错机制：
    - 如果某个平台启动失败，跳过该平台继续下一个
    - 如果某个平台爬取超时，强制终止并跳过
    - 记录每个平台的连续失败次数，失败过多时临时跳过
    """
    global _crawler_status, _stop_loop_flag, _current_platform_index

    _crawler_status = "running"

    import random as _random

    # 判断是否选择了所有平台，如果是则按固定顺序爬取
    all_platforms_set = set(ALL_PLATFORMS_CRAWL_ORDER)
    selected_platforms_set = set(platforms)

    if selected_platforms_set >= all_platforms_set or len(platforms) >= 7:
        # 用户选择了所有平台，使用固定顺序
        ordered_platforms = ALL_PLATFORMS_CRAWL_ORDER.copy()
        logger.info(f"[循环爬取] 检测到选择了所有平台，使用固定顺序: {ordered_platforms}")
    else:
        # 用户只选择了部分平台，保持用户选择的顺序
        ordered_platforms = platforms
        logger.info(f"[循环爬取] 使用用户选择的平台顺序: {ordered_platforms}")

    platform_count = len(ordered_platforms)

    # 平台间隔时间（3-5秒随机）
    PLATFORM_INTERVAL_MIN = 3
    PLATFORM_INTERVAL_MAX = 5

    # 每个平台的最大等待时间（秒），超过这个时间认为爬取失败/卡住
    MAX_CRAWL_TIMEOUT = 120  # 2分钟超时

    # 每轮爬取之间的等待时间（50-70分钟随机，单位：秒）
    ROUND_INTERVAL_MIN = 50 * 60  # 50分钟 = 3000秒
    ROUND_INTERVAL_MAX = 70 * 60  # 70分钟 = 4200秒

    # 记录每个平台的连续失败次数
    platform_fail_counts: dict[str, int] = dict.fromkeys(ordered_platforms, 0)
    MAX_CONSECUTIVE_FAILS = 3  # 连续失败3次则临时跳过该平台一轮

    logger.info(
        f"[循环爬取] 开始循环爬取 {platform_count} 个平台，平台间隔 {PLATFORM_INTERVAL_MIN}-{PLATFORM_INTERVAL_MAX} 秒随机，每轮间隔 {ROUND_INTERVAL_MIN // 60}-{ROUND_INTERVAL_MAX // 60} 分钟随机，超时 {MAX_CRAWL_TIMEOUT} 秒"
    )

    round_count = 0  # 轮次计数
    total_success_count = 0  # 总成功计数
    total_fail_count = 0  # 总失败计数

    while not _stop_loop_flag:
        round_count += 1
        round_success_count = 0  # 本轮成功计数
        round_fail_count = 0  # 本轮失败计数

        logger.info(
            f"[循环爬取] ========== 开始第 {round_count} 轮爬取，共 {platform_count} 个平台 =========="
        )
        logger.info(f"[循环爬取] 平台顺序: {' → '.join(ordered_platforms)}")

        # 依次爬取所有平台（按固定顺序）
        for platform_index, current_platform in enumerate(ordered_platforms):
            if _stop_loop_flag:
                logger.info("[循环爬取] 收到停止信号，退出循环")
                break

            _current_platform_index = platform_index

            logger.info(
                f"[循环爬取] 第 {round_count} 轮 - 平台 {platform_index + 1}/{platform_count}: {current_platform}"
            )

            # 检查该平台是否连续失败过多次
            if platform_fail_counts[current_platform] >= MAX_CONSECUTIVE_FAILS:
                logger.warning(
                    f"[循环爬取] 平台 {current_platform} 连续失败 {platform_fail_counts[current_platform]} 次，本轮跳过"
                )
                # 重置失败计数（给平台一个恢复的机会）
                platform_fail_counts[current_platform] = 0
                continue

            try:
                # 启动当前平台的爬虫
                if not start_crawler_process(current_platform, crawler_type):
                    logger.error(f"[循环爬取] 启动平台 {current_platform} 爬虫失败，跳过")
                    platform_fail_counts[current_platform] += 1
                    round_fail_count += 1
                    continue

                # 等待爬虫完成（带超时）
                wait_time = 0
                while (
                    is_crawler_running() and not _stop_loop_flag and wait_time < MAX_CRAWL_TIMEOUT
                ):
                    await asyncio.sleep(1)
                    wait_time += 1

                # 检查是否需要停止
                if _stop_loop_flag:
                    logger.info("[循环爬取] 收到停止信号，退出循环")
                    break

                # 检查是否超时
                if wait_time >= MAX_CRAWL_TIMEOUT and is_crawler_running():
                    logger.warning(
                        f"[循环爬取] 平台 {current_platform} 爬取超时（{MAX_CRAWL_TIMEOUT}秒），强制终止"
                    )
                    stop_crawler_process()  # 强制停止当前爬虫
                    platform_fail_counts[current_platform] += 1
                    round_fail_count += 1
                else:
                    # 爬取成功完成
                    platform_fail_counts[current_platform] = 0  # 重置失败计数
                    round_success_count += 1
                    logger.info(f"[循环爬取] 平台 {current_platform} 爬取完成")

            except Exception as e:
                logger.error(f"[循环爬取] 平台 {current_platform} 爬取异常: {e}")
                platform_fail_counts[current_platform] += 1
                round_fail_count += 1
                # 确保爬虫进程被终止
                try:
                    stop_crawler_process()
                except:
                    pass

            # 如果不是最后一个平台，等待间隔时间再爬取下一个
            if platform_index < platform_count - 1 and not _stop_loop_flag:
                # 生成 10-15 秒的随机间隔
                platform_interval = _random.randint(PLATFORM_INTERVAL_MIN, PLATFORM_INTERVAL_MAX)
                logger.info(f"[循环爬取] 等待 {platform_interval} 秒后爬取下一个平台...")
                # 分段等待，以便能快速响应停止信号
                wait_time = 0
                while wait_time < platform_interval and not _stop_loop_flag:
                    await asyncio.sleep(1)
                    wait_time += 1

        # 更新总计数
        total_success_count += round_success_count
        total_fail_count += round_fail_count

        # 检查是否需要停止
        if _stop_loop_flag:
            break

        # 本轮完成，等待 50-70 分钟后开始下一轮
        logger.info(f"[循环爬取] ========== 第 {round_count} 轮爬取完成 ==========")
        logger.info(
            f"[循环爬取] 本轮结果: 成功 {round_success_count} 次, 失败 {round_fail_count} 次"
        )
        logger.info(
            f"[循环爬取] 累计结果: 成功 {total_success_count} 次, 失败 {total_fail_count} 次"
        )

        # 每轮生成一个随机等待时间（50-70分钟）
        round_interval = _random.randint(ROUND_INTERVAL_MIN, ROUND_INTERVAL_MAX)
        round_interval_minutes = round_interval // 60
        logger.info(
            f"[循环爬取] 等待 {round_interval_minutes} 分钟（约 {round_interval} 秒）后开始第 {round_count + 1} 轮爬取..."
        )

        # 分段等待，以便能快速响应停止信号
        wait_time = 0
        while wait_time < round_interval and not _stop_loop_flag:
            await asyncio.sleep(5)  # 每5秒检查一次停止信号
            wait_time += 5

    _crawler_status = "idle"
    logger.info(
        f"[循环爬取] 循环爬取已停止，共完成 {round_count} 轮，累计成功 {total_success_count} 次，失败 {total_fail_count} 次"
    )


@router.post("/stop")
async def stop_crawler():
    """停止爬虫（包括停止循环爬取）"""
    global _crawler_status, _stop_loop_flag, _loop_crawler_task

    try:
        _crawler_status = "stopping"

        # 设置停止标志，停止循环爬取
        _stop_loop_flag = True
        logger.info("[停止爬虫] 设置停止标志，正在停止循环爬取...")

        # 停止当前正在运行的爬虫进程
        stop_crawler_process()

        # 等待循环爬取任务结束
        if _loop_crawler_task and not _loop_crawler_task.done():
            try:
                # 给循环任务一些时间来响应停止信号
                await asyncio.wait_for(asyncio.shield(_loop_crawler_task), timeout=5.0)
            except TimeoutError:
                logger.warning("[停止爬虫] 循环任务未能在5秒内停止，取消任务")
                _loop_crawler_task.cancel()
            except asyncio.CancelledError:
                pass

        _crawler_status = "idle"
        logger.info("[停止爬虫] 爬虫已完全停止")

        # 注意：不停止签名服务，因为可能还需要使用

        return {"success": True, "message": "爬虫已停止"}
    except Exception as e:
        logger.error(f"停止爬虫失败: {e}")
        _crawler_status = "idle"  # 确保状态重置
        raise HTTPException(status_code=500, detail=f"停止爬虫失败: {e!s}") from e


@router.post("/stop-all")
async def stop_all():
    """停止所有服务（爬虫和签名服务）"""
    try:
        stop_crawler_process()
        stop_sign_service()
        return {"success": True, "message": "所有服务已停止"}
    except Exception as e:
        logger.error(f"停止服务失败: {e}")
        raise HTTPException(status_code=500, detail=f"停止服务失败: {e!s}") from e


# ============== 爬取结果管理 ==============


def get_platform_data_dir(platform: str, *, require: bool = True) -> Path | None:
    """获取平台数据目录

    注意：数据目录名称取决于配置文件中的 PLATFORM 值，
    例如 PLATFORM = "douyin" 会创建 data/douyin/ 目录，
    所以这里不需要规范化平台名称。

    Args:
        require: 为 True 时插件不可用则 503；为 False 时返回 None。
    """
    if require:
        return _get_crawler_dir() / "data" / platform
    d = _try_get_crawler_dir()
    return d / "data" / platform if d else None


def parse_count_value(value: str | None) -> int:
    """解析数值，处理 '10万+' 等格式"""
    if not value or value == "":
        return 0
    try:
        value = str(value).strip()
        if "万+" in value:
            return int(float(value.replace("万+", "")) * 10000)
        if "万" in value:
            return int(float(value.replace("万", "")) * 10000)
        return int(float(value))
    except (ValueError, TypeError):
        return 0


def read_csv_file(file_path: Path) -> list[dict]:
    """读取CSV文件"""
    if not file_path.exists():
        return []

    results = []
    try:
        with open(file_path, encoding="utf-8-sig") as f:  # 使用 utf-8-sig 自动处理 BOM
            reader = csv.DictReader(f)
            # 调试：打印列名
            if reader.fieldnames:
                logger.info(f"[CSV] 文件 {file_path.name} 的列名: {reader.fieldnames}")
            for row in reader:
                results.append(dict(row))
    except Exception as e:
        logger.error(f"读取CSV文件失败 {file_path}: {e}")

    return results


# 不同平台的字段映射（平台字段 -> 统一字段）
# 注意：由于不同平台可能有相同的字段名但含义不同，复杂映射在 normalize_content_item 中处理
PLATFORM_FIELD_MAPPING = {
    # 抖音字段映射
    "aweme_id": "note_id",
    "aweme_url": "note_url",
    "cover_url": "image_list",
    "aweme_type": "type",
    # 注意：video_download_url 保持原样，不做映射
    # 通用字段映射
    "video_play_url": "video_download_url",  # 快手的实际视频播放地址
    "video_cover_url": "image_list",
    # 小红书和其他平台的字段已经是标准格式
}


def normalize_content_item(item: dict, platform: str) -> dict:
    """将不同平台的内容数据规范化为统一格式"""
    normalized = {}

    for key, value in item.items():
        # 如果字段需要映射，则使用映射后的名称
        normalized_key = PLATFORM_FIELD_MAPPING.get(key, key)
        normalized[normalized_key] = value

    # ===== 平台特殊处理 =====

    # 抖音特殊处理
    if platform in ["douyin", "dy"]:
        if normalized.get("type") == "0":
            normalized["type"] = "video"

    # 快手特殊处理
    elif platform in ["kuaishou", "ks"]:
        # video_id -> note_id, video_url -> note_url
        if "video_id" in item:
            normalized["note_id"] = item["video_id"]
        if "video_url" in item:
            normalized["note_url"] = item["video_url"]
        if "video_type" in item:
            normalized["type"] = "video" if item["video_type"] == "1" else item["video_type"]
        if "viewd_count" in item:
            normalized["share_count"] = item["viewd_count"]

    # B站特殊处理
    elif platform in ["bilibili", "bili"]:
        # bvid 作为 note_id，video_url 作为 note_url
        if "bvid" in item:
            normalized["note_id"] = item["bvid"]
        if "video_url" in item:
            normalized["note_url"] = item["video_url"]
        # 保留原始 video_id 用于评论匹配
        if "video_id" in item:
            normalized["video_id"] = str(item["video_id"])
        # B站视频默认都是视频类型
        normalized["type"] = "video"
        # B站的统计数据映射
        if "video_play_count" in item:
            normalized["share_count"] = item["video_play_count"]  # 用播放量替代分享数
        if "video_comment" in item:
            normalized["comment_count"] = item["video_comment"]

    # 知乎特殊处理
    elif platform in ["zhihu"]:
        # content_id 作为 note_id，同时保留原始 content_id 用于评论匹配
        if "content_id" in item:
            normalized["note_id"] = str(item["content_id"])
            normalized["content_id"] = str(item["content_id"])  # 保留用于评论匹配
        if "content_url" in item:
            normalized["note_url"] = item["content_url"]
        # 知乎的内容类型：answer（回答）、article（文章）
        if "content_type" in item:
            normalized["type"] = item["content_type"]
        # 用户信息映射
        if "user_avatar" in item:
            normalized["avatar"] = item["user_avatar"]
        if "user_nickname" in item:
            normalized["nickname"] = item["user_nickname"]
        if "user_id" in item:
            normalized["user_id"] = item["user_id"]
        # 统计数据映射
        if "voteup_count" in item:
            normalized["liked_count"] = item["voteup_count"]
        if "created_time" in item:
            normalized["time"] = item["created_time"]
        # 知乎主要是图文内容，没有视频
        # 但知乎回答可能包含图片，目前 CSV 没有图片字段

    # 微博特殊处理
    elif platform in ["weibo", "wb"]:
        # 微博的 content 字段映射到 desc（前端需要 title 或 desc 才能显示）
        if "content" in item:
            normalized["desc"] = item["content"]
        # 清理头像 URL 中的引号（CSV 解析可能带入引号）
        if normalized.get("avatar"):
            avatar = normalized["avatar"]
            if isinstance(avatar, str):
                # 移除首尾引号
                normalized["avatar"] = avatar.strip('"').strip("'")
        # 清理图片列表中的引号
        if normalized.get("image_list"):
            image_list = normalized["image_list"]
            if isinstance(image_list, str):
                normalized["image_list"] = image_list.strip('"').strip("'")
        # 微博时间字段映射
        if "create_date_time" in item:
            normalized["time"] = item["create_date_time"]
        # 微博统计数据映射
        if "liked_count" in item:
            normalized["liked_count"] = item["liked_count"]
        if "comments_count" in item:
            normalized["comment_count"] = item["comments_count"]
        if "shared_count" in item:
            normalized["share_count"] = item["shared_count"]

    # 贴吧特殊处理
    elif platform in ["tieba"]:
        # 用户信息映射
        if "user_avatar" in item:
            normalized["avatar"] = item["user_avatar"]
        if "user_nickname" in item:
            normalized["nickname"] = item["user_nickname"]
        # 贴吧统计数据映射
        if "total_replay_num" in item:
            normalized["comment_count"] = item["total_replay_num"]
        # 时间字段映射
        if "publish_time" in item:
            normalized["time"] = item["publish_time"]

    # 确保 video_url 有值（抖音的 video_download_url 同时作为 video_url）
    if not normalized.get("video_url") and normalized.get("video_download_url"):
        normalized["video_url"] = normalized["video_download_url"]

    return normalized


def normalize_comment_item(item: dict, platform: str) -> dict:
    """将不同平台的评论数据规范化为统一格式"""
    normalized = {}

    for key, value in item.items():
        # 如果字段需要映射，则使用映射后的名称
        normalized_key = PLATFORM_FIELD_MAPPING.get(key, key)
        normalized[normalized_key] = value

    return normalized


def find_latest_data_files(
    platform: str, keyword: str | None = None
) -> tuple[Path | None, Path | None]:
    """查找最新的数据文件

    Returns:
        tuple: (contents_file, comments_file)
    """
    data_dir = get_platform_data_dir(platform, require=False)
    if data_dir is None or not data_dir.exists():
        return None, None

    # 查找所有 contents 文件（支持带前缀和不带前缀两种格式）
    # 格式1: 1_search_contents_2026-01-20.csv（大多数平台）
    # 格式2: search_contents_2026-01-20.csv（微博等）
    content_files = list(data_dir.glob("*search_contents_*.csv"))

    if not content_files:
        return None, None

    # 按修改时间排序，获取最新的文件
    content_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    latest_content = content_files[0]

    # 根据内容文件名找到对应的评论文件
    # 文件名格式: {index}_search_contents_{date}.csv -> {index}_search_comments_{date}.csv
    comment_filename = latest_content.name.replace("_contents_", "_comments_")
    latest_comments = data_dir / comment_filename

    if not latest_comments.exists():
        latest_comments = None
        logger.warning(f"未找到与 {latest_content.name} 配对的评论文件: {comment_filename}")

    return latest_content, latest_comments


def find_recent_data_files(platform: str, days: int = 2) -> list[tuple[Path, Path | None]]:
    """查找最近几天的数据文件（用于热点速递）

    Args:
        platform: 平台名称
        days: 查找最近几天的数据，默认2天（今天和昨天）

    Returns:
        list: [(contents_file, comments_file), ...]，按日期从新到旧排序
    """
    from datetime import timedelta

    data_dir = get_platform_data_dir(platform, require=False)
    if data_dir is None:
        return []
    logger.info(f"[find_recent_data_files] 平台: {platform}, 数据目录: {data_dir}")
    if not data_dir.exists():
        logger.warning(f"[find_recent_data_files] 平台 {platform} 数据目录不存在: {data_dir}")
        return []

    # 计算日期范围
    today = datetime.now().date()
    valid_dates = set()
    for i in range(days):
        date = today - timedelta(days=i)
        valid_dates.add(date.strftime("%Y-%m-%d"))

    logger.info(f"[find_recent_data_files] 平台: {platform}, 有效日期范围: {valid_dates}")

    # 查找所有 contents 文件
    content_files = list(data_dir.glob("*search_contents_*.csv"))
    logger.info(
        f"[find_recent_data_files] 平台 {platform} 找到 {len(content_files)} 个 contents 文件"
    )

    if not content_files:
        logger.warning(f"[find_recent_data_files] 平台 {platform} 没有找到任何 contents 文件")
        return []

    # 筛选符合日期范围的文件
    result = []
    for content_file in content_files:
        # 从文件名提取日期
        # 格式: 1_search_contents_2026-01-20_10-30-00.csv 或 1_search_contents_2026-01-20.csv
        name = content_file.name
        # 使用正则提取日期部分 (YYYY-MM-DD)
        date_match = re.search(r"(\d{4}-\d{2}-\d{2})", name)
        if not date_match:
            logger.debug(f"[find_recent_data_files] 文件 {name} 无法提取日期，跳过")
            continue

        file_date = date_match.group(1)
        if file_date not in valid_dates:
            logger.debug(
                f"[find_recent_data_files] 文件 {name} 日期 {file_date} 不在有效范围 {valid_dates} 内，跳过"
            )
            continue

        # 找到对应的评论文件
        comment_filename = name.replace("_contents_", "_comments_")
        comment_file = data_dir / comment_filename

        if not comment_file.exists():
            comment_file = None

        result.append((content_file, comment_file))

    # 按修改时间排序（最新的在前）
    result.sort(key=lambda x: x[0].stat().st_mtime, reverse=True)

    logger.info(f"[find_recent_data_files] 平台 {platform} 找到 {len(result)} 个符合条件的文件")

    return result


def get_all_data_files(platform: str) -> list[dict]:
    """获取所有数据文件列表"""
    data_dir = get_platform_data_dir(platform, require=False)
    if data_dir is None or not data_dir.exists():
        return []

    files = []
    for file_path in data_dir.glob("*search_contents_*.csv"):
        # 从文件名解析信息
        # 格式1: 10_search_contents_2026-01-20.csv（带前缀）
        # 格式2: search_contents_2026-01-20.csv（无前缀，如微博）
        name = file_path.name
        parts = name.split("_")
        if len(parts) >= 4:
            # 带前缀格式
            file_index = parts[0]
            date_part = parts[3].replace(".csv", "")
        elif len(parts) >= 3 and parts[0] == "search":
            # 无前缀格式
            file_index = "1"
            date_part = parts[2].replace(".csv", "")
        else:
            continue

        files.append(
            {
                "filename": name,
                "path": str(file_path),
                "index": file_index,
                "date": date_part,
                "modified_time": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                "size": file_path.stat().st_size,
            }
        )

    # 按修改时间排序
    files.sort(key=lambda x: x["modified_time"], reverse=True)
    return files


@router.get("/results")
async def get_crawler_results(
    platform: str = "xhs",
    limit: int = 50,
    include_comments: bool = True,
):
    """获取爬取结果（今天和昨天的数据）

    Args:
        platform: 平台名称
        limit: 返回数量限制
        include_comments: 是否包含评论
    """
    logger.info(
        f"[Crawler Results API] 收到请求 - 平台: {platform}, limit: {limit}, include_comments: {include_comments}"
    )
    try:
        # 查找最近两天的所有数据文件（今天和昨天）
        recent_files = find_recent_data_files(platform, days=2)

        logger.info(f"[Crawler Results] 平台: {platform}, 找到 {len(recent_files)} 个数据文件")

        if not recent_files:
            return {
                "success": True,
                "results": [],
                "total_count": 0,
                "message": "暂无数据",
            }

        # 读取所有文件的内容数据并合并
        contents = []
        seen_note_ids: set[str] = set()  # 用于去重
        comment_files = []  # 收集所有评论文件

        for content_file, comment_file in recent_files:
            logger.info(f"[Crawler Results] 读取文件: {content_file.name}")
            raw_contents = read_csv_file(content_file)

            for item in raw_contents:
                normalized = normalize_content_item(item, platform)
                # 获取唯一标识（不同平台使用不同字段）
                note_id = (
                    normalized.get("note_id", "")
                    or normalized.get("video_id", "")
                    or normalized.get("content_id", "")
                )

                # 去重：只添加未见过的内容
                if note_id and note_id not in seen_note_ids:
                    seen_note_ids.add(note_id)
                    contents.append(normalized)

            if comment_file:
                comment_files.append(comment_file)

        logger.info(f"[Crawler Results] 合并后共 {len(contents)} 条内容（去重后）")

        # 读取黑名单配置并过滤博主
        try:
            config_content = read_config_file(require=False)
            blacklist_str = (
                extract_config_value(config_content, "BLACKLIST_NICKNAMES", "str") or ""
                if config_content
                else ""
            )
            if blacklist_str:
                # 解析黑名单（支持逗号、空格分隔）
                blacklist = [
                    name.strip()
                    for name in blacklist_str.replace("，", ",").split(",")
                    if name.strip()
                ]
                if blacklist:
                    original_count = len(contents)
                    contents = [
                        item for item in contents if item.get("nickname", "") not in blacklist
                    ]
                    filtered_count = original_count - len(contents)
                    if filtered_count > 0:
                        logger.info(
                            f"[Crawler Results] 黑名单过滤: 过滤掉 {filtered_count} 条内容, 黑名单: {blacklist}"
                        )
        except Exception as e:
            logger.warning(f"[Crawler Results] 读取黑名单配置失败: {e}")

        # 使用排除关键词过滤内容
        if _excluded_keywords:
            original_count = len(contents)
            filtered_contents = []
            for item in contents:
                title = item.get("title", "").lower()
                desc = item.get("desc", "").lower()
                # 检查标题和描述是否包含任何排除关键词
                should_exclude = False
                for keyword in _excluded_keywords:
                    keyword_lower = keyword.lower()
                    if keyword_lower in title or keyword_lower in desc:
                        should_exclude = True
                        break
                if not should_exclude:
                    filtered_contents.append(item)

            contents = filtered_contents
            filtered_count = original_count - len(contents)
            if filtered_count > 0:
                logger.info(
                    f"[Crawler Results] 排除关键词过滤: 过滤掉 {filtered_count} 条内容, 排除关键词: {_excluded_keywords}"
                )

        # 读取评论数据（如果需要）- 从所有评论文件中读取
        comments_by_note: dict[str, list[dict]] = {}
        if include_comments and comment_files:
            # 用于评论去重的集合（基于 comment_id + assoc_id 组合）
            seen_comments: set[str] = set()
            duplicate_count = 0
            total_comments = 0

            for comment_file in comment_files:
                raw_comments = read_csv_file(comment_file)
                total_comments += len(raw_comments)
                logger.info(
                    f"[Crawler Results] 从 {comment_file.name} 读取到 {len(raw_comments)} 条评论"
                )

                for raw_comment in raw_comments:
                    # 规范化评论数据
                    comment = normalize_comment_item(raw_comment, platform)
                    comment_id = str(comment.get("comment_id", ""))

                    # 获取关联ID：B站和快手使用 video_id，知乎使用 content_id，其他平台使用 note_id 或 aweme_id
                    if platform in ["bilibili", "bili", "kuaishou", "ks"]:
                        assoc_id = str(comment.get("video_id", ""))
                    elif platform in ["zhihu"]:
                        assoc_id = str(comment.get("content_id", ""))
                    else:
                        assoc_id = comment.get("note_id", "") or comment.get("aweme_id", "")

                    # 去重：检查 comment_id + assoc_id 组合是否已处理过
                    dedup_key = f"{comment_id}_{assoc_id}"
                    if dedup_key in seen_comments:
                        duplicate_count += 1
                        continue
                    seen_comments.add(dedup_key)

                    # 只有 assoc_id 非空时才处理评论
                    if assoc_id:
                        if assoc_id not in comments_by_note:
                            comments_by_note[assoc_id] = []
                        # 获取时间字段：知乎使用 publish_time，其他平台使用 create_time
                        create_time = comment.get("create_time", "") or comment.get(
                            "publish_time", ""
                        )
                        # 获取用户信息：知乎使用 user_nickname/user_avatar
                        nickname = comment.get("nickname", "") or comment.get("user_nickname", "")
                        avatar = comment.get("avatar", "") or comment.get("user_avatar", "")

                        comments_by_note[assoc_id].append(
                            {
                                "id": comment_id,
                                "content": comment.get("content", ""),
                                "createTime": create_time,
                                "ipLocation": comment.get("ip_location", ""),
                                "likeCount": parse_count_value(
                                    comment.get("like_count") or comment.get("digg_count")
                                ),
                                "subCommentCount": parse_count_value(
                                    comment.get("sub_comment_count")
                                ),
                                "userId": comment.get("user_id", ""),
                                "nickname": nickname,
                                "avatar": get_proxied_avatar_url(avatar, platform),
                            }
                        )

            logger.info(
                f"[Crawler Results] 共从 {len(comment_files)} 个文件读取 {total_comments} 条评论"
            )
            if duplicate_count > 0:
                logger.info(f"[Crawler Results] 去除了 {duplicate_count} 条重复评论")
            logger.info(f"[Crawler Results] 评论按笔记分组: 共 {len(comments_by_note)} 个分组")
            # 打印每个分组的评论数量
            for assoc_id, comments_list in comments_by_note.items():
                logger.info(
                    f"[Crawler Results] content_id={assoc_id} 有 {len(comments_list)} 条评论"
                )

        # 转换为前端需要的格式
        results = []

        for item in contents[:limit]:
            note_id = item.get("note_id", "")

            # 解析标签列表（从 desc 中提取 #标签）
            tag_list_str = item.get("tag_list", "")
            if tag_list_str:
                tags = [f"#{tag.strip()}[话题]#" for tag in tag_list_str.split(",") if tag.strip()]
            else:
                # 从 desc 中提取 #标签
                import re

                desc = item.get("desc", "")
                hashtags = re.findall(r"#([^\s#]+)", desc)
                tags = [f"#{tag}[话题]#" for tag in hashtags[:5]]  # 最多取5个标签

            # 判断是否有视频
            has_video = item.get("type", "") == "video" or bool(item.get("video_url"))

            # 获取评论关联ID：B站和快手使用 video_id，知乎使用 content_id，其他平台使用 note_id
            if platform in ["bilibili", "bili", "kuaishou", "ks"]:
                comment_assoc_id = str(item.get("video_id", ""))
            elif platform in ["zhihu"]:
                comment_assoc_id = str(item.get("content_id", ""))
                logger.info(
                    f"[Crawler Results] 知乎内容 note_id={note_id}, content_id={comment_assoc_id}, 匹配评论数={len(comments_by_note.get(comment_assoc_id, []))}"
                )
            else:
                comment_assoc_id = note_id

            # 获取第一张图片并处理代理
            first_image = item.get("image_list", "").split(",")[0] if item.get("image_list") else ""

            result = {
                "id": note_id,
                "noteId": note_id,
                "type": item.get("type", "normal"),
                "title": item.get("title", ""),
                "desc": item.get("desc", ""),
                "tags": tags,
                "hasVideo": has_video,
                "videoUrl": item.get("video_url", ""),
                "videoDownloadUrl": item.get("video_download_url", ""),  # 真实的视频下载地址
                "imageUrl": get_proxied_image_url(first_image, platform),
                "noteUrl": item.get("note_url", ""),
                "likedCount": parse_count_value(item.get("liked_count")),
                "collectedCount": parse_count_value(item.get("collected_count")),
                "commentCount": parse_count_value(item.get("comment_count")),
                "shareCount": parse_count_value(item.get("share_count")),
                "userId": item.get("user_id", ""),
                "nickname": item.get("nickname", ""),
                "avatar": get_proxied_avatar_url(item.get("avatar", ""), platform),
                "sourceKeyword": item.get("source_keyword", ""),
                "time": item.get("time", ""),
                "comments": comments_by_note.get(comment_assoc_id, []),
            }
            results.append(result)

        return {
            "success": True,
            "results": results,
            "total_count": len(contents),
            "files_count": len(recent_files),  # 读取的文件数量
        }
    except Exception as e:
        logger.error(f"获取爬取结果失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取爬取结果失败: {e!s}") from e


@router.get("/results/files")
async def get_data_files(platform: str = "xhs"):
    """获取所有数据文件列表"""
    try:
        files = get_all_data_files(platform)
        return {
            "success": True,
            "files": files,
        }
    except Exception as e:
        logger.error(f"获取数据文件列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取数据文件列表失败: {e!s}") from e


@router.get("/results/file/{filename}")
async def get_results_by_file(
    filename: str,
    platform: str = "xhs",
    limit: int = 50,
    include_comments: bool = True,
):
    """获取指定文件的爬取结果"""
    try:
        data_dir = get_platform_data_dir(platform, require=False)
        if data_dir is None:
            return {"success": True, "results": [], "total_count": 0, "file": filename}
        content_file = data_dir / filename

        if not content_file.exists():
            raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")

        # 尝试查找对应的评论文件
        comment_filename = filename.replace("_contents_", "_comments_")
        comment_file = data_dir / comment_filename
        if not comment_file.exists():
            comment_file = None

        # 读取内容数据并规范化
        raw_contents = read_csv_file(content_file)
        contents = [normalize_content_item(item, platform) for item in raw_contents]

        # 读取评论数据
        comments_by_note: dict[str, list[dict]] = {}
        if include_comments and comment_file:
            raw_comments = read_csv_file(comment_file)
            for raw_comment in raw_comments:
                comment = normalize_comment_item(raw_comment, platform)
                # 获取关联ID：B站使用 video_id，知乎使用 content_id，其他平台使用 note_id 或 aweme_id
                if platform in ["bilibili", "bili"]:
                    assoc_id = str(comment.get("video_id", ""))
                elif platform in ["zhihu"]:
                    assoc_id = str(comment.get("content_id", ""))
                else:
                    assoc_id = comment.get("note_id", "") or comment.get("aweme_id", "")
                if assoc_id and assoc_id not in comments_by_note:
                    comments_by_note[assoc_id] = []
                if assoc_id:
                    # 获取时间字段：知乎使用 publish_time，其他平台使用 create_time
                    create_time = comment.get("create_time", "") or comment.get("publish_time", "")
                    # 获取用户信息：知乎使用 user_nickname/user_avatar
                    nickname = comment.get("nickname", "") or comment.get("user_nickname", "")
                    avatar = comment.get("avatar", "") or comment.get("user_avatar", "")

                    comments_by_note[assoc_id].append(
                        {
                            "id": comment.get("comment_id", ""),
                            "content": comment.get("content", ""),
                            "createTime": create_time,
                            "ipLocation": comment.get("ip_location", ""),
                            "likeCount": parse_count_value(
                                comment.get("like_count") or comment.get("digg_count")
                            ),
                            "subCommentCount": parse_count_value(comment.get("sub_comment_count")),
                            "userId": comment.get("user_id", ""),
                            "nickname": nickname,
                            "avatar": get_proxied_avatar_url(avatar, platform),
                        }
                    )

        # 转换为前端需要的格式
        results = []
        for item in contents[:limit]:
            note_id = item.get("note_id", "")

            # 解析标签列表
            tag_list_str = item.get("tag_list", "")
            if tag_list_str:
                tags = [f"#{tag.strip()}[话题]#" for tag in tag_list_str.split(",") if tag.strip()]
            else:
                import re

                desc = item.get("desc", "")
                hashtags = re.findall(r"#([^\s#]+)", desc)
                tags = [f"#{tag}[话题]#" for tag in hashtags[:5]]

            has_video = item.get("type", "") == "video" or bool(item.get("video_url"))

            # 获取评论关联ID：B站使用 video_id，知乎使用 content_id，其他平台使用 note_id
            if platform in ["bilibili", "bili"]:
                comment_assoc_id = str(item.get("video_id", ""))
            elif platform in ["zhihu"]:
                comment_assoc_id = str(item.get("content_id", ""))
            else:
                comment_assoc_id = note_id

            # 获取第一张图片并处理代理
            first_image = item.get("image_list", "").split(",")[0] if item.get("image_list") else ""

            result = {
                "id": note_id,
                "noteId": note_id,
                "type": item.get("type", "normal"),
                "title": item.get("title", ""),
                "desc": item.get("desc", ""),
                "tags": tags,
                "hasVideo": has_video,
                "videoUrl": item.get("video_url", ""),
                "videoDownloadUrl": item.get("video_download_url", ""),  # 真实的视频下载地址
                "imageUrl": get_proxied_image_url(first_image, platform),
                "noteUrl": item.get("note_url", ""),
                "likedCount": parse_count_value(item.get("liked_count")),
                "collectedCount": parse_count_value(item.get("collected_count")),
                "commentCount": parse_count_value(item.get("comment_count")),
                "shareCount": parse_count_value(item.get("share_count")),
                "userId": item.get("user_id", ""),
                "nickname": item.get("nickname", ""),
                "avatar": get_proxied_avatar_url(item.get("avatar", ""), platform),
                "sourceKeyword": item.get("source_keyword", ""),
                "time": item.get("time", ""),
                "comments": comments_by_note.get(comment_assoc_id, []),
            }
            results.append(result)

        return {
            "success": True,
            "results": results,
            "total_count": len(contents),
            "file": filename,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取文件爬取结果失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取文件爬取结果失败: {e!s}") from e


# ============== 视频流代理 ==============

from urllib.parse import unquote

import httpx
from fastapi.responses import StreamingResponse

# 平台对应的 Referer 和 User-Agent
PLATFORM_VIDEO_HEADERS = {
    "douyin": {
        "referer": "https://www.douyin.com/",
        "origin": "https://www.douyin.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    "kuaishou": {
        "referer": "https://www.kuaishou.com/",
        "origin": "https://www.kuaishou.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    "bilibili": {
        "referer": "https://www.bilibili.com/",
        "origin": "https://www.bilibili.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    "weibo": {
        "referer": "https://m.weibo.cn/",
        "origin": "https://m.weibo.cn",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    "xhs": {
        "referer": "https://www.xiaohongshu.com/",
        "origin": "https://www.xiaohongshu.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    "tieba": {
        "referer": "https://tieba.baidu.com/",
        "origin": "https://tieba.baidu.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
}

# 需要图片代理的平台（包含有防盗链或特殊URL格式的平台）
PLATFORMS_NEED_IMAGE_PROXY = ["weibo", "wb", "tieba"]


@router.get("/video/proxy")
async def proxy_video(url: str, platform: str = "douyin"):
    """视频流代理 API

    通过后端代理请求视频，绕过浏览器的 CORS 限制和防盗链检查

    Args:
        url: 视频 URL（需要 URL 编码）
        platform: 平台名称（douyin, kuaishou, bilibili 等）
    """
    try:
        # URL 解码
        video_url = unquote(url)
        logger.info(f"[Video Proxy] 代理视频请求 - 平台: {platform}, URL: {video_url[:100]}...")

        # 获取平台对应的请求头
        headers = PLATFORM_VIDEO_HEADERS.get(platform, PLATFORM_VIDEO_HEADERS["douyin"]).copy()

        # 创建 HTTP 客户端
        async def stream_video():
            async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                async with client.stream("GET", video_url, headers=headers) as response:
                    if response.status_code != 200:
                        logger.error(f"[Video Proxy] 视频请求失败: {response.status_code}")
                        return

                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        yield chunk

        # 返回流式响应
        return StreamingResponse(
            stream_video(),
            media_type="video/mp4",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except Exception as e:
        logger.error(f"[Video Proxy] 代理视频失败: {e}")
        raise HTTPException(status_code=500, detail=f"视频代理失败: {e!s}") from e


@router.head("/video/proxy")
async def proxy_video_head(url: str, platform: str = "douyin"):
    """视频流代理 HEAD 请求（用于获取视频信息）"""
    try:
        video_url = unquote(url)
        headers = PLATFORM_VIDEO_HEADERS.get(platform, PLATFORM_VIDEO_HEADERS["douyin"]).copy()

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.head(video_url, headers=headers)

            return StreamingResponse(
                iter([]),
                media_type="video/mp4",
                headers={
                    "Content-Length": response.headers.get("Content-Length", "0"),
                    "Accept-Ranges": "bytes",
                    "Access-Control-Allow-Origin": "*",
                },
            )
    except Exception as e:
        logger.error(f"[Video Proxy] HEAD 请求失败: {e}")
        raise HTTPException(status_code=500, detail=f"视频代理失败: {e!s}") from e


# ============== 图片代理 ==============

from urllib.parse import quote


@router.get("/image/proxy")
async def proxy_image(url: str, platform: str = "weibo"):
    """图片代理 API

    通过后端代理请求图片，绕过浏览器的防盗链检查

    Args:
        url: 图片 URL（需要 URL 编码）
        platform: 平台名称（weibo, tieba 等）
    """
    try:
        # URL 解码
        image_url = unquote(url)
        # 清理 URL 中可能存在的引号
        image_url = image_url.strip('"').strip("'")

        # 处理相对协议 URL（以 // 开头的 URL，需要补全协议）
        if image_url.startswith("//"):
            image_url = f"https:{image_url}"

        logger.info(f"[Image Proxy] 代理图片请求 - 平台: {platform}, URL: {image_url[:80]}...")

        # 获取平台对应的请求头
        headers = PLATFORM_VIDEO_HEADERS.get(
            platform,
            {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        ).copy()

        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(image_url, headers=headers)

            if response.status_code != 200:
                logger.error(f"[Image Proxy] 图片请求失败: {response.status_code}")
                raise HTTPException(status_code=response.status_code, detail="图片获取失败")

            # 获取内容类型
            content_type = response.headers.get("Content-Type", "image/jpeg")

            return StreamingResponse(
                iter([response.content]),
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=86400",  # 缓存 1 天
                    "Access-Control-Allow-Origin": "*",
                },
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Image Proxy] 图片代理失败: {e}")
        raise HTTPException(status_code=500, detail=f"图片代理失败: {e!s}") from e


def get_proxied_avatar_url(avatar: str, platform: str) -> str:
    """获取代理后的头像 URL"""
    if not avatar:
        return ""

    # 清理引号
    avatar = avatar.strip('"').strip("'")

    # 处理相对协议 URL（以 // 开头的 URL，需要补全协议）
    if avatar.startswith("//"):
        avatar = f"https:{avatar}"

    # 如果平台需要代理，返回代理 URL
    if platform in PLATFORMS_NEED_IMAGE_PROXY and avatar:
        return f"/api/crawler/image/proxy?url={quote(avatar, safe='')}&platform={platform}"

    return avatar


def get_proxied_image_url(image_url: str, platform: str) -> str:
    """获取代理后的图片 URL（用于帖子封面图等）"""
    if not image_url:
        return ""

    # 清理引号
    image_url = image_url.strip('"').strip("'")

    # 处理相对协议 URL（以 // 开头的 URL，需要补全协议）
    if image_url.startswith("//"):
        image_url = f"https:{image_url}"

    # 如果平台需要代理，返回代理 URL
    if platform in PLATFORMS_NEED_IMAGE_PROXY and image_url:
        return f"/api/crawler/image/proxy?url={quote(image_url, safe='')}&platform={platform}"

    return image_url


# ============== 今日总结 ==============

# 平台中文名映射
PLATFORM_CHINESE_NAMES = {
    "xhs": "小红书",
    "douyin": "抖音",
    "bilibili": "哔哩哔哩",
    "weibo": "微博",
    "kuaishou": "快手",
    "zhihu": "知乎",
    "tieba": "贴吧",
}

# 支持的所有平台列表
ALL_PLATFORMS = ["xhs", "douyin", "bilibili", "kuaishou", "zhihu", "tieba", "weibo"]


def get_today_data_for_all_platforms() -> dict[str, list[dict]]:
    """获取今天所有平台的爬取数据"""
    today = datetime.now().strftime("%Y-%m-%d")
    all_data = {}

    for platform in ALL_PLATFORMS:
        data_dir = get_platform_data_dir(platform, require=False)
        if data_dir is None or not data_dir.exists():
            continue

        # 查找今天的内容文件（支持带前缀和时间戳的格式）
        # 新格式: 1_search_contents_2026-01-31_14-30-45.csv
        today_files = list(data_dir.glob(f"*search_contents_{today}*.csv"))

        platform_contents = []
        for content_file in today_files:
            raw_contents = read_csv_file(content_file)
            contents = [normalize_content_item(item, platform) for item in raw_contents]
            platform_contents.extend(contents)

        if platform_contents:
            all_data[platform] = platform_contents
            logger.info(f"[Daily Summary] 平台 {platform} 今日数据: {len(platform_contents)} 条")

    return all_data


def get_today_transcripts() -> dict[str, list[dict]]:
    """获取今天所有平台的视频转写文本"""
    today = datetime.now().strftime("%Y-%m-%d")
    all_transcripts = {}

    transcripts_dir = _try_get_transcripts_dir()
    if transcripts_dir is None or not transcripts_dir.exists():
        if transcripts_dir is not None:
            logger.info(f"[Daily Summary] 转写目录不存在: {transcripts_dir}")
        return all_transcripts

    # 遍历所有平台目录
    for platform_dir in transcripts_dir.iterdir():
        if not platform_dir.is_dir():
            continue

        platform = platform_dir.name
        platform_transcripts = []

        # 查找今天的转写文件（文件名格式: {id}_{title}_{date}.txt）
        for transcript_file in platform_dir.glob(f"*_{today}.txt"):
            try:
                content = transcript_file.read_text(encoding="utf-8")

                # 解析文件内容
                lines = content.split("\n")
                title = ""
                content_id = ""
                transcript_text = ""

                in_transcript = False
                for line in lines:
                    if line.startswith("标题: "):
                        title = line[4:].strip()
                    elif line.startswith("内容ID: "):
                        content_id = line[6:].strip()
                    elif "转写文本" in line:
                        in_transcript = True
                    elif in_transcript:
                        transcript_text += line + "\n"

                # 清理转写文本
                transcript_text = transcript_text.strip()

                if transcript_text:
                    platform_transcripts.append(
                        {
                            "title": title,
                            "content_id": content_id,
                            "transcript": transcript_text,
                            "file_name": transcript_file.name,
                        }
                    )
            except Exception as e:
                logger.warning(f"[Daily Summary] 读取转写文件失败 {transcript_file}: {e}")
                continue

        if platform_transcripts:
            all_transcripts[platform] = platform_transcripts
            logger.info(f"[Daily Summary] 平台 {platform} 今日转写: {len(platform_transcripts)} 条")

    return all_transcripts


def build_summary_prompt(
    all_data: dict[str, list[dict]], all_transcripts: dict[str, list[dict]] = None
) -> str:
    """构建今日总结的提示词"""
    today = datetime.now().strftime("%Y年%m月%d日")

    prompt_parts = [
        "# 今日社交媒体内容总结任务",
        "",
        f"请对以下 {today} 爬取的社交媒体内容进行全面总结分析。",
        "",
        "## 爬取数据概览",
    ]

    total_count = 0
    for platform, contents in all_data.items():
        platform_name = PLATFORM_CHINESE_NAMES.get(platform, platform)
        count = len(contents)
        total_count += count
        prompt_parts.append(f"- {platform_name}: {count} 条内容")

    # 添加转写数据统计
    total_transcripts = 0
    if all_transcripts:
        for platform, transcripts in all_transcripts.items():
            total_transcripts += len(transcripts)

    prompt_parts.extend(
        [
            f"- 总计: {total_count} 条内容",
            f"- 视频转写文本: {total_transcripts} 条",
            "",
            "## 各平台内容详情（完整列表）",
        ]
    )

    # 添加每个平台的所有内容（不截断）
    for platform, contents in all_data.items():
        platform_name = PLATFORM_CHINESE_NAMES.get(platform, platform)
        prompt_parts.append("")
        prompt_parts.append(f"### {platform_name}")

        # 展示所有内容（不限制数量）
        for i, item in enumerate(contents):
            title = item.get("title", "")
            desc = item.get("desc", "")
            liked = item.get("liked_count", 0)
            comment = item.get("comment_count", 0)
            collected = item.get("collected_count", 0)
            share = item.get("share_count", 0)
            nickname = item.get("nickname", "")

            content_text = title or desc[:200] or "无标题"
            # 为每条内容添加唯一标识符，方便后续引用
            prompt_parts.append("")
            prompt_parts.append(f"**[内容{i + 1}] {content_text}**")
            prompt_parts.append(f"- 作者: {nickname}")
            prompt_parts.append(
                f"- 互动数据: 点赞 {liked}, 评论 {comment}, 收藏 {collected}, 分享 {share}"
            )
            if desc and desc != title:
                # 完整展示描述内容
                desc_preview = desc[:500] if len(desc) > 500 else desc
                prompt_parts.append(f"- 描述: {desc_preview}")

    # 添加视频转写文本内容
    if all_transcripts:
        prompt_parts.extend(
            [
                "",
                "## 视频转写文本（语音转文字）",
                "",
                "以下是今日爬取视频的语音转文字内容，可以帮助更深入理解视频的实际内容：",
            ]
        )

        for platform, transcripts in all_transcripts.items():
            platform_name = PLATFORM_CHINESE_NAMES.get(platform, platform)
            prompt_parts.append("")
            prompt_parts.append(f"### {platform_name} 视频转写")

            # 展示所有转写内容（不限制数量，但每条限制字数）
            for i, item in enumerate(transcripts):
                title = item.get("title", "未知标题")
                transcript = item.get("transcript", "")
                # 每条转写限制 1000 字以避免 token 过多
                transcript_preview = transcript[:1000] if len(transcript) > 1000 else transcript

                prompt_parts.append("")
                prompt_parts.append(f"**[转写{i + 1}] {title}**")
                prompt_parts.append("```")
                prompt_parts.append(transcript_preview)
                if len(transcript) > 1000:
                    prompt_parts.append(f"... (内容过长，已截断，原文共 {len(transcript)} 字)")
                prompt_parts.append("```")

    prompt_parts.extend(
        [
            "",
            "## 请提供简洁分析",
            "",
            "请用中文回答，**务必简洁精炼**，使用 Markdown 格式。每个分析点控制在 2-3 句话内。",
            "",
            "**格式要求**：引用爬取内容时使用 `==高亮==` 格式，如：==AI人工智能==、==作者名==",
            "",
            "请分析以下 3 点：",
            "",
            "1. **今日热点**：用 1-2 句话总结主要话题和趋势",
            "2. **高热内容**：列出 2-3 条互动最高的内容（标题+作者），简要说明原因",
            "3. **值得关注**：推荐 1-2 个值得关注的内容或趋势",
            "",
            "请直接开始分析，保持精简。",
        ]
    )

    return "\n".join(prompt_parts)


@router.get("/daily-summary")
async def get_daily_summary():
    """获取今日爬取内容的 AI 总结（流式返回）"""
    from llm.llm_client import LLMClient

    try:
        # 获取今天所有平台的数据
        all_data = get_today_data_for_all_platforms()

        # 获取今天所有平台的视频转写文本
        all_transcripts = get_today_transcripts()

        if not all_data and not all_transcripts:
            # 没有数据时返回提示信息
            async def no_data_stream():
                yield "## 暂无今日数据\n\n今天还没有爬取任何内容，请先启动爬虫获取数据后再生成总结。"

            return StreamingResponse(
                no_data_stream(),
                media_type="text/plain; charset=utf-8",
                headers={
                    "Cache-Control": "no-cache",
                    "Access-Control-Allow-Origin": "*",
                },
            )

        # 构建提示词（包含帖子数据和视频转写文本）
        prompt = build_summary_prompt(all_data, all_transcripts)
        logger.info(
            f"[Daily Summary] 构建提示词完成，长度: {len(prompt)}，转写文件数: {sum(len(t) for t in all_transcripts.values()) if all_transcripts else 0}"
        )

        # 获取 LLM 客户端
        llm_client = LLMClient()

        if not llm_client.is_available():

            async def error_stream():
                yield "## AI 服务不可用\n\nLLM 客户端未配置或不可用，请检查 API Key 配置。"

            return StreamingResponse(
                error_stream(),
                media_type="text/plain; charset=utf-8",
                headers={
                    "Cache-Control": "no-cache",
                    "Access-Control-Allow-Origin": "*",
                },
            )

        # 构建消息
        messages = [
            {
                "role": "system",
                "content": "你是一个专业的社交媒体内容分析师，擅长总结和分析各平台的热门内容趋势。请用清晰的 Markdown 格式输出分析结果。",
            },
            {"role": "user", "content": prompt},
        ]

        # 流式生成总结
        async def generate_summary():
            try:
                for chunk in llm_client.stream_chat(messages, temperature=0.7):
                    yield chunk
            except Exception as e:
                error_msg = str(e)
                logger.error(f"[Daily Summary] 生成总结失败: {error_msg}")

                # 检查是否是内容安全审核错误
                if "inappropriate" in error_msg.lower() or "content" in error_msg.lower():
                    yield "\n\n---\n\n"
                    yield "## ⚠️ 内容审核提示\n\n"
                    yield "AI 模型检测到爬取的内容可能包含敏感词汇，无法生成完整摘要。\n\n"
                    yield "**可能的原因：**\n"
                    yield "- 爬取的社交媒体内容中包含敏感话题\n"
                    yield "- 某些标题或评论触发了内容安全策略\n\n"
                    yield "**建议：**\n"
                    yield "- 点击 **更新AI摘要** 重新尝试生成\n"
                    yield "- 如果问题持续，可以查看下方的热点内容列表\n"
                else:
                    yield f"\n\n---\n\n**错误**: 生成总结时发生错误: {error_msg}"

        return StreamingResponse(
            generate_summary(),
            media_type="text/plain; charset=utf-8",
            headers={
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
            },
        )

    except Exception as e:
        logger.error(f"[Daily Summary] 获取今日总结失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取今日总结失败: {e!s}") from e


# ============== 今日视频下载 ==============

# 平台对应的 Referer
PLATFORM_REFERER_MAP = {
    "xhs": "https://www.xiaohongshu.com/",
    "douyin": "https://www.douyin.com/",
    "bilibili": "https://www.bilibili.com/",
    "kuaishou": "https://www.kuaishou.com/",
    "weibo": "https://m.weibo.cn/",
}


def get_today_videos_for_all_platforms() -> list[dict]:
    """获取今天所有平台的视频信息"""
    today = datetime.now().strftime("%Y-%m-%d")
    all_videos = []

    for platform in ALL_PLATFORMS:
        data_dir = get_platform_data_dir(platform, require=False)
        if data_dir is None or not data_dir.exists():
            continue

        # 查找今天的内容文件（支持带时间戳的格式）
        # 新格式: 1_search_contents_2026-01-31_14-30-45.csv
        today_files = list(data_dir.glob(f"*search_contents_{today}*.csv"))

        for content_file in today_files:
            raw_contents = read_csv_file(content_file)
            contents = [normalize_content_item(item, platform) for item in raw_contents]

            for item in contents:
                # 获取视频 URL
                video_url = item.get("video_url") or item.get("video_download_url")

                # 只处理有视频的内容
                if video_url and item.get("type") == "video":
                    note_id = item.get("note_id", "")
                    title = item.get("title", "") or item.get("desc", "")[:30] or note_id
                    # 清理文件名中的非法字符
                    safe_title = re.sub(r'[\\/:*?"<>|\r\n]', "_", title)[:50]

                    all_videos.append(
                        {
                            "platform": platform,
                            "note_id": note_id,
                            "title": title,
                            "safe_title": safe_title,
                            "video_url": video_url,
                            "nickname": item.get("nickname", ""),
                        }
                    )

    return all_videos


async def download_video(
    video_url: str, save_path: Path, platform: str, timeout: int = 60
) -> tuple[bool, str]:
    """下载单个视频

    Returns:
        tuple: (成功标志, 错误信息或文件路径)
    """
    try:
        # 确保目录存在
        save_path.parent.mkdir(parents=True, exist_ok=True)

        # 如果文件已存在，跳过下载
        if save_path.exists() and save_path.stat().st_size > 0:
            logger.info(f"[Video Download] 文件已存在，跳过: {save_path.name}")
            return True, str(save_path)

        # 获取 Referer
        referer = PLATFORM_REFERER_MAP.get(platform, "https://www.xiaohongshu.com/")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": referer,
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "zh-CN,zh;q=0.9",
        }

        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            async with client.stream("GET", video_url, headers=headers) as response:
                if response.status_code != 200:
                    return False, f"HTTP {response.status_code}"

                # 写入文件
                with open(save_path, "wb") as f:
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        f.write(chunk)

        logger.info(f"[Video Download] 下载完成: {save_path.name}")
        return True, str(save_path)

    except Exception as e:
        error_msg = str(e)
        logger.error(f"[Video Download] 下载失败 {save_path.name}: {error_msg}")
        # 删除可能的不完整文件
        if save_path.exists():
            try:
                save_path.unlink()
            except:
                pass
        return False, error_msg


@router.post("/download-today-videos")
async def download_today_videos():
    """下载今日爬取的所有视频（流式返回进度）"""
    try:
        # 获取今天所有视频
        videos = get_today_videos_for_all_platforms()

        if not videos:

            async def no_videos_stream():
                yield '{"type": "complete", "message": "今天没有爬取到视频内容", "total": 0, "success": 0, "failed": 0}\n'

            return StreamingResponse(
                no_videos_stream(),
                media_type="application/x-ndjson",
                headers={
                    "Cache-Control": "no-cache",
                    "Access-Control-Allow-Origin": "*",
                },
            )

        today = datetime.now().strftime("%Y-%m-%d")

        async def download_stream():
            total = len(videos)
            success_count = 0
            failed_count = 0

            # 发送开始信息
            yield f'{{"type": "start", "total": {total}, "message": "开始下载今日视频"}}\n'

            for i, video in enumerate(videos):
                platform = video["platform"]
                note_id = video["note_id"]
                safe_title = video["safe_title"]
                video_url = video["video_url"]

                # 构建保存路径: videos/{date}/{platform}/{note_id}_{title}.mp4
                save_dir = _get_videos_download_dir() / today / platform
                filename = f"{note_id}_{safe_title}.mp4"
                save_path = save_dir / filename

                # 发送进度信息
                progress = {
                    "type": "progress",
                    "current": i + 1,
                    "total": total,
                    "platform": platform,
                    "title": video["title"][:30],
                    "status": "downloading",
                }
                yield f"{__import__('json').dumps(progress, ensure_ascii=False)}\n"

                # 下载视频
                success, result = await download_video(video_url, save_path, platform)

                if success:
                    success_count += 1
                    progress["status"] = "success"
                else:
                    failed_count += 1
                    progress["status"] = "failed"
                    progress["error"] = result

                yield f"{__import__('json').dumps(progress, ensure_ascii=False)}\n"

            # 发送完成信息
            complete = {
                "type": "complete",
                "total": total,
                "success": success_count,
                "failed": failed_count,
                "message": f"下载完成: 成功 {success_count}/{total}，失败 {failed_count}",
            }
            yield f"{__import__('json').dumps(complete, ensure_ascii=False)}\n"

            logger.info(f"[Video Download] 今日视频下载完成: 成功 {success_count}/{total}")

        return StreamingResponse(
            download_stream(),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
            },
        )

    except Exception as e:
        logger.error(f"[Video Download] 下载今日视频失败: {e}")
        raise HTTPException(status_code=500, detail=f"下载今日视频失败: {e!s}") from e


@router.get("/download-today-videos/status")
async def get_download_status():
    """获取今日视频下载状态"""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        base_dir = _try_get_videos_download_dir()
        if base_dir is None:
            return {"downloaded": 0, "total_size": 0, "platforms": {}}
        videos_dir = base_dir / today

        if not videos_dir.exists():
            return {
                "downloaded": 0,
                "total_size": 0,
                "platforms": {},
            }

        # 统计各平台下载情况
        platforms = {}
        total_count = 0
        total_size = 0

        for platform_dir in videos_dir.iterdir():
            if platform_dir.is_dir():
                platform = platform_dir.name
                files = list(platform_dir.glob("*.mp4"))
                count = len(files)
                size = sum(f.stat().st_size for f in files)

                platforms[platform] = {
                    "count": count,
                    "size": size,
                    "size_mb": round(size / (1024 * 1024), 2),
                }
                total_count += count
                total_size += size

        return {
            "downloaded": total_count,
            "total_size": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "platforms": platforms,
            "directory": str(videos_dir),
        }

    except Exception as e:
        logger.error(f"[Video Download] 获取下载状态失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取下载状态失败: {e!s}") from e
