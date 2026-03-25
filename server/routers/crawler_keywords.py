# ruff: noqa: PLC0415, PLR2004, TC002
"""Keyword extraction route for crawler prompts."""

from __future__ import annotations

import json
import re

from fastapi import APIRouter
from pydantic import BaseModel

from routers.crawler_common import logger

STOPWORDS = {
    "的",
    "了",
    "是",
    "在",
    "我",
    "有",
    "和",
    "就",
    "不",
    "人",
    "都",
    "一个",
    "上",
    "也",
    "很",
    "到",
    "说",
    "要",
    "去",
    "你",
    "会",
    "着",
    "没有",
    "看",
    "好",
    "自己",
    "这",
    "那",
    "什么",
    "想",
    "知道",
    "些",
    "吗",
    "吧",
    "呢",
    "啊",
    "哦",
    "嗯",
    "对",
    "把",
    "被",
    "让",
    "给",
    "从",
    "向",
    "跟",
    "比",
    "为",
    "因",
    "而",
    "但",
    "或",
    "与",
    "及",
    "等",
    "即",
    "如",
    "若",
    "虽",
    "既",
    "所",
    "者",
    "之",
    "其",
    "此",
    "彼",
    "信息",
    "内容",
    "资料",
    "方法",
    "技巧",
    "推荐",
    "教程",
    "攻略",
    "分享",
    "了解",
    "怎么",
    "如何",
    "关于",
    "有关",
    "感兴趣",
    "不感兴趣",
    "喜欢",
    "不喜欢",
}

KEYWORD_SYSTEM_PROMPT = """你是一个关键词提取专家。你的任务是从用户输入的自然语言中提取出两类关键词：
1. 用户感兴趣的关键词（interested）：用户想要搜索或了解的内容
2. 用户不感兴趣的关键词（excluded）：用户明确表示不想要、排除、不喜欢的内容

【重要规则】
1. 只提取有实际搜索价值的关键词，每类通常是1-3个
2. 优先提取：人名、地名、品牌名、产品名、事件名、专业术语、具体事物
3. 绝对不要提取这些无意义的泛词：信息、内容、资料、方法、技巧、推荐、教程、攻略、分享、了解、知道、什么、怎么、如何
4. 识别否定词和排除意图：不要、不想、排除、除了、不喜欢、不包括、别、不需要、不考虑
5. 输出JSON格式，必须严格按照格式输出，不要有任何其他内容

【示例】
用户输入："我想了解有关周杰伦的信息"
输出：{"interested": ["周杰伦"], "excluded": []}

用户输入："我想知道怎么学习Python，但不要太基础的入门教程"
输出：{"interested": ["Python"], "excluded": ["入门"]}

用户输入："推荐一些好看的韩剧，不要悲剧结尾的"
输出：{"interested": ["韩剧"], "excluded": ["悲剧"]}

用户输入："我想了解护肤品，特别是美白的，但不要含酒精的产品"
输出：{"interested": ["护肤品", "美白"], "excluded": ["酒精"]}

用户输入："北京有什么好吃的火锅店，不要太辣的，也不要连锁店"
输出：{"interested": ["北京", "火锅"], "excluded": ["辣", "连锁店"]}

用户输入："我想了解周杰伦和林俊杰，但不要汪苏泷"
输出：{"interested": ["周杰伦", "林俊杰"], "excluded": ["汪苏泷"]}"""


class ExtractKeywordsRequest(BaseModel):
    """Keyword extraction request payload."""

    text: str


class ExtractKeywordsResponse(BaseModel):
    """Keyword extraction response payload."""

    keywords: list[str]
    excluded_keywords: list[str] = []
    original_text: str


def _segment_keywords(text: str, *, limit: int) -> list[str]:
    import jieba

    words = list(jieba.cut(text))
    return [word for word in words if len(word) >= 1 and word not in STOPWORDS][:limit]


