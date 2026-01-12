"""响应生成相关逻辑处理模块"""

from collections.abc import Generator

from lifetrace.llm.llm_client import LLMClient
from lifetrace.util.logging_config import get_logger

logger = get_logger()


def generate_final_response(
    llm_client: LLMClient,
    user_query: str,
    messages: list[dict],
    accumulated_context: list[str],
) -> Generator[str]:
    """生成最终回答"""
    final_messages = messages.copy()

    # 检查是否使用了 web_search 工具
    used_web_search = any(
        msg.get("content", "").startswith("[工具调用: web_search]") for msg in messages
    )

    if accumulated_context:
        context_text = "\n\n".join(accumulated_context)
        logger.info(
            f"[Agent] 生成最终回答，工具结果长度: {len(context_text)} 字符",
        )

        base_instruction = (
            f"用户问题：{user_query}\n\n"
            f"工具执行结果：\n{context_text}\n\n"
            "请严格基于上述工具执行结果回答用户的问题。"
            "如果工具结果中包含相关信息，必须使用这些信息。"
            "不要使用过时的知识或猜测，只基于工具提供的搜索结果。"
            "当工具结果与你的训练数据冲突时，以工具结果为准（工具结果代表最新的实时信息）。"
        )

        # 如果使用了 web_search，添加 Sources 格式要求
        if used_web_search:
            base_instruction += get_web_search_format_instructions()

        final_messages.append({"role": "user", "content": base_instruction})
    else:
        # 没有工具结果，直接基于原始查询回答
        final_messages.append(
            {
                "role": "user",
                "content": (
                    f"{user_query}\n\n"
                    "**重要提示：**\n"
                    "本次回答没有使用任何工具。请直接基于你的知识回答，"
                    "不要提及'正在搜索'、'使用工具'、'工具执行'、'web_search'等词汇，"
                    "不要生成工具调用的描述，不要假装使用了工具。"
                    "如果问题需要最新信息但你无法提供，请诚实说明。"
                ),
            }
        )

    # 流式生成回答
    try:
        yield from llm_client.stream_chat(
            messages=final_messages,
            temperature=0.7,
        )
    except Exception as e:
        logger.error(f"[Agent] 生成最终回答失败: {e}")
        yield f"生成回答时出现错误: {str(e)}"


def get_web_search_format_instructions() -> str:
    """获取 web_search 工具的格式要求说明"""
    return (
        "\n\n**重要格式要求（必须严格遵守）：**"
        "\n1. 在回答中引用信息时，必须使用引用标记格式：[[1]]、[[2]] 等，数字对应搜索结果编号"
        '\n2. 在回答的末尾，必须添加一个 "Sources:" 段落，列出所有引用的来源'
        "\n3. Sources 段落的格式必须严格按照以下格式（与工具执行结果中的格式一致）："
        "\n   Sources:"
        "\n   1. 标题 (URL)"
        "\n   2. 标题 (URL)"
        "\n   ..."
        "\n4. 工具执行结果中已经包含了 Sources 列表，请直接使用这些来源信息，不要修改格式"
        '\n5. 确保 Sources 段落与回答正文之间有两个空行（即 "\\n\\nSources:"）'
    )
