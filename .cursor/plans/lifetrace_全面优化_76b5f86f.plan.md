---
name: LifeTrace 全面优化
overview: 针对 LifeTrace 项目的 6 个核心问题（启动速度、打包体积、插件系统、Todo 标准、社交媒体集成、依赖清理）制定系统性的优化方案。
todos:
  - id: startup-optimization
    content: 启动速度优化：数据库懒加载、后台任务异步启动、路由延迟导入、Electron 预启动优化
    status: pending
  - id: dependency-cleanup
    content: 依赖项清理：移除未使用依赖、创建依赖分组、重构 pyproject.toml
    status: pending
  - id: package-size
    content: 打包体积优化：分离大型依赖为可选扩展、替换重型依赖、优化 PyInstaller 配置
    status: pending
  - id: icalendar-support
    content: iCalendar 标准支持：添加缺失字段、创建 ICS 导入/导出服务、添加 API 端点
    status: pending
  - id: plugin-system
    content: 插件系统：设计插件接口、实现前端插件注册表和懒加载、实现后端插件系统
    status: pending
  - id: telegram-integration
    content: Telegram Bot 集成：创建 Bot 模块、实现消息处理、添加 Webhook 路由
    status: pending
  - id: feishu-integration
    content: 飞书 Bot 集成：创建 Bot 模块、实现事件回调、添加 Webhook 路由
    status: pending
isProject: false
---

# LifeTrace 全面优化计划

## 问题 1: 启动速度优化（目标: 4秒 -> 1秒内）

### 当前瓶颈分析

根据代码分析，主要耗时点：

- 数据库初始化（含 30+ 索引创建）：1-3 秒
- 后台任务同步初始化：2-5 秒
- Python 模块导入：0.5-1 秒
- Electron + Next.js 启动：额外 1-2 秒

### 优化方案

**1.1 数据库初始化异步化**

修改 [`lifetrace/storage/database.py`](lifetrace/storage/database.py)：

- 将模块级的 `db_base = DatabaseBase()` 改为懒加载
- 索引创建改为后台异步执行（应用启动后延迟执行）
```python
# 改为懒加载单例
_db_base: DatabaseBase | None = None

def get_db_base() -> DatabaseBase:
    global _db_base
    if _db_base is None:
        _db_base = DatabaseBase()
    return _db_base
```


**1.2 后台任务延迟启动**

修改 [`lifetrace/server.py`](lifetrace/server.py) 的 lifespan：

- `job_manager.start_all()` 改为异步执行
- 使用 `asyncio.create_task()` 并行启动各任务

**1.3 路由模块延迟导入**

使用 Python 的 `importlib` 实现路由模块的按需导入，或者在 lifespan 中注册路由。

**1.4 Electron 预启动优化**

修改 [`electron/main.ts`](frontend/electron/main.ts)：

- 先显示启动画面/骨架屏
- 后端和前端服务并行启动
- 减少健康检查等待时间（目前最多 180 秒）

---

## 问题 2: 打包体积优化（目标: 2.6GB -> 500MB 以内）

### 当前体积构成分析

根据 [`pyinstaller.spec`](lifetrace/pyinstaller.spec) 分析：

- `torch` + `transformers`（sentence-transformers 间接依赖）：约 2-3GB
- `chromadb`：约 100-200MB
- `faster-whisper`：约 200-500MB
- `opencv-python`：约 50-100MB
- OCR 模型文件：约 50MB

### 优化方案

**2.1 分离大型依赖为可选扩展包**

修改 [`pyproject.toml`](pyproject.toml)：

```toml
[dependency-groups]
# 核心依赖（必需）
core = [
    "fastapi>=0.100.0",
    "uvicorn[standard]>=0.20.0",
    "pydantic>=2.0.0",
    "sqlalchemy>=2.0.0",
    # ... 基础依赖
]

# 向量搜索扩展（可选下载）
vector = [
    "sentence-transformers>=2.2.0",
    "chromadb>=0.4.0",
]

# 语音识别扩展（可选下载）
audio = [
    "faster-whisper>=1.0.0",
    "pyaudio>=0.2.14",
]
```

