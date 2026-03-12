# Lifetrace Server

Lifetrace 云端后端服务，基于 FastAPI 构建。作为中心节点部署在服务器上，接收客户端上传的感知数据（OCR 文本、音频、截图等），提供 LLM 处理、数据存储和业务 API。

- **版本**: 0.1.2
- **Python**: >=3.12, <3.13
- **框架**: FastAPI + Uvicorn + SQLAlchemy/SQLModel

## 架构

```
┌─────────────────────────────────────┐
│  Client 端（本地设备）                │
│  sensor.py / Electron / Flutter      │
│  截图、OCR、音频采集、黑名单过滤       │
└──────────────┬──────────────────────┘
               │ HTTP POST / WebSocket
               ▼
┌─────────────────────────────────────┐
│  Cloud Server（本服务）              │
│  接收数据 → LLM 处理 → 存储 → API   │
│  Memory / Perception / Agent / RAG   │
└─────────────────────────────────────┘
```

Server 不执行本地屏幕截图、OCR 识别或音频采集等操作，这些功能由 `client/` 感知客户端或前端应用完成后上传。

## 目录结构

```
server/
├── server.py                  # 主入口，FastAPI 应用与生命周期管理
├── agent_os.py                # AgentOS 入口（Agno Agent 独立服务）
├── pyproject.toml             # 项目依赖与工具配置
├── Dockerfile                 # Docker 构建文件
├── alembic.ini                # 数据库迁移配置
├── config/                    # 配置文件
│   ├── default_config.yaml    # 默认配置模板
│   ├── config.yaml            # 运行时配置（由 default 生成，不提交）
│   ├── prompt.yaml            # Prompt 配置
│   └── prompts/               # 各功能模块 Prompt 模板
├── core/                      # 核心框架
│   ├── module_registry.py     # 模块注册与按需加载
│   ├── dependencies.py        # FastAPI 依赖注入
│   ├── lazy_services.py       # 服务懒加载
│   └── config_watcher.py      # 配置热更新监听
├── routers/                   # API 路由层（~30 个模块）
├── schemas/                   # Pydantic 请求/响应模型
├── services/                  # 业务逻辑层
├── repositories/              # 数据访问层（Repository 模式）
├── storage/                   # 数据库模型与连接管理
├── llm/                       # LLM 客户端、RAG、Agent、工具
├── memory/                    # 多层记忆系统（L0-L4）
├── perception/                # 感知流系统（Pub/Sub 事件总线）
├── jobs/                      # 后台定时任务（活动聚合、DDL 提醒、数据清理）
├── observability/             # 可观测性（OpenTelemetry / Phoenix）
├── migrations/                # Alembic 数据库迁移
├── scripts/                   # 构建与维护脚本
├── util/                      # 工具函数库
├── data/                      # 运行时数据（不提交）
└── logs/                      # 日志目录
```

## 快速开始

### 本地开发

```bash
cd server

# 安装依赖
uv sync

# 启动服务（默认 0.0.0.0:8001）
python server.py
```

所有配置通过环境变量管理，详见 `.env.example`，复制为 `.env` 即可使用。

| 环境变量 | 说明 | 默认值 |
|------|------|--------|
| `LIFETRACE_SERVER__HOST` | 监听地址 | `0.0.0.0` |
| `LIFETRACE_SERVER__PORT` | 监听端口 | `8001` |
| `LIFETRACE_SERVER__DEBUG` | 调试模式 | `false` |

### Docker 部署

```bash
docker build -t lifetrace-server .
docker run -p 8001:8001 lifetrace-server
```

容器默认监听 8001 端口。

## 架构概览

### 模块化加载

服务器采用模块化架构，通过 `core/module_registry.py` 管理模块注册。启动时优先加载核心模块（health、config、system、todo、perception），其余模块延迟异步加载，避免阻塞启动流程。

模块可在 `config/default_config.yaml` 的 `backend_modules.enabled` 中配置启用/禁用。

### 生命周期

启动阶段依次初始化：

1. **Memory Manager** — 多层记忆系统
2. **Perception Manager** — 感知事件流
3. **Memory -> Perception 订阅** — L0 写入 + L1 去重
4. **Job Manager** — 后台定时任务
5. **延迟模块注册** — 非优先路由模块
6. **LLM 连接验证** — 异步校验 LLM 配置

