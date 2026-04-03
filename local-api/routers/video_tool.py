"""视频工具：从 URL 下载视频 → 提取音频 → 语音识别 → 生成 Markdown"""

from __future__ import annotations

import asyncio
import json
import re
import shutil
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from pydantic import BaseModel

from util.base_paths import get_user_data_dir
from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

router = APIRouter(prefix="/api/video-tool", tags=["video-tool"])

TOOL_DATA_DIR = get_user_data_dir() / "video_tool"
TOOL_DATA_DIR.mkdir(parents=True, exist_ok=True)

PLATFORM_HEADERS = {
    "douyin": {
        "referer": "https://www.douyin.com/",
        "origin": "https://www.douyin.com",
    },
    "xhs": {
        "referer": "https://www.xiaohongshu.com/",
        "origin": "https://www.xiaohongshu.com",
    },
    "bilibili": {
        "referer": "https://www.bilibili.com/",
        "origin": "https://www.bilibili.com",
    },
    "kuaishou": {
        "referer": "https://www.kuaishou.com/",
        "origin": "https://www.kuaishou.com",
    },
    "weibo": {
        "referer": "https://m.weibo.cn/",
        "origin": "https://m.weibo.cn",
    },
}

COMMON_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _detect_platform(url: str) -> str:
    """从 URL 推断平台。"""
    url_lower = url.lower()
    if "douyin" in url_lower or "iesdouyin" in url_lower:
        return "douyin"
    if "xiaohongshu" in url_lower or "xhslink" in url_lower or "xhs" in url_lower:
        return "xhs"
    if "bilibili" in url_lower or "b23.tv" in url_lower:
        return "bilibili"
    if "kuaishou" in url_lower:
        return "kuaishou"
    if "weibo" in url_lower:
        return "weibo"
    return "unknown"


def _normalize_url(url: str, platform: str) -> str:
    """将各种社交媒体 URL 格式统一为 yt-dlp 可识别的标准视频链接。"""
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)

    if platform == "douyin":
        vid = qs.get("vid", qs.get("modal_id", [None]))[0] if qs else None
        if vid and "/video/" not in parsed.path:
            return f"https://www.douyin.com/video/{vid}"
        m = re.search(r"/video/(\d+)", parsed.path)
        if m:
            return f"https://www.douyin.com/video/{m.group(1)}"
        m = re.search(r"/note/(\d+)", parsed.path)
        if m:
            return f"https://www.douyin.com/note/{m.group(1)}"

    if platform == "xhs":
        m = re.search(r"/(?:explore|discovery/item)/([a-f0-9]+)", parsed.path)
        if m:
            return f"https://www.xiaohongshu.com/explore/{m.group(1)}"

    return url


def _get_crawler_cookies(platform: str) -> str | None:
    """从爬虫系统的 accounts_cookies.xlsx 读取平台 cookie 字符串。"""
    try:
        from services.plugin_manager import media_crawler_plugin as _plugin

        crawler_dir = _plugin.resolve_crawler_dir()
        if crawler_dir is None:
            return None

        cookies_path = crawler_dir / "config" / "accounts_cookies.xlsx"
        if not cookies_path.exists():
            return None

        import pandas as pd

        platform_key = {
            "douyin": "douyin",
            "dy": "douyin",
            "xhs": "xhs",
            "xiaohongshu": "xhs",
            "bilibili": "bilibili",
            "bili": "bilibili",
            "kuaishou": "kuaishou",
            "ks": "kuaishou",
            "weibo": "weibo",
            "wb": "weibo",
        }.get(platform, platform)

        xlsx = pd.ExcelFile(cookies_path, engine="openpyxl")
        if platform_key not in xlsx.sheet_names:
            xlsx.close()
            return None
        df = pd.read_excel(xlsx, sheet_name=platform_key, engine="openpyxl")
        xlsx.close()

        for _, row in df.iterrows():
            cookie_str = str(row.get("cookies", ""))
            if cookie_str and cookie_str != "nan" and len(cookie_str) > 10:
                return cookie_str
        return None
    except Exception as e:
        logger.debug(f"[video-tool] Failed to read crawler cookies: {e}")
        return None


def _write_netscape_cookie_file(cookie_str: str, domain: str, output_path: Path) -> None:
    """将 'key1=value1; key2=value2' 格式的 cookie 字符串转换为 Netscape cookie 文件。"""
    lines = ["# Netscape HTTP Cookie File", ""]
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" not in part:
            continue
        name, value = part.split("=", 1)
        lines.append(f"{domain}\tTRUE\t/\tFALSE\t0\t{name.strip()}\t{value.strip()}")
    output_path.write_text("\n".join(lines), encoding="utf-8")


PLATFORM_COOKIE_DOMAINS = {
    "douyin": ".douyin.com",
    "xhs": ".xiaohongshu.com",
    "bilibili": ".bilibili.com",
    "kuaishou": ".kuaishou.com",
    "weibo": ".weibo.com",
}


def _get_task_dir(task_id: str) -> Path:
    d = TOOL_DATA_DIR / task_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _is_direct_video_url(url: str) -> bool:
    """判断是否是直接的视频文件 URL（CDN 链接）而非社交媒体页面链接。"""
    url_lower = url.lower().split("?")[0]
    if any(url_lower.endswith(ext) for ext in (".mp4", ".m4v", ".webm", ".flv", ".mkv", ".mov")):
        return True
    video_cdn_hints = [
        "douyinvod.",
        "snssdk.",
        "amemv.com",
        "pstatp.com",
        "sns-video",
        "xhscdn.",
        "xiaohongshu.com/spectrum",
        "bilivideo.",
        "upos-hz-mirrorakam",
    ]
    if any(hint in url_lower for hint in video_cdn_hints):
        return True
    return False


