"""Chat title generation helpers."""

from llm.llm_client import LLMClient
from util.logging_config import get_logger
from util.prompt_loader import get_prompt

logger = get_logger()

CHAT_TITLE_MAX_LENGTH = 50
CHAT_TITLE_CONTEXT_MAX_LENGTH = 2000

DEFAULT_TITLE_PROMPT = """你是一个对话标题生成器。
请基于用户输入和上下文生成一个简洁、准确的标题。
要求：
- 标题应简洁有区分度
- 不超过20个字
- 只返回标题本身，不要附加说明或标点
"""


def _trim_text(value: str | None, max_length: int) -> str:
    if not value:
        return ""
    trimmed = value.strip()
    if len(trimmed) <= max_length:
        return trimmed
    return trimmed[:max_length].rstrip() + "..."


def _build_title_source(
    *,
    user_input: str,
    context: str | None,
    system_prompt: str | None,
) -> str:
    parts: list[str] = []
    if system_prompt:
        parts.append(f"系统提示:\n{_trim_text(system_prompt, 600)}")
    if context:
        parts.append(f"上下文:\n{_trim_text(context, 1200)}")
    if user_input:
        parts.append(f"用户输入:\n{_trim_text(user_input, 600)}")

    combined = "\n\n".join(parts).strip()
    return _trim_text(combined, CHAT_TITLE_CONTEXT_MAX_LENGTH)


def _sanitize_title(raw_title: str) -> str:
    title = raw_title.strip()
    if title.startswith("```"):
        title = title.strip("`").strip()
    if title.startswith(('"', "'")) and title.endswith(('"', "'")):
        title = title[1:-1].strip()
    if "\n" in title:
        title = title.splitlines()[0].strip()
    return title


def _fallback_title(user_input: str) -> str:
    if not user_input:
        return "新的对话"
    clean = user_input.strip()
    if len(clean) > CHAT_TITLE_MAX_LENGTH:
        return clean[:CHAT_TITLE_MAX_LENGTH].rstrip() + "..."
    return clean


def generate_chat_title(
    *,
    llm_client: LLMClient,
    user_input: str,
    context: str | None = None,
    system_prompt: str | None = None,
) -> str:
    """Generate a chat title using the LLM with a safe fallback."""
    fallback = _fallback_title(user_input)
    if not llm_client.is_available():
        return fallback

    prompt = get_prompt("llm_client", "chat_title_generation") or DEFAULT_TITLE_PROMPT
    title_source = _build_title_source(
        user_input=user_input,
        context=context,
        system_prompt=system_prompt,
    )
    if not title_source:
        return fallback

    try:
        title = llm_client.chat(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": title_source},
            ],
            temperature=0.2,
            max_tokens=60,
        )
    except Exception as exc:  # pragma: no cover - defensive fallback
        logger.warning(f"聊天标题生成失败，使用回退标题: {exc}")
        return fallback

    cleaned = _sanitize_title(title)
    if not cleaned:
        return fallback
    if len(cleaned) > CHAT_TITLE_MAX_LENGTH:
        cleaned = cleaned[:CHAT_TITLE_MAX_LENGTH].rstrip()
    return cleaned
