# LifeTrace API 文档

![LifeTrace Logo](../.github/assets/rhn8yu8l.png)

## 📑 目录

- [概述](#概述)
- [系统架构](#系统架构)
- [快速开始](#快速开始)
  - [环境要求](#环境要求)
  - [安装步骤](#安装步骤)
  - [启动服务](#启动服务)
- [API 设计](#api-设计)
  - [核心模块](#核心模块)
  - [API 端点](#api-端点)
- [配置说明](#配置说明)
- [数据模型](#数据模型)
- [高级功能](#高级功能)
- [开发指南](#开发指南)
- [故障排查](#故障排查)

---

## 概述

LifeTrace API 是一个基于 FastAPI 构建的智能生活记录系统后端服务。它提供了完整的 RESTful API 接口，支持自动截图记录、OCR 文本识别、智能事件管理、RAG（检索增强生成）对话和多模态搜索等功能。

### 核心特性

- 🚀 **高性能**: 基于 FastAPI 和 Uvicorn，支持异步处理
- 📸 **自动截图**: 后台定时自动屏幕捕获
- 🔍 **智能 OCR**: 使用 RapidOCR 从截图中提取文本
- 🎯 **事件聚合**: 基于上下文自动将截图聚合为智能事件
- 💬 **RAG 对话**: 集成检索增强生成，支持基于历史数据的智能问答
- 🔄 **热重载配置**: 支持配置文件实时监听和热更新
- 📊 **向量检索**: 基于 ChromaDB 的高效向量存储和检索
- 🎨 **多模态搜索**: 支持文本和图像的语义搜索

---

## 系统架构

LifeTrace API 采用模块化架构设计，主要包含以下几个层次：

```
┌─────────────────────────────────────────────────────────────┐
│                        FastAPI Server                        │
│                      (lifetrace/server.py)                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼───────┐ ┌────▼─────┐ ┌──────▼──────┐
│   Routers     │ │  Storage │ │     LLM     │
│  (API层)      │ │  (数据层) │ │   (AI层)    │
│               │ │           │ │             │
│ - screenshot  │ │ - models  │ │ - rag       │
│ - event       │ │ - database│ │ - vector    │
│ - chat        │ │           │ │ - embedding │
│ - search      │ └───────────┘ └─────────────┘
│ - config      │
│ - ...         │
└───────────────┘
        │
┌───────▼────────────────────────┐
│         Tool Layer              │
│  (工具层 - 后台服务)            │
│                                  │
│  - recorder (屏幕录制)          │
│  - ocr (OCR处理)                │
└──────────────────────────────────┘
```

### 核心组件

1. **Web 服务层 (server.py)**: FastAPI 应用入口，负责路由注册、中间件配置和生命周期管理
2. **路由层 (routers/)**: 处理各类 API 请求，包括截图、事件、聊天、搜索等
3. **数据层 (storage/)**: SQLAlchemy ORM 模型和数据库操作
4. **AI 层 (llm/)**: LLM 客户端、RAG 服务、向量数据库等
5. **任务层 (jobs/)**: 后台服务，包括屏幕录制器和 OCR 处理器
6. **工具函数 (util/)**: 配置管理、日志、查询解析等工具函数

---

## 快速开始

### 环境要求

- **Python**: 3.13+
- **操作系统**: macOS / Windows
- **依赖管理**: [uv](https://github.com/astral-sh/uv) (推荐) 或 pip
- **可选**: CUDA 支持（用于 GPU 加速）

### 安装步骤

#### 1. 克隆项目

```bash
git clone https://github.com/tangyuanbo1/LifeTrace_app.git
cd LifeTrace_app
```

#### 2. 安装 uv 包管理器（推荐）

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# 或使用 pip
pip install uv
```

#### 3. 安装依赖

```bash
# 使用 uv 同步依赖（推荐）
uv sync

# 激活虚拟环境
# macOS/Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate
```

或使用传统方式：

```bash
pip install -r requirements.txt
```

#### 4. 配置 LLM API（可选但推荐）

编辑 `lifetrace/config/config.yaml`：

```yaml
llm:
  api_key: "your-api-key-here"
  base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  model: "qwen3-max"
  temperature: 0.7
  max_tokens: 2048
```

支持的 LLM 服务商：
- 阿里云通义千问（默认）
- OpenAI
- Claude
- 其他兼容 OpenAI API 的服务

详细配置说明请参考 [API 配置指南](../doc/api_configuration_guide.md)

### 启动服务

#### 方式 1: 直接启动（推荐）

```bash
python -m lifetrace.server
```

服务将在 `http://localhost:8000` 启动。

#### 方式 2: 使用 Uvicorn

```bash
uvicorn lifetrace.server:app --host 0.0.0.0 --port 8000
```

#### 方式 3: 开发模式（热重载）

```bash
uvicorn lifetrace.server:app --reload
```

### 验证安装

启动服务后，访问以下 URL：

- **API 文档**: http://localhost:8000/docs (Swagger UI)
- **ReDoc 文档**: http://localhost:8000/redoc
- **健康检查**: http://localhost:8000/api/health

---

## API 设计

### 核心模块

LifeTrace API 采用模块化设计，每个模块负责特定的功能领域：

| 模块 | 功能 | 文件路径 |
|------|------|---------|
| **Screenshot** | 截图管理 | `routers/screenshot.py` |
| **Event** | 事件聚合与管理 | `routers/event.py` |
| **Chat** | LLM 对话接口 | `routers/chat.py` |
| **RAG** | 检索增强生成 | `routers/rag.py` |
| **Search** | 全文和语义搜索 | `routers/search.py` |
| **OCR** | OCR 文本识别 | `routers/ocr.py` |
| **Vector** | 向量数据库操作 | `routers/vector.py` |
| **Config** | 配置管理 | `routers/config.py` |
| **System** | 系统信息 | `routers/system.py` |
| **Logs** | 日志查看 | `routers/logs.py` |
| **Behavior** | 用户行为分析 | `routers/behavior.py` |
| **Plan** | 计划管理 | `routers/plan.py` |
| **Health** | 健康检查 | `routers/health.py` |

### API 端点

#### 1. 截图管理 (Screenshot)

**基础路径**: `/api/screenshots`

##### 获取截图列表

```http
GET /api/screenshots
```

**查询参数**:
- `limit` (int, 1-200): 返回数量限制，默认 50
- `offset` (int, ≥0): 分页偏移量，默认 0
- `start_date` (str, ISO格式): 开始日期
- `end_date` (str, ISO格式): 结束日期
- `app_name` (str): 应用程序名称过滤

**响应示例**:
```json
[
  {
    "id": 1,
    "filepath": "screenshots/2025-11-06/123456.png",
    "timestamp": "2025-11-06T10:30:00",
    "app_name": "Chrome",
    "window_title": "Google - Chrome",
    "ocr_text": "搜索结果内容...",
    "event_id": 42
  }
]
```

##### 获取单个截图

```http
GET /api/screenshots/{screenshot_id}
```

**响应**: 返回 PNG 图片文件

##### 获取截图统计

```http
GET /api/screenshots/stats
```

**查询参数**:
- `start_date` (str): 开始日期
- `end_date` (str): 结束日期

**响应示例**:
```json
{
  "total_screenshots": 1234,
  "date_range": {
    "start": "2025-11-01T00:00:00",
    "end": "2025-11-06T23:59:59"
  },
  "by_app": {
    "Chrome": 456,
    "VSCode": 321,
    "Terminal": 123
  }
}
```

---

#### 2. 事件管理 (Event)

**基础路径**: `/api/events`

事件是 LifeTrace 的核心概念，代表一段连续的应用使用阶段。系统会自动将相关截图聚合成事件。

##### 获取事件列表

```http
GET /api/events
```

**查询参数**:
- `limit` (int): 返回数量，默认 50
- `offset` (int): 分页偏移量
- `start_date` (str): 开始日期
- `end_date` (str): 结束日期
- `app_name` (str): 应用名称过滤

**响应示例**:
```json
{
  "events": [
    {
      "id": 42,
      "app_name": "Chrome",
      "start_time": "2025-11-06T10:00:00",
      "end_time": "2025-11-06T10:30:00",
      "duration_seconds": 1800,
      "screenshot_count": 36,
      "summary": "浏览技术文档和代码示例"
    }
  ],
  "total_count": 123
}
```

##### 获取事件详情

```http
GET /api/events/{event_id}
```

**响应示例**:
```json
{
  "id": 42,
  "app_name": "Chrome",
  "start_time": "2025-11-06T10:00:00",
  "end_time": "2025-11-06T10:30:00",
  "duration_seconds": 1800,
  "screenshot_count": 36,
  "summary": "浏览技术文档和代码示例",
  "screenshots": [
    {
      "id": 1,
      "filepath": "screenshots/...",
      "timestamp": "2025-11-06T10:00:00",
      "ocr_text": "..."
    }
  ]
}
```

##### 更新事件摘要

```http
POST /api/events/{event_id}/summary
```

**请求体**:
```json
{
  "summary": "更新后的事件摘要"
}
```

##### 生成 AI 摘要

```http
POST /api/events/{event_id}/generate-summary
```

使用 LLM 自动生成事件摘要。

**响应示例**:
```json
{
  "success": true,
  "event_id": 42,
  "summary": "AI生成的事件摘要内容..."
}
```

##### 删除事件

```http
DELETE /api/events/{event_id}
```

**查询参数**:
- `delete_screenshots` (bool): 是否同时删除关联截图，默认 false

##### 批量删除事件

```http
POST /api/events/batch-delete
```

**请求体**:
```json
{
  "event_ids": [1, 2, 3, 4, 5],
  "delete_screenshots": false
}
```

---

#### 3. 聊天与 RAG (Chat)

**基础路径**: `/api/chat`

LifeTrace 提供强大的 RAG（检索增强生成）对话功能，可以基于历史截图和事件数据回答问题。

##### 发送聊天消息

```http
POST /api/chat
```

**请求体**:
```json
{
  "message": "我上周做了什么工作？",
  "session_id": "optional-session-id"
}
```

**响应示例**:
```json
{
  "response": "根据您的历史记录，上周您主要进行了以下工作：\n1. 编写 Python 代码...\n2. 浏览技术文档...",
  "timestamp": "2025-11-06T10:30:00",
  "query_info": {
    "original_query": "我上周做了什么工作？",
    "time_filter": {
      "start": "2025-10-30",
      "end": "2025-11-05"
    }
  },
  "retrieval_info": {
    "total_screenshots": 1234,
    "filtered_screenshots": 856,
    "retrieved_count": 10
  },
  "performance": {
    "retrieval_time_ms": 123.45,
    "llm_time_ms": 2345.67,
    "total_time_ms": 2469.12
  }
}
```

##### 流式聊天

```http
POST /api/chat/stream
```

使用 Server-Sent Events (SSE) 返回流式响应。

**请求体**: 同上

**响应**: `text/event-stream` 格式的流式数据

##### 事件上下文对话

```http
POST /api/chat/event-context
```

基于特定事件进行对话。

**请求体**:
```json
{
  "message": "这段时间我在做什么？",
  "event_ids": [42, 43, 44]
}
```

##### 获取会话历史

```http
GET /api/chat/history/{session_id}
```

**查询参数**:
- `limit` (int): 返回消息数量，默认 50

##### 创建新会话

```http
POST /api/chat/sessions
```

**请求体**:
```json
{
  "title": "工作回顾会话"
}
```

---

#### 4. 搜索 (Search)

**基础路径**: `/api/search`

##### 全文搜索

```http
GET /api/search
```

**查询参数**:
- `query` (str, 必需): 搜索关键词
- `limit` (int): 返回数量，默认 50
- `offset` (int): 分页偏移量
- `start_date` (str): 开始日期
- `end_date` (str): 结束日期
- `app_name` (str): 应用名称过滤

**响应示例**:
```json
{
  "query": "Python FastAPI",
  "total_count": 45,
  "results": [
    {
      "id": 123,
      "filepath": "screenshots/...",
      "timestamp": "2025-11-06T10:30:00",
      "app_name": "VSCode",
      "ocr_text": "from fastapi import FastAPI...",
      "relevance_score": 0.95
    }
  ]
}
```

##### 语义搜索

```http
POST /api/search/semantic
```

**请求体**:
```json
{
  "query": "如何使用 FastAPI 构建 API",
  "limit": 10,
  "threshold": 0.7
}
```

---

#### 5. OCR 服务 (OCR)

**基础路径**: `/api/ocr`

##### 获取 OCR 状态

```http
GET /api/ocr/status
```

**响应示例**:
```json
{
  "is_running": true,
  "queue_size": 5,
  "processed_count": 1234,
  "failed_count": 3
}
```

##### 手动触发 OCR

```http
POST /api/ocr/process/{screenshot_id}
```

对指定截图重新执行 OCR 识别。

---

#### 6. 向量数据库 (Vector)

**基础路径**: `/api/vector`

##### 构建向量索引

```http
POST /api/vector/build
```

**请求体**:
```json
{
  "force_rebuild": false,
  "batch_size": 100
}
```

##### 获取向量统计

```http
GET /api/vector/stats
```

**响应示例**:
```json
{
  "total_vectors": 1234,
  "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
  "dimension": 384,
  "index_status": "ready"
}
```

---

#### 7. 配置管理 (Config)

**基础路径**: `/api/config`

##### 获取当前配置

```http
GET /api/config
```

**响应示例**:
```json
{
  "llm": {
    "api_key": "sk-***",
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "model": "qwen3-max",
    "temperature": 0.7,
    "max_tokens": 2048
  },
  "server": {
    "host": "127.0.0.1",
    "port": 8000
  },
  "record": {
    "interval": 30,
    "quality": 85
  },
  "ocr": {
    "enabled": true,
    "language": "ch"
  }
}
```

##### 更新配置

```http
POST /api/config
```

**请求体**: 同上（只需提供要更新的字段）

配置更新会自动保存到 `config/config.yaml` 并触发热重载。

---

#### 8. 系统信息 (System)

**基础路径**: `/api/system`

##### 获取系统信息

```http
GET /api/system/info
```

**响应示例**:
```json
{
  "os": "Darwin",
  "os_version": "24.6.0",
  "python_version": "3.13.0",
  "cpu_percent": 25.3,
  "memory_percent": 68.5,
  "disk_usage": {
    "total": "500GB",
    "used": "320GB",
    "free": "180GB",
    "percent": 64.0
  },
  "uptime_seconds": 86400
}
```

---

#### 9. 健康检查 (Health)

**基础路径**: `/api/health`

```http
GET /api/health
```

**响应示例**:
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2025-11-06T10:30:00",
  "services": {
    "database": "ok",
    "ocr": "ok",
    "recorder": "ok",
    "vector_db": "ok"
  }
}
```

---

## 配置说明

### 配置文件结构

LifeTrace 使用 YAML 格式的配置文件，位于 `lifetrace/config/config.yaml`。

#### 完整配置示例

```yaml
# LLM 配置
llm:
  api_key: "your-api-key"                      # API 密钥
  base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"  # API 基础 URL
  model: "qwen3-max"                           # 模型名称
  temperature: 0.7                             # 温度参数 (0-1)
  max_tokens: 2048                             # 最大输出 token 数
  timeout: 60                                  # 请求超时时间（秒）

# 服务器配置
server:
  host: "127.0.0.1"                           # 监听地址
  port: 8000                                   # 监听端口
  reload: false                                # 是否开启热重载
  workers: 1                                   # 工作进程数

# 录制配置
record:
  enabled: true                                # 是否启用自动录制
  interval: 30                                 # 截图间隔（秒）
  quality: 85                                  # 图片质量 (1-100)
  format: "png"                                # 图片格式
  save_path: "data/screenshots"               # 保存路径

# OCR 配置
ocr:
  enabled: true                                # 是否启用 OCR
  language: "ch"                               # 识别语言
  model_path: "models"                        # 模型路径
  batch_size: 10                              # 批处理大小
  confidence_threshold: 0.5                   # 置信度阈值

# 聊天配置
chat:
  local_history: true                         # 是否启用本地历史记录
  history_limit: 6                            # 历史记录条数限制
  max_context_screenshots: 10                 # 最大上下文截图数

# 向量数据库配置
vector:
  enabled: true                               # 是否启用向量检索
  model: "sentence-transformers/all-MiniLM-L6-v2"  # 嵌入模型
  collection_name: "lifetrace_screenshots"    # 集合名称
  persist_directory: "data/chroma"            # 持久化目录

# 日志配置
logging:
  level: "INFO"                               # 日志级别
  format: "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
  file: "data/logs/lifetrace.log"            # 日志文件路径
  max_size: "10MB"                           # 单个日志文件最大大小
  backup_count: 5                            # 日志文件保留数量
```

### 配置热重载

LifeTrace 支持配置文件的热重载，无需重启服务即可应用部分配置更新。

**支持热重载的配置项**:
- LLM 相关配置 (`llm` 部分)
- 录制配置 (`record` 部分)
- OCR 配置 (`ocr` 部分)

**不支持热重载的配置项**（需要重启服务）:
- 服务器配置 (`server` 部分)
- 日志配置 (`logging` 部分)

### 通过 API 更新配置

除了直接编辑配置文件，还可以通过 API 动态更新配置：

```bash
curl -X POST http://localhost:8000/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "llm": {
      "api_key": "new-api-key",
      "model": "gpt-4"
    }
  }'
```

---

## 数据模型

### 数据库架构

LifeTrace 使用 SQLite 数据库存储结构化数据，主要包含以下表：

#### 1. Screenshot (截图表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| filepath | String | 文件路径 |
| timestamp | DateTime | 截图时间 |
| app_name | String | 应用名称 |
| window_title | String | 窗口标题 |
| ocr_text | Text | OCR 识别文本 |
| event_id | Integer | 关联事件 ID |
| created_at | DateTime | 创建时间 |

#### 2. Event (事件表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| app_name | String | 应用名称 |
| start_time | DateTime | 开始时间 |
| end_time | DateTime | 结束时间 |
| duration_seconds | Integer | 持续时间（秒） |
| screenshot_count | Integer | 截图数量 |
| summary | Text | 事件摘要 |
| created_at | DateTime | 创建时间 |

#### 3. ChatSession (聊天会话表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| session_id | String | 会话 ID |
| title | String | 会话标题 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

#### 4. ChatMessage (聊天消息表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键 |
| session_id | String | 会话 ID |
| role | String | 角色（user/assistant） |
| content | Text | 消息内容 |
| timestamp | DateTime | 时间戳 |

### 向量数据库

LifeTrace 使用 ChromaDB 存储向量嵌入，用于语义搜索：

- **Collection**: `lifetrace_screenshots`
- **Embedding Model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Dimension**: 384
- **Metadata**: 包含截图 ID、时间戳、应用名称等

---

## 高级功能

### 1. 智能事件聚合

LifeTrace 会根据以下规则自动将截图聚合成事件：

- **应用切换**: 切换到不同应用时创建新事件
- **时间间隔**: 超过配置的时间间隔（默认 5 分钟）时创建新事件
- **内容相关性**: 基于 OCR 文本的语义相似度判断是否属于同一事件

详细说明请参考：[事件机制文档](../doc/event_mechanism.md)

### 2. RAG 检索增强生成

RAG 服务的工作流程：

```
用户问题 → 查询解析 → 时间过滤 → 向量检索 → 上下文构建 → LLM 生成 → 返回答案
```

**关键特性**:
- 智能时间解析（如"上周"、"昨天"、"最近三天"）
- 混合检索策略（向量检索 + 全文检索）
- 上下文压缩和排序
- Token 使用优化

详细说明请参考：[RAG 服务文档](../doc/event_ai_summary_usage.md)

### 3. 多模态搜索

支持以下搜索方式：

- **全文搜索**: 基于 OCR 文本的关键词搜索
- **语义搜索**: 基于向量嵌入的语义相似度搜索
- **图像搜索**: 使用 CLIP 模型进行图像内容搜索（开发中）
- **混合搜索**: 结合多种搜索策略的综合搜索

### 4. 性能优化

LifeTrace 采用了多种性能优化策略：

- **异步处理**: 使用 FastAPI 的异步特性处理 I/O 密集型操作
- **后台任务**: 录制和 OCR 处理在独立线程中运行
- **批量处理**: OCR 和向量化操作支持批量处理
- **缓存机制**: 常用查询结果缓存
- **懒加载**: 大型数据按需加载

详细说明请参考：[内存优化指南](../doc/memory_optimization_guide.md)

---

## 开发指南

### 目录结构

```
lifetrace/
├── server.py                 # FastAPI 应用入口
├── config/                   # 配置文件目录
│   ├── config.yaml          # 用户配置
│   ├── default_config.yaml  # 默认配置
│   └── rapidocr_config.yaml # OCR 配置
├── routers/                  # API 路由
│   ├── dependencies.py      # 依赖注入
│   ├── screenshot.py        # 截图路由
│   ├── event.py             # 事件路由
│   ├── chat.py              # 聊天路由
│   ├── search.py            # 搜索路由
│   ├── ocr.py               # OCR 路由
│   ├── vector.py            # 向量路由
│   ├── config.py            # 配置路由
│   ├── system.py            # 系统路由
│   ├── health.py            # 健康检查路由
│   ├── logs.py              # 日志路由
│   ├── behavior.py          # 行为分析路由
│   ├── plan.py              # 计划路由
│   └── rag.py               # RAG 路由
├── schemas/                  # Pydantic 数据模型
│   ├── screenshot.py
│   ├── event.py
│   ├── chat.py
│   ├── search.py
│   ├── config.py
│   ├── stats.py
│   ├── system.py
│   └── vector.py
├── storage/                  # 数据存储层
│   ├── database.py          # 数据库操作
│   └── models.py            # SQLAlchemy 模型
├── llm/                      # LLM 和 AI 服务
│   ├── llm_client.py        # LLM 客户端
│   ├── rag_service.py       # RAG 服务
│   ├── retrieval_service.py # 检索服务
│   ├── context_builder.py   # 上下文构建
│   ├── event_summary_service.py  # 事件摘要
│   ├── vector_service.py    # 向量服务
│   ├── vector_db.py         # 向量数据库
│   ├── multimodal_vector_service.py  # 多模态向量
│   └── multimodal_embedding.py  # 多模态嵌入
├── jobs/                     # 任务层
│   ├── recorder.py          # 屏幕录制器
│   └── ocr.py               # OCR 处理器
├── util/                     # 工具函数
│   ├── config.py            # 配置管理
│   ├── logging_config.py    # 日志配置
│   ├── utils.py             # 通用工具
│   ├── app_utils.py         # 应用工具
│   ├── query_parser.py      # 查询解析
│   └── token_usage_logger.py  # Token 使用跟踪
├── models/                   # OCR 模型文件
│   ├── ch_PP-OCRv4_det_infer.onnx
│   ├── ch_PP-OCRv4_rec_infer.onnx
│   └── ch_ppocr_mobile_v2.0_cls_infer.onnx
└── data/                     # 数据目录
    ├── lifetrace.db         # SQLite 数据库
    ├── screenshots/         # 截图文件
    ├── chroma/              # ChromaDB 数据
    └── logs/                # 日志文件
```

### 添加新的 API 端点

1. **创建路由文件** (例如 `routers/my_feature.py`):

```python
from fastapi import APIRouter
from lifetrace.routers import dependencies as deps

router = APIRouter(prefix="/api/my-feature", tags=["my-feature"])

@router.get("/")
async def get_my_feature():
    """获取我的功能"""
    # 使用依赖注入的服务
    result = deps.db_manager.query_something()
    return {"data": result}
```

2. **注册路由** (在 `server.py` 中):

```python
from lifetrace.routers import my_feature

app.include_router(my_feature.router)
```

### 数据库迁移

使用 Alembic 进行数据库迁移：

```bash
# 创建迁移
alembic revision --autogenerate -m "Add new table"

# 执行迁移
alembic upgrade head

# 回滚迁移
alembic downgrade -1
```

### 测试

```bash
# 运行所有测试
pytest

# 运行特定测试文件
pytest tests/test_screenshot.py

# 运行并显示覆盖率
pytest --cov=lifetrace
```

---

## 故障排查

### 常见问题

#### 1. 服务启动失败

**问题**: 端口被占用

```
ERROR: [Errno 48] error while attempting to bind on address ('127.0.0.1', 8000): address already in use
```

**解决方案**:
```bash
# 查找占用端口的进程
lsof -i :8000

# 杀死进程
kill -9 <PID>

# 或修改配置文件中的端口
```

#### 2. OCR 识别失败

**问题**: 缺少 OCR 模型文件

**解决方案**:
- 确保 `lifetrace/models/` 目录下存在 OCR 模型文件
- 或配置正确的模型路径

#### 3. LLM API 调用失败

**问题**: API Key 无效或配置错误

**解决方案**:
```bash
# 检查配置
cat lifetrace/config/config.yaml

# 验证 API Key
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://dashscope.aliyuncs.com/compatible-mode/v1/models
```

#### 4. 向量检索不工作

**问题**: 向量索引未构建

**解决方案**:
```bash
# 通过 API 构建索引
curl -X POST http://localhost:8000/api/vector/build
```

#### 5. 内存占用过高

**解决方案**:
- 减少 `batch_size` 配置
- 启用多模态禁用优化
- 定期清理旧数据

详细说明请参考：[内存优化指南](../doc/memory_optimization_guide.md)

### 日志调试

#### 查看日志

```bash
# 实时查看日志
tail -f lifetrace/data/logs/2025-11-06.log

# 查看错误日志
tail -f lifetrace/data/logs/2025-11-06.error.log
```

#### 通过 API 查看日志

```bash
# 获取最近的日志
curl http://localhost:8000/api/logs?limit=100

# 获取错误日志
curl http://localhost:8000/api/logs?level=error
```

#### 调整日志级别

编辑 `config/config.yaml`:

```yaml
logging:
  level: "DEBUG"  # INFO, DEBUG, WARNING, ERROR
```

---

## 相关文档

- [项目主文档](../README_CN.md)
- [API 配置指南](../doc/api_configuration_guide.md)
- [事件机制说明](../doc/event_mechanism.md)
- [内存优化指南](../doc/memory_optimization_guide.md)
- [跨平台支持](../doc/cross_platform_support.md)
- [uv 使用指南](../doc/uv_usage_guide.md)

---

## 许可证

版权所有 © 2025 LifeTrace.org

本项目根据 [Apache License 2.0](../LICENSE) 许可。

---

## 支持与社区

- **文档网站**: https://freeyou.club/lifetrace/
- **GitHub**: https://github.com/tangyuanbo1/LifeTrace_app
- **问题反馈**: [GitHub Issues](https://github.com/tangyuanbo1/LifeTrace_app/issues)

加入我们的社区：

- 微信群
- 飞书群  
- 小红书

扫描二维码请参考[主文档](../README_CN.md#加入我们的社区)。

---

**Happy Coding! 🚀**
