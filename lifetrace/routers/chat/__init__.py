"""聊天相关路由聚合包。

此包仅导出统一的 `router`，具体路由实现拆分在多个子模块中：
- `core`：基础问答与流式聊天
- `context`：带事件上下文的流式聊天
- `plan`：Plan 问卷与总结相关路由
- `misc`：会话管理、历史记录、查询建议等辅助接口
- `message_todo_extraction`：从消息中提取待办
"""

from . import context as _context  # noqa: F401

# 导入子模块以注册对应路由（仅用于副作用）
from . import core as _core  # noqa: F401
from . import message_todo_extraction as _message_todo_extraction  # noqa: F401
from . import misc as _misc  # noqa: F401
from . import plan as _plan  # noqa: F401
from .base import router as router
