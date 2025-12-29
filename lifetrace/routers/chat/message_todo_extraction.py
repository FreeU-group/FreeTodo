"""从消息中提取待办的路由"""

import json
import re

from lifetrace.llm.llm_client import LLMClient
from lifetrace.routers.chat.base import router
from lifetrace.schemas.message_todo_extraction import (
    ExtractedMessageTodo,
    MessageTodoExtractionRequest,
    MessageTodoExtractionResponse,
)
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt

logger = get_logger()

llm_client = LLMClient()


@router.post("/extract-todos-from-messages", response_model=MessageTodoExtractionResponse)
async def extract_todos_from_messages(
    request: MessageTodoExtractionRequest,
) -> MessageTodoExtractionResponse:
    """
    从消息中提取待办事项

    Args:
        request: 包含消息列表、父待办ID和待办上下文的请求

    Returns:
        提取的待办列表

    Raises:
        HTTPException: 当提取失败时
    """
    try:
        if not llm_client.is_available():
            return MessageTodoExtractionResponse(
                todos=[],
                error_message="LLM服务当前不可用，请稍后重试",
            )

        # 构建消息文本
        messages_text = "\n".join(
            [f"{msg.get('role', 'unknown')}: {msg.get('content', '')}" for msg in request.messages],
        )

        # 构建待办上下文部分
        todo_context_section = ""
        if request.todo_context:
            todo_context_section = f"\n**关联待办上下文：**\n{request.todo_context}\n"

        # 获取提示词
        system_prompt = get_prompt("chat_frontend", "message_todo_extraction_system_prompt_zh")
        user_prompt_template = get_prompt("chat_frontend", "message_todo_extraction_user_prompt_zh")

        # 填充用户提示词
        user_prompt = user_prompt_template.format(
            messages_text=messages_text,
            todo_context_section=todo_context_section,
        )

        # 调用 LLM
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response = llm_client.client.chat.completions.create(
            model=llm_client.model,
            messages=messages,
            temperature=0.3,
        )

        response_text = response.choices[0].message.content or ""

        # 解析响应
        todos = _parse_llm_response(response_text)

        return MessageTodoExtractionResponse(todos=todos, error_message=None)

    except Exception as e:
        logger.error(f"从消息中提取待办失败: {e}", exc_info=True)
        return MessageTodoExtractionResponse(
            todos=[],
            error_message=f"提取待办失败: {str(e)}",
        )


def _parse_llm_response(response_text: str) -> list[ExtractedMessageTodo]:
    """
    解析LLM响应为待办事项列表

    Args:
        response_text: LLM返回的文本

    Returns:
        待办事项列表
    """
    try:
        # 尝试提取JSON
        json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
            result = json.loads(json_str)

            if "todos" in result and isinstance(result["todos"], list):
                todos = []
                for todo_dict in result["todos"]:
                    if "name" in todo_dict:
                        todos.append(
                            ExtractedMessageTodo(
                                name=todo_dict["name"],
                                description=todo_dict.get("description"),
                                tags=todo_dict.get("tags", []),
                            ),
                        )
                return todos
        else:
            logger.warning("LLM响应中未找到JSON格式")
            return []

    except json.JSONDecodeError as e:
        logger.error(f"解析LLM响应JSON失败: {e}\n原始响应: {response_text[:200]}")
    except Exception as e:
        logger.error(f"解析待办事项失败: {e}")

    return []
