# ruff: noqa: C901, DTZ005, PLC0415, PLR0915, PLR2004, SIM117, TC003
"""Crawler daily summary and video download routes."""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from routers.crawler_common import (
    get_videos_download_dir,
    logger,
    try_get_transcripts_dir,
    try_get_videos_download_dir,
)
from routers.crawler_results import (
    get_platform_data_dir,
    normalize_content_item,
    read_csv_file,
)

PLATFORM_CHINESE_NAMES = {
    "xhs": "小红书",
    "douyin": "抖音",
    "bilibili": "哔哩哔哩",
    "weibo": "微博",
    "kuaishou": "快手",
    "zhihu": "知乎",
    "tieba": "贴吧",
}

ALL_PLATFORMS = ["xhs", "douyin", "bilibili", "kuaishou", "zhihu", "tieba", "weibo"]

PLATFORM_REFERER_MAP = {
    "xhs": "https://www.xiaohongshu.com/",
    "douyin": "https://www.douyin.com/",
    "bilibili": "https://www.bilibili.com/",
    "kuaishou": "https://www.kuaishou.com/",
    "weibo": "https://m.weibo.cn/",
}


def get_today_data_for_all_platforms() -> dict[str, list[dict[str, Any]]]:
    """Return today's content across supported platforms."""
    today = datetime.now().strftime("%Y-%m-%d")
    all_data: dict[str, list[dict[str, Any]]] = {}
    for platform in ALL_PLATFORMS:
        data_dir = get_platform_data_dir(platform, require=False)
        if data_dir is None or not data_dir.exists():
            continue
        platform_contents: list[dict[str, Any]] = []
        for content_file in data_dir.glob(f"*search_contents_{today}*.csv"):
            platform_contents.extend(
                normalize_content_item(item, platform) for item in read_csv_file(content_file)
            )
        if platform_contents:
            all_data[platform] = platform_contents
            logger.info("[Daily Summary] 平台 %s 今日数据: %s 条", platform, len(platform_contents))
    return all_data


def get_today_transcripts() -> dict[str, list[dict[str, str]]]:
    """Return today's transcripts grouped by platform."""
    today = datetime.now().strftime("%Y-%m-%d")
    transcripts_dir = try_get_transcripts_dir()
    if transcripts_dir is None or not transcripts_dir.exists():
        return {}

    all_transcripts: dict[str, list[dict[str, str]]] = {}
    for platform_dir in transcripts_dir.iterdir():
        if not platform_dir.is_dir():
            continue
        platform_transcripts = []
        for transcript_file in platform_dir.glob(f"*_{today}.txt"):
            try:
                title = ""
                content_id = ""
                transcript_lines: list[str] = []
                in_transcript = False
                for line in transcript_file.read_text(encoding="utf-8").splitlines():
                    if line.startswith("标题: "):
                        title = line[4:].strip()
                    elif line.startswith("内容ID: "):
                        content_id = line[6:].strip()
                    elif "转写文本" in line:
                        in_transcript = True
                    elif in_transcript:
                        transcript_lines.append(line)
                transcript_text = "\n".join(transcript_lines).strip()
                if transcript_text:
                    platform_transcripts.append(
                        {
                            "title": title,
                            "content_id": content_id,
                            "transcript": transcript_text,
                            "file_name": transcript_file.name,
                        }
                    )
            except Exception as exc:
                logger.warning("[Daily Summary] 读取转写文件失败 %s: %s", transcript_file, exc)
        if platform_transcripts:
            all_transcripts[platform_dir.name] = platform_transcripts
            logger.info(
                "[Daily Summary] 平台 %s 今日转写: %s 条",
                platform_dir.name,
                len(platform_transcripts),
            )
    return all_transcripts


