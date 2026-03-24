# Memory 模块代码设计（MVP）

> 本文档是 [Memory 模块设计](./1-2_Memory模块设计.md) 的代码实现方案。
> MVP 只实现**方案 A（Memory-as-File）**：感知流写入 Markdown 文件 + LLM 压缩 + 基础检索 + Agent Skill 封装。
> Memory 是与 Perception 同级别的核心模块。

---

## 一、模块在系统中的位置

```
lifetrace/
├── perception/          # 感知模块（已有）
│   ├── models.py
│   ├── stream.py
│   ├── manager.py
│   └── adapters/
├── memory/              # 记忆模块（本文档设计）
│   ├── __init__.py
│   ├── models.py        # 数据模型
│   ├── writer.py        # L0 写入器
│   ├── compressor.py    # L1 压缩器
│   ├── reader.py        # 检索引擎
│   ├── manager.py       # 生命周期管理
│   └── config.py        # 配置
├── llm/
│   └── agno_tools/
│       └── tools/
│           └── memory_tools.py   # Agent Skill（MemoryToolkit）
├── routers/
│   └── memory.py        # HTTP API
└── core/
    └── module_registry.py  # 注册 memory 模块
```

**与 Perception 的关系：**

```
PerceptionStream ──subscribe──▶ MemoryWriter.on_event()
                                    │
                                    ▼
                              memory/raw/2026-02-24.md（追加写入）
```

Memory 通过订阅 PerceptionStream，自动接收所有感知事件并持久化。两个模块通过发布-订阅解耦，Memory 不依赖 Perception 的内部实现。

---

## 二、数据模型（models.py）

```python
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class MemoryLevel(str, Enum):
    RAW = "raw"           # L0 原始感知流
    EVENT = "event"       # L1 事件摘要
    ACTIVITY = "activity" # L2 活动聚合（远期）
    SUMMARY = "summary"   # L3 日/周摘要（远期）
    ENTITY = "entity"     # 实体档案


class MemoryEntry(BaseModel):
    """单条记忆记录（内存中的表示）"""
    timestamp: datetime
    source: str              # 来源通道（mic_pc / ocr_screen / ...）
    speaker: str | None = None
    app: str | None = None
    target: str | None = None
    content: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class EventSummary(BaseModel):
    """L1 事件摘要"""
    title: str
    time_start: datetime
    time_end: datetime | None = None
    participants: list[str] = Field(default_factory=list)
    source: str
    summary: str
    action_items: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class MemorySearchResult(BaseModel):
    """检索结果"""
    level: MemoryLevel
    file_path: str
    date: str
    content: str
    relevance_hint: str | None = None
```

---

## 三、L0 写入器（writer.py）

核心职责：将 PerceptionEvent 实时追加写入每日 Markdown 文件。

### 3.1 文件格式

每日文件路径：`{memory_dir}/raw/{YYYY-MM-DD}.md`

```markdown
# 2026-02-24 感知记录

## 09:15 | mic_pc | self
嗯今天先把论文第三章的实验数据整理一下

## 09:17 | ocr_screen | wechat | 张教授
论文进展如何了？上周说的实验数据补充了吗？

## 09:20 | ocr_screen | wechat | self → 张教授
张老师好，实验数据正在整理中，预计今天下午能完成初步分析
```

### 3.2 核心逻辑

```python
import asyncio
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from lifetrace.perception.models import PerceptionEvent

class MemoryWriter:
    """Append-only writer: PerceptionEvent → daily Markdown file."""

    def __init__(self, memory_dir: Path):
        self._memory_dir = memory_dir
        self._raw_dir = memory_dir / "raw"
        self._raw_dir.mkdir(parents=True, exist_ok=True)
        self._lock = asyncio.Lock()
        self._current_date: str | None = None
        self._current_file: Path | None = None
        self._write_count = 0

    async def on_event(self, event: PerceptionEvent) -> None:
        """PerceptionStream 的订阅回调。"""
        line = self._format_event(event)
        date_str = event.timestamp.strftime("%Y-%m-%d")

        async with self._lock:
            if date_str != self._current_date:
                self._rotate_file(date_str)

            with open(self._current_file, "a", encoding="utf-8") as f:
                f.write(line)
            self._write_count += 1

    def _format_event(self, event: PerceptionEvent) -> str:
        ts = event.timestamp.strftime("%H:%M")
        source = event.source.value

        parts = [ts, source]
        meta = event.metadata
        if meta.get("app"):
            parts.append(meta["app"])
        if meta.get("speaker"):
            speaker = meta["speaker"]
            if meta.get("target"):
                speaker = f"{speaker} → {meta['target']}"
            parts.append(speaker)

        header = " | ".join(parts)
        content = event.content_text.strip()
        return f"\n## {header}\n{content}\n"

    def _rotate_file(self, date_str: str) -> None:
        self._current_date = date_str
        self._current_file = self._raw_dir / f"{date_str}.md"
        if not self._current_file.exists():
            with open(self._current_file, "w", encoding="utf-8") as f:
                f.write(f"# {date_str} 感知记录\n")

    def get_stats(self) -> dict:
        return {
            "current_date": self._current_date,
            "write_count": self._write_count,
            "raw_dir": str(self._raw_dir),
        }
```

