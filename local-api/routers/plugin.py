"""插件管理 API 路由 - 提供可选插件的查询、安装和卸载接口。"""

from __future__ import annotations

import asyncio
import importlib
import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from services.plugin_manager import media_crawler_plugin
from util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/plugins", tags=["plugins"])

# ==============================================================================
# MediaCrawler 插件
# ==============================================================================


@router.get("/media-crawler/status")
async def get_media_crawler_status():
    """获取 MediaCrawler 插件的安装状态。

    Returns:
        插件状态信息，包括是否安装、版本、模式等。
    """
    try:
        status = media_crawler_plugin.get_status()
        return {"success": True, **status}
    except Exception as e:
        logger.error(f"获取插件状态失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取插件状态失败: {e}") from e


@router.post("/media-crawler/install")
async def install_media_crawler(
    version: str | None = None,
    download_url: str | None = None,
):
    """安装 MediaCrawler 插件（流式返回安装进度）。

    安装过程包括：下载 → 解压 → 安装依赖。
    通过 NDJSON（每行一个 JSON 对象）流式返回每个阶段的进度。

    Args:
        version: 要安装的版本号（默认为最新版）。
        download_url: 自定义下载 URL（可选，覆盖默认地址）。
    """
    if media_crawler_plugin.is_installed():
        installed_version = media_crawler_plugin.get_installed_version()
        target_version = version or media_crawler_plugin.LATEST_VERSION
        if installed_version == target_version:
            return {
                "success": True,
                "message": f"插件已安装 (v{installed_version})，无需重复安装",
                "already_installed": True,
            }

    progress = await media_crawler_plugin.download_and_install(
        version=version,
        download_url=download_url,
    )

    async def stream_progress():
        async for step in progress.run():
            yield json.dumps(step, ensure_ascii=False) + "\n"

    return StreamingResponse(
        stream_progress(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.post("/media-crawler/uninstall")
async def uninstall_media_crawler():
    """卸载 MediaCrawler 插件（删除插件安装目录）。

    卸载前会自动停止正在运行的爬虫和签名服务进程，以释放文件锁。
    """
    if not media_crawler_plugin.is_installed():
        return {
            "success": True,
            "message": "插件未安装，无需卸载",
        }

    try:
        # 卸载前先停止所有相关进程，避免 Windows 文件锁定
        await _stop_all_crawler_processes()

        success = await media_crawler_plugin.uninstall()
        if success:
            return {"success": True, "message": "插件已成功卸载"}
        raise HTTPException(status_code=500, detail="卸载失败，请查看日志")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"卸载插件失败: {e}")
        raise HTTPException(status_code=500, detail=f"卸载插件失败: {e}") from e


async def _stop_all_crawler_processes() -> None:
    """停止所有爬虫相关进程（爬虫循环 + 爬虫进程 + 签名服务）。"""
    try:
        _crawler_mod = importlib.import_module("routers.crawler")

        # 1. 设置停止标志，停止循环爬取
        _crawler_mod._stop_loop_flag = True
        _crawler_mod._crawler_status = "stopping"
        logger.info("[卸载] 正在停止爬虫和签名服务进程...")

        # 2. 停止当前爬虫进程
        _crawler_mod.stop_crawler_process()

        # 3. 等待循环任务结束
        task = _crawler_mod._loop_crawler_task
        if task is not None and not task.done():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
            except (TimeoutError, asyncio.CancelledError):
                task.cancel()

        # 4. 停止签名服务
        _crawler_mod.stop_sign_service()

        _crawler_mod._crawler_status = "idle"
        logger.info("[卸载] 所有爬虫进程已停止")

        # 5. 等待一小段时间让操作系统释放文件句柄
        await asyncio.sleep(1)

    except ImportError:
        logger.warning("[卸载] 无法导入 crawler 模块，跳过进程停止步骤")
    except Exception as e:
        logger.warning(f"[卸载] 停止爬虫进程时出错（继续卸载）: {e}")


# ==============================================================================
# 通用插件列表（目前只有 media-crawler）
# ==============================================================================


@router.get("/list")
async def list_plugins():
    """列出所有可用的插件及其状态。"""
    try:
        return {
            "success": True,
            "plugins": [
                media_crawler_plugin.get_status(),
            ],
        }
    except Exception as e:
        logger.error(f"获取插件列表失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取插件列表失败: {e}") from e
