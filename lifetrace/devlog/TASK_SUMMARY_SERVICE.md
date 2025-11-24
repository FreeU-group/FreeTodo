# 任务进展摘要服务文档

## 概述

任务进展摘要服务是一个后台运行的智能服务，它会定期检查哪些任务有足够多的新关联上下文（工作记录），并自动使用 LLM 生成进展摘要，追加到任务描述中。这样用户可以轻松回顾每个任务的工作历史和进展情况。

## 功能特性

### 1. 自动触发机制
- **定时轮询**：默认每小时检查一次所有任务
- **智能判断**：只对有足够新上下文的任务生成摘要
- **可配置**：检查间隔和触发阈值都可以在配置文件中调整

### 2. 智能摘要生成
- **上下文分析**：收集任务关联的所有新工作记录（截图、OCR文本、应用活动等）
- **LLM处理**：使用大语言模型理解工作内容，生成简洁明了的进展摘要
- **格式化输出**：自动添加时间戳和"AI 摘要"标记，便于识别

### 3. 避免重复处理
- **标记机制**：记录哪些上下文已经被摘要过
- **增量处理**：只对新的上下文生成摘要，避免重复

### 4. 统计和监控
- **运行统计**：记录处理的任务数、生成的摘要数等
- **错误日志**：详细记录处理过程中的错误信息

## 配置说明

在 `lifetrace/config/config.yaml` 中添加以下配置：

```yaml
task_summary:
  enabled: true              # 是否启用任务摘要服务
  min_new_contexts: 5        # 触发摘要的最小新上下文数量
  check_interval: 3600       # 检查间隔（秒），默认3600秒（1小时）
```

### 配置项说明

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | bool | true | 是否启用服务 |
| `min_new_contexts` | int | 5 | 触发摘要的最小新上下文数量。只有当任务有至少这么多新的未摘要上下文时，才会生成摘要 |
| `check_interval` | int | 3600 | 检查间隔（秒）。服务每隔这么长时间检查一次所有任务 |

### 调整建议

- **频繁更新**：如果希望更频繁地生成摘要，可以减小 `check_interval`（如 1800 = 30分钟）
- **大型任务**：如果任务活动很多，可以增加 `min_new_contexts`（如 10 或 20）
- **小型任务**：如果希望更灵敏，可以减小 `min_new_contexts`（如 3）

## 服务架构

### 核心类：TaskSummaryService

位置：`lifetrace/jobs/task_summary.py`

#### 初始化参数

```python
TaskSummaryService(
    db_manager: DatabaseManager,      # 数据库管理器
    llm_client: LLMClient = None,     # LLM客户端（可选）
    min_new_contexts: int = 5,        # 最小新上下文数
    check_interval: int = 3600,       # 检查间隔（秒）
    enabled: bool = True              # 是否启用
)
```

#### 主要方法

| 方法 | 说明 |
|------|------|
| `start()` | 启动后台服务线程 |
| `stop()` | 停止后台服务线程 |
| `is_running()` | 检查服务是否在运行 |
| `get_stats()` | 获取服务统计信息 |
| `trigger_manual_summary(task_id)` | 手动触发任务摘要生成 |
| `clear_summary_history(task_id)` | 清除摘要历史记录 |

## 工作流程

### 1. 定时检查（每小时一次）

```
后台线程循环
  ↓
获取所有项目和任务
  ↓
检查每个任务的关联上下文
  ↓
找出有足够新上下文的任务
```

### 2. 生成摘要

```
收集新上下文详情
  ↓
获取截图和OCR文本
  ↓
构建LLM提示词
  ↓
调用LLM生成摘要
  ↓
格式化摘要文本
```

### 3. 保存和标记

```
追加摘要到任务描述
  ↓
标记上下文已被摘要
  ↓
更新统计信息
  ↓
记录日志
```

## 使用示例

### 1. 基本使用（自动运行）

服务会在服务器启动时自动启动，无需额外配置：

```bash
# 启动服务器
cd lifetrace-
python lifetrace/server.py
```

服务器日志会显示：
```
任务摘要服务初始化完成 - 最小新上下文数: 5, 检查间隔: 3600秒, 启用状态: True
任务摘要服务已启动
```

### 2. 手动触发摘要（通过代码）

```python
from lifetrace.jobs.task_summary import TaskSummaryService
from lifetrace.storage import db_manager

# 创建服务实例
service = TaskSummaryService(db_manager=db_manager)

# 手动为特定任务生成摘要
result = service.trigger_manual_summary(task_id=1)
print(result)
# 输出：{'success': True, 'message': '成功为任务 1 生成摘要', 'contexts_summarized': 8}
```

