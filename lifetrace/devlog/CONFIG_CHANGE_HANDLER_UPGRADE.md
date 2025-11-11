# 配置变更处理器升级文档

## 概述

本次升级将原有的简单回调模式升级为**增强型配置变更处理器模式**，提供更好的类型安全、模块化和可维护性。

## 改进内容

### 1. 新增 `ConfigChangeType` 枚举

```python
class ConfigChangeType(Enum):
    """配置变更类型枚举"""
    LLM = "llm"
    JOBS = "jobs"
    SERVER = "server"
    AUTO_ASSOCIATION = "auto_association"
    TASK_SUMMARY = "task_summary"
    ALL = "all"  # 所有配置变更
```

### 2. 新增 `ConfigChangeHandler` 协议

```python
class ConfigChangeHandler(Protocol):
    """配置变更处理器协议"""

    def handle_config_change(
        self,
        change_type: ConfigChangeType,
        old_value: dict,
        new_value: dict
    ) -> None:
        """处理配置变更"""
        ...
```

### 3. 增强 `ConfigWatcherManager`

#### 核心改进

- ✅ **按类型分发**：自动检测配置变更类型并通知对应处理器
- ✅ **类型安全**：使用 Protocol 定义处理器接口
- ✅ **向后兼容**：保留旧版回调函数支持（带警告）
- ✅ **细粒度控制**：可以针对特定配置类型注册处理器
- ✅ **自动检测**：智能检测配置变更并分发到相应处理器

#### 新增方法

```python
# 注册处理器（推荐）
config_watcher.register_handler(ConfigChangeType.LLM, llm_handler)
config_watcher.register_handler(ConfigChangeType.JOBS, job_manager)

# 取消注册处理器
config_watcher.unregister_handler(ConfigChangeType.LLM, llm_handler)

# 旧版回调（兼容，不推荐）
config_watcher.register_callback(on_config_change)
```

## 使用示例

### 实现处理器

#### 方式 1：创建独立处理器类

```python
class LLMConfigHandler:
    """LLM 配置变更处理器"""

    def handle_config_change(
        self,
        change_type: ConfigChangeType,
        old_value: dict,
        new_value: dict
    ):
        """处理 LLM 配置变更"""
        logger.info("检测到 LLM 配置变更")
        # 处理逻辑...
```

#### 方式 2：在现有类中实现协议

```python
class JobManager:
    """任务管理器 - 实现 ConfigChangeHandler 协议"""

    def handle_config_change(
        self,
        change_type: ConfigChangeType,
        old_value: dict,
        new_value: dict
    ):
        """处理配置变更"""
        if change_type == ConfigChangeType.JOBS:
            # 处理 Jobs 配置变更
            pass
        elif change_type == ConfigChangeType.AUTO_ASSOCIATION:
            # 处理自动关联配置变更
            pass
```

### 注册处理器

```python
# 创建处理器实例
llm_handler = LLMConfigHandler()
job_manager = get_job_manager()

# 注册处理器
config_watcher.register_handler(ConfigChangeType.LLM, llm_handler)
config_watcher.register_handler(ConfigChangeType.JOBS, job_manager)
config_watcher.register_handler(ConfigChangeType.AUTO_ASSOCIATION, job_manager)

# 启动监听
config_watcher.start_watching()
```

## 架构优势

### 1. 职责分离

每个处理器只关注自己的配置类型：

- `LLMConfigHandler` → LLM 配置
- `JobManager` → Jobs、自动关联、任务摘要配置
- 未来可以轻松添加新的处理器

### 2. 类型安全

使用 Protocol 和 Enum 提供更好的类型检查：

```python
# IDE 会提供自动补全和类型检查
config_watcher.register_handler(
    ConfigChangeType.LLM,  # 枚举值，有自动补全
    llm_handler  # 必须实现 handle_config_change 方法
)
```

### 3. 自动检测和分发

ConfigWatcherManager 会自动：

1. 检测哪些配置项发生变更
2. 识别变更的配置类型
3. 通知对应类型的所有处理器
4. 捕获并记录异常，不影响其他处理器

### 4. 灵活的订阅模式

可以：

- 一个处理器处理多种类型（如 JobManager）
- 多个处理器处理同一类型
- 订阅 `ConfigChangeType.ALL` 接收所有变更

## 迁移指南

### 旧代码

```python
# 旧方式 - 使用回调函数
def on_config_change(old_config: dict, new_config: dict):
    # 手动检测变更
    if old_config.get("llm") != new_config.get("llm"):
        # 处理 LLM 配置变更
        pass
    if old_config.get("jobs") != new_config.get("jobs"):
        # 处理 Jobs 配置变更
        pass

config_watcher.register_callback(on_config_change)
config_watcher.register_callback(job_manager.handle_config_change)
```

### 新代码

```python
# 新方式 - 使用处理器
llm_handler = LLMConfigHandler()
config_watcher.register_handler(ConfigChangeType.LLM, llm_handler)
config_watcher.register_handler(ConfigChangeType.JOBS, job_manager)
```

## 测试

### 手动测试

1. 启动服务器
2. 修改配置文件（如 `config.yaml`）
3. 观察日志输出

预期日志：

```
配置监听管理器已初始化（增强版）
已注册配置变更处理器: LLMConfigHandler -> llm
已注册配置变更处理器: JobManager -> jobs
...
检测到配置文件变更
通知 1 个处理器处理 llm 配置变更
检测到 LLM 配置变更
LLM 配置状态已更新: 已配置
```

### 自动测试

```python
# 创建测试处理器
class TestHandler:
    def __init__(self):
        self.called = False
        self.change_type = None

    def handle_config_change(self, change_type, old_value, new_value):
        self.called = True
        self.change_type = change_type

# 注册并测试
handler = TestHandler()
config_watcher.register_handler(ConfigChangeType.LLM, handler)

# 模拟配置变更
config_watcher._on_config_change(
    {"llm": {"model": "old"}},
    {"llm": {"model": "new"}}
)

assert handler.called
assert handler.change_type == ConfigChangeType.LLM
```

## 扩展性

### 添加新的配置类型

1. 在 `ConfigChangeType` 枚举中添加新类型
2. 在 `ConfigWatcherManager._detect_changes` 中添加检测逻辑
3. 实现对应的处理器

```python
# 1. 添加枚举
class ConfigChangeType(Enum):
    ...
    DATABASE = "database"  # 新增

# 2. 添加检测逻辑
def _detect_changes(self, old_config, new_config):
    changes = {}
    ...
    # 检查数据库配置
    old_db = old_config.get("database", {})
    new_db = new_config.get("database", {})
    if old_db != new_db:
        changes[ConfigChangeType.DATABASE] = (old_db, new_db)
    return changes

# 3. 实现处理器
class DatabaseConfigHandler:
    def handle_config_change(self, change_type, old_value, new_value):
        # 处理数据库配置变更
        pass

# 4. 注册
db_handler = DatabaseConfigHandler()
config_watcher.register_handler(ConfigChangeType.DATABASE, db_handler)
```

## 总结

这次升级提供了：

✅ 更好的代码组织和模块化  
✅ 类型安全的接口定义  
✅ 自动化的变更检测和分发  
✅ 向后兼容性  
✅ 易于扩展的架构  

同时保持了：

✅ 简单易用  
✅ 性能高效  
✅ 异常安全  

这是一个既保持简单性又提供强大功能的优雅方案！
