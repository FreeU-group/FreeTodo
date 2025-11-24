# 后端开发规范

**语言**: [English](BACKEND_GUIDELINES.md) | [中文](BACKEND_GUIDELINES_CN.md)

## 🐍 Python 后端开发规范

本文档详细说明了 LifeTrace 项目后端（Python + FastAPI）的开发规范和最佳实践。

## 📋 目录

- [代码风格](#-代码风格)
- [项目结构](#️-项目结构)
- [命名规范](#-命名规范)
- [类型注解](#-类型注解)
- [文档字符串](#-文档字符串)
- [错误处理](#-错误处理)
- [API 设计](#-api-设计)
- [数据库操作](#-数据库操作)
- [测试](#-测试)
- [日志记录](#-日志记录)
- [性能优化](#-性能优化)
- [安全性](#-安全性)

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

## 🏗️ 项目结构

### 目录组织

```
lifetrace/
├── routers/           # API 路由
├── schemas/           # Pydantic 模型（数据验证）
├── storage/           # 数据存储层
│   ├── models.py      # SQLAlchemy 模型（数据库表）
│   └── *_manager.py   # 数据管理器
├── llm/              # LLM 和 AI 服务
├── jobs/             # 后台任务
├── util/             # 工具函数
└── server.py         # 应用入口
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

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# ✅ 正确：RESTful 路由设计
@router.get("/", response_model=list[TaskResponse])
async def list_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = Query(None)
):
    """获取任务列表。"""
    pass

@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int = Path(..., gt=0)):
    """获取指定任务。"""
    pass

@router.post("/", response_model=TaskResponse, status_code=201)
async def create_task(task: TaskCreate):
    """创建新任务。"""
    pass

@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int = Path(..., gt=0),
    task: TaskUpdate = None
):
    """更新任务。"""
    pass

@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: int = Path(..., gt=0)):
    """删除任务。"""
    pass
```

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

### 数据库查询

```python
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

class TaskManager:
    """任务管理器。"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_task(self, task_id: int) -> Task | None:
        """获取单个任务。"""
        result = await self.db.execute(
            select(Task).where(Task.id == task_id)
        )
        return result.scalar_one_or_none()

    async def list_tasks(
        self,
        skip: int = 0,
        limit: int = 10,
        status: str | None = None
    ) -> list[Task]:
        """获取任务列表。"""
        query = select(Task)

        if status:
            query = query.where(Task.status == status)

        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())
```

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

## 📊 日志记录

```python
from loguru import logger

class TaskManager:
    """任务管理器。"""

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
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)

    @validator("title")
    def validate_title(cls, v):
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

---

Happy Coding! 🐍
