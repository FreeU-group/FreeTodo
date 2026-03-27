# ruff: noqa: C901, DTZ005, DTZ006, PLR0912, PLR0915, PLR2004, TC003
"""Crawler data normalization and result listing routes."""

from __future__ import annotations

import csv
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from .common import (
    extract_config_value,
    get_crawler_dir,
    logger,
    read_config_file,
    try_get_crawler_dir,
)
from .media import get_proxied_avatar_url, get_proxied_image_url
from .runtime import runtime_state

PLATFORM_FIELD_MAPPING = {
    "aweme_id": "note_id",
    "aweme_url": "note_url",
    "cover_url": "image_list",
    "aweme_type": "type",
    "video_play_url": "video_download_url",
    "video_cover_url": "image_list",
}


def get_platform_data_dir(platform: str, *, require: bool = True) -> Path | None:
    """Return the raw platform data directory."""
    crawler_dir = get_crawler_dir() if require else try_get_crawler_dir()
    return crawler_dir / "data" / platform if crawler_dir else None


def parse_count_value(value: str | None) -> int:
    """Parse integer or `10万+`-style counts."""
    if not value:
        return 0
    try:
        text = str(value).strip()
        if "万+" in text:
            return int(float(text.replace("万+", "")) * 10000)
        if "万" in text:
            return int(float(text.replace("万", "")) * 10000)
        return int(float(text))
    except (TypeError, ValueError):
        return 0


def read_csv_file(file_path: Path) -> list[dict[str, Any]]:
    """Read a CSV file into dictionaries."""
    if not file_path.exists():
        return []
    results: list[dict[str, Any]] = []
    try:
        with file_path.open(encoding="utf-8-sig") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames:
                logger.info("[CSV] 文件 %s 的列名: %s", file_path.name, reader.fieldnames)
            results.extend(dict(row) for row in reader)
    except Exception as exc:
        logger.error("读取CSV文件失败 %s: %s", file_path, exc)
    return results


def normalize_content_item(item: dict[str, Any], platform: str) -> dict[str, Any]:
    """Normalize platform-specific content data into one schema."""
    normalized = {PLATFORM_FIELD_MAPPING.get(key, key): value for key, value in item.items()}

    if platform in ["douyin", "dy"] and normalized.get("type") == "0":
        normalized["type"] = "video"
    elif platform in ["kuaishou", "ks"]:
        if "video_id" in item:
            normalized["note_id"] = item["video_id"]
        if "video_url" in item:
            normalized["note_url"] = item["video_url"]
        if "video_type" in item:
            normalized["type"] = "video" if item["video_type"] == "1" else item["video_type"]
        if "viewd_count" in item:
            normalized["share_count"] = item["viewd_count"]
    elif platform in ["bilibili", "bili"]:
        if "bvid" in item:
            normalized["note_id"] = item["bvid"]
        if "video_url" in item:
            normalized["note_url"] = item["video_url"]
        if "video_id" in item:
            normalized["video_id"] = str(item["video_id"])
        normalized["type"] = "video"
        if "video_play_count" in item:
            normalized["share_count"] = item["video_play_count"]
        if "video_comment" in item:
            normalized["comment_count"] = item["video_comment"]
    elif platform == "zhihu":
        if "content_id" in item:
            normalized["note_id"] = str(item["content_id"])
            normalized["content_id"] = str(item["content_id"])
        if "content_url" in item:
            normalized["note_url"] = item["content_url"]
        if "content_type" in item:
            normalized["type"] = item["content_type"]
        for source_key, target_key in {
            "user_avatar": "avatar",
            "user_nickname": "nickname",
            "voteup_count": "liked_count",
            "created_time": "time",
        }.items():
            if source_key in item:
                normalized[target_key] = item[source_key]
        if "user_id" in item:
            normalized["user_id"] = item["user_id"]
    elif platform in ["weibo", "wb"]:
        if "content" in item:
            normalized["desc"] = item["content"]
        for field in ["avatar", "image_list"]:
            if isinstance(normalized.get(field), str):
                normalized[field] = normalized[field].strip('"').strip("'")
        if "create_date_time" in item:
            normalized["time"] = item["create_date_time"]
        for source_key, target_key in {
            "liked_count": "liked_count",
            "comments_count": "comment_count",
            "shared_count": "share_count",
        }.items():
            if source_key in item:
                normalized[target_key] = item[source_key]
    elif platform == "tieba":
        if "user_avatar" in item:
            normalized["avatar"] = item["user_avatar"]
        if "user_nickname" in item:
            normalized["nickname"] = item["user_nickname"]
        if "total_replay_num" in item:
            normalized["comment_count"] = item["total_replay_num"]
        if "publish_time" in item:
            normalized["time"] = item["publish_time"]

    if not normalized.get("video_url") and normalized.get("video_download_url"):
        normalized["video_url"] = normalized["video_download_url"]
    return normalized