### 3. 查看统计信息

```python
stats = service.get_stats()
print(stats)
# 输出：
# {
#     'total_tasks_processed': 5,
#     'total_summaries_generated': 3,
#     'total_contexts_summarized': 42,
#     'last_run_time': '2025-11-09T14:30:00',
#     'last_error': None
# }
```

### 4. 清除摘要历史（重新生成）

```python
# 清除特定任务的摘要历史
service.clear_summary_history(task_id=1)

# 清除所有任务的摘要历史
service.clear_summary_history()
```

## 摘要格式

生成的摘要会自动追加到任务的 `description` 字段中，格式如下：

```markdown
[原有任务描述]

---
**AI 摘要** (2025-11-09 14:30:00):
在过去的工作中，用户主要在 VS Code 中编写了任务管理相关的代码，包括创建
TaskSummaryService 类和相关的数据库操作方法。同时还在浏览器中查看了相关
文档和 API 参考。总体进展顺利，已完成核心功能的实现。

---
**AI 摘要** (2025-11-09 16:00:00):
继续优化任务摘要服务的代码，添加了错误处理和日志记录功能。在 Chrome 浏览
器中测试了 API 端点，确认功能正常工作。
```

每次生成的摘要都会：
- 添加分隔线 `---`
- 标记为 **AI 摘要**
- 包含生成时间戳
- 保持简洁（不超过200字）

## 数据流程

### 上下文到摘要的完整流程

```
1. 用户工作 → 截图记录 → OCR处理 → 上下文记录（Event）
                                            ↓
2. 自动关联服务 → 将上下文关联到任务（task_id）
                                            ↓
3. 任务摘要服务 → 检查任务的新上下文
                                            ↓
4. 收集上下文详情 → 截图 + OCR文本 + AI标题/摘要
                                            ↓
5. 构建提示词 → 任务信息 + 项目信息 + 上下文内容
                                            ↓
6. LLM生成摘要 → 理解工作内容 → 生成简洁描述
                                            ↓
7. 格式化保存 → 追加到任务描述 → 标记已摘要
```

## 避免重复处理的机制

服务使用内存中的集合来记录哪些上下文已被摘要：

```python
self._summarized_contexts = {
    task_id_1: {context_id_1, context_id_2, context_id_3},
    task_id_2: {context_id_4, context_id_5},
    ...
}
```

### 工作原理

1. **首次运行**：所有上下文都是新的，全部处理
2. **后续运行**：只处理不在集合中的新上下文
3. **服务重启**：内存清空，重新开始（但已生成的摘要保留在任务描述中）

### 注意事项

- 摘要历史记录存储在内存中，服务重启后会重置
- 如果需要重新生成摘要，可以调用 `clear_summary_history()` 方法
- 任务描述中的历史摘要不会被删除，只会追加新的摘要

## 与其他服务的集成

### 1. 自动关联服务

任务摘要服务依赖于自动关联服务：
- 自动关联服务将上下文关联到任务
- 任务摘要服务读取这些关联，生成摘要

建议两个服务都启用：
```yaml
auto_association:
  enabled: true
  check_interval: 60        # 每分钟关联一次

task_summary:
  enabled: true
  check_interval: 3600      # 每小时摘要一次
```

### 2. LLM 服务

需要配置有效的 LLM API：
```yaml
llm:
  llm_key: your-api-key
  base_url: https://your-llm-service.com/v1
  model: qwen3-max
```

### 3. 数据库

服务使用以下数据库表：
- `events`（上下文记录）
- `tasks`（任务信息）
- `projects`（项目信息）
- `screenshots`（截图）
- `ocr_results`（OCR结果）

## 性能考虑

### 1. LLM 调用频率

- 每次生成摘要需要调用一次 LLM
- 建议合理设置 `min_new_contexts`，避免过于频繁的摘要
- 对于活跃项目，可以增加检查间隔

### 2. 内存使用

- 摘要历史记录存储在内存中
- 对于大量任务，内存使用会增加
- 可以定期重启服务释放内存

### 3. 数据库查询

- 每次检查会查询所有项目和任务
- 对于大型数据库，可能需要优化查询
- 考虑添加索引或缓存机制

## 日志和调试

### 日志级别

服务使用标准的 Python logging 模块，支持以下日志级别：

- **INFO**：服务启动、停止、摘要生成成功
- **DEBUG**：详细的处理过程、上下文信息
- **WARNING**：LLM 不可用、摘要生成失败
- **ERROR**：处理错误、数据库操作失败