关闭阶段停止所有后台任务、Memory 和 Perception 管理器。

### 服务角色

| 角色 | 说明 |
|------|------|
| `standalone` | 单机模式，CORS 限制为本地端口范围 |
| `center` | 中心节点模式，接收远程感知数据，CORS 允许所有来源 |

## 核心系统

### 多层记忆系统（Memory）

基于文件的分层记忆架构，数据流向：L0 -> L1 -> L2 -> L3 / L4。

| 层级 | 模块 | 说明 |
|------|------|------|
| L0 | `memory/writer.py` | 原始写入，将 PerceptionEvent 追加到每日 Markdown |
| L1 | `memory/deduper.py` | 实时去重，滑动窗口 + LLM 判别，输出去重后的流 |
| L2 | `memory/compressor.py` | 每日压缩，LLM 生成结构化事件摘要 |
| L3 | `memory/task_linker.py` | 任务关联，将 L2 事件与活跃 Todo 匹配 |
| L4 | `memory/profile_builder.py` | 用户画像，增量更新用户行为画像 |

### 感知流系统（Perception）

基于 asyncio 的 Pub/Sub 事件总线，接收客户端上传的感知数据并分发处理。

| 模块 | 说明 |
|------|------|
| `perception/stream.py` | 事件发布与订阅分发，含滑动窗口缓冲 |
| `perception/manager.py` | 管理流实例和事件适配器 |
| `perception/adapters/` | 事件构建器：音频转录、OCR 文本、用户输入、AI 输出 |
| `perception/subscribers/` | 订阅者：Todo 意图检测等 |

数据入口：
- **`/api/perception/ingest`** — 接收 `client/sensor.py` 上传的 PerceptionEvent
- **`/api/audio/transcribe`** (WebSocket) — 接收前端麦克风音频流
- **`/api/audio/hardware/audio`** — 接收硬件设备音频
- **`/api/floating-capture/extract-todos`** — 接收客户端上传的 base64 截图

### LLM 与 Agent

| 模块 | 说明 |
|------|------|
| `llm/llm_client.py` | OpenAI 兼容 LLM 客户端 |
| `llm/agno_agent.py` | 基于 Agno 框架的智能 Agent |
| `llm/rag*.py` | RAG 检索增强生成 |
| `llm/vector_db.py` | ChromaDB 向量数据库 |
| `llm/vector_service.py` | 向量搜索服务 |
| `llm/retrieval_service.py` | 检索服务 |
| `llm/tavily_client.py` | Tavily 联网搜索客户端 |
| `llm/web_search_service.py` | 网页搜索服务 |
| `llm/todo_extraction_service.py` | 从文本/事件中提取待办 |
| `llm/agno_tools/` | Agno Agent 工具集 |
| `llm/agno_plan/` | Agent 计划构建与执行 |
| `llm/agno_learning.py` | Agent 学习模块 |

### 后台任务（Jobs）

| 任务 | 说明 |
|------|------|
| `activity_aggregator.py` | 活动聚合，定时聚合事件并 LLM 总结 |
| `deadline_reminder.py` | DDL 提醒，基于 APScheduler 触发待办提醒 |
| `clean_data.py` | 数据清理，清理旧截图控制磁盘占用 |
| `job_manager.py` | 后台任务统一管理器 |

> 屏幕录制、本地 OCR、Todo 专用录制等采集功能已迁移到 `client/` 感知客户端。

### 业务服务（Services）

| 服务 | 说明 |
|------|------|
| `todo_service.py` | 待办 CRUD、提醒、附件管理 |
| `chat_service.py` | 聊天会话管理与消息处理 |
| `activity_service.py` | 活动列表、创建、统计 |
| `event_service.py` | 事件查询与详情 |
| `journal_service.py` | 日记创建、AI 生成、自动关联 |
| `audio_service.py` | 音频存储、转录管理 |
| `audio_extraction_service.py` | 从音频转录文本提取待办和日程 |
| `config_service.py` | 配置保存、比对、重载，LLM/ASR 重初始化 |
| `automation_task_service.py` | 自动化任务调度与执行 |
| `icalendar_service.py` | iCalendar (ICS) 导入/导出 |
| `plugin_manager.py` | 插件下载、安装、卸载和状态查询 |
| `asr_client.py` | 阿里云 Fun-ASR 实时语音识别（WebSocket） |
| `asr_client_dashscope.py` | 阿里云 ASR（DashScope SDK） |
| `dify_client.py` | Dify 平台集成客户端 |
| `agent_os_client.py` | AgentOS HTTP 客户端 |