def normalize_comment_item(item: dict[str, Any], platform: str) -> dict[str, Any]:
    """Normalize platform-specific comment data."""
    del platform
    return {PLATFORM_FIELD_MAPPING.get(key, key): value for key, value in item.items()}


def find_recent_data_files(platform: str, days: int = 2) -> list[tuple[Path, Path | None]]:
    """Find recent `(contents, comments)` file pairs for a platform."""
    data_dir = get_platform_data_dir(platform, require=False)
    if data_dir is None or not data_dir.exists():
        return []

    valid_dates = {
        (datetime.now().date() - timedelta(days=offset)).strftime("%Y-%m-%d")
        for offset in range(days)
    }
    content_files = list(data_dir.glob("*search_contents_*.csv"))
    results: list[tuple[Path, Path | None]] = []
    for content_file in content_files:
        match = re.search(r"(\d{4}-\d{2}-\d{2})", content_file.name)
        if not match or match.group(1) not in valid_dates:
            continue
        comment_file = data_dir / content_file.name.replace("_contents_", "_comments_")
        results.append((content_file, comment_file if comment_file.exists() else None))
    results.sort(key=lambda item: item[0].stat().st_mtime, reverse=True)
    logger.info("[find_recent_data_files] 平台 %s 找到 %s 个符合条件的文件", platform, len(results))
    return results


def get_all_data_files(platform: str) -> list[dict[str, Any]]:
    """List all content files for a platform."""
    data_dir = get_platform_data_dir(platform, require=False)
    if data_dir is None or not data_dir.exists():
        return []

    files: list[dict[str, Any]] = []
    for file_path in data_dir.glob("*search_contents_*.csv"):
        parts = file_path.name.split("_")
        if len(parts) >= 4:
            file_index, date_part = parts[0], parts[3].replace(".csv", "")
        elif len(parts) >= 3 and parts[0] == "search":
            file_index, date_part = "1", parts[2].replace(".csv", "")
        else:
            continue

        files.append(
            {
                "filename": file_path.name,
                "path": str(file_path),
                "index": file_index,
                "date": date_part,
                "modified_time": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                "size": file_path.stat().st_size,
            }
        )
    files.sort(key=lambda item: item["modified_time"], reverse=True)
    return files


def _dedupe_contents(
    platform: str, file_pairs: list[tuple[Path, Path | None]]
) -> tuple[list[dict[str, Any]], list[Path]]:
    contents: list[dict[str, Any]] = []
    seen_note_ids: set[str] = set()
    comment_files: list[Path] = []
    for content_file, comment_file in file_pairs:
        logger.info("[Crawler Results] 读取文件: %s", content_file.name)
        for item in read_csv_file(content_file):
            normalized = normalize_content_item(item, platform)
            note_id = (
                normalized.get("note_id", "")
                or normalized.get("video_id", "")
                or normalized.get("content_id", "")
            )
            if note_id and note_id in seen_note_ids:
                continue
            if note_id:
                seen_note_ids.add(note_id)
            contents.append(normalized)
        if comment_file:
            comment_files.append(comment_file)
    return contents, comment_files


