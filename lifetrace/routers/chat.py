"""聊天相关路由聚合模块。

此模块仅导出统一的 `router`，具体路由实现拆分在 `chat` 子包中：
- `chat.core`：基础问答与流式聊天
- `chat.context`：带事件上下文的流式聊天
- `chat.plan`：Plan 问卷与总结相关路由
- `chat.misc`：会话管理、历史记录、查询建议等辅助接口
"""
