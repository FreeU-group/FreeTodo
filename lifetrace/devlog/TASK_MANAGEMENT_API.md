# 任务管理 API 文档

本文档描述了 LifeTrace 任务管理功能的后端 API 实现。

## 数据库设计

### tasks 表结构

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 任务ID（主键，自增） |
| project_id | INTEGER | 项目ID（外键，关联 projects 表） |
| name | VARCHAR(200) | 任务名称（必填） |
| description | TEXT | 任务描述（可选） |
| status | VARCHAR(20) | 任务状态（pending, in_progress, completed, cancelled） |
| parent_task_id | INTEGER | 父任务ID（外键，自关联，用于子任务） |
| created_at | DATETIME | 创建时间（自动生成） |
| updated_at | DATETIME | 更新时间（自动更新） |

### 任务状态说明

- `pending`: 待处理
- `in_progress`: 进行中
- `completed`: 已完成
- `cancelled`: 已取消

## API 端点

### 1. 创建任务

**端点**: `POST /api/projects/{project_id}/tasks`

**请求体**:
```json
{
  "name": "任务名称",
  "description": "任务描述",
  "status": "pending",
  "parent_task_id": null
}
```

**响应**: HTTP 201 Created
```json
{
  "id": 1,
  "project_id": 5,
  "name": "需求分析",
  "description": "分析项目需求",
  "status": "in_progress",
  "parent_task_id": null,
  "created_at": "2025-11-08T17:15:12.089500",
  "updated_at": "2025-11-08T17:15:12.089503"
}
```

**示例**:
```bash
# 创建主任务
curl -X POST "http://127.0.0.1:8000/api/projects/5/tasks" \
  -H "Content-Type: application/json" \
  -d '{"name": "需求分析", "description": "分析项目需求", "status": "in_progress"}'

# 创建子任务
curl -X POST "http://127.0.0.1:8000/api/projects/5/tasks" \
  -H "Content-Type: application/json" \
  -d '{"name": "收集用户需求", "description": "与客户沟通收集需求", "status": "pending", "parent_task_id": 1}'
```

### 2. 获取项目的所有任务

**端点**: `GET /api/projects/{project_id}/tasks`

**查询参数**:
- `limit` (可选): 返回数量限制（默认100，最大1000）
- `offset` (可选): 偏移量（默认0）
- `parent_task_id` (可选): 父任务ID（获取特定任务的子任务）
- `include_subtasks` (可选): 是否包含所有子任务（默认true）

**响应**: HTTP 200 OK
```json
{
  "total": 4,
  "tasks": [
    {
      "id": 1,
      "project_id": 5,
      "name": "需求分析",
      "description": "分析项目需求",
      "status": "in_progress",
      "parent_task_id": null,
      "created_at": "2025-11-08T17:15:12.089500",
      "updated_at": "2025-11-08T17:15:12.089503"
    },
    {
      "id": 3,
      "project_id": 5,
      "name": "收集用户需求",
      "description": "与客户沟通收集需求",
      "status": "completed",
      "parent_task_id": 1,
      "created_at": "2025-11-08T17:15:23.767893",
      "updated_at": "2025-11-08T17:15:23.767898"
    }
  ]
}
```

**示例**:
```bash
# 获取所有任务（包含子任务）
curl -X GET "http://127.0.0.1:8000/api/projects/5/tasks?include_subtasks=true"

# 只获取顶层任务
curl -X GET "http://127.0.0.1:8000/api/projects/5/tasks?include_subtasks=false"

# 分页获取
curl -X GET "http://127.0.0.1:8000/api/projects/5/tasks?limit=10&offset=0"
```

### 3. 获取单个任务详情

**端点**: `GET /api/projects/{project_id}/tasks/{task_id}`

**响应**: HTTP 200 OK
```json
{
  "id": 1,
  "project_id": 5,
  "name": "需求分析",
  "description": "分析项目需求",
  "status": "in_progress",
  "parent_task_id": null,
  "created_at": "2025-11-08T17:15:12.089500",
  "updated_at": "2025-11-08T17:15:12.089503"
}
```

**错误响应**: HTTP 404 Not Found
```json
{
  "detail": "任务不存在"
}
```

**示例**:
```bash
curl -X GET "http://127.0.0.1:8000/api/projects/5/tasks/1"
```