def _extract_from_llm_response(response_text: str) -> tuple[list[str], list[str]]:
    if "{" in response_text and "}" in response_text:
        json_start = response_text.find("{")
        json_end = response_text.rfind("}") + 1
        result = json.loads(response_text[json_start:json_end])
        keywords = result.get("interested", [])
        excluded = result.get("excluded", [])
    else:
        keywords = [
            part.strip() for part in response_text.replace("，", ",").split(",") if part.strip()
        ]
        excluded = []

    if isinstance(keywords, str):
        keywords = [keywords]
    if isinstance(excluded, str):
        excluded = [excluded]
    return keywords[:5], excluded[:5]


def _extract_with_regex(text: str) -> tuple[list[str], list[str]]:
    keywords: list[str] = []
    excluded_keywords: list[str] = []
    excluded_patterns = [
        r"对([^对，,不]+)不感兴趣",
        r"不喜欢([^，,。！]+)",
        r"不要([^，,。！]+)",
        r"排除([^，,。！]+)",
    ]
    interested_patterns = [
        r"对([^对，,]+)感兴趣",
        r"喜欢([^，,。！不]+)",
        r"想(?:了解|知道|看|搜)([^，,。！]+)",
        r"关于([^，,。！的]+)",
    ]

    for pattern in excluded_patterns:
        for match in re.findall(pattern, text):
            cleaned = match.strip().rstrip("的了吗呢啊哦")
            if cleaned and len(cleaned) <= 10:
                excluded_keywords.append(cleaned)

    for pattern in interested_patterns:
        for match in re.findall(pattern, text):
            cleaned = match.strip().rstrip("的了吗呢啊哦")
            if cleaned and len(cleaned) <= 10:
                keywords.append(cleaned)

    keywords = list(dict.fromkeys(keywords))[:5]
    excluded_keywords = list(dict.fromkeys(excluded_keywords))[:5]
    if not keywords:
        keywords = _segment_keywords(text, limit=3)
    return keywords, excluded_keywords


def register_routes(router: APIRouter) -> None:
    """Register keyword extraction routes."""

    @router.post("/extract-keywords", response_model=ExtractKeywordsResponse)
    async def extract_keywords_from_text(
        request: ExtractKeywordsRequest,
    ) -> ExtractKeywordsResponse:
        """Extract interested and excluded keywords from natural language."""
        from llm.llm_client import LLMClient

        text = request.text.strip()
        if not text:
            return ExtractKeywordsResponse(keywords=[], excluded_keywords=[], original_text="")

        try:
            llm_client = LLMClient()
            if not llm_client.is_available():
                logger.warning("LLM客户端不可用，使用简单分词提取关键词")
                return ExtractKeywordsResponse(
                    keywords=_segment_keywords(text, limit=5),
                    excluded_keywords=[],
                    original_text=text,
                )

            messages = [
                {"role": "system", "content": KEYWORD_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"请从以下内容中提取感兴趣和不感兴趣的关键词：\n{text}",
                },
            ]
            response = llm_client.chat(messages, temperature=0.3, max_tokens=200)
            try:
                keywords, excluded_keywords = _extract_from_llm_response(response.strip())
            except json.JSONDecodeError:
                keywords = [
                    part.strip() for part in response.replace("，", ",").split(",") if part.strip()
                ]
                excluded_keywords = []

            logger.info(
                "从文本提取关键词: %s... -> 感兴趣: %s, 不感兴趣: %s",
                text[:50],
                keywords,
                excluded_keywords,
            )
            return ExtractKeywordsResponse(
                keywords=keywords[:5],
                excluded_keywords=excluded_keywords[:5],
                original_text=text,
            )
        except Exception as exc:
            logger.warning("LLM提取关键词失败: %s，使用备用正则方案", exc)
            keywords, excluded_keywords = _extract_with_regex(text)
            logger.info(
                "备用方案提取关键词: %s... -> 感兴趣: %s, 不感兴趣: %s",
                text[:50],
                keywords,
                excluded_keywords,
            )
            return ExtractKeywordsResponse(
                keywords=keywords,
                excluded_keywords=excluded_keywords,
                original_text=text,
            )
