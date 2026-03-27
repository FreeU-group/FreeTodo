"""
LLM客户端模块
提供与OpenAI兼容API的交互
"""

from typing import TYPE_CHECKING, Any, cast

from openai import OpenAI

if TYPE_CHECKING:
    from openai.types.chat import ChatCompletionMessageParam
else:
    ChatCompletionMessageParam = Any

from util.logging_config import get_logger
from util.settings import settings
from util.token_usage_logger import log_token_usage, setup_token_logger

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
        self._configured = False
        try:
            self.api_key = settings.llm.api_key
            self.base_url = settings.llm.base_url
            self.model = settings.llm.model
            self.small_model = settings.get("llm.small_model", "qwen-turbo")

            invalid_values = [
                "xxx",
                "YOUR_API_KEY_HERE",
                "YOUR_BASE_URL_HERE",
                "YOUR_LLM_KEY_HERE",
            ]
            key_ok = bool(self.api_key) and self.api_key not in invalid_values
            base_ok = bool(self.base_url) and self.base_url not in invalid_values
            if not key_ok:
                logger.warning("LLM Key未配置或为默认占位符，LLM功能不可用")
            if not base_ok:
                logger.warning("Base URL未配置或为默认占位符，LLM功能不可用")
            self._configured = key_ok and base_ok
        except Exception as e:
            logger.error(f"无法从配置文件读取LLM配置: {e}")
            self.api_key = "YOUR_LLM_KEY_HERE"
            self.base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
            self.model = "qwen3-max"
            self.small_model = "qwen-turbo"
            logger.warning("使用硬编码默认值初始化LLM客户端")
            self._configured = False

        if not self._configured:
            self.client = None
            logger.info("LLM配置未完成，LLM客户端保持不可用状态")
            return

        try:
            if OpenAI is None:
                raise ImportError("openai 依赖未安装")
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
        return bool(getattr(self, "_configured", False)) and self.client is not None

    def _get_client(self) -> OpenAI:
        if not self.is_available() or self.client is None:
            raise RuntimeError("LLM客户端不可用，无法进行请求")
        return self.client

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

    def chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        model: str | None = None,
        max_tokens: int | None = None,
        *,
        log_usage: bool = True,
        log_meta: dict[str, Any] | None = None,
    ) -> str:
        """通用非流式聊天方法，返回完整文本结果。"""
        if not self.is_available():
            raise RuntimeError("LLM客户端不可用，无法进行文本聊天")

        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=model or self.model,
                messages=cast("list[ChatCompletionMessageParam]", messages),
                temperature=temperature,
                max_tokens=max_tokens,
            )
            content = response.choices[0].message.content or ""

            if log_usage:
                usage = getattr(response, "usage", None)
                if usage:
                    meta = dict(log_meta or {})
                    endpoint = meta.pop("endpoint", "llm_chat")
                    feature_type = meta.pop("feature_type", "") or endpoint
                    user_query = meta.pop("user_query", "")
                    response_type = meta.pop("response_type", "chat")
                    meta["response_length"] = len(content)
                    log_token_usage(
                        model=model or self.model,
                        input_tokens=usage.prompt_tokens,
                        output_tokens=usage.completion_tokens,
                        endpoint=endpoint,
                        user_query=user_query,
                        response_type=response_type,
                        feature_type=feature_type,
                        additional_info=meta,
                    )

            return content
        except Exception as e:
            logger.error(f"文本聊天失败: {e}")
            raise

    def stream_chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        model: str | None = None,
        *,
        log_usage: bool = True,
        log_meta: dict[str, Any] | None = None,
    ):
        """通用流式聊天方法"""
        if not self.is_available():
            raise RuntimeError("LLM客户端不可用，无法进行流式生成")
        total_chars = 0
        usage_info = None
        try:
            # 关闭 enable_thinking 以提升性能（方案 B）
            # 如果未来需要思考模式，可以通过参数控制
            client = self._get_client()
            stream = client.chat.completions.create(
                model=model or self.model,
                messages=cast("list[ChatCompletionMessageParam]", messages),
                temperature=temperature,
                # extra_body={"enable_thinking": True},  # 已移除以提升性能
                stream=True,
                stream_options={"include_usage": True},
            )
            for chunk in stream:
                chunk_any = cast("Any", chunk)
                usage = getattr(chunk_any, "usage", None)
                if usage:
                    usage_info = usage

                choices = getattr(chunk_any, "choices", None)
                if choices:
                    delta = getattr(choices[0], "delta", None)
                    text = getattr(delta, "content", None)
                    if text:
                        total_chars += len(text)
                        yield text
        except Exception as e:
            logger.error(f"流式聊天失败: {e}")
            raise
        finally:
            if log_usage and usage_info:
                meta = dict(log_meta or {})
                endpoint = meta.pop("endpoint", "llm_stream_chat")
                feature_type = meta.pop("feature_type", "") or endpoint
                user_query = meta.pop("user_query", "")
                response_type = meta.pop("response_type", "stream")
                meta["response_length"] = total_chars
                log_token_usage(
                    model=model or self.model,
                    input_tokens=usage_info.prompt_tokens,
                    output_tokens=usage_info.completion_tokens,
                    endpoint=endpoint,
                    user_query=user_query,
                    response_type=response_type,
                    feature_type=feature_type,
                    additional_info=meta,
                )

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