## API 端点

### Health — 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET, HEAD | `/` | 根路径标识 |
| GET | `/health` | 健康检查（数据库等） |
| GET | `/health/llm` | LLM 服务健康检查 |

### Config — 配置管理 (`/api`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/get-config` | 获取当前配置 |
| POST | `/api/save-config` | 保存配置 |
| POST | `/api/save-and-init-llm` | 保存并初始化 LLM |
| GET | `/api/llm-status` | LLM 配置与连接状态 |
| POST | `/api/test-llm-config` | 测试 LLM 配置 |
| POST | `/api/test-tavily-config` | 测试 Tavily 配置 |
| POST | `/api/test-asr-config` | 测试 ASR 配置 |
| GET | `/api/get-chat-prompts` | 获取聊天 Prompt |

### System — 系统管理 (`/api`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/statistics` | 系统统计数据 |
| POST | `/api/cleanup` | 清理旧数据 |
| GET | `/api/system-resources` | 系统资源使用情况 |
| GET | `/api/capabilities` | 后端模块能力状态 |

### Todo — 待办管理 (`/api/todos`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/todos` | 获取待办列表 |
| POST | `/api/todos` | 创建待办 |
| GET | `/api/todos/{todo_id}` | 获取待办详情 |
| PUT | `/api/todos/{todo_id}` | 更新待办 |
| DELETE | `/api/todos/{todo_id}` | 删除待办 |
| POST | `/api/todos/reorder` | 批量更新排序和父子关系 |
| POST | `/api/todos/{todo_id}/attachments` | 上传附件 |
| DELETE | `/api/todos/{todo_id}/attachments/{id}` | 删除附件 |
| GET | `/api/todos/attachments/{id}/file` | 下载附件 |
| GET | `/api/todos/export/ics` | 导出 ICS |
| POST | `/api/todos/import/ics` | 导入 ICS |

### Todo Extraction — 待办提取 (`/api/todo-extraction`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/todo-extraction/extract` | 从事件中提取待办 |

### Chat — 聊天 (`/api/chat`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat` | 与 LLM 聊天（RAG） |
| POST | `/api/chat/stream` | 流式聊天（支持 dify/agent/web_search/agno 模式） |
| POST | `/api/chat/stream-with-context` | 带事件上下文的流式聊天 |
| POST | `/api/chat/new` | 创建新对话 |
| POST | `/api/chat/session/{id}/message` | 添加会话消息 |
| DELETE | `/api/chat/session/{id}` | 清除会话上下文 |
| GET | `/api/chat/history` | 获取聊天历史 |
| GET | `/api/chat/suggestions` | 查询建议 |
| GET | `/api/chat/query-types` | 支持的查询类型 |
| GET | `/api/chat/agno/tools` | Agno Agent 工具列表 |
| POST | `/api/chat/extract-todos-from-messages` | 从消息提取待办 |

### Chat Plan — 聊天计划 (`/api/chat/plan`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/chat/plan/questionnaire/stream` | 生成 Plan 问卷（流式） |
| POST | `/api/chat/plan/summary/stream` | 生成任务总结和子任务（流式） |

### Agent Plan — Agent 计划 (`/api/agent/plan`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/agent/plan` | 创建计划 |
| POST | `/api/agent/plan/run` | 流式执行计划 |
| GET | `/api/agent/plan/todo/{todo_id}/latest` | 获取 Todo 最新计划状态 |
| POST | `/api/agent/plan/run/{id}/cancel` | 取消计划执行 |
| POST | `/api/agent/plan/run/{id}/resume` | 恢复计划执行 |
| POST | `/api/agent/plan/run/{id}/retry` | 重试计划执行 |

### Event — 事件 (`/api/events`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/events` | 获取事件列表 |
| GET | `/api/events/count` | 事件总数 |
| GET | `/api/events/{id}` | 事件详情 |
| GET | `/api/events/{id}/context` | 事件 OCR 上下文 |
| POST | `/api/events/{id}/generate-summary` | 手动生成事件摘要 |

