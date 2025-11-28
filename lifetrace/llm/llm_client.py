import json
from datetime import datetime
from typing import Any

from openai import OpenAI

from lifetrace.util.config import config
from lifetrace.util.logging_config import get_logger
from lifetrace.util.prompt_loader import get_prompt
from lifetrace.util.token_usage_logger import log_token_usage, setup_token_logger

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
        """
        初始化LLM客户端，从配置文件读取所有配置
        """
        # 只初始化一次
        if not LLMClient._initialized:
            self._initialize_client()
            # 初始化token使用量记录器，传入config对象以获取价格配置
            setup_token_logger(config)
            LLMClient._initialized = True

    def _initialize_client(self):
        """内部方法：初始化或重新初始化客户端"""
        try:
            # 从配置文件读取配置
            self.api_key = config.get("llm.api_key")
            self.base_url = config.get("llm.base_url")
            self.model = config.get("llm.model")

            # 检查关键配置是否为空或默认占位符
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
            # 使用默认值但记录警告
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
        """重新初始化LLM客户端（从配置文件重新读取配置）"""
        logger.info("正在重新初始化LLM客户端...")
        old_api_key = self.api_key if hasattr(self, "api_key") else None
        old_model = self.model if hasattr(self, "model") else None

        self._initialize_client()

        # 记录变更信息
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
        """
        分类用户意图，判断是否需要数据库查询

        Args:
            user_query: 用户的自然语言输入

        Returns:
            包含意图分类结果的字典
        """
        if not self.is_available():
            logger.warning("LLM客户端不可用，使用规则分类")
            return self._rule_based_intent_classification(user_query)

        try:
            # 注意：使用普通字符串，避免 f-string 解析 JSON 花括号导致的格式化错误
            prompt = """
请分析以下用户输入，判断用户的意图类型。

用户输入："<USER_QUERY>"

请判断这个输入属于以下哪种类型：
1. "database_query" - 需要查询数据库的请求（如：搜索截图、统计使用情况、查找特定应用等）
2. "general_chat" - 一般对话（如：问候、闲聊、询问功能等）
3. "system_help" - 系统帮助请求（如：如何使用、功能说明等）

请以JSON格式返回结果：
{
    "intent_type": "database_query/general_chat/system_help",
    "needs_database": true/false
}

只返回JSON，不要返回其他任何信息，不要使用markdown代码块标记。
"""
            # 将用户输入放入单独的 user 消息，避免在包含花括号的模板里使用 f-string
            user_content = prompt.replace("<USER_QUERY>", user_query)

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": get_prompt("llm_client", "intent_classification"),
                    },
                    {"role": "user", "content": user_content},
                ],
                temperature=0.1,
                max_tokens=200,
            )

            # 记录token使用量
            if hasattr(response, "usage") and response.usage:
                log_token_usage(
                    model=self.model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint="classify_intent",
                    user_query=user_query,
                    response_type="intent_classification",
                    feature_type="event_assistant",
                )

            result_text = response.choices[0].message.content.strip()

            # 记录LLM响应到日志
            logger.info("=== LLM意图分类响应 ===")
            logger.info(f"用户输入: {user_query}")
            logger.info(f"LLM回复: {result_text}")
            logger.info("=== 响应结束 ===")

            logger.info(f"LLM意图分类 - 用户输入: {user_query}")
            logger.info(f"LLM意图分类 - 原始响应: {result_text}")

            # 尝试解析JSON
            try:
                # 清理可能的markdown代码块标记
                clean_text = result_text.strip()
                if clean_text.startswith("```json"):
                    clean_text = clean_text[7:]
                if clean_text.endswith("```"):
                    clean_text = clean_text[:-3]
                clean_text = clean_text.strip()

                result = json.loads(clean_text)
                logger.info(
                    f"意图分类结果: {result['intent_type']}, 需要数据库: {result['needs_database']}"
                )
                return result
            except json.JSONDecodeError:
                logger.warning(f"LLM返回的不是有效JSON: {result_text}")
                return self._rule_based_intent_classification(user_query)

        except Exception as e:
            logger.error(f"LLM意图分类失败: {e}")
            return self._rule_based_intent_classification(user_query)

    def parse_query(self, user_query: str) -> dict[str, Any]:
        """
        使用LLM解析用户查询，提取时间范围、应用名称和关键词

        Args:
            user_query: 用户的自然语言查询

        Returns:
            解析后的查询条件字典
        """
        if not self.is_available():
            logger.warning("LLM客户端不可用，使用规则解析")
            return self._rule_based_parse(user_query)

        # 获取当前时间作为参考
        current_time = datetime.now()
        current_date_str = current_time.strftime("%Y-%m-%d %H:%M:%S")

        # 从配置文件加载提示词
        system_prompt = get_prompt("llm_client", "query_parsing")

        try:
            # 将当前时间与用户查询一并放入 user 消息，避免在包含花括号的模板里插值
            user_message = f"当前时间是：{current_date_str}\n请解析这个查询：{user_query}"
            response = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                model=self.model,
                temperature=0.1,
            )

            # 记录token使用量
            if hasattr(response, "usage") and response.usage:
                log_token_usage(
                    model=self.model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint="parse_query",
                    user_query=user_query,
                    response_type="query_parsing",
                    feature_type="event_assistant",
                )

            result_text = response.choices[0].message.content.strip()

            # 记录LLM响应到日志
            logger.info("=== LLM查询解析响应 ===")
            logger.info(f"用户查询: {user_query}")
            logger.info(f"LLM回复: {result_text}")
            logger.info("=== 响应结束 ===")

            logger.info(f"LLM查询解析 - 用户查询: {user_query}")
            logger.info(f"LLM查询解析 - 原始响应: {result_text}")

            # 尝试解析JSON
            try:
                clean_text = result_text.strip()
                if clean_text.startswith("```json"):
                    clean_text = clean_text[7:]
                if clean_text.endswith("```"):
                    clean_text = clean_text[:-3]
                clean_text = clean_text.strip()
                result = json.loads(clean_text)
                return result
            except json.JSONDecodeError:
                logger.warning(f"LLM返回的不是有效JSON: {result_text}")
                return self._rule_based_parse(user_query)

        except Exception as e:
            logger.error(f"LLM解析失败: {e}")
            return self._rule_based_parse(user_query)

    def _build_context_text(self, context_data: list[dict[str, Any]]) -> str:
        """构建上下文文本用于摘要生成"""
        MAX_OCR_TEXT_LENGTH = 200
        MAX_DISPLAYED_RECORDS = 10

        if not context_data:
            return "没有找到相关的历史记录数据。"

        context_parts = [f"找到 {len(context_data)} 条相关记录:"]

        for i, record in enumerate(context_data[:MAX_DISPLAYED_RECORDS]):
            timestamp = record.get("timestamp", "未知时间")
            if timestamp and timestamp != "未知时间":
                try:
                    from datetime import datetime

                    dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                    timestamp = dt.strftime("%Y-%m-%d %H:%M")
                except:  # noqa: E722
                    pass

            app_name = record.get("app_name", "未知应用")
            ocr_text = record.get("ocr_text", "无文本内容")
            window_title = record.get("window_title", "")
            screenshot_id = record.get("screenshot_id") or record.get("id")

            if len(ocr_text) > MAX_OCR_TEXT_LENGTH:
                ocr_text = ocr_text[:MAX_OCR_TEXT_LENGTH] + "..."

            record_text = f"{i + 1}. [{app_name}] {timestamp}"
            if window_title:
                record_text += f" - {window_title}"
            if screenshot_id:
                record_text += f" [截图ID: {screenshot_id}]"
            record_text += f"\n   内容: {ocr_text}"

            context_parts.append(record_text)

        if len(context_data) > MAX_DISPLAYED_RECORDS:
            context_parts.append(f"... 还有 {len(context_data) - MAX_DISPLAYED_RECORDS} 条记录")

        return "\n\n".join(context_parts)

    def generate_summary(self, query: str, context_data: list[dict[str, Any]]) -> str:
        """生成基于查询和上下文数据的总结"""
        if not self.is_available():
            logger.warning("LLM客户端不可用，使用规则总结")
            return self._fallback_summary(query, context_data)

        system_prompt = get_prompt("llm_client", "summary_generation")
        context_text = self._build_context_text(context_data)

        user_prompt = f"""
用户查询：{query}

相关历史数据：
{context_text}

请基于以上数据回答用户的查询。
"""

        try:
            response = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                model=self.model,
                temperature=0.3,
                extra_body={"enable_thinking": True},
            )

            if hasattr(response, "usage") and response.usage:
                log_token_usage(
                    model=self.model,
                    input_tokens=response.usage.prompt_tokens,
                    output_tokens=response.usage.completion_tokens,
                    endpoint="generate_summary",
                    user_query=query,
                    response_type="summary_generation",
                    feature_type="event_assistant",
                    additional_info={"context_records": len(context_data)},
                )

            result = response.choices[0].message.content.strip()

            logger.info("=== LLM总结生成响应 ===")
            logger.info(f"用户查询: {query}")
            logger.info(f"LLM回复: {result}")
            logger.info("=== 响应结束 ===")

            logger.info(f"LLM总结生成 - 用户查询: {query}")
            logger.info(f"LLM总结生成 - 生成结果: {result}")
            logger.info(f"LLM生成总结成功，长度: {len(result)}")
            return result

        except Exception as e:
            logger.error(f"LLM总结生成失败: {e}")
            return self._fallback_summary(query, context_data)

    def stream_chat(
        self,
        messages: list[dict[str, str]],
        temperature: float = 0.7,
        model: str | None = None,
    ):
        """
        通用流式聊天方法：对OpenAI兼容接口使用stream=True逐token返回。
        若客户端不可用则抛出异常，由上层决定回退策略。
        """
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
                    # 某些chunk不包含文本（如role、tool_calls等），可忽略
                    continue
        except Exception as e:
            logger.error(f"流式聊天失败: {e}")
            raise

    def _rule_based_intent_classification(self, user_query: str) -> dict[str, Any]:
        """基于规则的意图分类（备用方案）"""
        query_lower = user_query.lower()

        # 数据库查询关键词
        database_keywords = [
            "搜索",
            "查找",
            "统计",
            "显示",
            "截图",
            "应用",
            "使用情况",
            "时间",
            "最近",
            "今天",
            "昨天",
            "本周",
            "上周",
            "本月",
            "上月",
            "search",
            "find",
            "show",
            "statistics",
            "screenshot",
            "app",
            "usage",
        ]

        # 一般对话关键词
        chat_keywords = [
            "你好",
            "谢谢",
            "再见",
            "怎么样",
            "如何",
            "为什么",
            "什么是",
            "hello",
            "hi",
            "thanks",
            "bye",
            "how",
            "what",
            "why",
        ]

        # 系统帮助关键词
        help_keywords = [
            "帮助",
            "功能",
            "使用方法",
            "教程",
            "说明",
            "介绍",
            "help",
            "function",
            "tutorial",
            "guide",
            "instruction",
        ]

        # 计算匹配分数
        database_score = sum(1 for keyword in database_keywords if keyword in query_lower)
        chat_score = sum(1 for keyword in chat_keywords if keyword in query_lower)
        help_score = sum(1 for keyword in help_keywords if keyword in query_lower)

        # 判断意图类型
        if database_score > 0:
            intent_type = "database_query"
            needs_database = True
        elif help_score > 0:
            intent_type = "system_help"
            needs_database = False
        elif chat_score > 0:
            intent_type = "general_chat"
            needs_database = False
        else:
            # 默认认为是数据库查询（保守策略）
            intent_type = "database_query"
            needs_database = True

        return {"intent_type": intent_type, "needs_database": needs_database}

    def _rule_based_parse(self, user_query: str) -> dict[str, Any]:
        """基于规则的查询解析（备用方案）"""
        query_lower = user_query.lower()  # noqa: F841

        # 简单的关键词规则识别 - 移除硬编码关键词列表
        keywords = []
        time_keywords = ["今天", "昨天", "本周", "上周", "本月", "上月", "最近"]
        app_keywords = ["微信", "qq", "浏览器", "chrome", "edge", "word", "excel"]

        # 只有在明确搜索特定内容时才提取关键词
        # 检查是否包含搜索意图的词汇
        search_indicators = ["搜索", "查找", "包含", "关于", "找到"]
        has_search_intent = any(indicator in user_query for indicator in search_indicators)

        if has_search_intent:
            # 简单提取可能的搜索关键词（排除功能描述词）
            function_words = ["聊天", "浏览", "编辑", "查看", "打开", "使用", "运行"]
            words = user_query.split()
            for word in words:
                if (
                    len(word) > 1
                    and word not in function_words
                    and word not in time_keywords
                    and word not in app_keywords
                ):
                    if word not in [
                        "搜索",
                        "查找",
                        "包含",
                        "关于",
                        "找到",
                        "今天",
                        "昨天",
                        "的",
                        "在",
                        "上",
                        "中",
                        "里",
                    ]:
                        keywords.append(word)

        # 时间判断（非常简化）
        start_date = None
        end_date = None
        if "今天" in user_query:
            now = datetime.now()
            start_date = now.strftime("%Y-%m-%d 00:00:00")
            end_date = now.strftime("%Y-%m-%d 23:59:59")

        # 应用识别（非常简化）
        apps = []
        for app in app_keywords:
            if app in user_query:
                apps.append(app)

        # 查询类型（简化）
        if any(kw in user_query for kw in ["统计", "数量", "时长"]):
            query_type = "statistics"
        elif any(kw in user_query for kw in ["搜索", "查找", "包含"]):
            query_type = "search"
        else:
            query_type = "summary"

        return {
            "start_date": start_date,
            "end_date": end_date,
            "app_names": apps or None,
            "keywords": keywords or None,
            "query_type": query_type,
        }

    def _build_context(self, context_data: list[dict[str, Any]]) -> str:
        """构建用于LLM生成的上下文文本"""
        context_parts = []
        for i, item in enumerate(context_data[:50], start=1):
            text = item.get("text", "")
            if not text:
                text = (
                    item.get("ocr_result", {}).get("text", "")
                    if isinstance(item.get("ocr_result"), dict)
                    else ""
                )
            app_name = (
                item.get("metadata", {}).get("app_name", "")
                if isinstance(item.get("metadata"), dict)
                else ""
            )
            timestamp = (
                item.get("metadata", {}).get("created_at", "")
                if isinstance(item.get("metadata"), dict)
                else ""
            )
            context_parts.append(f"[{i}] 应用: {app_name}, 时间: {timestamp}\n{text}\n")
        return "\n".join(context_parts)

    def _fallback_summary(self, query: str, context_data: list[dict[str, Any]]) -> str:
        """在LLM不可用或失败时的总结备选方案"""
        summary_parts = [
            "以下是根据历史数据的简要总结：",
            "- 共检索到相关记录若干条",
            "- 涉及多个应用和时间点",
            "- 建议进一步细化查询条件以获得更精确的结果",
        ]
        return "\n".join(summary_parts)
