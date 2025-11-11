"""OCR相关路由"""

import logging

from fastapi import APIRouter, HTTPException

from lifetrace.routers import dependencies as deps

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


@router.post("/process")
async def process_ocr(screenshot_id: int):
    """手动触发OCR处理"""
    if not deps.ocr_processor.is_available():
        raise HTTPException(status_code=503, detail="OCR服务不可用")

    screenshot = deps.db_manager.get_screenshot_by_id(screenshot_id)
    if not screenshot:
        raise HTTPException(status_code=404, detail="截图不存在")

    if screenshot["is_processed"]:
        raise HTTPException(status_code=400, detail="截图已经处理过")

    try:
        # 执行OCR处理
        ocr_result = deps.ocr_processor.process_image(screenshot["file_path"])

        if ocr_result["success"]:
            # 保存OCR结果
            deps.db_manager.add_ocr_result(
                screenshot_id=screenshot["id"],
                text_content=ocr_result["text_content"],
                confidence=ocr_result["confidence"],
                language=ocr_result.get("language", "ch"),
                processing_time=ocr_result["processing_time"],
            )

            return {
                "success": True,
                "text_content": ocr_result["text_content"],
                "confidence": ocr_result["confidence"],
                "processing_time": ocr_result["processing_time"],
            }
        else:
            raise HTTPException(status_code=500, detail=ocr_result["error"])

    except Exception as e:
        logging.error(f"OCR处理失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/statistics")
async def get_ocr_statistics():
    """获取OCR处理统计"""
    return deps.ocr_processor.get_statistics()