def build_summary_prompt(
    all_data: dict[str, list[dict[str, Any]]],
    all_transcripts: dict[str, list[dict[str, str]]] | None = None,
) -> str:
    """Build the daily summary LLM prompt."""
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
        total_count += len(contents)
        prompt_parts.append(
            f"- {PLATFORM_CHINESE_NAMES.get(platform, platform)}: {len(contents)} 条内容"
        )
    total_transcripts = (
        sum(len(items) for items in all_transcripts.values()) if all_transcripts else 0
    )
    prompt_parts.extend(
        [
            f"- 总计: {total_count} 条内容",
            f"- 视频转写文本: {total_transcripts} 条",
            "",
            "## 各平台内容详情（完整列表）",
        ]
    )

    for platform, contents in all_data.items():
        prompt_parts.extend(["", f"### {PLATFORM_CHINESE_NAMES.get(platform, platform)}"])
        for index, item in enumerate(contents, start=1):
            title = item.get("title", "")
            desc = item.get("desc", "")
            content_text = title or desc[:200] or "无标题"
            prompt_parts.extend(
                [
                    "",
                    f"**[内容{index}] {content_text}**",
                    f"- 作者: {item.get('nickname', '')}",
                    f"- 互动数据: 点赞 {item.get('liked_count', 0)}, 评论 {item.get('comment_count', 0)}, 收藏 {item.get('collected_count', 0)}, 分享 {item.get('share_count', 0)}",
                ]
            )
            if desc and desc != title:
                prompt_parts.append(f"- 描述: {desc[:500]}")

    if all_transcripts:
        prompt_parts.extend(["", "## 视频转写文本（语音转文字）", ""])
        for platform, transcripts in all_transcripts.items():
            prompt_parts.extend(
                ["", f"### {PLATFORM_CHINESE_NAMES.get(platform, platform)} 视频转写"]
            )
            for index, item in enumerate(transcripts, start=1):
                transcript = item.get("transcript", "")
                preview = transcript[:1000]
                prompt_parts.extend(
                    [
                        "",
                        f"**[转写{index}] {item.get('title', '未知标题')}**",
                        "```",
                        preview,
                        f"... (内容过长，已截断，原文共 {len(transcript)} 字)"
                        if len(transcript) > 1000
                        else "",
                        "```",
                    ]
                )

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
    return "\n".join(part for part in prompt_parts if part != "")


def get_today_videos_for_all_platforms() -> list[dict[str, str]]:
    """Return today's crawled videos across platforms."""
    today = datetime.now().strftime("%Y-%m-%d")
    all_videos = []
    for platform in ALL_PLATFORMS:
        data_dir = get_platform_data_dir(platform, require=False)
        if data_dir is None or not data_dir.exists():
            continue
        for content_file in data_dir.glob(f"*search_contents_{today}*.csv"):
            for item in (
                normalize_content_item(row, platform) for row in read_csv_file(content_file)
            ):
                video_url = item.get("video_url") or item.get("video_download_url")
                if not video_url or item.get("type") != "video":
                    continue
                title = (
                    item.get("title", "") or item.get("desc", "")[:30] or item.get("note_id", "")
                )
                all_videos.append(
                    {
                        "platform": platform,
                        "note_id": item.get("note_id", ""),
                        "title": title,
                        "safe_title": re.sub(r'[\\/:*?"<>|\r\n]', "_", title)[:50],
                        "video_url": video_url,
                        "nickname": item.get("nickname", ""),
                    }
                )
    return all_videos


async def download_video(
    video_url: str,
    save_path: Path,
    platform: str,
    timeout: int = 60,
) -> tuple[bool, str]:
    """Download a single video to disk."""
    try:
        save_path.parent.mkdir(parents=True, exist_ok=True)
        if save_path.exists() and save_path.stat().st_size > 0:
            logger.info("[Video Download] 文件已存在，跳过: %s", save_path.name)
            return True, str(save_path)

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": PLATFORM_REFERER_MAP.get(platform, "https://www.xiaohongshu.com/"),
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "zh-CN,zh;q=0.9",
        }
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            async with client.stream("GET", video_url, headers=headers) as response:
                if response.status_code != 200:
                    return False, f"HTTP {response.status_code}"
                with save_path.open("wb") as handle:
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        handle.write(chunk)
        logger.info("[Video Download] 下载完成: %s", save_path.name)
        return True, str(save_path)
    except Exception as exc:
        logger.error("[Video Download] 下载失败 %s: %s", save_path.name, exc)
        if save_path.exists():
            try:
                save_path.unlink()
            except OSError as delete_error:
                logger.warning(
                    "[Video Download] 删除不完整文件失败 %s: %s", save_path, delete_error
                )
        return False, str(exc)