def _filter_blacklist(contents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    try:
        config_content = read_config_file(require=False)
        blacklist_str = (
            extract_config_value(config_content, "BLACKLIST_NICKNAMES", "str")
            if config_content
            else ""
        )
        if not blacklist_str:
            return contents
        blacklist = [
            name.strip() for name in blacklist_str.replace("，", ",").split(",") if name.strip()
        ]
        if not blacklist:
            return contents
        filtered = [item for item in contents if item.get("nickname", "") not in blacklist]
        logger.info("[Crawler Results] 黑名单过滤后剩余 %s 条内容", len(filtered))
        return filtered
    except Exception as exc:
        logger.warning("[Crawler Results] 读取黑名单配置失败: %s", exc)
        return contents


def _filter_excluded_keywords(contents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not runtime_state.excluded_keywords:
        return contents
    filtered = []
    for item in contents:
        title = item.get("title", "").lower()
        desc = item.get("desc", "").lower()
        if any(
            keyword.lower() in title or keyword.lower() in desc
            for keyword in runtime_state.excluded_keywords
        ):
            continue
        filtered.append(item)
    logger.info("[Crawler Results] 排除关键词过滤后剩余 %s 条内容", len(filtered))
    return filtered


def _comment_assoc_id(item: dict[str, Any], platform: str) -> str:
    if platform in ["bilibili", "bili", "kuaishou", "ks"]:
        return str(item.get("video_id", ""))
    if platform == "zhihu":
        return str(item.get("content_id", ""))
    return str(item.get("note_id", "") or item.get("aweme_id", ""))


def _load_comments(platform: str, comment_files: list[Path]) -> dict[str, list[dict[str, Any]]]:
    comments_by_note: dict[str, list[dict[str, Any]]] = {}
    seen_comments: set[str] = set()
    for comment_file in comment_files:
        for raw_comment in read_csv_file(comment_file):
            comment = normalize_comment_item(raw_comment, platform)
            assoc_id = _comment_assoc_id(comment, platform)
            comment_id = str(comment.get("comment_id", ""))
            dedup_key = f"{comment_id}_{assoc_id}"
            if not assoc_id or dedup_key in seen_comments:
                continue
            seen_comments.add(dedup_key)
            nickname = comment.get("nickname", "") or comment.get("user_nickname", "")
            avatar = comment.get("avatar", "") or comment.get("user_avatar", "")
            comments_by_note.setdefault(assoc_id, []).append(
                {
                    "id": comment_id,
                    "content": comment.get("content", ""),
                    "createTime": comment.get("create_time", "") or comment.get("publish_time", ""),
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
    return comments_by_note


def _extract_tags(item: dict[str, Any]) -> list[str]:
    tag_list = item.get("tag_list", "")
    if tag_list:
        return [f"#{tag.strip()}[话题]#" for tag in tag_list.split(",") if tag.strip()]
    hashtags = re.findall(r"#([^\s#]+)", item.get("desc", ""))
    return [f"#{tag}[话题]#" for tag in hashtags[:5]]


def build_frontend_results(
    contents: list[dict[str, Any]],
    platform: str,
    limit: int,
    comments_by_note: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Build the frontend response shape."""
    results = []
    for item in contents[:limit]:
        note_id = item.get("note_id", "")
        comment_assoc_id = _comment_assoc_id(item, platform) or str(note_id)
        first_image = item.get("image_list", "").split(",")[0] if item.get("image_list") else ""
        results.append(
            {
                "id": note_id,
                "noteId": note_id,
                "type": item.get("type", "normal"),
                "title": item.get("title", ""),
                "desc": item.get("desc", ""),
                "tags": _extract_tags(item),
                "hasVideo": item.get("type", "") == "video" or bool(item.get("video_url")),
                "videoUrl": item.get("video_url", ""),
                "videoDownloadUrl": item.get("video_download_url", ""),
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
        )
    return results


def register_routes(router: APIRouter) -> None:
    """Register crawler result routes."""

    @router.get("/results")
    async def get_crawler_results(
        platform: str = "xhs",
        limit: int = 50,
        include_comments: bool = True,
    ) -> dict[str, Any]:
        """Return recent crawler results for a platform."""
        try:
            recent_files = find_recent_data_files(platform, days=2)
            if not recent_files:
                return {"success": True, "results": [], "total_count": 0, "message": "暂无数据"}

            contents, comment_files = _dedupe_contents(platform, recent_files)
            contents = _filter_excluded_keywords(_filter_blacklist(contents))
            comments_by_note = _load_comments(platform, comment_files) if include_comments else {}
            return {
                "success": True,
                "results": build_frontend_results(contents, platform, limit, comments_by_note),
                "total_count": len(contents),
                "files_count": len(recent_files),
            }
        except Exception as exc:
            logger.error("获取爬取结果失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"获取爬取结果失败: {exc!s}") from exc

    @router.get("/results/files")
    async def get_data_files(platform: str = "xhs") -> dict[str, Any]:
        """Return all content files for a platform."""
        try:
            return {"success": True, "files": get_all_data_files(platform)}
        except Exception as exc:
            logger.error("获取数据文件列表失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"获取数据文件列表失败: {exc!s}") from exc

    @router.get("/results/file/{filename}")
    async def get_results_by_file(
        filename: str,
        platform: str = "xhs",
        limit: int = 50,
        include_comments: bool = True,
    ) -> dict[str, Any]:
        """Return crawler results for one content file."""
        try:
            data_dir = get_platform_data_dir(platform, require=False)
            if data_dir is None:
                return {"success": True, "results": [], "total_count": 0, "file": filename}

            content_file = data_dir / filename
            if not content_file.exists():
                raise HTTPException(status_code=404, detail=f"文件不存在: {filename}")

            comment_file = data_dir / filename.replace("_contents_", "_comments_")
            contents = [
                normalize_content_item(item, platform) for item in read_csv_file(content_file)
            ]
            comments_by_note = (
                _load_comments(platform, [comment_file])
                if include_comments and comment_file.exists()
                else {}
            )
            return {
                "success": True,
                "results": build_frontend_results(contents, platform, limit, comments_by_note),
                "total_count": len(contents),
                "file": filename,
            }
        except HTTPException:
            raise
        except Exception as exc:
            logger.error("获取文件爬取结果失败: %s", exc)
            raise HTTPException(status_code=500, detail=f"获取文件爬取结果失败: {exc!s}") from exc
