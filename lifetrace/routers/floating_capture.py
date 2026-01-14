"""悬浮窗截图待办提取路由"""

import base64
import json
import os
import re
import time
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException

from lifetrace.llm.llm_client import LLMClient
from lifetrace.schemas.floating_capture import (
    CreatedTodo,
    ExtractedTodo,
    FloatingCaptureRequest,
    FloatingCaptureResponse,
)
from lifetrace.storage import todo_mgr
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.settings import settings
from lifetrace.util.time_parser import calculate_scheduled_time

logger = get_logger()

router = APIRouter(prefix="/api/floating-capture", tags=["floating-capture"])

# LLM 客户端单例
_llm_client: LLMClient | None = None


def get_llm_client() -> LLMClient:
    """获取 LLM 客户端单例"""
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client


@router.post("/extract-todos", response_model=FloatingCaptureResponse)
async def extract_todos_from_capture(request: FloatingCaptureRequest) -> FloatingCaptureResponse:
    """
    从悬浮窗截图中提取待办事项

    Args:
        request: 包含 base64 编码截图的请求

    Returns:
        提取和创建的待办事项列表
    """
    try:
        total_start = time.time()
        logger.info("🚀 开始处理悬浮窗截图请求...")
        
        llm_client = get_llm_client()

        if not llm_client.is_available():
            return FloatingCaptureResponse(
                success=False,
                message="LLM 服务当前不可用，请检查配置",
                extracted_todos=[],
                created_todos=[],
                created_count=0,
            )

        # 获取已有待办列表用于去重
        step_start = time.time()
        existing_todos = todo_mgr.list_todos(limit=1000, status="active")
        existing_todos += todo_mgr.list_todos(limit=1000, status="draft")
        logger.info(f"⏱️ 获取已有待办列表: {time.time() - step_start:.3f}s (共 {len(existing_todos)} 条)")

        # 调用视觉模型提取待办
        step_start = time.time()
        extracted_todos = _call_vision_model_with_base64(
            llm_client=llm_client,
            image_base64=request.image_base64,
            existing_todos=existing_todos,
        )
        logger.info(f"⏱️ 视觉模型调用总耗时: {time.time() - step_start:.3f}s")

        if not extracted_todos:
            return FloatingCaptureResponse(
                success=True,
                message="截图中未检测到待办事项",
                extracted_todos=[],
                created_todos=[],
                created_count=0,
            )

        # 转换为 ExtractedTodo 列表
        extracted_todo_models = [
            ExtractedTodo(
                title=todo.get("title", ""),
                description=todo.get("description"),
                time_info=todo.get("time_info"),
                source_text=todo.get("source_text"),
                confidence=todo.get("confidence", 0.5),
            )
            for todo in extracted_todos
        ]

        # 如果需要创建待办
        created_todos: list[CreatedTodo] = []
        created_count = 0

        if request.create_todos:
            step_start = time.time()
            for todo_data in extracted_todos:
                try:
                    result = _create_draft_todo(todo_data)
                    if result:
                        created_count += 1
                        created_todos.append(
                            CreatedTodo(
                                id=result["id"],
                                name=result["name"],
                                scheduled_time=result.get("scheduled_time"),
                            )
                        )
                except Exception as e:
                    logger.error(f"创建待办失败: {e}", exc_info=True)
                    continue
            logger.info(f"⏱️ 创建待办到数据库: {time.time() - step_start:.3f}s")

        total_time = time.time() - total_start
        logger.info(f"✅ 悬浮窗截图处理完成，总耗时: {total_time:.3f}s (提取 {len(extracted_todos)} 个待办，创建 {created_count} 个)")
        
        return FloatingCaptureResponse(
            success=True,
            message=f"成功提取 {len(extracted_todos)} 个待办，创建 {created_count} 个",
            extracted_todos=extracted_todo_models,
            created_todos=created_todos,
            created_count=created_count,
        )

    except Exception as e:
        logger.error(f"处理悬浮窗截图失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"处理截图失败: {str(e)}") from e


def _call_vision_model_with_base64(
    llm_client: LLMClient,
    image_base64: str,
    existing_todos: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    使用 base64 图片直接调用视觉模型

    Args:
        llm_client: LLM 客户端
        image_base64: Base64 编码的图片
        existing_todos: 已有待办列表

    Returns:
        提取的待办列表
    """
    try:
        step_start = time.time()
        
        # 格式化已有待办列表为 JSON
        existing_todos_json = json.dumps(
            [
                {
                    "id": todo.get("id"),
                    "name": todo.get("name"),
                    "description": todo.get("description"),
                }
                for todo in existing_todos[:50]  # 限制数量
            ],
            ensure_ascii=False,
            indent=2,
        )

        # 从配置文件加载提示词
        system_prompt = get_prompt("auto_todo_detection", "system_assistant")
        user_prompt = get_prompt(
            "auto_todo_detection",
            "user_prompt",
            existing_todos_json=existing_todos_json,
        )

        # 构建完整的提示词
        full_prompt = f"{system_prompt}\n\n{user_prompt}"

        # 确保 base64 有正确的前缀
        if not image_base64.startswith("data:"):
            image_base64 = f"data:image/png;base64,{image_base64}"

        # 构建消息内容
        content = [
            {
                "type": "image_url",
                "image_url": {"url": image_base64},
            },
            {"type": "text", "text": full_prompt},
        ]

        messages = [{"role": "user", "content": content}]
        
        prep_time = time.time() - step_start
        logger.info(f"  ⏱️ 构建请求准备: {prep_time:.3f}s")

        # 获取视觉模型配置
        vision_model = settings.llm.vision_model or settings.llm.model
        
        # 计算图片大小
        image_size_kb = len(image_base64) * 3 / 4 / 1024  # Base64 解码后大小估算
        logger.info(f"📷 调用视觉模型 {vision_model} (图片大小: {image_size_kb:.1f}KB)")

        # 调用模型
        api_start = time.time()
        response = llm_client.client.chat.completions.create(
            model=vision_model,
            messages=messages,
            temperature=0.3,
            max_tokens=2000,
            timeout=60,
        )
        api_time = time.time() - api_start
        logger.info(f"  ⏱️ LLM API 调用耗时: {api_time:.3f}s")

        response_text = response.choices[0].message.content or ""
        if not response_text:
            logger.warning("视觉模型返回空响应")
            return []
        
        logger.info(f"  📝 LLM 响应长度: {len(response_text)} 字符")

        # 解析响应
        parse_start = time.time()
        result = _parse_llm_response(response_text)
        logger.info(f"  ⏱️ 解析响应: {time.time() - parse_start:.3f}s (提取到 {len(result)} 个待办)")
        
        return result

    except Exception as e:
        logger.error(f"调用视觉模型失败: {e}", exc_info=True)
        return []


def _parse_llm_response(response_text: str) -> list[dict[str, Any]]:
    """
    解析 LLM 响应

    Args:
        response_text: LLM 返回的文本

    Returns:
        待办列表
    """
    try:
        # 尝试提取 JSON
        json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
            result = json.loads(json_str)
            # 支持 new_todos 和 todos 两种格式
            if "new_todos" in result:
                return result["new_todos"]
            if "todos" in result:
                return result["todos"]

        # 如果没有找到 JSON，尝试直接解析
        result = json.loads(response_text)
        if "new_todos" in result:
            return result["new_todos"]
        if "todos" in result:
            return result["todos"]

        logger.warning("LLM 响应格式不正确")
        return []

    except json.JSONDecodeError as e:
        logger.error(f"解析 LLM 响应 JSON 失败: {e}")
        return []
    except Exception as e:
        logger.error(f"解析 LLM 响应失败: {e}", exc_info=True)
        return []


def _create_draft_todo(todo_data: dict[str, Any]) -> dict[str, Any] | None:
    """
    创建 draft 状态的待办

    Args:
        todo_data: 待办数据

    Returns:
        创建结果或 None
    """
    title = todo_data.get("title", "").strip()
    if not title:
        return None

    description = todo_data.get("description")
    if description:
        description = description.strip()

    source_text = todo_data.get("source_text", "")
    time_info = todo_data.get("time_info", {})
    confidence = todo_data.get("confidence")

    # 计算 scheduled_time
    scheduled_time = None
    if time_info:
        try:
            reference_time = datetime.now()
            scheduled_time = calculate_scheduled_time(time_info, reference_time)
        except Exception as e:
            logger.warning(f"计算 scheduled_time 失败: {e}")

    # 构建 user_notes
    user_notes_parts = ["来源: 悬浮窗截图"]
    if source_text:
        user_notes_parts.append(f"来源文本: {source_text}")
    if time_info and time_info.get("raw_text"):
        user_notes_parts.append(f"时间: {time_info.get('raw_text')}")
    if confidence is not None:
        user_notes_parts.append(f"置信度: {confidence:.0%}")
    user_notes = "\n".join(user_notes_parts)

    # 创建待办
    todo_id = todo_mgr.create_todo(
        name=title,
        description=description,
        user_notes=user_notes,
        deadline=scheduled_time,
        status="draft",
        priority="none",
        tags=["悬浮窗提取"],
    )

    if todo_id:
        logger.info(f"创建 draft 待办: {todo_id} - {title}")
        return {
            "id": todo_id,
            "name": title,
            "scheduled_time": scheduled_time.isoformat() if scheduled_time else None,
        }

    return None


@router.get("/health")
async def health_check():
    """健康检查"""
    llm_client = get_llm_client()
    return {
        "status": "ok",
        "llm_available": llm_client.is_available(),
    }
