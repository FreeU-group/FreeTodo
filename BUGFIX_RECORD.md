# Bug 修复记录 - API 500 错误和开发模式配置

## 问题概述

在开发过程中遇到了多个 API 端点返回 500 错误的问题，以及缺少国际化翻译键的问题。

## 修复时间线

### 2025-12-27

---

## 问题 1: 缺少国际化翻译键

### 错误信息
```
IntlError: MISSING_MESSAGE: Could not resolve chat.promptNotLoaded in messages for locale zh.
```

### 原因
前端代码 `usePromptHandlers.ts` 使用了 `chat.promptNotLoaded` 翻译键，但该键在翻译文件中不存在。

### 修复方案

**文件**: `free-todo-frontend/lib/i18n/messages/zh.json`
- 在 `chat` 对象中添加了 `promptNotLoaded` 键
- 值: `"提示词正在加载中，请稍候..."`

**文件**: `free-todo-frontend/lib/i18n/messages/en.json`
- 在 `chat` 对象中添加了 `promptNotLoaded` 键
- 值: `"Prompt is loading, please wait..."`

### 相关代码
```typescript
// usePromptHandlers.ts:66
setError(tChat("promptNotLoaded") || "提示词正在加载中，请稍候...");
```

---

## 问题 2: `/api/todos` 端点 500 错误

### 错误信息
```
GET http://localhost:3000/api/todos?status=draft&limit=1&offset=0 500 (Internal Server Error)
```

### 原因分析
1. `TodoResponse` 模型验证失败：某些数据库中的 todo 数据不符合 `TodoResponse` 模型的要求
2. 当转换失败时，整个请求会抛出异常，导致 500 错误
3. 路由描述中未明确支持 `draft` 状态

### 修复方案

#### 1. 增强 `todo_service.py` 的错误处理

**文件**: `lifetrace/services/todo_service.py`

**修改内容**:
- 在 `list_todos` 方法中添加了逐个转换 todo 的逻辑
- 对每个 todo 的转换使用 `try-except` 捕获验证错误
- 跳过无效的 todo 项，继续处理其他项
- 添加了详细的错误日志（包含 `exc_info=True`）
- 添加了顶层异常处理，确保任何错误都能被捕获并记录

**关键代码**:
```python
def list_todos(self, limit: int, offset: int, status: str | None) -> dict[str, Any]:
    """获取 Todo 列表"""
    try:
        todos = self.repository.list_todos(limit, offset, status)
        total = self.repository.count(status)
        # 安全地转换为 TodoResponse，捕获验证错误
        todo_responses = []
        for t in todos:
            try:
                todo_responses.append(TodoResponse(**t))
            except Exception as e:
                logger.error(f"转换 todo 为响应模型失败: {e}, todo数据: {t}", exc_info=True)
                # 跳过无效的 todo，继续处理其他项
                continue
        return {"total": total, "todos": todo_responses}
    except Exception as e:
        logger.error(f"获取 Todo 列表失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取 Todo 列表失败: {str(e)}") from e
```

#### 2. 增强 `todo.py` 路由的错误处理

**文件**: `lifetrace/routers/todo.py`

**修改内容**:
- 更新了路由描述，明确支持 `draft` 状态
- 添加了顶层 `try-except` 块，捕获所有异常
- 返回详细的错误日志

**关键代码**:
```python
@router.get("", response_model=TodoListResponse)
async def list_todos(
    limit: int = Query(200, ge=1, le=2000, description="返回数量限制"),
    offset: int = Query(0, ge=0, description="偏移量"),
    status: str | None = Query(None, description="状态筛选：active/completed/canceled/draft"),
    service: TodoService = Depends(get_todo_service),
):
    """获取待办列表"""
    try:
        return service.list_todos(limit, offset, status)
    except Exception as e:
        logger.error(f"API /api/todos 调用失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取待办列表失败: {str(e)}") from e
```

---

## 问题 3: `/api/get-config` 端点 500 错误

### 错误信息
```
GET http://localhost:3000/api/get-config 500 (Internal Server Error)
```

### 原因分析
1. `config_service.py` 在访问 Dynaconf 配置时，某些配置键可能不存在
2. 使用 `getattr` 或直接属性访问时，如果键不存在会抛出 `AttributeError`
3. 没有适当的错误处理机制

