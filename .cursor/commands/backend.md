# 后端开发快捷命令（lifetrace 版）

## 技术栈信息

- **框架**: FastAPI + Uvicorn（异步 Web 框架）
- **语言**: Python 3.13+
- **ORM**: SQLAlchemy 2.x + SQLModel
- **数据库迁移**: Alembic
- **数据验证**: Pydantic 2.x
- **配置管理**: Dynaconf（支持 YAML 热重载）
- **日志**: Loguru
- **调度器**: APScheduler（后台任务调度）
- **OCR**: RapidOCR（本地 OCR 识别）
- **向量数据库**: ChromaDB（可选，用于语义搜索）
- **文本嵌入**: sentence-transformers（可选）
- **LLM**: OpenAI 兼容 API
- **包管理**: uv（推荐）
- **代码质量**: Ruff（lint/format/check）

---

## 🏗️ 项目架构

```
lifetrace/
├── server.py                 # FastAPI 应用入口
├── config/                   # 配置文件目录
│   ├── config.yaml          # 用户配置
│   ├── default_config.yaml  # 默认配置
│   └── prompt.yaml          # LLM Prompt 模板
├── routers/                  # API 路由层
├── services/                 # 业务服务层
├── repositories/             # 数据访问层（Repository 模式）
├── schemas/                  # Pydantic 数据模型
├── storage/                  # 数据存储层（SQLAlchemy 模型）
├── llm/                      # LLM 和 AI 服务
├── jobs/                     # 后台任务
├── core/                     # 核心依赖和懒加载服务
└── util/                     # 工具函数
```

### 分层架构说明

- **Router 层**：处理 HTTP 请求，参数验证，调用 Service 层
- **Service 层**：业务逻辑，编排多个 Repository 操作
- **Repository 层**：数据访问抽象，封装数据库查询
- **Schema 层**：请求/响应的 Pydantic 模型
- **Storage 层**：SQLAlchemy ORM 模型定义

---

## 🔧 路由开发

### 创建新的 API 路由

在 `lifetrace/routers/` 目录下创建新路由：
- 使用 `APIRouter` 定义路由前缀和标签
- 遵循 RESTful API 设计规范
- 使用依赖注入获取数据库会话
- 添加完整的类型注解和文档字符串

### RESTful 路由规范

- `GET /api/{resource}` - 获取列表
- `GET /api/{resource}/{id}` - 获取单个资源
- `POST /api/{resource}` - 创建资源
- `PUT /api/{resource}/{id}` - 全量更新
- `PATCH /api/{resource}/{id}` - 部分更新
- `DELETE /api/{resource}/{id}` - 删除资源

### 注册路由

在 `server.py` 中导入并注册新路由：
- 使用 `app.include_router(xxx.router)` 注册
- 路由按功能模块组织

---

## 📦 数据模型

### Pydantic Schema 规范

在 `lifetrace/schemas/` 目录下创建数据模型：
- 使用 Pydantic v2 语法
- 区分 `Create`、`Update`、`Response` 等不同场景的模型
- 使用 `Field()` 添加验证规则和描述
- 启用 `model_config = ConfigDict(from_attributes=True)` 支持 ORM 转换

### 常用模型模式

- `{Resource}Create` - 创建时的请求体
- `{Resource}Update` - 更新时的请求体（字段通常为 Optional）
- `{Resource}Response` - API 响应格式
- `{Resource}List` - 列表响应（包含分页信息）

### SQLAlchemy 模型规范

在 `lifetrace/storage/models.py` 中定义数据库表：
- 使用 SQLAlchemy 2.x 声明式语法
- 为常用查询字段添加索引
- 使用关系（relationship）定义表关联
- 添加 `created_at` 和 `updated_at` 时间戳字段

---

## 🗄️ Repository 层

### 创建 Repository

在 `lifetrace/repositories/` 目录下创建数据访问类：
- 继承或实现 `interfaces.py` 中定义的接口
- 封装所有数据库查询逻辑
- 使用异步方法（`async def`）
- 支持参数化查询，防止 SQL 注入

### Repository 命名规范

- `sql_{resource}_repository.py` - SQL 数据库实现
- 类名使用 `{Resource}Repository` 格式

---

## 🎯 Service 层

### 创建 Service

在 `lifetrace/services/` 目录下创建业务服务：
- 实现复杂的业务逻辑
- 编排多个 Repository 操作
- 处理事务边界
- 调用外部服务（LLM、OCR 等）

### Service 规范

- 类名使用 `{Resource}Service` 格式
- 通过依赖注入获取 Repository 实例
- 业务异常使用自定义 Exception 类
- 添加详细的日志记录

---

## 🤖 LLM 服务

### LLM 客户端使用

项目使用 OpenAI 兼容 API，通过 `llm/llm_client.py` 封装：
- 支持阿里云通义千问、OpenAI、Claude 等
- 配置通过 `config/config.yaml` 的 `llm` 部分管理
- 支持流式响应（SSE）

### RAG 服务

`llm/rag_service.py` 提供检索增强生成：
- 智能时间解析（如"上周"、"昨天"）
- 混合检索策略（向量检索 + 全文检索）
- 上下文压缩和排序

### Prompt 管理

Prompt 模板统一存放在 `config/prompt.yaml`：
- 使用 YAML 格式便于维护
- 支持变量插值
- 按功能模块组织

