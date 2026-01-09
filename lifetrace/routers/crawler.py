"""
爬虫路由模块

将 MediaCrawler 的 API 集成到 LifeTrace 主后端
支持多平台内容采集：小红书、抖音、快手、B站、微博、贴吧、知乎
"""

import asyncio
import json
import os
import subprocess
import signal
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import List, Literal, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/crawler", tags=["crawler"])

# MediaCrawler 项目根目录
MEDIA_CRAWLER_ROOT = Path(__file__).parent.parent.parent / "MediaCrawler"
DATA_DIR = MEDIA_CRAWLER_ROOT / "data"


# ============================================================================
# Schemas
# ============================================================================


class PlatformEnum(str, Enum):
    """支持的平台"""
    XHS = "xhs"
    DOUYIN = "dy"
    KUAISHOU = "ks"
    BILIBILI = "bili"
    WEIBO = "wb"
    TIEBA = "tieba"
    ZHIHU = "zhihu"


class LoginTypeEnum(str, Enum):
    """登录方式"""
    QRCODE = "qrcode"
    PHONE = "phone"
    COOKIE = "cookie"


class CrawlerTypeEnum(str, Enum):
    """爬取类型"""
    SEARCH = "search"
    DETAIL = "detail"
    CREATOR = "creator"


class SaveDataOptionEnum(str, Enum):
    """数据保存格式"""
    CSV = "csv"
    DB = "db"
    JSON = "json"
    SQLITE = "sqlite"
    MONGODB = "mongodb"
    EXCEL = "excel"


class CrawlerStartRequest(BaseModel):
    """启动爬虫请求"""
    platform: PlatformEnum
    login_type: LoginTypeEnum = LoginTypeEnum.QRCODE
    crawler_type: CrawlerTypeEnum = CrawlerTypeEnum.SEARCH
    keywords: str = ""
    specified_ids: str = ""
    creator_ids: str = ""
    start_page: int = 1
    enable_comments: bool = True
    enable_sub_comments: bool = False
    save_option: SaveDataOptionEnum = SaveDataOptionEnum.JSON
    cookies: str = ""
    headless: bool = False


class LogEntry(BaseModel):
    """日志条目"""
    id: int
    timestamp: str
    level: Literal["info", "warning", "error", "success", "debug"]
    message: str


class CrawlerStatusResponse(BaseModel):
    """爬虫状态响应"""
    status: Literal["idle", "running", "stopping", "error"]
    platform: Optional[str] = None
    crawler_type: Optional[str] = None
    started_at: Optional[str] = None
    error_message: Optional[str] = None


# ============================================================================
# CrawlerManager
# ============================================================================