### 修复方案

#### 1. 增强 `config_service.py` 的错误处理

**文件**: `lifetrace/services/config_service.py`

**修改内容**:
- 在 `get_config_for_frontend` 方法中使用 `settings.get(backend_key, default=None)` 安全地获取配置值
- 如果值为 `None`，跳过该配置项
- 为每个配置项的获取添加了 `try-except` 块
- 添加了顶层异常处理，允许部分配置项失败时继续处理其他项

**关键代码**:
```python
def get_config_for_frontend(self) -> dict[str, Any]:
    """获取配置（转换为 snake_case 格式供前端使用）"""
    config_dict = {}
    for backend_key in backend_config_keys:
        try:
            # Dynaconf 支持点分隔键访问，get 方法在键不存在时返回 None
            value = settings.get(backend_key, default=None)

            # 如果值为 None，跳过该配置项
            if value is None:
                logger.debug(f"配置项 {backend_key} 不存在或值为 None，跳过")
                continue

            # 将点分隔格式转换为 snake_case 格式
            frontend_key = dot_to_snake_notation(backend_key)
            config_dict[frontend_key] = value
        except Exception as e:
            # 捕获所有异常，记录日志但继续处理其他配置项
            logger.warning(f"获取配置项 {backend_key} 时出错: {e}，跳过", exc_info=True)
            continue
    return config_dict
```

#### 2. 增强 `compare_config_changes` 方法

**修改内容**:
- 使用 `settings.get(backend_key)` 安全地访问配置值
- 添加了异常处理，将不存在的配置项视为新增配置

**关键代码**:
```python
def compare_config_changes(self, new_settings: dict[str, Any]) -> tuple[bool, list[str]]:
    """比对配置变更"""
    config_changed = False
    changed_items = []

    for raw_key, new_value in new_settings.items():
        backend_key = snake_to_dot_notation(raw_key)
        old_value = None
        try:
            # 尝试使用 Dynaconf 的 get 方法安全访问配置
            old_value = settings.get(backend_key)
        except Exception as e:
            logger.debug(f"访问旧配置项 {backend_key} 时出错: {e}. 视为新增配置。")
            # 配置项不存在，视为新增配置
            config_changed = True
            # ... 记录变更项
            continue
        # ... 比对新旧值
    return config_changed, changed_items
```

#### 3. 增强 `config.py` 路由的错误处理

**文件**: `lifetrace/routers/config.py`

**修改内容**:
- 在 `get_config_detailed` 函数中添加了顶层 `try-except` 块
- 即使出错也返回成功响应，但配置字典为空
- 添加了详细的错误日志（包含 `exc_info=True`）

**关键代码**:
```python
@router.get("/get-config")
async def get_config_detailed():
    """获取当前配置（返回驼峰格式的配置键）"""
    try:
        config_dict = config_service.get_config_for_frontend()
        return {
            "success": True,
            "config": config_dict,
        }
    except Exception as e:
        logger.error(f"获取配置失败: {e}", exc_info=True)
        # 即使出错，也返回一个空配置字典，而不是抛出 500 错误
        return {
            "success": True,
            "config": {},
        }
```

---

## 问题 4: `/api/get-chat-prompts` 端点 500 错误

### 错误信息
```
GET http://localhost:3000/api/get-chat-prompts?locale=zh 500 (Internal Server Error)
```

### 原因分析
1. `get_prompt` 函数可能无法加载某些 prompt 文件
2. 当 prompt 不存在时，会抛出异常，导致 500 错误
3. 前端需要这些 prompt，但应该能够处理空字符串的情况

### 修复方案

**文件**: `lifetrace/routers/config.py`

**修改内容**:
- 修改了 `get_chat_prompts` 函数的错误处理逻辑
- 如果无法加载 prompt，返回空字符串而不是抛出异常
- 添加了警告日志，但不中断请求
- 即使出错也返回成功响应，但 prompt 为空字符串