async def _extract_video_url_with_playwright(
    page_url: str, cookie_str: str | None, platform: str
) -> tuple[str | None, str]:
    """用 Playwright（类似 MediaCrawler）打开页面，通过渲染 JS 提取视频直链。"""
    from playwright.async_api import async_playwright

    domain = PLATFORM_COOKIE_DOMAINS.get(platform, f".{platform}.com")

    pw_cookies = []
    if cookie_str:
        for part in cookie_str.split(";"):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                pw_cookies.append(
                    {
                        "name": k.strip(),
                        "value": v.strip(),
                        "domain": domain,
                        "path": "/",
                    }
                )

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            context = await browser.new_context(
                user_agent=COMMON_UA,
                viewport={"width": 1280, "height": 720},
            )
            if pw_cookies:
                await context.add_cookies(pw_cookies)

            page = await context.new_page()
            captured: list[str] = []

            def _on_response(resp):
                u = resp.url
                if any(h in u for h in ("douyinvod", "xhscdn", "sns-video", "bilivideo")):
                    captured.append(u)

            page.on("response", _on_response)

            await page.goto(page_url, wait_until="domcontentloaded", timeout=30000)
            try:
                await page.wait_for_selector("#RENDER_DATA", timeout=15000)
            except Exception:
                await page.wait_for_timeout(8000)

            # 从 RENDER_DATA 提取
            render_raw = await page.evaluate(
                "() => { const e = document.getElementById('RENDER_DATA'); return e ? e.textContent : null; }"
            )
            if render_raw:
                data_text = json.dumps(json.loads(unquote(render_raw)), ensure_ascii=False)
                dl = re.findall(
                    r'"download_addr":\s*\{[^}]*"url_list":\s*\["(https?://[^"]+)"', data_text
                )
                if dl:
                    return dl[0], "RENDER_DATA/download_addr"
                play = re.findall(
                    r'"play_addr":\s*\{[^}]*"url_list":\s*\["(https?://[^"]+)"', data_text
                )
                if play:
                    return play[0], "RENDER_DATA/play_addr"
                cdn = re.findall(
                    r'(https?://v[^"]*(?:douyinvod|xhscdn|sns-video|bilivideo)[^"]*)', data_text
                )
                if cdn:
                    return cdn[0], "RENDER_DATA/cdn"

            if captured:
                return captured[0], "network_capture"

            return None, "未找到视频 URL"
        finally:
            await browser.close()


async def _download_video_via_playwright(
    page_url: str, output_path: Path, cookie_str: str | None, platform: str
) -> tuple[bool, str]:
    """Playwright 提取视频 URL 后用 httpx 下载文件。"""
    try:
        video_url, method = await _extract_video_url_with_playwright(page_url, cookie_str, platform)
        if not video_url:
            return False, f"Playwright 未提取到视频链接 ({method})"

        logger.info(f"[video-tool] Extracted via {method}: {video_url[:100]}")

        headers_map = PLATFORM_HEADERS.get(platform, {})
        dl_headers = {"User-Agent": COMMON_UA, "Accept": "*/*", **headers_map}

        output_path.parent.mkdir(parents=True, exist_ok=True)
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
            async with client.stream("GET", video_url, headers=dl_headers) as resp:
                if resp.status_code != 200:
                    return False, f"下载视频失败 HTTP {resp.status_code}"
                with open(output_path, "wb") as f:
                    async for chunk in resp.aiter_bytes(65536):
                        f.write(chunk)

        if output_path.exists() and output_path.stat().st_size > 0:
            return True, method
        return False, "下载文件为空"
    except Exception as e:
        logger.exception("[video-tool] Playwright download error")
        return False, str(e)


# ---------------------------------------------------------------------------
# DashScope file-transcription helpers (simplified from second_pass_asr.py)
# ---------------------------------------------------------------------------

DASHSCOPE_UPLOAD_URL = "https://dashscope.aliyuncs.com/api/v1/uploads"
DASHSCOPE_TRANSCRIPTION_URL = (
    "https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription"
)
DASHSCOPE_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}"


def _get_dashscope_api_key() -> str | None:
    key = settings.get("audio.asr.api_key", "")
    invalid = {
        "",
        "xxx",
        "YOUR_API_KEY_HERE",
        "YOUR_ASR_KEY_HERE",
        "YOUR_LLM_KEY_HERE",
        "your-api-key",
        "your-asr-api-key",
    }
    if key in invalid:
        key = settings.get("llm.api_key", "")
    return key if key and key not in invalid else None


