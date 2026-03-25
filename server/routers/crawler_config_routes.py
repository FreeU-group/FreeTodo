# ruff: noqa: C901, PLR0915
"""Crawler config and proxy routes."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from routers.crawler_common import (
    PLUGIN_NOT_INSTALLED_MSG,
    CrawlerConfigResponse,
    CrawlerConfigUpdate,
    KdlProxyConfigResponse,
    KdlProxyConfigUpdate,
    default_crawler_config,
    extract_config_value,
    logger,
    read_config_file,
    read_proxy_config_file,
    update_config_value,
    update_proxy_config_line,
    write_config_file,
    write_proxy_config_file,
)


def register_routes(router: APIRouter) -> None:
    """Register crawler config routes on the shared router."""

    @router.get("/config", response_model=CrawlerConfigResponse)
    async def get_crawler_config() -> CrawlerConfigResponse:
        """Return crawler config, or defaults if the plugin is unavailable."""
        try:
            content = read_config_file(require=False)
            if content is None:
                return default_crawler_config()

            platform = extract_config_value(content, "PLATFORM", "str") or "xhs"
            platforms_str = extract_config_value(content, "PLATFORMS", "str") or ""
            platforms = [p.strip() for p in platforms_str.split(",") if p.strip()] or [platform]

            return CrawlerConfigResponse(
                keywords=extract_config_value(content, "KEYWORDS", "str") or "",
                platform=platform,
                platforms=platforms,
                crawler_type=extract_config_value(content, "CRAWLER_TYPE", "str") or "search",
                max_notes_count=extract_config_value(content, "CRAWLER_MAX_NOTES_COUNT", "int")
                or 40,
                enable_comments=extract_config_value(content, "ENABLE_GET_COMMENTS", "bool")
                or False,
                enable_checkpoint=extract_config_value(content, "ENABLE_CHECKPOINT", "bool")
                or True,
                crawler_sleep=extract_config_value(content, "CRAWLER_TIME_SLEEP", "float") or 1.0,
                save_data_option=extract_config_value(content, "SAVE_DATA_OPTION", "str") or "csv",
                blacklist_nicknames=extract_config_value(content, "BLACKLIST_NICKNAMES", "str")
                or "",
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("获取爬虫配置失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"获取爬虫配置失败: {exc!s}") from exc

    @router.post("/config")
    async def update_crawler_config(config: CrawlerConfigUpdate) -> dict[str, Any]:
        """Persist crawler config changes."""
        try:
            content = read_config_file()
            updates = [
                (config.keywords, "KEYWORDS", "str", "更新爬虫关键词"),
                (config.crawler_type, "CRAWLER_TYPE", "str", "更新爬取类型"),
                (config.max_notes_count, "CRAWLER_MAX_NOTES_COUNT", "int", "更新最大爬取数量"),
                (config.enable_comments, "ENABLE_GET_COMMENTS", "bool", "更新是否爬取评论"),
                (config.enable_checkpoint, "ENABLE_CHECKPOINT", "bool", "更新断点续爬"),
                (config.crawler_sleep, "CRAWLER_TIME_SLEEP", "float", "更新爬虫间隔"),
                (config.save_data_option, "SAVE_DATA_OPTION", "str", "更新数据保存方式"),
                (config.blacklist_nicknames, "BLACKLIST_NICKNAMES", "str", "更新博主黑名单"),
            ]
            for value, key, value_type, message in updates:
                if value is None:
                    continue
                content = update_config_value(content, key, value, value_type)
                logger.info("%s: %s", message, value)

            if config.platforms is not None:
                platforms_str = ",".join(config.platforms)
                content = update_config_value(content, "PLATFORMS", platforms_str, "str")
                if config.platforms:
                    content = update_config_value(content, "PLATFORM", config.platforms[0], "str")
                logger.info("更新爬虫平台: %s", config.platforms)
            elif config.platform is not None:
                content = update_config_value(content, "PLATFORM", config.platform, "str")
                logger.info("更新爬虫平台: %s", config.platform)

            write_config_file(content)
            return {"success": True, "message": "配置更新成功"}
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("更新爬虫配置失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"更新爬虫配置失败: {exc!s}") from exc

    @router.post("/config/keywords")
    async def update_keywords(data: dict[str, str]) -> dict[str, Any]:
        """Update keywords through the shortcut API."""
        try:
            keywords = data.get("keywords", "")
            content = update_config_value(read_config_file(), "KEYWORDS", keywords, "str")
            write_config_file(content)
            logger.info("更新爬虫关键词: %s", keywords)
            return {"success": True, "keywords": keywords}
        except Exception as exc:
            logger.error("更新关键词失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"更新关键词失败: {exc!s}") from exc

    @router.get("/proxy-config", response_model=KdlProxyConfigResponse)
    async def get_proxy_config() -> KdlProxyConfigResponse:
        """Return KDL proxy config."""
        try:
            content = read_proxy_config_file()
            if content is None:
                return KdlProxyConfigResponse()
            return KdlProxyConfigResponse(
                kdl_secert_id=extract_config_value(content, "KDL_SECERT_ID", "str") or "",
                kdl_signature=extract_config_value(content, "KDL_SIGNATURE", "str") or "",
                kdl_user_name=extract_config_value(content, "KDL_USER_NAME", "str") or "",
                kdl_user_pwd=extract_config_value(content, "KDL_USER_PWD", "str") or "",
            )
        except Exception as exc:
            logger.error("获取代理配置失败: %s", exc)
            return KdlProxyConfigResponse()

    @router.post("/proxy-config")
    async def update_proxy_config(config: KdlProxyConfigUpdate) -> dict[str, Any]:
        """Persist KDL proxy config."""
        try:
            content = read_proxy_config_file()
            if content is None:
                raise HTTPException(status_code=503, detail=PLUGIN_NOT_INSTALLED_MSG)

            updates = {
                "KDL_SECERT_ID": config.kdl_secert_id,
                "KDL_SIGNATURE": config.kdl_signature,
                "KDL_USER_NAME": config.kdl_user_name,
                "KDL_USER_PWD": config.kdl_user_pwd,
            }
            for key, value in updates.items():
                if value is not None:
                    content = update_proxy_config_line(content, key, value)

            write_proxy_config_file(content)
            logger.info("快代理配置已更新")
            return {"success": True, "message": "快代理配置已保存"}
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("更新代理配置失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"更新代理配置失败: {exc!s}") from exc