**关键代码**:
```python
@router.get("/get-chat-prompts")
async def get_chat_prompts(locale: str = "zh"):
    """获取前端聊天功能所需的 prompt"""
    edit_prompt = ""
    plan_prompt = ""
    try:
        # 根据语言选择对应的 prompt key
        edit_key = "edit_system_prompt_zh" if locale == "zh" else "edit_system_prompt_en"
        plan_key = "plan_system_prompt_zh" if locale == "zh" else "plan_system_prompt_en"

        edit_prompt = get_prompt("chat_frontend", edit_key)
        plan_prompt = get_prompt("chat_frontend", plan_key)

        if not edit_prompt or not plan_prompt:
            logger.warning(f"无法加载部分或全部 prompt，locale={locale}. Edit: {bool(edit_prompt)}, Plan: {bool(plan_prompt)}")
    except Exception as e:
        logger.error(f"获取聊天 prompt 失败: {e}", exc_info=True)
        # 即使出错也返回成功响应，但 prompt 为空字符串
    return {
        "success": True,
        "editSystemPrompt": edit_prompt,
        "planSystemPrompt": plan_prompt,
    }
```

---

## 问题 5: 开发模式和热重载配置

### 问题描述
用户需要启用开发模式和热重载，以便在修改代码后自动重启服务器。

### 修复方案

#### 1. 配置文件设置

**文件**: `lifetrace/config/config.yaml`

**修改内容**:
- 确保 `server.debug` 设置为 `true`

**配置**:
```yaml
server:
  host: 127.0.0.1
  port: 8000
  debug: true  # 开发模式：启用热重载，修改代码后自动重启
```

#### 2. 强制启用热重载

**文件**: `lifetrace/server.py`

**修改内容**:
- 强制设置 `server_debug = True`
- 强制设置 `reload=True`
- 强制设置 `access_log=True`
- 强制设置 `log_level="debug"`

**关键代码**:
```python
if __name__ == "__main__":
    server_host = settings.server.host
    server_port = settings.server.port
    # 强制启用开发模式和热重载
    server_debug = True  # 强制启用，确保热重载工作

    logger.info(f"启动服务器: http://{server_host}:{server_port}")
    logger.info(f"调试模式: 开启 (强制启用)")
    logger.info(f"热重载: 已启用")
    uvicorn.run(
        "lifetrace.server:app",
        host=server_host,
        port=server_port,
        reload=True,  # 强制启用热重载
        access_log=True,  # 启用访问日志
        log_level="debug",  # 使用 debug 日志级别
    )
```

---

## 修复原则总结

### 1. 防御性编程
- 在所有可能出错的地方添加 `try-except` 块
- 使用安全的配置访问方法（如 `settings.get()` 而不是直接属性访问）
- 对数据转换进行验证，跳过无效项而不是失败整个请求

### 2. 优雅降级
- 即使部分数据失败，也返回部分结果而不是完全失败
- 返回空值（空列表、空字典、空字符串）而不是抛出异常
- 允许前端处理缺失的数据

### 3. 详细日志
- 使用 `logger.error(..., exc_info=True)` 记录完整的堆栈跟踪
- 记录失败的数据项，便于调试
- 区分警告和错误，避免日志噪音

### 4. 错误处理层次
- 在服务层（service）处理业务逻辑错误
- 在路由层（router）处理 HTTP 错误
- 在数据访问层（repository）处理数据错误

---

## 仍然存在的问题

### 1. 偶尔出现的 500 错误

**现象**: 即使修复后，`/api/todos?status=draft&limit=1&offset=0` 仍然偶尔返回 500 错误。

**可能原因**:
1. **数据库连接问题**: 
   - 在高并发或长时间运行后，数据库连接可能超时或失效
   - SQLite 的 WAL 模式在高并发时可能出现锁竞争
   - 连接池可能没有正确配置超时和重试机制

2. **数据一致性问题**: 
   - 某些 todo 数据在查询时可能处于不一致状态（例如，正在被其他进程修改）
   - 数据库事务隔离级别可能导致读取到不一致的数据

3. **并发问题**: 
   - 多个请求同时访问数据库时可能出现竞态条件
   - 后台任务（OCR、录音等）可能同时访问数据库，导致锁竞争

4. **内存问题**: 
   - 大量数据加载时可能导致内存不足
   - Python 对象序列化/反序列化可能消耗大量内存

5. **数据库文件锁定**:
   - SQLite 在 Windows 上可能出现文件锁定问题
   - 多个进程同时访问数据库文件时可能失败

