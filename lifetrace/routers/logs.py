"""日志相关路由"""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse

from lifetrace.routers import dependencies as deps

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("/files")
async def get_log_files():
    """获取日志文件列表"""
    try:
        # 使用配置中的日志目录
        logs_dir = Path(deps.config.log_path)
        if not logs_dir.exists():
            return []

        log_files = []
        # 递归扫描所有子目录中的.log文件
        for file_path in logs_dir.rglob("*.log"):
            # 获取相对于logs目录的路径
            relative_path = file_path.relative_to(logs_dir)
            # 获取文件大小
            file_size = file_path.stat().st_size
            size_str = f"{file_size // 1024}KB" if file_size > 1024 else f"{file_size}B"

            log_files.append(
                {
                    "name": str(relative_path),
                    "path": str(file_path),
                    "size": size_str,
                    "category": relative_path.parent.name
                    if relative_path.parent.name != "."
                    else "root",
                }
            )

        return sorted(log_files, key=lambda x: x["name"])
    except Exception as e:
        deps.logger.error(f"获取日志文件列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/content", response_class=PlainTextResponse)
async def get_log_content(file: str = Query(..., description="日志文件相对路径")):
    """获取日志文件内容"""
    try:
        # 使用配置中的日志目录
        logs_dir = Path(deps.config.log_path)

        log_file = logs_dir / file

        # 安全检查：确保文件在logs目录内
        if not str(log_file.resolve()).startswith(str(logs_dir.resolve())):
            raise HTTPException(status_code=400, detail="无效的文件路径")

        if not log_file.exists():
            raise HTTPException(status_code=404, detail="日志文件不存在")

        # 读取文件内容（最后1000行）
        with open(log_file, encoding="utf-8") as f:
            lines = f.readlines()
            # 只返回最后1000行，避免内存问题
            if len(lines) > 1000:
                lines = lines[-1000:]
            return "".join(lines)
    except HTTPException:
        raise
    except Exception as e:
        deps.logger.error(f"读取日志文件失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e