**关键设计决策：**

| 决策 | 说明 |
|:---|:---|
| **asyncio.Lock** | 保证并发写入的文件一致性，与 PerceptionStream 的 async 模型一致 |
| **日期轮转** | 自动检测日期变化，创建新文件并写入标题 |
| **append-only** | 只追加不修改，原始数据不可变 |
| **UTF-8** | 显式指定编码，避免 Windows 默认编码问题 |

---

## 四、L1 压缩器（compressor.py）

核心职责：读取当天的 L0 原始文件，调用 LLM 生成结构化事件摘要。

### 4.1 输出格式

压缩后文件路径：`{memory_dir}/events/{YYYY-MM-DD}.md`

```markdown
# 2026-02-24 事件摘要

## Event: 与导师微信沟通论文进展
- **时间**: 09:17 - 09:25
- **参与人**: 张教授
- **来源**: 微信（屏幕感知 + 麦克风）
- **摘要**: 导师询问论文进展，回复实验数据正在整理中
- **待办**: 下午完成实验数据初步分析
- **标签**: #论文项目 #张教授
```

### 4.2 核心逻辑

```python
from pathlib import Path

class MemoryCompressor:
    """L0 raw → L1 event summaries via LLM."""

    def __init__(self, memory_dir: Path, llm_client):
        self._memory_dir = memory_dir
        self._raw_dir = memory_dir / "raw"
        self._events_dir = memory_dir / "events"
        self._events_dir.mkdir(parents=True, exist_ok=True)
        self._llm = llm_client

    async def compress_day(self, date_str: str) -> Path | None:
        """压缩指定日期的 L0 文件为 L1 事件摘要。"""
        raw_file = self._raw_dir / f"{date_str}.md"
        if not raw_file.exists():
            return None

        raw_content = raw_file.read_text(encoding="utf-8")
        if len(raw_content.strip()) < 50:
            return None

        prompt = self._build_compress_prompt(raw_content, date_str)
        summary = await self._llm.chat(prompt)

        events_file = self._events_dir / f"{date_str}.md"
        events_file.write_text(summary, encoding="utf-8")
        return events_file

    def _build_compress_prompt(self, raw_content: str, date_str: str) -> str:
        return f"""你是一个个人记忆管理助手。以下是 {date_str} 的原始感知记录。
请提取所有有意义的事件，生成结构化摘要。

要求：
1. 每个事件包含：标题、时间范围、参与人、来源、摘要、待办（如果有）、标签
2. 合并时间相近且主题相关的碎片记录为一个事件
3. 忽略无意义的噪声数据
4. 输出格式为 Markdown

原始记录：
{raw_content}"""
```

**触发时机：**
- 每天结束时（如 23:59）由调度器自动触发
- 用户手动触发（通过 API 或 Agent Skill）
- 应用启动时检查前一天是否已压缩

---

## 五、检索引擎（reader.py）

MVP 阶段实现两种基础检索，不引入向量数据库。

### 5.1 检索策略

| 检索方式 | 实现 | 适用场景 |
|:---|:---|:---|
| **时间检索** | 根据日期直接定位 raw/ 或 events/ 下的文件 | "昨天发生了什么" |
| **关键词搜索** | 遍历文件内容做全文匹配 | "找到关于张教授的对话" |
| **LLM 精排**（可选） | 将候选片段交给 LLM 排序和回答 | 模糊/复杂查询 |

### 5.2 核心逻辑

