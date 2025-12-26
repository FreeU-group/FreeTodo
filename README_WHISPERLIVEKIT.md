# WhisperLiveKit 快速开始指南

## 🚀 快速安装（使用 uv）

### 1. 运行安装脚本

**Linux/macOS:**
```bash
chmod +x scripts/setup_whisperlivekit.sh
./scripts/setup_whisperlivekit.sh
```

**Windows PowerShell:**
```powershell
.\scripts\setup_whisperlivekit.ps1
```

### 2. 手动安装（如果脚本不可用）

```bash
# 确保在项目根目录
cd lifetrace

# 使用 uv 同步依赖
uv sync

# 激活虚拟环境
# Linux/macOS:
source .venv/bin/activate

# Windows:
.venv\Scripts\activate

# 安装 WhisperLiveKit（如果未自动安装）
uv pip install whisperlivekit websockets
```

## ✅ 验证安装

运行测试脚本：

```bash
# 确保虚拟环境已激活
python scripts/test_whisperlivekit.py
```

## 🎯 使用

### 启动服务器（只需启动一个！）

**只需要启动 LifeTrace 主服务器，WhisperLiveKit 服务器会自动启动：**

```bash
# 确保虚拟环境已激活
python -m lifetrace.server
```

**说明：**
- ✅ **只需启动一个服务器**：`lifetrace.server`
- ✅ **自动启动**：如果 `auto_start_server: true`，WhisperLiveKit 服务器会在应用启动时自动启动（端口 8002）
- ✅ **按需启动**：如果未配置自动启动，会在首次 WebSocket 连接时自动启动
- ✅ **自动管理**：服务器关闭时，WhisperLiveKit 服务器也会自动停止

### 前端连接

前端会自动连接到 `/api/voice/stream`，使用 WhisperLiveKit 进行实时语音识别。

**不需要手动启动 WhisperLiveKit 服务器！**

## 📋 配置

编辑 `config/config.yaml`（如果不存在会自动从 `default_config.yaml` 复制）：

```yaml
speech_recognition:
  whisper_model_size: base  # tiny, base, small, medium, large-v3
  whisper_device: cpu        # cpu, cuda
  language: zh               # zh (中文), en (英文)
  server_port: 8002         # WhisperLiveKit 服务器端口
  server_host: localhost
  auto_start_server: true   # 自动启动服务器
```

## 🔧 故障排除

### 问题：uv 未安装

**解决方案：**
- Linux/macOS: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Windows: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`

### 问题：FFmpeg 未安装

**解决方案：**
- macOS: `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt install ffmpeg`
- Windows: 从 https://ffmpeg.org/download.html 下载并添加到 PATH

### 问题：WhisperLiveKit 服务器启动失败 - "Unsupported language: zh-cn"

**错误信息：**
```
ValueError: Unsupported language: zh-cn
```

**解决方案：**
1. 已自动修复：代码已更新，会自动使用 `auto` 语言模式（自动检测）
2. 如果仍有问题，可以手动修改配置：
   ```yaml
   speech_recognition:
     language: auto  # 使用自动检测，而不是 zh
   ```
3. 重启服务器

### 问题：数据库迁移错误 - "no such column: chats.context"

**错误信息：**
```
sqlite3.OperationalError: no such column: chats.context
```

**解决方案：**

**Windows:**
```powershell
.\scripts\fix_database_migration.ps1
```

**Linux/macOS:**
```bash
chmod +x scripts/fix_database_migration.sh
./scripts/fix_database_migration.sh
```

**或手动运行：**
```bash
# 确保虚拟环境已激活
cd lifetrace
alembic upgrade head
```

### 问题：WhisperLiveKit 服务器启动失败（其他原因）

**解决方案：**
1. 检查日志：查看 `logs/` 目录下的日志文件
2. 检查端口是否被占用：`netstat -an | grep 8002` (Linux/macOS) 或 `netstat -an | findstr 8002` (Windows)
3. 手动测试：`whisperlivekit-server --model base --language auto --port 8002`

## 📚 更多信息

- [完整集成文档](WHISPERLIVEKIT_INTEGRATION.md)
- [路由文档](lifetrace/routers/voice_stream_whisperlivekit_README.md)
- [技术推荐](free-todo-frontend/apps/voice-module/TECHNICAL_RECOMMENDATIONS.md)

