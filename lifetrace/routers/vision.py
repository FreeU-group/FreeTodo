"""视觉多模态相关路由"""

from datetime import datetime

from fastapi import APIRouter, HTTPException

from lifetrace.core.dependencies import get_rag_service
from lifetrace.schemas.vision import VisionChatRequest, VisionChatResponse
from lifetrace.util.logging_config import get_logger

logger = get_logger()

# 常量定义
MAX_SCREENSHOTS_PER_REQUEST = 20  # 一次请求最多处理的截图数量

router = APIRouter(prefix="/api/vision", tags=["vision"])


@router.post("/chat", response_model=VisionChatResponse)
async def vision_chat(request: VisionChatRequest):
    """
    视觉多模态聊天接口

    使用通义千问视觉模型分析多张截图，支持文本提示词。

    Args:
        request: 视觉聊天请求，包含截图ID列表和提示词

    Returns:
        视觉聊天响应，包含模型生成的文本和元信息

    Raises:
        HTTPException: 当请求参数无效或API调用失败时
    """
    try:
        # 验证截图ID列表
        if not request.screenshot_ids:
            raise HTTPException(
                status_code=400, detail="截图ID列表不能为空，至少需要提供一个截图ID"
            )

        if len(request.screenshot_ids) > MAX_SCREENSHOTS_PER_REQUEST:
            raise HTTPException(
                status_code=400,
                detail=f"一次最多只能处理{MAX_SCREENSHOTS_PER_REQUEST}张截图",
            )

        logger.info(
            f"收到视觉多模态请求: {len(request.screenshot_ids)} 张截图, prompt长度: {len(request.prompt)}"
        )

        # 检查LLM客户端是否可用
        rag_service = get_rag_service()
        if not rag_service.llm_client.is_available():
            raise HTTPException(
                status_code=503,
                detail="LLM服务当前不可用，请检查配置或稍后重试",
            )

        # 调用视觉模型
        result = rag_service.llm_client.vision_chat(
            screenshot_ids=request.screenshot_ids,
            prompt=request.prompt,
            model=request.model,
            temperature=request.temperature,
            max_tokens=request.max_tokens,
        )

        # 构建响应
        response = VisionChatResponse(
            response=result["response"],
            timestamp=datetime.now(),
            usage_info=result.get("usage_info"),
            model=result.get("model"),
            screenshot_count=result["screenshot_count"],
        )

        logger.info(f"视觉多模态分析完成: 处理了 {result['screenshot_count']} 张截图")

        return response

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"视觉多模态请求参数错误: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        logger.error(f"视觉多模态服务不可用: {e}")
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        logger.error(f"视觉多模态分析失败: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"处理视觉多模态请求时发生错误: {str(e)}",
        ) from e
