# 快速修复指南

## 🔧 问题 1: WhisperLiveKit 语言代码错误

**错误：** `ValueError: Unsupported language: zh-cn`

**已自动修复：** 代码已更新，会自动将 `zh` 转换为 `auto`（自动检测语言）

**如果仍有问题，手动修复：**

编辑 `config/config.yaml`：
```yaml
speech_recognition:
  language: auto  # 改为 auto，让 WhisperLiveKit 自动检测语言
```

然后重启服务器。

---

## 🔧 问题 2: 数据库迁移错误

### 2.1 编码错误

**错误：** `UnicodeDecodeError: 'gbk' codec can't decode byte 0xae in position 53`

**已自动修复：**
- ✅ 移除了 `alembic.ini` 中的中文注释（改为英文）
- ✅ 在 `env.py` 中添加了 configparser 补丁，强制使用 UTF-8 读取配置文件
- ✅ 自动设置 UTF-8 编码环境变量

**现在应该可以直接运行迁移了：**

```powershell
# 确保虚拟环境已激活
.venv\Scripts\Activate.ps1

# 进入 lifetrace 目录
cd lifetrace

# 运行迁移（编码问题已自动修复）
python -m alembic upgrade head
```

**如果仍有问题，手动设置编码：**

**Windows PowerShell:**
```powershell
$env:PYTHONIOENCODING = "utf-8"
cd lifetrace
python -m alembic upgrade head
```

**Linux/macOS:**
```bash
export PYTHONIOENCODING=utf-8
cd lifetrace
python -m alembic upgrade head
```

### 2.2 数据库列缺失错误

**错误：** `sqlite3.OperationalError: no such column: chats.context`

**快速修复：**

### Windows:
```powershell
.\scripts\fix_database_migration.ps1
```

### Linux/macOS:
```bash
chmod +x scripts/fix_database_migration.sh
./scripts/fix_database_migration.sh
```

### 手动修复：
```bash
# 确保虚拟环境已激活
# Windows: 设置 UTF-8 编码
$env:PYTHONIOENCODING = "utf-8"
# Linux/macOS: 设置 UTF-8 编码
export PYTHONIOENCODING=utf-8

cd lifetrace
alembic upgrade head
```

---

## ✅ 修复后重启

修复完成后，重启服务器：

```bash
# 确保虚拟环境已激活
python -m lifetrace.server
```

---

## 📋 验证修复

1. **检查 WhisperLiveKit 启动：**
   - 查看日志，应该看到 "✅ WhisperLiveKit 服务器已启动"
   - 不应该再看到 "Unsupported language" 错误

2. **检查数据库：**
   - 尝试访问聊天功能
   - 不应该再看到 "no such column: chats.context" 错误