---

## ⏰ 后台任务

### 任务调度

使用 APScheduler 管理后台任务：
- 任务定义在 `lifetrace/jobs/` 目录
- 通过 `job_manager.py` 统一管理
- 支持定时任务和间隔任务

### 任务类型

- **recorder**: 屏幕录制器，定时截图
- **ocr**: OCR 处理器，处理待识别的截图

---

## ⚙️ 配置管理

### 配置文件结构

- `config/default_config.yaml` - 默认配置（不要修改）
- `config/config.yaml` - 用户配置（覆盖默认值）
- 使用 Dynaconf 支持配置热重载

### 访问配置

通过 `util/settings.py` 中的 `settings` 对象访问：
- `settings.server.port` - 访问嵌套配置
- `settings.get("key", default)` - 带默认值访问

### 配置热重载

以下配置支持热重载（无需重启）：
- LLM 配置
- 录制配置
- OCR 配置

---

## 📝 日志记录

### 使用 Loguru

从 `util/logging_config.py` 导入 logger：
- `logger.info()` - 普通信息
- `logger.warning()` - 警告信息
- `logger.error()` - 错误信息
- `logger.debug()` - 调试信息

### 日志规范

- 关键操作必须记录日志
- 异常必须记录完整堆栈
- 敏感信息（API Key 等）必须脱敏
- 使用结构化日志便于分析

---

## 🗃️ 数据库迁移

### 使用 Alembic

项目使用 Alembic 管理数据库迁移：
- 配置文件：`alembic.ini`
- 迁移脚本：`migrations/versions/`

### 常用命令

- `alembic revision --autogenerate -m "描述"` - 生成迁移脚本
- `alembic upgrade head` - 应用所有迁移
- `alembic downgrade -1` - 回滚一个版本
- `alembic history` - 查看迁移历史

---

## 🧪 代码质量

### Ruff 检查和格式化

项目使用 Ruff 进行代码检查和格式化：
- `uv run ruff check .` - 检查代码
- `uv run ruff check --fix .` - 自动修复问题
- `uv run ruff format .` - 格式化代码

### 代码规范

- 遵循 PEP 8 风格指南
- 每行不超过 100 字符
- 单个文件不超过 500 行（警戒线 700 行）
- 单个函数不超过 50 条语句
- 圈复杂度不超过 15

---

## 🔐 错误处理

### HTTP 异常

使用 FastAPI 的 `HTTPException`：
- `400` - 请求参数错误
- `404` - 资源不存在
- `422` - 验证错误（Pydantic 自动处理）
- `500` - 服务器内部错误

### 异常处理规范

- 捕获特定异常，避免捕获所有异常
- 记录错误日志并包含上下文
- 返回用户友好的错误信息
- 敏感信息不要暴露给客户端

---

## 🚀 性能优化

### 数据库查询优化

- 使用 `selectinload` 避免 N+1 查询
- 为常用查询字段添加索引
- 使用分页限制返回数据量
- 批量操作代替循环单条操作

### 异步处理

- 使用 `async/await` 处理 I/O 操作
- 数据库查询使用异步会话
- 外部 API 调用使用异步客户端

### 懒加载

- 大型服务（向量服务、OCR）使用懒加载
- 通过 `core/lazy_services.py` 按需初始化
- 避免启动时加载所有依赖

---

## 📡 API 与前端交互

### 命名风格转换

后端使用 `snake_case`，前端使用 `camelCase`：
- 前端 fetcher 自动进行转换
- 后端 Schema 统一使用 `snake_case`
- OpenAPI Schema 由 FastAPI 自动生成

### 前端代码生成

前端使用 Orval 根据 OpenAPI Schema 自动生成 API 代码：
- 后端 API 变更后，前端运行 `pnpm orval` 重新生成
- 确保 OpenAPI Schema 完整且准确

---

## 📋 依赖管理

### 使用 uv

项目使用 uv 作为包管理器：
- `uv sync` - 同步依赖
- `uv add <package>` - 添加依赖
- `uv remove <package>` - 移除依赖
- `uv run <command>` - 在虚拟环境中运行命令

### 依赖分组

- 主依赖：`pyproject.toml` 的 `dependencies`
- 开发依赖：`dependency-groups.dev`
- 可选依赖：`dependency-groups.vector`（向量搜索功能）

---

## 🔍 调试和排查

### 启动开发服务器

- `python -m lifetrace.server` - 直接启动
- `uvicorn lifetrace.server:app --reload` - 热重载模式

### API 文档

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`

### 日志查看

- 日志文件位于 `lifetrace/data/logs/`
- 通过 API 查看：`GET /api/logs`
- 调整日志级别：修改 `config/config.yaml` 的 `logging.level`

---

## ✅ 代码检查清单

在提交代码前，请确保：

- [ ] 代码遵循 PEP 8 风格指南
- [ ] 运行 `uv run ruff check .` 没有错误
- [ ] 运行 `uv run ruff format .` 格式化代码
- [ ] 所有函数和类都有类型注解
- [ ] 所有公共函数和类都有文档字符串
- [ ] 添加了适当的错误处理
- [ ] 使用了参数化查询防止 SQL 注入
- [ ] 添加了必要的日志记录
- [ ] 更新了相关文档
- [ ] API 变更已在 OpenAPI Schema 中反映