```python
from pathlib import Path
from datetime import datetime, timedelta

class MemoryReader:
    """File-based memory retrieval engine."""

    def __init__(self, memory_dir: Path):
        self._memory_dir = memory_dir
        self._raw_dir = memory_dir / "raw"
        self._events_dir = memory_dir / "events"

    def read_by_date(
        self, date_str: str, level: str = "events"
    ) -> str | None:
        """读取指定日期的记忆文件。优先返回 events（L1），回退到 raw（L0）。"""
        if level == "events":
            events_file = self._events_dir / f"{date_str}.md"
            if events_file.exists():
                return events_file.read_text(encoding="utf-8")

        raw_file = self._raw_dir / f"{date_str}.md"
        if raw_file.exists():
            return raw_file.read_text(encoding="utf-8")
        return None

    def search_keyword(
        self,
        keyword: str,
        days: int = 7,
        max_results: int = 10,
    ) -> list[dict]:
        """在最近 N 天的文件中搜索关键词。"""
        results = []
        today = datetime.now()

        for i in range(days):
            date = today - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")

            for subdir_name in ("events", "raw"):
                subdir = self._memory_dir / subdir_name
                file_path = subdir / f"{date_str}.md"
                if not file_path.exists():
                    continue

                content = file_path.read_text(encoding="utf-8")
                if keyword.lower() not in content.lower():
                    continue

                snippets = self._extract_matching_sections(
                    content, keyword
                )
                for snippet in snippets:
                    results.append({
                        "date": date_str,
                        "level": subdir_name,
                        "snippet": snippet,
                    })

                    if len(results) >= max_results:
                        return results
        return results

    def list_available_dates(self) -> list[str]:
        """列出所有有记忆文件的日期。"""
        dates = set()
        for subdir in (self._raw_dir, self._events_dir):
            if subdir.exists():
                for f in subdir.glob("*.md"):
                    dates.add(f.stem)
        return sorted(dates, reverse=True)

    def _extract_matching_sections(
        self, content: str, keyword: str, context_lines: int = 5
    ) -> list[str]:
        """从文件中提取包含关键词的段落片段。"""
        lines = content.split("\n")
        keyword_lower = keyword.lower()
        snippets = []

        for i, line in enumerate(lines):
            if keyword_lower in line.lower():
                start = max(0, i - context_lines)
                end = min(len(lines), i + context_lines + 1)
                snippet = "\n".join(lines[start:end])
                snippets.append(snippet)
        return snippets
```

---

## 六、生命周期管理（manager.py）

参照 `PerceptionStreamManager` 的模式，统一管理 Memory 模块的初始化、启停和状态。

```python
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from lifetrace.memory.writer import MemoryWriter
from lifetrace.memory.compressor import MemoryCompressor
from lifetrace.memory.reader import MemoryReader

if TYPE_CHECKING:
    from lifetrace.perception.stream import PerceptionStream


class MemoryManager:
    """Manage Memory module lifecycle: writer + compressor + reader."""

    def __init__(self, config: dict | None = None):
        config = dict(config or {})
        memory_base = config.get(
            "memory_dir", "./data/memory"
        )
        self._memory_dir = Path(memory_base)
        self._memory_dir.mkdir(parents=True, exist_ok=True)

        self.writer = MemoryWriter(self._memory_dir)
        self.reader = MemoryReader(self._memory_dir)
        self.compressor: MemoryCompressor | None = None

        self._config = config
        self._subscribed = False

    async def start(
        self, perception_stream: PerceptionStream | None = None
    ) -> None:
        """启动 Memory 模块，订阅感知流。"""
        if perception_stream and not self._subscribed:
            perception_stream.subscribe(self.writer.on_event)
            self._subscribed = True

    async def stop(
        self, perception_stream: PerceptionStream | None = None
    ) -> None:
        """停止 Memory 模块，取消订阅。"""
        if perception_stream and self._subscribed:
            perception_stream.unsubscribe(self.writer.on_event)
            self._subscribed = False

    def get_status(self) -> dict:
        return {
            "memory_dir": str(self._memory_dir),
            "subscribed": self._subscribed,
            "writer": self.writer.get_stats(),
            "available_dates": self.reader.list_available_dates()[:10],
        }


# --- Singleton access pattern (与 perception/manager.py 一致) ---

_manager: MemoryManager | None = None


async def init_memory_manager(
    config: dict | None = None,
    perception_stream: PerceptionStream | None = None,
) -> MemoryManager:
    global _manager
    if _manager is None:
        _manager = MemoryManager(config=config)
        await _manager.start(perception_stream)
    return _manager


async def shutdown_memory_manager() -> None:
    global _manager
    if _manager is None:
        return
    await _manager.stop()
    _manager = None


def get_memory_manager() -> MemoryManager:
    if _manager is None:
        raise RuntimeError(
            "MemoryManager not initialized. Call init_memory_manager() at startup."
        )
    return _manager


def try_get_memory_manager() -> MemoryManager | None:
    return _manager
```