def register_routes(router: APIRouter) -> None:
    """Register daily summary and video download routes."""

    @router.get("/daily-summary")
    async def get_daily_summary() -> StreamingResponse:
        """Stream an AI summary for today's crawler output."""
        from llm.llm_client import LLMClient

        try:
            all_data = get_today_data_for_all_platforms()
            all_transcripts = get_today_transcripts()
            if not all_data and not all_transcripts:

                async def no_data_stream():
                    yield "## 暂无今日数据\n\n今天还没有爬取任何内容，请先启动爬虫获取数据后再生成总结。"

                return StreamingResponse(
                    no_data_stream(),
                    media_type="text/plain; charset=utf-8",
                    headers={"Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"},
                )

            prompt = build_summary_prompt(all_data, all_transcripts)
            llm_client = LLMClient()
            if not llm_client.is_available():

                async def error_stream():
                    yield "## AI 服务不可用\n\nLLM 客户端未配置或不可用，请检查 API Key 配置。"

                return StreamingResponse(
                    error_stream(),
                    media_type="text/plain; charset=utf-8",
                    headers={"Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"},
                )

            messages = [
                {
                    "role": "system",
                    "content": "你是一个专业的社交媒体内容分析师，擅长总结和分析各平台的热门内容趋势。请用清晰的 Markdown 格式输出分析结果。",
                },
                {"role": "user", "content": prompt},
            ]

            async def generate_summary():
                try:
                    for chunk in llm_client.stream_chat(messages, temperature=0.7):
                        yield chunk
                except Exception as exc:
                    error_msg = str(exc)
                    logger.error("[Daily Summary] 生成总结失败: %s", error_msg)
                    if "inappropriate" in error_msg.lower() or "content" in error_msg.lower():
                        yield "\n\n---\n\n## ⚠️ 内容审核提示\n\nAI 模型检测到爬取的内容可能包含敏感词汇，无法生成完整摘要。\n\n**建议：**\n- 点击 **更新AI摘要** 重新尝试生成\n- 如果问题持续，可以查看下方的热点内容列表\n"
                    else:
                        yield f"\n\n---\n\n**错误**: 生成总结时发生错误: {error_msg}"

            return StreamingResponse(
                generate_summary(),
                media_type="text/plain; charset=utf-8",
                headers={"Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"},
            )
        except Exception as exc:
            logger.error("[Daily Summary] 获取今日总结失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"获取今日总结失败: {exc!s}") from exc

    @router.post("/download-today-videos")
    async def download_today_videos() -> StreamingResponse:
        """Stream progress while downloading today's videos."""
        try:
            videos = get_today_videos_for_all_platforms()
            if not videos:

                async def no_videos_stream():
                    yield '{"type": "complete", "message": "今天没有爬取到视频内容", "total": 0, "success": 0, "failed": 0}\n'

                return StreamingResponse(
                    no_videos_stream(),
                    media_type="application/x-ndjson",
                    headers={"Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"},
                )

            today = datetime.now().strftime("%Y-%m-%d")

            async def download_stream():
                total = len(videos)
                success_count = 0
                failed_count = 0
                yield f'{{"type": "start", "total": {total}, "message": "开始下载今日视频"}}\n'
                for index, video in enumerate(videos, start=1):
                    save_path = (
                        get_videos_download_dir()
                        / today
                        / video["platform"]
                        / f"{video['note_id']}_{video['safe_title']}.mp4"
                    )
                    progress = {
                        "type": "progress",
                        "current": index,
                        "total": total,
                        "platform": video["platform"],
                        "title": video["title"][:30],
                        "status": "downloading",
                    }
                    yield json.dumps(progress, ensure_ascii=False) + "\n"
                    success, result = await download_video(
                        video["video_url"], save_path, video["platform"]
                    )
                    if success:
                        success_count += 1
                        progress["status"] = "success"
                    else:
                        failed_count += 1
                        progress["status"] = "failed"
                        progress["error"] = result
                    yield json.dumps(progress, ensure_ascii=False) + "\n"

                yield (
                    json.dumps(
                        {
                            "type": "complete",
                            "total": total,
                            "success": success_count,
                            "failed": failed_count,
                            "message": f"下载完成: 成功 {success_count}/{total}，失败 {failed_count}",
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                logger.info("[Video Download] 今日视频下载完成: 成功 %s/%s", success_count, total)

            return StreamingResponse(
                download_stream(),
                media_type="application/x-ndjson",
                headers={"Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*"},
            )
        except Exception as exc:
            logger.error("[Video Download] 下载今日视频失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"下载今日视频失败: {exc!s}") from exc

    @router.get("/download-today-videos/status")
    async def get_download_status() -> dict[str, Any]:
        """Return today's video download summary."""
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            base_dir = try_get_videos_download_dir()
            if base_dir is None:
                return {"downloaded": 0, "total_size": 0, "platforms": {}}

            videos_dir = base_dir / today
            if not videos_dir.exists():
                return {"downloaded": 0, "total_size": 0, "platforms": {}}

            platforms: dict[str, dict[str, float | int]] = {}
            total_count = 0
            total_size = 0
            for platform_dir in videos_dir.iterdir():
                if not platform_dir.is_dir():
                    continue
                files = list(platform_dir.glob("*.mp4"))
                size = sum(file.stat().st_size for file in files)
                platforms[platform_dir.name] = {
                    "count": len(files),
                    "size": size,
                    "size_mb": round(size / (1024 * 1024), 2),
                }
                total_count += len(files)
                total_size += size

            return {
                "downloaded": total_count,
                "total_size": total_size,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "platforms": platforms,
                "directory": str(videos_dir),
            }
        except Exception as exc:
            logger.error("[Video Download] 获取下载状态失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"获取下载状态失败: {exc!s}") from exc