**2.2 替换重型依赖**

- **sentence-transformers** -> 使用 API 调用（如 OpenAI Embeddings）或轻量级本地模型
- **chromadb** -> 考虑使用 SQLite FTS5 全文搜索作为基础功能
- **opencv-python** -> 使用 `opencv-python-headless`（减少约 30MB）

**2.3 PyInstaller 优化**

修改 [`pyinstaller.spec`](lifetrace/pyinstaller.spec)：

- 排除未使用的子模块
- 使用 `--exclude-module` 排除测试和文档模块
- 考虑使用 `upx=True` 压缩（需测试兼容性）

**2.4 考虑替代打包方案**

- **Nuitka**：Python 编译为 C，体积更小、启动更快
- **PyOxidizer**：Rust 实现的打包工具，体积优化更好

---

## 问题 3: 插件系统设计

### 目标

实现一个完善的插件系统，支持：

- 内置模块的启用/禁用
- 按需加载减少初始加载时间
- 第三方插件开发和安装

### 架构设计

```
插件系统架构
├── 核心插件接口
│   ├── PanelPlugin（前端面板插件）
│   ├── BackendPlugin（后端服务插件）
│   └── AgentToolPlugin（Agent 工具插件）
├── 插件注册表（Registry）
│   ├── 内置插件列表
│   └── 第三方插件列表
└── 插件加载器（Loader）
    ├── 前端：动态导入 + React.lazy
    └── 后端：Python importlib + 依赖注入
```

**3.1 前端插件系统**

创建 [`lib/plugins/`](frontend/lib/plugins/) 目录：

```typescript
// lib/plugins/types.ts
interface PanelPlugin {
  id: string;
  name: string;
  icon: string;
  version: string;
  dependencies?: string[];
  component: () => Promise<{ default: React.ComponentType }>;
  enabled: boolean;
}

// lib/plugins/registry.ts
class PluginRegistry {
  private plugins: Map<string, PanelPlugin> = new Map();

  register(plugin: PanelPlugin): void;
  get(id: string): PanelPlugin | undefined;
  getEnabled(): PanelPlugin[];
  setEnabled(id: string, enabled: boolean): void;
}
```

修改 [`components/layout/PanelContent.tsx`](frontend/components/layout/PanelContent.tsx)：

- 从硬编码 if-else 改为注册表驱动
- 使用 `React.lazy()` + `Suspense` 实现懒加载

**3.2 后端插件系统**

创建 [`lifetrace/plugins/`](lifetrace/plugins/) 目录：

```python
# lifetrace/plugins/base.py
class BackendPlugin(ABC):
    id: str
    name: str
    version: str
    dependencies: list[str] = []

    @abstractmethod
    def register_routes(self, app: FastAPI) -> None: ...

    @abstractmethod
    def startup(self) -> None: ...

    @abstractmethod
    def shutdown(self) -> None: ...
```

**3.3 插件配置持久化**

在 [`config/config.yaml`](lifetrace/config/config.yaml) 中添加：

```yaml
plugins:
  enabled:
    - todos
    - calendar
    - chat
  disabled:
    - achievements
    - debugShots
  third_party:
    - path: ~/.freetodo/plugins/my-plugin
```

---

## 问题 4: Todo 标准统一（iCalendar/ICS 格式）

### 当前 Todo 模型与 iCalendar VTODO 对照

| 当前字段 | iCalendar 属性 | 说明 |

|---------|---------------|------|

| `id` | `UID` | 唯一标识符 |

| `name` | `SUMMARY` | 摘要/标题 |

| `description` | `DESCRIPTION` | 详细描述 |

| `deadline` | `DUE` | 截止时间 |