### 查看日志

日志文件位置：`lifetrace/data/logs/`

```bash
# 查看最新日志
tail -f lifetrace/data/logs/$(date +%Y-%m-%d).log | grep "任务摘要"

# 查看错误日志
tail -f lifetrace/data/logs/$(date +%Y-%m-%d).error.log
```

### 关键日志示例

```
2025-11-09 14:00:00 [INFO] 任务摘要服务初始化完成 - 最小新上下文数: 5, 检查间隔: 3600秒
2025-11-09 14:00:00 [INFO] 任务摘要服务已启动
2025-11-09 15:00:00 [INFO] 找到 3 个任务需要生成摘要
2025-11-09 15:00:05 [INFO] 任务 1 (前端开发) 有 8 个新上下文，将生成摘要
2025-11-09 15:00:10 [INFO] ✅ 成功为任务 1 (前端开发) 生成并保存摘要，摘要了 8 个上下文
```

## 故障排查

### 问题1：服务未启动

**症状**：日志中没有"任务摘要服务已启动"的信息

**检查**：
1. 配置文件中 `task_summary.enabled` 是否为 true
2. LLM 配置是否正确
3. 服务器是否成功启动

**解决**：
```bash
# 检查配置
grep -A 3 "task_summary:" lifetrace/config/config.yaml

# 检查日志
grep "任务摘要" lifetrace/data/logs/$(date +%Y-%m-%d).log
```

### 问题2：摘要没有生成

**症状**：服务运行了，但任务描述没有更新

**可能原因**：
1. 任务没有足够的新上下文（少于 `min_new_contexts`）
2. 上下文没有关联到任务（需要先运行自动关联服务）
3. LLM API 调用失败

**检查**：
```python
# 检查任务的上下文数量
from lifetrace.storage import db_manager

contexts = db_manager.list_contexts(task_id=1, limit=1000, offset=0)
print(f"任务1有 {len(contexts)} 个关联上下文")

# 检查服务统计
stats = task_summary_service.get_stats()
print(stats)
```

### 问题3：摘要质量不佳

**症状**：生成的摘要不够准确或相关

**可能原因**：
1. 上下文的 OCR 文本质量不高
2. LLM 模型选择不当
3. 提示词需要优化

**改进**：
1. 确保 OCR 服务正常工作
2. 尝试更强大的 LLM 模型（如 GPT-4）
3. 修改 `_build_summary_prompt()` 方法中的提示词

## 最佳实践

### 1. 合理设置参数

```yaml
# 推荐配置（根据项目规模调整）

# 小型项目（少量任务）
task_summary:
  enabled: true
  min_new_contexts: 3
  check_interval: 1800      # 30分钟

# 中型项目（适中任务数）
task_summary:
  enabled: true
  min_new_contexts: 5
  check_interval: 3600      # 1小时（默认）

# 大型项目（大量任务）
task_summary:
  enabled: true
  min_new_contexts: 10
  check_interval: 7200      # 2小时
```

### 2. 结合手动触发

对于重要任务，可以在关键节点手动触发摘要：

```python
# 在完成重要工作后
service.trigger_manual_summary(task_id=critical_task_id)
```

### 3. 定期审查摘要

虽然摘要是自动生成的，但建议定期人工审查：
- 检查摘要是否准确反映了工作内容
- 补充 AI 可能遗漏的重要细节
- 根据需要调整服务参数

### 4. 备份任务描述

摘要会直接修改任务的 `description` 字段，建议：
- 定期备份数据库
- 重要任务可以先手动复制描述
- 使用版本控制系统跟踪变更

## 未来扩展

### 计划中的功能

1. **摘要定制**
   - 支持不同任务类型的摘要模板
   - 用户可以自定义摘要格式

2. **摘要版本管理**
   - 保留摘要历史版本
   - 支持回滚到之前的描述

3. **通知功能**
   - 生成摘要后通知用户
   - 邮件或推送摘要内容

4. **API 端点**
   - 提供 REST API 手动触发摘要
   - 查询摘要生成历史

5. **数据持久化**
   - 将摘要历史保存到数据库
   - 避免服务重启导致的状态丢失

## 相关文档

- [任务管理 API](./TASK_MANAGEMENT_API.md)
- [自动关联服务](./AUTO_ASSOCIATION_SERVICE.md)
- [项目管理指南](./PROJECT_MANAGEMENT_API.md)

## 技术支持

如有问题或建议，请：
1. 查看日志文件了解详细错误信息
2. 检查配置文件是否正确
3. 提交 Issue 到项目仓库
