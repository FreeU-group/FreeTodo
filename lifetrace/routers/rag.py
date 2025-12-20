"""RAG服务和应用图标相关路由"""

from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from lifetrace.core.dependencies import get_rag_service
from lifetrace.util.app_utils import get_icon_filename
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api", tags=["rag"])


@router.get("/rag/health")
async def rag_health_check():
    """RAG服务健康检查"""
    try:
        return get_rag_service().health_check()
    except Exception as e:
        logger.error(f"RAG健康检查失败: {e}")
        return {
            "rag_service": "error",
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
        }


@router.get("/app-icon/{app_name}")
async def get_app_icon(app_name: str):
    """
    获取应用图标
    根据映射表返回对应的图标文件

    Args:
        app_name: 应用名称

    Returns:
        图标文件
    """
    try:
        # 根据映射表获取图标文件名
        icon_filename = get_icon_filename(app_name)

        if not icon_filename:
            raise HTTPException(status_code=404, detail="图标未找到")

        # 构建图标文件路径
        # 获取项目根目录（lifetrace 的父目录）
        from lifetrace.util.path_utils import get_app_root

        lifetrace_dir = get_app_root()
        project_root = lifetrace_dir.parent
        icon_path = project_root / ".github" / "assets" / "icons" / "apps" / icon_filename

        if not icon_path.exists():
            logger.warning(f"图标文件不存在: {icon_path}")
            raise HTTPException(status_code=404, detail="图标文件不存在")

        # 返回图标文件
        return FileResponse(
            str(icon_path),
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"},  # 缓存1天
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取应用图标失败 {app_name}: {e}")
        raise HTTPException(status_code=500, detail=f"获取图标失败: {str(e)}") from e
