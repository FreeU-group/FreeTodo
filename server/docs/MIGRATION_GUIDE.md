# 数据库迁移指南

## 问题：多个 Head 错误

当出现 `Multiple head revisions are present` 错误时，说明迁移链出现了分支。

### 原因

多个迁移文件都基于同一个父版本，导致 Alembic 不知道应该应用哪个迁移。

### 解决方法

1. **检查当前所有 head**：
   ```bash
   alembic heads
   ```

2. **查看迁移历史**：
   ```bash
   alembic history
   ```

3. **修复迁移链**：
   - 找到最新的迁移文件
   - 修改新迁移文件的 `down_revision`，让它基于最新的 head
   - 或者合并多个 head（使用 `alembic merge`）

## 如何预防多个 Head

### ✅ 正确做法

1. **创建新迁移前，先检查当前 head**：
   ```bash
   alembic heads
   # 输出示例：remove_project_task (head)
   ```

2. **创建新迁移时，使用当前 head 作为父版本**：
   ```bash
   alembic revision -m "描述" --head=remove_project_task
   ```

3. **或者手动创建迁移文件时，确保 `down_revision` 指向最新的 head**：
   ```python
   revision: str = "new_revision_id"
   down_revision: str = "remove_project_task"  # 使用最新的 head
   ```

### ❌ 错误做法

1. **不要基于旧的迁移版本创建新迁移**：
   ```python
   # 错误：如果已经有更新的迁移，不要基于旧版本
   down_revision: str = "4ca5036ec7c8"  # 如果已经有 remove_project_task，不要用这个
   ```

2. **不要同时创建多个基于同一父版本的迁移**：
   - 这会导致多个 head
   - 应该按顺序创建，一个接一个

## 迁移文件命名规范

推荐使用时间戳 + 描述的方式：
```bash
alembic revision -m "add_file_path_to_audio_recordings"
# 生成：20260119_123456_add_file_path_to_audio_recordings.py
```

或者手动创建时使用有意义的 revision ID：
```python
revision: str = "add_file_path_001"  # 简短但唯一
```

## 迁移链示例

正确的迁移链应该是线性的：
```
cc25001eb19c (初始基线)
    ↓
4ca5036ec7c8 (添加 context)
    ↓
remove_project_task (删除项目表)
    ↓
add_file_path_001 (添加 file_path)  ← 当前 head
```

## 合并多个 Head

如果已经出现了多个 head，可以使用 merge：

```bash
# 1. 创建一个合并迁移
alembic merge -m "merge heads" heads

# 2. 这会创建一个新的迁移文件，合并所有 head

# 3. 然后运行升级
alembic upgrade head
```

## 快速检查清单

创建新迁移前：
- [ ] 运行 `alembic heads` 查看当前 head
- [ ] 运行 `alembic current` 查看当前数据库版本
- [ ] 确保新迁移的 `down_revision` 指向最新的 head
- [ ] 创建后运行 `alembic heads` 确认只有一个 head

## 常见问题

### Q: 如何查看迁移链？
A: `alembic history --verbose`

### Q: 如何回滚到特定版本？
A: `alembic downgrade <revision_id>`

### Q: 如何查看当前数据库版本？
A: `alembic current`

### Q: 迁移文件冲突怎么办？
A: 使用 `alembic merge` 合并多个 head

### Q: 迁移运行后表结构仍然不完整怎么办？
A: 这种情况通常发生在：
1. 表是通过 `SQLModel.metadata.create_all()` 创建的，而不是迁移
2. 迁移只添加了部分列，但表缺少其他列

**解决方法**：
1. **快速修复**：使用修复脚本直接修改数据库
   ```bash
   python lifetrace/scripts/fix_audio_recordings_table.py
   ```

2. **正确方法**：修改迁移文件，添加所有缺失的列，然后：
   ```bash
   # 回滚迁移
   alembic downgrade -1
   # 重新运行迁移
   alembic upgrade head
   ```

3. **预防**：确保所有表都通过迁移创建，而不是 `create_all()`

### Q: 如何确保迁移包含所有列？
A: 在迁移的 `upgrade()` 函数中：
- 检查表是否存在，不存在则创建完整表
- 检查每个列是否存在，不存在则添加
- 为现有记录设置合理的默认值