### 4. 更新任务

**端点**: `PUT /api/projects/{project_id}/tasks/{task_id}`

**请求体**:
```json
{
  "name": "新的任务名称",
  "description": "新的任务描述",
  "status": "completed",
  "parent_task_id": null
}
```

**注意**: 所有字段都是可选的，只更新提供的字段。

**响应**: HTTP 200 OK
```json
{
  "id": 1,
  "project_id": 5,
  "name": "新的任务名称",
  "description": "新的任务描述",
  "status": "completed",
  "parent_task_id": null,
  "created_at": "2025-11-08T17:15:12.089500",
  "updated_at": "2025-11-08T17:15:36.136760"
}
```

**示例**:
```bash
# 更新任务状态
curl -X PUT "http://127.0.0.1:8000/api/projects/5/tasks/1" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'

# 更新任务名称和描述
curl -X PUT "http://127.0.0.1:8000/api/projects/5/tasks/1" \
  -H "Content-Type: application/json" \
  -d '{"name": "需求分析（已完成）", "description": "项目需求分析已完成"}'
```

### 5. 删除任务

**端点**: `DELETE /api/projects/{project_id}/tasks/{task_id}`

**注意**: 删除任务会递归删除其所有子任务。

**响应**: HTTP 204 No Content

**错误响应**: HTTP 404 Not Found
```json
{
  "detail": "任务不存在"
}
```

**示例**:
```bash
curl -X DELETE "http://127.0.0.1:8000/api/projects/5/tasks/1"
```

### 6. 获取任务的子任务列表

**端点**: `GET /api/projects/{project_id}/tasks/{task_id}/children`

**响应**: HTTP 200 OK
```json
{
  "total": 2,
  "tasks": [
    {
      "id": 3,
      "project_id": 5,
      "name": "收集用户需求",
      "description": "与客户沟通收集需求",
      "status": "completed",
      "parent_task_id": 1,
      "created_at": "2025-11-08T17:15:23.767893",
      "updated_at": "2025-11-08T17:15:23.767898"
    },
    {
      "id": 4,
      "project_id": 5,
      "name": "编写需求文档",
      "description": "整理并编写需求规格说明书",
      "status": "in_progress",
      "parent_task_id": 1,
      "created_at": "2025-11-08T17:15:23.845729",
      "updated_at": "2025-11-08T17:15:23.845732"
    }
  ]
}
```

**示例**:
```bash
curl -X GET "http://127.0.0.1:8000/api/projects/5/tasks/1/children"
```

## 实现文件

### 1. 数据模型
- **文件**: `lifetrace/storage/models.py`
- **模型类**: `Task`
- **特性**:
  - 外键关联到 projects 表
  - 自关联支持父子任务关系
  - 自动时间戳管理

### 2. 数据库操作
- **文件**: `lifetrace/storage/database.py`
- **方法**:
  - `create_task(project_id, name, description, status, parent_task_id)`: 创建任务
  - `get_task(task_id)`: 获取单个任务
  - `list_tasks(project_id, limit, offset, parent_task_id, include_subtasks)`: 获取任务列表
  - `count_tasks(project_id, parent_task_id)`: 统计任务数量
  - `update_task(task_id, name, description, status, parent_task_id)`: 更新任务
  - `delete_task(task_id)`: 删除任务（递归删除子任务）
  - `get_task_children(task_id)`: 获取直接子任务

### 3. API Schema
- **文件**: `lifetrace/schemas/task.py`
- **模型类**:
  - `TaskStatus`: 任务状态枚举
  - `TaskCreate`: 创建任务请求模型
  - `TaskUpdate`: 更新任务请求模型
  - `TaskResponse`: 任务响应模型
  - `TaskListResponse`: 任务列表响应模型
  - `TaskWithChildren`: 带子任务的任务响应模型

### 4. API 路由
- **文件**: `lifetrace/routers/task.py`
- **路由**: 嵌套在项目路由下 `/api/projects/{project_id}/tasks`

### 5. 服务器配置
- **文件**: `lifetrace/server.py`
- **路由注册**: `app.include_router(task.router)`

## 核心特性

### 1. 层级任务结构
- 支持父子任务关系
- 通过 `parent_task_id` 字段实现自关联
- 可以创建多层嵌套的任务结构

