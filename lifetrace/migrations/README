Alembic 数据库迁移目录

此目录包含 Alembic 数据库迁移脚本。

## 常用命令

### 生成新的迁移脚本
```bash
cd lifetrace
alembic revision --autogenerate -m "描述迁移内容"
```

### 应用所有迁移
```bash
alembic upgrade head
```

### 回滚迁移
```bash
alembic downgrade -1  # 回滚一个版本
alembic downgrade base  # 回滚到初始状态
```

### 查看当前版本
```bash
alembic current
```

### 查看迁移历史
```bash
alembic history
```

### 标记当前数据库为已迁移（不实际执行迁移）
```bash
alembic stamp head
```