### Activity — 活动 (`/api/activities`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/activities` | 获取活动列表 |
| GET | `/api/activities/{id}/events` | 活动关联事件 |
| POST | `/api/activities/manual` | 手动聚合事件为活动 |

### Journal — 日记 (`/api/journals`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/journals` | 创建日记 |
| GET | `/api/journals` | 获取日记列表 |
| GET | `/api/journals/{id}` | 日记详情 |
| PUT | `/api/journals/{id}` | 更新日记 |
| DELETE | `/api/journals/{id}` | 删除日记 |
| POST | `/api/journals/auto-link` | 自动关联 Todo/活动 |
| POST | `/api/journals/generate-objective` | 生成客观记录 |
| POST | `/api/journals/generate-ai` | 生成 AI 视角记录 |

### Memory — 记忆 (`/api/memory`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/memory/today` | 今日记忆 |
| GET | `/api/memory/date/{date}` | 按日期获取记忆 |
| GET | `/api/memory/raw/{date}` | 原始记忆数据 |
| GET | `/api/memory/search` | 搜索记忆 |
| GET | `/api/memory/dates` | 可用记忆日期 |
| GET | `/api/memory/status` | 记忆系统状态 |
| POST | `/api/memory/compress/{date}` | 触发 L2 压缩 |
| GET | `/api/memory/dedup-stats` | L1 去重统计 |
| POST | `/api/memory/link/{date}` | 触发 L3 任务关联 |
| POST | `/api/memory/compress-and-link/{date}` | 压缩并关联 |
| GET | `/api/memory/task-linker-stats` | 任务关联统计 |
| GET | `/api/memory/profile` | 用户画像 |
| POST | `/api/memory/profile/update` | 触发 L4 画像更新 |
| POST | `/api/memory/profile/consolidate` | 合并画像 |
| GET | `/api/memory/profile-stats` | 画像统计 |

### Perception — 感知 (`/api/perception`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/perception/ingest` | 接收单个感知事件（客户端上传入口） |
| POST | `/api/perception/ingest/batch` | 批量接收感知事件 |
| WebSocket | `/api/perception/stream` | 实时感知事件流 |
| GET | `/api/perception/events/recent` | 最近感知事件 |
| GET | `/api/perception/status` | 感知系统状态 |
| GET | `/api/perception/todo-intent/status` | Todo 意图订阅状态 |
| GET | `/api/perception/todo-intent/records/recent` | 最近 Todo 意图记录 |
| WebSocket | `/api/perception/todo-intent/stream` | Todo 意图流 |

### Audio — 音频 (`/api/audio`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/audio/transcribe` | 接收音频流 + 实时 ASR 转写 |
| POST | `/api/audio/hardware/audio` | 接收硬件设备音频 |
| GET | `/api/audio/hardware/status` | 硬件设备会话状态 |
| GET | `/api/audio/recordings` | 录音列表 |
| GET | `/api/audio/timeline` | 录音时间线 |
| GET | `/api/audio/recording/{id}/file` | 下载录音文件 |
| GET | `/api/audio/transcription/{id}` | 获取转录文本 |
| POST | `/api/audio/transcription/{id}/link` | 关联提取项到待办 |
| POST | `/api/audio/extract` | 从录音提取待办 |

### Floating Capture — 截图上传 (`/api/floating-capture`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/floating-capture/extract-todos` | 接收客户端 base64 截图并提取待办 |
| GET | `/api/floating-capture/health` | 健康检查 |

### Search — 搜索 (`/api`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/search` | 搜索截图 |
| POST | `/api/event-search` | 事件级文本搜索 |

### Vector — 向量搜索 (`/api`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/semantic-search` | 语义搜索 OCR 结果 |
| POST | `/api/event-semantic-search` | 事件级语义搜索 |
| GET | `/api/vector-stats` | 向量库统计 |
| POST | `/api/vector-sync` | 同步 SQLite 到向量库 |
| POST | `/api/vector-reset` | 重置向量库 |

### RAG — 检索增强生成 (`/api`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/rag/health` | RAG 健康检查 |
| GET | `/api/app-icon/{app_name}` | 获取应用图标 |

