"""
Token使用量记录器
记录LLM API调用的token使用情况，便于后续统计分析
"""

from datetime import datetime
from typing import Any

from lifetrace.storage import get_session
from lifetrace.storage.models import TokenUsage
from lifetrace.util.logging_config import get_logger

logger = get_logger()


def _resolve_model_price(
    model: str,
    price_config: dict,
    input_tokens: int | None = None,
) -> tuple[float, float]:
    """根据价格配置解析模型的单价（元/千token）

    支持分层定价（tiers）和旧版的 input_price/output_price 直配。

    Args:
        model: 模型名称
        price_config: 价格配置字典
        input_tokens: 输入token数量，用于选择分层价格（可选）

    Returns:
        (input_price, output_price) 元组
    """
    # 支持分层定价：tiers 为列表，按 max_input_tokens 升序匹配
    if "tiers" in price_config:
        tiers = price_config.get("tiers") or []
        if not isinstance(tiers, list) or not tiers:
            raise ValueError(f"模型 '{model}' 的 tiers 配置无效")

        sorted_tiers = sorted(
            tiers,
            key=lambda tier: tier.get("max_input_tokens", float("inf")),
        )
        tokens = input_tokens if input_tokens is not None else 0
        selected_tier = None
        for tier in sorted_tiers:
            max_tokens = tier.get("max_input_tokens")
            # 如果未设置上限或在上限内，则匹配到该档
            if max_tokens is None or tokens <= max_tokens:
                selected_tier = tier
                break
        if selected_tier is None:
            selected_tier = sorted_tiers[-1]

        if "input_price" not in selected_tier or "output_price" not in selected_tier:
            raise KeyError(f"模型 '{model}' 的 tiers 配置缺少 input_price 或 output_price。")
        return float(selected_tier["input_price"]), float(selected_tier["output_price"])

    # 兼容旧配置：直接使用 input_price/output_price
    if "input_price" not in price_config or "output_price" not in price_config:
        raise KeyError(
            f"模型 '{model}' 的价格配置不完整。请确保配置了 input_price 和 output_price。"
        )
    return float(price_config["input_price"]), float(price_config["output_price"])