| `start_time` | `DTSTART` | 开始时间 |

| `status` | `STATUS` | 状态（需映射） |

| `priority` | `PRIORITY` | 优先级（需映射） |

| `created_at` | `CREATED` | 创建时间 |

| `updated_at` | `LAST-MODIFIED` | 修改时间 |

| - | `COMPLETED` | 完成时间（需添加） |

| - | `PERCENT-COMPLETE` | 完成百分比（可选） |

| - | `CATEGORIES` | 分类/标签 |

| - | `RRULE` | 重复规则（可选） |

### 实现方案

**4.1 添加缺失字段**

修改 [`lifetrace/storage/models.py`](lifetrace/storage/models.py)：

```python
class Todo(TimestampMixin, table=True):
    # 新增字段
    completed_at: datetime | None = None  # 完成时间
    percent_complete: int = Field(default=0, ge=0, le=100)  # 完成百分比
    rrule: str | None = None  # iCalendar RRULE 格式的重复规则
    uid: str = Field(default_factory=lambda: str(uuid.uuid4()))  # 全局唯一ID
```

**4.2 添加 iCalendar 服务**

创建 [`lifetrace/services/icalendar_service.py`](lifetrace/services/icalendar_service.py)：

```python
from icalendar import Calendar, Todo as VTodo

class ICalendarService:
    def export_todos(self, todos: list[Todo]) -> str:
        """导出为 ICS 格式"""

    def import_todos(self, ics_content: str) -> list[TodoCreate]:
        """从 ICS 格式导入"""

    def _status_to_ical(self, status: str) -> str:
        """状态映射：active->NEEDS-ACTION, completed->COMPLETED, canceled->CANCELLED"""
```

**4.3 添加 API 端点**

修改 [`lifetrace/routers/todo.py`](lifetrace/routers/todo.py)：

```python
@router.get("/export/ics")
async def export_ics(status: str | None = None) -> Response:
    """导出为 ICS 文件"""

@router.post("/import/ics")
async def import_ics(file: UploadFile) -> list[TodoResponse]:
    """从 ICS 文件导入"""
```

**4.4 添加依赖**

```toml
dependencies = [
    "icalendar>=6.0.0",  # iCalendar 解析/生成库
]
```

---

## 问题 5: 社交媒体 Agent 集成（Telegram + 飞书）

### 架构设计

```
用户设备 (PC)                    社交媒体平台
    │                                │
    ├── FreeTodo Server ◄────────────┤
    │   ├── Agent Gateway            │
    │   │   ├── Telegram Bot ◄───────┼── Telegram API
    │   │   └── Feishu Bot ◄─────────┼── 飞书开放平台
    │   └── AgnoAgentService         │
    │       └── FreeTodoToolkit      │
    └────────────────────────────────┘
```

**5.1 Telegram Bot 集成**

创建 [`lifetrace/integrations/telegram/`](lifetrace/integrations/telegram/) 目录：

```python
# lifetrace/integrations/telegram/bot.py
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler

class FreeTodoTelegramBot:
    def __init__(self, token: str, agent_service: AgnoAgentService):
        self.app = Application.builder().token(token).build()
        self.agent = agent_service

    async def handle_message(self, update: Update, context):
        """处理用户消息，转发给 Agent"""
        response = await self.agent.chat(update.message.text)
        await update.message.reply_text(response)
```

添加依赖：

```toml
[dependency-groups]
telegram = ["python-telegram-bot>=21.0"]
```

**5.2 飞书 Bot 集成**

创建 [`lifetrace/integrations/feishu/`](lifetrace/integrations/feishu/) 目录：

```python
# lifetrace/integrations/feishu/bot.py
import httpx

class FreeTodoFeishuBot:
    def __init__(self, app_id: str, app_secret: str, agent_service: AgnoAgentService):
        self.app_id = app_id
        self.app_secret = app_secret
        self.agent = agent_service

    async def handle_event(self, event: dict):
        """处理飞书事件回调"""

    async def send_message(self, open_id: str, content: str):
        """发送消息给用户"""
```