class CrawlerManager:
    """爬虫进程管理器"""

    def __init__(self):
        self._lock = asyncio.Lock()
        self.process: Optional[subprocess.Popen] = None
        self.status = "idle"
        self.started_at: Optional[datetime] = None
        self.current_config: Optional[CrawlerStartRequest] = None
        self._log_id = 0
        self._logs: List[LogEntry] = []
        self._read_task: Optional[asyncio.Task] = None
        self._log_queue: Optional[asyncio.Queue] = None

    @property
    def logs(self) -> List[LogEntry]:
        return self._logs

    def get_log_queue(self) -> asyncio.Queue:
        """获取或创建日志队列"""
        if self._log_queue is None:
            self._log_queue = asyncio.Queue()
        return self._log_queue

    def _create_log_entry(self, message: str, level: str = "info") -> LogEntry:
        """创建日志条目"""
        self._log_id += 1
        entry = LogEntry(
            id=self._log_id,
            timestamp=datetime.now().strftime("%H:%M:%S"),
            level=level,
            message=message
        )
        self._logs.append(entry)
        if len(self._logs) > 500:
            self._logs = self._logs[-500:]
        return entry

    async def _push_log(self, entry: LogEntry):
        """推送日志到队列"""
        if self._log_queue is not None:
            try:
                self._log_queue.put_nowait(entry)
            except asyncio.QueueFull:
                pass

    def _parse_log_level(self, line: str) -> str:
        """解析日志级别"""
        line_upper = line.upper()
        if "ERROR" in line_upper or "FAILED" in line_upper:
            return "error"
        elif "WARNING" in line_upper or "WARN" in line_upper:
            return "warning"
        elif "SUCCESS" in line_upper or "完成" in line or "成功" in line:
            return "success"
        elif "DEBUG" in line_upper:
            return "debug"
        return "info"

    async def start(self, config: CrawlerStartRequest) -> bool:
        """启动爬虫进程"""
        async with self._lock:
            if self.process and self.process.poll() is None:
                return False

            # 检查 MediaCrawler 目录是否存在
            if not MEDIA_CRAWLER_ROOT.exists():
                entry = self._create_log_entry(
                    f"MediaCrawler 目录不存在: {MEDIA_CRAWLER_ROOT}", "error"
                )
                await self._push_log(entry)
                return False

            # 清除旧日志
            self._logs = []
            self._log_id = 0

            # 清空队列
            if self._log_queue is None:
                self._log_queue = asyncio.Queue()
            else:
                try:
                    while True:
                        self._log_queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass

            # 构建命令
            cmd = self._build_command(config)

            entry = self._create_log_entry(f"启动爬虫: {' '.join(cmd)}", "info")
            await self._push_log(entry)

            try:
                self.process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    cwd=str(MEDIA_CRAWLER_ROOT),
                    env={**os.environ, "PYTHONUNBUFFERED": "1"},
                    encoding="utf-8",
                    errors="replace"  # 遇到无法解码的字符时用 � 替换，避免崩溃
                )

                self.status = "running"
                self.started_at = datetime.now()
                self.current_config = config

                entry = self._create_log_entry(
                    f"爬虫已启动，平台: {config.platform.value}，类型: {config.crawler_type.value}",
                    "success"
                )
                await self._push_log(entry)

                self._read_task = asyncio.create_task(self._read_output())
                return True

            except Exception as e:
                self.status = "error"
                entry = self._create_log_entry(f"启动爬虫失败: {str(e)}", "error")
                await self._push_log(entry)
                return False

    async def stop(self) -> bool:
        """停止爬虫进程"""
        async with self._lock:
            if not self.process or self.process.poll() is not None:
                return False

            self.status = "stopping"
            entry = self._create_log_entry("正在发送 SIGTERM 信号...", "warning")
            await self._push_log(entry)

            try:
                # Windows 使用 terminate()，Unix 使用 SIGTERM
                if os.name == 'nt':
                    self.process.terminate()
                else:
                    self.process.send_signal(signal.SIGTERM)

                # 等待优雅退出
                for _ in range(30):
                    if self.process.poll() is not None:
                        break
                    await asyncio.sleep(0.5)

                # 强制终止
                if self.process.poll() is None:
                    entry = self._create_log_entry("进程无响应，强制终止...", "warning")
                    await self._push_log(entry)
                    self.process.kill()

                entry = self._create_log_entry("爬虫进程已终止", "info")
                await self._push_log(entry)

            except Exception as e:
                entry = self._create_log_entry(f"停止爬虫出错: {str(e)}", "error")
                await self._push_log(entry)

            self.status = "idle"
            self.current_config = None

            if self._read_task:
                self._read_task.cancel()
                self._read_task = None

            return True

    def get_status(self) -> dict:
        """获取当前状态"""
        return {
            "status": self.status,
            "platform": self.current_config.platform.value if self.current_config else None,
            "crawler_type": self.current_config.crawler_type.value if self.current_config else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "error_message": None
        }

    def _build_command(self, config: CrawlerStartRequest) -> list:
        """构建命令行参数"""
        cmd = ["uv", "run", "python", "main.py"]

        cmd.extend(["--platform", config.platform.value])
        cmd.extend(["--lt", config.login_type.value])
        cmd.extend(["--type", config.crawler_type.value])
        cmd.extend(["--save_data_option", config.save_option.value])

        if config.crawler_type.value == "search" and config.keywords:
            cmd.extend(["--keywords", config.keywords])
        elif config.crawler_type.value == "detail" and config.specified_ids:
            cmd.extend(["--specified_id", config.specified_ids])
        elif config.crawler_type.value == "creator" and config.creator_ids:
            cmd.extend(["--creator_id", config.creator_ids])

        if config.start_page != 1:
            cmd.extend(["--start", str(config.start_page)])

        cmd.extend(["--get_comment", "true" if config.enable_comments else "false"])
        cmd.extend(["--get_sub_comment", "true" if config.enable_sub_comments else "false"])

        if config.cookies:
            cmd.extend(["--cookies", config.cookies])

        cmd.extend(["--headless", "true" if config.headless else "false"])

        return cmd

    async def _read_output(self):
        """异步读取进程输出"""
        loop = asyncio.get_event_loop()

        def read_line_safe():
            """安全读取一行，处理编码错误"""
            try:
                return self.process.stdout.readline()
            except UnicodeDecodeError:
                # 如果还是有编码错误，返回空字符串
                return ""

        def read_all_safe():
            """安全读取剩余内容，处理编码错误"""
            try:
                return self.process.stdout.read()
            except UnicodeDecodeError:
                return ""

        try:
            while self.process and self.process.poll() is None:
                try:
                    line = await loop.run_in_executor(None, read_line_safe)
                    if line:
                        line = line.strip()
                        if line:
                            level = self._parse_log_level(line)
                            entry = self._create_log_entry(line, level)
                            await self._push_log(entry)
                except Exception as e:
                    # 跳过读取错误，继续处理
                    logger.warning(f"读取输出行时出错: {e}")
                    continue

            # 读取剩余输出
            if self.process and self.process.stdout:
                try:
                    remaining = await loop.run_in_executor(None, read_all_safe)
                    if remaining:
                        for line in remaining.strip().split('\n'):
                            if line.strip():
                                level = self._parse_log_level(line)
                                entry = self._create_log_entry(line.strip(), level)
                                await self._push_log(entry)
                except Exception as e:
                    logger.warning(f"读取剩余输出时出错: {e}")

            if self.status == "running":
                exit_code = self.process.returncode if self.process else -1
                if exit_code == 0:
                    entry = self._create_log_entry("爬虫任务完成", "success")
                else:
                    entry = self._create_log_entry(f"爬虫退出，退出码: {exit_code}", "warning")
                await self._push_log(entry)
                self.status = "idle"

        except asyncio.CancelledError:
            pass
        except Exception as e:
            entry = self._create_log_entry(f"读取输出出错: {str(e)}", "error")
            await self._push_log(entry)


