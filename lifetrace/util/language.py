"""Language utility functions: parse request language and generate language instructions"""

from fastapi import Request

# Language instruction mapping - add new languages here
LANGUAGE_INSTRUCTIONS: dict[str, str] = {
    "zh": "\n\n**语言要求：请始终使用中文回答。**",
    "en": "\n\n**Language requirement: Always respond in English.**",
    # Future languages can be added here:
    # "ja": "\n\n**言語要件：常に日本語で回答してください。**",
    # "ko": "\n\n**언어 요구 사항: 항상 한국어로 답변하세요.**",
    # "ru": "\n\n**Требование к языку: Всегда отвечайте на русском языке.**",
    # "fr": "\n\n**Exigence linguistique: Répondez toujours en français.**",
}

# Supported locales list (derived from LANGUAGE_INSTRUCTIONS keys)
SUPPORTED_LOCALES: list[str] = list(LANGUAGE_INSTRUCTIONS.keys())

# Default locale when no match is found
DEFAULT_LOCALE: str = "en"


def get_request_language(request: Request) -> str:
    """Parse language from request headers

    Args:
        request: FastAPI request object

    Returns:
        Language code (e.g., "zh", "en")
    """
    accept_lang = request.headers.get("Accept-Language", DEFAULT_LOCALE).lower()

    # Match against supported locales by prefix
    for locale in SUPPORTED_LOCALES:
        if accept_lang.startswith(locale):
            return locale

    return DEFAULT_LOCALE


def get_language_instruction(lang: str) -> str:
    """Generate language instruction to append to system prompt

    Args:
        lang: Language code (e.g., "zh", "en")

    Returns:
        Language instruction string
    """
    return LANGUAGE_INSTRUCTIONS.get(lang, LANGUAGE_INSTRUCTIONS[DEFAULT_LOCALE])