def _dashscope_get_upload_policy(api_key: str, model: str) -> dict[str, Any] | None:
    try:
        resp = httpx.get(
            DASHSCOPE_UPLOAD_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            params={"action": "getPolicy", "model": model},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()["data"]
    except Exception as e:
        logger.error(f"[video-tool] Upload policy failed: {e}")
        return None


def _dashscope_upload_to_oss(policy: dict[str, Any], local_path: Path) -> str:
    filename = local_path.name
    key = f"{policy['upload_dir']}/{filename}"
    with local_path.open("rb") as f:
        resp = httpx.post(
            policy["upload_host"],
            data={
                "OSSAccessKeyId": policy["oss_access_key_id"],
                "Signature": policy["signature"],
                "policy": policy["policy"],
                "x-oss-object-acl": policy["x_oss_object_acl"],
                "x-oss-forbid-overwrite": policy["x_oss_forbid_overwrite"],
                "key": key,
                "success_action_status": "200",
            },
            files={"file": (filename, f, "audio/wav")},
            timeout=120,
        )
        resp.raise_for_status()
    return f"oss://{key}"


def _dashscope_submit_transcription(api_key: str, oss_url: str, model: str) -> str | None:
    body = {
        "model": model,
        "input": {"file_urls": [oss_url]},
        "parameters": {"language_hints": ["zh", "en"]},
    }
    try:
        resp = httpx.post(
            DASHSCOPE_TRANSCRIPTION_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "X-DashScope-Async": "enable",
                "X-DashScope-OssResourceResolve": "enable",
            },
            json=body,
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json().get("output", {}).get("task_id")
    except Exception as e:
        logger.error(f"[video-tool] Transcription submit failed: {e}")
        return None


def _dashscope_wait_result(api_key: str, task_id: str) -> dict[str, Any] | None:
    url = DASHSCOPE_TASK_URL.format(task_id=task_id)
    headers = {"Authorization": f"Bearer {api_key}"}
    for _ in range(180):
        try:
            resp = httpx.get(url, headers=headers, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            status = data.get("output", {}).get("task_status", "")
            if status == "SUCCEEDED":
                results = data.get("output", {}).get("results", [])
                if results and results[0].get("subtask_status") == "SUCCEEDED":
                    tr_url = results[0].get("transcription_url")
                    if tr_url:
                        import urllib.request

                        with urllib.request.urlopen(tr_url, timeout=30) as r:
                            return json.loads(r.read().decode("utf-8"))
                return None
            if status == "FAILED":
                logger.error(f"[video-tool] Transcription task failed: {data}")
                return None
            time.sleep(5)
        except Exception as e:
            logger.error(f"[video-tool] Polling error: {e}")
            time.sleep(5)
    return None


def _parse_transcription(raw: dict[str, Any]) -> list[dict]:
    segments: list[dict] = []
    for transcript in raw.get("transcripts", []):
        for sentence in transcript.get("sentences", []):
            text = sentence.get("text", "").strip()
            if text:
                segments.append(
                    {
                        "text": text,
                        "begin_ms": sentence.get("begin_time", 0),
                        "end_ms": sentence.get("end_time", 0),
                        "speaker_id": sentence.get("speaker_id"),
                    }
                )
    return segments


def _format_ms(ms: int) -> str:
    s = ms // 1000
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _segments_to_markdown(segments: list[dict], url: str, platform: str) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    lines = [
        "# 视频语音转写",
        "",
        f"- **来源链接**: {url}",
        f"- **平台**: {platform}",
        f"- **转写时间**: {now}",
        f"- **段落数**: {len(segments)}",
        "",
        "---",
        "",
    ]
    for seg in segments:
        ts = _format_ms(seg["begin_ms"])
        speaker = f"说话人{seg['speaker_id']}" if seg.get("speaker_id") is not None else ""
        prefix = f"**[{ts}]**" + (f" __{speaker}__：" if speaker else " ")
        lines.append(f"{prefix}{seg['text']}")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## 全文")
    lines.append("")
    full = "".join(seg["text"] for seg in segments)
    lines.append(full)
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# SSE streaming endpoint — full pipeline
# ---------------------------------------------------------------------------


class ProcessRequest(BaseModel):
    url: str
    platform: str | None = None
    cookies: str | None = None


def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/process")
async def process_video(req: ProcessRequest):
    """全流程处理：下载视频 → 提取音频 → 语音识别 → 生成 Markdown（SSE 流式返回进度）"""
    url = req.url.strip()
    if not url:
        raise HTTPException(400, "URL 不能为空")

    platform = req.platform or _detect_platform(url)
    task_id = uuid.uuid4().hex[:12]
    task_dir = _get_task_dir(task_id)

    async def event_stream():
        video_path: Path | None = None
        audio_path: Path | None = None

        # ── Step 1: 下载视频 ──
        video_path = task_dir / "video.mp4"
        use_direct = _is_direct_video_url(url)

        if use_direct:
            yield _sse_event(
                {"step": "download", "status": "running", "message": "检测到直链，正在直接下载…"}
            )
            try:
                headers_map = PLATFORM_HEADERS.get(platform, {})
                dl_headers = {
                    "User-Agent": COMMON_UA,
                    "Accept": "*/*",
                    "Accept-Language": "zh-CN,zh;q=0.9",
                    **headers_map,
                }
                downloaded_bytes = 0
                async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
                    async with client.stream("GET", url, headers=dl_headers) as resp:
                        if resp.status_code != 200:
                            yield _sse_event(
                                {
                                    "step": "download",
                                    "status": "error",
                                    "message": f"下载失败: HTTP {resp.status_code}",
                                }
                            )
                            return
                        content_length = resp.headers.get("content-length")
                        total = int(content_length) if content_length else None
                        with open(video_path, "wb") as f:
                            async for chunk in resp.aiter_bytes(65536):
                                f.write(chunk)
                                downloaded_bytes += len(chunk)
                                if total:
                                    pct = min(int(downloaded_bytes / total * 100), 100)
                                    yield _sse_event(
                                        {
                                            "step": "download",
                                            "status": "progress",
                                            "progress": pct,
                                            "message": f"已下载 {downloaded_bytes // 1024} KB / {total // 1024} KB",
                                        }
                                    )
            except Exception as e:
                logger.exception("[video-tool] Direct download error")
                yield _sse_event(
                    {"step": "download", "status": "error", "message": f"直接下载出错: {e}"}
                )
                return
        else:
            normalized = _normalize_url(url, platform)
            if normalized != url:
                yield _sse_event(
                    {
                        "step": "download",
                        "status": "running",
                        "message": f"链接已规范化为: {normalized[:80]}…",
                    }
                )

            cookie_str = req.cookies or _get_crawler_cookies(platform)
            if cookie_str:
                yield _sse_event(
                    {
                        "step": "download",
                        "status": "running",
                        "message": "已加载 Cookies，使用 Playwright 解析页面提取视频…",
                    }
                )
            else:
                yield _sse_event(
                    {
                        "step": "download",
                        "status": "running",
                        "message": "使用 Playwright 解析页面（未找到 Cookies，可能需要登录态）…",
                    }
                )

            try:
                success, detail = await _download_video_via_playwright(
                    normalized, video_path, cookie_str, platform
                )
                if not success:
                    yield _sse_event(
                        {
                            "step": "download",
                            "status": "error",
                            "message": f"下载失败: {detail}",
                        }
                    )
                    return
                yield _sse_event(
                    {
                        "step": "download",
                        "status": "running",
                        "message": f"视频提取成功 (via {detail})，正在下载…",
                    }
                )
            except Exception as e:
                logger.exception("[video-tool] Playwright download error")
                yield _sse_event(
                    {"step": "download", "status": "error", "message": f"下载出错: {e}"}
                )
                return

        if not video_path.exists() or video_path.stat().st_size == 0:
            yield _sse_event({"step": "download", "status": "error", "message": "下载文件为空"})
            return

        size_mb = video_path.stat().st_size / 1024 / 1024
        yield _sse_event(
            {
                "step": "download",
                "status": "done",
                "message": f"下载完成 ({size_mb:.1f} MB)",
                "file_size_mb": round(size_mb, 2),
            }
        )

        # ── Step 2: 提取音频 ──
        yield _sse_event({"step": "extract_audio", "status": "running", "message": "正在提取音频…"})

        if not _ffmpeg_available():
            yield _sse_event(
                {
                    "step": "extract_audio",
                    "status": "error",
                    "message": "系统未安装 ffmpeg，无法提取音频。请先安装 ffmpeg 并加入 PATH。",
                }
            )
            return

        try:
            audio_path = task_dir / "audio.wav"
            cmd = [
                "ffmpeg",
                "-y",
                "-i",
                str(video_path),
                "-vn",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                str(audio_path),
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)

            if proc.returncode != 0:
                err_text = stderr.decode(errors="replace")[-500:]
                yield _sse_event(
                    {
                        "step": "extract_audio",
                        "status": "error",
                        "message": f"ffmpeg 失败 (code {proc.returncode}): {err_text}",
                    }
                )
                return

            audio_size = audio_path.stat().st_size / 1024 / 1024
            duration_s = audio_size * 1024 * 1024 / (16000 * 2)
            yield _sse_event(
                {
                    "step": "extract_audio",
                    "status": "done",
                    "message": f"音频提取完成 ({duration_s:.0f} 秒, {audio_size:.1f} MB)",
                }
            )
        except TimeoutError:
            yield _sse_event(
                {"step": "extract_audio", "status": "error", "message": "ffmpeg 超时 (>5分钟)"}
            )
            return
        except Exception as e:
            logger.exception("[video-tool] Audio extraction error")
            yield _sse_event(
                {"step": "extract_audio", "status": "error", "message": f"音频提取出错: {e}"}
            )
            return

        # ── Step 3: 语音识别 ──
        yield _sse_event(
            {"step": "transcribe", "status": "running", "message": "正在上传音频到 DashScope…"}
        )

        api_key = _get_dashscope_api_key()
        if not api_key:
            yield _sse_event(
                {
                    "step": "transcribe",
                    "status": "error",
                    "message": "未配置 DashScope API Key（请在设置中配置 audio.asr.api_key 或 llm.api_key）",
                }
            )
            return

        model = settings.get("audio.second_pass.model", "paraformer-v2")

        try:
            loop = asyncio.get_event_loop()

            policy = await loop.run_in_executor(None, _dashscope_get_upload_policy, api_key, model)
            if policy is None:
                yield _sse_event(
                    {"step": "transcribe", "status": "error", "message": "获取上传凭据失败"}
                )
                return

            yield _sse_event(
                {"step": "transcribe", "status": "running", "message": "正在上传音频文件…"}
            )
            oss_url = await loop.run_in_executor(None, _dashscope_upload_to_oss, policy, audio_path)

            yield _sse_event(
                {
                    "step": "transcribe",
                    "status": "running",
                    "message": "已提交转写任务，等待识别结果…",
                }
            )
            task_id_ds = await loop.run_in_executor(
                None, _dashscope_submit_transcription, api_key, oss_url, model
            )
            if not task_id_ds:
                yield _sse_event(
                    {"step": "transcribe", "status": "error", "message": "提交转写任务失败"}
                )
                return

            raw_result = await loop.run_in_executor(
                None, _dashscope_wait_result, api_key, task_id_ds
            )
            if raw_result is None:
                yield _sse_event(
                    {"step": "transcribe", "status": "error", "message": "转写任务失败或超时"}
                )
                return

            segments = _parse_transcription(raw_result)
            if not segments:
                yield _sse_event(
                    {"step": "transcribe", "status": "error", "message": "未识别到任何语音内容"}
                )
                return

            total_text = sum(len(s["text"]) for s in segments)
            yield _sse_event(
                {
                    "step": "transcribe",
                    "status": "done",
                    "message": f"识别完成：{len(segments)} 段，共 {total_text} 字",
                }
            )
        except Exception as e:
            logger.exception("[video-tool] Transcription error")
            yield _sse_event(
                {"step": "transcribe", "status": "error", "message": f"语音识别出错: {e}"}
            )
            return

        # ── Step 4: 生成 Markdown ──
        yield _sse_event({"step": "markdown", "status": "running", "message": "正在生成 Markdown…"})

        try:
            md_content = _segments_to_markdown(segments, url, platform)
            md_path = task_dir / "transcription.md"
            md_path.write_text(md_content, encoding="utf-8")

            yield _sse_event(
                {
                    "step": "markdown",
                    "status": "done",
                    "message": "Markdown 生成完成",
                    "markdown": md_content,
                    "task_id": task_id,
                }
            )
        except Exception as e:
            logger.exception("[video-tool] Markdown generation error")
            yield _sse_event(
                {"step": "markdown", "status": "error", "message": f"生成 Markdown 出错: {e}"}
            )
            return

        yield _sse_event({"step": "complete", "status": "done", "task_id": task_id})

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# File downloads
# ---------------------------------------------------------------------------


@router.get("/download/{task_id}/{filename}")
async def download_file(task_id: str, filename: str):
    """下载任务产生的文件（video.mp4 / audio.wav / transcription.md）"""
    safe_name = Path(filename).name
    file_path = TOOL_DATA_DIR / task_id / safe_name
    if not file_path.exists():
        raise HTTPException(404, "文件不存在")
    return FileResponse(file_path, filename=safe_name)


@router.get("/tasks")
async def list_tasks():
    """列出所有任务"""
    tasks = []
    if TOOL_DATA_DIR.exists():
        for d in sorted(TOOL_DATA_DIR.iterdir(), reverse=True):
            if d.is_dir():
                md_file = d / "transcription.md"
                tasks.append(
                    {
                        "task_id": d.name,
                        "has_video": (d / "video.mp4").exists(),
                        "has_audio": (d / "audio.wav").exists(),
                        "has_markdown": md_file.exists(),
                        "markdown_preview": md_file.read_text("utf-8")[:200]
                        if md_file.exists()
                        else None,
                    }
                )
    return {"tasks": tasks}


# ---------------------------------------------------------------------------
# Batch processing — user profile → video list → pipeline each
# ---------------------------------------------------------------------------


async def _fetch_user_videos_playwright(
    profile_url: str, cookie_str: str | None, platform: str, max_count: int = 10
) -> list[dict]:
    """用 Playwright 打开用户主页，拦截 API 获取视频列表。"""
    from playwright.async_api import async_playwright

    domain = PLATFORM_COOKIE_DOMAINS.get(platform, f".{platform}.com")
    pw_cookies = []
    if cookie_str:
        for part in cookie_str.split(";"):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                pw_cookies.append(
                    {"name": k.strip(), "value": v.strip(), "domain": domain, "path": "/"}
                )

    videos: list[dict] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            context = await browser.new_context(user_agent=COMMON_UA)
            if pw_cookies:
                await context.add_cookies(pw_cookies)
            page = await context.new_page()

            async def _on_resp(response):
                if len(videos) >= max_count:
                    return
                url = response.url
                if "aweme/v1/web/aweme/post" in url:
                    try:
                        body = await response.json()
                        for item in body.get("aweme_list", []):
                            if len(videos) >= max_count:
                                break
                            videos.append(
                                {
                                    "id": item.get("aweme_id", ""),
                                    "desc": item.get("desc", ""),
                                    "url": f"https://www.douyin.com/video/{item.get('aweme_id', '')}",
                                }
                            )
                    except Exception:
                        pass

            page.on("response", _on_resp)
            await page.goto(profile_url, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(5000)

            scroll_attempts = 0
            while len(videos) < max_count and scroll_attempts < 5:
                await page.evaluate("window.scrollBy(0, 1500)")
                await page.wait_for_timeout(2000)
                scroll_attempts += 1

            return videos[:max_count]
        finally:
            await browser.close()


class BatchRequest(BaseModel):
    profile_url: str
    cookies: str | None = None
    platform: str | None = None
    max_count: int = 10


@router.post("/batch")
async def batch_process(req: BatchRequest):
    """批量处理：从博主主页获取视频列表 → 逐个执行全流水线（SSE）"""
    profile_url = req.profile_url.strip()
    if not profile_url:
        raise HTTPException(400, "profile_url 不能为空")

    platform = req.platform or _detect_platform(profile_url)
    max_count = min(req.max_count, 50)
    batch_id = f"batch_{uuid.uuid4().hex[:8]}"
    batch_dir = TOOL_DATA_DIR / batch_id
    batch_dir.mkdir(parents=True, exist_ok=True)

    async def event_stream():
        yield _sse_event(
            {
                "step": "fetch_list",
                "status": "running",
                "message": f"正在从博主主页获取视频列表（最多 {max_count} 条）…",
            }
        )

        try:
            cookie_str = req.cookies or _get_crawler_cookies(platform)
            videos = await _fetch_user_videos_playwright(
                profile_url, cookie_str, platform, max_count
            )
        except Exception as e:
            logger.exception("[video-tool] Batch fetch list error")
            yield _sse_event(
                {"step": "fetch_list", "status": "error", "message": f"获取视频列表失败: {e}"}
            )
            return

        if not videos:
            yield _sse_event(
                {"step": "fetch_list", "status": "error", "message": "未获取到任何视频"}
            )
            return

        yield _sse_event(
            {
                "step": "fetch_list",
                "status": "done",
                "message": f"获取到 {len(videos)} 个视频",
                "videos": [{"id": v["id"], "desc": v["desc"][:40]} for v in videos],
            }
        )

        api_key = _get_dashscope_api_key()
        model = settings.get("audio.second_pass.model", "paraformer-v2")

        success_count = 0
        fail_count = 0

        for idx, video in enumerate(videos):
            vid = video["id"]
            video_url = video["url"]
            desc_short = video["desc"][:30] or vid
            task_dir = batch_dir / vid
            task_dir.mkdir(parents=True, exist_ok=True)
            prefix = f"[{idx + 1}/{len(videos)}]"

            yield _sse_event(
                {
                    "step": "video_start",
                    "status": "running",
                    "index": idx,
                    "total": len(videos),
                    "video_id": vid,
                    "message": f"{prefix} 开始处理: {desc_short}",
                }
            )

            # 1. Download
            video_path = task_dir / "video.mp4"
            try:
                cookie_str = req.cookies or _get_crawler_cookies(platform)
                ok, detail = await _download_video_via_playwright(
                    video_url, video_path, cookie_str, platform
                )
                if not ok:
                    yield _sse_event(
                        {
                            "step": "video_error",
                            "index": idx,
                            "video_id": vid,
                            "status": "error",
                            "message": f"{prefix} 下载失败: {detail}",
                        }
                    )
                    fail_count += 1
                    continue
            except Exception as e:
                yield _sse_event(
                    {
                        "step": "video_error",
                        "index": idx,
                        "video_id": vid,
                        "status": "error",
                        "message": f"{prefix} 下载出错: {e}",
                    }
                )
                fail_count += 1
                continue

            size_mb = video_path.stat().st_size / 1024 / 1024
            yield _sse_event(
                {
                    "step": "video_progress",
                    "index": idx,
                    "video_id": vid,
                    "status": "running",
                    "message": f"{prefix} 已下载 ({size_mb:.1f}MB)，提取音频…",
                }
            )

            # 2. Extract audio
            audio_path = task_dir / "audio.wav"
            try:
                proc = await asyncio.create_subprocess_exec(
                    "ffmpeg",
                    "-y",
                    "-i",
                    str(video_path),
                    "-vn",
                    "-acodec",
                    "pcm_s16le",
                    "-ar",
                    "16000",
                    "-ac",
                    "1",
                    str(audio_path),
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                _, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
                if proc.returncode != 0:
                    yield _sse_event(
                        {
                            "step": "video_error",
                            "index": idx,
                            "video_id": vid,
                            "status": "error",
                            "message": f"{prefix} ffmpeg 失败",
                        }
                    )
                    fail_count += 1
                    continue
            except Exception as e:
                yield _sse_event(
                    {
                        "step": "video_error",
                        "index": idx,
                        "video_id": vid,
                        "status": "error",
                        "message": f"{prefix} 音频提取出错: {e}",
                    }
                )
                fail_count += 1
                continue

            yield _sse_event(
                {
                    "step": "video_progress",
                    "index": idx,
                    "video_id": vid,
                    "status": "running",
                    "message": f"{prefix} 音频提取完成，语音识别中…",
                }
            )

            # 3. Transcribe
            if not api_key:
                yield _sse_event(
                    {
                        "step": "video_error",
                        "index": idx,
                        "video_id": vid,
                        "status": "error",
                        "message": f"{prefix} 无 DashScope API Key",
                    }
                )
                fail_count += 1
                continue

            try:
                loop = asyncio.get_event_loop()
                policy = await loop.run_in_executor(
                    None, _dashscope_get_upload_policy, api_key, model
                )
                if not policy:
                    raise RuntimeError("获取上传凭据失败")
                oss_url = await loop.run_in_executor(
                    None, _dashscope_upload_to_oss, policy, audio_path
                )
                task_id_ds = await loop.run_in_executor(
                    None, _dashscope_submit_transcription, api_key, oss_url, model
                )
                if not task_id_ds:
                    raise RuntimeError("提交转写任务失败")
                raw_result = await loop.run_in_executor(
                    None, _dashscope_wait_result, api_key, task_id_ds
                )
                if not raw_result:
                    raise RuntimeError("转写结果为空")
                segments = _parse_transcription(raw_result)
            except Exception as e:
                yield _sse_event(
                    {
                        "step": "video_error",
                        "index": idx,
                        "video_id": vid,
                        "status": "error",
                        "message": f"{prefix} 语音识别出错: {e}",
                    }
                )
                fail_count += 1
                continue

            # 4. Markdown
            md_content = _segments_to_markdown(segments, video_url, platform)
            md_path = task_dir / "transcription.md"
            md_path.write_text(md_content, encoding="utf-8")

            total_chars = sum(len(s["text"]) for s in segments)
            yield _sse_event(
                {
                    "step": "video_done",
                    "index": idx,
                    "video_id": vid,
                    "status": "done",
                    "message": f"{prefix} 完成: {len(segments)} 段, {total_chars} 字",
                    "desc": video["desc"][:40],
                    "markdown_preview": md_content[:200],
                }
            )
            success_count += 1

        yield _sse_event(
            {
                "step": "batch_complete",
                "status": "done",
                "message": f"批量处理完成：成功 {success_count}/{len(videos)}，失败 {fail_count}",
                "batch_id": batch_id,
                "success": success_count,
                "failed": fail_count,
                "total": len(videos),
            }
        )

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/batch/{batch_id}")
async def get_batch_results(batch_id: str):
    """获取批量任务结果"""
    batch_dir = TOOL_DATA_DIR / batch_id
    if not batch_dir.exists():
        raise HTTPException(404, "批量任务不存在")
    results = []
    for d in sorted(batch_dir.iterdir()):
        if d.is_dir():
            md_file = d / "transcription.md"
            results.append(
                {
                    "video_id": d.name,
                    "has_video": (d / "video.mp4").exists(),
                    "has_audio": (d / "audio.wav").exists(),
                    "has_markdown": md_file.exists(),
                    "markdown": md_file.read_text("utf-8") if md_file.exists() else None,
                }
            )
    return {"batch_id": batch_id, "results": results}


# ---------------------------------------------------------------------------
# HTML page (standalone)
# ---------------------------------------------------------------------------


@router.get("/page", response_class=HTMLResponse)
async def video_tool_page():
    """独立的视频工具页面"""
    html = _build_html()
    return HTMLResponse(content=html)


def _build_html() -> str:
    return r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>视频转写工具</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #1a1d27;
    --surface2: #242836;
    --border: #2e3345;
    --text: #e4e6ef;
    --text2: #8b8fa3;
    --accent: #6c63ff;
    --accent-hover: #7b73ff;
    --success: #34d399;
    --error: #f87171;
    --warning: #fbbf24;
    --radius: 12px;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 20px;
  }
  .container { max-width: 720px; width: 100%; }
  h1 {
    font-size: 1.8rem;
    font-weight: 700;
    margin-bottom: 8px;
    background: linear-gradient(135deg, var(--accent), #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .subtitle { color: var(--text2); margin-bottom: 32px; font-size: 0.95rem; }

  .input-group {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }
  .input-group input {
    flex: 1;
    padding: 14px 18px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.95rem;
    outline: none;
    transition: border-color .2s;
  }
  .input-group input:focus { border-color: var(--accent); }
  .input-group input::placeholder { color: var(--text2); }

  .platform-row {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .platform-chip {
    padding: 6px 14px;
    border-radius: 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text2);
    font-size: 0.82rem;
    cursor: pointer;
    transition: all .2s;
    user-select: none;
  }
  .platform-chip:hover { border-color: var(--accent); color: var(--text); }
  .platform-chip.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .btn {
    padding: 14px 32px;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background .2s, transform .1s;
    white-space: nowrap;
  }
  .btn:hover:not(:disabled) { background: var(--accent-hover); }
  .btn:active:not(:disabled) { transform: scale(0.97); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .steps-container {
    margin-top: 32px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .step-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 14px;
    transition: border-color .3s;
  }
  .step-card.running { border-color: var(--accent); }
  .step-card.done { border-color: var(--success); }
  .step-card.error { border-color: var(--error); }

  .step-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.1rem;
    flex-shrink: 0;
    background: var(--surface2);
  }
  .step-card.running .step-icon { background: var(--accent); animation: pulse 1.2s infinite; }
  .step-card.done .step-icon { background: var(--success); }
  .step-card.error .step-icon { background: var(--error); }
  @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:.6; } }

  .step-content { flex: 1; min-width: 0; }
  .step-title { font-weight: 600; font-size: 0.92rem; margin-bottom: 2px; }
  .step-msg { color: var(--text2); font-size: 0.82rem; word-break: break-all; }

  .progress-bar {
    width: 100%;
    height: 4px;
    background: var(--surface2);
    border-radius: 2px;
    margin-top: 8px;
    overflow: hidden;
  }
  .progress-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width .3s;
  }

  .result-area {
    margin-top: 32px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    display: none;
  }
  .result-area.show { display: block; }
  .result-header {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .result-header h3 { font-size: 0.95rem; font-weight: 600; }
  .result-actions { display: flex; gap: 8px; }
  .btn-sm {
    padding: 6px 14px;
    font-size: 0.8rem;
    border-radius: 8px;
    background: var(--surface2);
    border: 1px solid var(--border);
    color: var(--text);
    cursor: pointer;
    transition: all .2s;
  }
  .btn-sm:hover { background: var(--accent); border-color: var(--accent); color: #fff; }
  .result-body {
    padding: 20px;
    max-height: 500px;
    overflow-y: auto;
    white-space: pre-wrap;
    font-size: 0.88rem;
    line-height: 1.7;
    color: var(--text);
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  }
  .hidden { display: none !important; }
</style>
</head>
<body>
<div class="container">
  <h1>视频转写工具</h1>
  <div class="platform-row" style="margin-bottom:24px;">
    <span class="platform-chip active" data-tab="single" onclick="switchTab('single',this)">单个视频</span>
    <span class="platform-chip" data-tab="batch" onclick="switchTab('batch',this)">批量处理</span>
  </div>

  <!-- ===== 批量处理面板 ===== -->
  <div id="batchPanel" class="hidden">
    <p class="subtitle">输入博主主页链接，批量下载+转写最近视频</p>
    <div class="input-group">
      <input type="text" id="profileInput" placeholder="粘贴博主主页 URL（如 douyin.com/user/xxx）…" />
    </div>
    <div class="input-group" style="margin-bottom:8px;">
      <input type="number" id="batchCount" value="10" min="1" max="50" style="width:100px;padding:14px 18px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:.95rem;outline:none;" />
      <span style="color:var(--text2);font-size:.9rem;align-self:center;">条视频</span>
      <button class="btn" id="batchBtn" onclick="startBatch()">开始批量处理</button>
    </div>
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;" onclick="toggleBatchCookies()">
        <span style="color:var(--text2);font-size:0.85rem;" id="batchCookieToggle">+ Cookies</span>
      </div>
      <div id="batchCookieSection" class="hidden">
        <textarea id="batchCookieInput" rows="3" placeholder="粘贴浏览器 Cookie…" style="width:100%;padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:0.85rem;outline:none;resize:vertical;font-family:monospace;line-height:1.5;"></textarea>
      </div>
    </div>
    <div id="batchLog" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:16px 20px;max-height:600px;overflow-y:auto;font-size:.85rem;line-height:1.8;display:none;"></div>
  </div>

  <!-- ===== 单个视频面板 ===== -->
  <div id="singlePanel">
  <p class="subtitle">粘贴视频链接或直链，一键完成下载 → 音频提取 → 语音识别 → Markdown 生成</p>

  <div class="input-group">
    <input type="text" id="urlInput" placeholder="粘贴视频 URL（支持抖音/小红书/B站等分享链接）…" />
    <button class="btn" id="startBtn" onclick="startProcess()">开始处理</button>
  </div>

  <div class="platform-row" id="platformRow">
    <span class="platform-chip" data-p="auto" onclick="pickPlatform(this)">自动识别</span>
    <span class="platform-chip" data-p="douyin" onclick="pickPlatform(this)">抖音</span>
    <span class="platform-chip" data-p="xhs" onclick="pickPlatform(this)">小红书</span>
    <span class="platform-chip" data-p="bilibili" onclick="pickPlatform(this)">B站</span>
    <span class="platform-chip" data-p="kuaishou" onclick="pickPlatform(this)">快手</span>
    <span class="platform-chip" data-p="weibo" onclick="pickPlatform(this)">微博</span>
  </div>

  <div style="margin-bottom: 24px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;" onclick="toggleCookies()">
      <span style="color:var(--text2);font-size:0.85rem;" id="cookieToggleLabel">+ Cookies（抖音/小红书等需要登录态的平台）</span>
    </div>
    <div id="cookieSection" class="hidden">
      <textarea id="cookieInput" rows="3" placeholder="从浏览器 F12 → Network → 任意请求 → 复制 Cookie 请求头的值粘贴到这里（格式：key1=val1; key2=val2; ...）" style="
        width:100%;padding:12px 16px;background:var(--surface);border:1px solid var(--border);
        border-radius:var(--radius);color:var(--text);font-size:0.85rem;outline:none;resize:vertical;
        font-family:monospace;line-height:1.5;
      "></textarea>
      <p style="color:var(--text2);font-size:0.75rem;margin-top:6px;">
        获取方法：打开目标网站 → F12 → Network → 刷新页面 → 点任意请求 → Headers → 复制 Cookie 的值
      </p>
    </div>
  </div>

  <div class="steps-container" id="steps">
    <div class="step-card" id="step-download">
      <div class="step-icon">1</div>
      <div class="step-content">
        <div class="step-title">下载视频</div>
        <div class="step-msg" id="msg-download">等待开始</div>
        <div class="progress-bar hidden" id="pb-download"><div class="progress-bar-fill" id="pbf-download"></div></div>
      </div>
    </div>
    <div class="step-card" id="step-extract_audio">
      <div class="step-icon">2</div>
      <div class="step-content">
        <div class="step-title">提取音频</div>
        <div class="step-msg" id="msg-extract_audio">等待开始</div>
      </div>
    </div>
    <div class="step-card" id="step-transcribe">
      <div class="step-icon">3</div>
      <div class="step-content">
        <div class="step-title">语音识别</div>
        <div class="step-msg" id="msg-transcribe">等待开始</div>
      </div>
    </div>
    <div class="step-card" id="step-markdown">
      <div class="step-icon">4</div>
      <div class="step-content">
        <div class="step-title">生成 Markdown</div>
        <div class="step-msg" id="msg-markdown">等待开始</div>
      </div>
    </div>
  </div>

  <div class="result-area" id="resultArea">
    <div class="result-header">
      <h3>转写结果</h3>
      <div class="result-actions">
        <button class="btn-sm" onclick="copyResult()">复制内容</button>
        <button class="btn-sm" id="dlMdBtn" onclick="downloadMd()">下载 .md</button>
        <button class="btn-sm" id="dlVideoBtn" onclick="downloadVideo()">下载视频</button>
        <button class="btn-sm" id="dlAudioBtn" onclick="downloadAudio()">下载音频</button>
      </div>
    </div>
    <div class="result-body" id="resultBody"></div>
  </div>
  </div><!-- end singlePanel -->
</div>

<script>
let selectedPlatform = "auto";
let currentTaskId = null;
let markdownContent = "";

function switchTab(tab, el) {
  document.querySelectorAll('[data-tab]').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('singlePanel').classList.toggle('hidden', tab !== 'single');
  document.getElementById('batchPanel').classList.toggle('hidden', tab !== 'batch');
}

function toggleBatchCookies() {
  const sec = document.getElementById("batchCookieSection");
  const label = document.getElementById("batchCookieToggle");
  if (sec.classList.contains("hidden")) { sec.classList.remove("hidden"); label.textContent = "- Cookies"; }
  else { sec.classList.add("hidden"); label.textContent = "+ Cookies"; }
}

async function startBatch() {
  const profileUrl = document.getElementById("profileInput").value.trim();
  if (!profileUrl) { alert("请输入博主主页 URL"); return; }
  const maxCount = parseInt(document.getElementById("batchCount").value) || 10;
  const cookies = (document.getElementById("batchCookieInput").value || "").trim() || null;
  const btn = document.getElementById("batchBtn");
  const log = document.getElementById("batchLog");
  btn.disabled = true; btn.textContent = "处理中…";
  log.style.display = "block"; log.innerHTML = "";

  function addLog(msg, color) {
    const div = document.createElement("div");
    div.style.color = color || "var(--text2)";
    div.textContent = msg;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  try {
    const resp = await fetch("/api/video-tool/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_url: profileUrl, cookies, max_count: maxCount }),
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const d = JSON.parse(line.slice(6));
          if (d.step === "fetch_list" && d.status === "done") {
            addLog(">>> " + d.message, "var(--success)");
          } else if (d.step === "fetch_list" && d.status === "error") {
            addLog("ERROR: " + d.message, "var(--error)");
          } else if (d.step === "video_start") {
            addLog(d.message, "var(--accent)");
          } else if (d.step === "video_progress") {
            addLog("  " + d.message, "var(--text2)");
          } else if (d.step === "video_done") {
            addLog("  OK: " + d.message, "var(--success)");
          } else if (d.step === "video_error") {
            addLog("  FAIL: " + d.message, "var(--error)");
          } else if (d.step === "batch_complete") {
            addLog("\n" + d.message, d.failed > 0 ? "var(--warning)" : "var(--success)");
            if (d.batch_id) addLog("结果目录: " + d.batch_id, "var(--text2)");
          } else if (d.message) {
            addLog(d.message, "var(--text2)");
          }
        } catch {}
      }
    }
  } catch (e) {
    addLog("请求失败: " + e.message, "var(--error)");
  } finally {
    btn.disabled = false; btn.textContent = "开始批量处理";
  }
}

document.querySelector('.platform-chip[data-p="auto"]').classList.add("active");

function pickPlatform(el) {
  document.querySelectorAll(".platform-chip").forEach(c => c.classList.remove("active"));
  el.classList.add("active");
  selectedPlatform = el.dataset.p;
}

function toggleCookies() {
  const sec = document.getElementById("cookieSection");
  const label = document.getElementById("cookieToggleLabel");
  if (sec.classList.contains("hidden")) {
    sec.classList.remove("hidden");
    label.textContent = "- Cookies（点击收起）";
  } else {
    sec.classList.add("hidden");
    label.textContent = "+ Cookies（抖音/小红书等需要登录态的平台）";
  }
}

function resetSteps() {
  ["download","extract_audio","transcribe","markdown"].forEach(s => {
    const card = document.getElementById("step-" + s);
    card.className = "step-card";
    document.getElementById("msg-" + s).textContent = "等待开始";
  });
  document.getElementById("pb-download").classList.add("hidden");
  document.getElementById("resultArea").classList.remove("show");
  markdownContent = "";
  currentTaskId = null;
}

function updateStep(step, status, message) {
  const card = document.getElementById("step-" + step);
  if (!card) return;
  card.className = "step-card " + status;
  document.getElementById("msg-" + step).textContent = message;
}

async function startProcess() {
  const url = document.getElementById("urlInput").value.trim();
  if (!url) { alert("请输入视频 URL"); return; }

  resetSteps();
  const btn = document.getElementById("startBtn");
  btn.disabled = true;
  btn.textContent = "处理中…";

  const platform = selectedPlatform === "auto" ? null : selectedPlatform;
  const cookies = (document.getElementById("cookieInput").value || "").trim() || null;

  try {
    const resp = await fetch("/api/video-tool/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, platform, cookies }),
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          handleEvent(data);
        } catch {}
      }
    }
  } catch (e) {
    alert("请求失败: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "开始处理";
  }
}

function handleEvent(data) {
  const { step, status, message, progress, markdown, task_id } = data;

  if (step === "complete") return;

  updateStep(step, status, message || "");

  if (step === "download" && status === "progress" && progress != null) {
    const pb = document.getElementById("pb-download");
    pb.classList.remove("hidden");
    document.getElementById("pbf-download").style.width = progress + "%";
  }
  if (step === "download" && status === "done") {
    document.getElementById("pb-download").classList.add("hidden");
  }

  if (task_id) currentTaskId = task_id;

  if (markdown) {
    markdownContent = markdown;
    document.getElementById("resultBody").textContent = markdown;
    document.getElementById("resultArea").classList.add("show");
  }
}

function copyResult() {
  navigator.clipboard.writeText(markdownContent).then(() => {
    const btn = event.target;
    btn.textContent = "已复制!";
    setTimeout(() => btn.textContent = "复制内容", 1500);
  });
}

function downloadMd() {
  if (!currentTaskId) return;
  window.open("/api/video-tool/download/" + currentTaskId + "/transcription.md");
}
function downloadVideo() {
  if (!currentTaskId) return;
  window.open("/api/video-tool/download/" + currentTaskId + "/video.mp4");
}
function downloadAudio() {
  if (!currentTaskId) return;
  window.open("/api/video-tool/download/" + currentTaskId + "/audio.wav");
}
</script>
</body>
</html>"""