class TokenUsageLogger:
    """Token使用量记录器"""

    def __init__(self):
        pass

    def _get_model_price(self, model: str, input_tokens: int | None = None) -> tuple[float, float]:
        """获取模型价格（元/千token）

        Args:
            model: 模型名称
            input_tokens: 输入token数量，用于选择分层价格（可选）

        Returns:
            (input_price, output_price) 元组
        """
        from lifetrace.util.settings import settings

        model_prices = settings.get("llm.model_prices")
        if model_prices is None:
            return 0.0, 0.0

        # 将 Dynaconf Box 对象转换为普通字典
        if hasattr(model_prices, "to_dict"):
            model_prices = model_prices.to_dict()

        # 先尝试获取指定模型的价格
        if model in model_prices:
            price_config = model_prices[model]
            if hasattr(price_config, "to_dict"):
                price_config = price_config.to_dict()
            return _resolve_model_price(model, price_config, input_tokens=input_tokens)

        # 如果没有找到，使用默认价格
        if "default" not in model_prices:
            raise KeyError(
                f"找不到模型 '{model}' 的价格配置，也没有配置默认价格。"
                f"请在配置文件中添加该模型的价格或配置 default 价格。"
            )

        default_config = model_prices["default"]
        if hasattr(default_config, "to_dict"):
            default_config = default_config.to_dict()
        return _resolve_model_price(model, default_config, input_tokens=input_tokens)

    def log_token_usage(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        metadata: dict[str, Any] = None,
    ):
        """
        记录token使用量

        Args:
            model: 使用的模型名称
            input_tokens: 输入token数量
            output_tokens: 输出token数量
            metadata: 元数据字典，可包含以下键：
                - endpoint: API端点（如 /api/chat, /api/chat/stream）
                - user_query: 用户查询内容（可选，用于分析）
                - response_type: 响应类型（如 chat, search, classify）
                - feature_type: 功能类型（如 event_assistant, project_assistant）
                - additional_info: 额外信息字典
        """
        MAX_QUERY_PREVIEW_LENGTH = 200

        if metadata is None:
            metadata = {}

        endpoint = metadata.get("endpoint")
        user_query = metadata.get("user_query")
        response_type = metadata.get("response_type")
        feature_type = metadata.get("feature_type")

        try:
            # 计算成本
            input_price, output_price = self._get_model_price(model, input_tokens)
            input_cost = (input_tokens / 1000) * input_price
            output_cost = (output_tokens / 1000) * output_price
            total_cost = input_cost + output_cost

            # 准备用户查询预览
            user_query_preview = None
            query_length = None
            if user_query:
                # 只记录查询的前N个字符
                user_query_preview = user_query[:MAX_QUERY_PREVIEW_LENGTH] + (
                    "..." if len(user_query) > MAX_QUERY_PREVIEW_LENGTH else ""
                )
                query_length = len(user_query)

            # 写入数据库
            with get_session() as session:
                token_usage = TokenUsage(
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    total_tokens=input_tokens + output_tokens,
                    endpoint=endpoint,
                    response_type=response_type,
                    feature_type=feature_type,
                    user_query_preview=user_query_preview,
                    query_length=query_length,
                    input_cost=input_cost,
                    output_cost=output_cost,
                    total_cost=total_cost,
                    created_at=datetime.now(),
                )
                session.add(token_usage)
                session.flush()

            # 记录到标准日志
            logger.info(
                f"Token usage - Model: {model}, Input: {input_tokens}, Output: {output_tokens}, "
                f"Total: {input_tokens + output_tokens}, Cost: ¥{total_cost:.4f}"
            )

        except Exception as e:
            # 记录错误但不影响主流程
            logger.error(f"Failed to log token usage: {e}")

    def get_usage_stats(self, days: int = 30) -> dict[str, Any]:
        """
        获取token使用统计

        Args:
            days: 统计最近多少天的数据

        Returns:
            统计结果字典
        """
        try:
            from datetime import timedelta

            stats = {
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "total_tokens": 0,
                "total_requests": 0,
                "total_cost": 0.0,
                "model_stats": {},
                "endpoint_stats": {},
                "feature_stats": {},
                "daily_stats": {},
            }

            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # 从数据库查询
            with get_session() as session:
                # 查询时间范围内的所有记录
                records = (
                    session.query(TokenUsage)
                    .filter(TokenUsage.created_at >= start_date)
                    .filter(TokenUsage.created_at <= end_date)
                    .all()
                )

                for record in records:
                    # 更新总计
                    stats["total_input_tokens"] += record.input_tokens
                    stats["total_output_tokens"] += record.output_tokens
                    stats["total_tokens"] += record.total_tokens
                    stats["total_cost"] += record.total_cost
                    stats["total_requests"] += 1

                    # 按模型统计
                    model = record.model
                    if model not in stats["model_stats"]:
                        stats["model_stats"][model] = {
                            "input_tokens": 0,
                            "output_tokens": 0,
                            "total_tokens": 0,
                            "requests": 0,
                            "input_cost": 0.0,
                            "output_cost": 0.0,
                            "total_cost": 0.0,
                        }
                    stats["model_stats"][model]["input_tokens"] += record.input_tokens
                    stats["model_stats"][model]["output_tokens"] += record.output_tokens
                    stats["model_stats"][model]["total_tokens"] += record.total_tokens
                    stats["model_stats"][model]["input_cost"] += record.input_cost
                    stats["model_stats"][model]["output_cost"] += record.output_cost
                    stats["model_stats"][model]["total_cost"] += record.total_cost
                    stats["model_stats"][model]["requests"] += 1

                    # 按端点统计
                    endpoint = record.endpoint or "unknown"
                    if endpoint not in stats["endpoint_stats"]:
                        stats["endpoint_stats"][endpoint] = {
                            "input_tokens": 0,
                            "output_tokens": 0,
                            "total_tokens": 0,
                            "requests": 0,
                            "total_cost": 0.0,
                        }
                    stats["endpoint_stats"][endpoint]["input_tokens"] += record.input_tokens
                    stats["endpoint_stats"][endpoint]["output_tokens"] += record.output_tokens
                    stats["endpoint_stats"][endpoint]["total_tokens"] += record.total_tokens
                    stats["endpoint_stats"][endpoint]["total_cost"] += record.total_cost
                    stats["endpoint_stats"][endpoint]["requests"] += 1

                    # 按功能类型统计
                    feature_type = record.feature_type or "unknown"
                    if feature_type not in stats["feature_stats"]:
                        stats["feature_stats"][feature_type] = {
                            "input_tokens": 0,
                            "output_tokens": 0,
                            "total_tokens": 0,
                            "requests": 0,
                            "total_cost": 0.0,
                        }
                    stats["feature_stats"][feature_type]["input_tokens"] += record.input_tokens
                    stats["feature_stats"][feature_type]["output_tokens"] += record.output_tokens
                    stats["feature_stats"][feature_type]["total_tokens"] += record.total_tokens
                    stats["feature_stats"][feature_type]["total_cost"] += record.total_cost
                    stats["feature_stats"][feature_type]["requests"] += 1

                    # 按日期统计
                    date_str = record.created_at.strftime("%Y-%m-%d")
                    if date_str not in stats["daily_stats"]:
                        stats["daily_stats"][date_str] = {
                            "input_tokens": 0,
                            "output_tokens": 0,
                            "total_tokens": 0,
                            "requests": 0,
                            "total_cost": 0.0,
                        }
                    stats["daily_stats"][date_str]["input_tokens"] += record.input_tokens
                    stats["daily_stats"][date_str]["output_tokens"] += record.output_tokens
                    stats["daily_stats"][date_str]["total_tokens"] += record.total_tokens
                    stats["daily_stats"][date_str]["total_cost"] += record.total_cost
                    stats["daily_stats"][date_str]["requests"] += 1

            return stats

        except Exception as e:
            logger.error(f"Failed to get usage stats: {e}")
            return {}


# 全局token使用量记录器实例
_token_logger: TokenUsageLogger | None = None


def setup_token_logger() -> TokenUsageLogger:
    """设置token使用量记录器"""
    global _token_logger
    if _token_logger is None:
        _token_logger = TokenUsageLogger()
    return _token_logger


def get_token_logger() -> TokenUsageLogger | None:
    """获取token使用量记录器实例"""
    return _token_logger


def log_token_usage(model: str, input_tokens: int, output_tokens: int, **kwargs):
    """便捷函数：记录token使用量

    Args:
        model: 模型名称
        input_tokens: 输入token数量
        output_tokens: 输出token数量
        **kwargs: 传递给 metadata 字典的其他参数
    """
    if _token_logger is None:
        setup_token_logger()
    return _token_logger.log_token_usage(model, input_tokens, output_tokens, metadata=kwargs)