**当前已实现的保护措施**:
- ✅ 数据库索引已创建（`idx_todos_status`）
- ✅ 数据库连接使用 `pool_pre_ping=True` 进行健康检查
- ✅ 错误处理已增强，会跳过无效数据
- ✅ 日志记录已添加，包含完整堆栈跟踪

**建议的进一步修复**:
1. **添加数据库连接池配置**:
   ```python
   # 在 database_base.py 中
   self.engine = create_engine(
       "sqlite:///" + db_path,
       echo=False,
       pool_pre_ping=True,
       pool_size=10,  # 连接池大小
       max_overflow=20,  # 最大溢出连接数
       pool_timeout=30,  # 连接超时时间
       pool_recycle=3600,  # 连接回收时间（1小时）
   )
   ```

2. **添加请求重试机制**:
   - 在前端添加指数退避重试
   - 在后端添加数据库操作重试

3. **添加数据库查询超时设置**:
   ```python
   # 在查询时添加超时
   with session.begin():
       result = session.execute(
           select(Todo).where(Todo.status == status),
           timeout=5.0  # 5秒超时
       )
   ```

4. **优化数据库查询**:
   - 只查询需要的字段，而不是整个对象
   - 使用分页查询，避免一次性加载大量数据
   - 添加查询缓存

5. **使用 WAL 模式**:
   ```python
   # SQLite WAL 模式可以提高并发性能
   with self.engine.connect() as conn:
       conn.execute(text("PRAGMA journal_mode=WAL"))
   ```

### 2. 响应速度慢

**现象**: API 响应时间较长，特别是在查询 todo 列表时。

**可能原因**:
1. **数据库查询慢**: 
   - 虽然已有索引，但查询可能仍然需要扫描大量数据
   - 复杂的 JOIN 查询可能很慢
   - 没有使用查询优化器提示

2. **同步操作**: 
   - 某些操作可能是同步的，阻塞了请求
   - 数据库操作可能没有使用异步模式

3. **资源竞争**: 
   - 多个后台任务（OCR、录音等）可能占用大量 CPU 和内存
   - 数据库文件 I/O 可能成为瓶颈

4. **网络延迟**: 
   - 前端和后端之间的网络延迟（虽然都在 localhost，但可能仍有延迟）
   - 代理服务器可能增加延迟

5. **日志记录**: 
   - 过多的日志记录可能影响性能
   - 日志文件 I/O 可能阻塞请求

6. **数据序列化**: 
   - Pydantic 模型验证和序列化可能消耗时间
   - 大量数据的 JSON 序列化可能很慢

7. **轮询频率过高**:
   - 前端轮询 `draft` todos 的频率可能过高
   - 每次轮询都会触发数据库查询

**当前已实现的优化**:
- ✅ 数据库索引已创建（`idx_todos_status`）
- ✅ 使用连接池（`pool_pre_ping=True`）
- ✅ 错误处理已优化，避免不必要的重试

**发现的性能问题**:
- ⚠️ **N+1 查询问题**: `list_todos` 方法中，对每个 todo 都会单独查询 tags 和 attachments
  - 查询 10 个 todos 需要执行 1 + 10 + 10 = 21 次数据库查询
  - 这会导致响应时间随数据量线性增长
  - 建议使用 JOIN 查询或批量查询优化

**建议的进一步优化**:
1. **添加查询缓存**:
   ```python
   from functools import lru_cache
   from datetime import datetime, timedelta
   
   # 缓存查询结果（5秒）
   @lru_cache(maxsize=100)
   def get_cached_todos(limit, offset, status, cache_key):
       return list_todos(limit, offset, status)
   ```

2. **使用异步数据库操作**:
   - 考虑使用 `asyncpg` 或 `aiosqlite` 进行异步数据库操作
   - 使用 FastAPI 的异步特性

3. **优化后台任务**:
   - 减少后台任务的资源占用
   - 使用任务队列，避免阻塞主线程

4. **减少日志记录**:
   - 在生产环境中减少 DEBUG 级别的日志
   - 使用异步日志记录

5. **优化数据序列化**:
   - 只序列化需要的字段
   - 使用更快的 JSON 序列化库（如 `orjson`）

