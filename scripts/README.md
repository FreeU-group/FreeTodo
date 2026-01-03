# LifeTrace Deployment Scripts

[English](#english) | [中文](#中文)

---

## English

One-click deployment scripts for LifeTrace. These scripts automate the installation and startup processes.

### Prerequisites

- **Python** >= 3.13
- **Node.js** >= 20
- **Git**

### Quick Start

#### Linux / macOS

```bash
# Clone the repository
git clone https://github.com/FreeU-group/LifeTrace.git
cd LifeTrace

# Make scripts executable
chmod +x scripts/*.sh

# Install dependencies
./scripts/install.sh

# Start services
./scripts/start.sh
```

#### Windows (PowerShell)

```powershell
# Clone the repository
git clone https://github.com/FreeU-group/LifeTrace.git
cd LifeTrace

# Install dependencies
.\scripts\install.ps1

# Start services
.\scripts\start.ps1
```

### Scripts

| Script | Description |
|--------|-------------|
| `install.sh` / `install.ps1` | Install all dependencies and initialize configuration |
| `start.sh` / `start.ps1` | Start backend and frontend services |

### Installation Script Options

| Option | Description |
|--------|-------------|
| `--skip-frontend` / `-SkipFrontend` | Skip frontend installation |
| `--skip-backend` / `-SkipBackend` | Skip backend installation |
| `--china-mirror` / `-ChinaMirror` | Use China mirror sources for faster downloads |
| `-h, --help` / `-Help` | Show help message |

**Examples:**

```bash
# Linux/macOS: Install with China mirrors
./scripts/install.sh --china-mirror

# Linux/macOS: Install backend only
./scripts/install.sh --skip-frontend
```

```powershell
# Windows: Install with China mirrors
.\scripts\install.ps1 -ChinaMirror

# Windows: Install backend only
.\scripts\install.ps1 -SkipFrontend
```

### Startup Script Options

| Option | Description |
|--------|-------------|
| `--backend-only` / `-BackendOnly` | Start backend only |
| `--frontend-only` / `-FrontendOnly` | Start frontend only |
| `--no-browser` / `-NoBrowser` | Don't open browser automatically |
| `-h, --help` / `-Help` | Show help message |

**Examples:**

```bash
# Linux/macOS: Start without opening browser
./scripts/start.sh --no-browser

# Linux/macOS: Start backend only
./scripts/start.sh --backend-only
```

```powershell
# Windows: Start without opening browser
.\scripts\start.ps1 -NoBrowser

# Windows: Start backend only
.\scripts\start.ps1 -BackendOnly
```

### Stopping Services

To stop the services, press `Ctrl+C` in the terminal where the services are running.

### Port Configuration

The startup scripts read port configuration from `lifetrace/config/config.yaml`:

```yaml
# Server configuration
server:
  host: 127.0.0.1
  port: 8000  # Backend port

# Frontend configuration
frontend:
  port: 3000  # Frontend port
```

If `config.yaml` doesn't exist, the scripts will use `default_config.yaml`.

### Service URLs

After starting, the services will be available at (default ports):

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

> Note: If you changed the ports in `config.yaml`, use the configured ports instead.

### First Startup

During the first startup, the backend may need several minutes to download models (embedding, rerank, etc.). The scripts will:

- Wait 30 seconds, then check if the backend is ready
- If not ready, continue waiting (repeats until backend is ready)
- Automatically proceed to start frontend once backend is ready

### Troubleshooting

#### Port already in use

If you see a "port already in use" warning, you need to manually stop the existing process or use a different port in `config.yaml`.

#### Permission denied (Linux/macOS)

Make scripts executable:

```bash
chmod +x scripts/*.sh
```

#### Python/Node.js not found

Ensure Python >= 3.13 and Node.js >= 20 are installed and available in your PATH.

---

## 中文

LifeTrace 一键部署脚本。这些脚本自动化了安装和启动流程。

### 环境要求

- **Python** >= 3.13
- **Node.js** >= 20
- **Git**

### 快速开始

#### Linux / macOS

```bash
# 克隆仓库
git clone https://github.com/FreeU-group/LifeTrace.git
cd LifeTrace

# 添加执行权限
chmod +x scripts/*.sh

# 安装依赖
./scripts/install.sh

# 启动服务
./scripts/start.sh
```

#### Windows (PowerShell)

```powershell
# 克隆仓库
git clone https://github.com/FreeU-group/LifeTrace.git
cd LifeTrace

# 安装依赖
.\scripts\install.ps1

# 启动服务
.\scripts\start.ps1
```

### 脚本说明

| 脚本 | 说明 |
|------|------|
| `install.sh` / `install.ps1` | 安装所有依赖并初始化配置 |
| `start.sh` / `start.ps1` | 启动后端和前端服务 |

### 安装脚本选项

| 选项 | 说明 |
|------|------|
| `--skip-frontend` / `-SkipFrontend` | 跳过前端安装 |
| `--skip-backend` / `-SkipBackend` | 跳过后端安装 |
| `--china-mirror` / `-ChinaMirror` | 使用国内镜像源加速下载 |
| `-h, --help` / `-Help` | 显示帮助信息 |

**示例：**

```bash
# Linux/macOS: 使用国内镜像安装
./scripts/install.sh --china-mirror

# Linux/macOS: 仅安装后端
./scripts/install.sh --skip-frontend
```

```powershell
# Windows: 使用国内镜像安装
.\scripts\install.ps1 -ChinaMirror

# Windows: 仅安装后端
.\scripts\install.ps1 -SkipFrontend
```

### 启动脚本选项

| 选项 | 说明 |
|------|------|
| `--backend-only` / `-BackendOnly` | 仅启动后端 |
| `--frontend-only` / `-FrontendOnly` | 仅启动前端 |
| `--no-browser` / `-NoBrowser` | 不自动打开浏览器 |
| `-h, --help` / `-Help` | 显示帮助信息 |

**示例：**

```bash
# Linux/macOS: 启动但不打开浏览器
./scripts/start.sh --no-browser

# Linux/macOS: 仅启动后端
./scripts/start.sh --backend-only
```

```powershell
# Windows: 启动但不打开浏览器
.\scripts\start.ps1 -NoBrowser

# Windows: 仅启动后端
.\scripts\start.ps1 -BackendOnly
```

### 停止服务

要停止服务，请在运行服务的终端中按 `Ctrl+C`。

### 端口配置

启动脚本会从 `lifetrace/config/config.yaml` 读取端口配置：

```yaml
# 服务器配置
server:
  host: 127.0.0.1
  port: 8000  # 后端端口

# 前端配置
frontend:
  port: 3000  # 前端端口
```

如果 `config.yaml` 不存在，脚本将使用 `default_config.yaml`。

### 服务地址

启动后，服务将在以下地址可用（默认端口）：

- **前端界面**: http://localhost:3000
- **后端 API**: http://localhost:8000
- **API 文档**: http://localhost:8000/docs

> 注意：如果您在 `config.yaml` 中修改了端口，请使用配置的端口。

### 首次启动

首次启动时，后端可能需要几分钟来下载模型（embedding、rerank 等）。脚本会：

- 等待 30 秒后检查后端是否就绪
- 如果未就绪，继续等待（循环直到后端就绪）
- 后端就绪后自动启动前端

### 常见问题

#### 端口被占用

如果看到"端口已被占用"的警告，需要手动停止现有进程，或在 `config.yaml` 中修改端口。

#### 权限不足 (Linux/macOS)

添加脚本执行权限：

```bash
chmod +x scripts/*.sh
```

#### 找不到 Python/Node.js

确保 Python >= 3.13 和 Node.js >= 20 已安装并添加到系统 PATH。
