"""截图相关路由"""

import os
from datetime import datetime

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import FileResponse

from lifetrace.schemas.screenshot import ScreenshotResponse
from lifetrace.storage import get_session, screenshot_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/screenshots", tags=["screenshot"])


@router.get("", response_model=list[ScreenshotResponse])
async def get_screenshots(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    app_name: str | None = Query(None),
):
    """获取截图列表"""
    try:
        # 解析日期
        start_dt = None
        end_dt = None

        if start_date:
            start_dt = datetime.fromisoformat(start_date)
        if end_date:
            end_dt = datetime.fromisoformat(end_date)

        # 搜索截图 - 直接传递offset和limit给数据库查询
        results = screenshot_mgr.search_screenshots(
            start_date=start_dt,
            end_date=end_dt,
            app_name=app_name,
            limit=limit,
            offset=offset,  # 新增offset参数
        )

        return [ScreenshotResponse(**result) for result in results]

    except Exception as e:
        logger.error(f"获取截图列表失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/{screenshot_id}")
async def get_screenshot(screenshot_id: int):
    """获取单个截图详情"""
    screenshot = screenshot_mgr.get_screenshot_by_id(screenshot_id)

    if not screenshot:
        raise HTTPException(status_code=404, detail="截图不存在")

    # 获取OCR结果
    ocr_data = None
    try:
        with get_session() as session:
            from lifetrace.storage.models import OCRResult

            ocr_result = session.query(OCRResult).filter_by(screenshot_id=screenshot_id).first()

            # 在session内提取数据
            if ocr_result:
                ocr_data = {
                    "text_content": ocr_result.text_content,
                    "confidence": ocr_result.confidence,
                    "language": ocr_result.language,
                    "processing_time": ocr_result.processing_time,
                }
    except Exception as e:
        logger.warning(f"获取OCR结果失败: {e}")

    # screenshot已经是字典格式，直接使用
    result = screenshot.copy()
    result["ocr_result"] = ocr_data

    return result


@router.get("/{screenshot_id}/image")
async def get_screenshot_image(screenshot_id: int):
    """获取截图图片文件"""
    try:
        screenshot = screenshot_mgr.get_screenshot_by_id(screenshot_id)

        if not screenshot:
            raise HTTPException(status_code=404, detail="截图不存在")

        # 检查文件是否已被清理
        if screenshot.get("file_deleted", False):
            logger.debug(f"截图文件已被清理: screenshot_id={screenshot_id}")
            raise HTTPException(status_code=410, detail="文件已被清理")

        file_path = screenshot["file_path"]

        # 检查文件是否存在
        if not os.path.exists(file_path):
            logger.warning(f"截图文件不存在: screenshot_id={screenshot_id}, path={file_path}")
            raise HTTPException(status_code=404, detail="图片文件不存在")

        return FileResponse(
            file_path,
            media_type="image/png",
            filename=f"screenshot_{screenshot_id}.png",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取截图图像时发生错误: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误") from e


@router.get("/{screenshot_id}/path")
async def get_screenshot_path(screenshot_id: int):
    """获取截图文件路径"""
    screenshot = screenshot_mgr.get_screenshot_by_id(screenshot_id)

    if not screenshot:
        raise HTTPException(status_code=404, detail="截图不存在")

    file_path = screenshot["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="图片文件不存在")

    return {"screenshot_id": screenshot_id, "file_path": file_path, "exists": True}


@router.post("/capture")
async def capture_screenshot(request: dict | None = Body(None)):
    """手动触发截屏

    请求体（可选）:
        {"screen_id": 0} - 屏幕ID，默认为0（主屏幕）

    Returns:
        截屏结果，包含截图ID和文件路径
    """
    try:
        from lifetrace.jobs.recorder import get_recorder_instance

        # 解析请求体
        screen_id = 0
        if request and isinstance(request, dict):
            screen_id = request.get("screen_id", 0)

        logger.info(f"📸 手动触发截屏，屏幕ID: {screen_id}")

        recorder = get_recorder_instance()
        file_path, status = recorder._capture_screen(screen_id)

        logger.info(f"📸 截屏结果: file_path={file_path}, status={status}")

        if status == "failed":
            raise HTTPException(status_code=500, detail="截屏失败")
        elif status == "skipped":
            # 跳过重复截图也返回成功，但标记为 skipped
            return {"success": True, "status": "skipped", "message": "跳过重复截图"}

        if not file_path:
            raise HTTPException(status_code=500, detail="截屏失败：未返回文件路径")

        # 从文件路径获取截图ID
        screenshot = screenshot_mgr.get_screenshot_by_path(file_path)
        if not screenshot:
            # 如果找不到记录，等待一下再试（可能数据库还没保存）
            import time

            time.sleep(0.5)
            screenshot = screenshot_mgr.get_screenshot_by_path(file_path)
            if not screenshot:
                raise HTTPException(status_code=500, detail=f"无法找到截屏记录: {file_path}")

        logger.info(f"✅ 截屏成功，截图ID: {screenshot['id']}")

        return {
            "success": True,
            "screenshot_id": screenshot["id"],
            "file_path": file_path,
            "status": status,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"手动截屏失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"截屏失败: {str(e)}") from e
