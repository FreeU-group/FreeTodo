"""
LLM客户端模块
提供与OpenAI兼容API的交互
"""

from typing import Any

from openai import OpenAI

from lifetrace.util.logging_config import get_logger
from lifetrace.util.settings import settings
from lifetrace.util.token_usage_logger import setup_token_logger

from .llm_client_intent import classify_intent_with_llm, rule_based_intent_classification
from .llm_client_query import (
    build_context_text,
    fallback_summary,
    generate_summary_with_llm,
    parse_query_with_llm,
    rule_based_parse,
)
from .llm_client_vision import vision_chat

logger = get_logger()


class LLMClient:
    """LLM客户端，用于与OpenAI兼容的API进行交互（单例模式）"""

    _instance = None
    _initialized = False

    def __new__(cls):
        """实现单例模式"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        """初始化LLM客户端"""
        if not LLMClient._initialized:
            self._initialize_client()
            setup_token_logger()
            LLMClient._initialized = True

    def _initialize_client(self):
        """内部方法：初始化或重新初始化客户端"""
        try:
            self.api_key = settings.llm.api_key
            self.base_url = settings.llm.base_url
            self.model = settings.llm.model

            invalid_values = [
                "xxx",
                "YOUR_API_KEY_HERE",
                "YOUR_BASE_URL_HERE",
                "YOUR_LLM_KEY_HERE",
            ]
            if not self.api_key or self.api_key in invalid_values:
                logger.warning("LLM Key未配置或为默认占位符，LLM功能可能不可用")
            if not self.base_url or self.base_url in invalid_values:
                logger.warning("Base URL未配置或为默认占位符，LLM功能可能不可用")
        except Exception as e:
            logger.error(f"无法从配置文件读取LLM配置: {e}")
            self.api_key = "YOUR_LLM_KEY_HERE"
            self.base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
            self.model = "qwen3-max"
            logger.warning("使用硬编码默认值初始化LLM客户端")

        try:
            self.client = OpenAI(base_url=self.base_url, api_key=self.api_key)
            logger.info(f"LLM客户端初始化成功，使用模型: {self.model}")
            logger.info(f"API Base URL: {self.base_url}")
        except Exception as e:
            logger.error(f"LLM客户端初始化失败: {e}")
            self.client = None

    def reinitialize(self):
        """重新初始化LLM客户端"""
        logger.info("正在重新初始化LLM客户端...")
        old_api_key = self.api_key if hasattr(self, "api_key") else None
        old_model = self.model if hasattr(self, "model") else None

        self._initialize_client()

        if old_api_key != self.api_key:
            logger.info(
                f"API Key已更新: {old_api_key[:10] if old_api_key else 'None'}... -> {self.api_key[:10]}..."
            )
        if old_model != self.model:
            logger.info(f"模型已更新: {old_model} -> {self.model}")

        return self.is_available()

    def is_available(self) -> bool:
        """检查LLM客户端是否可用"""
        return self.client is not None

    def classify_intent(self, user_query: str) -> dict[str, Any]:
        """分类用户意图"""
        if not self.is_available():
            logger.warning("LLM客户端不可用，使用规则分类")
            return rule_based_intent_classification(user_query)

        return classify_intent_with_llm(self.client, self.model, user_query)

    def parse_query(self, user_query: str) -> dict[str, Any]:
        """解析用户查询"""
        if not self.is_available():
            logger.warning("LLM客户端不可用，使用规则解析")
            return rule_based_parse(user_query)

        return parse_query_with_llm(self.client, self.model, user_query)

    def generate_summary(self, query: str, context_data: list[dict[str, Any]]) -> str:
        """生成摘要"""
        if not self.is_available():
            logger.warning("LLM客户端不可用，使用规则总结")
            return fallback_summary(query, context_data)

        return generate_summary_with_llm(self.client, self.model, query, context_data)

    def stream_chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        model: str | None = None,
    ):
        """通用流式聊天方法"""
        if not self.is_available():
            raise RuntimeError("LLM客户端不可用，无法进行流式生成")
        try:
            stream = self.client.chat.completions.create(
                model=model or self.model,
                messages=messages,
                temperature=temperature,
                extra_body={"enable_thinking": True},
                stream=True,
            )
            for chunk in stream:
                try:
                    delta = chunk.choices[0].delta
                    text = getattr(delta, "content", None)
                    if text:
                        yield text
                except Exception:
                    continue
        except Exception as e:
            logger.error(f"流式聊天失败: {e}")
            raise

    def vision_chat(
        self,
        screenshot_ids: list[int],
        prompt: str,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> dict[str, Any]:
        """视觉多模态聊天"""
        if not self.is_available():
            raise RuntimeError("LLM客户端不可用，无法进行视觉多模态分析")

        return vision_chat(
            self.client,
            self.model,
            screenshot_ids,
            prompt,
            model,
            temperature,
            max_tokens,
        )

    # 保持向后兼容的方法
    def _rule_based_intent_classification(self, user_query: str) -> dict[str, Any]:
        """基于规则的意图分类（向后兼容）"""
        return rule_based_intent_classification(user_query)

    def _rule_based_parse(self, user_query: str) -> dict[str, Any]:
        """基于规则的查询解析（向后兼容）"""
        return rule_based_parse(user_query)

    def _build_context_text(self, context_data: list[dict[str, Any]]) -> str:
        """构建上下文文本（向后兼容）"""
        return build_context_text(context_data)

    def _fallback_summary(self, query: str, context_data: list[dict[str, Any]]) -> str:
        """备用总结（向后兼容）"""
        return fallback_summary(query, context_data)
