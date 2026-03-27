"""初始化向导路由 — 首次启动的引导流程 API"""

from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, UploadFile
from pydantic import BaseModel

from services.config_service import ConfigService
from util.base_paths import get_user_data_dir
from util.logging_config import get_logger
from util.settings import settings

logger = get_logger()

router = APIRouter(prefix="/api/setup", tags=["setup"])

_config_service = ConfigService()
_background_tasks: set[asyncio.Task] = set()


class ScanRequest(BaseModel):
    directory: str
    max_files: int = 500


class ScanResult(BaseModel):
    valid: bool = True
    directory: str
    total_files: int = 0
    file_count: int = 0
    files: list[dict[str, Any]] = []
    scan_time_ms: int = 0


class AnalyzeFilesRequest(BaseModel):
    filenames: list[str]
    directory: str = ""


class AnalyzeFilesResult(BaseModel):
    guessed_name: str = ""
    initial_profile: str = ""


class CompleteRequest(BaseModel):
    user_name: str = ""
    agent_name: str = "Free U"
    scan_directories: list[str] = []
    allowed_apps: list[str] = ["微信"]
    initial_profile: str = ""


@router.get("/status")
async def get_setup_status():
    """检查初始化向导是否已完成。"""
    completed = (
        getattr(settings, "setup", {}).get("completed", False)
        if hasattr(settings, "setup")
        else False
    )
    return {"completed": completed}


@router.get("/default-directory")
async def get_default_directory():
    """返回当前系统的桌面路径。"""
    desktop = Path.home() / "Desktop"
    if not desktop.exists():
        desktop = Path.home()
    return {"directory": str(desktop)}


@router.post("/scan-directory")
async def scan_directory(req: ScanRequest) -> ScanResult:
    """扫描指定目录下最近修改的文件名（不读取文件内容）。"""
    target = Path(req.directory).expanduser().resolve()
    if not target.exists() or not target.is_dir():
        return ScanResult(
            valid=False, directory=str(target), file_count=0, files=[], scan_time_ms=0
        )

    t0 = time.perf_counter()
    entries: list[dict[str, Any]] = []

    try:
        for root, _dirs, filenames in os.walk(target):
            for fname in filenames:
                if fname.startswith("."):
                    continue
                fp = Path(root) / fname
                try:
                    stat = fp.stat()
                    entries.append(
                        {
                            "name": fname,
                            "path": str(fp),
                            "size": stat.st_size,
                            "modified": stat.st_mtime,
                            "ext": fp.suffix.lower(),
                        }
                    )
                except OSError:
                    continue
                if len(entries) >= req.max_files * 3:
                    break
            if len(entries) >= req.max_files * 3:
                break
    except PermissionError:
        pass

    total_files = len(entries)
    entries.sort(key=lambda e: e["modified"], reverse=True)

    useful_exts = {
        ".doc",
        ".docx",
        ".pdf",
        ".ppt",
        ".pptx",
        ".xls",
        ".xlsx",
        ".txt",
        ".md",
        ".csv",
        ".rtf",
        ".odt",
        ".pages",
        ".key",
        ".numbers",
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".bmp",
        ".webp",
        ".svg",
        ".heic",
        ".tiff",
        ".mp4",
        ".avi",
        ".mov",
        ".mkv",
        ".wmv",
        ".flv",
        ".webm",
        ".m4v",
        ".mp3",
        ".wav",
        ".flac",
        ".aac",
        ".ogg",
        ".m4a",
        ".wma",
        ".zip",
        ".rar",
        ".7z",
        ".tar",
        ".gz",
        ".py",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".java",
        ".c",
        ".cpp",
        ".go",
        ".rs",
        ".html",
        ".css",
        ".json",
        ".yaml",
        ".yml",
        ".xml",
        ".sql",
        ".lnk",
        ".url",
    }
    filtered = [e for e in entries if e["ext"] in useful_exts]
    filtered = filtered[: req.max_files]

    elapsed = int((time.perf_counter() - t0) * 1000)
    return ScanResult(
        directory=str(target),
        total_files=total_files,
        file_count=len(filtered),
        files=filtered,
        scan_time_ms=elapsed,
    )


_ANALYZE_SYSTEM_PROMPT = (
    "你是一个用户画像分析助手。根据用户电脑上的文件名列表，推断用户的身份和角色。\n\n"
    "你需要完成两件事：\n"
    "1. **猜测用户的名字**：从文件名中寻找可能的人名线索（如「张三的文档」「李四简历」"
    "「王五_论文」等），也可能出现在路径中的用户名文件夹。"
    "如果找不到明确的名字线索，返回空字符串。\n"
    "2. **生成身份与角色描述**：根据文件类型和内容推断用户身份。\n\n"
    "输出格式严格为：\n"
    "```\n"
    "NAME: <猜测的用户名字，找不到就留空>\n"
    "---PROFILE---\n"
    "## 身份与角色\n"
    "<2-4 个 bullet>\n"
    "```\n\n"
    "要求：\n"
    "- 只输出「## 身份与角色」这一个板块，不要输出其他板块\n"
    "- 2-4 个 bullet（`- `开头），总字数控制在 200 字以内\n"
    "- 根据文件类型和内容推断身份（学生/职场人/开发者/创业者/设计师等）\n"
    "- 所有推断基于文件名，语气用「可能」「似乎」等表达不确定性"
)