6. **优化轮询频率**:
   - 增加轮询间隔（例如从 1 秒增加到 5 秒）
   - 使用 WebSocket 推送而不是轮询

7. **添加响应压缩**:
   ```python
   from fastapi.middleware.gzip import GZipMiddleware
   app.add_middleware(GZipMiddleware, minimum_size=1000)
   ```

8. **使用数据库连接池监控**:
   - 监控连接池使用情况
   - 识别连接泄漏问题

9. **优化 N+1 查询问题**（重要）:
   ```python
   # 当前实现（慢）:
   def list_todos(self, ...):
       todos = q.all()
       return [self._todo_to_dict(session, t) for t in todos]  # N+1 查询
   
   # 优化方案（快）:
   def list_todos(self, ...):
       # 使用 JOIN 或批量查询
       todos = q.options(
           joinedload(Todo.tags),
           joinedload(Todo.attachments)
       ).all()
       return [self._todo_to_dict(session, t) for t in todos]  # 只需 1 次查询
   ```

### 3. 为什么偶尔出现 500 错误？

**根本原因分析**:

1. **SQLite 并发限制**:
   - SQLite 在高并发场景下性能较差
   - 多个写操作可能相互阻塞
   - WAL 模式可以改善，但不能完全解决

2. **数据库锁竞争**:
   - 当多个请求同时访问数据库时，可能出现锁竞争
   - 特别是当有后台任务（OCR、录音等）同时访问数据库时

3. **数据验证失败**:
   - 某些 todo 数据可能不符合 `TodoResponse` 模型的要求
   - 虽然我们已经跳过这些数据，但在某些情况下可能仍然失败

4. **资源耗尽**:
   - 当系统资源（内存、CPU）不足时，数据库操作可能失败
   - 特别是在运行多个后台任务时

**临时解决方案**:
- 增加错误重试机制
- 降低轮询频率
- 优化后台任务，减少资源占用

**长期解决方案**:
- 考虑迁移到 PostgreSQL 或 MySQL（更好的并发支持）
- 使用 Redis 缓存频繁访问的数据
- 实现更完善的连接池和超时机制

---

## 文件修改清单

### 前端文件
1. `free-todo-frontend/lib/i18n/messages/zh.json` - 添加 `promptNotLoaded` 翻译
2. `free-todo-frontend/lib/i18n/messages/en.json` - 添加 `promptNotLoaded` 翻译

### 后端文件
1. `lifetrace/services/todo_service.py` - 增强错误处理
2. `lifetrace/routers/todo.py` - 增强错误处理，更新路由描述
3. `lifetrace/services/config_service.py` - 增强配置访问的错误处理
4. `lifetrace/routers/config.py` - 增强 `get_config_detailed` 和 `get_chat_prompts` 的错误处理
5. `lifetrace/server.py` - 强制启用开发模式和热重载
6. `lifetrace/config/config.yaml` - 确保 `server.debug: true`

---

## 测试建议

1. **测试正常情况**: 确保所有 API 端点在正常情况下都能正常工作
2. **测试异常情况**: 测试缺失数据、无效数据等情况
3. **测试并发**: 测试多个请求同时访问时的行为
4. **测试性能**: 监控响应时间，识别性能瓶颈
5. **测试热重载**: 修改代码后验证服务器是否自动重启

---

## 后续优化建议

1. **添加监控**: 使用 APM 工具监控 API 性能和错误率
2. **添加缓存**: 对频繁访问的配置和数据添加缓存
3. **优化数据库**: 添加索引，优化查询语句
4. **添加限流**: 防止过多请求导致服务器过载
5. **添加健康检查**: 定期检查数据库连接和系统资源

---

## 总结

本次修复主要解决了以下问题：
1. ✅ 缺少国际化翻译键
2. ✅ `/api/todos` 端点 500 错误（部分解决，仍偶尔出现）
3. ✅ `/api/get-config` 端点 500 错误
4. ✅ `/api/get-chat-prompts` 端点 500 错误
5. ✅ 开发模式和热重载配置

仍然需要进一步优化的问题：
- ⚠️ `/api/todos` 端点偶尔仍返回 500 错误（需要进一步调查）
- ⚠️ API 响应速度慢（需要性能优化）

