# 项目管理 API 文档

本文档描述了 LifeTrace 项目管理功能的后端 API 实现。

## 数据库设计

### projects 表结构

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 项目ID（主键，自增） |
| name | VARCHAR(200) | 项目名称（必填） |
| goal | TEXT | 项目目标（可选） |
| created_at | DATETIME | 创建时间（自动生成） |
| updated_at | DATETIME | 更新时间（自动更新） |

## API 端点

### 1. 创建项目

**端点**: `POST /api/projects`

**请求体**:
```json
{
  "name": "项目名称",
  "goal": "项目目标描述"
}
```

**响应**: HTTP 201 Created
```json
{
  "id": 1,
  "name": "项目名称",
  "goal": "项目目标描述",
  "created_at": "2025-11-08T14:06:42.193536",
  "updated_at": "2025-11-08T14:06:42.193538"
}
```

**示例**:
```bash
curl -X POST "http://127.0.0.1:8000/api/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "LifeTrace项目管理", "goal": "开发完整的项目管理系统"}'
```

### 2. 获取所有项目

**端点**: `GET /api/projects`

**查询参数**:
- `limit` (可选): 返回数量限制（默认100，最大1000）
- `offset` (可选): 偏移量（默认0）

**响应**: HTTP 200 OK
```json
{
  "total": 2,
  "projects": [
    {
      "id": 1,
      "name": "项目名称1",
      "goal": "项目目标1",
      "created_at": "2025-11-08T14:06:42.193536",
      "updated_at": "2025-11-08T14:06:42.193538"
    },
    {
      "id": 2,
      "name": "项目名称2",
      "goal": "项目目标2",
      "created_at": "2025-11-08T14:06:42.230011",
      "updated_at": "2025-11-08T14:06:42.230014"
    }
  ]
}
```

**示例**:
```bash
curl -X GET "http://127.0.0.1:8000/api/projects?limit=10&offset=0"
```

### 3. 获取单个项目

**端点**: `GET /api/projects/{project_id}`

**路径参数**:
- `project_id`: 项目ID

**响应**: HTTP 200 OK
```json
{
  "id": 1,
  "name": "项目名称",
  "goal": "项目目标描述",
  "created_at": "2025-11-08T14:06:42.193536",
  "updated_at": "2025-11-08T14:06:42.193538"
}
```

**错误响应**: HTTP 404 Not Found
```json
{
  "detail": "项目不存在"
}
```

**示例**:
```bash
curl -X GET "http://127.0.0.1:8000/api/projects/1"
```

### 4. 更新项目

**端点**: `PUT /api/projects/{project_id}`

**路径参数**:
- `project_id`: 项目ID

**请求体**:
```json
{
  "name": "新的项目名称",
  "goal": "新的项目目标"
}
```

**响应**: HTTP 200 OK
```json
{
  "id": 1,
  "name": "新的项目名称",
  "goal": "新的项目目标",
  "created_at": "2025-11-08T14:06:42.193536",
  "updated_at": "2025-11-08T14:06:58.632437"
}
```

**示例**:
```bash
curl -X PUT "http://127.0.0.1:8000/api/projects/1" \
  -H "Content-Type: application/json" \
  -d '{"name": "更新后的项目名称", "goal": "更新后的目标"}'
```

### 5. 删除项目

**端点**: `DELETE /api/projects/{project_id}`

**路径参数**:
- `project_id`: 项目ID

**响应**: HTTP 204 No Content

**错误响应**: HTTP 404 Not Found
```json
{
  "detail": "项目不存在"
}
```

**示例**:
```bash
curl -X DELETE "http://127.0.0.1:8000/api/projects/1"
```

## 实现文件

### 1. 数据模型
- **文件**: `lifetrace/storage/models.py`
- **模型类**: `Project`

### 2. 数据库操作
- **文件**: `lifetrace/storage/database.py`
- **方法**:
  - `create_project(name, goal)`: 创建项目
  - `get_project(project_id)`: 获取单个项目
  - `list_projects(limit, offset)`: 获取项目列表
  - `update_project(project_id, name, goal)`: 更新项目
  - `delete_project(project_id)`: 删除项目

### 3. API Schema
- **文件**: `lifetrace/schemas/project.py`
- **模型类**:
  - `ProjectCreate`: 创建项目请求模型
  - `ProjectUpdate`: 更新项目请求模型
  - `ProjectResponse`: 项目响应模型
  - `ProjectListResponse`: 项目列表响应模型

### 4. API 路由
- **文件**: `lifetrace/routers/project.py`
- **路由前缀**: `/api/projects`

### 5. 服务器配置
- **文件**: `lifetrace/server.py`
- **路由注册**: `app.include_router(project.router)`

## 测试结果

所有API端点已通过测试：

✅ **POST /api/projects** - 创建项目  
✅ **GET /api/projects** - 获取所有项目  
✅ **GET /api/projects/{project_id}** - 获取单个项目  
✅ **PUT /api/projects/{project_id}** - 更新项目  
✅ **DELETE /api/projects/{project_id}** - 删除项目  

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

1. **数据库表**: projects 表在首次启动时会自动创建
2. **字段验证**: 项目名称长度限制为1-200字符，必填
3. **时间戳**: created_at 和 updated_at 由数据库自动管理
4. **排序**: 项目列表按创建时间倒序排列
5. **错误处理**: 所有端点都包含适当的错误处理和日志记录