_ANALYZE_USER_TEMPLATE = """\
以下是用户电脑 `{directory}` 目录下的文件名列表（按最近修改排序）：

{filenames}

请根据这些文件名分析用户画像并猜测用户名字。
"""


@router.post("/analyze-files")
async def analyze_files(req: AnalyzeFilesRequest) -> AnalyzeFilesResult:  # noqa: C901
    """用 LLM 分析文件名，猜测用户名字并生成初始画像。"""
    if not req.filenames:
        return AnalyzeFilesResult()

    try:
        from llm.llm_client import LLMClient  # noqa: PLC0415
    except ImportError:
        logger.warning("LLM 模块不可用，跳过文件分析")
        return AnalyzeFilesResult()

    llm = LLMClient()
    if not llm.is_available():
        logger.warning("LLM 客户端不可用，跳过文件分析")
        return AnalyzeFilesResult()

    filenames_text = "\n".join(f"- {name}" for name in req.filenames[:300])
    prompt = _ANALYZE_USER_TEMPLATE.format(
        directory=req.directory or "未知目录",
        filenames=filenames_text,
    )
    messages: list[dict[str, str]] = [
        {"role": "system", "content": _ANALYZE_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]

    try:
        resp = await asyncio.to_thread(
            llm.chat,
            messages,
            0.3,
            None,
            2048,
            log_usage=True,
            log_meta={"endpoint": "setup_analyze_files", "feature_type": "setup"},
        )
    except Exception:
        logger.exception("analyze-files LLM 调用失败")
        return AnalyzeFilesResult()

    guessed_name = ""
    initial_profile = ""

    if resp:
        lines = resp.strip().split("\n")
        profile_start = -1
        for i, line in enumerate(lines):
            if line.strip().startswith("NAME:"):
                guessed_name = line.split(":", 1)[1].strip()
            if "---PROFILE---" in line:
                profile_start = i + 1
                break

        if profile_start >= 0:
            initial_profile = "\n".join(lines[profile_start:]).strip()
            if initial_profile.startswith("```"):
                initial_profile = initial_profile[3:].strip()
            if initial_profile.endswith("```"):
                initial_profile = initial_profile[:-3].strip()

    if initial_profile and not initial_profile.startswith("# "):
        initial_profile = f"# 用户画像\n\n{initial_profile}"

    logger.info(
        "文件分析完成: guessed_name=%s, profile_len=%d",
        guessed_name or "(empty)",
        len(initial_profile),
    )
    return AnalyzeFilesResult(guessed_name=guessed_name, initial_profile=initial_profile)


class AddWorkspaceRequest(BaseModel):
    directory: str


class AddWorkspaceResult(BaseModel):
    success: bool = True
    directory: str = ""
    error: str = ""


async def _background_scan_and_update_profile(directory: str) -> None:
    """后台静默执行：扫描目录文件 → LLM 分析 → 追加写入用户画像。"""
    try:
        scan_result = await scan_directory(ScanRequest(directory=directory, max_files=500))
        if not scan_result.files:
            logger.info("目录 %s 无文件，跳过画像分析", directory)
            return

        filenames = [f["name"] for f in scan_result.files]
        analyze_result = await analyze_files(
            AnalyzeFilesRequest(filenames=filenames, directory=directory)
        )
        if not analyze_result.initial_profile:
            logger.info("目录 %s 画像分析无结果", directory)
            return

        memory_dir = get_user_data_dir() / "memory"
        profile_dir = memory_dir / "profile_L4"
        profile_dir.mkdir(parents=True, exist_ok=True)
        profile_file = profile_dir / "user_profile.md"

        existing = ""
        if profile_file.exists():
            existing = profile_file.read_text(encoding="utf-8").strip()
        separator = f"\n\n---\n\n## 工作目录分析：{directory}\n\n"
        updated = (
            existing + separator + analyze_result.initial_profile
            if existing
            else analyze_result.initial_profile
        )
        profile_file.write_text(updated, encoding="utf-8")
        logger.info("用户画像已更新（追加目录分析）: %s", profile_file)
    except Exception:
        logger.exception("后台扫描/分析工作目录失败: %s", directory)


@router.post("/add-workspace")
async def add_workspace(req: AddWorkspaceRequest) -> AddWorkspaceResult:
    """从设置页添加工作目录。

    配置立即写入并返回，扫描文件 + 画像分析在后台静默执行。
    """
    target = Path(req.directory).expanduser().resolve()
    if not target.exists() or not target.is_dir():
        return AddWorkspaceResult(success=False, error=f"目录不存在: {target}")

    dir_str = str(target)

    current_dirs: list[str] = list(settings.get("setup.scan_directories", []) or [])
    if dir_str not in current_dirs:
        current_dirs.append(dir_str)

    config_updates: dict[str, Any] = {
        "setup.scan_directories": current_dirs,
        "agno.default_workspace": dir_str,
    }
    _config_service.save_config(config_updates)

    task = asyncio.create_task(_background_scan_and_update_profile(dir_str))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return AddWorkspaceResult(success=True, directory=dir_str)


@router.post("/complete")
async def complete_setup(req: CompleteRequest):
    """标记初始化向导完成，保存设置到 config。"""
    config_updates: dict[str, Any] = {
        "setup.completed": True,
        "setup.user_name": req.user_name,
        "setup.agent_name": req.agent_name,
        "setup.scan_directories": req.scan_directories,
        "setup.allowed_apps": req.allowed_apps,
    }

    # 将第一个扫描目录设为 Agno Agent 的默认工作区
    if req.scan_directories:
        workspace = req.scan_directories[0]
        config_updates["agno.default_workspace"] = workspace
        logger.info(f"设置 Agno 默认工作区: {workspace}")

    _config_service.save_config(config_updates)

    if req.initial_profile:
        try:
            memory_dir = get_user_data_dir() / "memory"
            profile_dir = memory_dir / "profile_L4"
            profile_dir.mkdir(parents=True, exist_ok=True)
            profile_file = profile_dir / "user_profile.md"
            existing = (
                profile_file.read_text(encoding="utf-8").strip() if profile_file.exists() else ""
            )
            is_default = not existing or "画像将在积累足够的观察数据后自动生成" in existing
            if is_default:
                profile_file.write_text(req.initial_profile, encoding="utf-8")
                logger.info("初始用户画像已写入: %s", profile_file)
        except Exception:
            logger.exception("写入初始用户画像失败")

    logger.info(f"初始化向导完成: user={req.user_name}, agent={req.agent_name}")
    return {"success": True}


@router.post("/save-voiceprint")
async def save_voiceprint(file: UploadFile):
    """接收录制的声纹音频文件并保存到本地。"""
    voiceprint_dir = get_user_data_dir() / "voiceprint"
    voiceprint_dir.mkdir(parents=True, exist_ok=True)
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    dest = voiceprint_dir / f"voiceprint_{timestamp}.webm"
    content = await file.read()
    dest.write_bytes(content)
    logger.info(f"声纹音频已保存: {dest} ({len(content)} bytes)")
    return {"success": True, "path": str(dest), "size": len(content)}


@router.get("/voiceprint-status")
async def voiceprint_status():
    """返回当前声纹录制状态。"""
    voiceprint_dir = get_user_data_dir() / "voiceprint"
    if not voiceprint_dir.exists():
        return {"exists": False}
    files = sorted(
        voiceprint_dir.glob("voiceprint_*.*"), key=lambda p: p.stat().st_mtime, reverse=True
    )
    if not files:
        return {"exists": False}
    latest = files[0]
    return {
        "exists": True,
        "path": str(latest),
        "size": latest.stat().st_size,
    }


@router.post("/delete-voiceprint")
async def delete_voiceprint():
    """删除所有已录制的声纹文件。"""
    voiceprint_dir = get_user_data_dir() / "voiceprint"
    if not voiceprint_dir.exists():
        return {"success": True}
    deleted = 0
    for f in voiceprint_dir.glob("voiceprint_*.*"):
        try:
            f.unlink()
            deleted += 1
        except Exception:
            logger.exception("删除声纹文件失败: %s", f)
    logger.info("已删除 %d 个声纹文件", deleted)
    return {"success": True, "deleted": deleted}


@router.post("/reset")
async def reset_setup():
    """重置初始化向导，并将 memory 文件夹重命名为 backup。"""
    # 1. 设置 setup.completed = False
    config_updates: dict[str, Any] = {
        "setup.completed": False,
    }
    _config_service.save_config(config_updates)

    # 2. 备份 memory 文件夹
    memory_dir = get_user_data_dir() / "memory"
    if memory_dir.exists() and memory_dir.is_dir():
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        backup_dir = get_user_data_dir() / f"memory_backup_{timestamp}"
        try:
            os.rename(memory_dir, backup_dir)
            logger.info(f"已将 memory 文件夹备份为: {backup_dir}")
            # 重新创建一个空的 memory 文件夹，避免其他模块找不到目录报错
            memory_dir.mkdir(parents=True, exist_ok=True)
            logger.info("已重新创建空的 memory 文件夹")
        except Exception as e:
            logger.error(f"备份 memory 文件夹失败: {e}")

    return {"success": True}