### Screenshot — 截图查询 (`/api/screenshots`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/screenshots` | 截图列表 |
| GET | `/api/screenshots/{id}` | 截图详情 |
| GET | `/api/screenshots/{id}/image` | 截图图片 |
| GET | `/api/screenshots/{id}/path` | 截图文件路径 |

### OCR — 文字识别 (`/api/ocr`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/ocr/process` | 手动触发 OCR 处理 |
| GET | `/api/ocr/statistics` | OCR 统计 |

### Vision — 视觉多模态 (`/api/vision`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/vision/chat` | 视觉多模态聊天（分析截图） |

### Scheduler — 任务调度 (`/api/scheduler`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/scheduler/jobs` | 所有定时任务 |
| GET | `/api/scheduler/jobs/{id}` | 任务详情 |
| POST | `/api/scheduler/jobs/{id}/pause` | 暂停任务 |
| POST | `/api/scheduler/jobs/{id}/resume` | 恢复任务 |
| PUT | `/api/scheduler/jobs/{id}/interval` | 更新任务间隔 |
| DELETE | `/api/scheduler/jobs/{id}` | 删除任务 |
| GET | `/api/scheduler/status` | 调度器状态 |
| POST | `/api/scheduler/jobs/pause-all` | 暂停所有 |
| POST | `/api/scheduler/jobs/resume-all` | 恢复所有 |

### Automation — 自动化任务 (`/api/automation`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/automation/tasks` | 自动化任务列表 |
| GET | `/api/automation/tasks/{id}` | 任务详情 |
| POST | `/api/automation/tasks` | 创建任务 |
| PUT | `/api/automation/tasks/{id}` | 更新任务 |
| DELETE | `/api/automation/tasks/{id}` | 删除任务 |
| POST | `/api/automation/tasks/{id}/run` | 执行任务 |
| POST | `/api/automation/tasks/{id}/pause` | 暂停任务 |
| POST | `/api/automation/tasks/{id}/resume` | 恢复任务 |

### Notification — 通知 (`/api/notifications`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/notifications` | 获取通知列表 |
| DELETE | `/api/notifications/{id}` | 删除通知 |

### Crawler — 爬虫 (`/api/crawler`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/crawler/config` | 获取爬虫配置 |
| POST | `/api/crawler/config` | 更新爬虫配置 |
| POST | `/api/crawler/config/keywords` | 更新关键词 |
| GET | `/api/crawler/proxy-config` | 获取代理配置 |
| POST | `/api/crawler/proxy-config` | 更新代理配置 |
| GET | `/api/crawler/cookies` | 获取所有平台 cookies |
| GET | `/api/crawler/cookies/{platform}` | 获取平台 cookies |
| POST | `/api/crawler/cookies/{platform}` | 更新平台 cookies |
| PUT | `/api/crawler/cookies/{platform}` | 保存平台 cookies（多账号） |
| POST | `/api/crawler/extract-keywords` | 从文本提取关键词 |
| GET | `/api/crawler/status` | 爬虫状态 |
| POST | `/api/crawler/start` | 启动爬虫 |
| POST | `/api/crawler/stop` | 停止爬虫 |
| POST | `/api/crawler/stop-all` | 停止所有服务 |
| GET | `/api/crawler/results` | 获取爬取结果 |
| GET | `/api/crawler/results/files` | 数据文件列表 |
| GET | `/api/crawler/results/file/{filename}` | 按文件获取结果 |
| GET | `/api/crawler/video/proxy` | 视频流代理 |
| GET | `/api/crawler/image/proxy` | 图片代理 |
| GET | `/api/crawler/daily-summary` | 今日爬取 AI 总结（流式） |
| POST | `/api/crawler/download-today-videos` | 下载今日视频（流式） |
| GET | `/api/crawler/download-today-videos/status` | 下载状态 |

### Sensor Control — 传感器管理 (`/api/sensor`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sensor/heartbeat` | 传感器心跳上报 |
| GET | `/api/sensor/config` | 传感器配置（下发给 client） |
| GET | `/api/sensor/nodes` | 已连接传感器列表 |

### Location — 位置 (`/api`)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/location/report` | 上报 GPS 位置 |
| GET | `/api/location/latest` | 最新位置 |
| GET | `/api/location/history` | 位置历史 |

