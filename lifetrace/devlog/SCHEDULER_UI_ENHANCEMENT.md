# 定时任务前端显示增强

## 问题描述

在原有实现中，当定时任务在配置文件中设置为 `enabled: false` 时，这些任务不会被添加到调度器中，导致前端无法显示这些任务。这对于用户管理和监控所有定时任务造成了不便。

## 解决方案

### 核心思路

**所有定义的定时任务都会被添加到调度器中，但对于 `enabled: false` 的任务会在添加后立即暂停**。这样：

1. 前端可以显示所有任务（包括已启用和已禁用的）
2. 用户可以通过前端界面控制任务的启用/暂停
3. 任务的启用状态会同步到配置文件

### 修改内容

#### 1. 后端任务管理器（`lifetrace/jobs/job_manager.py`）

**修改的方法：**

- `_start_recorder_job()` - 屏幕录制任务（添加启用状态检查和暂停逻辑）
- `_start_ocr_job()` - OCR识别任务（添加启用状态检查和暂停逻辑）
- `_start_task_context_mapper()` - 任务上下文映射服务（添加启用状态检查和暂停逻辑）
- `_start_task_summary_service()` - 任务摘要服务（添加启用状态检查和暂停逻辑）
- `_handle_recorder_config_change()` - 处理录制器配置变更（添加启用状态变更处理）
- `_handle_ocr_config_change()` - 处理OCR配置变更（添加启用状态变更处理）
- `_handle_task_context_mapper_config_change()` - 更新为使用暂停/恢复而非移除/添加
- `_handle_task_summary_config_change_in_jobs()` - 更新为使用暂停/恢复而非移除/添加

**主要变更：**

```python
# 原逻辑：如果未启用，直接返回，不添加任务
if not enabled:
    logger.info("任务未启用")
    return

# 新逻辑：无论是否启用都添加任务，但如果未启用则暂停
try:
    # 添加到调度器（无论是否启用都添加）
    self.scheduler_manager.add_interval_job(...)

    # 如果未启用，则暂停任务
    if not enabled:
        self.scheduler_manager.pause_job(job_id)
        logger.info("任务未启用，已暂停")
```

**配置变更处理更新：**

- 启用状态变更时，使用 `pause_job()` / `resume_job()` 而不是 `remove_job()` / `add_job()`
- 允许在任务暂停状态下修改间隔配置

#### 2. 调度器路由（`lifetrace/routers/scheduler.py`）

**新增功能：**

添加了配置同步机制，当用户通过前端暂停/恢复任务时，会自动更新配置文件中的 `enabled` 状态。

```python
def _sync_job_enabled_to_config(job_id: str, enabled: bool):
    """同步任务的启用状态到配置文件"""
    job_config_map = {
        "recorder_job": "jobs.recorder.enabled",
        "ocr_job": "jobs.ocr.enabled",
        "task_context_mapper_job": "jobs.task_context_mapper.enabled",
        "task_summary_job": "jobs.task_summary.enabled",
    }

    if job_id in job_config_map:
        config_key = job_config_map[job_id]
        config.set(config_key, enabled)
```

**修改的接口：**

- `POST /api/scheduler/jobs/{job_id}/pause` - 暂停任务后同步配置
- `POST /api/scheduler/jobs/{job_id}/resume` - 恢复任务后同步配置

### 用户体验改进

#### 改进前：

- 只能看到 `enabled: true` 的任务
- 想启用一个已禁用的任务需要手动修改配置文件
- 无法直观看到系统中有哪些可用的定时任务

#### 改进后：

- 可以看到所有定义的定时任务
- 可以通过前端界面直接启用/暂停任务
- 启用/暂停操作会自动同步到配置文件
- 重启后任务状态保持不变

### 任务状态流转

```
配置启动 -> 添加到调度器 -> 根据 enabled 决定是否暂停
                              ↓
                         pending=true (运行中)
                         或
                         pending=false (已暂停)
```

**前端操作：**
- 点击"暂停" → 调用 API → 暂停任务 → 更新配置 enabled=false
- 点击"恢复" → 调用 API → 恢复任务 → 更新配置 enabled=true

### 配置同步机制

当用户在前端界面操作任务时：

1. 前端调用 `/api/scheduler/jobs/{job_id}/pause` 或 `resume` 接口
2. 后端执行暂停/恢复操作
3. 自动调用 `_sync_job_enabled_to_config()` 更新配置文件
4. 配置文件更新触发配置监听器（如果有的话）
5. 下次启动时读取最新的配置状态

### 测试建议

1. **基本功能测试：**
   - 启动应用，检查前端是否显示所有4个任务（recorder, ocr, task_context_mapper, task_summary）
   - 验证 enabled=false 的任务显示为"已暂停"状态

2. **操作测试：**
   - 在前端暂停一个运行中的任务，检查配置文件是否更新
   - 在前端恢复一个已暂停的任务，检查配置文件是否更新
   - 修改配置文件中的 enabled 状态，检查是否正确同步到调度器

3. **持久化测试：**
   - 在前端暂停任务
   - 重启应用
   - 检查任务是否保持暂停状态

### 注意事项

1. **所有任务都支持启用/禁用：** 包括 recorder、ocr、task_context_mapper 和 task_summary，所有任务都可以通过前端界面控制启用状态
2. **默认状态：**
   - recorder 和 ocr 默认启用（`enabled: true`）
   - task_context_mapper 和 task_summary 默认禁用（`enabled: false`）
3. **配置文件：** 任务的 `enabled` 状态会在前端操作后自动更新，无需手动修改
4. **兼容性：** 该方案向后兼容，不影响现有配置文件的使用
5. **灵活性：** 即使是核心任务（recorder 和 ocr）也可以暂停，适用于调试或特殊场景

## 相关文件

- `lifetrace/jobs/job_manager.py` - 任务管理器
- `lifetrace/routers/scheduler.py` - 定时任务路由
- `frontend/app/scheduler/page.tsx` - 前端定时任务页面（无需修改）

## 更新日期

2025-11-11