# 全局单例
crawler_manager = CrawlerManager()


# ============================================================================
# WebSocket 管理
# ============================================================================


class ConnectionManager:
    """WebSocket 连接管理器"""

    def __init__(self):
        self.active_connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: dict):
        if not self.active_connections:
            return
        disconnected = []
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


ws_manager = ConnectionManager()
_broadcaster_task: Optional[asyncio.Task] = None


async def log_broadcaster():
    """后台任务：从队列读取日志并广播"""
    queue = crawler_manager.get_log_queue()
    while True:
        try:
            entry = await queue.get()
            await ws_manager.broadcast(entry.model_dump())
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"日志广播出错: {e}")
            await asyncio.sleep(0.1)


def start_broadcaster():
    """启动广播任务"""
    global _broadcaster_task
    if _broadcaster_task is None or _broadcaster_task.done():
        _broadcaster_task = asyncio.create_task(log_broadcaster())


# ============================================================================
# 路由端点
# ============================================================================


@router.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok", "service": "crawler"}


@router.get("/config/platforms")
async def get_platforms():
    """获取支持的平台列表"""
    return {
        "platforms": [
            {"value": "xhs", "label": "小红书", "icon": "book-open"},
            {"value": "dy", "label": "抖音", "icon": "music"},
            {"value": "ks", "label": "快手", "icon": "video"},
            {"value": "bili", "label": "B站", "icon": "tv"},
            {"value": "wb", "label": "微博", "icon": "message-circle"},
            {"value": "tieba", "label": "贴吧", "icon": "messages-square"},
            {"value": "zhihu", "label": "知乎", "icon": "help-circle"},
        ]
    }


@router.get("/config/options")
async def get_config_options():
    """获取配置选项"""
    return {
        "login_types": [
            {"value": "qrcode", "label": "扫码登录"},
            {"value": "cookie", "label": "Cookie 登录"},
        ],
        "crawler_types": [
            {"value": "search", "label": "搜索模式"},
            {"value": "detail", "label": "详情模式"},
            {"value": "creator", "label": "创作者模式"},
        ],
        "save_options": [
            {"value": "json", "label": "JSON 文件"},
            {"value": "csv", "label": "CSV 文件"},
            {"value": "excel", "label": "Excel 文件"},
            {"value": "sqlite", "label": "SQLite 数据库"},
        ],
    }


@router.post("/start")
async def start_crawler(request: CrawlerStartRequest):
    """启动爬虫任务"""
    success = await crawler_manager.start(request)
    if not success:
        if crawler_manager.process and crawler_manager.process.poll() is None:
            raise HTTPException(status_code=400, detail="爬虫正在运行中")
        raise HTTPException(status_code=500, detail="启动爬虫失败")
    return {"status": "ok", "message": "爬虫已启动"}


