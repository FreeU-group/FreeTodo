"""Observability 模块 - Phoenix + OpenInference 集成

提供 Agent 运行的可观测性功能：
- 本地 JSON 文件导出（Cursor 友好）
- Phoenix UI 集成（可选）
- Terminal 精简摘要输出
"""

from observability.setup import setup_observability

__all__ = ["setup_observability"]
