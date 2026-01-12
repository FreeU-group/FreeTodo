# 后端开发规范

**语言**: [English](BACKEND_GUIDELINES.md) | [中文](BACKEND_GUIDELINES_CN.md)

## 🐍 Python 后端开发规范

本文档详细说明了 LifeTrace 项目后端（Python + FastAPI）的开发规范和最佳实践。

### 技术栈

- **框架**: FastAPI + Uvicorn（异步 Web 框架）
- **语言**: Python 3.12
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

## 📋 目录

- [代码风格](#-代码风格)
- [项目架构](#️-项目架构)
- [项目结构](#️-项目结构)
- [命名规范](#-命名规范)
- [类型注解](#-类型注解)
- [文档字符串](#-文档字符串)
- [错误处理](#-错误处理)
- [API 设计](#-api-设计)
- [分层架构](#-分层架构)
- [数据库操作](#-数据库操作)
- [配置管理](#-配置管理)
- [LLM 服务](#-llm-服务)
- [后台任务](#-后台任务)
- [测试](#-测试)
- [日志记录](#-日志记录)
- [性能优化](#-性能优化)
- [安全性](#-安全性)
- [API 与前端交互](#-api-与前端交互)
- [依赖管理](#-依赖管理)

## 🎨 代码风格

### PEP 8 标准

我们遵循 [PEP 8](https://peps.python.org/pep-0008/) Python 代码风格指南。

### 使用 Ruff

项目使用 [Ruff](https://github.com/astral-sh/ruff) 作为代码检查器和格式化工具。

```bash
# 检查代码
uv run ruff check .

# 自动修复问题
uv run ruff check --fix .

# 格式化代码
uv run ruff format .
```

### 基本规则

#### 缩进和空格

```python
# ✅ 正确：使用 4 个空格缩进
def my_function():
    if condition:
        do_something()

# ❌ 错误：使用 Tab 缩进
def my_function():
	if condition:
		do_something()
```

#### 行长度

```python
# ✅ 正确：每行不超过 100 字符
def calculate_result(
    param1: int, param2: str, param3: float
) -> dict[str, Any]:
    return {"result": param1}

# ❌ 错误：行太长
def calculate_result(param1: int, param2: str, param3: float, param4: dict, param5: list) -> dict[str, Any]:
    return {"result": param1}
```

#### 文件长度限制

为了保持代码的可维护性和可读性，我们对单个 Python 文件的行数提供以下指导原则：

**代码长度指导原则**：

- **推荐标准**：单个文件保持在 **500 行**以内
- **警戒线**：超过 **700 行**时应考虑拆分
- **必须审查**：超过 **1000 行**的文件需在 PR 中说明理由，并提供重构计划

**拆分建议**：

- 单个函数不超过 **50 条语句**
- 单个类不超过 **400 行**
- 圈复杂度不超过 **15**
- 优先考虑功能内聚性，而不是强制行数限制

```python
# ✅ 正确：适度的文件长度（约 450 行）
# task_service.py
class TaskService:
    """任务服务，包含完整的任务业务逻辑。"""

    def create_task(self, data: dict) -> Task:
        """创建任务。"""
        pass

    def update_task(self, task_id: int, data: dict) -> Task:
        """更新任务。"""
        pass

    # ... 其他相关方法

# ⚠️ 需要审查：超过 1000 行的文件
# complex_processor.py (1200 行)
# 在 PR 中需要说明：
# 1. 为什么这个文件这么长？
# 2. 是否可以拆分？如何拆分？
# 3. 如果不能拆分，有什么重构计划？

# ❌ 错误：函数过于复杂（超过 50 条语句）
def process_data(data):
    # ... 100 行代码
    pass
```

**何时需要拆分文件**：

1. **文件职责过多**：一个文件承担了多个不相关的职责

   ```text
   # 拆分前：user_operations.py (800 行)
   # 包含：用户管理、权限验证、数据导出、邮件通知

   # 拆分后：
   users/
   ├── manager.py          # 用户管理
   ├── permissions.py      # 权限验证
   ├── export_service.py   # 数据导出
   └── notifications.py    # 邮件通知
   ```

2. **类过大**：单个类的代码行数超过 400 行

   ```text
   # 拆分前：task_handler.py (600 行)
   class TaskHandler:
       # 包含：CRUD、验证、统计、报表生成

   # 拆分后：
   tasks/
   ├── manager.py      # TaskManager - CRUD 操作
   ├── validator.py    # TaskValidator - 数据验证
   ├── stats.py        # TaskStats - 统计功能
   └── reporter.py     # TaskReporter - 报表生成
   ```

3. **函数过长**：单个函数超过 50 条语句，应该提取子函数

   ```python
   # ❌ 错误：函数过长
   def process_order(order_data):
       # 验证数据（20 行）
       # 计算价格（30 行）
       # 创建订单（25 行）
       # 发送通知（15 行）
       pass  # 总共 90 行

   # ✅ 正确：拆分为多个函数
   def process_order(order_data):
       validated_data = validate_order_data(order_data)
       price = calculate_order_price(validated_data)
       order = create_order(validated_data, price)
       send_order_notification(order)
       return order
   ```

#### 导入语句

```python
# ✅ 正确：导入顺序和分组
# 1. 标准库导入
import os
import sys
from datetime import datetime
from typing import Any, Optional

# 2. 第三方库导入
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

# 3. 本地应用/库导入
from lifetrace.storage.database import get_db
from lifetrace.schemas.task import TaskCreate, TaskResponse

# ❌ 错误：混乱的导入顺序
from lifetrace.storage.database import get_db
import os
from fastapi import APIRouter
```

#### 引号

```python
# ✅ 正确：使用双引号
message = "Hello, World!"
query = "SELECT * FROM users WHERE id = ?"

# ✅ 正确：三引号用于多行字符串和文档字符串
description = """
这是一个多行字符串，
包含多行内容。
"""
```

## 🏗️ 项目架构

### 分层架构

项目采用分层架构模式：

```
路由层 (routers/)     → HTTP 请求处理，参数验证
    ↓
服务层 (services/)   → 业务逻辑，编排多个 Repository 操作
    ↓
仓储层 (repositories/) → 数据访问抽象，封装数据库查询
    ↓
存储层 (storage/)    → SQLAlchemy ORM 模型定义
```

**层级职责**：

- **路由层**: 处理 HTTP 请求，参数验证，调用服务层
- **服务层**: 业务逻辑，编排多个仓储层操作
- **仓储层**: 数据访问抽象，封装数据库查询
- **模型层**: 请求/响应的 Pydantic 模型
- **存储层**: SQLAlchemy ORM 模型定义

## 🏗️ 项目结构

### 目录组织

```
lifetrace/
├── server.py                 # FastAPI 应用入口
├── config/                   # 配置文件目录
│   ├── config.yaml          # 用户配置
│   ├── default_config.yaml  # 默认配置
│   └── prompt.yaml          # LLM Prompt 模板
├── routers/                  # API 路由（路由层）
├── services/                 # 业务服务（服务层）
├── repositories/             # 数据访问（仓储层）
├── schemas/                  # Pydantic 数据模型
├── storage/                  # 数据存储层
│   ├── models.py            # SQLAlchemy 模型（数据库表）
│   └── *_manager.py         # 数据管理器
├── llm/                      # LLM 和 AI 服务
├── jobs/                     # 后台任务
├── core/                     # 核心依赖和懒加载服务
└── util/                     # 工具函数
```

## 📝 命名规范

### 变量和函数

```python
# ✅ 正确：小写字母和下划线（snake_case）
user_name = "Alice"
user_age = 25

def get_user_profile(user_id: int):
    pass

# ❌ 错误：使用驼峰命名
userName = "Alice"

def getUserProfile(userId: int):
    pass
```

### 类

```python
# ✅ 正确：驼峰命名（PascalCase）
class UserManager:
    pass

class TaskScheduler:
    pass

# ❌ 错误：使用下划线
class user_manager:
    pass
```

### 常量

```python
# ✅ 正确：全大写字母和下划线
MAX_RETRY_COUNT = 3
DEFAULT_TIMEOUT = 30
API_BASE_URL = "https://api.example.com"

# ❌ 错误：使用小写
max_retry_count = 3
```

## 🔤 类型注解

### 基本类型注解

```python
from typing import Any, Optional

# ✅ 正确：为所有函数参数和返回值添加类型注解
def greet(name: str) -> str:
    return f"Hello, {name}!"

def add_numbers(a: int, b: int) -> int:
    return a + b

def get_user(user_id: int) -> dict | None:
    return None

# ❌ 错误：没有类型注解
def greet(name):
    return f"Hello, {name}!"
```

### 集合类型

```python
# Python 3.9+：使用内置类型
def process_items(items: list[str]) -> dict[str, int]:
    return {item: len(item) for item in items}

# ✅ 正确：为复杂类型使用类型别名
from typing import TypeAlias

UserID: TypeAlias = int
UserData: TypeAlias = dict[str, Any]

def get_user_data(user_id: UserID) -> UserData:
    return {"id": user_id, "name": "Alice"}
```

### Pydantic 模型

```python
from pydantic import BaseModel, Field

class User(BaseModel):
    """用户模型。"""
    id: int
    name: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    age: Optional[int] = Field(None, ge=0, le=150)
    is_active: bool = True

    class Config:
        from_attributes = True
```

## 📚 文档字符串

### 函数文档字符串

```python
def create_task(
    title: str,
    description: str | None = None,
    project_id: int | None = None
) -> Task:
    """
    创建新任务。

    Args:
        title: 任务标题，必填且不能为空
        description: 任务描述，可选
        project_id: 关联的项目 ID，可选

    Returns:
        Task: 创建的任务对象

    Raises:
        ValueError: 如果标题为空
        DatabaseError: 如果数据库操作失败

    Example:
        >>> task = create_task("完成文档", "编写 API 文档", 1)
        >>> print(task.title)
        完成文档
    """
    if not title:
        raise ValueError("任务标题不能为空")

    # 实现逻辑...
    return task
```

### 类文档字符串

```python
class TaskManager:
    """
    任务管理器。

    提供任务的 CRUD 操作和高级查询功能。

    Attributes:
        db: 数据库会话对象
        logger: 日志记录器

    Example:
        >>> manager = TaskManager(db_session)
        >>> task = await manager.create_task(task_data)
    """

    def __init__(self, db: AsyncSession):
        """
        初始化任务管理器。

        Args:
            db: 异步数据库会话
        """
        self.db = db
```

## 🚨 错误处理

### 异常处理

```python
from fastapi import HTTPException

# ✅ 正确：捕获特定异常
async def get_task(task_id: int) -> Task:
    try:
        task = await task_manager.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="任务不存在")
        return task
    except DatabaseError as e:
        logger.error(f"数据库错误: {e}")
        raise HTTPException(status_code=500, detail="数据库操作失败")
    except ValidationError as e:
        logger.warning(f"验证错误: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# ❌ 错误：捕获所有异常
async def get_task(task_id: int) -> Task:
    try:
        task = await task_manager.get_task(task_id)
        return task
    except Exception as e:  # 太宽泛
        raise HTTPException(status_code=500, detail="发生错误")
```

## 🌐 API 设计

### RESTful API 规范

```python
from fastapi import APIRouter, Depends, Query, Path
from lifetrace.repositories.task_repository import TaskRepository
from lifetrace.services.task_service import TaskService

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# ✅ 正确：RESTful 路由设计
@router.get("/", response_model=list[TaskResponse])
async def list_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = Query(None),
    task_service: TaskService = Depends(get_task_service)
):
    """获取任务列表。"""
    return await task_service.list_tasks(skip=skip, limit=limit, status=status)

@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: int = Path(..., gt=0),
    task_service: TaskService = Depends(get_task_service)
):
    """获取指定任务。"""
    return await task_service.get_task(task_id)

@router.post("/", response_model=TaskResponse, status_code=201)
async def create_task(
    task: TaskCreate,
    task_service: TaskService = Depends(get_task_service)
):
    """创建新任务。"""
    return await task_service.create_task(task)

@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int = Path(..., gt=0),
    task: TaskUpdate = None,
    task_service: TaskService = Depends(get_task_service)
):
    """更新任务。"""
    return await task_service.update_task(task_id, task)

@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: int = Path(..., gt=0),
    task_service: TaskService = Depends(get_task_service)
):
    """删除任务。"""
    await task_service.delete_task(task_id)
```

### 注册路由

在 `server.py` 中导入并注册新路由：

```python
from lifetrace.routers import tasks

app.include_router(tasks.router)
```

## 🏛️ 分层架构

### 路由层

处理 HTTP 请求，参数验证，调用服务层：

```python
# routers/tasks.py
from fastapi import APIRouter, Depends
from lifetrace.services.task_service import TaskService

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

@router.get("/", response_model=list[TaskResponse])
async def list_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    task_service: TaskService = Depends(get_task_service)
):
    """获取任务列表。"""
    return await task_service.list_tasks(skip=skip, limit=limit)
```

### 服务层

实现复杂的业务逻辑，编排多个仓储层操作：

```python
# services/task_service.py
from lifetrace.repositories.task_repository import TaskRepository
from lifetrace.schemas.task import TaskCreate, TaskUpdate

class TaskService:
    """任务服务。"""

    def __init__(self, task_repository: TaskRepository):
        self.task_repository = task_repository

    async def create_task(self, task_data: TaskCreate) -> Task:
        """创建任务（包含业务逻辑）。"""
        # 业务验证
        if len(task_data.title) > 200:
            raise ValueError("任务标题过长")

        # 编排仓储层操作
        return await self.task_repository.create(task_data)
```

### 仓储层

数据访问抽象，封装数据库查询：

```python
# repositories/task_repository.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from lifetrace.storage.models import Task

class TaskRepository:
    """任务仓储。"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, task_id: int) -> Task | None:
        """根据 ID 获取任务。"""
        result = await self.db.execute(
            select(Task).where(Task.id == task_id)
        )
        return result.scalar_one_or_none()

    async def create(self, task_data: TaskCreate) -> Task:
        """创建任务。"""
        task = Task(**task_data.model_dump())
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)
        return task
```

## ⚙️ 配置管理

### 配置文件结构

- `config/default_config.yaml` - 默认配置（不要修改）
- `config/config.yaml` - 用户配置（覆盖默认值）
- 使用 Dynaconf 支持配置热重载

### 访问配置

通过 `util/settings.py` 中的 `settings` 对象访问：

```python
from lifetrace.util.settings import settings

# 访问嵌套配置
port = settings.server.port

# 带默认值访问
timeout = settings.get("timeout", default=30)
```

### 配置热重载

以下配置支持热重载（无需重启）：
- LLM 配置
- 录制配置
- OCR 配置

## 💾 数据库操作

### SQLAlchemy 模型

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

class Task(Base):
    """任务模型。"""
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="pending", index=True)
    priority = Column(Integer, nullable=False, default=0)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    project = relationship("Project", back_populates="tasks")
```

### 数据库迁移

项目使用 Alembic 管理数据库迁移：

- **配置文件**: `alembic.ini`
- **迁移脚本**: `migrations/versions/`

**常用命令**:
- `alembic revision --autogenerate -m "描述"` - 生成迁移脚本
- `alembic upgrade head` - 应用所有迁移
- `alembic downgrade -1` - 回滚一个版本
- `alembic history` - 查看迁移历史

### 数据库查询

使用仓储层进行数据库查询（参见[仓储层](#-仓储层)部分）。

## 🧪 测试

### 单元测试

```python
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from lifetrace.schemas.task import TaskCreate
from lifetrace.storage.task_manager import TaskManager

@pytest.mark.asyncio
async def test_create_task(db_session: AsyncSession):
    """测试创建任务。"""
    manager = TaskManager(db_session)
    task_data = TaskCreate(title="测试任务")

    task = await manager.create_task(task_data)

    assert task.id is not None
    assert task.title == "测试任务"
    assert task.status == "pending"
```

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

## ⏰ 后台任务

### 任务调度

使用 APScheduler 管理后台任务：

- 任务定义在 `lifetrace/jobs/` 目录
- 通过 `job_manager.py` 统一管理
- 支持定时任务和间隔任务

### 任务类型

- **recorder**: 屏幕录制器，定时截图
- **ocr**: OCR 处理器，处理待识别的截图

## 📊 日志记录

使用 Loguru，从 `util/logging_config.py` 导入 logger：

```python
from lifetrace.util.logging_config import logger

class TaskService:
    """任务服务。"""

    async def create_task(self, task_data: TaskCreate) -> Task:
        """创建任务。"""
        logger.info(f"创建任务: {task_data.title}")

        try:
            task = Task(**task_data.model_dump())
            self.db.add(task)
            await self.db.commit()
            await self.db.refresh(task)

            logger.info(f"任务创建成功: ID={task.id}")
            return task

        except Exception as e:
            logger.error(f"创建任务失败: {e}")
            await self.db.rollback()
            raise
```

### 日志规范

- 关键操作必须记录日志
- 异常必须记录完整堆栈
- 敏感信息（API Key 等）必须脱敏
- 使用结构化日志便于分析

## ⚡ 性能优化

### 数据库查询优化

```python
# ✅ 正确：使用 eager loading 避免 N+1 查询
from sqlalchemy.orm import selectinload

async def get_tasks_with_projects(self) -> list[Task]:
    """获取任务及其关联的项目。"""
    result = await self.db.execute(
        select(Task).options(selectinload(Task.project))
    )
    return list(result.scalars().all())

# ✅ 正确：批量插入
async def create_tasks_batch(self, tasks_data: list[TaskCreate]) -> list[Task]:
    """批量创建任务。"""
    tasks = [Task(**data.model_dump()) for data in tasks_data]
    self.db.add_all(tasks)
    await self.db.commit()
    return tasks
```

## 🔒 安全性

### 输入验证

```python
# ✅ 正确：使用 Pydantic 验证输入
from pydantic import BaseModel, Field, field_validator

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        # 防止 XSS
        if "<script>" in v.lower():
            raise ValueError("标题包含非法字符")
        return v
```

### SQL 注入防护

```python
# ✅ 正确：使用参数化查询（SQLAlchemy 自动处理）
task = await self.db.execute(
    select(Task).where(Task.id == task_id)
)

# ❌ 错误：字符串拼接（容易受到 SQL 注入攻击）
query = f"SELECT * FROM tasks WHERE id = {task_id}"
```

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

## 📦 依赖管理

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
- [ ] 编写了单元测试
- [ ] 测试通过
- [ ] 更新了相关文档
- [ ] API 变更已在 OpenAPI Schema 中反映
- [ ] 遵循分层架构（Router → Service → Repository）
- [ ] 配置支持热重载（如适用）
- [ ] 后台任务已正确调度

---

Happy Coding! 🐍
