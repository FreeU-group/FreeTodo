# 聊天会话隔离机制

## 概述

项目助手（Project Assistant）和事件助手（Event Assistant）的聊天会话是完全隔离的，通过 `chat_type` 字段区分和过滤。

## 会话类型

- **`project`**: 项目助手的会话
- **`event`**: 事件助手的会话

## 实现机制

### 1. 会话创建

#### 项目助手
- **位置**: `lifetrace/routers/chat.py` - `chat_with_llm_stream`
- **逻辑**:
  ```python
  # 根据是否有 project_id 判断聊天类型
  chat_type = "project" if message.project_id else "event"
  ```
- **触发**: 前端发送消息时传递 `project_id` 参数

#### 事件助手
- **位置**:
  - `lifetrace/routers/chat.py` - `chat_with_llm_stream` (无 project_id)
  - `lifetrace/routers/chat.py` - `chat_with_context_stream` (硬编码 "event")
- **逻辑**:
  ```python
  # 直接设置为事件类型
  chat_type = "event"
  ```
- **触发**: 前端发送消息时不传递 `project_id`

### 2. 会话标识传递

后端通过响应头返回 `session_id`:

```python
headers = {
    "X-Session-Id": session_id,
}
return StreamingResponse(token_generator(), headers=headers)
```

前端通过回调接收:

```typescript
api.sendChatMessageStream(
    { message, project_id, ... },
    (chunk) => { /* 处理流式内容 */ },
    (sessionId) => { /* 接收 session_id */ }
)
```

### 3. 历史记录过滤

#### 数据库层过滤
**位置**: `lifetrace/storage/database.py` - `get_chat_summaries`

```python
def get_chat_summaries(self, chat_type: str | None = None, limit: int = 10):
    with self.get_session() as session:
        q = session.query(Chat)

        # 根据 chat_type 过滤
        if chat_type:
            q = q.filter(Chat.chat_type == chat_type)

        chats = q.order_by(Chat.last_message_at.desc()).limit(limit).all()
        return chats
```

#### API 层过滤
**位置**: `lifetrace/routers/chat.py` - `get_chat_history`

```python
@router.get("/history")
async def get_chat_history(
    session_id: str | None = Query(None),
    chat_type: str | None = Query(None, description="聊天类型过滤：event, project, general")
):
    if session_id:
        # 返回指定会话的历史记录
        messages = deps.db_manager.get_messages(session_id)
        return {"session_id": session_id, "history": messages}
    else:
        # 返回所有会话的摘要信息，根据 chat_type 过滤，最多返回20条
        sessions_info = deps.db_manager.get_chat_summaries(chat_type=chat_type, limit=20)
        return {"sessions": sessions_info}
```

#### 前端调用

**事件助手页面** (`frontend/app/page.tsx`):
```typescript
// 加载事件助手的聊天历史，最多20条，每次打开都重新请求
const response = await api.getChatHistory(undefined, 'event', 20);
```

**项目助手页面** (`frontend/app/project-management/[id]/page.tsx`):
```typescript
// 加载项目助手的聊天历史，最多20条，每次打开都重新请求
const response = await api.getChatHistory(undefined, 'project', 20);
```

## 完整流程

### 项目助手会话创建流程

1. 用户在项目管理页面发送消息
2. 前端调用 `api.sendChatMessageStream({ message, project_id: 123, ... })`
3. 后端检测到 `project_id` 存在，设置 `chat_type = "project"`
4. 在数据库中创建会话记录，并关联到项目（`context_id = project_id`）
5. 通过响应头 `X-Session-Id` 返回会话ID
6. 前端保存 `session_id`，后续消息使用相同的 session_id

### 事件助手会话创建流程

1. 用户在事件助手页面发送消息
2. 前端调用 `api.sendChatMessageStream({ message, ... })` (不传 project_id)
3. 后端检测到 `project_id` 不存在，设置 `chat_type = "event"`
4. 在数据库中创建会话记录
5. 通过响应头 `X-Session-Id` 返回会话ID
6. 前端保存 `session_id`，后续消息使用相同的 session_id

## 数据库模型

### Chat 表
```python
class Chat(Base):
    __tablename__ = "chats"

    id = Column(Integer, primary_key=True)
    session_id = Column(String, unique=True, index=True)  # 会话ID
    chat_type = Column(String, index=True)  # 聊天类型：event, project, general
    title = Column(String)  # 会话标题
    context_id = Column(Integer, nullable=True)  # 关联的上下文ID（项目ID）
    created_at = Column(DateTime, default=datetime.now)
    last_message_at = Column(DateTime, nullable=True)
```

## 验证隔离性

确保会话隔离的关键点：

1. ✅ **创建时设置正确的 chat_type**
   - 项目助手: `chat_type = "project"`
   - 事件助手: `chat_type = "event"`

2. ✅ **获取历史时传递 chat_type 过滤**
   - 事件助手: `getChatHistory(undefined, 'event')`
   - 项目助手: `getChatHistory(undefined, 'project')`

3. ✅ **数据库查询时应用过滤**
   - `q.filter(Chat.chat_type == chat_type)`

4. ✅ **会话列表显示时不混淆**
   - 每个页面只显示对应类型的会话

## 会话历史配置

### 数量限制
- **显示数量**: 最多显示 **20 条**最近会话
- **UI 高度**: 最多显示 3 个会话的高度（约 240-300px）
- **滚动支持**: 超过 3 个会话时，用户可以滚动查看

### 刷新策略
- **每次重新请求**: 每次打开历史记录面板时都会重新从后端获取最新的 20 条会话
- **实时更新**: 确保用户看到的始终是最新的会话列表

## 最佳实践

1. **新建会话**: 让流式聊天接口自动创建会话，不需要手动调用 `createNewChat`
2. **会话切换**: 切换会话时，只显示当前助手类型的历史会话
3. **会话清理**: 删除会话时，只影响当前类型的会话列表
4. **历史加载**: 每次打开历史记录时都重新加载，保持数据最新

## 相关文件

- 后端路由: `lifetrace/routers/chat.py`
- 数据库管理: `lifetrace/storage/database.py`
- 数据模型: `lifetrace/storage/models.py`
- 前端 API: `frontend/lib/api.ts`
- 事件助手页面: `frontend/app/page.tsx`
- 项目助手页面: `frontend/app/project-management/[id]/page.tsx`