### 2. 任务过滤
- 获取所有任务（包含子任务）
- 只获取顶层任务（parent_task_id 为 null）
- 获取特定任务的所有子任务

### 3. 级联删除
- 删除任务时自动递归删除所有子任务
- 确保数据一致性

### 4. 数据验证
- 创建子任务时验证父任务存在
- 验证父任务与子任务属于同一项目
- 更新任务时防止循环引用

### 5. 状态管理
- 支持四种任务状态
- 可以通过API更新任务状态
- 状态使用枚举类型确保数据有效性

## 测试结果

所有API端点已通过完整测试：

✅ **POST /api/projects/{project_id}/tasks** - 创建任务  
✅ **POST /api/projects/{project_id}/tasks** (带 parent_task_id) - 创建子任务  
✅ **GET /api/projects/{project_id}/tasks** - 获取所有任务  
✅ **GET /api/projects/{project_id}/tasks?include_subtasks=false** - 获取顶层任务  
✅ **GET /api/projects/{project_id}/tasks/{task_id}** - 获取单个任务  
✅ **PUT /api/projects/{project_id}/tasks/{task_id}** - 更新任务  
✅ **DELETE /api/projects/{project_id}/tasks/{task_id}** - 删除任务（含子任务）  
✅ **GET /api/projects/{project_id}/tasks/{task_id}/children** - 获取子任务列表  

### 测试场景验证

1. ✅ 创建项目和主任务
2. ✅ 创建子任务（通过 parent_task_id）
3. ✅ 获取项目的所有任务（包含/不包含子任务）
4. ✅ 获取任务的子任务列表
5. ✅ 更新任务名称和状态
6. ✅ 删除任务并验证子任务一并删除
7. ✅ 验证任务与项目的关联
8. ✅ 错误处理（404等）

## 使用示例

### 完整工作流

```bash
# 1. 创建项目
PROJECT_RESP=$(curl -s -X POST "http://127.0.0.1:8000/api/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "Web应用开发", "goal": "开发一个完整的Web应用"}')
PROJECT_ID=$(echo "$PROJECT_RESP" | python3 -c "import json, sys; print(json.load(sys.stdin)['id'])")

# 2. 创建主任务
TASK_RESP=$(curl -s -X POST "http://127.0.0.1:8000/api/projects/$PROJECT_ID/tasks" \
  -H "Content-Type: application/json" \
  -d '{"name": "前端开发", "description": "开发用户界面", "status": "pending"}')
TASK_ID=$(echo "$TASK_RESP" | python3 -c "import json, sys; print(json.load(sys.stdin)['id'])")

# 3. 创建子任务
curl -X POST "http://127.0.0.1:8000/api/projects/$PROJECT_ID/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"设计UI\", \"status\": \"in_progress\", \"parent_task_id\": $TASK_ID}"

curl -X POST "http://127.0.0.1:8000/api/projects/$PROJECT_ID/tasks" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"实现组件\", \"status\": \"pending\", \"parent_task_id\": $TASK_ID}"

# 4. 获取所有任务
curl -X GET "http://127.0.0.1:8000/api/projects/$PROJECT_ID/tasks"

# 5. 更新任务状态
curl -X PUT "http://127.0.0.1:8000/api/projects/$PROJECT_ID/tasks/$TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'

# 6. 获取子任务
curl -X GET "http://127.0.0.1:8000/api/projects/$PROJECT_ID/tasks/$TASK_ID/children"
```

## 启动服务器

```bash
cd /Users/liji/Documents/LifeTrace
PYTHONPATH=/Users/liji/Documents/LifeTrace uv run python lifetrace/server.py
```

服务器将在 `http://127.0.0.1:8000` 启动。

## API 文档

启动服务器后，可以访问以下地址查看交互式API文档：
- Swagger UI: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc

## 注意事项

1. **外键约束**: 任务必须关联到已存在的项目
2. **父任务验证**: 创建子任务时会验证父任务存在且属于同一项目
3. **循环引用防护**: 更新任务时防止将任务设置为自己的父任务
4. **级联删除**: 删除任务会自动递归删除所有子任务
5. **状态枚举**: 任务状态受限于预定义的枚举值
6. **时间戳**: created_at 和 updated_at 由数据库自动管理
7. **错误处理**: 所有端点都包含适当的错误处理和日志记录