---

## 七、Agent Skill 封装（memory_tools.py）

将 Memory 的读写能力封装为 Agno Toolkit，供对话 Agent 在聊天中调用。
参照现有 `FreeTodoToolkit` 的模式。

### 7.1 Skill 定义

```python
"""Memory Tools for Agno Agent

Provides memory read/search capabilities as Agent skills.
"""
from __future__ import annotations

from agno.tools import Toolkit

from lifetrace.memory.manager import get_memory_manager
from lifetrace.util.logging_config import get_logger

logger = get_logger()


class MemoryToolkit(Toolkit):
    """Memory Toolkit - 个人记忆检索工具

    Tools:
    - recall_today: 回忆今天发生了什么
    - recall_date: 回忆指定日期发生了什么
    - search_memory: 按关键词搜索记忆
    - list_memory_dates: 列出有记忆的日期
    """

    def __init__(self, selected_tools: list[str] | None = None, **kwargs):
        all_tools = {
            "recall_today": self.recall_today,
            "recall_date": self.recall_date,
            "search_memory": self.search_memory,
            "list_memory_dates": self.list_memory_dates,
        }

        if selected_tools:
            tools = [
                all_tools[name]
                for name in selected_tools
                if name in all_tools
            ]
        else:
            tools = list(all_tools.values())

        super().__init__(name="memory_toolkit", tools=tools, **kwargs)

    def recall_today(self) -> str:
        """回忆今天发生了什么。

        Returns:
            今天的事件摘要或原始记录
        """
        from datetime import datetime

        mgr = get_memory_manager()
        today = datetime.now().strftime("%Y-%m-%d")
        content = mgr.reader.read_by_date(today)
        if content:
            return content
        return f"今天（{today}）还没有任何记忆记录。"

    def recall_date(self, date: str) -> str:
        """回忆指定日期发生了什么。

        Args:
            date: 日期，格式 YYYY-MM-DD

        Returns:
            该日期的事件摘要或原始记录
        """
        mgr = get_memory_manager()
        content = mgr.reader.read_by_date(date)
        if content:
            return content
        return f"{date} 没有找到记忆记录。"

    def search_memory(
        self, keyword: str, days: int = 7
    ) -> str:
        """按关键词搜索最近的记忆。

        Args:
            keyword: 搜索关键词
            days: 搜索最近多少天（默认7天）

        Returns:
            匹配的记忆片段
        """
        mgr = get_memory_manager()
        results = mgr.reader.search_keyword(
            keyword, days=days, max_results=5
        )
        if not results:
            return f"在最近 {days} 天内没有找到与「{keyword}」相关的记忆。"

        output = f"找到 {len(results)} 条与「{keyword}」相关的记忆：\n\n"
        for r in results:
            output += f"### {r['date']}（{r['level']}）\n"
            output += r["snippet"] + "\n\n"
        return output

    def list_memory_dates(self) -> str:
        """列出所有有记忆记录的日期。

        Returns:
            日期列表
        """
        mgr = get_memory_manager()
        dates = mgr.reader.list_available_dates()
        if not dates:
            return "还没有任何记忆记录。"
        return "有记忆记录的日期：\n" + "\n".join(
            f"- {d}" for d in dates[:30]
        )
```

### 7.2 注册到 Agent

在 `agno_agent.py` 或对话构建流程中，将 MemoryToolkit 注册为可用工具：

```python
from lifetrace.llm.agno_tools.memory_tools import MemoryToolkit

memory_toolkit = MemoryToolkit(
    selected_tools=["recall_today", "recall_date", "search_memory"]
)
agent = Agent(tools=[freetodo_toolkit, memory_toolkit, ...])
```

当用户在对话中说"我今天做了什么"、"上周和张教授聊了什么"时，Agent 会自动调用 MemoryToolkit 的对应方法。

---

## 八、HTTP API（routers/memory.py）

提供 REST 接口，前端和外部工具可通过 HTTP 访问 Memory。