@router.post("/stop")
async def stop_crawler():
    """停止爬虫任务"""
    success = await crawler_manager.stop()
    if not success:
        if not crawler_manager.process or crawler_manager.process.poll() is not None:
            raise HTTPException(status_code=400, detail="没有正在运行的爬虫")
        raise HTTPException(status_code=500, detail="停止爬虫失败")
    return {"status": "ok", "message": "爬虫已停止"}


@router.get("/status", response_model=CrawlerStatusResponse)
async def get_crawler_status():
    """获取爬虫状态"""
    return crawler_manager.get_status()


@router.get("/logs")
async def get_logs(limit: int = 100):
    """获取最近日志"""
    logs = crawler_manager.logs[-limit:] if limit > 0 else crawler_manager.logs
    return {"logs": [log.model_dump() for log in logs]}


# ============================================================================
# 数据文件相关
# ============================================================================


def get_file_info(file_path: Path) -> dict:
    """获取文件信息"""
    stat = file_path.stat()
    record_count = None

    try:
        if file_path.suffix == ".json":
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    record_count = len(data)
        elif file_path.suffix == ".csv":
            with open(file_path, "r", encoding="utf-8") as f:
                record_count = sum(1 for _ in f) - 1
    except Exception:
        pass

    return {
        "name": file_path.name,
        "path": str(file_path.relative_to(DATA_DIR)),
        "size": stat.st_size,
        "modified_at": stat.st_mtime,
        "record_count": record_count,
        "type": file_path.suffix[1:] if file_path.suffix else "unknown"
    }


@router.get("/data/files")
async def list_data_files(platform: Optional[str] = None, file_type: Optional[str] = None):
    """获取数据文件列表"""
    if not DATA_DIR.exists():
        return {"files": []}

    files = []
    supported_extensions = {".json", ".csv", ".xlsx", ".xls"}

    for root, dirs, filenames in os.walk(DATA_DIR):
        root_path = Path(root)
        for filename in filenames:
            file_path = root_path / filename
            if file_path.suffix.lower() not in supported_extensions:
                continue

            if platform:
                rel_path = str(file_path.relative_to(DATA_DIR))
                if platform.lower() not in rel_path.lower():
                    continue

            if file_type and file_path.suffix[1:].lower() != file_type.lower():
                continue

            try:
                files.append(get_file_info(file_path))
            except Exception:
                continue

    files.sort(key=lambda x: x["modified_at"], reverse=True)
    return {"files": files}


