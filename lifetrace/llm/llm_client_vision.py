"""
LLM 视觉多模态模块
包含视觉分析相关功能
"""

from typing import Any

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings
from lifetrace.util.token_usage_logger import log_token_usage

logger = get_logger()


def get_vision_model(model: str | None, default_model: str) -> str:
    """获取视觉模型名称"""
    return model or settings.llm.vision_model or default_model


def get_vision_temperature(temperature: float | None) -> float:
    """获取视觉模型温度参数"""
    return temperature if temperature is not None else settings.llm.temperature


def get_vision_max_tokens(max_tokens: int | None) -> int:
    """获取视觉模型最大token数"""
    return max_tokens if max_tokens is not None else settings.llm.max_tokens


def vision_chat(
    client,
    default_model: str,
    screenshot_ids: list[int],
    prompt: str,
    model: str | None = None,
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    """视觉多模态聊天：使用通义千问视觉模型分析多张图片

    Args:
        client: OpenAI客户端
        default_model: 默认模型名称
        screenshot_ids: 截图ID列表
        prompt: 文本提示词
        model: 视觉模型名称
        temperature: 温度参数
        max_tokens: 最大生成token数

    Returns:
        包含响应和元信息的字典
    """
    try:
        from lifetrace.util.image_utils import get_screenshots_base64

        screenshot_data = get_screenshots_base64(screenshot_ids)
        valid_screenshots = [item for item in screenshot_data if "base64_data" in item]

        if not valid_screenshots:
            raise ValueError("没有可用的截图，请检查截图ID是否正确")

        content = []

        for item in valid_screenshots:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": item["base64_data"]},
                }
            )

        content.append({"type": "text", "text": prompt})

        messages = [{"role": "user", "content": content}]

        vision_model = get_vision_model(model, default_model)
        vision_temperature = get_vision_temperature(temperature)
        vision_max_tokens = get_vision_max_tokens(max_tokens)

        logger.info(f"调用视觉模型 {vision_model}，处理 {len(valid_screenshots)} 张截图")

        timeout_seconds = min(300, max(60, len(valid_screenshots) * 30))

        response = client.chat.completions.create(
            model=vision_model,
            messages=messages,
            temperature=vision_temperature,
            max_tokens=vision_max_tokens,
            timeout=timeout_seconds,
        )

        result_text = response.choices[0].message.content.strip()

        usage_info = None
        if hasattr(response, "usage") and response.usage:
            usage_info = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            }

            log_token_usage(
                model=vision_model,
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
                endpoint="vision_chat",
                user_query=prompt,
                response_type="vision_analysis",
                feature_type="vision_assistant",
                additional_info={
                    "screenshot_count": len(valid_screenshots),
                    "screenshot_ids": screenshot_ids,
                },
            )

        logger.info(f"视觉模型分析完成，响应长度: {len(result_text)}")

        return {
            "response": result_text,
            "usage_info": usage_info,
            "model": vision_model,
            "screenshot_count": len(valid_screenshots),
        }

    except Exception as e:
        logger.error(f"视觉多模态分析失败: {e}", exc_info=True)
        raise
