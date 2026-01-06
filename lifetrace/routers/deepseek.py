"""DeepSeek API 代理路由 - 提供 OpenAI 兼容的 API 接口"""

import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from lifetrace.llm.llm_client import LLMClient
from lifetrace.util.logging_config import get_logger
from lifetrace.util.token_usage_logger import log_token_usage

logger = get_logger()

router = APIRouter(prefix="/api/deepseek", tags=["deepseek"])


class ChatMessage(BaseModel):
    """聊天消息模型"""

    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    """聊天完成请求模型"""

    model: str = "deepseek-chat"
    messages: list[ChatMessage]
    temperature: float = 0.7
    max_tokens: int | None = None
    stream: bool = False


@router.post("/chat/completions")
async def chat_completions(  # noqa: C901, PLR0915
    request: ChatCompletionRequest,
):
    """OpenAI 兼容的聊天完成接口（支持流式和非流式）"""
    try:
        # 直接使用 LLMClient，避免依赖 RAG 服务（可能初始化较慢）
        llm_client = LLMClient()

        if not llm_client.is_available():
            logger.warning("LLM 客户端不可用")
            raise HTTPException(
                status_code=503, detail="LLM服务当前不可用，请检查 LLM 配置（API Key 和 Base URL）"
            )

        # 转换消息格式
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

        # 准备请求参数
        # 如果前端请求的模型是 'deepseek-chat'，但后端配置的是其他模型（如 qwen-plus），
        # 使用后端配置的模型，因为后端实际调用的是配置的 LLM 服务
        use_model = (
            llm_client.model
            if request.model == "deepseek-chat"
            else (request.model or llm_client.model)
        )

        completion_params: dict[str, Any] = {
            "model": use_model,
            "messages": messages,
            "temperature": request.temperature,
        }

        if request.max_tokens:
            completion_params["max_tokens"] = request.max_tokens

        # 调用 LLM 客户端
        logger.info(
            f"DeepSeek API 请求: model={completion_params['model']}, messages={len(messages)}, stream={request.stream}"
        )

        # 如果请求流式输出
        if request.stream:
            completion_params["stream"] = True
            completion_params["stream_options"] = {"include_usage": True}

            def stream_generator():
                try:
                    response = llm_client.client.chat.completions.create(**completion_params)

                    total_content = ""
                    usage_info = None

                    for chunk in response:
                        # 检查是否有 usage 信息（通常在最后一个 chunk 中）
                        if hasattr(chunk, "usage") and chunk.usage:
                            usage_info = chunk.usage

                        # 检查 choices 是否存在且不为空
                        if chunk.choices and len(chunk.choices) > 0:
                            delta = chunk.choices[0].delta
                            if hasattr(delta, "content") and delta.content:
                                content = delta.content
                                total_content += content

                                # 返回 OpenAI 兼容的流式响应格式
                                chunk_data = {
                                    "id": f"chatcmpl-{chunk.id if hasattr(chunk, 'id') else 'default'}",
                                    "object": "chat.completion.chunk",
                                    "created": int(chunk.created)
                                    if hasattr(chunk, "created")
                                    else 0,
                                    "model": chunk.model if hasattr(chunk, "model") else use_model,
                                    "choices": [
                                        {
                                            "index": 0,
                                            "delta": {"role": "assistant", "content": content},
                                            "finish_reason": None,
                                        }
                                    ],
                                }
                                yield f"data: {json.dumps(chunk_data, ensure_ascii=False)}\n\n"

                    # 发送最终 chunk（包含 finish_reason）
                    final_chunk = {
                        "id": f"chatcmpl-{chunk.id if hasattr(chunk, 'id') else 'default'}",
                        "object": "chat.completion.chunk",
                        "created": int(chunk.created) if hasattr(chunk, "created") else 0,
                        "model": chunk.model if hasattr(chunk, "model") else use_model,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {},
                                "finish_reason": "stop",
                            }
                        ],
                    }
                    if usage_info:
                        final_chunk["usage"] = {
                            "prompt_tokens": usage_info.prompt_tokens,
                            "completion_tokens": usage_info.completion_tokens,
                            "total_tokens": usage_info.total_tokens,
                        }
                    yield f"data: {json.dumps(final_chunk, ensure_ascii=False)}\n\n"
                    yield "data: [DONE]\n\n"

                    # 记录 token 使用量
                    if usage_info:
                        log_token_usage(
                            model=use_model,
                            input_tokens=usage_info.prompt_tokens,
                            output_tokens=usage_info.completion_tokens,
                            endpoint="deepseek_chat_completions_stream",
                            user_query=messages[-1]["content"] if messages else "",
                            response_type="stream",
                            feature_type="voice_module",
                        )

                except Exception as e:
                    logger.error(f"流式生成失败: {e}", exc_info=True)
                    error_chunk = {
                        "error": {
                            "message": f"流式生成出现异常: {str(e)}",
                            "type": "stream_error",
                        }
                    }
                    yield f"data: {json.dumps(error_chunk, ensure_ascii=False)}\n\n"

            headers = {
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Content-Type": "text/event-stream",
            }
            return StreamingResponse(stream_generator(), headers=headers)

        # 非流式输出
        response = llm_client.client.chat.completions.create(**completion_params)

        # 记录 token 使用量
        if hasattr(response, "usage") and response.usage:
            log_token_usage(
                model=completion_params["model"],
                input_tokens=response.usage.prompt_tokens,
                output_tokens=response.usage.completion_tokens,
                endpoint="deepseek_chat_completions",
                user_query=messages[-1]["content"] if messages else "",
                response_type="chat_completion",
                feature_type="voice_module",
            )

        # 返回 OpenAI 兼容的响应格式
        return JSONResponse(
            content={
                "id": f"chatcmpl-{response.id if hasattr(response, 'id') else 'default'}",
                "object": "chat.completion",
                "created": int(response.created) if hasattr(response, "created") else 0,
                "model": response.model,
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "role": response.choices[0].message.role,
                            "content": response.choices[0].message.content,
                        },
                        "finish_reason": response.choices[0].finish_reason
                        if hasattr(response.choices[0], "finish_reason")
                        else "stop",
                    }
                ],
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "total_tokens": response.usage.total_tokens if response.usage else 0,
                }
                if response.usage
                else {
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                },
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DeepSeek API 请求失败: {e}", exc_info=True)
        error_detail = str(e)
        # 提供更友好的错误信息
        if "api_key" in error_detail.lower() or "authentication" in error_detail.lower():
            error_detail = "LLM API Key 配置错误，请检查配置文件中的 llm.api_key"
        elif "base_url" in error_detail.lower() or "url" in error_detail.lower():
            error_detail = "LLM Base URL 配置错误，请检查配置文件中的 llm.base_url"
        elif "connection" in error_detail.lower() or "network" in error_detail.lower():
            error_detail = "无法连接到 LLM 服务，请检查网络连接和 Base URL 配置"

        raise HTTPException(status_code=500, detail=f"处理请求时发生错误: {error_detail}") from e
