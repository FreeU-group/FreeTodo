# Jobs 和配置监听重构文档

## 重构概述

本次重构将 `server.py` 中的后台任务管理和配置监听逻辑抽象到独立的管理器模块中，提高了代码的可维护性和可测试性。

## 重构内容

### 1. 新增模块

#### 1.1 JobManager (`lifetrace/jobs/job_manager.py`)

**功能**：统一管理所有后台任务的启动、停止和配置更新

**主要方法**：
- `start_all()`: 启动所有后台任务
  - 启动调度器
  - 启动录制器任务
  - 启动 OCR 任务
  - 启动自动关联服务
  - 启动任务摘要服务

- `stop_all()`: 停止所有后台任务
  - 停止调度器
  - 停止自动关联服务
  - 停止任务摘要服务

- `handle_config_change(old_config, new_config)`: 处理配置变更
  - 处理录制器配置变更
  - 处理 OCR 配置变更

**使用方式**：
```python
from lifetrace.jobs.job_manager import get_job_manager

job_manager = get_job_manager()
job_manager.start_all()
# ... 运行时 ...
job_manager.stop_all()
```

#### 1.2 ConfigWatcherManager (`lifetrace/util/config_watcher.py`)

**功能**：管理配置文件的监听和配置变更回调

**主要方法**：
- `register_callback(callback)`: 注册配置变更回调函数
- `unregister_callback(callback)`: 取消注册配置变更回调函数
- `start_watching()`: 启动配置文件监听
- `stop_watching()`: 停止配置文件监听
- `is_watching()`: 检查是否正在监听配置文件

**使用方式**：
```python
from lifetrace.util.config_watcher import get_config_watcher

config_watcher = get_config_watcher()

# 注册回调
def on_config_change(old_config, new_config):
    # 处理配置变更
    pass

config_watcher.register_callback(on_config_change)
config_watcher.start_watching()
# ... 运行时 ...
config_watcher.stop_watching()
```

### 2. 修改的模块

#### 2.1 `server.py`

**重构前**：
- 在 `lifespan()` 函数中直接管理所有后台服务
- 约 130 行代码用于任务启动和停止
- `on_config_change()` 函数处理所有配置变更

**重构后**：
- 使用 `JobManager` 和 `ConfigWatcherManager` 管理后台服务
- `lifespan()` 函数简化为约 30 行代码
- `on_config_change()` 只处理 LLM 和服务器配置
- 任务相关配置变更由 `JobManager.handle_config_change()` 处理

## 重构优势

### 1. 关注点分离
- 后台任务管理逻辑从 `server.py` 中分离
- 配置监听逻辑独立管理
- 每个模块职责清晰

### 2. 代码可维护性
- 减少了 `server.py` 的代码量和复杂度
- 便于理解和修改后台任务管理逻辑
- 便于添加新的后台任务

### 3. 可测试性
- 可以独立测试 `JobManager` 和 `ConfigWatcherManager`
- 无需启动整个 FastAPI 应用

### 4. 可复用性
- `JobManager` 可以在其他场景中复用
- `ConfigWatcherManager` 可以管理多个配置回调

## 向后兼容性

本次重构不影响现有功能，所有后台服务的行为保持不变：
- ✅ 录制器任务正常运行
- ✅ OCR 任务正常运行
- ✅ 自动关联服务正常运行
- ✅ 任务摘要服务正常运行
- ✅ 配置文件监听正常工作
- ✅ 配置变更正常响应

## 测试结果

所有组件启动和停止测试通过：
- ✅ 调度器启动和停止
- ✅ 录制器实例初始化
- ✅ 自动关联服务启动和停止
- ✅ 任务摘要服务启动和停止
- ✅ 配置文件监听启动和停止
- ✅ 配置变更回调正常触发

## 未来改进

1. 可以考虑将各个服务的配置参数通过依赖注入传入
2. 可以添加服务健康检查功能
3. 可以添加服务状态监控和上报
4. 可以实现更细粒度的服务控制（单独启动/停止某个服务）

## 相关文件

- `lifetrace/jobs/job_manager.py` - 后台任务管理器
- `lifetrace/util/config_watcher.py` - 配置监听管理器
- `lifetrace/server.py` - Web 服务器主文件（已重构）