@router.get("/data/preview/{file_path:path}")
async def preview_file(file_path: str, limit: int = 20):
    """预览文件内容"""
    full_path = DATA_DIR / file_path

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    if not full_path.is_file():
        raise HTTPException(status_code=400, detail="不是文件")

    try:
        full_path.resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="访问被拒绝")

    try:
        if full_path.suffix == ".json":
            with open(full_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return {"data": data[:limit], "total": len(data), "type": "json"}
                return {"data": [data], "total": 1, "type": "json"}
        elif full_path.suffix == ".csv":
            import csv
            with open(full_path, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                rows = []
                for i, row in enumerate(reader):
                    if i >= limit:
                        break
                    rows.append(row)
                f.seek(0)
                total = sum(1 for _ in f) - 1
                return {"data": rows, "total": total, "type": "csv"}
        else:
            raise HTTPException(status_code=400, detail="不支持预览此文件类型")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="JSON 文件格式错误")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data/download/{file_path:path}")
async def download_file(file_path: str):
    """下载文件"""
    full_path = DATA_DIR / file_path

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")

    if not full_path.is_file():
        raise HTTPException(status_code=400, detail="不是文件")

    try:
        full_path.resolve().relative_to(DATA_DIR.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="访问被拒绝")

    return FileResponse(
        path=full_path,
        filename=full_path.name,
        media_type="application/octet-stream"
    )


# ============================================================================
# 视频代理
# ============================================================================


# 平台对应的Referer域名
PLATFORM_REFERERS = {
    "xhscdn.com": "https://www.xiaohongshu.com/",
    "xiaohongshu.com": "https://www.xiaohongshu.com/",
    "douyinvod.com": "https://www.douyin.com/",
    "douyinpic.com": "https://www.douyin.com/",
    "douyin.com": "https://www.douyin.com/",
    "kuaishou.com": "https://www.kuaishou.com/",
    "bilibili.com": "https://www.bilibili.com/",
    "bilivideo.com": "https://www.bilibili.com/",
    "hdslb.com": "https://www.bilibili.com/",
}


def get_referer_for_url(url: str) -> str:
    """根据URL获取对应的Referer"""
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    
    for domain, referer in PLATFORM_REFERERS.items():
        if domain in host:
            return referer
    
    return ""


@router.get("/proxy/video")
async def proxy_video(url: str):
    """
    视频代理接口
    
    解决小红书、抖音等平台CDN的防盗链问题
    通过后端代理请求视频，添加正确的Referer头
    """
    if not url:
        raise HTTPException(status_code=400, detail="缺少视频URL")
    
    # 验证URL格式
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="无效的URL格式")
    
    # 获取对应的Referer
    referer = get_referer_for_url(url)
    
    # 构建请求头
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Encoding": "identity",
        "Connection": "keep-alive",
    }
    
    if referer:
        headers["Referer"] = referer
        headers["Origin"] = referer.rstrip("/")
    
    async def stream_video():
        """流式传输视频内容"""
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            async with client.stream("GET", url, headers=headers) as response:
                if response.status_code != 200:
                    logger.error(f"视频代理请求失败: {response.status_code}")
                    return
                
                async for chunk in response.aiter_bytes(chunk_size=65536):
                    yield chunk
    
    # 获取视频的Content-Type
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10.0) as client:
            head_response = await client.head(url, headers=headers)
            content_type = head_response.headers.get("Content-Type", "video/mp4")
            content_length = head_response.headers.get("Content-Length")
    except Exception as e:
        logger.warning(f"无法获取视频头信息: {e}")
        content_type = "video/mp4"
        content_length = None
    
    response_headers = {
        "Content-Type": content_type,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
    }
    
    if content_length:
        response_headers["Content-Length"] = content_length
    
    return StreamingResponse(
        stream_video(),
        media_type=content_type,
        headers=response_headers
    )


@router.get("/data/stats")
async def get_data_stats():
    """获取数据统计"""
    if not DATA_DIR.exists():
        return {"total_files": 0, "total_size": 0, "by_platform": {}, "by_type": {}}

    stats = {
        "total_files": 0,
        "total_size": 0,
        "by_platform": {},
        "by_type": {}
    }

    supported_extensions = {".json", ".csv", ".xlsx", ".xls"}

    for root, dirs, filenames in os.walk(DATA_DIR):
        root_path = Path(root)
        for filename in filenames:
            file_path = root_path / filename
            if file_path.suffix.lower() not in supported_extensions:
                continue

            try:
                stat = file_path.stat()
                stats["total_files"] += 1
                stats["total_size"] += stat.st_size

                file_type = file_path.suffix[1:].lower()
                stats["by_type"][file_type] = stats["by_type"].get(file_type, 0) + 1

                rel_path = str(file_path.relative_to(DATA_DIR))
                for platform in ["xhs", "dy", "ks", "bili", "wb", "tieba", "zhihu"]:
                    if platform in rel_path.lower():
                        stats["by_platform"][platform] = stats["by_platform"].get(platform, 0) + 1
                        break
            except Exception:
                continue

    return stats


# ============================================================================
# WebSocket 端点
# ============================================================================


@router.websocket("/ws/logs")
async def websocket_logs(websocket: WebSocket):
    """WebSocket 日志流"""
    try:
        start_broadcaster()
        await ws_manager.connect(websocket)
        logger.info(f"[Crawler WS] 已连接，当前连接数: {len(ws_manager.active_connections)}")

        # 发送已有日志
        for log in crawler_manager.logs:
            try:
                await websocket.send_json(log.model_dump())
            except Exception:
                break

        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                try:
                    await websocket.send_text("ping")
                except Exception:
                    break

    except WebSocketDisconnect:
        logger.info("[Crawler WS] 客户端断开连接")
    except Exception as e:
        logger.error(f"[Crawler WS] 错误: {e}")
    finally:
        ws_manager.disconnect(websocket)
        logger.info(f"[Crawler WS] 清理完成，当前连接数: {len(ws_manager.active_connections)}")


@router.websocket("/ws/status")
async def websocket_status(websocket: WebSocket):
    """WebSocket 状态流"""
    await websocket.accept()
    try:
        while True:
            status = crawler_manager.get_status()
            await websocket.send_json(status)
            await asyncio.sleep(1)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
