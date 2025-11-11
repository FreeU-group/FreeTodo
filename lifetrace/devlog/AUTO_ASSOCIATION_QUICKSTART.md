# 自动关联服务快速上手指南

## 简介

自动关联服务会在后台智能地将你的工作上下文（如浏览网页、编写代码、查看文档等活动）自动关联到相应的任务上，让你的工作记录更有条理。

## 快速开始

### 1. 确认配置

打开配置文件 `lifetrace/config/config.yaml`，确认以下配置：

```yaml
# LLM 配置（必需）
llm:
  llm_key: sk-你的API密钥
  base_url: https://dashscope.aliyuncs.com/compatible-mode/v1
  model: qwen3-max

# 自动关联服务配置
auto_association:
  enabled: true                    # 启用服务
  confidence_threshold: 0.7        # 置信度阈值
  batch_size: 10                   # 批次大小
  check_interval: 60               # 检查间隔（秒）
```

### 2. 准备数据

为了让服务正常工作，你需要：

**a. 创建至少一个项目：**

```bash
# 通过 API 创建项目
curl -X POST "http://127.0.0.1:8000/api/projects" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "我的项目",
    "goal": "项目目标描述"
  }'
```

**b. 在项目下创建任务并设置为"进行中"状态：**

```bash
# 创建任务（将 {project_id} 替换为实际的项目ID）
curl -X POST "http://127.0.0.1:8000/api/projects/{project_id}/tasks" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "开发功能A",
    "description": "开发项目的某个功能",
    "status": "in_progress"
  }'
```

### 3. 启动服务

```bash
cd lifetrace
python server.py
```

服务启动后，你会在日志中看到：

```
INFO:root:自动关联服务已启动
```

### 4. 观察运行

服务会自动在后台运行，你可以通过以下方式观察：

**a. 查看实时日志：**

```bash
# Mac/Linux
tail -f lifetrace/data/logs/$(date +%Y-%m-%d).log | grep "自动关联"

# Windows PowerShell
Get-Content lifetrace/data/logs/$(Get-Date -Format "yyyy-MM-dd").log -Wait | Select-String "自动关联"
```

**b. 查看数据库中的关联结果：**

```bash
# 查看已关联的上下文
curl "http://127.0.0.1:8000/api/contexts?associated=true"
```

## 测试服务

我们提供了一个测试脚本来验证服务是否正常工作：

```bash
cd lifetrace
python -m lifetrace.llm.test_auto_association
```

测试脚本会检查：
- ✅ 服务初始化
- ✅ 获取未关联上下文
- ✅ 获取项目列表
- ✅ 获取进行中任务
- ✅ 获取统计信息
- ✅ 短时间运行测试（可选）

## 调整参数

根据实际使用情况，你可能需要调整以下参数：

### 置信度阈值 (confidence_threshold)

**如果自动关联太少（很多该关联的没有关联）：**
- 降低阈值到 0.6 或 0.5
- 示例：`confidence_threshold: 0.6`

**如果出现误关联（关联到了错误的任务）：**
- 提高阈值到 0.8 或 0.9
- 示例：`confidence_threshold: 0.8`

### 检查间隔 (check_interval)

**如果希望更快地处理新上下文：**
- 减少间隔到 30 秒
- 示例：`check_interval: 30`

**如果担心系统负载：**
- 增加间隔到 120 秒或更多
- 示例：`check_interval: 120`

### 批次大小 (batch_size)

**如果有大量积压的未关联上下文：**
- 增加批次大小到 20 或 30
- 示例：`batch_size: 20`

**如果处理速度太慢：**
- 减少批次大小到 5
- 示例：`batch_size: 5`

## 常见问题

### Q1: 服务没有进行任何关联？

**可能原因：**
1. 没有未关联的上下文记录
2. 项目中没有"进行中"的任务
3. 所有判断的置信度都低于阈值

**解决方法：**
```bash
# 检查未关联的上下文数量
curl "http://127.0.0.1:8000/api/contexts?associated=false"

# 检查是否有进行中的任务
curl "http://127.0.0.1:8000/api/projects/{project_id}/tasks"

# 查看日志了解具体原因
tail -f lifetrace/data/logs/$(date +%Y-%m-%d).log | grep "跳过"
```

### Q2: 关联不准确怎么办？

**解决方法：**
1. 提高置信度阈值（如从 0.7 提高到 0.8）
2. 改进任务描述，使其更具体和详细
3. 确保项目目标描述清晰
4. 手动修正错误的关联：

```bash
# 更新上下文的任务关联
curl -X PUT "http://127.0.0.1:8000/api/contexts/{context_id}" \
  -H "Content-Type: application/json" \
  -d '{"task_id": 正确的任务ID}'

# 解除错误的关联
curl -X PUT "http://127.0.0.1:8000/api/contexts/{context_id}" \
  -H "Content-Type: application/json" \
  -d '{"task_id": null}'
```

### Q3: 如何临时禁用服务？

在配置文件中设置：

```yaml
auto_association:
  enabled: false
```

然后重启服务。

### Q4: 服务占用太多资源？

**解决方法：**
1. 增加检查间隔：`check_interval: 120`
2. 减小批次大小：`batch_size: 5`
3. 在系统空闲时段运行（可以考虑添加定时任务）

### Q5: 如何查看服务的运行统计？

目前统计信息记录在服务内部，你可以通过日志查看关联情况：

```bash
# 统计成功关联数
grep "成功关联上下文" lifetrace/data/logs/$(date +%Y-%m-%d).log | wc -l

# 统计跳过数
grep "跳过自动关联" lifetrace/data/logs/$(date +%Y-%m-%d).log | wc -l
```

## 进阶使用

### 优化任务描述

为了让 LLM 能够更准确地判断关联关系，建议：

**好的任务描述：**
```
名称：实现用户登录功能
描述：开发用户登录页面，包括用户名密码验证、记住密码功能、第三方登录集成（微信、QQ）。技术栈：React + Node.js + MongoDB。
```

**不好的任务描述：**
```
名称：做登录
描述：实现登录
```

### 优化项目目标

**好的项目目标：**
```
项目：电商平台开发
目标：开发一个B2C电商平台，包括商品管理、订单管理、用户管理、支付集成等核心功能。使用微服务架构，前端 React，后端 Spring Boot。
```

**不好的项目目标：**
```
项目：网站
目标：做个网站
```

### 监控和分析

定期查看关联情况并进行分析：

```bash
# 查看今天的关联日志
grep "自动关联决策" lifetrace/data/logs/$(date +%Y-%m-%d).log

# 分析置信度分布
grep "confidence=" lifetrace/data/logs/$(date +%Y-%m-%d).log | \
  grep -oE "confidence=[0-9.]+" | \
  sort | uniq -c
```

## 最佳实践建议

1. **初期设置较高阈值**（0.8）：减少误关联，建立信心
2. **定期审查关联结果**：每周抽查一次自动关联的结果
3. **及时更新任务状态**：完成的任务及时标记为 `completed`
4. **保持任务列表整洁**：不再进行的任务设为 `cancelled`
5. **详细的任务描述**：帮助 LLM 更好地理解任务内容
6. **合理的检查间隔**：根据工作节奏调整

## 技术支持

如果遇到问题：

1. 查看详细文档：`lifetrace/devlog/AUTO_ASSOCIATION_SERVICE.md`
2. 运行测试脚本：`python -m lifetrace.llm.test_auto_association`
3. 查看日志文件：`lifetrace/data/logs/`
4. 检查配置文件：`lifetrace/config/config.yaml`

## 反馈和改进

欢迎提供反馈和改进建议！
