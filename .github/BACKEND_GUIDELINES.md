# Backend Development Guidelines

**Language**: [English](BACKEND_GUIDELINES.md) | [中文](BACKEND_GUIDELINES_CN.md)

## 🐍 Python Backend Development Standards

This document details the development standards and best practices for the LifeTrace project backend (Python + FastAPI).

## 📋 Table of Contents

- [Code Style](#-code-style)
- [Project Structure](#️-project-structure)
- [Naming Conventions](#-naming-conventions)
- [Type Annotations](#-type-annotations)
- [Docstrings](#-docstrings)
- [Error Handling](#-error-handling)
- [API Design](#-api-design)
- [Database Operations](#-database-operations)
- [Testing](#-testing)
- [Logging](#-logging)
- [Performance](#-performance)
- [Security](#-security)

## 🎨 Code Style

### PEP 8 Standard

We follow the [PEP 8](https://peps.python.org/pep-0008/) Python code style guide.

### Using Ruff

The project uses [Ruff](https://github.com/astral-sh/ruff) as the linter and formatter.

```bash
# Check code
uv run ruff check .

# Auto-fix issues
uv run ruff check --fix .

# Format code
uv run ruff format .
```

### Basic Rules

#### Indentation

```python
# ✅ Correct: Use 4 spaces
def my_function():
    if condition:
        do_something()

# ❌ Wrong: Use tabs
def my_function():
	if condition:
		do_something()
```

#### Line Length

```python
# ✅ Correct: Maximum 100 characters per line
def calculate_result(
    param1: int, param2: str, param3: float
) -> dict[str, Any]:
    return {"result": param1}

# ❌ Wrong: Line too long
def calculate_result(param1: int, param2: str, param3: float, param4: dict, param5: list) -> dict[str, Any]:
    return {"result": param1}
```

#### File Length Limits

To maintain code maintainability and readability, we provide the following guidelines for Python file length:

**Code Length Guidelines**:

- **Recommended Standard**: Keep single files under **500 lines**
- **Warning Threshold**: Consider refactoring when exceeding **700 lines**
- **Review Required**: Files over **1000 lines** must include justification and refactoring plan in PR

**Refactoring Guidelines**:

- Single function should not exceed **50 statements**
- Single class should not exceed **400 lines**
- Cyclomatic complexity must not exceed **15**
- Prioritize functional cohesion over strict line count limits

```python
# ✅ Correct: Moderate file length (~450 lines)
# task_service.py
class TaskService:
    """Task service containing complete task business logic."""

    def create_task(self, data: dict) -> Task:
        """Create a task."""
        pass

    def update_task(self, task_id: int, data: dict) -> Task:
        """Update a task."""
        pass

    # ... other related methods

# ⚠️ Needs Review: Files over 1000 lines
# complex_processor.py (1200 lines)
# PR must explain:
# 1. Why is this file so long?
# 2. Can it be split? How?
# 3. If not, what's the refactoring plan?

# ❌ Wrong: Function too complex (over 50 statements)
def process_data(data):
    # ... 100 lines of code
    pass
```

**When to Split Files**:

1. **Multiple Responsibilities**: A file handles multiple unrelated responsibilities

   ```text
   # Before: user_operations.py (800 lines)
   # Contains: user management, permissions, data export, email notifications

   # After:
   users/
   ├── manager.py          # User management
   ├── permissions.py      # Permission validation
   ├── export_service.py   # Data export
   └── notifications.py    # Email notifications
   ```

2. **Large Classes**: A single class exceeds 400 lines

   ```text
   # Before: task_handler.py (600 lines)
   class TaskHandler:
       # Contains: CRUD, validation, statistics, reporting

   # After:
   tasks/
   ├── manager.py      # TaskManager - CRUD operations
   ├── validator.py    # TaskValidator - Data validation
   ├── stats.py        # TaskStats - Statistics
   └── reporter.py     # TaskReporter - Report generation
   ```

3. **Long Functions**: A single function exceeds 50 statements, extract sub-functions

   ```python
   # ❌ Wrong: Function too long
   def process_order(order_data):
       # Validate data (20 lines)
       # Calculate price (30 lines)
       # Create order (25 lines)
       # Send notification (15 lines)
       pass  # Total 90 lines

   # ✅ Correct: Split into multiple functions
   def process_order(order_data):
       validated_data = validate_order_data(order_data)
       price = calculate_order_price(validated_data)
       order = create_order(validated_data, price)
       send_order_notification(order)
       return order
   ```

#### Imports

```python
# ✅ Correct: Import order and grouping
# 1. Standard library imports
import os
import sys
from datetime import datetime
from typing import Any, Optional

# 2. Third-party library imports
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

# 3. Local application/library imports
from lifetrace.storage.database import get_db
from lifetrace.schemas.task import TaskCreate, TaskResponse

# ❌ Wrong: Mixed import order
from lifetrace.storage.database import get_db
import os
from fastapi import APIRouter
```

#### Quotes

```python
# ✅ Correct: Use double quotes
message = "Hello, World!"
query = "SELECT * FROM users"

# ✅ Correct: Triple quotes for docstrings
description = """
This is a multi-line string.
"""
```

## 🏗️ Project Structure

### Directory Organization

```
lifetrace/
├── routers/           # API routes
├── schemas/           # Pydantic models (data validation)
├── storage/           # Data storage layer
│   ├── models.py      # SQLAlchemy models (database tables)
│   └── *_manager.py   # Data managers
├── llm/              # LLM and AI services
├── jobs/             # Background tasks
├── util/             # Utility functions
└── server.py         # Application entry
```

## 📝 Naming Conventions

### Variables and Functions

```python
# ✅ Correct: snake_case
user_name = "Alice"
user_age = 25

def get_user_profile(user_id: int):
    pass

# ❌ Wrong: camelCase
userName = "Alice"

def getUserProfile(userId: int):
    pass
```

### Classes

```python
# ✅ Correct: PascalCase
class UserManager:
    pass

class TaskScheduler:
    pass

# ❌ Wrong: snake_case
class user_manager:
    pass
```

### Constants

```python
# ✅ Correct: UPPER_CASE
MAX_RETRY_COUNT = 3
DEFAULT_TIMEOUT = 30
API_BASE_URL = "https://api.example.com"

# ❌ Wrong: lowercase
max_retry_count = 3
```

## 🔤 Type Annotations

### Basic Type Annotations

```python
# ✅ Correct: Add type annotations
def greet(name: str) -> str:
    return f"Hello, {name}!"

def add_numbers(a: int, b: int) -> int:
    return a + b

def get_user(user_id: int) -> dict | None:
    return None

# ❌ Wrong: No type annotations
def greet(name):
    return f"Hello, {name}!"
```

### Collection Types

```python
# Python 3.9+: Use built-in types
def process_items(items: list[str]) -> dict[str, int]:
    return {item: len(item) for item in items}

# Type aliases
from typing import TypeAlias

UserID: TypeAlias = int
UserData: TypeAlias = dict[str, Any]

def get_user_data(user_id: UserID) -> UserData:
    return {"id": user_id, "name": "Alice"}
```

### Pydantic Models

```python
from pydantic import BaseModel, Field

class User(BaseModel):
    """User model."""
    id: int
    name: str = Field(..., min_length=1, max_length=100)
    email: str
    age: Optional[int] = Field(None, ge=0, le=150)
    is_active: bool = True

    class Config:
        from_attributes = True
```

## 📚 Docstrings

### Function Docstrings

```python
def create_task(
    title: str,
    description: str | None = None,
    project_id: int | None = None
) -> Task:
    """
    Create a new task.

    Args:
        title: Task title, required and non-empty
        description: Task description, optional
        project_id: Associated project ID, optional

    Returns:
        Task: Created task object

    Raises:
        ValueError: If title is empty
        DatabaseError: If database operation fails

    Example:
        >>> task = create_task("Complete docs", "Write API docs", 1)
        >>> print(task.title)
        Complete docs
    """
    if not title:
        raise ValueError("Task title cannot be empty")

    # Implementation...
    return task
```

### Class Docstrings

```python
class TaskManager:
    """
    Task manager.

    Provides CRUD operations and advanced query functionality for tasks.

    Attributes:
        db: Database session object
        logger: Logger instance

    Example:
        >>> manager = TaskManager(db_session)
        >>> task = await manager.create_task(task_data)
    """

    def __init__(self, db: AsyncSession):
        """
        Initialize task manager.

        Args:
            db: Async database session
        """
        self.db = db
```

## 🚨 Error Handling

### Exception Handling

```python
from fastapi import HTTPException

# ✅ Correct: Catch specific exceptions
async def get_task(task_id: int) -> Task:
    try:
        task = await task_manager.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        return task
    except DatabaseError as e:
        logger.error(f"Database error: {e}")
        raise HTTPException(status_code=500, detail="Database operation failed")

# ❌ Wrong: Catch all exceptions
async def get_task(task_id: int) -> Task:
    try:
        task = await task_manager.get_task(task_id)
        return task
    except Exception as e:  # Too broad
        raise HTTPException(status_code=500, detail="Error occurred")
```

## 🌐 API Design

### RESTful API Standards

```python
from fastapi import APIRouter, Depends, Query, Path

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# ✅ Correct: RESTful route design
@router.get("/", response_model=list[TaskResponse])
async def list_tasks(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    status: Optional[str] = Query(None)
):
    """List tasks."""
    pass

@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(task_id: int = Path(..., gt=0)):
    """Get specific task."""
    pass

@router.post("/", response_model=TaskResponse, status_code=201)
async def create_task(task: TaskCreate):
    """Create new task."""
    pass

@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: int = Path(..., gt=0),
    task: TaskUpdate = None
):
    """Update task."""
    pass

@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: int = Path(..., gt=0)):
    """Delete task."""
    pass
```

## 💾 Database Operations

### SQLAlchemy Models

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship

class Task(Base):
    """Task model."""
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="pending", index=True)
    priority = Column(Integer, nullable=False, default=0)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="tasks")
```

### Database Queries

```python
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

class TaskManager:
    """Task manager."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_task(self, task_id: int) -> Task | None:
        """Get single task."""
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
        """Get task list."""
        query = select(Task)

        if status:
            query = query.where(Task.status == status)

        query = query.offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())
```

## 🧪 Testing

### Unit Tests

```python
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from lifetrace.schemas.task import TaskCreate
from lifetrace.storage.task_manager import TaskManager

@pytest.mark.asyncio
async def test_create_task(db_session: AsyncSession):
    """Test task creation."""
    manager = TaskManager(db_session)
    task_data = TaskCreate(title="Test Task")

    task = await manager.create_task(task_data)

    assert task.id is not None
    assert task.title == "Test Task"
    assert task.status == "pending"
```

## 📊 Logging

```python
from loguru import logger

class TaskManager:
    """Task manager."""

    async def create_task(self, task_data: TaskCreate) -> Task:
        """Create task."""
        logger.info(f"Creating task: {task_data.title}")

        try:
            task = Task(**task_data.model_dump())
            self.db.add(task)
            await self.db.commit()
            await self.db.refresh(task)

            logger.info(f"Task created successfully: ID={task.id}")
            return task

        except Exception as e:
            logger.error(f"Failed to create task: {e}")
            await self.db.rollback()
            raise
```

## ⚡ Performance

### Query Optimization

```python
# ✅ Correct: Use eager loading
from sqlalchemy.orm import selectinload

async def get_tasks_with_projects(self) -> list[Task]:
    """Get tasks with their associated projects."""
    result = await self.db.execute(
        select(Task).options(selectinload(Task.project))
    )
    return list(result.scalars().all())

# ✅ Correct: Batch insert
async def create_tasks_batch(self, tasks_data: list[TaskCreate]) -> list[Task]:
    """Create multiple tasks."""
    tasks = [Task(**data.model_dump()) for data in tasks_data]
    self.db.add_all(tasks)
    await self.db.commit()
    return tasks
```

## 🔒 Security

### Input Validation

```python
# ✅ Correct: Use Pydantic for validation
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)

    @validator("title")
    def validate_title(cls, v):
        if "<script>" in v.lower():
            raise ValueError("Title contains illegal characters")
        return v
```

### SQL Injection Prevention

```python
# ✅ Correct: Use parameterized queries (SQLAlchemy handles this)
task = await self.db.execute(
    select(Task).where(Task.id == task_id)
)

# ❌ Wrong: String concatenation (vulnerable to SQL injection)
query = f"SELECT * FROM tasks WHERE id = {task_id}"
```

## ✅ Code Review Checklist

Before submitting code, ensure:

- [ ] Code follows PEP 8 style guide
- [ ] `uv run ruff check .` passes with no errors
- [ ] `uv run ruff format .` applied
- [ ] All functions have type annotations
- [ ] Public functions have docstrings
- [ ] Proper error handling added
- [ ] Parameterized queries used (no SQL injection)
- [ ] Appropriate logging added
- [ ] Unit tests written
- [ ] Tests pass
- [ ] Documentation updated

---

Happy Coding! 🐍