添加依赖：

```toml
[dependency-groups]
feishu = ["lark-oapi>=1.0.0"]
```

**5.3 统一网关路由**

修改 [`lifetrace/routers/`](lifetrace/routers/) 添加：

```python
# lifetrace/routers/integrations.py
@router.post("/telegram/webhook")
async def telegram_webhook(update: dict):
    """Telegram Webhook 回调"""

@router.post("/feishu/webhook")
async def feishu_webhook(event: dict):
    """飞书事件回调"""
```

**5.4 配置管理**

修改 [`config/config.yaml`](lifetrace/config/config.yaml)：

```yaml
integrations:
  telegram:
    enabled: false
    bot_token: ""
  feishu:
    enabled: false
    app_id: ""
    app_secret: ""
    verification_token: ""
```

---

## 问题 6: 依赖项清理

### 可能未使用的依赖

根据代码分析，以下依赖可能未使用或使用较少：

| 依赖 | 状态 | 建议 |

|-----|------|------|

| `wikipedia>=1.4.0` | 未找到导入 | 移除或移至可选 |

| `arxiv>=2.4.0` | 未找到导入 | 移除或移至可选 |

| `whisperlivekit>=0.1.0` | 未找到导入 | 移除或移至可选 |

| `python-socks>=2.0.0` | websockets 可选依赖 | 如不需代理可移除 |

| `opencc-python-reimplemented` | 繁简转换，使用较少 | 移至可选 |

### 清理步骤

1. 使用 `pip-autoremove` 或手动检查每个依赖的实际使用情况
2. 运行测试确保移除后功能正常
3. 更新 `pyproject.toml` 和 `uv.lock`

### 依赖分组重构

```toml
[project]
dependencies = [
    # 仅保留核心必需依赖
    "fastapi>=0.100.0",
    "uvicorn[standard]>=0.20.0",
    "pydantic>=2.0.0",
    "sqlalchemy>=2.0.0",
    "sqlmodel>=0.0.22",
    "alembic>=1.14.0",
    "apscheduler>=3.10.0",
    "dynaconf[yaml]>=3.2.0",
    "loguru>=0.7.3",
    "psutil>=5.9.0",
    "pyyaml>=6.0",
    "openai>=1.0.0",
    "agno>=2.4.1",
    # OCR 核心
    "mss>=9.0.0",
    "Pillow>=10.0.0",
    "rapidocr-onnxruntime",
    "numpy>=1.21.0,<2.0.0",
]

[dependency-groups]
dev = ["pre-commit>=4.4.0", "ruff>=0.14.4", "pyinstaller>=6.0.0"]
vector = ["sentence-transformers>=2.2.0", "chromadb>=0.4.0", "scipy>=1.9.0", "hdbscan>=0.8.0"]
audio = ["faster-whisper>=1.0.0", "pyaudio>=0.2.14"]
search = ["ddgs>=8.0.0", "tavily-python>=0.5.0"]
telegram = ["python-telegram-bot>=21.0"]
feishu = ["lark-oapi>=1.0.0"]
calendar = ["icalendar>=6.0.0"]
```

---

## 实施优先级建议

| 优先级 | 任务 | 预计影响 |

|-------|------|---------|

| P0 | 启动速度优化 | 用户体验大幅提升 |

| P0 | 依赖项清理 + 分组 | 为体积优化做准备 |

| P1 | 打包体积优化 | 下载和安装体验改善 |

| P1 | iCalendar 标准支持 | 与其他日历软件互通 |

| P2 | 插件系统（模块化懒加载） | 代码架构改善 |

| P2 | Telegram 集成 | 新功能 |

| P3 | 飞书集成 | 新功能 |

| P3 | 插件系统（第三方支持） | 生态建设 |
