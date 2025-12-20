"""OCR相关路由"""

from fastapi import APIRouter, HTTPException

from lifetrace.core.dependencies import get_ocr_processor
from lifetrace.storage import ocr_mgr, screenshot_mgr
from lifetrace.util.logging_config import get_logger

logger = get_logger()

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


@router.post("/process")
async def process_ocr(screenshot_id: int):
    """手动触发OCR处理"""
    ocr_processor = get_ocr_processor()
    if not ocr_processor.is_available():
        raise HTTPException(status_code=503, detail="OCR服务不可用")

    screenshot = screenshot_mgr.get_screenshot_by_id(screenshot_id)
    if not screenshot:
        raise HTTPException(status_code=404, detail="截图不存在")

    if screenshot["is_processed"]:
        raise HTTPException(status_code=400, detail="截图已经处理过")

    try:
        # 执行OCR处理
        ocr_result = ocr_processor.process_image(screenshot["file_path"])

        if ocr_result["success"]:
            # 保存OCR结果
            ocr_mgr.add_ocr_result(
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
        logger.error(f"OCR处理失败: {e}")
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/statistics")
async def get_ocr_statistics():
    """获取OCR处理统计"""
    ocr_processor = get_ocr_processor()
    return ocr_processor.get_statistics()