### Cost Tracking — 费用追踪 (`/api/cost-tracking`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/cost-tracking/stats` | 费用统计 |
| GET | `/api/cost-tracking/config` | 费用配置 |

### Time Allocation — 时间分配 (`/api`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/time-allocation` | 时间分配数据 |

### Plugin — 插件 (`/api/plugins`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/plugins/list` | 列出所有插件 |
| GET | `/api/plugins/media-crawler/status` | MediaCrawler 状态 |
| POST | `/api/plugins/media-crawler/install` | 安装 MediaCrawler（流式） |
| POST | `/api/plugins/media-crawler/uninstall` | 卸载 MediaCrawler |

### Logs — 日志 (`/api/logs`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/logs/files` | 日志文件列表 |
| GET | `/api/logs/content` | 日志文件内容 |

### Preview — 文件预览 (`/api/preview`)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/preview/file` | 预览本地文件 |

### Omi Compat — Omi 硬件兼容层

兼容 Omi App / 硬件设备的 API 层，包含以下子模块：

| 子模块 | 说明 |
|--------|------|
| `/v4/listen` (WebSocket) | Omi 兼容实时音频转录 |
| `/v1/conversations/*` | 会话管理（列表、详情、搜索、创建、删除） |
| `/v3/memories/*` | 记忆管理（CRUD、可见性、批量删除） |
| `/v1/users/*` | 用户信息、使用量、订阅、引导、语言设置 |
| `/v2/messages/*` | 消息列表、发送、初始消息、语音消息 |
| `/v1/apps/*` | 应用相关 stub |
| `/v1/goals/*`, `/v1/folders/*` | 目标、文件夹 stub |
| `/v1/integrations/*` | 集成 stub |
| `/v1/calendar/*` | 日历 stub |

## 配置说明

主要配置文件为 `config/default_config.yaml`，运行时生成 `config/config.yaml`。

| 配置节 | 说明 |
|--------|------|
| `deployment` | 部署角色（`standalone` / `center`） |
| `server` | 服务器 host、port、debug |
| `backend_modules` | 启用的后端模块列表 |
| `perception` | 感知流配置：窗口时长、事件上限、todo_intent |
| `llm` | LLM 配置：API key、base_url、model、温度、token 数、模型价格 |
| `tavily` | Tavily 联网搜索：API key、搜索深度、最大结果数 |
| `audio` | 音频识别：ASR 配置、存储目录 |
| `vector_db` | 向量库：集合名、embedding/rerank 模型、持久化目录 |
| `chat` | 聊天：历史记录开关、历史轮数限制 |
| `agno` | Agno Agent：用户 ID、学习模式、AgentOS 配置 |
| `scheduler` | APScheduler：启用、最大线程、时区 |
| `jobs` | 定时任务：活动聚合、数据清理、DDL 提醒、音频状态检查 |
| `logging` | 日志级别、控制台/文件级别、静音模块 |
| `observability` | 可观测性：Phoenix、本地 trace、终端摘要 |
| `plugins` | 插件配置 |
| `omi_compat` | Omi 兼容层：token、uid |
| `sensor` | 远程传感器管理：截图、主动 OCR 开关与间隔（下发给 client） |

## 开发

### 代码规范

```bash
# Lint
uv run ruff check .

# Format
uv run ruff format .

# Type check
uv run pyright
```

### 数据库迁移

```bash
# 生成迁移
alembic revision --autogenerate -m "description"

# 执行迁移
alembic upgrade head
```

### 技术栈

| 类别 | 技术 |
|------|------|
| Web 框架 | FastAPI + Uvicorn |
| ORM | SQLAlchemy + SQLModel |
| 数据库 | SQLite（通过 Alembic 迁移） |
| 向量数据库 | ChromaDB + Sentence Transformers |
| LLM | OpenAI API 兼容（支持 DashScope） |
| Agent | Agno Framework |
| 任务调度 | APScheduler |
| 音频处理 | WebSocket + OpusLib + PyOgg |
| 可观测性 | OpenTelemetry + Arize Phoenix |
| 配置管理 | Dynaconf (YAML) |
| 日志 | Loguru |
| 包管理 | uv |