```python
from fastapi import APIRouter, Query

from lifetrace.memory.manager import get_memory_manager

router = APIRouter(prefix="/api/memory", tags=["memory"])


@router.get("/today")
async def get_today_memory():
    from datetime import datetime

    mgr = get_memory_manager()
    today = datetime.now().strftime("%Y-%m-%d")
    content = mgr.reader.read_by_date(today)
    return {"date": today, "content": content}


@router.get("/date/{date_str}")
async def get_memory_by_date(date_str: str):
    mgr = get_memory_manager()
    content = mgr.reader.read_by_date(date_str)
    return {"date": date_str, "content": content}


@router.get("/search")
async def search_memory(
    keyword: str = Query(...),
    days: int = Query(default=7, ge=1, le=90),
):
    mgr = get_memory_manager()
    results = mgr.reader.search_keyword(keyword, days=days)
    return {"keyword": keyword, "days": days, "results": results}


@router.get("/dates")
async def list_memory_dates():
    mgr = get_memory_manager()
    dates = mgr.reader.list_available_dates()
    return {"dates": dates}


@router.get("/status")
async def get_memory_status():
    mgr = get_memory_manager()
    return mgr.get_status()


@router.post("/compress/{date_str}")
async def trigger_compress(date_str: str):
    mgr = get_memory_manager()
    if mgr.compressor is None:
        return {"error": "Compressor not configured"}
    path = await mgr.compressor.compress_day(date_str)
    return {
        "date": date_str,
        "compressed": path is not None,
        "path": str(path) if path else None,
    }
```

---

## 九、模块注册

在 `module_registry.py` 中注册 Memory 模块：

```python
ModuleDefinition(
    id="memory",
    router_module="lifetrace.routers.memory",
    requires=("perception",),
),
```

Memory 依赖 Perception（需要订阅感知流），通过 `requires` 声明。

---

## 十、启动流程

在应用启动时（如 `main.py` 的 lifespan），按顺序初始化：

```python
# 1. 启动 Perception
perception_mgr = await init_perception_manager(config.perception)

# 2. 启动 Memory，绑定到 Perception Stream
memory_mgr = await init_memory_manager(
    config=config.memory,
    perception_stream=perception_mgr.stream,
)

# 应用关闭时
await shutdown_memory_manager()
await shutdown_perception_manager()
```

---

## 十一、目录存储结构（运行时）

```
data/
└── memory/
    ├── raw/                          # L0 原始感知流
    │   ├── 2026-02-24.md
    │   ├── 2026-02-23.md
    │   └── ...
    ├── events/                       # L1 事件摘要（压缩后生成）
    │   ├── 2026-02-24.md
    │   └── ...
    └── entities/                     # 实体档案（远期）
        ├── 张教授.md
        └── ...
```

所有文件均为 UTF-8 编码的 Markdown，用户可直接用编辑器打开查看和修改。

---

## 十二、配置项

```yaml
memory:
  enabled: true
  memory_dir: "./data/memory"        # 记忆文件存储根目录
  auto_compress: true                # 是否自动压缩 L0 → L1
  compress_schedule: "0 0 * * *"     # 每天 00:00 触发压缩（cron 格式）
  search_default_days: 7             # 默认搜索天数
```

---

## 十三、MVP 实现步骤

| 步骤 | 内容 | 预估工作量 |
|:---|:---|:---|
| **Step 1** | 创建 `memory/` 模块骨架（models, writer, reader, manager） | 0.5 天 |
| **Step 2** | 实现 MemoryWriter，订阅 PerceptionStream 写入 .md 文件 | 0.5 天 |
| **Step 3** | 实现 MemoryReader（时间检索 + 关键词搜索） | 0.5 天 |
| **Step 4** | 实现 HTTP API（routers/memory.py）+ 模块注册 | 0.5 天 |
| **Step 5** | 实现 MemoryToolkit（Agent Skill）并注册到 Agent | 0.5 天 |
| **Step 6** | 实现 MemoryCompressor（L1 压缩），接入调度器 | 1 天 |
| **Step 7** | 端到端测试：感知 → 记忆写入 → 搜索 → Agent 调用 | 0.5 天 |

总计约 **4 天**完成 MVP。

---

## 十四、与现有代码的对接点

| 对接点 | 现有组件 | Memory 侧 |
|:---|:---|:---|
| 数据输入 | `PerceptionStream.subscribe()` | `MemoryWriter.on_event()` |
| Agent 调用 | `AgnoAgent` 的 tools 列表 | `MemoryToolkit` |
| HTTP 服务 | `FastAPI app.include_router()` | `routers/memory.py` |
| 模块注册 | `module_registry.MODULES` | 添加 `ModuleDefinition(id="memory", ...)` |
| 配置管理 | `dynaconf settings` | `memory:` 配置节 |
| 定时任务 | `APScheduler` | L1 压缩的定时触发 |

---

*最后更新：2026年2月24日*
