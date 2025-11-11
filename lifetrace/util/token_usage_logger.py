#!/usr/bin/env python3
"""
Token使用量记录器
记录LLM API调用的token使用情况，便于后续统计分析
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from lifetrace.util.logging_config import get_logger

logger = get_logger()


class TokenUsageLogger:
    """Token使用量记录器"""

    def __init__(self, config=None):
        self.config = config
        self._setup_log_file()

    def _setup_log_file(self):
        """设置token使用量日志文件路径"""
        if self.config:
            base_dir = getattr(self.config, "base_dir", "data")
        else:
            base_dir = os.path.join(Path(__file__).parent.parent, "data")

        # token使用量日志存储在logs/core目录下
        self.log_dir = os.path.join(base_dir, "logs", "core")
        os.makedirs(self.log_dir, exist_ok=True)

        # 使用日期作为文件名的一部分，便于按日期统计
        today = datetime.now().strftime("%Y-%m")
        self.token_log_file = os.path.join(self.log_dir, f"token_usage_{today}.jsonl")

    def log_token_usage(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        endpoint: str = None,
        user_query: str = None,
        response_type: str = None,
        additional_info: dict[str, Any] = None,
    ):
        """
        记录token使用量

        Args:
            model: 使用的模型名称
            input_tokens: 输入token数量
            output_tokens: 输出token数量
            endpoint: API端点（如 /api/chat, /api/chat/stream）
            user_query: 用户查询内容（可选，用于分析）
            response_type: 响应类型（如 chat, search, classify）
            additional_info: 额外信息字典
        """
        try:
            # 构建记录数据
            usage_record = {
                "timestamp": datetime.now().isoformat(),
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "total_tokens": input_tokens + output_tokens,
                "endpoint": endpoint,
                "response_type": response_type,
            }

            # 添加可选字段
            if user_query:
                # 只记录查询的前100个字符，避免日志过大
                usage_record["user_query_preview"] = user_query[:100] + (
                    "..." if len(user_query) > 100 else ""
                )
                usage_record["query_length"] = len(user_query)

            if additional_info:
                usage_record["additional_info"] = additional_info

            # 写入JSONL格式文件（每行一个JSON对象）
            with open(self.token_log_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(usage_record, ensure_ascii=False) + "\n")

            # 同时记录到标准日志
            logger.info(
                f"Token usage - Model: {model}, Input: {input_tokens}, Output: {output_tokens}, Total: {input_tokens + output_tokens}"
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
            stats = {
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "total_tokens": 0,
                "total_requests": 0,
                "model_stats": {},
                "endpoint_stats": {},
                "daily_stats": {},
            }

            # 读取最近的日志文件
            from datetime import timedelta

            end_date = datetime.now()
            start_date = end_date - timedelta(days=days)

            # 遍历可能的日志文件
            for i in range(days + 1):
                check_date = start_date + timedelta(days=i)
                month_str = check_date.strftime("%Y-%m")
                log_file = os.path.join(self.log_dir, f"token_usage_{month_str}.jsonl")

                if os.path.exists(log_file):
                    with open(log_file, encoding="utf-8") as f:
                        for line in f:
                            try:
                                record = json.loads(line.strip())
                                record_date = datetime.fromisoformat(record["timestamp"])

                                # 检查是否在统计范围内
                                if start_date <= record_date <= end_date:
                                    # 更新总计
                                    stats["total_input_tokens"] += record["input_tokens"]
                                    stats["total_output_tokens"] += record["output_tokens"]
                                    stats["total_tokens"] += record["total_tokens"]
                                    stats["total_requests"] += 1

                                    # 按模型统计
                                    model = record["model"]
                                    if model not in stats["model_stats"]:
                                        stats["model_stats"][model] = {
                                            "input_tokens": 0,
                                            "output_tokens": 0,
                                            "total_tokens": 0,
                                            "requests": 0,
                                        }
                                    stats["model_stats"][model]["input_tokens"] += record[
                                        "input_tokens"
                                    ]
                                    stats["model_stats"][model]["output_tokens"] += record[
                                        "output_tokens"
                                    ]
                                    stats["model_stats"][model]["total_tokens"] += record[
                                        "total_tokens"
                                    ]
                                    stats["model_stats"][model]["requests"] += 1

                                    # 按端点统计
                                    endpoint = record.get("endpoint", "unknown")
                                    if endpoint not in stats["endpoint_stats"]:
                                        stats["endpoint_stats"][endpoint] = {
                                            "input_tokens": 0,
                                            "output_tokens": 0,
                                            "total_tokens": 0,
                                            "requests": 0,
                                        }
                                    stats["endpoint_stats"][endpoint]["input_tokens"] += record[
                                        "input_tokens"
                                    ]
                                    stats["endpoint_stats"][endpoint]["output_tokens"] += record[
                                        "output_tokens"
                                    ]
                                    stats["endpoint_stats"][endpoint]["total_tokens"] += record[
                                        "total_tokens"
                                    ]
                                    stats["endpoint_stats"][endpoint]["requests"] += 1

                                    # 按日期统计
                                    date_str = record_date.strftime("%Y-%m-%d")
                                    if date_str not in stats["daily_stats"]:
                                        stats["daily_stats"][date_str] = {
                                            "input_tokens": 0,
                                            "output_tokens": 0,
                                            "total_tokens": 0,
                                            "requests": 0,
                                        }
                                    stats["daily_stats"][date_str]["input_tokens"] += record[
                                        "input_tokens"
                                    ]
                                    stats["daily_stats"][date_str]["output_tokens"] += record[
                                        "output_tokens"
                                    ]
                                    stats["daily_stats"][date_str]["total_tokens"] += record[
                                        "total_tokens"
                                    ]
                                    stats["daily_stats"][date_str]["requests"] += 1

                            except (json.JSONDecodeError, KeyError, ValueError) as e:
                                logger.warning(
                                    f"Failed to parse log line: {line.strip()}, error: {e}"
                                )
                                continue

            return stats

        except Exception as e:
            logger.error(f"Failed to get usage stats: {e}")
            return {}


# 全局token使用量记录器实例
_token_logger: TokenUsageLogger | None = None


def setup_token_logger(config=None) -> TokenUsageLogger:
    """设置token使用量记录器"""
    global _token_logger
    if _token_logger is None:
        _token_logger = TokenUsageLogger(config)
    return _token_logger


def get_token_logger() -> TokenUsageLogger | None:
    """获取token使用量记录器实例"""
    return _token_logger


def log_token_usage(model: str, input_tokens: int, output_tokens: int, **kwargs):
    """便捷函数：记录token使用量"""
    if _token_logger is None:
        setup_token_logger()
    return _token_logger.log_token_usage(model, input_tokens, output_tokens, **kwargs)
