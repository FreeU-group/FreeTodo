# ruff: noqa: C901, PLR2004, SIM117
"""Crawler media proxy helpers and routes."""

from __future__ import annotations

from urllib.parse import quote, unquote

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from routers.crawler_common import logger

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

PLATFORMS_NEED_IMAGE_PROXY = ["weibo", "wb", "tieba"]


def _normalized_remote_url(url: str) -> str:
    remote_url = unquote(url).strip('"').strip("'")
    if remote_url.startswith("//"):
        return f"https:{remote_url}"
    return remote_url


def get_proxied_avatar_url(avatar: str, platform: str) -> str:
    """Return a proxied avatar URL when required by the platform."""
    if not avatar:
        return ""
    normalized = _normalized_remote_url(avatar)
    if platform in PLATFORMS_NEED_IMAGE_PROXY:
        return f"/api/crawler/image/proxy?url={quote(normalized, safe='')}&platform={platform}"
    return normalized


def get_proxied_image_url(image_url: str, platform: str) -> str:
    """Return a proxied image URL when required by the platform."""
    if not image_url:
        return ""
    normalized = _normalized_remote_url(image_url)
    if platform in PLATFORMS_NEED_IMAGE_PROXY:
        return f"/api/crawler/image/proxy?url={quote(normalized, safe='')}&platform={platform}"
    return normalized


def register_routes(router: APIRouter) -> None:
    """Register crawler media proxy routes."""

    @router.get("/video/proxy")
    async def proxy_video(url: str, platform: str = "douyin") -> StreamingResponse:
        """Proxy a remote video stream for the browser."""
        try:
            video_url = _normalized_remote_url(url)
            headers = PLATFORM_VIDEO_HEADERS.get(platform, PLATFORM_VIDEO_HEADERS["douyin"]).copy()
            logger.info(
                "[Video Proxy] 代理视频请求 - 平台: %s, URL: %s...", platform, video_url[:100]
            )

            async def stream_video():
                async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
                    async with client.stream("GET", video_url, headers=headers) as response:
                        if response.status_code != 200:
                            logger.error("[Video Proxy] 视频请求失败: %s", response.status_code)
                            return
                        async for chunk in response.aiter_bytes(chunk_size=65536):
                            yield chunk

            return StreamingResponse(
                stream_video(),
                media_type="video/mp4",
                headers={
                    "Accept-Ranges": "bytes",
                    "Cache-Control": "no-cache",
                    "Access-Control-Allow-Origin": "*",
                },
            )
        except Exception as exc:
            logger.error("[Video Proxy] 代理视频失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"视频代理失败: {exc!s}") from exc

    @router.head("/video/proxy")
    async def proxy_video_head(url: str, platform: str = "douyin") -> StreamingResponse:
        """Proxy a remote video HEAD request for metadata."""
        try:
            video_url = _normalized_remote_url(url)
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
        except Exception as exc:
            logger.error("[Video Proxy] HEAD 请求失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"视频代理失败: {exc!s}") from exc

    @router.get("/image/proxy")
    async def proxy_image(url: str, platform: str = "weibo") -> StreamingResponse:
        """Proxy a remote image for the browser."""
        try:
            image_url = _normalized_remote_url(url)
            logger.info(
                "[Image Proxy] 代理图片请求 - 平台: %s, URL: %s...", platform, image_url[:80]
            )
            headers = PLATFORM_VIDEO_HEADERS.get(
                platform,
                {
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                },
            ).copy()
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(image_url, headers=headers)
            if response.status_code != 200:
                logger.error("[Image Proxy] 图片请求失败: %s", response.status_code)
                raise HTTPException(status_code=response.status_code, detail="图片获取失败")
            return StreamingResponse(
                iter([response.content]),
                media_type=response.headers.get("Content-Type", "image/jpeg"),
                headers={
                    "Cache-Control": "public, max-age=86400",
                    "Access-Control-Allow-Origin": "*",
                },
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("[Image Proxy] 图片代理失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"图片代理失败: {exc!s}") from exc
